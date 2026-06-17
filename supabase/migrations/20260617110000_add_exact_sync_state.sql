ALTER TABLE public.sync_state
  ALTER COLUMN channel TYPE text USING channel::text;

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES ('exact_gl', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;
