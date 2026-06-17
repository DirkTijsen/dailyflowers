CREATE OR REPLACE VIEW public.vw_gl_revenue_source_monthly AS
WITH mollie_entries AS (
  SELECT DISTINCT raw_payload->>'entrynumber' AS entry_number
  FROM public.gl_transactions
  WHERE account_code = '1258'
    AND raw_payload->>'entrynumber' IS NOT NULL
),
classified AS (
  SELECT
    to_char(date_trunc('month', gt.transaction_date), 'YYYY-MM') AS period,
    CASE
      WHEN me.entry_number IS NOT NULL THEN 'mollie_journal'
      ELSE 'shopify'
    END AS revenue_source,
    gt.amount
  FROM public.gl_transactions gt
  JOIN public.gl_accounts ga ON ga.account_code = gt.account_code
  LEFT JOIN mollie_entries me ON me.entry_number = gt.raw_payload->>'entrynumber'
  WHERE ga.pl_section = 'revenue'
)
SELECT
  period,
  revenue_source,
  count(*)::int AS tx_count,
  COALESCE(sum(-amount), 0) AS net_total
FROM classified
GROUP BY 1, 2;

GRANT SELECT ON public.vw_gl_revenue_source_monthly TO authenticated;
ALTER VIEW public.vw_gl_revenue_source_monthly SET (security_invoker = true);
COMMENT ON VIEW public.vw_gl_revenue_source_monthly IS
  'Monthly GL revenue split used for W&V diagnostics: Exact revenue in Mollie clearing entries versus all remaining Exact revenue as Shopify delta.';
