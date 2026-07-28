-- De aparte AFS-vulling/logistiekrubriek vervalt. Resterende regels horen
-- voortaan bij de kostprijs omzet.
UPDATE public.gl_accounts
SET
  pl_section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 285 ELSE sort_order END
WHERE pl_section = 'afs_fulfillment_logistics';

UPDATE public.pl_budget_lines
SET
  section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 285 ELSE sort_order END
WHERE section = 'afs_fulfillment_logistics';

-- Deze twee grootboekrekeningen horen bij de algemene kosten.
UPDATE public.gl_accounts
SET
  pl_section = 'general_admin',
  sort_order = CASE WHEN account_code = '4520' THEN 621 ELSE 622 END
WHERE account_code IN ('4520', '4995');
