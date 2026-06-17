CREATE TABLE IF NOT EXISTS public.gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text,
  statement_type text,
  debit_credit text,
  classification text,
  pl_section text NOT NULL DEFAULT 'other',
  revenue_channel public.tx_channel,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_accounts_pl_section_check CHECK (
    pl_section IN (
      'revenue',
      'cost_of_goods',
      'personnel',
      'housing',
      'sales_marketing',
      'general_admin',
      'depreciation',
      'financial',
      'tax',
      'other'
    )
  ),
  CONSTRAINT gl_accounts_revenue_channel_check CHECK (
    revenue_channel IS NULL OR pl_section = 'revenue'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_accounts TO authenticated;
GRANT ALL ON public.gl_accounts TO service_role;

ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_accounts_select_auth"
  ON public.gl_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "gl_accounts_all_auth"
  ON public.gl_accounts FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_section_sort
  ON public.gl_accounts (pl_section, sort_order, account_code);

CREATE TABLE IF NOT EXISTS public.gl_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  external_id text NOT NULL,
  transaction_date date NOT NULL,
  account_id uuid REFERENCES public.gl_accounts(id) ON DELETE SET NULL,
  account_code text NOT NULL,
  description text,
  relation_name text,
  document_number text,
  amount numeric(14,2) NOT NULL,
  debit_amount numeric(14,2),
  credit_amount numeric(14,2),
  import_batch_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_transactions_source_external_unique UNIQUE (source, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_transactions TO authenticated;
GRANT ALL ON public.gl_transactions TO service_role;

ALTER TABLE public.gl_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_transactions_select_auth"
  ON public.gl_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "gl_transactions_all_auth"
  ON public.gl_transactions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gl_transactions_date
  ON public.gl_transactions (transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_gl_transactions_account_date
  ON public.gl_transactions (account_code, transaction_date DESC);

CREATE TABLE IF NOT EXISTS public.pl_settings (
  id text PRIMARY KEY DEFAULT 'default',
  revenue_cutoff_quarter text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pl_settings_revenue_cutoff_quarter_check CHECK (
    revenue_cutoff_quarter IS NULL OR revenue_cutoff_quarter ~ '^\d{4}-Q[1-4]$'
  )
);

INSERT INTO public.pl_settings (id, revenue_cutoff_quarter)
VALUES ('default', NULL)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_settings TO authenticated;
GRANT ALL ON public.pl_settings TO service_role;

ALTER TABLE public.pl_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl_settings_select_auth"
  ON public.pl_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "pl_settings_all_auth"
  ON public.pl_settings FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_gl_accounts_updated_at ON public.gl_accounts;
CREATE TRIGGER trg_gl_accounts_updated_at
  BEFORE UPDATE ON public.gl_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_gl_transactions_updated_at ON public.gl_transactions;
CREATE TRIGGER trg_gl_transactions_updated_at
  BEFORE UPDATE ON public.gl_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pl_settings_updated_at ON public.pl_settings;
CREATE TRIGGER trg_pl_settings_updated_at
  BEFORE UPDATE ON public.pl_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE VIEW public.vw_gl_quarterly_account AS
SELECT
  concat(EXTRACT(YEAR FROM gt.transaction_date)::int, '-Q', EXTRACT(QUARTER FROM gt.transaction_date)::int) AS quarter_key,
  EXTRACT(YEAR FROM gt.transaction_date)::int AS year,
  EXTRACT(QUARTER FROM gt.transaction_date)::int AS quarter,
  gt.account_id,
  gt.account_code,
  COALESCE(ga.account_name, gt.account_code) AS account_name,
  COALESCE(ga.pl_section, 'other') AS pl_section,
  ga.revenue_channel,
  COALESCE(ga.sort_order, 999999) AS sort_order,
  count(*)::int AS entry_count,
  COALESCE(sum(gt.amount), 0) AS amount
FROM public.gl_transactions gt
LEFT JOIN public.gl_accounts ga ON ga.id = gt.account_id
GROUP BY 1, 2, 3, gt.account_id, gt.account_code, ga.account_name, ga.pl_section, ga.revenue_channel, ga.sort_order;

CREATE OR REPLACE VIEW public.vw_gl_monthly_account AS
SELECT
  to_char(date_trunc('month', gt.transaction_date), 'YYYY-MM') AS period,
  concat(EXTRACT(YEAR FROM gt.transaction_date)::int, '-Q', EXTRACT(QUARTER FROM gt.transaction_date)::int) AS quarter_key,
  EXTRACT(YEAR FROM gt.transaction_date)::int AS year,
  EXTRACT(MONTH FROM gt.transaction_date)::int AS month,
  gt.account_id,
  gt.account_code,
  COALESCE(ga.account_name, gt.account_code) AS account_name,
  COALESCE(ga.pl_section, 'other') AS pl_section,
  ga.revenue_channel,
  COALESCE(ga.sort_order, 999999) AS sort_order,
  count(*)::int AS entry_count,
  COALESCE(sum(gt.amount), 0) AS amount
FROM public.gl_transactions gt
LEFT JOIN public.gl_accounts ga ON ga.id = gt.account_id
GROUP BY 1, 2, 3, 4, gt.account_id, gt.account_code, ga.account_name, ga.pl_section, ga.revenue_channel, ga.sort_order;

CREATE OR REPLACE VIEW public.vw_sales_quarterly_channel AS
SELECT
  concat(EXTRACT(YEAR FROM paid_at)::int, '-Q', EXTRACT(QUARTER FROM paid_at)::int) AS quarter_key,
  EXTRACT(YEAR FROM paid_at)::int AS year,
  EXTRACT(QUARTER FROM paid_at)::int AS quarter,
  channel,
  count(*)::int AS tx_count,
  COALESCE(sum(amount_gross), 0) AS gross_total,
  COALESCE(sum(amount_net), 0) AS net_total,
  COALESCE(sum(vat_amount), 0) AS vat_total
FROM public.transactions
WHERE status = 'paid' AND parse_status = 'ok' AND paid_at IS NOT NULL
GROUP BY 1, 2, 3, 4;

GRANT SELECT ON public.vw_gl_quarterly_account TO authenticated;
GRANT SELECT ON public.vw_gl_monthly_account TO authenticated;
GRANT SELECT ON public.vw_sales_quarterly_channel TO authenticated;

ALTER VIEW public.vw_gl_quarterly_account SET (security_invoker = true);
ALTER VIEW public.vw_gl_monthly_account SET (security_invoker = true);
ALTER VIEW public.vw_sales_quarterly_channel SET (security_invoker = true);
