CREATE OR REPLACE FUNCTION public.parse_mollie_legacy_bold_timestamp(description text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  month_number int;
  offset_hours int;
BEGIN
  parts := regexp_match(
    coalesce(description, ''),
    '^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([0-9]{1,2})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s+(CET|CEST)\s+([0-9]{4})$'
  );

  IF parts IS NULL THEN
    RETURN NULL;
  END IF;

  month_number := CASE parts[2]
    WHEN 'Jan' THEN 1
    WHEN 'Feb' THEN 2
    WHEN 'Mar' THEN 3
    WHEN 'Apr' THEN 4
    WHEN 'May' THEN 5
    WHEN 'Jun' THEN 6
    WHEN 'Jul' THEN 7
    WHEN 'Aug' THEN 8
    WHEN 'Sep' THEN 9
    WHEN 'Oct' THEN 10
    WHEN 'Nov' THEN 11
    WHEN 'Dec' THEN 12
  END;

  offset_hours := CASE parts[7] WHEN 'CEST' THEN 2 ELSE 1 END;

  RETURN make_timestamptz(
    parts[8]::int,
    month_number,
    parts[3]::int,
    parts[4]::int,
    parts[5]::int,
    parts[6]::double precision,
    'UTC'
  ) - make_interval(hours => offset_hours);
END;
$$;

ALTER TABLE public.mollie_transactions
  ADD COLUMN IF NOT EXISTS legacy_bold_at timestamptz;

UPDATE public.mollie_transactions
SET legacy_bold_at = public.parse_mollie_legacy_bold_timestamp(description_raw)
WHERE legacy_bold_at IS DISTINCT FROM public.parse_mollie_legacy_bold_timestamp(description_raw);

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_legacy_bold_at
  ON public.mollie_transactions (legacy_bold_at)
  WHERE legacy_bold_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mollie_transactions_status_legacy_amount
  ON public.mollie_transactions (status, legacy_bold_at, amount_gross)
  WHERE legacy_bold_at IS NOT NULL;

WITH legacy_rows AS (
  SELECT
    id,
    'bold-historical-' || substring(
      md5(concat_ws(
        '|',
        coalesce(raw_payload->'original'->>'Factuurnummer', ''),
        coalesce(raw_payload->'original'->>'Art. nr.', ''),
        coalesce(raw_payload->'original'->>'Productnaam', ''),
        coalesce(raw_payload->'original'->>'Prijs incl.', ''),
        coalesce(raw_payload->'original'->>'Transactiestatus', ''),
        coalesce(raw_payload->'original'->>'Machine', ''),
        coalesce(raw_payload->'original'->>'Transactiedatum', ''),
        coalesce(raw_payload->'original'->>'Naam korting', '')
      )),
      1,
      16
    ) AS base_external_id
  FROM public.transactions
  WHERE source = 'mollie'
    AND channel = 'bold_afs'
    AND raw_payload->>'import_source' = 'bold_historical_csv'
),
ranked_legacy_rows AS (
  SELECT
    id,
    base_external_id,
    count(*) OVER (PARTITION BY base_external_id) AS duplicate_count,
    row_number() OVER (PARTITION BY base_external_id ORDER BY id) AS duplicate_number
  FROM legacy_rows
)
UPDATE public.transactions t
SET external_id = 'bold-historical-migrating-' || t.id::text
FROM ranked_legacy_rows r
WHERE t.id = r.id;

WITH legacy_rows AS (
  SELECT
    id,
    'bold-historical-' || substring(
      md5(concat_ws(
        '|',
        coalesce(raw_payload->'original'->>'Factuurnummer', ''),
        coalesce(raw_payload->'original'->>'Art. nr.', ''),
        coalesce(raw_payload->'original'->>'Productnaam', ''),
        coalesce(raw_payload->'original'->>'Prijs incl.', ''),
        coalesce(raw_payload->'original'->>'Transactiestatus', ''),
        coalesce(raw_payload->'original'->>'Machine', ''),
        coalesce(raw_payload->'original'->>'Transactiedatum', ''),
        coalesce(raw_payload->'original'->>'Naam korting', '')
      )),
      1,
      16
    ) AS base_external_id
  FROM public.transactions
  WHERE source = 'mollie'
    AND channel = 'bold_afs'
    AND raw_payload->>'import_source' = 'bold_historical_csv'
),
ranked_legacy_rows AS (
  SELECT
    id,
    base_external_id,
    count(*) OVER (PARTITION BY base_external_id) AS duplicate_count,
    row_number() OVER (PARTITION BY base_external_id ORDER BY id) AS duplicate_number
  FROM legacy_rows
)
UPDATE public.transactions t
SET external_id = CASE
  WHEN r.duplicate_count > 1 THEN r.base_external_id || '-' || r.duplicate_number::text
  ELSE r.base_external_id
END
FROM ranked_legacy_rows r
WHERE t.id = r.id;

DROP VIEW IF EXISTS public.vw_bold_mollie_reconciliation_issues;
DROP VIEW IF EXISTS public.vw_bold_mollie_monthly_reconciliation;

CREATE OR REPLACE VIEW public.vw_bold_mollie_monthly_reconciliation AS
WITH bold_coverage AS (
  SELECT
    min(paid_at) AS min_paid_at,
    max(paid_at) AS max_paid_at
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND raw_payload->>'import_source' = 'bold_historical_csv'
    AND paid_at IS NOT NULL
),
sales_paid AS (
  SELECT
    id,
    to_char(paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    date_trunc('minute', paid_at) AS match_minute,
    amount_gross::numeric(12,2) AS amount_gross
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
    AND amount_gross > 0
),
sales_zero_paid AS (
  SELECT
    to_char(paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS sales_zero_paid_count
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
    AND amount_gross = 0
  GROUP BY 1
),
mollie_base AS (
  SELECT mt.*
  FROM public.mollie_transactions mt
),
mollie_paid AS (
  SELECT
    mt.id,
    mt.payment_id,
    to_char(mt.legacy_bold_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    date_trunc('minute', mt.legacy_bold_at) AS match_minute,
    mt.amount_gross::numeric(12,2) AS amount_gross
  FROM mollie_base mt
  CROSS JOIN bold_coverage bc
  WHERE mt.status = 'paid'
    AND mt.amount_gross > 0
    AND mt.legacy_bold_at IS NOT NULL
    AND (bc.min_paid_at IS NULL OR mt.legacy_bold_at >= bc.min_paid_at)
    AND (bc.max_paid_at IS NULL OR mt.legacy_bold_at <= bc.max_paid_at)
),
sales_groups AS (
  SELECT
    period,
    match_minute,
    amount_gross,
    count(*)::int AS sales_count
  FROM sales_paid
  GROUP BY 1, 2, 3
),
mollie_groups AS (
  SELECT
    period,
    match_minute,
    amount_gross,
    count(*)::int AS mollie_count
  FROM mollie_paid
  GROUP BY 1, 2, 3
),
match_groups AS (
  SELECT
    coalesce(s.period, m.period) AS period,
    coalesce(s.amount_gross, m.amount_gross)::numeric(12,2) AS amount_gross,
    coalesce(s.sales_count, 0) AS sales_count,
    coalesce(m.mollie_count, 0) AS mollie_count
  FROM sales_groups s
  FULL JOIN mollie_groups m
    ON m.period = s.period
   AND m.match_minute = s.match_minute
   AND m.amount_gross = s.amount_gross
),
match_summary AS (
  SELECT
    period,
    sum(sales_count)::int AS sales_paid_count,
    sum(mollie_count)::int AS mollie_paid_count,
    sum(least(sales_count, mollie_count))::int AS matched_paid_count,
    sum(greatest(sales_count - mollie_count, 0))::int AS bold_unmatched_paid_count,
    sum(greatest(mollie_count - sales_count, 0))::int AS mollie_unmatched_paid_count,
    sum((sales_count * amount_gross))::numeric(12,2) AS sales_paid_gross,
    sum((mollie_count * amount_gross))::numeric(12,2) AS mollie_paid_gross,
    sum((least(sales_count, mollie_count) * amount_gross))::numeric(12,2) AS matched_paid_gross,
    sum((greatest(sales_count - mollie_count, 0) * amount_gross))::numeric(12,2) AS bold_unmatched_paid_gross,
    sum((greatest(mollie_count - sales_count, 0) * amount_gross))::numeric(12,2) AS mollie_unmatched_paid_gross
  FROM match_groups
  GROUP BY 1
),
sales_all AS (
  SELECT
    to_char(paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS sales_all_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS sales_all_gross
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
  GROUP BY 1
),
mollie_all AS (
  SELECT
    to_char(coalesce(legacy_bold_at, mollie_paid_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS mollie_all_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS mollie_all_gross,
    count(*) FILTER (WHERE parse_status = 'ok')::int AS mollie_parsed_count,
    count(*) FILTER (WHERE parse_status = 'parse_error')::int AS mollie_parse_error_count,
    count(*) FILTER (WHERE sales_action IN ('added', 'already_exists'))::int AS mollie_linked_sales_count,
    count(*) FILTER (WHERE sales_action = 'added')::int AS mollie_added_sales_count,
    count(*) FILTER (WHERE sales_action = 'already_exists')::int AS mollie_existing_sales_count,
    count(*) FILTER (WHERE sales_action = 'not_parsed')::int AS mollie_not_added_count
  FROM mollie_base
  WHERE coalesce(legacy_bold_at, mollie_paid_at, mollie_created_at) IS NOT NULL
  GROUP BY 1
),
mollie_non_bold_paid AS (
  SELECT
    to_char(coalesce(mollie_paid_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS mollie_non_bold_paid_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS mollie_non_bold_paid_gross
  FROM mollie_base
  CROSS JOIN bold_coverage bc
  WHERE status = 'paid'
    AND amount_gross > 0
    AND legacy_bold_at IS NULL
    AND coalesce(mollie_paid_at, mollie_created_at) IS NOT NULL
    AND (bc.min_paid_at IS NULL OR coalesce(mollie_paid_at, mollie_created_at) >= bc.min_paid_at)
    AND (bc.max_paid_at IS NULL OR coalesce(mollie_paid_at, mollie_created_at) <= bc.max_paid_at)
  GROUP BY 1
),
mollie_outside_bold_paid AS (
  SELECT
    to_char(legacy_bold_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    count(*)::int AS mollie_outside_bold_paid_count,
    coalesce(sum(amount_gross), 0)::numeric(12,2) AS mollie_outside_bold_paid_gross
  FROM mollie_base
  CROSS JOIN bold_coverage bc
  WHERE status = 'paid'
    AND amount_gross > 0
    AND legacy_bold_at IS NOT NULL
    AND bc.max_paid_at IS NOT NULL
    AND legacy_bold_at > bc.max_paid_at
  GROUP BY 1
),
mollie_duplicate_candidates AS (
  SELECT
    period,
    sum(extra_count)::int AS mollie_duplicate_candidate_count
  FROM (
    SELECT
      to_char(coalesce(legacy_bold_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
      count(*) - 1 AS extra_count
    FROM mollie_base
    WHERE coalesce(legacy_bold_at, mollie_created_at) IS NOT NULL
    GROUP BY 1, description_raw, amount_gross, status, mollie_created_at, legacy_bold_at
    HAVING count(*) > 1
  ) dup
  GROUP BY 1
),
periods AS (
  SELECT period FROM match_summary
  UNION SELECT period FROM sales_all
  UNION SELECT period FROM mollie_all
  UNION SELECT period FROM sales_zero_paid
  UNION SELECT period FROM mollie_non_bold_paid
  UNION SELECT period FROM mollie_outside_bold_paid
  UNION SELECT period FROM mollie_duplicate_candidates
)
SELECT
  p.period,
  coalesce(ms.sales_paid_count, 0) AS sales_paid_count,
  coalesce(ms.mollie_paid_count, 0) AS mollie_paid_count,
  coalesce(ms.sales_paid_count, 0) - coalesce(ms.mollie_paid_count, 0) AS paid_count_diff,
  coalesce(ms.sales_paid_gross, 0)::numeric(12,2) AS sales_paid_gross,
  coalesce(ms.mollie_paid_gross, 0)::numeric(12,2) AS mollie_paid_gross,
  (coalesce(ms.sales_paid_gross, 0) - coalesce(ms.mollie_paid_gross, 0))::numeric(12,2) AS paid_gross_diff,
  coalesce(sa.sales_all_count, 0) AS sales_all_count,
  coalesce(ma.mollie_all_count, 0) AS mollie_all_count,
  coalesce(sa.sales_all_count, 0) - coalesce(ma.mollie_all_count, 0) AS all_count_diff,
  coalesce(sa.sales_all_gross, 0)::numeric(12,2) AS sales_all_gross,
  coalesce(ma.mollie_all_gross, 0)::numeric(12,2) AS mollie_all_gross,
  (coalesce(sa.sales_all_gross, 0) - coalesce(ma.mollie_all_gross, 0))::numeric(12,2) AS all_gross_diff,
  coalesce(ma.mollie_parsed_count, 0) AS mollie_parsed_count,
  coalesce(ma.mollie_parse_error_count, 0) AS mollie_parse_error_count,
  coalesce(ma.mollie_linked_sales_count, 0) AS mollie_linked_sales_count,
  coalesce(ma.mollie_added_sales_count, 0) AS mollie_added_sales_count,
  coalesce(ma.mollie_existing_sales_count, 0) AS mollie_existing_sales_count,
  coalesce(ma.mollie_not_added_count, 0) AS mollie_not_added_count,
  coalesce(ms.matched_paid_count, 0) AS matched_paid_count,
  coalesce(ms.matched_paid_gross, 0)::numeric(12,2) AS matched_paid_gross,
  coalesce(ms.bold_unmatched_paid_count, 0) AS bold_unmatched_paid_count,
  coalesce(ms.bold_unmatched_paid_gross, 0)::numeric(12,2) AS bold_unmatched_paid_gross,
  coalesce(ms.mollie_unmatched_paid_count, 0) AS mollie_unmatched_paid_count,
  coalesce(ms.mollie_unmatched_paid_gross, 0)::numeric(12,2) AS mollie_unmatched_paid_gross,
  coalesce(sz.sales_zero_paid_count, 0) AS sales_zero_paid_count,
  coalesce(mnb.mollie_non_bold_paid_count, 0) AS mollie_non_bold_paid_count,
  coalesce(mnb.mollie_non_bold_paid_gross, 0)::numeric(12,2) AS mollie_non_bold_paid_gross,
  coalesce(mob.mollie_outside_bold_paid_count, 0) AS mollie_outside_bold_paid_count,
  coalesce(mob.mollie_outside_bold_paid_gross, 0)::numeric(12,2) AS mollie_outside_bold_paid_gross,
  coalesce(mdc.mollie_duplicate_candidate_count, 0) AS mollie_duplicate_candidate_count,
  (
    coalesce(ms.bold_unmatched_paid_count, 0) = 0
    AND coalesce(ms.mollie_unmatched_paid_count, 0) = 0
    AND abs(coalesce(ms.bold_unmatched_paid_gross, 0)) < 0.01
    AND abs(coalesce(ms.mollie_unmatched_paid_gross, 0)) < 0.01
  ) AS paid_reconciled
FROM periods p
LEFT JOIN match_summary ms ON ms.period = p.period
LEFT JOIN sales_all sa ON sa.period = p.period
LEFT JOIN mollie_all ma ON ma.period = p.period
LEFT JOIN sales_zero_paid sz ON sz.period = p.period
LEFT JOIN mollie_non_bold_paid mnb ON mnb.period = p.period
LEFT JOIN mollie_outside_bold_paid mob ON mob.period = p.period
LEFT JOIN mollie_duplicate_candidates mdc ON mdc.period = p.period;

CREATE OR REPLACE VIEW public.vw_bold_mollie_reconciliation_issues AS
WITH bold_coverage AS (
  SELECT
    min(paid_at) AS min_paid_at,
    max(paid_at) AS max_paid_at
  FROM public.transactions
  WHERE channel = 'bold_afs'
    AND raw_payload->>'import_source' = 'bold_historical_csv'
    AND paid_at IS NOT NULL
),
sales_paid AS (
  SELECT
    t.id,
    t.invoice_number,
    t.product_name,
    m.display_name AS machine_name,
    t.amount_gross::numeric(12,2) AS amount_gross,
    t.paid_at,
    to_char(t.paid_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    date_trunc('minute', t.paid_at) AS match_minute,
    row_number() OVER (
      PARTITION BY date_trunc('minute', t.paid_at), t.amount_gross
      ORDER BY t.paid_at, t.id
    ) AS rn,
    count(*) OVER (
      PARTITION BY date_trunc('minute', t.paid_at), t.amount_gross
    ) AS sales_count
  FROM public.transactions t
  LEFT JOIN public.machines m ON m.id = t.machine_id
  WHERE t.channel = 'bold_afs'
    AND t.status = 'paid'
    AND t.parse_status = 'ok'
    AND t.paid_at IS NOT NULL
    AND t.amount_gross > 0
),
mollie_paid AS (
  SELECT
    mt.id,
    mt.payment_id,
    mt.status,
    mt.description_raw,
    mt.amount_gross::numeric(12,2) AS amount_gross,
    mt.mollie_created_at,
    mt.mollie_paid_at,
    mt.legacy_bold_at
  FROM public.mollie_transactions mt
),
mollie_ranked AS (
  SELECT
    mt.*,
    to_char(mt.legacy_bold_at AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    date_trunc('minute', mt.legacy_bold_at) AS match_minute,
    row_number() OVER (
      PARTITION BY date_trunc('minute', mt.legacy_bold_at), mt.amount_gross
      ORDER BY mt.legacy_bold_at, mt.payment_id
    ) AS rn,
    count(*) OVER (
      PARTITION BY date_trunc('minute', mt.legacy_bold_at), mt.amount_gross
    ) AS mollie_count
  FROM mollie_paid mt
  CROSS JOIN bold_coverage bc
  WHERE mt.status = 'paid'
    AND mt.legacy_bold_at IS NOT NULL
    AND mt.amount_gross > 0
    AND (bc.min_paid_at IS NULL OR mt.legacy_bold_at >= bc.min_paid_at)
    AND (bc.max_paid_at IS NULL OR mt.legacy_bold_at <= bc.max_paid_at)
),
sales_with_mollie_count AS (
  SELECT
    s.*,
    coalesce(max(m.mollie_count), 0) AS mollie_count
  FROM sales_paid s
  LEFT JOIN mollie_ranked m
    ON m.match_minute = s.match_minute
   AND m.amount_gross = s.amount_gross
  GROUP BY
    s.id,
    s.invoice_number,
    s.product_name,
    s.machine_name,
    s.amount_gross,
    s.paid_at,
    s.period,
    s.match_minute,
    s.rn,
    s.sales_count
),
mollie_with_sales_count AS (
  SELECT
    m.*,
    coalesce(max(s.sales_count), 0) AS sales_count
  FROM mollie_ranked m
  LEFT JOIN sales_paid s
    ON s.match_minute = m.match_minute
   AND s.amount_gross = m.amount_gross
  GROUP BY
    m.id,
    m.payment_id,
    m.status,
    m.description_raw,
    m.amount_gross,
    m.mollie_created_at,
    m.mollie_paid_at,
    m.legacy_bold_at,
    m.period,
    m.match_minute,
    m.rn,
    m.mollie_count
),
duplicate_candidates AS (
  SELECT
    to_char(coalesce(legacy_bold_at, mollie_created_at) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS period,
    min(coalesce(legacy_bold_at, mollie_created_at)) AS occurred_at,
    amount_gross::numeric(12,2) AS amount_gross,
    count(*)::int AS duplicate_count,
    string_agg(payment_id, ', ' ORDER BY payment_id) AS payment_ids,
    min(description_raw) AS description_raw
  FROM public.mollie_transactions
  WHERE coalesce(legacy_bold_at, mollie_created_at) IS NOT NULL
  GROUP BY description_raw, amount_gross, status, mollie_created_at, legacy_bold_at
  HAVING count(*) > 1
)
SELECT
  'bold_missing_mollie'::text AS issue_type,
  s.period,
  s.paid_at AS occurred_at,
  s.amount_gross,
  s.invoice_number AS reference,
  s.product_name,
  s.machine_name,
  NULL::text AS payment_id,
  s.id AS sales_transaction_id,
  NULL::text AS description_raw,
  NULL::int AS duplicate_count
FROM sales_with_mollie_count s
WHERE s.rn > s.mollie_count

UNION ALL

SELECT
  'mollie_extra'::text AS issue_type,
  m.period,
  m.legacy_bold_at AS occurred_at,
  m.amount_gross,
  m.payment_id AS reference,
  NULL::text AS product_name,
  NULL::text AS machine_name,
  m.payment_id,
  NULL::uuid AS sales_transaction_id,
  m.description_raw,
  NULL::int AS duplicate_count
FROM mollie_with_sales_count m
WHERE m.rn > m.sales_count

UNION ALL

SELECT
  'mollie_duplicate_candidate'::text AS issue_type,
  d.period,
  d.occurred_at,
  d.amount_gross,
  d.payment_ids AS reference,
  NULL::text AS product_name,
  NULL::text AS machine_name,
  NULL::text AS payment_id,
  NULL::uuid AS sales_transaction_id,
  d.description_raw,
  d.duplicate_count
FROM duplicate_candidates d;

GRANT SELECT ON public.vw_bold_mollie_monthly_reconciliation TO authenticated;
GRANT SELECT ON public.vw_bold_mollie_monthly_reconciliation TO service_role;
GRANT SELECT ON public.vw_bold_mollie_reconciliation_issues TO authenticated;
GRANT SELECT ON public.vw_bold_mollie_reconciliation_issues TO service_role;
