WITH seed AS (
  SELECT coalesce(
    (
      SELECT rule.amount
      FROM public.pl_budget_driver_rules rule
      WHERE rule.driver_key = 'afs_budgetmachines_huurpercentage'
        AND rule.from_period <= '2026-01'
        AND (rule.to_period IS NULL OR rule.to_period >= '2026-01')
      ORDER BY rule.from_period DESC
      LIMIT 1
    ),
    (
      SELECT avg(agreement.turnover_rate_percent)
      FROM public.afs_rental_agreements agreement
      WHERE agreement.status = 'active'
    ),
    15
  ) AS percentage
)
INSERT INTO public.pl_budget_driver_rules (
  driver_key,
  driver_label,
  calculation_type,
  amount,
  basis_amount,
  machine_count,
  section,
  line_key,
  line_label,
  source_label,
  sort_order,
  from_period,
  to_period
)
SELECT
  'afs_huurpercentage_zonder_afspraak',
  'AFS - Huur zonder huurafspraak',
  'percentage_of_revenue',
  seed.percentage,
  NULL,
  NULL,
  'housing',
  'budget-afs-huurkosten',
  'AFS - Huurkosten',
  'Vast huurpercentage van de budgetomzet van bestaande AFS-en zonder huurafspraak',
  294,
  '2026-01',
  NULL
FROM seed
ON CONFLICT (driver_key, from_period) DO NOTHING;
