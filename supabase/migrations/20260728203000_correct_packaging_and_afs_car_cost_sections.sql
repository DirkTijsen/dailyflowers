-- Houd de kostencategorieën gelijk in actuals en budget:
-- verpakkingsmateriaal hoort bij de kostprijs van de omzet;
-- AFS-autokosten horen bij de algemene kosten.

UPDATE public.gl_accounts
SET
  pl_section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 290 ELSE sort_order END
WHERE lower(account_name) LIKE '%verpakk%';

UPDATE public.gl_accounts
SET
  pl_section = 'general_admin',
  sort_order = CASE WHEN sort_order < 600 OR sort_order >= 700 THEN 620 ELSE sort_order END
WHERE
  lower(account_name) LIKE '%auto%'
  AND (
    lower(account_name) LIKE '%afs%'
    OR lower(COALESCE(classification, '')) LIKE '%afs%'
  );

UPDATE public.gl_accounts
SET
  pl_section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 280 ELSE sort_order END
WHERE
  account_code = '7600'
  OR lower(account_name) LIKE '%uitbesteed werk%';

UPDATE public.pl_budget_lines
SET
  section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 290 ELSE sort_order END
WHERE
  lower(line_label) LIKE '%verpakk%'
  OR lower(source_label) LIKE '%verpakk%';

UPDATE public.pl_budget_lines
SET
  section = 'general_admin',
  sort_order = CASE WHEN sort_order < 600 OR sort_order >= 700 THEN 620 ELSE sort_order END
WHERE
  line_key = 'budget-afs-autos'
  OR (
    lower(line_label) LIKE '%afs%'
    AND lower(line_label) LIKE '%auto%'
  );

UPDATE public.pl_budget_lines
SET
  section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 280 ELSE sort_order END
WHERE
  lower(line_label) LIKE '%uitbesteed werk%'
  OR lower(source_label) LIKE '%uitbesteed werk%';
