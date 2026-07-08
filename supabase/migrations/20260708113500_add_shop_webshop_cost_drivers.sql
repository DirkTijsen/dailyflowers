ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  ADD COLUMN IF NOT EXISTS basis_amount numeric(14,6);

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  ALTER COLUMN amount TYPE numeric(14,6),
  ALTER COLUMN basis_amount TYPE numeric(14,6);

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  DROP CONSTRAINT IF EXISTS pl_budget_driver_rules_calculation_type_check;

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  ADD CONSTRAINT pl_budget_driver_rules_calculation_type_check CHECK (
    calculation_type IN (
      'percentage_of_revenue',
      'amount_per_afs',
      'percentage_of_driver',
      'orders_from_revenue'
    )
  );

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  DROP CONSTRAINT IF EXISTS pl_budget_driver_rules_basis_amount_check;

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  ADD CONSTRAINT pl_budget_driver_rules_basis_amount_check CHECK (
    basis_amount IS NULL OR basis_amount >= 0
  );

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  DROP CONSTRAINT IF EXISTS pl_budget_driver_rules_order_value_check;

ALTER TABLE IF EXISTS public.pl_budget_driver_rules
  ADD CONSTRAINT pl_budget_driver_rules_order_value_check CHECK (
    calculation_type <> 'orders_from_revenue' OR basis_amount > 0
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
VALUES
  (
    'winkels_inkoop',
    'Winkels - Inkoop',
    'percentage_of_revenue',
    33.333333,
    NULL,
    NULL,
    'cost_of_goods',
    'budget-winkels-inkoop',
    'Winkels - Inkoop',
    'Inkoop (% van winkelomzet)',
    220,
    '2026-01',
    NULL
  ),
  (
    'winkels_verspilling',
    'Winkels - Verspilling',
    'percentage_of_driver',
    10.0000,
    NULL,
    NULL,
    'cost_of_goods',
    'budget-winkels-verspilling',
    'Winkels - Verspilling',
    'Verspilling (% van winkels inkoop)',
    221,
    '2026-01',
    NULL
  ),
  (
    'webshop_inkoop',
    'Webshop - Inkoop',
    'percentage_of_revenue',
    33.333333,
    NULL,
    NULL,
    'cost_of_goods',
    'budget-webshop-inkoop',
    'Webshop - Inkoop',
    'Inkoop (% van webshop omzet)',
    230,
    '2026-01',
    NULL
  ),
  (
    'webshop_bezorgkosten',
    'Webshop - Bezorgkosten',
    'orders_from_revenue',
    20.0000,
    110.0000,
    NULL,
    'cost_of_goods',
    'budget-webshop-bezorgkosten',
    'Webshop - Bezorgkosten',
    'Omzet / orderwaarde * bezorgkosten',
    231,
    '2026-01',
    NULL
  )
ON CONFLICT (driver_key, from_period) DO NOTHING;

COMMENT ON COLUMN public.pl_budget_driver_rules.basis_amount IS
  'Optional second driver amount. For orders_from_revenue this is the average order value used as revenue denominator.';
