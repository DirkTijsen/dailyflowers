CREATE TABLE IF NOT EXISTS public.app_migration_markers (
  marker_key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_migration_markers
    WHERE marker_key = '20260708115000_use_afs_machine_count_as_override'
  ) THEN
    UPDATE public.pl_budget_driver_rules
    SET machine_count = NULL
    WHERE driver_key IN ('afs_schoonmaak', 'afs_onderhoud', 'afs_logistiek')
      AND calculation_type = 'amount_per_afs'
      AND machine_count IS NOT NULL;

    INSERT INTO public.app_migration_markers (marker_key)
    VALUES ('20260708115000_use_afs_machine_count_as_override');
  END IF;
END $$;

COMMENT ON COLUMN public.pl_budget_driver_rules.machine_count IS
  'Manual AFS count override for amount_per_afs drivers. NULL means the app should use the current standard active AFS count.';
