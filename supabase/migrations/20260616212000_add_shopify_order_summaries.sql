CREATE TABLE IF NOT EXISTS public.shopify_order_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  order_name text,
  order_number text,
  source_name text,
  channel public.tx_channel NOT NULL,
  financial_status text,
  processed_at timestamptz,
  created_at_shopify timestamptz,
  updated_at_shopify timestamptz,
  taxes_included boolean,
  line_original_total numeric(12,2) NOT NULL DEFAULT 0,
  line_discounted_total numeric(12,2) NOT NULL DEFAULT 0,
  line_discount_total numeric(12,2) NOT NULL DEFAULT 0,
  line_tax_total numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_price numeric(12,2),
  current_subtotal_price numeric(12,2),
  total_discounts numeric(12,2),
  current_total_discounts numeric(12,2),
  total_shipping numeric(12,2),
  total_tax numeric(12,2),
  current_total_tax numeric(12,2),
  total_price numeric(12,2),
  current_total_price numeric(12,2),
  total_refunded numeric(12,2),
  net_payment numeric(12,2),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_order_summaries_processed_at
  ON public.shopify_order_summaries (processed_at);

CREATE INDEX IF NOT EXISTS idx_shopify_order_summaries_channel_period
  ON public.shopify_order_summaries (channel, processed_at);

DROP TRIGGER IF EXISTS trg_shopify_order_summaries_updated_at ON public.shopify_order_summaries;
CREATE TRIGGER trg_shopify_order_summaries_updated_at
BEFORE UPDATE ON public.shopify_order_summaries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_order_summaries TO authenticated;
GRANT ALL ON public.shopify_order_summaries TO service_role;
ALTER TABLE public.shopify_order_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shopify_order_summaries_select_auth" ON public.shopify_order_summaries;
DROP POLICY IF EXISTS "shopify_order_summaries_all_auth" ON public.shopify_order_summaries;
CREATE POLICY "shopify_order_summaries_select_auth"
  ON public.shopify_order_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "shopify_order_summaries_all_auth"
  ON public.shopify_order_summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.vw_monthly_channel AS
SELECT
  to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
  channel,
  count(*)::int AS tx_count,
  COALESCE(sum(amount_gross), 0) AS gross_total,
  COALESCE(sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)), 0) AS net_total,
  COALESCE(sum(vat_amount), 0) AS vat_total
FROM public.transactions
WHERE status = 'paid' AND parse_status = 'ok' AND paid_at IS NOT NULL
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.vw_monthly_machine AS
SELECT
  to_char(date_trunc('month', t.paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
  t.channel,
  t.machine_id,
  m.display_name,
  m.afs_number,
  count(*)::int AS tx_count,
  COALESCE(sum(t.amount_gross), 0) AS gross_total,
  COALESCE(sum(COALESCE(t.amount_net, t.amount_gross - COALESCE(t.vat_amount, 0), 0)), 0) AS net_total,
  COALESCE(sum(t.vat_amount), 0) AS vat_total
FROM public.transactions t
LEFT JOIN public.machines m ON m.id = t.machine_id
WHERE t.status = 'paid' AND t.parse_status = 'ok' AND t.paid_at IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.vw_monthly_vat AS
SELECT
  to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
  channel,
  vat_rate,
  count(*)::int AS tx_count,
  COALESCE(sum(amount_gross), 0) AS gross_total,
  COALESCE(sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)), 0) AS net_total,
  COALESCE(sum(vat_amount), 0) AS vat_total
FROM public.transactions
WHERE status = 'paid' AND parse_status = 'ok' AND paid_at IS NOT NULL AND vat_rate IS NOT NULL
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.vw_shopify_analytics_monthly AS
WITH base AS (
  SELECT
    to_char(date_trunc('month', s.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    COALESCE(s.financial_status, 'other') AS status_key,
    s.*
  FROM public.shopify_order_summaries s
  WHERE s.processed_at IS NOT NULL
),
monthly AS (
  SELECT
    period,
    count(*)::int AS order_count,
    count(*) FILTER (WHERE status_key = 'paid')::int AS paid_order_count,
    count(*) FILTER (WHERE status_key <> 'paid')::int AS non_paid_order_count,
    COALESCE(sum(line_discounted_total) FILTER (WHERE status_key = 'paid'), 0) AS paid_line_gross,
    COALESCE(sum(line_tax_total) FILTER (WHERE status_key = 'paid'), 0) AS paid_line_tax,
    COALESCE(sum(line_discounted_total - line_tax_total) FILTER (WHERE status_key = 'paid'), 0) AS paid_line_net,
    COALESCE(sum(current_total_price) FILTER (WHERE status_key = 'paid'), 0) AS paid_current_total,
    COALESCE(sum(current_total_price) FILTER (WHERE status_key <> 'paid'), 0) AS non_paid_current_total,
    COALESCE(sum(current_total_price), 0) AS api_current_total,
    COALESCE(sum(total_shipping), 0) AS shipping_total,
    COALESCE(sum(total_refunded), 0) AS refunded_total,
    COALESCE(sum(total_discounts), 0) AS discount_total,
    COALESCE(sum(current_total_tax), 0) AS current_tax_total,
    COALESCE(sum(total_tax), 0) AS tax_total,
    COALESCE(sum(line_original_total), 0) AS line_original_total,
    COALESCE(sum(line_discounted_total), 0) AS line_discounted_total,
    COALESCE(sum(line_discount_total), 0) AS line_discount_total,
    COALESCE(sum(line_tax_total), 0) AS line_tax_total
  FROM base
  GROUP BY period
),
status_lines AS (
  SELECT
    period,
    status_key AS financial_status,
    count(*)::int AS orders,
    COALESCE(sum(current_total_price), 0) AS current_total,
    COALESCE(sum(line_discounted_total), 0) AS line_total
  FROM base
  GROUP BY period, status_key
),
statuses AS (
  SELECT
    period,
    jsonb_object_agg(
      financial_status,
      jsonb_build_object('orders', orders, 'current_total', current_total, 'line_total', line_total)
      ORDER BY financial_status
    ) AS status_summary
  FROM status_lines
  GROUP BY period
)
SELECT
  monthly.*,
  COALESCE(statuses.status_summary, '{}'::jsonb) AS status_summary
FROM monthly
LEFT JOIN statuses USING (period);

GRANT SELECT ON public.vw_monthly_channel TO authenticated;
GRANT SELECT ON public.vw_monthly_machine TO authenticated;
GRANT SELECT ON public.vw_monthly_vat TO authenticated;
GRANT SELECT ON public.vw_shopify_analytics_monthly TO authenticated;
ALTER VIEW public.vw_monthly_channel SET (security_invoker = true);
ALTER VIEW public.vw_monthly_machine SET (security_invoker = true);
ALTER VIEW public.vw_monthly_vat SET (security_invoker = true);
ALTER VIEW public.vw_shopify_analytics_monthly SET (security_invoker = true);
