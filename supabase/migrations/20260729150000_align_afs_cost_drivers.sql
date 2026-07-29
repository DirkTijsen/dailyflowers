-- Eén set AFS-aannames voor budget, W&V, scenarioanalyse en exports.
-- Machineaantallen en ingangsperioden blijven ongewijzigd.
UPDATE public.pl_budget_driver_rules
SET
  amount = CASE driver_key
    WHEN 'afs_inkoop' THEN 33.0000
    WHEN 'afs_schoonmaak' THEN 40.0000
    WHEN 'afs_onderhoud' THEN 16.6700
    WHEN 'afs_logistiek' THEN 250.0000
  END,
  calculation_type = CASE
    WHEN driver_key = 'afs_inkoop' THEN 'percentage_of_revenue'
    ELSE 'amount_per_afs'
  END,
  section = 'cost_of_goods',
  source_label = CASE
    WHEN driver_key = 'afs_inkoop' THEN 'Inkoop (% van AFS omzet)'
    ELSE 'Vast bedrag per AFS per maand'
  END
WHERE driver_key IN (
  'afs_inkoop',
  'afs_schoonmaak',
  'afs_onderhoud',
  'afs_logistiek'
);

COMMENT ON TABLE public.pl_budget_driver_rules IS
  'Effectieve W&V-budgetdrivers. AFS: inkoop 33% van omzet; schoonmaak EUR 40, onderhoud EUR 16,67 en logistiek/vulling EUR 250 per machine per maand.';
