CREATE TABLE IF NOT EXISTS public.mollie_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL UNIQUE,
  mollie_created_at timestamptz,
  mollie_paid_at timestamptz,
  status public.tx_status NOT NULL DEFAULT 'other',
  amount_gross numeric(12,2) NOT NULL DEFAULT 0,
  amount_net numeric(12,2),
  vat_amount numeric(12,2),
  vat_rate numeric(5,2),
  discount_amount numeric(12,2),
  description_raw text,
  parsed_afs_number text,
  parsed_article_number text,
  parsed_invoice_number text,
  parsed_paid_at timestamptz,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  parse_status public.parse_status NOT NULL DEFAULT 'ok',
  parse_error_message text,
  sales_action text NOT NULL DEFAULT 'not_parsed'
    CHECK (sales_action IN ('not_parsed', 'added', 'already_exists')),
  sales_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mollie_transactions TO authenticated;
GRANT ALL ON public.mollie_transactions TO service_role;

ALTER TABLE public.mollie_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mollie_transactions_select_auth"
  ON public.mollie_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "mollie_transactions_all_auth"
  ON public.mollie_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_created
  ON public.mollie_transactions (mollie_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_parse_status
  ON public.mollie_transactions (parse_status);

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_sales_action
  ON public.mollie_transactions (sales_action);

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_invoice
  ON public.mollie_transactions (parsed_invoice_number)
  WHERE parsed_invoice_number IS NOT NULL;

DROP TRIGGER IF EXISTS trg_mollie_transactions_updated_at ON public.mollie_transactions;
CREATE TRIGGER trg_mollie_transactions_updated_at
  BEFORE UPDATE ON public.mollie_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
