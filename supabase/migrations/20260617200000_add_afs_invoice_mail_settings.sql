CREATE TABLE IF NOT EXISTS public.afs_invoice_mail_settings (
  id text PRIMARY KEY DEFAULT 'gmail',
  provider text NOT NULL DEFAULT 'gmail',
  gmail_refresh_token text,
  from_email text,
  connected_email text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_invoice_mail_settings_singleton CHECK (id = 'gmail')
);

INSERT INTO public.afs_invoice_mail_settings (id, provider)
VALUES ('gmail', 'gmail')
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.afs_invoice_mail_settings TO service_role;

ALTER TABLE public.afs_invoice_mail_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_afs_invoice_mail_settings_updated_at
  ON public.afs_invoice_mail_settings;

CREATE TRIGGER trg_afs_invoice_mail_settings_updated_at
  BEFORE UPDATE ON public.afs_invoice_mail_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.afs_invoice_mail_settings IS
  'Server-side mail integration settings for AFS rental invoice delivery.';

COMMENT ON COLUMN public.afs_invoice_mail_settings.gmail_refresh_token IS
  'OAuth refresh token for Gmail API send access. Never expose through REST.';
