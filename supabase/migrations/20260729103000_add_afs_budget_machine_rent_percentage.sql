WITH active_agreements AS (
  SELECT
    agreement.fixed_fee_net,
    agreement.energy_cost_net,
    agreement.turnover_rate_percent,
    agreement.turnover_threshold_net,
    agreement.start_period,
    agreement.end_period
  FROM public.afs_rental_agreements agreement
  WHERE agreement.status = 'active'
),
historical_equivalent AS (
  SELECT
    CASE
      WHEN sum(revenue.amount) > 0 THEN
        100 * (
          sum(
            (
              SELECT avg(
                agreement.fixed_fee_net
                + agreement.energy_cost_net
                + greatest(
                    0,
                    revenue.amount_per_machine - agreement.turnover_threshold_net
                  ) * agreement.turnover_rate_percent / 100
              )
              FROM active_agreements agreement
              WHERE agreement.start_period <= revenue.period
                AND (agreement.end_period IS NULL OR agreement.end_period >= revenue.period)
            ) * input.budget_machine_count
          )
        ) / sum(revenue.amount)
      ELSE NULL
    END AS percentage
  FROM public.afs_budget_tranche_revenues revenue
  JOIN public.cashflow_inputs input
    ON input.id = revenue.cashflow_input_id
  WHERE revenue.amount > 0
),
seed AS (
  SELECT round(
    coalesce(
      (SELECT percentage FROM historical_equivalent),
      (SELECT avg(turnover_rate_percent) FROM active_agreements),
      15
    ),
    6
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
  'afs_budgetmachines_huurpercentage',
  'AFS - Huurkosten nieuwe budgetmachines',
  'percentage_of_revenue',
  seed.percentage,
  NULL,
  NULL,
  'cost_of_goods',
  'budget-afs-huurkosten-budgetmachines',
  'AFS - Huurkosten nieuwe budgetmachines',
  'Vast huurpercentage van de omzet van nieuwe AFS-budgetmachines',
  296,
  '2026-01',
  NULL
FROM seed
ON CONFLICT (driver_key, from_period) DO NOTHING;

COMMENT ON TABLE public.pl_budget_driver_rules IS
  'Periodegebonden invoer voor W&V-budgetdrivers, inclusief het vaste huurpercentage voor nieuwe AFS-budgetmachines.';
