CREATE OR REPLACE VIEW public.vw_monthly_revenue_actuals AS
WITH shopify_base AS (
  SELECT
    to_char(date_trunc('month', processed_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM') AS period,
    channel,
    COALESCE(current_total_price, total_price, 0) AS invoice_gross,
    COALESCE(current_total_tax, total_tax, line_tax_total, 0) AS invoice_vat
  FROM public.shopify_order_summaries
  WHERE processed_at IS NOT NULL
    AND channel IN ('shopify_webshop', 'shopify_winkel')
    AND (
      raw_payload ? 'tax_rates'
      OR total_tax IS NOT NULL
      OR current_total_tax IS NOT NULL
    )
),
shopify_actuals AS (
  SELECT
    period,
    channel,
    count(*)::int AS tx_count,
    COALESCE(sum(invoice_gross), 0) AS gross_total,
    COALESCE(sum(invoice_gross - invoice_vat), 0) AS net_total,
    COALESCE(sum(invoice_vat), 0) AS vat_total
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
COMMENT ON VIEW public.vw_monthly_revenue_actuals IS
  'Monthly actual revenue. Shopify includes every order summary with VAT invoice data, including pending orders, and uses current order totals so refunds lower the revenue basis.';
