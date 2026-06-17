CREATE TABLE IF NOT EXISTS public.shopify_payment_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.shopify_connections(id) ON DELETE SET NULL,
  shop_domain text NOT NULL,
  payout_id text NOT NULL,
  status text,
  payout_date date,
  currency text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  charges_gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  charges_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  refunds_gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  refunds_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  adjustments_gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  adjustments_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  reserved_funds_gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  reserved_funds_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  retried_payouts_gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  retried_payouts_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  external_trace_id text,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_payment_payouts_shop_domain_payout_unique UNIQUE (shop_domain, payout_id)
);

CREATE TABLE IF NOT EXISTS public.shopify_payment_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.shopify_connections(id) ON DELETE SET NULL,
  shop_domain text NOT NULL,
  balance_transaction_id text NOT NULL,
  payout_id text,
  type text,
  test boolean,
  payout_status text,
  currency text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  fee numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  source_id text,
  source_type text,
  source_order_id text,
  source_order_transaction_id text,
  processed_at timestamptz,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_payment_balance_transactions_shop_domain_id_unique UNIQUE (shop_domain, balance_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_payment_payouts_date
  ON public.shopify_payment_payouts (payout_date DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_payment_payouts_shop_payout
  ON public.shopify_payment_payouts (shop_domain, payout_id);

CREATE INDEX IF NOT EXISTS idx_shopify_payment_balance_transactions_payout
  ON public.shopify_payment_balance_transactions (shop_domain, payout_id);

CREATE INDEX IF NOT EXISTS idx_shopify_payment_balance_transactions_order
  ON public.shopify_payment_balance_transactions (source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_payment_balance_transactions_processed
  ON public.shopify_payment_balance_transactions (processed_at DESC);

DROP TRIGGER IF EXISTS trg_shopify_payment_payouts_updated_at ON public.shopify_payment_payouts;
CREATE TRIGGER trg_shopify_payment_payouts_updated_at
  BEFORE UPDATE ON public.shopify_payment_payouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_shopify_payment_balance_transactions_updated_at ON public.shopify_payment_balance_transactions;
CREATE TRIGGER trg_shopify_payment_balance_transactions_updated_at
  BEFORE UPDATE ON public.shopify_payment_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_payment_payouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_payment_balance_transactions TO authenticated;
GRANT ALL ON public.shopify_payment_payouts TO service_role;
GRANT ALL ON public.shopify_payment_balance_transactions TO service_role;

ALTER TABLE public.shopify_payment_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_payment_balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopify_payment_payouts_select_auth" ON public.shopify_payment_payouts;
CREATE POLICY "shopify_payment_payouts_select_auth"
  ON public.shopify_payment_payouts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shopify_payment_payouts_all_auth" ON public.shopify_payment_payouts;
CREATE POLICY "shopify_payment_payouts_all_auth"
  ON public.shopify_payment_payouts FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shopify_payment_balance_transactions_select_auth" ON public.shopify_payment_balance_transactions;
CREATE POLICY "shopify_payment_balance_transactions_select_auth"
  ON public.shopify_payment_balance_transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shopify_payment_balance_transactions_all_auth" ON public.shopify_payment_balance_transactions;
CREATE POLICY "shopify_payment_balance_transactions_all_auth"
  ON public.shopify_payment_balance_transactions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES ('shopify_payments', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;

DROP VIEW IF EXISTS public.vw_shopify_payment_issues;
DROP VIEW IF EXISTS public.vw_shopify_order_payment_trace;
DROP VIEW IF EXISTS public.vw_shopify_payments_monthly_reconciliation;
DROP VIEW IF EXISTS public.vw_shopify_payout_reconciliation;

CREATE OR REPLACE VIEW public.vw_shopify_payout_reconciliation AS
WITH balance_summary AS (
  SELECT
    shop_domain,
    payout_id,
    count(*) FILTER (WHERE type <> 'payout')::int AS balance_tx_count,
    count(*) FILTER (WHERE type = 'charge')::int AS charge_count,
    count(*) FILTER (WHERE type = 'refund')::int AS refund_count,
    count(*) FILTER (WHERE type NOT IN ('charge', 'refund', 'payout'))::int AS adjustment_count,
    count(*) FILTER (WHERE type = 'payout')::int AS payout_movement_count,
    coalesce(sum(amount) FILTER (WHERE type <> 'payout'), 0)::numeric(14,2) AS balance_gross_amount,
    coalesce(sum(fee) FILTER (WHERE type <> 'payout'), 0)::numeric(14,2) AS balance_fee_amount,
    coalesce(sum(net) FILTER (WHERE type <> 'payout'), 0)::numeric(14,2) AS balance_net_amount,
    coalesce(sum(abs(net)) FILTER (WHERE type = 'payout'), 0)::numeric(14,2) AS payout_movement_amount,
    count(source_order_id) FILTER (WHERE type <> 'payout')::int AS balance_order_reference_count,
    min(processed_at) FILTER (WHERE type <> 'payout') AS first_balance_processed_at,
    max(processed_at) FILTER (WHERE type <> 'payout') AS last_balance_processed_at
  FROM public.shopify_payment_balance_transactions
  GROUP BY 1, 2
),
order_summary AS (
  SELECT
    bt.shop_domain,
    bt.payout_id,
    count(*) FILTER (WHERE bt.type <> 'payout' AND bt.source_order_id IS NOT NULL)::int AS order_reference_count,
    count(*) FILTER (WHERE bt.type <> 'payout' AND bt.source_order_id IS NOT NULL AND os.id IS NOT NULL)::int AS matched_order_count,
    count(*) FILTER (WHERE bt.type <> 'payout' AND bt.source_order_id IS NOT NULL AND os.id IS NULL)::int AS missing_order_count
  FROM public.shopify_payment_balance_transactions bt
  LEFT JOIN public.shopify_order_summaries os
    ON os.external_id = bt.source_order_id
  GROUP BY 1, 2
),
exact_candidates AS (
  SELECT
    p.id AS payout_row_id,
    gt.id AS gl_transaction_id,
    gt.transaction_date AS exact_transaction_date,
    gt.account_code AS exact_account_code,
    gt.description AS exact_description,
    gt.relation_name AS exact_relation_name,
    gt.document_number AS exact_document_number,
    gt.amount AS exact_amount,
    gt.raw_payload AS exact_raw_payload,
    row_number() OVER (
      PARTITION BY p.id
      ORDER BY
        CASE
          WHEN p.external_trace_id IS NOT NULL
            AND lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, ''))
                LIKE '%' || lower(p.external_trace_id) || '%'
          THEN 0
          ELSE 1
        END,
        CASE
          WHEN lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%shopify%'
          THEN 0
          ELSE 1
        END,
        abs(gt.transaction_date - p.payout_date),
        gt.created_at
    ) AS rn,
    count(*) OVER (PARTITION BY p.id)::int AS candidate_count
  FROM public.shopify_payment_payouts p
  JOIN public.gl_transactions gt
    ON gt.source = 'exact_invantive'
   AND p.payout_date IS NOT NULL
   AND gt.transaction_date BETWEEN p.payout_date - 7 AND p.payout_date + 14
   AND abs(abs(gt.amount) - abs(p.amount)) < 0.01
  LEFT JOIN public.gl_accounts ga ON ga.account_code = gt.account_code
  WHERE (
    gt.account_code IN ('1030', '1251', '1257')
    OR lower(coalesce(ga.account_name, '')) LIKE '%shopify%'
    OR lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%shopify%'
    OR lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%' || lower(p.payout_id) || '%'
    OR (
      p.external_trace_id IS NOT NULL
      AND lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%' || lower(p.external_trace_id) || '%'
    )
  )
),
exact_match AS (
  SELECT *
  FROM exact_candidates
  WHERE rn = 1
)
SELECT
  to_char(date_trunc('month', p.payout_date), 'YYYY-MM') AS period,
  p.id AS payout_row_id,
  p.connection_id,
  p.shop_domain,
  p.payout_id,
  p.status AS payout_status,
  p.payout_date,
  p.currency,
  p.amount AS payout_amount,
  p.external_trace_id,
  p.charges_gross_amount,
  p.charges_fee_amount,
  p.refunds_gross_amount,
  p.refunds_fee_amount,
  p.adjustments_gross_amount,
  p.adjustments_fee_amount,
  coalesce(bs.balance_tx_count, 0) AS balance_tx_count,
  coalesce(bs.charge_count, 0) AS charge_count,
  coalesce(bs.refund_count, 0) AS refund_count,
  coalesce(bs.adjustment_count, 0) AS adjustment_count,
  coalesce(bs.payout_movement_count, 0) AS payout_movement_count,
  coalesce(bs.balance_gross_amount, 0)::numeric(14,2) AS balance_gross_amount,
  coalesce(bs.balance_fee_amount, 0)::numeric(14,2) AS balance_fee_amount,
  coalesce(bs.balance_net_amount, 0)::numeric(14,2) AS balance_net_amount,
  coalesce(bs.payout_movement_amount, 0)::numeric(14,2) AS payout_movement_amount,
  (p.amount - coalesce(bs.balance_net_amount, 0))::numeric(14,2) AS payout_balance_diff,
  coalesce(os.order_reference_count, 0) AS order_reference_count,
  coalesce(os.matched_order_count, 0) AS matched_order_count,
  coalesce(os.missing_order_count, 0) AS missing_order_count,
  em.gl_transaction_id AS exact_gl_transaction_id,
  em.exact_transaction_date,
  em.exact_account_code,
  em.exact_description,
  em.exact_relation_name,
  em.exact_document_number,
  em.exact_amount,
  em.exact_raw_payload,
  coalesce(em.candidate_count, 0) AS exact_candidate_count,
  CASE
    WHEN em.gl_transaction_id IS NULL THEN NULL
    ELSE (p.amount - abs(em.exact_amount))::numeric(14,2)
  END AS exact_amount_diff,
  CASE
    WHEN em.gl_transaction_id IS NULL AND p.status <> 'paid' THEN 'not_paid_yet'
    WHEN em.gl_transaction_id IS NULL THEN 'exact_missing'
    WHEN coalesce(em.candidate_count, 0) > 1 THEN 'multiple_exact_candidates'
    WHEN abs(p.amount - abs(em.exact_amount)) >= 0.01 THEN 'amount_diff'
    ELSE 'ok'
  END AS exact_match_status,
  bs.first_balance_processed_at,
  bs.last_balance_processed_at,
  p.raw_payload,
  p.synced_at
FROM public.shopify_payment_payouts p
LEFT JOIN balance_summary bs
  ON bs.shop_domain = p.shop_domain
 AND bs.payout_id = p.payout_id
LEFT JOIN order_summary os
  ON os.shop_domain = p.shop_domain
 AND os.payout_id = p.payout_id
LEFT JOIN exact_match em ON em.payout_row_id = p.id;

CREATE OR REPLACE VIEW public.vw_shopify_payments_monthly_reconciliation AS
SELECT
  period,
  count(*)::int AS payout_count,
  count(*) FILTER (WHERE payout_status = 'paid')::int AS paid_payout_count,
  count(*) FILTER (WHERE exact_gl_transaction_id IS NOT NULL)::int AS exact_matched_payout_count,
  count(*) FILTER (WHERE exact_match_status = 'exact_missing')::int AS exact_missing_payout_count,
  count(*) FILTER (WHERE missing_order_count > 0)::int AS payout_with_missing_orders_count,
  coalesce(sum(payout_amount), 0)::numeric(14,2) AS payout_amount,
  coalesce(sum(balance_gross_amount), 0)::numeric(14,2) AS balance_gross_amount,
  coalesce(sum(balance_fee_amount), 0)::numeric(14,2) AS balance_fee_amount,
  coalesce(sum(balance_net_amount), 0)::numeric(14,2) AS balance_net_amount,
  coalesce(sum(payout_balance_diff), 0)::numeric(14,2) AS payout_balance_diff,
  coalesce(sum(abs(exact_amount)) FILTER (WHERE exact_gl_transaction_id IS NOT NULL), 0)::numeric(14,2) AS exact_amount,
  (
    coalesce(sum(payout_amount), 0)
    - coalesce(sum(abs(exact_amount)) FILTER (WHERE exact_gl_transaction_id IS NOT NULL), 0)
  )::numeric(14,2) AS exact_amount_diff,
  coalesce(sum(balance_tx_count), 0)::int AS balance_tx_count,
  coalesce(sum(charge_count), 0)::int AS charge_count,
  coalesce(sum(refund_count), 0)::int AS refund_count,
  coalesce(sum(adjustment_count), 0)::int AS adjustment_count,
  coalesce(sum(order_reference_count), 0)::int AS order_reference_count,
  coalesce(sum(matched_order_count), 0)::int AS matched_order_count,
  coalesce(sum(missing_order_count), 0)::int AS missing_order_count
FROM public.vw_shopify_payout_reconciliation
WHERE period IS NOT NULL
GROUP BY 1;

CREATE OR REPLACE VIEW public.vw_shopify_order_payment_trace AS
SELECT
  bt.id AS balance_row_id,
  bt.shop_domain,
  bt.balance_transaction_id,
  bt.type AS balance_type,
  bt.processed_at AS balance_processed_at,
  to_char(date_trunc('month', bt.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
  bt.payout_id,
  bt.payout_status,
  bt.currency,
  bt.amount AS balance_amount,
  bt.fee AS balance_fee,
  bt.net AS balance_net,
  bt.source_id,
  bt.source_type,
  bt.source_order_id,
  bt.source_order_transaction_id,
  os.id AS order_summary_id,
  os.order_name,
  os.order_number,
  os.channel,
  os.financial_status,
  os.processed_at AS order_processed_at,
  os.current_total_price AS order_current_total_price,
  os.total_price AS order_total_price,
  os.net_payment AS order_net_payment,
  p.payout_row_id,
  p.payout_date,
  p.payout_status AS payout_current_status,
  p.payout_amount,
  p.exact_gl_transaction_id,
  p.exact_transaction_date,
  p.exact_account_code,
  p.exact_description,
  p.exact_relation_name,
  p.exact_document_number,
  p.exact_amount,
  p.exact_raw_payload,
  p.exact_match_status,
  CASE
    WHEN bt.type = 'payout' THEN 'payout_movement'
    WHEN bt.source_order_id IS NULL AND bt.type IN ('charge', 'refund') THEN 'order_id_missing'
    WHEN bt.source_order_id IS NOT NULL AND os.id IS NULL THEN 'order_missing'
    WHEN bt.payout_id IS NULL THEN 'payout_missing'
    WHEN p.payout_row_id IS NULL THEN 'payout_missing'
    WHEN p.exact_gl_transaction_id IS NULL AND p.payout_status = 'paid' THEN 'exact_missing'
    ELSE 'ok'
  END AS trace_status,
  bt.raw_payload,
  bt.synced_at
FROM public.shopify_payment_balance_transactions bt
LEFT JOIN public.shopify_order_summaries os
  ON os.external_id = bt.source_order_id
LEFT JOIN public.vw_shopify_payout_reconciliation p
  ON p.shop_domain = bt.shop_domain
 AND p.payout_id = bt.payout_id;

CREATE OR REPLACE VIEW public.vw_shopify_payment_issues AS
SELECT
  exact_match_status AS issue_type,
  period,
  payout_date::timestamptz AS occurred_at,
  payout_amount AS amount,
  NULL::text AS order_name,
  NULL::text AS order_number,
  payout_id,
  NULL::text AS balance_transaction_id,
  NULL::text AS source_order_id,
  exact_gl_transaction_id,
  exact_document_number,
  exact_description,
  CASE
    WHEN exact_match_status = 'exact_missing' THEN 'Geen Exact-ontvangst gevonden voor deze Shopify payout'
    WHEN exact_match_status = 'multiple_exact_candidates' THEN 'Meerdere mogelijke Exact-ontvangsten gevonden'
    WHEN exact_match_status = 'amount_diff' THEN 'Exact-bedrag wijkt af van Shopify payout'
    ELSE NULL
  END AS note
FROM public.vw_shopify_payout_reconciliation
WHERE exact_match_status IN ('exact_missing', 'multiple_exact_candidates', 'amount_diff')

UNION ALL

SELECT
  trace_status AS issue_type,
  period,
  balance_processed_at AS occurred_at,
  balance_amount AS amount,
  order_name,
  order_number,
  payout_id,
  balance_transaction_id,
  source_order_id,
  exact_gl_transaction_id,
  exact_document_number,
  exact_description,
  NULL::text AS note
FROM public.vw_shopify_order_payment_trace
WHERE trace_status IN ('order_id_missing', 'order_missing', 'payout_missing');

GRANT SELECT ON public.vw_shopify_payout_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_payout_reconciliation TO service_role;
GRANT SELECT ON public.vw_shopify_payments_monthly_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_payments_monthly_reconciliation TO service_role;
GRANT SELECT ON public.vw_shopify_order_payment_trace TO authenticated;
GRANT SELECT ON public.vw_shopify_order_payment_trace TO service_role;
GRANT SELECT ON public.vw_shopify_payment_issues TO authenticated;
GRANT SELECT ON public.vw_shopify_payment_issues TO service_role;

ALTER VIEW public.vw_shopify_payout_reconciliation SET (security_invoker = true);
ALTER VIEW public.vw_shopify_payments_monthly_reconciliation SET (security_invoker = true);
ALTER VIEW public.vw_shopify_order_payment_trace SET (security_invoker = true);
ALTER VIEW public.vw_shopify_payment_issues SET (security_invoker = true);

COMMENT ON VIEW public.vw_shopify_order_payment_trace IS
  'Trace van Shopify Payments balance transaction naar Shopify order, payout en Exact grootboekregel.';
