CREATE OR REPLACE VIEW public.vw_gl_yearly_status AS
SELECT
  EXTRACT(YEAR FROM transaction_date)::int AS year,
  count(*)::int AS transaction_count,
  min(transaction_date)::text AS min_date,
  max(transaction_date)::text AS max_date,
  LEAST(max(transaction_date), current_date)::text AS updated_through_date
FROM public.gl_transactions
GROUP BY 1;

GRANT SELECT ON public.vw_gl_yearly_status TO authenticated;

ALTER VIEW public.vw_gl_yearly_status SET (security_invoker = true);
