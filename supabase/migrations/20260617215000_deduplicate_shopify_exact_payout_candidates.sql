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
exact_candidate_rows AS (
  SELECT
    p.id AS payout_row_id,
    gt.id AS gl_transaction_id,
    CASE
      WHEN coalesce(gt.raw_payload->>'journalcode', '') <> ''
        AND coalesce(gt.raw_payload->>'entrynumber', '') <> ''
        THEN concat_ws(
          '|',
          'entry',
          coalesce(nullif(gt.raw_payload->>'division', ''), '-'),
          gt.raw_payload->>'journalcode',
          gt.raw_payload->>'entrynumber'
        )
      WHEN coalesce(gt.raw_payload->>'exact_document_id', '') <> ''
        THEN concat_ws(
          '|',
          'document-id',
          coalesce(nullif(gt.raw_payload->>'division', ''), '-'),
          gt.raw_payload->>'exact_document_id'
        )
      WHEN coalesce(gt.document_number, '') <> ''
        THEN concat_ws(
          '|',
          'document',
          gt.transaction_date::text,
          gt.document_number,
          abs(gt.amount)::numeric(14,2)::text
        )
      ELSE concat('line|', gt.id::text)
    END AS exact_booking_key,
    gt.transaction_date AS exact_transaction_date,
    gt.account_code AS exact_account_code,
    gt.description AS exact_description,
    gt.relation_name AS exact_relation_name,
    gt.document_number AS exact_document_number,
    gt.amount AS exact_amount,
    gt.raw_payload AS exact_raw_payload,
    abs(gt.transaction_date - p.payout_date) AS date_distance,
    gt.created_at
  FROM public.shopify_payment_payouts p
  JOIN public.gl_transactions gt
    ON gt.source = 'exact_invantive'
   AND p.status = 'paid'
   AND p.payout_date IS NOT NULL
   AND gt.transaction_date BETWEEN p.payout_date - 7 AND p.payout_date + 14
   AND abs(coalesce(gt.debit_amount, 0) - abs(p.amount)) < 0.01
  LEFT JOIN public.gl_accounts ga ON ga.account_code = gt.account_code
  WHERE coalesce(gt.debit_amount, 0) > 0
    AND (
      lower(coalesce(ga.account_type, '')) = 'bank'
      OR lower(coalesce(ga.account_name, '')) LIKE '%bank%'
      OR lower(coalesce(ga.account_name, '')) LIKE '%rabo%'
      OR lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%rabobank%'
      OR lower(coalesce(gt.description, '') || ' ' || coalesce(gt.relation_name, '') || ' ' || coalesce(gt.raw_payload::text, '')) LIKE '%rabo%'
    )
),
exact_candidate_booking_representatives AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY payout_row_id, exact_booking_key
      ORDER BY
        date_distance,
        created_at
    ) AS booking_rn
  FROM exact_candidate_rows
),
exact_candidates AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY payout_row_id
      ORDER BY
        date_distance,
        created_at
    ) AS rn,
    count(*) OVER (PARTITION BY payout_row_id)::int AS candidate_count
  FROM exact_candidate_booking_representatives
  WHERE booking_rn = 1
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

GRANT SELECT ON public.vw_shopify_payout_reconciliation TO authenticated;
GRANT SELECT ON public.vw_shopify_payout_reconciliation TO service_role;

ALTER VIEW public.vw_shopify_payout_reconciliation SET (security_invoker = true);

COMMENT ON VIEW public.vw_shopify_payout_reconciliation IS
  'Shopify Payments payout-aansluiting met Exact op basis van debetboekingen op bankrekeningen.';
