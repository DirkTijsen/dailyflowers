CREATE TABLE IF NOT EXISTS public.cashflow_afs_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_number integer NOT NULL UNIQUE,
  reference_machine_count integer NOT NULL DEFAULT 1,
  afs_amount numeric(14,2) NOT NULL DEFAULT 0,
  roofs_140_amount numeric(14,2) NOT NULL DEFAULT 0,
  shipping_amount numeric(14,2) NOT NULL DEFAULT 0,
  quality_check_amount numeric(14,2) NOT NULL DEFAULT 0,
  installation_amount numeric(14,2) NOT NULL DEFAULT 0,
  kpn_mollie_amount numeric(14,2) NOT NULL DEFAULT 0,
  location_renovation_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashflow_afs_blocks_number_check CHECK (block_number > 0),
  CONSTRAINT cashflow_afs_blocks_machine_count_check CHECK (reference_machine_count > 0),
  CONSTRAINT cashflow_afs_blocks_amounts_check CHECK (
    afs_amount >= 0
    AND roofs_140_amount >= 0
    AND shipping_amount >= 0
    AND quality_check_amount >= 0
    AND installation_amount >= 0
    AND kpn_mollie_amount >= 0
    AND location_renovation_amount >= 0
  )
);

INSERT INTO public.cashflow_afs_blocks (block_number)
VALUES (1)
ON CONFLICT (block_number) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashflow_afs_blocks TO authenticated;
GRANT ALL ON public.cashflow_afs_blocks TO service_role;

ALTER TABLE public.cashflow_afs_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_afs_blocks_select_auth"
  ON public.cashflow_afs_blocks FOR SELECT TO authenticated USING (true);

CREATE POLICY "cashflow_afs_blocks_write_auth"
  ON public.cashflow_afs_blocks FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_cashflow_afs_blocks_updated_at ON public.cashflow_afs_blocks;
CREATE TRIGGER trg_cashflow_afs_blocks_updated_at
  BEFORE UPDATE ON public.cashflow_afs_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.cashflow_inputs
  ADD COLUMN IF NOT EXISTS actual_machine_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_machine_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_afs_block_id uuid REFERENCES public.cashflow_afs_blocks(id),
  ADD COLUMN IF NOT EXISTS budget_afs_block_id uuid REFERENCES public.cashflow_afs_blocks(id);

ALTER TABLE public.cashflow_inputs
  DROP CONSTRAINT IF EXISTS cashflow_inputs_actual_machine_count_check;
ALTER TABLE public.cashflow_inputs
  ADD CONSTRAINT cashflow_inputs_actual_machine_count_check CHECK (actual_machine_count >= 0);

ALTER TABLE public.cashflow_inputs
  DROP CONSTRAINT IF EXISTS cashflow_inputs_budget_machine_count_check;
ALTER TABLE public.cashflow_inputs
  ADD CONSTRAINT cashflow_inputs_budget_machine_count_check CHECK (budget_machine_count >= 0);

COMMENT ON TABLE public.cashflow_afs_blocks IS
  'Reusable AFS investment packages. Monthly cashflow inputs select a block and multiply its per-machine amount by a quantity.';
