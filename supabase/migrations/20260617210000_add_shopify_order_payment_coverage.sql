CREATE TABLE IF NOT EXISTS public.shopify_order_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.shopify_connections(id) ON DELETE SET NULL,
  shop_domain text NOT NULL,
  order_id text NOT NULL,
  order_name text,
  shopify_transaction_id text NOT NULL,
  kind text,
  status text,
  gateway text,
  formatted_gateway text,
  processed_at timestamptz,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text,
  payment_id text,
  raw_payload jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_order_transactions_unique UNIQUE (shop_domain, shopify_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_order_transactions_order
  ON public.shopify_order_transactions (order_id);

CREATE INDEX IF NOT EXISTS idx_shopify_order_transactions_processed
  ON public.shopify_order_transactions (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_order_transactions_gateway
  ON public.shopify_order_transactions (gateway);

DROP TRIGGER IF EXISTS trg_shopify_order_transactions_updated_at
  ON public.shopify_order_transactions;
CREATE TRIGGER trg_shopify_order_transactions_updated_at
  BEFORE UPDATE ON public.shopify_order_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_order_transactions TO authenticated;
GRANT ALL ON public.shopify_order_transactions TO service_role;

ALTER TABLE public.shopify_order_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopify_order_transactions_select_auth"
  ON public.shopify_order_transactions;
CREATE POLICY "shopify_order_transactions_select_auth"
  ON public.shopify_order_transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shopify_order_transactions_all_auth"
  ON public.shopify_order_transactions;
CREATE POLICY "shopify_order_transactions_all_auth"
  ON public.shopify_order_transactions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP VIEW IF EXISTS public.vw_shopify_order_payment_issues;
DROP VIEW IF EXISTS public.vw_shopify_open_by_customer;
DROP VIEW IF EXISTS public.vw_shopify_open_customer_orders;
DROP VIEW IF EXISTS public.vw_shopify_order_payment_coverage_monthly;
DROP VIEW IF EXISTS public.vw_shopify_order_payment_coverage;

CREATE OR REPLACE VIEW public.vw_shopify_order_payment_coverage AS
WITH order_base AS (
  SELECT
    os.id AS order_summary_id,
    os.external_id,
    os.order_name,
    os.order_number,
    os.channel,
    os.source_name,
    os.financial_status,
    os.processed_at,
    to_char(date_trunc('month', os.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    coalesce(os.current_total_price, os.net_payment, os.line_discounted_total, os.total_price, 0)::numeric(14,2) AS order_amount
  FROM public.shopify_order_summaries os
  WHERE os.channel IN ('shopify_webshop', 'shopify_winkel')
    AND os.processed_at IS NOT NULL
),
direct_order_ids AS (
  SELECT DISTINCT ot.order_id
  FROM public.shopify_order_transactions ot
  WHERE lower(coalesce(ot.status, '')) = 'success'
    AND upper(coalesce(ot.kind, '')) IN ('SALE', 'CAPTURE', 'REFUND')
),
direct_payments AS (
  SELECT
    ot.order_id,
    count(*) FILTER (WHERE lower(coalesce(ot.status, '')) = 'success')::int AS transaction_count,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ot.status, '')) <> 'success' THEN 0
          WHEN upper(coalesce(ot.kind, '')) IN ('SALE', 'CAPTURE') THEN ot.amount
          WHEN upper(coalesce(ot.kind, '')) = 'REFUND' THEN -abs(ot.amount)
          ELSE 0
        END
      ),
      0
    )::numeric(14,2) AS paid_amount,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ot.status, '')) <> 'success' THEN 0
          WHEN lower(coalesce(ot.gateway, '')) = 'shopify_payments'
           AND upper(coalesce(ot.kind, '')) IN ('SALE', 'CAPTURE') THEN ot.amount
          WHEN lower(coalesce(ot.gateway, '')) = 'shopify_payments'
           AND upper(coalesce(ot.kind, '')) = 'REFUND' THEN -abs(ot.amount)
          ELSE 0
        END
      ),
      0
    )::numeric(14,2) AS shopify_payments_amount,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ot.status, '')) <> 'success' THEN 0
          WHEN lower(coalesce(ot.gateway, '')) = 'cash'
           AND upper(coalesce(ot.kind, '')) IN ('SALE', 'CAPTURE') THEN ot.amount
          WHEN lower(coalesce(ot.gateway, '')) = 'cash'
           AND upper(coalesce(ot.kind, '')) = 'REFUND' THEN -abs(ot.amount)
          ELSE 0
        END
      ),
      0
    )::numeric(14,2) AS cash_amount,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ot.status, '')) <> 'success' THEN 0
          WHEN lower(coalesce(ot.gateway, '')) NOT IN ('shopify_payments', 'cash')
           AND upper(coalesce(ot.kind, '')) IN ('SALE', 'CAPTURE') THEN ot.amount
          WHEN lower(coalesce(ot.gateway, '')) NOT IN ('shopify_payments', 'cash')
           AND upper(coalesce(ot.kind, '')) = 'REFUND' THEN -abs(ot.amount)
          ELSE 0
        END
      ),
      0
    )::numeric(14,2) AS other_payment_amount,
    string_agg(
      DISTINCT coalesce(nullif(ot.formatted_gateway, ''), nullif(ot.gateway, ''), '-'),
      ', '
      ORDER BY coalesce(nullif(ot.formatted_gateway, ''), nullif(ot.gateway, ''), '-')
    ) FILTER (WHERE lower(coalesce(ot.status, '')) = 'success') AS payment_gateways,
    max(ot.processed_at) FILTER (WHERE lower(coalesce(ot.status, '')) = 'success') AS last_payment_at
  FROM public.shopify_order_transactions ot
  GROUP BY ot.order_id
),
fallback_provider_payments AS (
  SELECT
    coalesce(bt.source_order_id, os.external_id) AS order_id,
    count(*)::int AS transaction_count,
    coalesce(sum(bt.amount), 0)::numeric(14,2) AS paid_amount,
    coalesce(sum(bt.amount), 0)::numeric(14,2) AS shopify_payments_amount,
    0::numeric(14,2) AS cash_amount,
    0::numeric(14,2) AS other_payment_amount,
    string_agg(
      DISTINCT coalesce(nullif(bt.payment_method_name, ''), 'Shopify Payments'),
      ', '
      ORDER BY coalesce(nullif(bt.payment_method_name, ''), 'Shopify Payments')
    ) AS payment_gateways,
    max(bt.processed_at) AS last_payment_at
  FROM public.shopify_payment_balance_transactions bt
  LEFT JOIN public.shopify_order_summaries os
    ON bt.source_order_id IS NULL
   AND bt.order_name IS NOT NULL
   AND os.order_name = bt.order_name
  WHERE coalesce(bt.source_order_id, os.external_id) IS NOT NULL
    AND lower(coalesce(bt.type, '')) IN ('charge', 'refund', 'dispute')
    AND NOT EXISTS (
      SELECT 1
      FROM direct_order_ids d
      WHERE d.order_id = coalesce(bt.source_order_id, os.external_id)
    )
  GROUP BY coalesce(bt.source_order_id, os.external_id)
),
fallback_cash_payments AS (
  SELECT
    coalesce(ct.order_id, os.external_id) AS order_id,
    count(*) FILTER (WHERE lower(coalesce(ct.status, '')) = 'success')::int AS transaction_count,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ct.status, '')) <> 'success' THEN 0
          WHEN lower(coalesce(ct.kind, '')) = 'refund' THEN -abs(ct.amount)
          ELSE ct.amount
        END
      ),
      0
    )::numeric(14,2) AS paid_amount,
    0::numeric(14,2) AS shopify_payments_amount,
    coalesce(
      sum(
        CASE
          WHEN lower(coalesce(ct.status, '')) <> 'success' THEN 0
          WHEN lower(coalesce(ct.kind, '')) = 'refund' THEN -abs(ct.amount)
          ELSE ct.amount
        END
      ),
      0
    )::numeric(14,2) AS cash_amount,
    0::numeric(14,2) AS other_payment_amount,
    'Contant'::text AS payment_gateways,
    max(ct.processed_at) FILTER (WHERE lower(coalesce(ct.status, '')) = 'success') AS last_payment_at
  FROM public.shopify_cash_session_transactions ct
  LEFT JOIN public.shopify_order_summaries os
    ON ct.order_id IS NULL
   AND ct.order_name IS NOT NULL
   AND os.order_name = ct.order_name
  WHERE coalesce(ct.order_id, os.external_id) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM direct_order_ids d
      WHERE d.order_id = coalesce(ct.order_id, os.external_id)
    )
  GROUP BY coalesce(ct.order_id, os.external_id)
),
fallback_pos_inferred_cash AS (
  SELECT
    ob.external_id AS order_id,
    1::int AS transaction_count,
    (
      ob.order_amount
      - coalesce(fp.paid_amount, 0)
      - coalesce(fc.paid_amount, 0)
    )::numeric(14,2) AS paid_amount,
    0::numeric(14,2) AS shopify_payments_amount,
    (
      ob.order_amount
      - coalesce(fp.paid_amount, 0)
      - coalesce(fc.paid_amount, 0)
    )::numeric(14,2) AS cash_amount,
    0::numeric(14,2) AS other_payment_amount,
    'Contant (afgeleid uit betaalde POS-order)'::text AS payment_gateways,
    ob.processed_at AS last_payment_at
  FROM order_base ob
  LEFT JOIN fallback_provider_payments fp ON fp.order_id = ob.external_id
  LEFT JOIN fallback_cash_payments fc ON fc.order_id = ob.external_id
  WHERE ob.channel = 'shopify_winkel'
    AND lower(coalesce(ob.financial_status, '')) IN ('paid', 'partially_paid', 'partially_refunded', 'refunded')
    AND NOT EXISTS (
      SELECT 1
      FROM direct_order_ids d
      WHERE d.order_id = ob.external_id
    )
    AND abs(ob.order_amount - coalesce(fp.paid_amount, 0) - coalesce(fc.paid_amount, 0)) >= 0.01
),
fallback_status_paid AS (
  SELECT
    ob.external_id AS order_id,
    1::int AS transaction_count,
    (
      ob.order_amount
      - coalesce(fp.paid_amount, 0)
      - coalesce(fc.paid_amount, 0)
      - coalesce(fi.paid_amount, 0)
    )::numeric(14,2) AS paid_amount,
    0::numeric(14,2) AS shopify_payments_amount,
    0::numeric(14,2) AS cash_amount,
    (
      ob.order_amount
      - coalesce(fp.paid_amount, 0)
      - coalesce(fc.paid_amount, 0)
      - coalesce(fi.paid_amount, 0)
    )::numeric(14,2) AS other_payment_amount,
    'Betaald volgens Shopify-status (geen transactiedetail)'::text AS payment_gateways,
    ob.processed_at AS last_payment_at
  FROM order_base ob
  LEFT JOIN fallback_provider_payments fp ON fp.order_id = ob.external_id
  LEFT JOIN fallback_cash_payments fc ON fc.order_id = ob.external_id
  LEFT JOIN fallback_pos_inferred_cash fi ON fi.order_id = ob.external_id
  WHERE lower(coalesce(ob.financial_status, '')) IN ('paid', 'partially_refunded', 'refunded')
    AND NOT EXISTS (
      SELECT 1
      FROM direct_order_ids d
      WHERE d.order_id = ob.external_id
    )
    AND (
      ob.order_amount
      - coalesce(fp.paid_amount, 0)
      - coalesce(fc.paid_amount, 0)
      - coalesce(fi.paid_amount, 0)
    ) > 0.01
),
fallback_payments AS (
  SELECT
    source.order_id,
    sum(source.transaction_count)::int AS transaction_count,
    coalesce(sum(source.paid_amount), 0)::numeric(14,2) AS paid_amount,
    coalesce(sum(source.shopify_payments_amount), 0)::numeric(14,2) AS shopify_payments_amount,
    coalesce(sum(source.cash_amount), 0)::numeric(14,2) AS cash_amount,
    coalesce(sum(source.other_payment_amount), 0)::numeric(14,2) AS other_payment_amount,
    string_agg(DISTINCT source.payment_gateways, ', ' ORDER BY source.payment_gateways) AS payment_gateways,
    max(source.last_payment_at) AS last_payment_at
  FROM (
    SELECT * FROM fallback_provider_payments
    UNION ALL
    SELECT * FROM fallback_cash_payments
    UNION ALL
    SELECT * FROM fallback_pos_inferred_cash
    UNION ALL
    SELECT * FROM fallback_status_paid
  ) source
  GROUP BY source.order_id
),
order_payments AS (
  SELECT * FROM direct_payments
  UNION ALL
  SELECT * FROM fallback_payments
)
SELECT
  ob.order_summary_id,
  ob.external_id,
  ob.order_name,
  ob.order_number,
  ob.channel,
  ob.source_name,
  ob.financial_status,
  ob.processed_at,
  ob.period,
  ob.order_amount,
  coalesce(op.paid_amount, 0)::numeric(14,2) AS paid_amount,
  coalesce(op.shopify_payments_amount, 0)::numeric(14,2) AS shopify_payments_amount,
  coalesce(op.cash_amount, 0)::numeric(14,2) AS cash_amount,
  coalesce(op.other_payment_amount, 0)::numeric(14,2) AS other_payment_amount,
  (
    ob.order_amount
    - coalesce(op.paid_amount, 0)
  )::numeric(14,2) AS payment_difference,
  coalesce(op.transaction_count, 0)::int AS transaction_count,
  op.payment_gateways,
  op.last_payment_at,
  CASE
    WHEN abs(
      ob.order_amount
      - coalesce(op.paid_amount, 0)
    ) < 0.01
      AND lower(coalesce(ob.financial_status, '')) IN ('paid', 'partially_refunded', 'refunded')
      THEN 'paid'
    WHEN coalesce(op.transaction_count, 0) = 0 THEN 'no_transactions'
    WHEN abs(
      ob.order_amount
      - coalesce(op.paid_amount, 0)
    ) < 0.01
      THEN 'amount_covered_status_open'
    WHEN coalesce(op.paid_amount, 0) = 0 THEN 'unpaid'
    WHEN coalesce(op.paid_amount, 0) <
      ob.order_amount
      THEN 'underpaid'
    ELSE 'overpaid'
  END AS payment_coverage_status
FROM order_base ob
LEFT JOIN order_payments op ON op.order_id = ob.external_id;

CREATE OR REPLACE VIEW public.vw_shopify_order_payment_coverage_monthly AS
SELECT
  period,
  channel,
  count(*)::int AS order_count,
  count(*) FILTER (WHERE payment_coverage_status = 'paid')::int AS paid_order_count,
  count(*) FILTER (WHERE payment_coverage_status <> 'paid')::int AS open_order_count,
  sum(order_amount)::numeric(14,2) AS order_amount,
  sum(paid_amount)::numeric(14,2) AS paid_amount,
  sum(shopify_payments_amount)::numeric(14,2) AS shopify_payments_amount,
  sum(cash_amount)::numeric(14,2) AS cash_amount,
  sum(other_payment_amount)::numeric(14,2) AS other_payment_amount,
  sum(payment_difference)::numeric(14,2) AS payment_difference,
  count(*) FILTER (WHERE payment_coverage_status = 'no_transactions')::int AS no_transaction_count,
  count(*) FILTER (WHERE payment_coverage_status = 'underpaid')::int AS underpaid_count,
  count(*) FILTER (WHERE payment_coverage_status = 'overpaid')::int AS overpaid_count,
  count(*) FILTER (WHERE payment_coverage_status = 'amount_covered_status_open')::int AS amount_covered_status_open_count
FROM public.vw_shopify_order_payment_coverage
GROUP BY period, channel;

CREATE OR REPLACE VIEW public.vw_shopify_order_payment_issues AS
SELECT
  payment_coverage_status AS issue_type,
  period,
  processed_at AS occurred_at,
  order_amount,
  paid_amount,
  payment_difference,
  order_name,
  order_number,
  channel,
  financial_status,
  payment_gateways,
  transaction_count,
  last_payment_at
FROM public.vw_shopify_order_payment_coverage
WHERE payment_coverage_status <> 'paid';

GRANT SELECT ON public.vw_shopify_order_payment_coverage TO authenticated;
GRANT SELECT ON public.vw_shopify_order_payment_coverage TO service_role;
GRANT SELECT ON public.vw_shopify_order_payment_coverage_monthly TO authenticated;
GRANT SELECT ON public.vw_shopify_order_payment_coverage_monthly TO service_role;
GRANT SELECT ON public.vw_shopify_order_payment_issues TO authenticated;
GRANT SELECT ON public.vw_shopify_order_payment_issues TO service_role;

ALTER VIEW public.vw_shopify_order_payment_coverage SET (security_invoker = true);
ALTER VIEW public.vw_shopify_order_payment_coverage_monthly SET (security_invoker = true);
ALTER VIEW public.vw_shopify_order_payment_issues SET (security_invoker = true);
