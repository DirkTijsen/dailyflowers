CREATE TABLE IF NOT EXISTS public.cashflow_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  line_key text NOT NULL,
  actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashflow_inputs_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT cashflow_inputs_actual_amount_check CHECK (actual_amount >= 0),
  CONSTRAINT cashflow_inputs_budget_amount_check CHECK (budget_amount >= 0),
  CONSTRAINT cashflow_inputs_period_line_unique UNIQUE (period, line_key)
);

CREATE INDEX IF NOT EXISTS idx_cashflow_inputs_period
  ON public.cashflow_inputs (period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashflow_inputs TO authenticated;
GRANT ALL ON public.cashflow_inputs TO service_role;

ALTER TABLE public.cashflow_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_inputs_select_auth"
  ON public.cashflow_inputs FOR SELECT TO authenticated USING (true);

CREATE POLICY "cashflow_inputs_write_auth"
  ON public.cashflow_inputs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_cashflow_inputs_updated_at ON public.cashflow_inputs;
CREATE TRIGGER trg_cashflow_inputs_updated_at
  BEFORE UPDATE ON public.cashflow_inputs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.cashflow_inputs IS
  'Manual monthly actual and budget inputs used by the W&V / Cashflow report.';
