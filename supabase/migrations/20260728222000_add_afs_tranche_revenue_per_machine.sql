ALTER TABLE public.afs_budget_tranche_revenues
  ADD COLUMN IF NOT EXISTS amount_per_machine numeric(14,2);

UPDATE public.afs_budget_tranche_revenues revenue
SET amount_per_machine = CASE
  WHEN input.budget_machine_count > 0
    THEN round(revenue.amount / input.budget_machine_count, 2)
  ELSE 0
END
FROM public.cashflow_inputs input
WHERE input.id = revenue.cashflow_input_id
  AND revenue.amount_per_machine IS NULL;

ALTER TABLE public.afs_budget_tranche_revenues
  ALTER COLUMN amount_per_machine SET DEFAULT 0,
  ALTER COLUMN amount_per_machine SET NOT NULL;

ALTER TABLE public.afs_budget_tranche_revenues
  DROP CONSTRAINT IF EXISTS afs_budget_tranche_revenues_amount_per_machine_check;
ALTER TABLE public.afs_budget_tranche_revenues
  ADD CONSTRAINT afs_budget_tranche_revenues_amount_per_machine_check
    CHECK (amount_per_machine >= 0);

CREATE OR REPLACE FUNCTION public.tg_calculate_afs_tranche_revenue_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  machine_count numeric;
BEGIN
  SELECT input.budget_machine_count
  INTO machine_count
  FROM public.cashflow_inputs input
  WHERE input.id = NEW.cashflow_input_id;

  NEW.amount := round(NEW.amount_per_machine * coalesce(machine_count, 0), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_afs_tranche_revenue_total
  ON public.afs_budget_tranche_revenues;
CREATE TRIGGER trg_calculate_afs_tranche_revenue_total
  BEFORE INSERT OR UPDATE OF amount_per_machine, cashflow_input_id
  ON public.afs_budget_tranche_revenues
  FOR EACH ROW EXECUTE FUNCTION public.tg_calculate_afs_tranche_revenue_total();

CREATE OR REPLACE FUNCTION public.tg_refresh_afs_tranche_revenue_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.afs_budget_tranche_revenues
  SET amount = round(amount_per_machine * coalesce(NEW.budget_machine_count, 0), 2)
  WHERE cashflow_input_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_afs_tranche_revenue_totals
  ON public.cashflow_inputs;
CREATE TRIGGER trg_refresh_afs_tranche_revenue_totals
  AFTER UPDATE OF budget_machine_count
  ON public.cashflow_inputs
  FOR EACH ROW
  WHEN (OLD.budget_machine_count IS DISTINCT FROM NEW.budget_machine_count)
  EXECUTE FUNCTION public.tg_refresh_afs_tranche_revenue_totals();

COMMENT ON COLUMN public.afs_budget_tranche_revenues.amount_per_machine IS
  'Maandelijkse omzetinvoer per machine; amount wordt automatisch berekend als aantal machines maal dit bedrag.';
