CREATE TABLE IF NOT EXISTS public.wefact_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  invoice_date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  customer_number text,
  customer_name text,
  reference text,
  category text,
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_gross numeric(14,2) NOT NULL DEFAULT 0,
  source_filename text,
  pdf_sha256 text,
  raw_text text,
  raw_payload jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wefact_invoices_invoice_date
  ON public.wefact_invoices (invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_wefact_invoices_status
  ON public.wefact_invoices (status);

CREATE INDEX IF NOT EXISTS idx_wefact_invoices_category
  ON public.wefact_invoices (category);

DROP TRIGGER IF EXISTS trg_wefact_invoices_updated_at ON public.wefact_invoices;
CREATE TRIGGER trg_wefact_invoices_updated_at
  BEFORE UPDATE ON public.wefact_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.wefact_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.wefact_invoices(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  line_no integer NOT NULL,
  quantity numeric(12,2),
  description text NOT NULL,
  unit_price numeric(14,2),
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  raw_line text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wefact_invoice_lines_unique UNIQUE (invoice_number, line_no)
);

CREATE INDEX IF NOT EXISTS idx_wefact_invoice_lines_invoice_id
  ON public.wefact_invoice_lines (invoice_id);

CREATE INDEX IF NOT EXISTS idx_wefact_invoice_lines_description
  ON public.wefact_invoice_lines USING gin (to_tsvector('simple', coalesce(description, '')));

DROP TRIGGER IF EXISTS trg_wefact_invoice_lines_updated_at ON public.wefact_invoice_lines;
CREATE TRIGGER trg_wefact_invoice_lines_updated_at
  BEFORE UPDATE ON public.wefact_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wefact_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wefact_invoice_lines TO authenticated;
GRANT ALL ON public.wefact_invoices TO service_role;
GRANT ALL ON public.wefact_invoice_lines TO service_role;

ALTER TABLE public.wefact_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wefact_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wefact_invoices_select_auth" ON public.wefact_invoices;
CREATE POLICY "wefact_invoices_select_auth"
  ON public.wefact_invoices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wefact_invoices_all_auth" ON public.wefact_invoices;
CREATE POLICY "wefact_invoices_all_auth"
  ON public.wefact_invoices FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "wefact_invoice_lines_select_auth" ON public.wefact_invoice_lines;
CREATE POLICY "wefact_invoice_lines_select_auth"
  ON public.wefact_invoice_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wefact_invoice_lines_all_auth" ON public.wefact_invoice_lines;
CREATE POLICY "wefact_invoice_lines_all_auth"
  ON public.wefact_invoice_lines FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES ('wefact_facturen', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;

CREATE OR REPLACE VIEW public.vw_wefact_invoices_monthly AS
SELECT
  to_char(date_trunc('month', invoice_date), 'YYYY-MM') AS period,
  count(*)::int AS invoice_count,
  count(*) FILTER (WHERE status = 'paid')::int AS paid_count,
  count(*) FILTER (WHERE status <> 'paid')::int AS open_count,
  coalesce(sum(amount_gross), 0)::numeric(14,2) AS gross_total,
  coalesce(sum(amount_net), 0)::numeric(14,2) AS net_total,
  coalesce(sum(vat_amount), 0)::numeric(14,2) AS vat_total,
  coalesce(sum(amount_net) FILTER (WHERE category = 'omzethuur'), 0)::numeric(14,2) AS omzethuur_net,
  coalesce(sum(amount_net) FILTER (WHERE category = 'facilitair'), 0)::numeric(14,2) AS facilitair_net,
  coalesce(sum(amount_net) FILTER (WHERE category = 'energie'), 0)::numeric(14,2) AS energie_net
FROM public.wefact_invoices
WHERE status <> 'canceled'
GROUP BY 1;

GRANT SELECT ON public.vw_wefact_invoices_monthly TO authenticated;
GRANT SELECT ON public.vw_wefact_invoices_monthly TO service_role;
ALTER VIEW public.vw_wefact_invoices_monthly SET (security_invoker = true);

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
),
wefact_invoice_actuals AS (
  SELECT
    to_char(date_trunc('month', invoice_date), 'YYYY-MM') AS period,
    'wefact_facturen'::public.tx_channel AS channel,
    count(*)::int AS tx_count,
    COALESCE(sum(amount_gross), 0) AS gross_total,
    COALESCE(sum(amount_net), 0) AS net_total,
    COALESCE(sum(vat_amount), 0) AS vat_total
  FROM public.wefact_invoices
  WHERE status <> 'canceled'
  GROUP BY 1, 2
)
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM shopify_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM other_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM mollie_invoice_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM wefact_invoice_actuals;

GRANT SELECT ON public.vw_monthly_revenue_actuals TO authenticated;
GRANT SELECT ON public.vw_monthly_revenue_actuals TO service_role;
ALTER VIEW public.vw_monthly_revenue_actuals SET (security_invoker = true);
COMMENT ON VIEW public.vw_monthly_revenue_actuals IS
  'Monthly actual revenue. Shopify includes every order summary with VAT invoice data, Bold/AFS uses paid parsed transactions, Mollie Facturen uses paid Mollie Sales Invoices, and WeFact Facturen uses all imported issued invoices including negative rent/fee corrections.';
