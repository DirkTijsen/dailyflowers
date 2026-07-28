CREATE TABLE IF NOT EXISTS public.afs_budget_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_year integer NOT NULL,
  machine_number integer NOT NULL,
  display_name text NOT NULL,
  start_period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_budget_machines_year_check CHECK (budget_year BETWEEN 2000 AND 2100),
  CONSTRAINT afs_budget_machines_number_check CHECK (machine_number > 0),
  CONSTRAINT afs_budget_machines_period_check CHECK (start_period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT afs_budget_machines_year_period_check CHECK (
    budget_year = split_part(start_period, '-', 1)::integer
  ),
  CONSTRAINT afs_budget_machines_year_number_unique UNIQUE (budget_year, machine_number)
);

CREATE TABLE IF NOT EXISTS public.afs_budget_machine_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_machine_id uuid NOT NULL REFERENCES public.afs_budget_machines(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_budget_machine_revenues_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT afs_budget_machine_revenues_amount_check CHECK (amount >= 0),
  CONSTRAINT afs_budget_machine_revenues_machine_period_unique UNIQUE (budget_machine_id, period)
);

CREATE INDEX IF NOT EXISTS idx_afs_budget_machines_year_start
  ON public.afs_budget_machines (budget_year, start_period, machine_number);

CREATE INDEX IF NOT EXISTS idx_afs_budget_machine_revenues_period
  ON public.afs_budget_machine_revenues (period, budget_machine_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afs_budget_machines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.afs_budget_machine_revenues TO authenticated;
GRANT ALL ON public.afs_budget_machines TO service_role;
GRANT ALL ON public.afs_budget_machine_revenues TO service_role;

ALTER TABLE public.afs_budget_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afs_budget_machine_revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afs_budget_machines_select_auth"
  ON public.afs_budget_machines FOR SELECT TO authenticated USING (true);

CREATE POLICY "afs_budget_machines_write_auth"
  ON public.afs_budget_machines FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "afs_budget_machine_revenues_select_auth"
  ON public.afs_budget_machine_revenues FOR SELECT TO authenticated USING (true);

CREATE POLICY "afs_budget_machine_revenues_write_auth"
  ON public.afs_budget_machine_revenues FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_afs_budget_machines_updated_at ON public.afs_budget_machines;
CREATE TRIGGER trg_afs_budget_machines_updated_at
  BEFORE UPDATE ON public.afs_budget_machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_afs_budget_machine_revenues_updated_at
  ON public.afs_budget_machine_revenues;
CREATE TRIGGER trg_afs_budget_machine_revenues_updated_at
  BEFORE UPDATE ON public.afs_budget_machine_revenues
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Eenmalige 2027-opzet: 99 bestaande AFS'en en de nieuwe machines uit de
-- budget-cashflow. Elke cashflowmaand vormt een tranche met een eigen startmaand.
WITH cashflow_tranches AS (
  SELECT
    period,
    budget_machine_count,
    sum(budget_machine_count) OVER (
      ORDER BY period
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    )::integer AS machines_before
  FROM public.cashflow_inputs
  WHERE line_key = 'investment_afs_machines'
    AND period LIKE '2027-%'
    AND budget_machine_count > 0
),
expanded AS (
  SELECT
    tranche.period,
    99 + coalesce(tranche.machines_before, 0) + generated.item_number AS machine_number
  FROM cashflow_tranches tranche
  CROSS JOIN LATERAL generate_series(1, tranche.budget_machine_count)
    AS generated(item_number)
)
INSERT INTO public.afs_budget_machines (
  budget_year,
  machine_number,
  display_name,
  start_period
)
SELECT
  2027,
  machine_number,
  'Budget AFS ' || machine_number,
  period
FROM expanded
ON CONFLICT (budget_year, machine_number) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  start_period = EXCLUDED.start_period;

-- Basiskanalen 2027: webshop x2,2, winkel x1,2, Mollie gelijk en de bestaande
-- 99 AFS'en gelijk. Nieuwe AFS-omzet wordt hieronder per budgetmachine vastgelegd.
WITH source_budgets AS (
  SELECT
    channel,
    period,
    amount,
    '2027-' || split_part(period, '-', 2) AS target_period,
    CASE channel
      WHEN 'shopify_webshop' THEN 2.2
      WHEN 'shopify_winkel' THEN 1.2
      ELSE 1
    END AS multiplier
  FROM public.budgets
  WHERE machine_id IS NULL
    AND period LIKE '2026-%'
    AND channel IN ('shopify_webshop', 'shopify_winkel', 'mollie_facturen', 'bold_afs')
)
UPDATE public.budgets target
SET amount = round(source.amount * source.multiplier, 2)
FROM source_budgets source
WHERE target.channel = source.channel
  AND target.machine_id IS NULL
  AND target.period = source.target_period;

WITH source_budgets AS (
  SELECT
    channel,
    '2027-' || split_part(period, '-', 2) AS target_period,
    round(
      amount * CASE channel
        WHEN 'shopify_webshop' THEN 2.2
        WHEN 'shopify_winkel' THEN 1.2
        ELSE 1
      END,
      2
    ) AS target_amount
  FROM public.budgets
  WHERE machine_id IS NULL
    AND period LIKE '2026-%'
    AND channel IN ('shopify_webshop', 'shopify_winkel', 'mollie_facturen', 'bold_afs')
)
INSERT INTO public.budgets (channel, machine_id, period, amount)
SELECT source.channel, NULL, source.target_period, source.target_amount
FROM source_budgets source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.budgets target
  WHERE target.channel = source.channel
    AND target.machine_id IS NULL
    AND target.period = source.target_period
);

-- Initieel krijgt elke nieuwe machine de gemiddelde 2026-budgetomzet per
-- bestaande AFS (99). Deze bedragen blijven per machine en maand bewerkbaar.
INSERT INTO public.afs_budget_machine_revenues (budget_machine_id, period, amount)
SELECT
  machine.id,
  '2027-' || month_number,
  round(source.amount / 99.0, 2)
FROM public.afs_budget_machines machine
CROSS JOIN (
  SELECT lpad(generate_series(1, 12)::text, 2, '0') AS month_number
) months
JOIN public.budgets source
  ON source.channel = 'bold_afs'
 AND source.machine_id IS NULL
 AND source.period = '2026-' || months.month_number
WHERE machine.budget_year = 2027
  AND ('2027-' || months.month_number) >= machine.start_period
ON CONFLICT (budget_machine_id, period) DO NOTHING;

-- Personeel volgt de kanaalgroei; AFS-auto's volgen het cumulatieve aantal
-- machines; alle overige handmatige kosten krijgen 5% indexatie.
WITH source_lines AS (
  SELECT DISTINCT ON (line.period, line.line_key)
    line.*,
    '2027-' || split_part(line.period, '-', 2) AS target_period
  FROM public.pl_budget_lines line
  WHERE line.period LIKE '2026-%'
    AND line.line_key IN (
      'budget-winkels-huur',
      'budget-winkels-personeel',
      'budget-webshop-personeel',
      'budget-webshop-autos',
      'budget-afs-personeel',
      'budget-afs-autos',
      'budget-hoofdkantoor-personeel',
      'budget-hoofdkantoor-huur',
      'budget-hoofdkantoor-kantoorkosten',
      'budget-hoofdkantoor-autokosten',
      'budget-hoofdkantoor-overige-kosten',
      'budget-hoofdkantoor-management-fees'
    )
  ORDER BY
    line.period,
    line.line_key,
    (line.source_workbook = 'W&V budgetregels') DESC,
    line.updated_at DESC
),
scaled_lines AS (
  SELECT
    source.*,
    CASE source.line_key
      WHEN 'budget-winkels-personeel' THEN 1.2
      WHEN 'budget-webshop-personeel' THEN 2.2
      WHEN 'budget-afs-autos' THEN (
        99 + coalesce((
          SELECT sum(input.budget_machine_count)
          FROM public.cashflow_inputs input
          WHERE input.line_key = 'investment_afs_machines'
            AND input.period LIKE '2027-%'
            AND input.period <= source.target_period
        ), 0)
      ) / 99.0
      ELSE 1.05
    END AS multiplier
  FROM source_lines source
)
INSERT INTO public.pl_budget_lines (
  period,
  budget_year,
  section,
  line_key,
  line_label,
  kind,
  amount,
  source_workbook,
  source_sheet,
  source_label,
  sort_order
)
SELECT
  target_period,
  2027,
  section,
  line_key,
  line_label,
  kind,
  round(amount * multiplier, 2),
  'W&V budgetregels',
  source_sheet,
  source_label,
  sort_order
FROM scaled_lines
ON CONFLICT (source_workbook, period, line_key) DO UPDATE
SET
  amount = EXCLUDED.amount,
  section = EXCLUDED.section,
  line_label = EXCLUDED.line_label,
  source_sheet = EXCLUDED.source_sheet,
  source_label = EXCLUDED.source_label,
  sort_order = EXCLUDED.sort_order;

-- Het gedeelde AFS-aantal stuurt schoonmaak, onderhoud en logistiek aan.
WITH periods AS (
  SELECT
    '2027-' || lpad(generate_series(1, 12)::text, 2, '0') AS period
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
SELECT
  'afs_schoonmaak',
  'AFS - Schoonmaak',
  'amount_per_afs',
  40,
  99 + coalesce((
    SELECT sum(input.budget_machine_count)
    FROM public.cashflow_inputs input
    WHERE input.line_key = 'investment_afs_machines'
      AND input.period LIKE '2027-%'
      AND input.period <= periods.period
  ), 0),
  'cost_of_goods',
  'budget-afs-schoonmaak',
  'AFS - Schoonmaak',
  'Vast bedrag per AFS per maand',
  211,
  periods.period,
  periods.period
FROM periods
ON CONFLICT (driver_key, from_period) DO UPDATE
SET
  amount = EXCLUDED.amount,
  machine_count = EXCLUDED.machine_count,
  to_period = EXCLUDED.to_period;

COMMENT ON TABLE public.afs_budget_machines IS
  'Eenmalige 2027-planningsmachines, vanaf hun cashflow-investeringsmaand.';

COMMENT ON TABLE public.afs_budget_machine_revenues IS
  'Maandelijks bewerkbare omzet per geplande AFS-budgetmachine.';
