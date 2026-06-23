ALTER TABLE public.gl_accounts
  DROP CONSTRAINT IF EXISTS gl_accounts_pl_section_check;

ALTER TABLE public.gl_accounts
  ADD CONSTRAINT gl_accounts_pl_section_check CHECK (
    pl_section IN (
      'revenue',
      'cost_of_goods',
      'afs_fulfillment_logistics',
      'personnel',
      'housing',
      'sales_marketing',
      'general_admin',
      'depreciation',
      'financial',
      'tax',
      'other'
    )
  );

ALTER TABLE public.pl_budget_lines
  DROP CONSTRAINT IF EXISTS pl_budget_lines_section_check;

ALTER TABLE public.pl_budget_lines
  ADD CONSTRAINT pl_budget_lines_section_check CHECK (
    section IN (
      'revenue',
      'cost_of_goods',
      'afs_fulfillment_logistics',
      'personnel',
      'housing',
      'sales_marketing',
      'general_admin',
      'depreciation',
      'financial',
      'tax',
      'other'
    )
  );

UPDATE public.gl_accounts
SET
  pl_section = 'afs_fulfillment_logistics',
  sort_order = 250
WHERE account_code = '7600';
