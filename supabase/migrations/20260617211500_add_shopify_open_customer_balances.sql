ALTER TABLE public.shopify_order_summaries
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_company text;

CREATE INDEX IF NOT EXISTS idx_shopify_order_summaries_customer_email
  ON public.shopify_order_summaries (lower(customer_email))
  WHERE customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_order_summaries_customer_name
  ON public.shopify_order_summaries (lower(customer_name))
  WHERE customer_name IS NOT NULL;

DROP VIEW IF EXISTS public.vw_shopify_open_by_customer;
DROP VIEW IF EXISTS public.vw_shopify_open_customer_orders;

CREATE OR REPLACE VIEW public.vw_shopify_open_customer_orders AS
SELECT
  lower(
    coalesce(
      nullif(os.customer_email, ''),
      nullif(os.customer_id, ''),
      nullif(os.customer_company, ''),
      nullif(os.customer_name, ''),
      'unknown'
    )
  ) AS customer_key,
  coalesce(
    nullif(os.customer_company, ''),
    nullif(os.customer_name, ''),
    nullif(os.customer_email, ''),
    'Onbekende klant'
  ) AS customer_label,
  os.customer_id,
  os.customer_name,
  os.customer_email,
  os.customer_phone,
  os.customer_company,
  c.period,
  c.order_summary_id,
  c.external_id,
  c.order_name,
  c.order_number,
  c.channel,
  c.source_name,
  c.financial_status,
  c.processed_at,
  c.order_amount,
  c.paid_amount,
  greatest(c.payment_difference, 0)::numeric(14,2) AS open_amount,
  c.payment_difference,
  c.payment_coverage_status,
  c.payment_gateways,
  c.transaction_count,
  c.last_payment_at
FROM public.vw_shopify_order_payment_coverage c
JOIN public.shopify_order_summaries os ON os.id = c.order_summary_id
WHERE c.payment_difference > 0.01
  AND lower(coalesce(c.financial_status, '')) NOT IN ('canceled', 'cancelled', 'voided');

CREATE OR REPLACE VIEW public.vw_shopify_open_by_customer AS
SELECT
  customer_key,
  customer_label,
  max(customer_id) FILTER (WHERE customer_id IS NOT NULL) AS customer_id,
  max(customer_name) FILTER (WHERE customer_name IS NOT NULL) AS customer_name,
  max(customer_email) FILTER (WHERE customer_email IS NOT NULL) AS customer_email,
  max(customer_phone) FILTER (WHERE customer_phone IS NOT NULL) AS customer_phone,
  max(customer_company) FILTER (WHERE customer_company IS NOT NULL) AS customer_company,
  count(*)::int AS open_order_count,
  sum(open_amount)::numeric(14,2) AS open_amount,
  min(processed_at) AS oldest_order_at,
  max(processed_at) AS newest_order_at,
  count(*) FILTER (WHERE channel = 'shopify_webshop')::int AS webshop_order_count,
  sum(open_amount) FILTER (WHERE channel = 'shopify_webshop')::numeric(14,2) AS webshop_open_amount,
  count(*) FILTER (WHERE channel = 'shopify_winkel')::int AS winkel_order_count,
  sum(open_amount) FILTER (WHERE channel = 'shopify_winkel')::numeric(14,2) AS winkel_open_amount,
  string_agg(DISTINCT channel::text, ', ' ORDER BY channel::text) AS channels
FROM public.vw_shopify_open_customer_orders
GROUP BY customer_key, customer_label;

GRANT SELECT ON public.vw_shopify_open_customer_orders TO authenticated;
GRANT SELECT ON public.vw_shopify_open_customer_orders TO service_role;
GRANT SELECT ON public.vw_shopify_open_by_customer TO authenticated;
GRANT SELECT ON public.vw_shopify_open_by_customer TO service_role;

ALTER VIEW public.vw_shopify_open_customer_orders SET (security_invoker = true);
ALTER VIEW public.vw_shopify_open_by_customer SET (security_invoker = true);
