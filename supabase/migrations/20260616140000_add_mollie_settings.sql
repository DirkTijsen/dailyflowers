CREATE TABLE public.mollie_settings (
  id text PRIMARY KEY DEFAULT 'default',
  api_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mollie_settings_singleton CHECK (id = 'default')
);

GRANT INSERT, UPDATE, DELETE ON public.mollie_settings TO authenticated;
GRANT SELECT (id, active, created_at, updated_at) ON public.mollie_settings TO authenticated;
GRANT ALL ON public.mollie_settings TO service_role;

ALTER TABLE public.mollie_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mollie_settings_insert_auth"
  ON public.mollie_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND id = 'default');

CREATE POLICY "mollie_settings_update_auth"
  ON public.mollie_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL AND id = 'default');

CREATE POLICY "mollie_settings_delete_auth"
  ON public.mollie_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_mollie_settings_updated_at
  BEFORE UPDATE ON public.mollie_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE VIEW public.mollie_settings_status AS
SELECT
  id,
  active,
  length(trim(api_key)) > 0 AS api_key_configured,
  created_at,
  updated_at
FROM public.mollie_settings
WHERE id = 'default';

GRANT SELECT ON public.mollie_settings_status TO authenticated;
