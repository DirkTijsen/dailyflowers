ALTER TABLE public.afs_rental_invoices
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_to text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_last_error text;

COMMENT ON COLUMN public.afs_rental_invoices.sent_at IS
  'Timestamp of the most recent successful email send for this rental invoice.';

COMMENT ON COLUMN public.afs_rental_invoices.email_to IS
  'Recipient address used for the most recent email send.';

COMMENT ON COLUMN public.afs_rental_invoices.email_subject IS
  'Subject used for the most recent email send.';

COMMENT ON COLUMN public.afs_rental_invoices.email_last_error IS
  'Most recent email delivery error, cleared after a successful send.';
