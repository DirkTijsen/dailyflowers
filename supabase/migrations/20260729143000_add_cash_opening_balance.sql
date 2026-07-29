ALTER TABLE public.cashflow_inputs
  DROP CONSTRAINT IF EXISTS cashflow_inputs_actual_amount_check;

ALTER TABLE public.cashflow_inputs
  ADD CONSTRAINT cashflow_inputs_actual_amount_check CHECK (
    actual_amount >= 0 OR line_key = 'cash_opening_balance'
  );

ALTER TABLE public.cashflow_inputs
  DROP CONSTRAINT IF EXISTS cashflow_inputs_budget_amount_check;

ALTER TABLE public.cashflow_inputs
  ADD CONSTRAINT cashflow_inputs_budget_amount_check CHECK (
    budget_amount >= 0 OR line_key = 'cash_opening_balance'
  );

COMMENT ON TABLE public.cashflow_inputs IS
  'Maandelijkse actual- en budgetinputs voor cashflow, inclusief een eventueel negatieve openingsbalans cash.';
