CREATE OR REPLACE VIEW public.vw_bold_mollie_monthly_reconciliation AS
WITH sales_paid AS (
  SELECT
    to_char(paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS sales_paid_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS sales_paid_gross
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
  GROUP BY 1
),
mollie_paid AS (
  SELECT
    to_char(coalesce(mollie_paid_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS mollie_paid_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS mollie_paid_gross
  FROM public.mollie_transactions
  WHERE status = 'paid'
    AND coalesce(mollie_paid_at, mollie_created_at) IS NOT NULL
  GROUP BY 1
),
sales_all AS (
  SELECT
    to_char(paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS sales_all_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS sales_all_gross
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
  GROUP BY 1
),
mollie_all AS (
  SELECT
    to_char(coalesce(mollie_paid_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS mollie_all_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS mollie_all_gross,
    count(*) FILTER (WHERE parse_status = 'ok')::int AS mollie_parsed_count,
    count(*) FILTER (WHERE parse_status = 'parse_error')::int AS mollie_parse_error_count,
    count(*) FILTER (WHERE sales_action IN ('added', 'already_exists'))::int AS mollie_linked_sales_count,
    count(*) FILTER (WHERE sales_action = 'added')::int AS mollie_added_sales_count,
    count(*) FILTER (WHERE sales_action = 'already_exists')::int AS mollie_existing_sales_count,
    count(*) FILTER (WHERE sales_action = 'not_parsed')::int AS mollie_not_added_count
  FROM public.mollie_transactions
  WHERE coalesce(mollie_paid_at, mollie_created_at) IS NOT NULL
  GROUP BY 1
),
periods AS (
  SELECT period FROM sales_paid
  UNION
  SELECT period FROM mollie_paid
  UNION
  SELECT period FROM sales_all
  UNION
  SELECT period FROM mollie_all
)
SELECT
  p.period,
  coalesce(sp.sales_paid_count, 0) AS sales_paid_count,
  coalesce(mp.mollie_paid_count, 0) AS mollie_paid_count,
  coalesce(sp.sales_paid_count, 0) - coalesce(mp.mollie_paid_count, 0) AS paid_count_diff,
  coalesce(sp.sales_paid_gross, 0)::numeric(12,2) AS sales_paid_gross,
  coalesce(mp.mollie_paid_gross, 0)::numeric(12,2) AS mollie_paid_gross,
  (coalesce(sp.sales_paid_gross, 0) - coalesce(mp.mollie_paid_gross, 0))::numeric(12,2) AS paid_gross_diff,
  coalesce(sa.sales_all_count, 0) AS sales_all_count,
  coalesce(ma.mollie_all_count, 0) AS mollie_all_count,
  coalesce(sa.sales_all_count, 0) - coalesce(ma.mollie_all_count, 0) AS all_count_diff,
  coalesce(sa.sales_all_gross, 0)::numeric(12,2) AS sales_all_gross,
  coalesce(ma.mollie_all_gross, 0)::numeric(12,2) AS mollie_all_gross,
  (coalesce(sa.sales_all_gross, 0) - coalesce(ma.mollie_all_gross, 0))::numeric(12,2) AS all_gross_diff,
  coalesce(ma.mollie_parsed_count, 0) AS mollie_parsed_count,
  coalesce(ma.mollie_parse_error_count, 0) AS mollie_parse_error_count,
  coalesce(ma.mollie_linked_sales_count, 0) AS mollie_linked_sales_count,
  coalesce(ma.mollie_added_sales_count, 0) AS mollie_added_sales_count,
  coalesce(ma.mollie_existing_sales_count, 0) AS mollie_existing_sales_count,
  coalesce(ma.mollie_not_added_count, 0) AS mollie_not_added_count,
  (
    coalesce(sp.sales_paid_count, 0) = coalesce(mp.mollie_paid_count, 0)
    AND abs(coalesce(sp.sales_paid_gross, 0) - coalesce(mp.mollie_paid_gross, 0)) < 0.01
  ) AS paid_reconciled
FROM periods p
LEFT JOIN sales_paid sp ON sp.period = p.period
LEFT JOIN mollie_paid mp ON mp.period = p.period
LEFT JOIN sales_all sa ON sa.period = p.period
LEFT JOIN mollie_all ma ON ma.period = p.period;

GRANT SELECT ON public.vw_bold_mollie_monthly_reconciliation TO authenticated;
GRANT SELECT ON public.vw_bold_mollie_monthly_reconciliation TO service_role;
