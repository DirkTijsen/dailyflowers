CREATE OR REPLACE VIEW public.vw_monthly_channel AS
WITH transaction_actuals AS (
  SELECT
    to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    count(*)::int AS tx_count,
    COALESCE(sum(amount_gross), 0) AS gross_total,
    COALESCE(sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)), 0) AS net_total,
    COALESCE(sum(vat_amount), 0) AS vat_total
  FROM public.transactions
  WHERE status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
    AND include_in_revenue
  GROUP BY 1, 2
),
shopify_fallback_actuals AS (
  SELECT
    to_char(date_trunc('month', s.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    s.channel,
    count(*)::int AS tx_count,
    COALESCE(sum(COALESCE(s.current_total_price, s.total_price, 0)), 0) AS gross_total,
    COALESCE(
      sum(
        COALESCE(s.current_total_price, s.total_price, 0)
        - COALESCE(s.current_total_tax, s.total_tax, s.line_tax_total, 0)
      ),
      0
    ) AS net_total,
    COALESCE(sum(COALESCE(s.current_total_tax, s.total_tax, s.line_tax_total, 0)), 0) AS vat_total
  FROM public.shopify_order_summaries s
  WHERE s.processed_at IS NOT NULL
    AND s.financial_status = 'paid'
    AND s.channel IN ('shopify_webshop', 'shopify_winkel')
    AND jsonb_typeof(s.raw_payload->'tax_rates') = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM transaction_actuals t
      WHERE t.period = to_char(
        date_trunc('month', s.processed_at AT TIME ZONE 'Europe/Amsterdam'),
        'YYYY-MM'
      )
        AND t.channel = s.channel
    )
  GROUP BY 1, 2
)
SELECT period, channel, tx_count, gross_total, net_total, vat_total
FROM transaction_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total
FROM shopify_fallback_actuals;

CREATE OR REPLACE VIEW public.vw_monthly_vat AS
WITH transaction_actuals AS (
  SELECT
    to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    vat_rate,
    count(*)::int AS tx_count,
    COALESCE(sum(amount_gross), 0) AS gross_total,
    COALESCE(sum(COALESCE(amount_net, amount_gross - COALESCE(vat_amount, 0), 0)), 0) AS net_total,
    COALESCE(sum(vat_amount), 0) AS vat_total
  FROM public.transactions
  WHERE status = 'paid'
    AND parse_status = 'ok'
    AND paid_at IS NOT NULL
    AND vat_rate IS NOT NULL
    AND include_in_revenue
  GROUP BY 1, 2, 3
),
transaction_periods AS (
  SELECT DISTINCT period, channel
  FROM transaction_actuals
  WHERE channel IN ('shopify_webshop', 'shopify_winkel')
),
historical_shopify_orders AS (
  SELECT
    s.id,
    to_char(date_trunc('month', s.processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    s.channel,
    COALESCE(s.current_total_price, s.total_price, 0) AS gross_total,
    COALESCE(s.current_total_tax, s.total_tax, s.line_tax_total, 0) AS vat_total,
    s.raw_payload->'tax_rates' AS tax_rates
  FROM public.shopify_order_summaries s
  LEFT JOIN transaction_periods p
    ON p.period = to_char(
      date_trunc('month', s.processed_at AT TIME ZONE 'Europe/Amsterdam'),
      'YYYY-MM'
    )
   AND p.channel = s.channel
  WHERE s.processed_at IS NOT NULL
    AND s.financial_status = 'paid'
    AND s.channel IN ('shopify_webshop', 'shopify_winkel')
    AND jsonb_typeof(s.raw_payload->'tax_rates') = 'array'
    AND p.period IS NULL
),
historical_rate_rows AS (
  SELECT
    o.id,
    o.period,
    o.channel,
    o.gross_total,
    o.vat_total,
    COALESCE(NULLIF(rate->>'rate', '')::numeric(5,2), 0::numeric(5,2)) AS vat_rate,
    COALESCE(NULLIF(rate->>'amount', '')::numeric, 0) AS rate_vat
  FROM historical_shopify_orders o
  LEFT JOIN LATERAL jsonb_array_elements(o.tax_rates) rate ON true
),
historical_allocations AS (
  SELECT
    id,
    period,
    channel,
    vat_rate,
    rate_vat,
    CASE
      WHEN vat_rate = 0 THEN 0
      ELSE rate_vat * 100 / vat_rate
    END AS theoretical_net,
    gross_total - vat_total AS order_net,
    sum(
      CASE
        WHEN vat_rate = 0 THEN 0
        ELSE rate_vat * 100 / vat_rate
      END
    ) OVER (PARTITION BY id) AS theoretical_order_net,
    row_number() OVER (
      PARTITION BY id
      ORDER BY
        CASE WHEN vat_rate = 0 THEN 0 ELSE 1 END,
        CASE WHEN vat_rate = 0 THEN 0 ELSE rate_vat * 100 / vat_rate END DESC,
        vat_rate
    ) AS adjustment_rank
  FROM historical_rate_rows
),
historical_actuals AS (
  SELECT
    period,
    channel,
    vat_rate,
    count(*)::int AS tx_count,
    COALESCE(
      sum(
        theoretical_net
        + CASE
            WHEN adjustment_rank = 1 THEN order_net - theoretical_order_net
            ELSE 0
          END
        + rate_vat
      ),
      0
    ) AS gross_total,
    COALESCE(
      sum(
        theoretical_net
        + CASE
            WHEN adjustment_rank = 1 THEN order_net - theoretical_order_net
            ELSE 0
          END
      ),
      0
    ) AS net_total,
    COALESCE(sum(rate_vat), 0) AS vat_total
  FROM historical_allocations
  GROUP BY 1, 2, 3
)
SELECT period, channel, vat_rate, tx_count, gross_total, net_total, vat_total
FROM transaction_actuals
UNION ALL
SELECT period, channel, vat_rate, tx_count, gross_total, net_total, vat_total
FROM historical_actuals;

GRANT SELECT ON public.vw_monthly_channel TO authenticated;
GRANT SELECT ON public.vw_monthly_vat TO authenticated;
ALTER VIEW public.vw_monthly_channel SET (security_invoker = true);
ALTER VIEW public.vw_monthly_vat SET (security_invoker = true);

COMMENT ON VIEW public.vw_monthly_vat IS
  'Monthly paid revenue by VAT rate. Transaction rows are authoritative when available; historical Shopify months without transaction rows fall back to paid order summaries and their tax_rates payload without double counting.';
