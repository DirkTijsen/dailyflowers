ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS location_type text;

UPDATE public.machines
SET location_type = CASE
  WHEN lower(display_name) IN ('weg') OR lower(display_name) LIKE '%test machine%' OR lower(display_name) LIKE '%china test%' THEN 'onbekend'
  WHEN lower(display_name) LIKE '%haga%' OR lower(display_name) LIKE '%ziekenhuis%' THEN 'ziekenhuis'
  WHEN lower(display_name) LIKE '%makro%' THEN 'groothandel'
  WHEN lower(display_name) LIKE '%gamma%' OR lower(display_name) LIKE '%karwei%' THEN 'bouwmarkt'
  WHEN lower(display_name) LIKE '%loogman%' OR lower(display_name) LIKE '%autowas%' THEN 'carwash'
  WHEN lower(display_name) LIKE '%novotel%' OR lower(display_name) LIKE '%innside%' OR lower(display_name) LIKE '%melia%' THEN 'hotel'
  WHEN lower(display_name) LIKE '%rtha%' OR lower(display_name) LIKE '%airport%' THEN 'luchthaven'
  WHEN lower(display_name) LIKE 'station %' THEN 'ov_station'
  WHEN lower(display_name) LIKE '%bataviastad%' OR lower(display_name) LIKE '%designer outlet%' OR lower(display_name) LIKE '%style outlet%' THEN 'outlet'
  WHEN lower(display_name) LIKE '%esso%' OR lower(display_name) LIKE '%shell%' OR lower(display_name) LIKE '%texaco%' OR lower(display_name) LIKE '%tinq%' OR lower(display_name) LIKE '%avia%' OR lower(display_name) LIKE '%tankstation%' OR lower(display_name) LIKE '%fuel up%' OR lower(display_name) LIKE '%berkman%' OR lower(display_name) LIKE '%t-energy%' OR lower(display_name) LIKE '%t energy%' OR lower(display_name) LIKE '%honswijck%' THEN 'tankstation'
  WHEN lower(display_name) LIKE '%the valley%' THEN 'kantoor_mixed_use'
  WHEN lower(display_name) LIKE '%pier%' OR lower(display_name) LIKE '%palace promenade%' THEN 'recreatie'
  WHEN lower(display_name) LIKE '%kalverstraat%' THEN 'winkelstraat'
  WHEN lower(display_name) LIKE '%alexandrium%' OR lower(display_name) LIKE '%arendshof%' OR lower(display_name) LIKE '%bison spoor%' OR lower(display_name) LIKE '%cityplaza%' OR lower(display_name) LIKE '%barones%' OR lower(display_name) LIKE '%heuvel galerie%' OR lower(display_name) LIKE '%hovenpassage%' OR lower(display_name) LIKE '%tuinen%' OR lower(display_name) LIKE '%emma passage%' OR lower(display_name) LIKE '%hal van hilversum%' OR lower(display_name) LIKE '%hilvertshof%' OR lower(display_name) LIKE '%hoofdpoort%' OR lower(display_name) LIKE '%hoog catharijne%' OR lower(display_name) LIKE '%koperwiek%' OR lower(display_name) LIKE '%kroonpassage%' OR lower(display_name) LIKE '%leidsche rijn centrum%' OR lower(display_name) LIKE '%lusthofpassage%' OR lower(display_name) LIKE '%middenwaard%' OR lower(display_name) LIKE '%sc overvecht%' OR lower(display_name) LIKE '%scheepjeshof%' OR lower(display_name) LIKE '%stadshart%' OR lower(display_name) LIKE '%villa arena%' OR lower(display_name) LIKE '%westfield%' OR lower(display_name) LIKE '%winkelcentrum%' OR lower(display_name) LIKE '%winkencentrum%' OR lower(display_name) LIKE '%zeewijkplein%' OR lower(display_name) LIKE '%zoetermeer locatie%' THEN 'winkelcentrum'
  ELSE 'onbekend'
END
WHERE location_type IS NULL;

ALTER TABLE public.machines
  ALTER COLUMN location_type SET DEFAULT 'onbekend',
  ALTER COLUMN location_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'machines_location_type_check'
      AND conrelid = 'public.machines'::regclass
  ) THEN
    ALTER TABLE public.machines
      ADD CONSTRAINT machines_location_type_check
      CHECK (
        location_type IN (
          'winkelcentrum',
          'outlet',
          'tankstation',
          'groothandel',
          'ziekenhuis',
          'bouwmarkt',
          'carwash',
          'hotel',
          'luchthaven',
          'ov_station',
          'winkelstraat',
          'kantoor_mixed_use',
          'recreatie',
          'onbekend'
        )
      );
  END IF;
END $$;

CREATE OR REPLACE VIEW public.vw_monthly_machine AS
SELECT
  to_char(date_trunc('month', t.paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
  t.channel,
  t.machine_id,
  m.display_name,
  m.afs_number,
  count(*)::int AS tx_count,
  COALESCE(sum(t.amount_gross), 0) AS gross_total,
  COALESCE(sum(COALESCE(t.amount_net, t.amount_gross - COALESCE(t.vat_amount, 0), 0)), 0) AS net_total,
  COALESCE(sum(t.vat_amount), 0) AS vat_total,
  m.location_type
FROM public.transactions t
LEFT JOIN public.machines m ON m.id = t.machine_id
WHERE t.status = 'paid' AND t.parse_status = 'ok' AND t.paid_at IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 10;

GRANT SELECT ON public.vw_monthly_machine TO authenticated;
ALTER VIEW public.vw_monthly_machine SET (security_invoker = true);
