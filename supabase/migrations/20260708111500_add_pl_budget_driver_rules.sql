CREATE TABLE IF NOT EXISTS public.pl_budget_driver_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_key text NOT NULL,
  driver_label text NOT NULL,
  calculation_type text NOT NULL,
  amount numeric(14,4) NOT NULL DEFAULT 0,
  machine_count integer,
  section text NOT NULL DEFAULT 'cost_of_goods',
  line_key text NOT NULL,
  line_label text NOT NULL,
  source_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  from_period text NOT NULL,
  to_period text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pl_budget_driver_rules_from_period_check CHECK (from_period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT pl_budget_driver_rules_to_period_check CHECK (
    to_period IS NULL OR to_period ~ '^\d{4}-\d{2}$'
  ),
  CONSTRAINT pl_budget_driver_rules_period_order_check CHECK (
    to_period IS NULL OR from_period <= to_period
  ),
  CONSTRAINT pl_budget_driver_rules_calculation_type_check CHECK (
    calculation_type IN ('percentage_of_revenue', 'amount_per_afs')
  ),
  CONSTRAINT pl_budget_driver_rules_amount_check CHECK (amount >= 0),
  CONSTRAINT pl_budget_driver_rules_machine_count_check CHECK (
    machine_count IS NULL OR machine_count >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pl_budget_driver_rules_driver_from_unique
  ON public.pl_budget_driver_rules (driver_key, from_period);

CREATE INDEX IF NOT EXISTS idx_pl_budget_driver_rules_effective
  ON public.pl_budget_driver_rules (driver_key, from_period, to_period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_budget_driver_rules TO authenticated;
GRANT ALL ON public.pl_budget_driver_rules TO service_role;

ALTER TABLE public.pl_budget_driver_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pl_budget_driver_rules_select_auth" ON public.pl_budget_driver_rules;
CREATE POLICY "pl_budget_driver_rules_select_auth"
  ON public.pl_budget_driver_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pl_budget_driver_rules_write_auth" ON public.pl_budget_driver_rules;
CREATE POLICY "pl_budget_driver_rules_write_auth"
  ON public.pl_budget_driver_rules FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_pl_budget_driver_rules_updated_at ON public.pl_budget_driver_rules;
CREATE TRIGGER trg_pl_budget_driver_rules_updated_at
  BEFORE UPDATE ON public.pl_budget_driver_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

WITH active_afs AS (
  SELECT count(*)::integer AS machine_count
  FROM public.machines
  WHERE active = true
)
INSERT INTO public.pl_budget_driver_rules (
  driver_key,
  driver_label,
  calculation_type,
  amount,
  machine_count,
  section,
  line_key,
  line_label,
  source_label,
  sort_order,
  from_period,
  to_period
)
SELECT *
FROM (
  SELECT
    'afs_inkoop',
    'AFS - Inkoop',
    'percentage_of_revenue',
    45.0000::numeric,
    NULL::integer,
    'cost_of_goods',
    'budget-afs-inkoop',
    'AFS - Inkoop',
    'Inkoop (% van AFS omzet)',
    210,
    '2026-01',
    NULL::text
  UNION ALL
  SELECT
    'afs_schoonmaak',
    'AFS - Schoonmaak',
    'amount_per_afs',
    0.0000::numeric,
    active_afs.machine_count,
    'cost_of_goods',
    'budget-afs-schoonmaak',
    'AFS - Schoonmaak',
    'Vast bedrag per AFS per maand',
    211,
    '2026-01',
    NULL::text
  FROM active_afs
  UNION ALL
  SELECT
    'afs_onderhoud',
    'AFS - Onderhoud',
    'amount_per_afs',
    0.0000::numeric,
    active_afs.machine_count,
    'cost_of_goods',
    'budget-afs-onderhoud',
    'AFS - Onderhoud',
    'Vast bedrag per AFS per maand',
    212,
    '2026-01',
    NULL::text
  FROM active_afs
  UNION ALL
  SELECT
    'afs_logistiek',
    'AFS - Logistiek',
    'amount_per_afs',
    0.0000::numeric,
    active_afs.machine_count,
    'cost_of_goods',
    'budget-afs-logistiek',
    'AFS - Logistiek',
    'Vast bedrag per AFS per maand',
    213,
    '2026-01',
    NULL::text
  FROM active_afs
) AS seed (
  driver_key,
  driver_label,
  calculation_type,
  amount,
  machine_count,
  section,
  line_key,
  line_label,
  source_label,
  sort_order,
  from_period,
  to_period
)
ON CONFLICT (driver_key, from_period) DO NOTHING;

COMMENT ON TABLE public.pl_budget_driver_rules IS
  'Effective-dated W&V budget drivers, such as AFS cost price assumptions. A NULL to_period means the rule applies indefinitely.';
