CREATE OR REPLACE VIEW public.vw_gl_monthly_account AS
SELECT
  to_char(date_trunc('month', gt.transaction_date), 'YYYY-MM') AS period,
  concat(EXTRACT(YEAR FROM gt.transaction_date)::int, '-Q', EXTRACT(QUARTER FROM gt.transaction_date)::int) AS quarter_key,
  EXTRACT(YEAR FROM gt.transaction_date)::int AS year,
  EXTRACT(MONTH FROM gt.transaction_date)::int AS month,
  gt.account_id,
  gt.account_code,
  COALESCE(ga.account_name, gt.account_code) AS account_name,
  COALESCE(ga.pl_section, 'other') AS pl_section,
  ga.revenue_channel,
  COALESCE(ga.sort_order, 999999) AS sort_order,
  count(*)::int AS entry_count,
  COALESCE(sum(gt.amount), 0) AS amount
FROM public.gl_transactions gt
LEFT JOIN public.gl_accounts ga ON ga.id = gt.account_id
GROUP BY 1, 2, 3, 4, gt.account_id, gt.account_code, ga.account_name, ga.pl_section, ga.revenue_channel, ga.sort_order;

GRANT SELECT ON public.vw_gl_monthly_account TO authenticated;

ALTER VIEW public.vw_gl_monthly_account SET (security_invoker = true);
