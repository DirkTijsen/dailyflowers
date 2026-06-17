CREATE TABLE IF NOT EXISTS public.shopify_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  location_name text,
  session_start timestamptz NOT NULL,
  session_end timestamptz,
  register_id text NOT NULL,
  status text,
  discrepancy numeric(14,2) NOT NULL DEFAULT 0,
  currency text,
  import_source text,
  import_batch_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_cash_sessions_unique UNIQUE (location_id, register_id, session_start)
);

CREATE INDEX IF NOT EXISTS idx_shopify_cash_sessions_start
  ON public.shopify_cash_sessions (session_start DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_cash_sessions_register_start
  ON public.shopify_cash_sessions (location_id, register_id, session_start DESC);

DROP TRIGGER IF EXISTS trg_shopify_cash_sessions_updated_at ON public.shopify_cash_sessions;
CREATE TRIGGER trg_shopify_cash_sessions_updated_at
  BEFORE UPDATE ON public.shopify_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_cash_sessions TO authenticated;
GRANT ALL ON public.shopify_cash_sessions TO service_role;

ALTER TABLE public.shopify_cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopify_cash_sessions_select_auth" ON public.shopify_cash_sessions;
CREATE POLICY "shopify_cash_sessions_select_auth"
  ON public.shopify_cash_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shopify_cash_sessions_all_auth" ON public.shopify_cash_sessions;
CREATE POLICY "shopify_cash_sessions_all_auth"
  ON public.shopify_cash_sessions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES ('shopify_cash', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;

DROP VIEW IF EXISTS public.vw_shopify_cash_monthly_reconciliation;
DROP VIEW IF EXISTS public.vw_shopify_cash_daily_reconciliation;
DROP VIEW IF EXISTS public.vw_shopify_cash_order_reconciliation;
DROP VIEW IF EXISTS public.vw_shopify_cash_exact_geldmaat;

CREATE OR REPLACE VIEW public.vw_shopify_cash_exact_geldmaat AS
SELECT
  gt.id AS gl_transaction_id,
  gt.transaction_date,
  to_char(date_trunc('month', gt.transaction_date), 'YYYY-MM') AS period,
  gt.account_code,
  gt.description,
  gt.relation_name,
  gt.document_number,
  gt.amount::numeric(14,2) AS exact_amount,
  gt.raw_payload,
  gt.raw_payload->>'exact_document_url' AS exact_document_url
FROM public.gl_transactions gt
WHERE gt.source = 'exact_invantive'
  AND gt.transaction_date >= DATE '2026-01-01'
  AND gt.amount > 0
  AND lower(
    coalesce(gt.description, '') || ' ' ||
    coalesce(gt.relation_name, '') || ' ' ||
    coalesce(gt.document_number, '') || ' ' ||
    coalesce(gt.raw_payload::text, '')
  ) LIKE '%geldmaat%';

CREATE OR REPLACE VIEW public.vw_shopify_cash_order_reconciliation AS
WITH provider_by_order AS (
  SELECT
    coalesce(bt.source_order_id, os.external_id) AS external_id,
    count(*) FILTER (WHERE bt.type IN ('charge', 'refund', 'dispute'))::int AS shopify_payment_tx_count,
    coalesce(sum(bt.amount) FILTER (WHERE bt.type IN ('charge', 'refund', 'dispute')), 0)::numeric(14,2) AS shopify_payment_amount
  FROM public.shopify_payment_balance_transactions bt
  LEFT JOIN public.shopify_order_summaries os
    ON bt.source_order_id IS NULL
   AND bt.order_name IS NOT NULL
   AND os.order_name = bt.order_name
  WHERE coalesce(bt.source_order_id, os.external_id) IS NOT NULL
  GROUP BY 1
),
pos_orders AS (
  SELECT
    os.id AS order_summary_id,
    os.external_id,
    os.order_name,
    os.order_number,
    os.financial_status,
    os.processed_at,
    (os.processed_at AT TIME ZONE 'Europe/Amsterdam')::date AS business_date,
    to_char(date_trunc('month', os.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    coalesce(os.current_total_price, os.net_payment, os.line_discounted_total, os.total_price, 0)::numeric(14,2) AS order_amount,
    coalesce(p.shopify_payment_tx_count, 0)::int AS shopify_payment_tx_count,
    coalesce(p.shopify_payment_amount, 0)::numeric(14,2) AS shopify_payment_amount,
    (
      coalesce(os.current_total_price, os.net_payment, os.line_discounted_total, os.total_price, 0)
      - coalesce(p.shopify_payment_amount, 0)
    )::numeric(14,2) AS cash_amount
  FROM public.shopify_order_summaries os
  LEFT JOIN provider_by_order p ON p.external_id = os.external_id
  WHERE os.channel = 'shopify_winkel'
    AND os.processed_at >= TIMESTAMPTZ '2026-01-01 00:00:00+00'
    AND coalesce(os.financial_status, '') IN ('paid', 'partially_paid')
),
matched AS (
  SELECT
    po.*,
    s.id AS cash_session_id,
    s.location_id,
    s.location_name,
    s.register_id,
    s.session_start,
    s.session_end,
    s.status AS session_status,
    row_number() OVER (
      PARTITION BY po.order_summary_id
      ORDER BY s.session_start DESC NULLS LAST
    ) AS rn
  FROM pos_orders po
  LEFT JOIN public.shopify_cash_sessions s
    ON po.processed_at >= s.session_start
   AND (s.session_end IS NULL OR po.processed_at <= s.session_end)
)
SELECT
  order_summary_id,
  external_id,
  order_name,
  order_number,
  financial_status,
  processed_at,
  business_date,
  period,
  order_amount,
  shopify_payment_tx_count,
  shopify_payment_amount,
  cash_amount,
  CASE
    WHEN abs(cash_amount) < 0.01 THEN 'fully_shopify_payments'
    WHEN cash_session_id IS NULL THEN 'cash_session_missing'
    ELSE 'cash_or_external'
  END AS cash_match_status,
  cash_session_id,
  location_id,
  location_name,
  register_id,
  session_start,
  session_end,
  session_status
FROM matched
WHERE rn = 1;

CREATE OR REPLACE VIEW public.vw_shopify_cash_daily_reconciliation AS
WITH order_daily AS (
  SELECT
    business_date,
    to_char(date_trunc('month', business_date), 'YYYY-MM') AS period,
    count(*) FILTER (WHERE abs(cash_amount) >= 0.01)::int AS cash_order_count,
    coalesce(sum(cash_amount) FILTER (WHERE abs(cash_amount) >= 0.01), 0)::numeric(14,2) AS cash_sales_amount,
    coalesce(sum(order_amount), 0)::numeric(14,2) AS pos_order_amount,
    coalesce(sum(shopify_payment_amount), 0)::numeric(14,2) AS shopify_payment_amount,
    count(*) FILTER (WHERE abs(cash_amount) >= 0.01 AND cash_session_id IS NULL)::int AS cash_orders_without_session
  FROM public.vw_shopify_cash_order_reconciliation
  GROUP BY 1
),
session_daily AS (
  SELECT
    (session_start AT TIME ZONE 'Europe/Amsterdam')::date AS business_date,
    count(*)::int AS session_count,
    count(*) FILTER (WHERE lower(coalesce(status, '')) = 'open')::int AS open_session_count,
    coalesce(sum(discrepancy), 0)::numeric(14,2) AS discrepancy_amount
  FROM public.shopify_cash_sessions
  WHERE session_start >= TIMESTAMPTZ '2026-01-01 00:00:00+00'
  GROUP BY 1
),
exact_daily AS (
  SELECT
    transaction_date AS business_date,
    count(*)::int AS exact_geldmaat_count,
    coalesce(sum(exact_amount), 0)::numeric(14,2) AS exact_geldmaat_amount
  FROM public.vw_shopify_cash_exact_geldmaat
  GROUP BY 1
),
dates AS (
  SELECT business_date FROM order_daily
  UNION
  SELECT business_date FROM session_daily
  UNION
  SELECT business_date FROM exact_daily
)
SELECT
  d.business_date,
  to_char(date_trunc('month', d.business_date), 'YYYY-MM') AS period,
  coalesce(od.cash_order_count, 0)::int AS cash_order_count,
  coalesce(od.cash_sales_amount, 0)::numeric(14,2) AS cash_sales_amount,
  coalesce(od.pos_order_amount, 0)::numeric(14,2) AS pos_order_amount,
  coalesce(od.shopify_payment_amount, 0)::numeric(14,2) AS shopify_payment_amount,
  coalesce(od.cash_orders_without_session, 0)::int AS cash_orders_without_session,
  coalesce(sd.session_count, 0)::int AS session_count,
  coalesce(sd.open_session_count, 0)::int AS open_session_count,
  coalesce(sd.discrepancy_amount, 0)::numeric(14,2) AS discrepancy_amount,
  coalesce(ed.exact_geldmaat_count, 0)::int AS exact_geldmaat_count,
  coalesce(ed.exact_geldmaat_amount, 0)::numeric(14,2) AS exact_geldmaat_amount,
  (coalesce(od.cash_sales_amount, 0) - coalesce(ed.exact_geldmaat_amount, 0))::numeric(14,2) AS cash_minus_exact,
  (coalesce(od.cash_sales_amount, 0) + coalesce(sd.discrepancy_amount, 0) - coalesce(ed.exact_geldmaat_amount, 0))::numeric(14,2) AS cash_after_discrepancy_minus_exact
FROM dates d
LEFT JOIN order_daily od ON od.business_date = d.business_date
LEFT JOIN session_daily sd ON sd.business_date = d.business_date
LEFT JOIN exact_daily ed ON ed.business_date = d.business_date;

CREATE OR REPLACE VIEW public.vw_shopify_cash_monthly_reconciliation AS
SELECT
  period,
  sum(cash_order_count)::int AS cash_order_count,
  sum(cash_sales_amount)::numeric(14,2) AS cash_sales_amount,
  sum(pos_order_amount)::numeric(14,2) AS pos_order_amount,
  sum(shopify_payment_amount)::numeric(14,2) AS shopify_payment_amount,
  sum(cash_orders_without_session)::int AS cash_orders_without_session,
  sum(session_count)::int AS session_count,
  sum(open_session_count)::int AS open_session_count,
  sum(discrepancy_amount)::numeric(14,2) AS discrepancy_amount,
  sum(exact_geldmaat_count)::int AS exact_geldmaat_count,
  sum(exact_geldmaat_amount)::numeric(14,2) AS exact_geldmaat_amount,
  sum(cash_sales_amount - exact_geldmaat_amount)::numeric(14,2) AS cash_minus_exact,
  sum(cash_after_discrepancy_minus_exact)::numeric(14,2) AS cash_after_discrepancy_minus_exact
FROM public.vw_shopify_cash_daily_reconciliation
GROUP BY period;

GRANT SELECT ON public.vw_shopify_cash_exact_geldmaat TO authenticated;
GRANT SELECT ON public.vw_shopify_cash_exact_geldmaat TO service_role;
GRANT SELECT ON public.vw_shopify_cash_order_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_cash_order_reconciliation TO service_role;
GRANT SELECT ON public.vw_shopify_cash_daily_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_cash_daily_reconciliation TO service_role;
GRANT SELECT ON public.vw_shopify_cash_monthly_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_cash_monthly_reconciliation TO service_role;

ALTER VIEW public.vw_shopify_cash_exact_geldmaat SET (security_invoker = true);
ALTER VIEW public.vw_shopify_cash_order_reconciliation SET (security_invoker = true);
ALTER VIEW public.vw_shopify_cash_daily_reconciliation SET (security_invoker = true);
ALTER VIEW public.vw_shopify_cash_monthly_reconciliation SET (security_invoker = true);
