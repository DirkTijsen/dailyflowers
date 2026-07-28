-- Schoonmaakkosten zijn direct verbonden aan de geleverde omzet en horen
-- daarom bij de kostprijs van de omzet, zowel in actuals als in het budget.
UPDATE public.gl_accounts
SET
  pl_section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 291 ELSE sort_order END
WHERE
  lower(account_name) LIKE '%schoonmaak%'
  OR lower(COALESCE(classification, '')) LIKE '%schoonmaak%';

UPDATE public.pl_budget_lines
SET
  section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 291 ELSE sort_order END
WHERE
  lower(line_label) LIKE '%schoonmaak%'
  OR lower(source_label) LIKE '%schoonmaak%';

UPDATE public.pl_budget_driver_rules
SET
  section = 'cost_of_goods',
  sort_order = CASE WHEN sort_order < 200 OR sort_order >= 300 THEN 211 ELSE sort_order END
WHERE
  lower(driver_label) LIKE '%schoonmaak%'
  OR lower(line_label) LIKE '%schoonmaak%';
