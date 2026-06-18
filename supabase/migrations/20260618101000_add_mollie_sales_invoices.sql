CREATE TABLE IF NOT EXISTS public.mollie_sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id text NOT NULL UNIQUE,
  reference text,
  status text NOT NULL DEFAULT 'unknown',
  issued_at timestamptz,
  paid_at timestamptz,
  due_at date,
  profile_id text,
  customer_id text,
  recipient_name text,
  recipient_email text,
  currency text,
  amount_gross numeric(14,2) NOT NULL DEFAULT 0,
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  invoice_url text,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mollie_sales_invoices_paid_at
  ON public.mollie_sales_invoices (paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_mollie_sales_invoices_status
  ON public.mollie_sales_invoices (status);

CREATE INDEX IF NOT EXISTS idx_mollie_sales_invoices_reference
  ON public.mollie_sales_invoices (reference)
  WHERE reference IS NOT NULL;

DROP TRIGGER IF EXISTS trg_mollie_sales_invoices_updated_at ON public.mollie_sales_invoices;
CREATE TRIGGER trg_mollie_sales_invoices_updated_at
  BEFORE UPDATE ON public.mollie_sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mollie_sales_invoices TO authenticated;
GRANT ALL ON public.mollie_sales_invoices TO service_role;

ALTER TABLE public.mollie_sales_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mollie_sales_invoices_select_auth" ON public.mollie_sales_invoices;
CREATE POLICY "mollie_sales_invoices_select_auth"
  ON public.mollie_sales_invoices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mollie_sales_invoices_all_auth" ON public.mollie_sales_invoices;
CREATE POLICY "mollie_sales_invoices_all_auth"
  ON public.mollie_sales_invoices FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES ('mollie_facturen', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;

CREATE OR REPLACE VIEW public.vw_mollie_sales_invoices_monthly AS
WITH base AS (
  SELECT
    to_char(
      date_trunc('month', coalesce(paid_at, issued_at, created_at) AT TIME ZONE 'Europe/Amsterdam'),
      'YYYY-MM'
    ) AS period,
    status,
    amount_gross,
    amount_net,
    vat_amount
  FROM public.mollie_sales_invoices
  WHERE coalesce(paid_at, issued_at, created_at) IS NOT NULL
)
SELECT
  period,
  count(*)::int AS invoice_count,
  count(*) FILTER (WHERE status = 'paid')::int AS paid_count,
  count(*) FILTER (WHERE status <> 'paid')::int AS open_count,
  coalesce(sum(amount_gross) FILTER (WHERE status = 'paid'), 0)::numeric(14,2) AS gross_total,
  coalesce(sum(amount_net) FILTER (WHERE status = 'paid'), 0)::numeric(14,2) AS net_total,
  coalesce(sum(vat_amount) FILTER (WHERE status = 'paid'), 0)::numeric(14,2) AS vat_total
FROM base
GROUP BY period;

GRANT SELECT ON public.vw_mollie_sales_invoices_monthly TO authenticated;
GRANT SELECT ON public.vw_mollie_sales_invoices_monthly TO service_role;
ALTER VIEW public.vw_mollie_sales_invoices_monthly SET (security_invoker = true);

CREATE OR REPLACE VIEW public.vw_monthly_revenue_actuals AS
WITH shopify_base AS (
  SELECT
    to_char(date_trunc('month', processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    COALESCE(current_total_price, total_price, 0) AS invoice_gross,
    COALESCE(current_total_tax, total_tax, line_tax_total, 0) AS invoice_vat
  FROM public.shopify_order_summaries
  WHERE processed_at IS NOT NULL
    AND channel IN ('shopify_webshop', 'shopify_winkel')
    AND (
      raw_payload ? 'tax_rates'
      OR total_tax IS NOT NULL
      OR current_total_tax IS NOT NULL
    )
),
shopify_actuals AS (
  SELECT
    period,
    channel,
    count(*)::int AS tx_count,
    COALESCE(sum(invoice_gross), 0) AS gross_total,
    COALESCE(sum(invoice_gross - invoice_vat), 0) AS net_total,
    COALESCE(sum(invoice_vat), 0) AS vat_total
  FROM shopify_base
  GROUP BY period, channel
),
other_actuals AS (
  SELECT
    to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    count(*)::int AS tx_count,
    COALESCE(sum(amount_gross), 0) AS gross_total,
    COALESCE(sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)), 0) AS net_total,
    COALESCE(sum(vat_amount), 0) AS vat_total
  FROM public.transactions
  WHERE status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
    AND channel NOT IN ('shopify_webshop', 'shopify_winkel')
  GROUP BY 1, 2
),
mollie_invoice_actuals AS (
  SELECT
    to_char(date_trunc('month', coalesce(paid_at, issued_at) AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    'mollie_facturen'::public.tx_channel AS channel,
    count(*)::int AS tx_count,
    COALESCE(sum(amount_gross), 0) AS gross_total,
    COALESCE(sum(amount_net), 0) AS net_total,
    COALESCE(sum(vat_amount), 0) AS vat_total
  FROM public.mollie_sales_invoices
  WHERE status = 'paid'
    AND coalesce(paid_at, issued_at) IS NOT NULL
  GROUP BY 1, 2
)
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM shopify_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM other_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM mollie_invoice_actuals;

GRANT SELECT ON public.vw_monthly_revenue_actuals TO authenticated;
GRANT SELECT ON public.vw_monthly_revenue_actuals TO service_role;
ALTER VIEW public.vw_monthly_revenue_actuals SET (security_invoker = true);
COMMENT ON VIEW public.vw_monthly_revenue_actuals IS
  'Monthly actual revenue. Shopify includes every order summary with VAT invoice data, Bold/AFS uses paid parsed transactions, and Mollie Facturen uses paid Mollie Sales Invoices.';
