CREATE TABLE IF NOT EXISTS public.app_data_maintenance_log (
  key text PRIMARY KEY,
  executed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_data_maintenance_log
    WHERE key = '20260617214000_clear_afs_huur_test_data'
  ) THEN
    DELETE FROM public.afs_rental_invoices;
    DELETE FROM public.afs_rental_agreements;
    DELETE FROM public.afs_landlords;

    INSERT INTO public.app_data_maintenance_log (key, notes)
    VALUES (
      '20260617214000_clear_afs_huur_test_data',
      'Cleared AFS rental test invoices, agreements, and landlords after test phase.'
    );
  END IF;
END $$;
