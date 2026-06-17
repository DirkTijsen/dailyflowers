ALTER TABLE public.afs_rental_invoices
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_queued',
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_body text,
  ADD COLUMN IF NOT EXISTS email_provider text,
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'afs_rental_invoices_email_status_check'
      AND conrelid = 'public.afs_rental_invoices'::regclass
  ) THEN
    ALTER TABLE public.afs_rental_invoices
      ADD CONSTRAINT afs_rental_invoices_email_status_check
      CHECK (email_status IN ('not_queued', 'queued', 'sending', 'sent', 'failed'));
  END IF;
END $$;

UPDATE public.afs_rental_invoices
SET email_status = 'sent'
WHERE sent_at IS NOT NULL
  AND email_status = 'not_queued';

CREATE INDEX IF NOT EXISTS idx_afs_rental_invoices_email_queue
  ON public.afs_rental_invoices (email_status, queued_at)
  WHERE email_status IN ('queued', 'failed');

COMMENT ON COLUMN public.afs_rental_invoices.email_status IS
  'Delivery queue status for the rental invoice email.';

COMMENT ON COLUMN public.afs_rental_invoices.queued_at IS
  'Timestamp when this invoice was last added to the email queue.';

COMMENT ON COLUMN public.afs_rental_invoices.sending_started_at IS
  'Timestamp when the most recent queue processing attempt started.';

COMMENT ON COLUMN public.afs_rental_invoices.email_body IS
  'Email body used for queued invoice delivery.';

COMMENT ON COLUMN public.afs_rental_invoices.email_provider IS
  'Email provider used for delivery, for example gmail.';

COMMENT ON COLUMN public.afs_rental_invoices.email_provider_message_id IS
  'Provider message id returned after successful delivery.';

COMMENT ON COLUMN public.afs_rental_invoices.email_attempts IS
  'Number of email delivery attempts for this invoice.';
