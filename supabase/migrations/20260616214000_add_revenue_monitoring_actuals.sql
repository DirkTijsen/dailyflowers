CREATE OR REPLACE VIEW public.vw_monthly_revenue_actuals AS
WITH shopify_base AS (
  SELECT
    to_char(date_trunc('month', processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    financial_status,
    current_total_price,
    CASE
      WHEN raw_payload->>'imported_from' = 'shopify_csv' AND COALESCE(total_price, 0) > 0
        THEN round((COALESCE(total_tax, 0) * COALESCE(current_total_price, 0) / total_price)::numeric, 2)
      ELSE COALESCE(current_total_tax, 0)
    END AS current_vat
  FROM public.shopify_order_summaries
  WHERE processed_at IS NOT NULL
    AND channel IN ('shopify_webshop', 'shopify_winkel')
    AND financial_status IN ('paid', 'partially_refunded', 'refunded')
),
shopify_actuals AS (
  SELECT
    period,
    channel,
    count(*)::int AS tx_count,
    COALESCE(sum(current_total_price), 0) AS gross_total,
    COALESCE(sum(current_total_price - current_vat), 0) AS net_total,
    COALESCE(sum(current_vat), 0) AS vat_total
  FROM shopify_base
  GROUP BY period, channel
),
other_actuals AS (
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
    AND channel NOT IN ('shopify_webshop', 'shopify_winkel')
  GROUP BY 1, 2
)
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM shopify_actuals
UNION ALL
SELECT period, channel, tx_count, gross_total, net_total, vat_total FROM other_actuals;

GRANT SELECT ON public.vw_monthly_revenue_actuals TO authenticated;
ALTER VIEW public.vw_monthly_revenue_actuals SET (security_invoker = true);
