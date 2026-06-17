CREATE TABLE IF NOT EXISTS public.afs_landlords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invoice_name text,
  email text,
  phone text,
  address_line1 text,
  postal_code text,
  city text,
  country text NOT NULL DEFAULT 'NL',
  kvk_number text,
  vat_number text,
  iban text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afs_landlords TO authenticated;
GRANT ALL ON public.afs_landlords TO service_role;

ALTER TABLE public.afs_landlords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afs_landlords_select_auth"
  ON public.afs_landlords FOR SELECT TO authenticated USING (true);

CREATE POLICY "afs_landlords_write_auth"
  ON public.afs_landlords FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.afs_rental_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  landlord_id uuid NOT NULL REFERENCES public.afs_landlords(id) ON DELETE RESTRICT,
  start_period text NOT NULL,
  end_period text,
  fixed_fee_net numeric(12,2) NOT NULL DEFAULT 0,
  turnover_rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  turnover_threshold_net numeric(12,2) NOT NULL DEFAULT 0,
  invoice_vat_rate numeric(5,2) NOT NULL DEFAULT 21,
  invoice_reference text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_rental_agreements_period_check
    CHECK (start_period ~ '^\d{4}-\d{2}$' AND (end_period IS NULL OR end_period ~ '^\d{4}-\d{2}$')),
  CONSTRAINT afs_rental_agreements_period_order
    CHECK (end_period IS NULL OR end_period >= start_period),
  CONSTRAINT afs_rental_agreements_amounts_positive
    CHECK (
      fixed_fee_net >= 0
      AND turnover_rate_percent >= 0
      AND turnover_threshold_net >= 0
      AND invoice_vat_rate >= 0
    ),
  CONSTRAINT afs_rental_agreements_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_afs_rental_agreements_machine_period
  ON public.afs_rental_agreements (machine_id, start_period, end_period);

CREATE INDEX IF NOT EXISTS idx_afs_rental_agreements_landlord
  ON public.afs_rental_agreements (landlord_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afs_rental_agreements TO authenticated;
GRANT ALL ON public.afs_rental_agreements TO service_role;

ALTER TABLE public.afs_rental_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afs_rental_agreements_select_auth"
  ON public.afs_rental_agreements FOR SELECT TO authenticated USING (true);

CREATE POLICY "afs_rental_agreements_write_auth"
  ON public.afs_rental_agreements FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.afs_rental_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES public.afs_rental_agreements(id) ON DELETE SET NULL,
  landlord_id uuid REFERENCES public.afs_landlords(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date,
  turnover_net numeric(12,2) NOT NULL DEFAULT 0,
  fixed_fee_net numeric(12,2) NOT NULL DEFAULT 0,
  turnover_rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  turnover_threshold_net numeric(12,2) NOT NULL DEFAULT 0,
  variable_fee_net numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_net numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 21,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_gross numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT afs_rental_invoices_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT afs_rental_invoices_amounts_positive
    CHECK (
      turnover_net >= 0
      AND fixed_fee_net >= 0
      AND turnover_rate_percent >= 0
      AND turnover_threshold_net >= 0
      AND variable_fee_net >= 0
      AND subtotal_net >= 0
      AND vat_rate >= 0
      AND vat_amount >= 0
      AND total_gross >= 0
    ),
  CONSTRAINT afs_rental_invoices_status_check
    CHECK (status IN ('draft', 'sent', 'paid', 'canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS afs_rental_invoices_invoice_number_unique
  ON public.afs_rental_invoices (invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS afs_rental_invoices_one_open_per_machine_period
  ON public.afs_rental_invoices (period, machine_id)
  WHERE status <> 'canceled' AND machine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_afs_rental_invoices_period
  ON public.afs_rental_invoices (period DESC);

CREATE INDEX IF NOT EXISTS idx_afs_rental_invoices_landlord
  ON public.afs_rental_invoices (landlord_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.afs_rental_invoices TO authenticated;
GRANT ALL ON public.afs_rental_invoices TO service_role;

ALTER TABLE public.afs_rental_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afs_rental_invoices_select_auth"
  ON public.afs_rental_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "afs_rental_invoices_write_auth"
  ON public.afs_rental_invoices FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_afs_landlords_updated_at ON public.afs_landlords;
CREATE TRIGGER trg_afs_landlords_updated_at
  BEFORE UPDATE ON public.afs_landlords
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_afs_rental_agreements_updated_at ON public.afs_rental_agreements;
CREATE TRIGGER trg_afs_rental_agreements_updated_at
  BEFORE UPDATE ON public.afs_rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_afs_rental_invoices_updated_at ON public.afs_rental_invoices;
CREATE TRIGGER trg_afs_rental_invoices_updated_at
  BEFORE UPDATE ON public.afs_rental_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.afs_landlords IS
  'Landlords for AFS machines, used as invoice sender details for rental invoicing.';

COMMENT ON TABLE public.afs_rental_agreements IS
  'Rental agreements per AFS machine: fixed monthly rent plus optional turnover-based component.';

COMMENT ON TABLE public.afs_rental_invoices IS
  'Frozen rental invoice calculations per AFS machine and period, including invoice number and status.';
