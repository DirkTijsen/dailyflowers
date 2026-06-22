// Dagelijkse reconciliatie-sweep (vangnet).
// Shopify: incrementeel per actieve verbinding uit shopify_connections.
// Mollie: incrementeel met overlap; eerste run kijkt beperkt terug.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { processShopifyOrder } from "../_shared/shopify.ts";
import { getMollieApiKey, processMolliePayment } from "../_shared/mollie.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MOLLIE_SYNC_FROM = Deno.env.get("MOLLIE_SYNC_FROM") ?? "2026-01-01T00:00:00Z";
const MOLLIE_INCREMENTAL_OVERLAP_HOURS = Number(
  Deno.env.get("MOLLIE_INCREMENTAL_OVERLAP_HOURS") ?? 72,
);
const MOLLIE_INITIAL_LOOKBACK_DAYS = Number(Deno.env.get("MOLLIE_INITIAL_LOOKBACK_DAYS") ?? 7);
const MOLLIE_FETCH_TIMEOUT_MS = Number(Deno.env.get("MOLLIE_FETCH_TIMEOUT_MS") ?? 30000);
const SHOPIFY_INITIAL_LOOKBACK_DAYS = Number(
  Deno.env.get("SHOPIFY_INITIAL_LOOKBACK_DAYS") ?? Deno.env.get("SHOPIFY_SYNC_DAYS") ?? 60,
);
const SHOPIFY_INCREMENTAL_OVERLAP_HOURS = Number(
  Deno.env.get("SHOPIFY_INCREMENTAL_OVERLAP_HOURS") ?? 24,
);
const SHOPIFY_SYNC_FROM = Deno.env.get("SHOPIFY_SYNC_FROM");
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
  timeoutMs = 30000,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      lastErr = e;
      console.warn(`fetch poging ${i + 1}/${attempts} faalde voor ${url}:`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
}

function normalizeShopDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

async function sweepShopifyConnection(conn: { id: string; shop_domain: string; client_id?: string | null; access_token: string; label: string }, sinceIso: string): Promise<number> {
  const domain = normalizeShopDomain(conn.shop_domain);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) {
    throw new Error(`Ongeldig shop-domein "${conn.shop_domain}" voor "${conn.label}". Verwacht: <winkel>.myshopify.com`);
  }
  const accessToken = await getShopifyAccessToken(domain, conn);
  let cursor: string | null = null;
  let count = 0;

  while (true) {
    const data = await fetchShopifyOrdersPage(domain, accessToken, sinceIso, cursor);
    const orders = data.orders?.nodes ?? [];
    for (const o of orders) {
      try {
        await processShopifyOrder(graphqlOrderToRestLike(o));
        count++;
      } catch (e) {
        console.error("shopify order fail", o.id, e);
      }
    }

    if (!data.orders?.pageInfo?.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  await supabase.from("shopify_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
  return count;
}

async function getShopifyAccessToken(
  domain: string,
  conn: { client_id?: string | null; access_token: string; label: string },
): Promise<string> {
  const storedSecretOrToken = String(conn.access_token ?? "").trim();
  const clientId = String(conn.client_id ?? "").trim();
  if (!storedSecretOrToken) throw new Error("Shopify app secret/access token ontbreekt");

  const shouldExchange = clientId && storedSecretOrToken.startsWith("shpss_");
  if (!shouldExchange) return storedSecretOrToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: storedSecretOrToken,
  });

  const response = await fetchWithRetry(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("Shopify token exchange gaf geen access_token terug");
  return data.access_token;
}

async function fetchShopifyOrdersPage(
  domain: string,
  accessToken: string,
  sinceIso: string,
  cursor: string | null,
): Promise<any> {
  const query = `
    query DailyFlowersOrders($cursor: String, $search: String!) {
      orders(first: 100, after: $cursor, query: $search, sortKey: UPDATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          legacyResourceId
          name
          number
          processedAt
          createdAt
          updatedAt
          cancelledAt
          sourceName
          displayFinancialStatus
          displayFulfillmentStatus
          taxesIncluded
          statusPageUrl
          subtotalPriceSet { shopMoney { amount } }
          currentSubtotalPriceSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          currentTotalDiscountsSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          currentTotalTaxSet { shopMoney { amount } }
          totalPriceSet { shopMoney { amount } }
          currentTotalPriceSet { shopMoney { amount } }
          totalRefundedSet { shopMoney { amount } }
          netPaymentSet { shopMoney { amount } }
          retailLocation { id }
          lineItems(first: 100) {
            nodes {
              id
              name
              title
              sku
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              totalDiscountSet { shopMoney { amount } }
              taxLines { rate priceSet { shopMoney { amount } } }
            }
          }
        }
      }
    }
  `;

  const response = await fetchWithRetry(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-shopify-access-token": accessToken,
    },
    body: JSON.stringify({
      query,
      variables: { cursor, search: `updated_at:>=${sinceIso}` },
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(payload.errors)}`);
  }
  return payload.data;
}

function graphqlOrderToRestLike(order: any): any {
  return {
    id: order.legacyResourceId ?? gidTail(order.id),
    name: order.name,
    order_number: order.number,
    processed_at: order.processedAt,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    cancelled_at: order.cancelledAt,
    source_name: order.sourceName,
    fulfillment_status: order.displayFulfillmentStatus,
    location_id: order.retailLocation?.id ?? null,
    financial_status: mapGraphqlFinancialStatus(order.displayFinancialStatus),
    taxes_included: order.taxesIncluded,
    order_status_url: order.statusPageUrl,
    subtotal_price: moneyAmount(order.subtotalPriceSet),
    current_subtotal_price: moneyAmount(order.currentSubtotalPriceSet),
    total_discounts: moneyAmount(order.totalDiscountsSet),
    current_total_discounts: moneyAmount(order.currentTotalDiscountsSet),
    total_shipping: moneyAmount(order.totalShippingPriceSet),
    total_tax: moneyAmount(order.totalTaxSet),
    current_total_tax: moneyAmount(order.currentTotalTaxSet),
    total_price: moneyAmount(order.totalPriceSet),
    current_total_price: moneyAmount(order.currentTotalPriceSet),
    total_refunded: moneyAmount(order.totalRefundedSet),
    net_payment: moneyAmount(order.netPaymentSet),
    line_items: (order.lineItems?.nodes ?? []).map((line: any) => ({
      id: gidTail(line.id),
      sku: line.sku,
      title: line.title,
      name: line.name,
      quantity: line.quantity,
      price: moneyAmount(line.originalUnitPriceSet),
      total_discount: moneyAmount(line.totalDiscountSet),
      tax_lines: (line.taxLines ?? []).map((taxLine: any) => ({
        rate: taxLine.rate,
        price: moneyAmount(taxLine.priceSet),
      })),
    })),
  };
}

function mapGraphqlFinancialStatus(status: unknown): string {
  switch (String(status ?? "").toUpperCase()) {
    case "PAID": return "paid";
    case "REFUNDED": return "refunded";
    case "PARTIALLY_REFUNDED": return "partially_refunded";
    case "VOIDED": return "canceled";
    case "PENDING": return "pending";
    case "AUTHORIZED": return "authorized";
    case "PARTIALLY_PAID": return "partially_paid";
    default: return "other";
  }
}

function moneyAmount(moneyBag: any): number {
  return Number(moneyBag?.shopMoney?.amount ?? 0);
}

function gidTail(gid: unknown): string {
  return String(gid ?? "").split("/").pop() || String(gid ?? "");
}

function determineShopifySince(conn: { last_synced_at?: string | null }): string {
  const lowerBound = SHOPIFY_SYNC_FROM ? new Date(SHOPIFY_SYNC_FROM).getTime() : 0;
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const lastSynced = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : NaN;
  const since = Number.isFinite(lastSynced)
    ? lastSynced - SHOPIFY_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000
    : Date.now() - SHOPIFY_INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000;

  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function sweepMollie(sinceIso: string): Promise<number> {
  const mollieApiKey = await getMollieApiKey();
  let url: string | null = `https://api.mollie.com/v2/payments?limit=250`;
  let count = 0;
  const since = new Date(sinceIso).getTime();
  while (url) {
    const res: Response = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${mollieApiKey}` } },
      3,
      MOLLIE_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`Mollie ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const payments: any[] = data._embedded?.payments ?? [];
    let reachedEnd = false;
    for (const p of payments) {
      const created = new Date(p.createdAt).getTime();
      if (created < since) { reachedEnd = true; continue; }
      try { await processMolliePayment(p); count++; }
      catch (e) { console.error("mollie payment fail", p.id, e); }
    }
    if (reachedEnd) break;
    url = data._links?.next?.href ?? null;
  }
  return count;
}

async function determineMollieSince(): Promise<string> {
  const lowerBound = new Date(MOLLIE_SYNC_FROM).getTime();
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const { data, error } = await supabase
    .from("sync_state")
    .select("last_sweep_at")
    .eq("channel", "bold_afs")
    .eq("last_sweep_status", "ok")
    .not("last_sweep_at", "is", null)
    .maybeSingle();
  if (error) throw error;

  const since = data?.last_sweep_at
    ? new Date(data.last_sweep_at).getTime() - MOLLIE_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000
    : Date.now() - MOLLIE_INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000;

  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function recordSweep(channel: string, status: string, message: string, processed: number) {
  await supabase.from("sync_state").upsert({
    channel, last_sweep_at: new Date().toISOString(),
    last_sweep_status: status, last_sweep_message: message,
    records_processed: processed, updated_at: new Date().toISOString(),
  });
}

async function runSweep() {
  try {
    const { data: conns } = await supabase.from("shopify_connections").select("id,shop_domain,client_id,access_token,label,last_synced_at").eq("active", true);
    let total = 0;
    for (const c of (conns ?? [])) {
      try {
        const shopifySince = determineShopifySince(c as any);
        const n = await sweepShopifyConnection(c as any, shopifySince);
        total += n;
      } catch (e) {
        console.error("shopify conn fail", (c as any).label, (e as Error).message);
      }
    }
    await recordSweep("shopify_webshop", "ok", `Sweep voltooid (${(conns ?? []).length} koppelingen)`, total);
    await recordSweep("shopify_winkel", "ok", `Sweep voltooid (${(conns ?? []).length} koppelingen)`, total);
  } catch (e) {
    const msg = (e as Error).message;
    await recordSweep("shopify_webshop", "error", msg, 0);
    await recordSweep("shopify_winkel", "error", msg, 0);
  }

  try {
    const mollieSince = await determineMollieSince();
    const c = await sweepMollie(mollieSince);
    await recordSweep("bold_afs", "ok", `Sweep voltooid vanaf ${mollieSince}`, c);
  } catch (e) {
    const msg = (e as Error).message;
    await recordSweep("bold_afs", "error", msg, 0);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Markeer direct als "running" zodat de UI dit kan tonen
  await recordSweep("shopify_webshop", "running", "Sweep gestart…", 0);
  await recordSweep("shopify_winkel", "running", "Sweep gestart…", 0);
  await recordSweep("bold_afs", "running", "Sweep gestart…", 0);

  // Voer de sweep op de achtergrond uit zodat de HTTP-request niet timeout.
  // @ts-ignore - EdgeRuntime is beschikbaar in Supabase Edge Functions
  EdgeRuntime.waitUntil(runSweep());

  return new Response(
    JSON.stringify({ status: "started", message: "Sweep draait op de achtergrond. Status verschijnt onderaan het dashboard." }),
    { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
