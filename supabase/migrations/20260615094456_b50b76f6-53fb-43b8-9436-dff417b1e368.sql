
CREATE TYPE public.tx_source AS ENUM ('shopify', 'mollie');
CREATE TYPE public.tx_channel AS ENUM ('shopify_webshop', 'shopify_winkel', 'bold_afs');
CREATE TYPE public.tx_status AS ENUM ('paid', 'pending', 'open', 'failed', 'canceled', 'expired', 'refunded', 'partially_refunded', 'authorized', 'other');
CREATE TYPE public.parse_status AS ENUM ('ok', 'parse_error');

CREATE TABLE public.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  afs_number text NOT NULL UNIQUE,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "machines_select_auth" ON public.machines FOR SELECT TO authenticated USING (true);
CREATE POLICY "machines_all_auth" ON public.machines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.vat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric(5,2) NOT NULL UNIQUE,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_rates TO authenticated;
GRANT ALL ON public.vat_rates TO service_role;
ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vat_rates_select_auth" ON public.vat_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "vat_rates_all_auth" ON public.vat_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.vat_rates (rate, label) VALUES (9, 'Laag (9%)'), (21, 'Hoog (21%)');

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  source public.tx_source NOT NULL,
  channel public.tx_channel NOT NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  article_number text,
  product_name text,
  amount_gross numeric(12,2) NOT NULL DEFAULT 0,
  amount_net numeric(12,2),
  vat_amount numeric(12,2),
  vat_rate numeric(5,2),
  discount_amount numeric(12,2),
  invoice_number text,
  status public.tx_status NOT NULL DEFAULT 'other',
  paid_at timestamptz,
  description_raw text,
  invoice_url text,
  raw_payload jsonb,
  parse_status public.parse_status NOT NULL DEFAULT 'ok',
  parse_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_source_external_unique UNIQUE (source, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_select_auth" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "tx_all_auth" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_tx_paid_at ON public.transactions (paid_at DESC);
CREATE INDEX idx_tx_channel_paid_at ON public.transactions (channel, paid_at DESC);
CREATE INDEX idx_tx_machine_paid_at ON public.transactions (machine_id, paid_at DESC);
CREATE INDEX idx_tx_status ON public.transactions (status);
CREATE INDEX idx_tx_parse_status ON public.transactions (parse_status) WHERE parse_status = 'parse_error';
CREATE INDEX idx_tx_invoice ON public.transactions (invoice_number) WHERE invoice_number IS NOT NULL;

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.tx_channel NOT NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budgets_period_format CHECK (period ~ '^\d{4}-\d{2}$')
);
CREATE UNIQUE INDEX budgets_unique_with_machine ON public.budgets (channel, machine_id, period) WHERE machine_id IS NOT NULL;
CREATE UNIQUE INDEX budgets_unique_no_machine ON public.budgets (channel, period) WHERE machine_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_select_auth" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "budgets_all_auth" ON public.budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sync_state (
  channel public.tx_channel PRIMARY KEY,
  last_sweep_at timestamptz,
  last_sweep_status text,
  last_sweep_message text,
  records_processed integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_state TO authenticated;
GRANT ALL ON public.sync_state TO service_role;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_select_auth" ON public.sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_all_auth" ON public.sync_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE VIEW public.vw_monthly_channel AS
SELECT
  to_char(date_trunc('month', paid_at), 'YYYY-MM') AS period,
  channel,
  count(*)::int AS tx_count,
  COALESCE(sum(amount_gross), 0) AS gross_total,
  COALESCE(sum(amount_net), 0) AS net_total,
  COALESCE(sum(vat_amount), 0) AS vat_total
FROM public.transactions
WHERE status = 'paid' AND parse_status = 'ok' AND paid_at IS NOT NULL
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.vw_monthly_machine AS
SELECT
  to_char(date_trunc('month', t.paid_at), 'YYYY-MM') AS period,
  t.channel,
  t.machine_id,
  m.display_name,
  m.afs_number,
  count(*)::int AS tx_count,
  COALESCE(sum(t.amount_gross), 0) AS gross_total,
  COALESCE(sum(t.amount_net), 0) AS net_total,
  COALESCE(sum(t.vat_amount), 0) AS vat_total
FROM public.transactions t
LEFT JOIN public.machines m ON m.id = t.machine_id
WHERE t.status = 'paid' AND t.parse_status = 'ok' AND t.paid_at IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.vw_monthly_vat AS
SELECT
  to_char(date_trunc('month', paid_at), 'YYYY-MM') AS period,
  channel,
  vat_rate,
  count(*)::int AS tx_count,
  COALESCE(sum(amount_gross), 0) AS gross_total,
  COALESCE(sum(amount_net), 0) AS net_total,
  COALESCE(sum(vat_amount), 0) AS vat_total
FROM public.transactions
WHERE status = 'paid' AND parse_status = 'ok' AND paid_at IS NOT NULL AND vat_rate IS NOT NULL
GROUP BY 1, 2, 3;

GRANT SELECT ON public.vw_monthly_channel TO authenticated;
GRANT SELECT ON public.vw_monthly_machine TO authenticated;
GRANT SELECT ON public.vw_monthly_vat TO authenticated;
