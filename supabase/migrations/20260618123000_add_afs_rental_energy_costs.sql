ALTER TABLE public.afs_rental_agreements
  ADD COLUMN IF NOT EXISTS energy_cost_net numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.afs_rental_invoices
  ADD COLUMN IF NOT EXISTS energy_cost_net numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'afs_rental_agreements_energy_cost_positive'
      AND conrelid = 'public.afs_rental_agreements'::regclass
  ) THEN
    ALTER TABLE public.afs_rental_agreements
      ADD CONSTRAINT afs_rental_agreements_energy_cost_positive
      CHECK (energy_cost_net >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'afs_rental_invoices_energy_cost_positive'
      AND conrelid = 'public.afs_rental_invoices'::regclass
  ) THEN
    ALTER TABLE public.afs_rental_invoices
      ADD CONSTRAINT afs_rental_invoices_energy_cost_positive
      CHECK (energy_cost_net >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.afs_rental_agreements.energy_cost_net IS
  'Fixed monthly energy cost amount ex VAT for AFS rental self-billing.';

COMMENT ON COLUMN public.afs_rental_invoices.energy_cost_net IS
  'Frozen monthly energy cost amount ex VAT included on the AFS rental invoice.';
