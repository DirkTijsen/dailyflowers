ALTER TABLE public.shopify_payment_balance_transactions
  ADD COLUMN IF NOT EXISTS order_name text,
  ADD COLUMN IF NOT EXISTS checkout_id text,
  ADD COLUMN IF NOT EXISTS payment_method_name text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_source text,
  ADD COLUMN IF NOT EXISTS available_on date,
  ADD COLUMN IF NOT EXISTS presentment_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS presentment_currency text,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS import_batch_id text;

CREATE INDEX IF NOT EXISTS idx_shopify_payment_balance_transactions_order_name
  ON public.shopify_payment_balance_transactions (order_name)
  WHERE order_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_payment_balance_transactions_checkout
  ON public.shopify_payment_balance_transactions (checkout_id)
  WHERE checkout_id IS NOT NULL;

DROP VIEW IF EXISTS public.vw_shopify_payment_issues;

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
  coalesce(os_id.id, os_name.id) AS order_summary_id,
  coalesce(os_id.order_name, os_name.order_name, bt.order_name) AS order_name,
  coalesce(os_id.order_number, os_name.order_number, nullif(regexp_replace(coalesce(bt.order_name, ''), '^#', ''), '')) AS order_number,
  coalesce(os_id.channel, os_name.channel) AS channel,
  coalesce(os_id.financial_status, os_name.financial_status) AS financial_status,
  coalesce(os_id.processed_at, os_name.processed_at) AS order_processed_at,
  coalesce(os_id.current_total_price, os_name.current_total_price) AS order_current_total_price,
  coalesce(os_id.total_price, os_name.total_price) AS order_total_price,
  coalesce(os_id.net_payment, os_name.net_payment) AS order_net_payment,
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
    WHEN bt.payout_id IS NULL AND coalesce(bt.payout_status, '') <> 'paid' THEN 'not_paid_yet'
    WHEN coalesce(bt.source_order_id, bt.order_name) IS NULL AND bt.type IN ('charge', 'refund') THEN 'order_id_missing'
    WHEN coalesce(bt.source_order_id, bt.order_name) IS NOT NULL AND coalesce(os_id.id, os_name.id) IS NULL THEN 'order_missing'
    WHEN bt.payout_id IS NULL THEN 'payout_missing'
    WHEN p.payout_row_id IS NULL AND coalesce(bt.payout_status, '') <> 'paid' THEN 'not_paid_yet'
    WHEN p.payout_row_id IS NULL THEN 'payout_missing'
    WHEN p.exact_gl_transaction_id IS NULL AND p.payout_status = 'paid' THEN 'exact_missing'
    ELSE 'ok'
  END AS trace_status,
  bt.raw_payload,
  bt.synced_at
FROM public.shopify_payment_balance_transactions bt
LEFT JOIN public.shopify_order_summaries os_id
  ON os_id.external_id = bt.source_order_id
LEFT JOIN public.shopify_order_summaries os_name
  ON bt.source_order_id IS NULL
 AND bt.order_name IS NOT NULL
 AND os_name.order_name = bt.order_name
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

GRANT SELECT ON public.vw_shopify_order_payment_trace TO authenticated;
GRANT SELECT ON public.vw_shopify_order_payment_trace TO service_role;
GRANT SELECT ON public.vw_shopify_payment_issues TO authenticated;
GRANT SELECT ON public.vw_shopify_payment_issues TO service_role;

ALTER VIEW public.vw_shopify_order_payment_trace SET (security_invoker = true);
ALTER VIEW public.vw_shopify_payment_issues SET (security_invoker = true);
