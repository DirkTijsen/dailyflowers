ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS scenario text NOT NULL DEFAULT 'mid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_scenario_check'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_scenario_check CHECK (scenario IN ('mid', 'low'));
  END IF;
END
$$;

DROP INDEX IF EXISTS public.budgets_unique_with_machine;
DROP INDEX IF EXISTS public.budgets_unique_no_machine;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_unique_with_machine
  ON public.budgets (scenario, channel, machine_id, period)
  WHERE machine_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_unique_no_machine
  ON public.budgets (scenario, channel, period)
  WHERE machine_id IS NULL;

INSERT INTO public.budgets (channel, machine_id, period, amount, scenario)
SELECT channel, machine_id, period, amount, 'low'
FROM public.budgets
WHERE scenario = 'mid'
ON CONFLICT DO NOTHING;

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
  'marketing_verkoopkosten_intern',
  'Marketing - Intern',
  calculation_type,
  amount,
  basis_amount,
  machine_count,
  section,
  line_key,
  'Marketing - Marketingkosten intern',
  'Marketingkosten intern (% van totale budgetomzet)',
  sort_order,
  from_period,
  to_period
FROM public.pl_budget_driver_rules
WHERE driver_key = 'marketing_verkoopkosten'
ON CONFLICT (driver_key, from_period) DO NOTHING;

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
  'marketing_verkoopkosten_intern',
  'Marketing - Intern',
  'percentage_of_revenue',
  0,
  NULL,
  NULL,
  'sales_marketing',
  'budget-webshop-advertentiekosten',
  'Marketing - Marketingkosten intern',
  'Marketingkosten intern (% van totale budgetomzet)',
  510,
  '2026-01',
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pl_budget_driver_rules
  WHERE driver_key = 'marketing_verkoopkosten_intern'
);

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
  'marketing_verkoopkosten_bank',
  'Marketing - Bank',
  calculation_type,
  amount,
  basis_amount,
  machine_count,
  section,
  line_key,
  'Marketing - Marketingkosten bank',
  'Marketingkosten bank (% van totale budgetomzet)',
  511,
  from_period,
  to_period
FROM public.pl_budget_driver_rules
WHERE driver_key = 'marketing_verkoopkosten_intern'
ON CONFLICT (driver_key, from_period) DO NOTHING;

DELETE FROM public.pl_budget_driver_rules
WHERE driver_key = 'marketing_verkoopkosten';

COMMENT ON COLUMN public.budgets.scenario IS
  'Revenue budget scenario: mid is the base case and low is the downside case.';
