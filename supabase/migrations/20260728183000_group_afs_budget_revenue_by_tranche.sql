CREATE TABLE IF NOT EXISTS public.afs_budget_tranche_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashflow_input_id uuid NOT NULL REFERENCES public.cashflow_inputs(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_budget_tranche_revenues_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT afs_budget_tranche_revenues_amount_check CHECK (amount >= 0),
  CONSTRAINT afs_budget_tranche_revenues_input_period_unique
    UNIQUE (cashflow_input_id, period)
);

CREATE INDEX IF NOT EXISTS idx_afs_budget_tranche_revenues_period
  ON public.afs_budget_tranche_revenues (period, cashflow_input_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.afs_budget_tranche_revenues TO authenticated;
GRANT ALL ON public.afs_budget_tranche_revenues TO service_role;

ALTER TABLE public.afs_budget_tranche_revenues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "afs_budget_tranche_revenues_select_auth"
  ON public.afs_budget_tranche_revenues;
CREATE POLICY "afs_budget_tranche_revenues_select_auth"
  ON public.afs_budget_tranche_revenues FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "afs_budget_tranche_revenues_write_auth"
  ON public.afs_budget_tranche_revenues;
CREATE POLICY "afs_budget_tranche_revenues_write_auth"
  ON public.afs_budget_tranche_revenues FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_afs_budget_tranche_revenues_updated_at
  ON public.afs_budget_tranche_revenues;
CREATE TRIGGER trg_afs_budget_tranche_revenues_updated_at
  BEFORE UPDATE ON public.afs_budget_tranche_revenues
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Zet de bestaande omzet per individuele planningsmachine eenmalig om naar
-- één totaalbedrag per cashflow-investeringsmoment/tranche.
INSERT INTO public.afs_budget_tranche_revenues (
  cashflow_input_id,
  period,
  amount
)
SELECT
  input.id,
  revenue.period,
  round(sum(revenue.amount), 2)
FROM public.cashflow_inputs input
JOIN public.afs_budget_machines machine
  ON machine.start_period = input.period
 AND machine.budget_year = split_part(input.period, '-', 1)::integer
JOIN public.afs_budget_machine_revenues revenue
  ON revenue.budget_machine_id = machine.id
WHERE input.line_key = 'investment_afs_machines'
  AND input.budget_machine_count > 0
GROUP BY input.id, revenue.period
ON CONFLICT (cashflow_input_id, period) DO NOTHING;

COMMENT ON TABLE public.afs_budget_tranche_revenues IS
  'Maandelijks bewerkbare totale omzet per AFS-investeringsmoment/tranche.';
