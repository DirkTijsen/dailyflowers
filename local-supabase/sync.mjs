import crypto from "node:crypto";

const SHOPIFY_INITIAL_LOOKBACK_DAYS = Number(
  process.env.SHOPIFY_INITIAL_LOOKBACK_DAYS ?? process.env.SHOPIFY_SYNC_DAYS ?? 60,
);
const SHOPIFY_INCREMENTAL_OVERLAP_HOURS = Number(
  process.env.SHOPIFY_INCREMENTAL_OVERLAP_HOURS ?? 24,
);
const SHOPIFY_PAYMENTS_INCREMENTAL_OVERLAP_HOURS = Number(
  process.env.SHOPIFY_PAYMENTS_INCREMENTAL_OVERLAP_HOURS ?? 168,
);
const SHOPIFY_SYNC_FROM = process.env.SHOPIFY_SYNC_FROM ?? null;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-04";
const MOLLIE_SYNC_FROM = process.env.MOLLIE_SYNC_FROM ?? "2026-01-01T00:00:00Z";
const MOLLIE_INCREMENTAL_OVERLAP_HOURS = Number(
  process.env.MOLLIE_INCREMENTAL_OVERLAP_HOURS ?? 72,
);
const MOLLIE_INITIAL_LOOKBACK_DAYS = Number(process.env.MOLLIE_INITIAL_LOOKBACK_DAYS ?? 7);
const MOLLIE_FETCH_TIMEOUT_MS = Number(process.env.MOLLIE_FETCH_TIMEOUT_MS ?? 30000);
const MOLLIE_VERBOSE_PARSE_ERRORS = process.env.MOLLIE_VERBOSE_PARSE_ERRORS === "true";
const EXACT_SYNC_FROM = process.env.EXACT_SYNC_FROM ?? "2026-01-01T00:00:00Z";
const EXACT_INCREMENTAL_OVERLAP_HOURS = Number(process.env.EXACT_INCREMENTAL_OVERLAP_HOURS ?? 48);
const EXACT_RESUME_OVERLAP_DAYS = Number(process.env.EXACT_RESUME_OVERLAP_DAYS ?? 1);
const EXACT_RECHECK_OPEN_PERIODS = process.env.EXACT_RECHECK_OPEN_PERIODS !== "false";
const EXACT_PREVIOUS_QUARTER_GRACE_DAYS = Number(
  process.env.EXACT_PREVIOUS_QUARTER_GRACE_DAYS ?? 31,
);
const EXACT_FETCH_TIMEOUT_MS = Number(process.env.EXACT_FETCH_TIMEOUT_MS ?? 60000);
const EXACT_PAGE_SIZE = Number(process.env.EXACT_PAGE_SIZE ?? 5000);
const EXACT_REPLACE_MANUAL_GL = process.env.EXACT_REPLACE_MANUAL_GL !== "false";
const EXACT_GL_ACCOUNTS_TABLE =
  process.env.INVANTIVE_EXACT_GL_ACCOUNTS_TABLE ?? "ExactOnlineREST.Financial.GLAccounts@eol";
const EXACT_TRANSACTION_LINES_TABLE =
  process.env.INVANTIVE_EXACT_TRANSACTION_LINES_TABLE ??
  "ExactOnlineREST.FinancialTransaction.TransactionLines@eol";

const transactionColumns = [
  "external_id",
  "source",
  "channel",
  "machine_id",
  "article_number",
  "product_name",
  "amount_gross",
  "amount_net",
  "vat_amount",
  "vat_rate",
  "discount_amount",
  "invoice_number",
  "status",
  "paid_at",
  "description_raw",
  "invoice_url",
  "raw_payload",
  "parse_status",
  "parse_error_message",
];

const shopifyOrderSummaryColumns = [
  "external_id",
  "order_name",
  "order_number",
  "source_name",
  "channel",
  "financial_status",
  "processed_at",
  "created_at_shopify",
  "updated_at_shopify",
  "taxes_included",
  "line_original_total",
  "line_discounted_total",
  "line_discount_total",
  "line_tax_total",
  "subtotal_price",
  "current_subtotal_price",
  "total_discounts",
  "current_total_discounts",
  "total_shipping",
  "total_tax",
  "current_total_tax",
  "total_price",
  "current_total_price",
  "total_refunded",
  "net_payment",
  "raw_payload",
];

const mollieTransactionColumns = [
  "payment_id",
  "mollie_created_at",
  "mollie_paid_at",
  "status",
  "amount_gross",
  "amount_net",
  "vat_amount",
  "vat_rate",
  "discount_amount",
  "description_raw",
  "legacy_bold_at",
  "parsed_afs_number",
  "parsed_article_number",
  "parsed_invoice_number",
  "parsed_paid_at",
  "machine_id",
  "parse_status",
  "parse_error_message",
  "sales_action",
  "sales_transaction_id",
  "raw_payload",
];

const shopifyPaymentPayoutColumns = [
  "connection_id",
  "shop_domain",
  "payout_id",
  "status",
  "payout_date",
  "currency",
  "amount",
  "charges_gross_amount",
  "charges_fee_amount",
  "refunds_gross_amount",
  "refunds_fee_amount",
  "adjustments_gross_amount",
  "adjustments_fee_amount",
  "reserved_funds_gross_amount",
  "reserved_funds_fee_amount",
  "retried_payouts_gross_amount",
  "retried_payouts_fee_amount",
  "external_trace_id",
  "raw_payload",
  "synced_at",
];

const shopifyPaymentBalanceTransactionColumns = [
  "connection_id",
  "shop_domain",
  "balance_transaction_id",
  "payout_id",
  "type",
  "test",
  "payout_status",
  "currency",
  "amount",
  "fee",
  "net",
  "source_id",
  "source_type",
  "source_order_id",
  "source_order_transaction_id",
  "processed_at",
  "order_name",
  "checkout_id",
  "payment_method_name",
  "card_brand",
  "card_source",
  "available_on",
  "presentment_amount",
  "presentment_currency",
  "vat_amount",
  "import_source",
  "import_batch_id",
  "raw_payload",
  "synced_at",
];

const exactGlTransactionColumns = [
  "source",
  "external_id",
  "transaction_date",
  "account_id",
  "account_code",
  "description",
  "relation_name",
  "document_number",
  "amount",
  "debit_amount",
  "credit_amount",
  "import_batch_id",
  "raw_payload",
];

export async function markSweepRunning(pool) {
  await Promise.all([
    recordSweep(pool, "shopify_webshop", "running", "Sweep gestart...", 0),
    recordSweep(pool, "shopify_winkel", "running", "Sweep gestart...", 0),
    recordSweep(pool, "shopify_payments", "running", "Shopify Payments sync gestart...", 0),
    recordSweep(pool, "bold_afs", "running", "Sweep gestart...", 0),
    recordSweep(pool, "exact_gl", "running", "Exact sync gestart...", 0),
  ]);
}

export async function runSweep(pool) {
  await sweepShopify(pool);
  await sweepMollie(pool);
  await sweepExact(pool, { throwOnError: false });
}

export async function runShopifySweepFrom(pool, sinceIso, options = {}) {
  await sweepShopify(pool, { ...options, sinceIso });
}

export async function runShopifyPaymentsSweepFrom(pool, sinceIso = null, options = {}) {
  return sweepShopifyPayments(pool, { ...options, sinceIso, throwOnError: options.throwOnError ?? true });
}

export async function processShopifyWebhook(pool, rawBody, signature) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
  if (!secret) throw new Error("SHOPIFY_WEBHOOK_SECRET ontbreekt");
  if (!verifyShopifyHmac(rawBody, signature, secret)) throw new Error("Ongeldige Shopify HMAC");

  const order = JSON.parse(rawBody);
  await processShopifyOrder(pool, order);
}

export async function processMollieWebhook(pool, paymentId) {
  if (!paymentId) throw new Error("Geen Mollie payment id ontvangen");
  return processMolliePayment(pool, paymentId);
}

async function sweepShopify(pool, options = {}) {
  try {
    const result = await pool.query(
      `
        SELECT id, shop_domain, client_id, access_token, label, last_synced_at
        FROM public.shopify_connections
        WHERE active = true
        ORDER BY created_at
      `,
    );

    let orderTotal = 0;
    let paymentTotal = 0;
    const orderErrors = [];
    const paymentErrors = [];

    for (const conn of result.rows) {
      try {
        const sinceIso = options.sinceIso ?? determineShopifySince(conn);
        orderTotal += await sweepShopifyConnection(pool, conn, sinceIso, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        orderErrors.push(`${conn.label}: ${message}`);
        console.error("shopify conn fail", conn.label, message);
      }

      try {
        const paymentSinceIso =
          options.paymentsSinceIso ?? options.sinceIso ?? (await determineShopifyPaymentsSince(pool));
        const result = await sweepShopifyPaymentsConnection(pool, conn, paymentSinceIso);
        paymentTotal += result.payouts + result.balanceTransactions;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        paymentErrors.push(`${conn.label}: ${message}`);
        console.error("shopify payments conn fail", conn.label, message);
      }
    }

    const orderStatus = orderErrors.length > 0 ? "error" : "ok";
    const orderMessage =
      orderErrors.length > 0
        ? orderErrors.join(" | ")
        : `Sweep voltooid (${result.rows.length} koppeling(en))`;
    await recordSweep(pool, "shopify_webshop", orderStatus, orderMessage, orderTotal);
    await recordSweep(pool, "shopify_winkel", orderStatus, orderMessage, orderTotal);

    const paymentStatus = paymentErrors.length > 0 ? "error" : "ok";
    const paymentMessage =
      paymentErrors.length > 0
        ? paymentErrors.join(" | ")
        : `Shopify Payments voltooid (${result.rows.length} koppeling(en))`;
    await recordSweep(pool, "shopify_payments", paymentStatus, paymentMessage, paymentTotal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSweep(pool, "shopify_webshop", "error", message, 0);
    await recordSweep(pool, "shopify_winkel", "error", message, 0);
    await recordSweep(pool, "shopify_payments", "error", message, 0);
  }
}

function determineShopifySince(conn) {
  const lowerBound = SHOPIFY_SYNC_FROM ? new Date(SHOPIFY_SYNC_FROM).getTime() : 0;
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const lastSynced = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : NaN;
  const since = Number.isFinite(lastSynced)
    ? lastSynced - SHOPIFY_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000
    : Date.now() - SHOPIFY_INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000;

  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function determineShopifyPaymentsSince(pool) {
  const lowerBound = SHOPIFY_SYNC_FROM ? new Date(SHOPIFY_SYNC_FROM).getTime() : 0;
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const result = await pool.query(
    `
      SELECT last_sweep_at
      FROM public.sync_state
      WHERE channel = 'shopify_payments'
        AND last_sweep_status = 'ok'
        AND last_sweep_at IS NOT NULL
      LIMIT 1
    `,
  );
  const lastOk = result.rows[0]?.last_sweep_at;
  const since = lastOk
    ? new Date(lastOk).getTime() - SHOPIFY_PAYMENTS_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000
    : Date.now() - SHOPIFY_INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000;

  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function sweepShopifyConnection(pool, conn, sinceIso, options = {}) {
  const domain = normalizeShopDomain(conn.shop_domain);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) {
    throw new Error(`Ongeldig shop-domein "${conn.shop_domain}". Verwacht: <winkel>.myshopify.com`);
  }

  const accessToken = await getShopifyAccessToken(domain, conn);
  let cursor = null;
  let count = 0;

  while (true) {
    const data = await fetchShopifyOrdersPage(domain, accessToken, sinceIso, cursor);
    const orders = data.orders?.nodes ?? [];

    for (const order of orders) {
      try {
        await processShopifyOrder(pool, graphqlOrderToRestLike(order), options);
        count += 1;
      } catch (error) {
        console.error("shopify order fail", order.id, error);
      }
    }

    if (!data.orders?.pageInfo?.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  await pool.query("UPDATE public.shopify_connections SET last_synced_at = now() WHERE id = $1", [
    conn.id,
  ]);
  return count;
}

async function sweepShopifyPayments(pool, options = {}) {
  try {
    const result = await pool.query(
      `
        SELECT id, shop_domain, client_id, access_token, label
        FROM public.shopify_connections
        WHERE active = true
        ORDER BY created_at
      `,
    );
    const sinceIso = options.sinceIso ?? (await determineShopifyPaymentsSince(pool));
    let totalPayouts = 0;
    let totalTransactions = 0;
    const errors = [];

    await recordSweep(pool, "shopify_payments", "running", `Shopify Payments sync vanaf ${sinceIso}`, 0);

    for (const conn of result.rows) {
      try {
        const counts = await sweepShopifyPaymentsConnection(pool, conn, sinceIso);
        totalPayouts += counts.payouts;
        totalTransactions += counts.balanceTransactions;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${conn.label}: ${message}`);
        console.error("shopify payments conn fail", conn.label, message);
      }
    }

    if (errors.length > 0) {
      const message = errors.join(" | ");
      await recordSweep(pool, "shopify_payments", "error", message, totalPayouts + totalTransactions);
      if (options.throwOnError) throw new Error(message);
    } else {
      await recordSweep(
        pool,
        "shopify_payments",
        "ok",
        `Shopify Payments voltooid: ${totalPayouts} payouts, ${totalTransactions} balance transactions`,
        totalPayouts + totalTransactions,
      );
    }

    return totalPayouts + totalTransactions;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSweep(pool, "shopify_payments", "error", message, 0);
    if (options.throwOnError) throw error;
    return 0;
  }
}

async function sweepShopifyPaymentsConnection(pool, conn, sinceIso) {
  const domain = normalizeShopDomain(conn.shop_domain);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) {
    throw new Error(`Ongeldig shop-domein "${conn.shop_domain}". Verwacht: <winkel>.myshopify.com`);
  }

  const accessToken = await getShopifyAccessToken(domain, conn);
  const payouts = await fetchShopifyPayouts(domain, accessToken, sinceIso);
  let balanceTransactionCount = 0;

  for (const payout of payouts) {
    await upsertShopifyPayout(pool, conn, domain, payout);
    const balanceTransactions = await fetchShopifyBalanceTransactionsForPayout(
      domain,
      accessToken,
      payout.id,
    );
    balanceTransactionCount += balanceTransactions.length;
    await upsertShopifyBalanceTransactions(pool, conn, domain, balanceTransactions);
  }

  return { payouts: payouts.length, balanceTransactions: balanceTransactionCount };
}

async function getShopifyAccessToken(domain, conn) {
  const storedSecretOrToken = String(conn.access_token ?? "").trim();
  const clientId = String(conn.client_id ?? "").trim();

  if (!storedSecretOrToken) throw new Error("Shopify app secret/access token ontbreekt");

  const shouldExchange =
    clientId &&
    (storedSecretOrToken.startsWith("shpss_") ||
      process.env.SHOPIFY_AUTH_MODE === "client_credentials");

  if (!shouldExchange) {
    console.log(
      `Shopify auth ${conn.label}: stored token prefix=${storedSecretOrToken.slice(0, 5)} length=${storedSecretOrToken.length}`,
    );
    return storedSecretOrToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: storedSecretOrToken,
  });

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange ${response.status}: ${shorten(await response.text())}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("Shopify token exchange gaf geen access_token terug");
  const scopes = String(data.scope ?? "")
    .split(",")
    .filter(Boolean);
  console.log(
    `Shopify auth ${conn.label}: client_credentials tokenPrefix=${data.access_token.slice(0, 5)} length=${data.access_token.length} scopes=${scopes.length}`,
  );
  return data.access_token;
}

async function fetchShopifyOrdersPage(domain, accessToken, sinceIso, cursor) {
  const query = `
    query DailyFlowersOrders($cursor: String, $search: String!) {
      orders(first: 100, after: $cursor, query: $search, sortKey: UPDATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          legacyResourceId
          name
          number
          processedAt
          createdAt
          updatedAt
          sourceName
          displayFinancialStatus
          taxesIncluded
          statusPageUrl
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          currentSubtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          currentTotalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          currentTotalTaxSet {
            shopMoney {
              amount
            }
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          currentTotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
            }
          }
          netPaymentSet {
            shopMoney {
              amount
            }
          }
          retailLocation {
            id
          }
          lineItems(first: 100) {
            nodes {
              id
              name
              title
              sku
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
              totalDiscountSet {
                shopMoney {
                  amount
                }
              }
              taxLines {
                rate
                priceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetchWithRetry(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-shopify-access-token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: {
          cursor,
          search: `updated_at:>=${sinceIso}`,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify GraphQL ${response.status}: ${shorten(await response.text())}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL: ${shorten(JSON.stringify(payload.errors))}`);
  }

  return payload.data;
}

async function fetchShopifyPayouts(domain, accessToken, sinceIso) {
  const dateMin = toIsoDate(sinceIso);
  const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shopify_payments/payouts.json`);
  url.searchParams.set("limit", "250");
  if (dateMin) url.searchParams.set("date_min", dateMin);
  return fetchShopifyRestPages(url.toString(), accessToken, "payouts");
}

async function fetchShopifyBalanceTransactionsForPayout(domain, accessToken, payoutId) {
  const url = new URL(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shopify_payments/balance/transactions.json`,
  );
  url.searchParams.set("limit", "250");
  url.searchParams.set("payout_id", String(payoutId));
  return fetchShopifyRestPages(url.toString(), accessToken, "transactions");
}

async function fetchShopifyRestPages(initialUrl, accessToken, collectionKey) {
  let url = initialUrl;
  const rows = [];

  while (url) {
    const response = await fetchWithRetry(
      url,
      {
        headers: {
          Accept: "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      },
      3,
      30000,
    );

    if (!response.ok) {
      throw new Error(`Shopify REST ${response.status}: ${shorten(await response.text())}`);
    }

    const payload = await response.json();
    const pageRows = Array.isArray(payload?.[collectionKey]) ? payload[collectionKey] : [];
    rows.push(...pageRows);
    url = nextLink(response.headers.get("link"));
  }

  return rows;
}

function nextLink(linkHeader) {
  const links = String(linkHeader ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const link of links) {
    if (!/rel="?next"?/i.test(link)) continue;
    const match = /<([^>]+)>/.exec(link);
    if (match) return match[1];
  }
  return null;
}

async function upsertShopifyPayout(pool, conn, domain, payout) {
  const summary = payout.summary ?? {};
  await upsertRows(
    pool,
    "public.shopify_payment_payouts",
    shopifyPaymentPayoutColumns,
    [
      {
        connection_id: conn.id,
        shop_domain: domain,
        payout_id: cleanText(payout.id),
        status: cleanText(payout.status) || null,
        payout_date: toIsoDate(payout.date ?? payout.issued_at ?? payout.issuedAt),
        currency: cleanText(payout.currency) || null,
        amount: nullableMoney(payout.amount) ?? 0,
        charges_gross_amount: nullableMoney(summary.charges_gross_amount) ?? 0,
        charges_fee_amount: nullableMoney(summary.charges_fee_amount) ?? 0,
        refunds_gross_amount: nullableMoney(summary.refunds_gross_amount) ?? 0,
        refunds_fee_amount: nullableMoney(summary.refunds_fee_amount) ?? 0,
        adjustments_gross_amount: nullableMoney(summary.adjustments_gross_amount) ?? 0,
        adjustments_fee_amount: nullableMoney(summary.adjustments_fee_amount) ?? 0,
        reserved_funds_gross_amount: nullableMoney(summary.reserved_funds_gross_amount) ?? 0,
        reserved_funds_fee_amount: nullableMoney(summary.reserved_funds_fee_amount) ?? 0,
        retried_payouts_gross_amount: nullableMoney(summary.retried_payouts_gross_amount) ?? 0,
        retried_payouts_fee_amount: nullableMoney(summary.retried_payouts_fee_amount) ?? 0,
        external_trace_id: cleanText(payout.external_trace_id ?? payout.externalTraceId) || null,
        raw_payload: payout,
        synced_at: new Date().toISOString(),
      },
    ],
    ["shop_domain", "payout_id"],
  );
}

async function upsertShopifyBalanceTransactions(pool, conn, domain, transactions) {
  const rows = transactions
    .map((tx) => ({
      connection_id: conn.id,
      shop_domain: domain,
      balance_transaction_id: cleanText(tx.id),
      payout_id: cleanText(tx.payout_id) || null,
      type: cleanText(tx.type) || null,
      test: typeof tx.test === "boolean" ? tx.test : null,
      payout_status: cleanText(tx.payout_status) || null,
      currency: cleanText(tx.currency) || null,
      amount: nullableMoney(tx.amount) ?? 0,
      fee: nullableMoney(tx.fee) ?? 0,
      net: nullableMoney(tx.net) ?? 0,
      source_id: cleanText(tx.source_id) || null,
      source_type: cleanText(tx.source_type) || null,
      source_order_id: cleanText(tx.source_order_id) || null,
      source_order_transaction_id: cleanText(tx.source_order_transaction_id) || null,
      processed_at: tx.processed_at ?? null,
      raw_payload: tx,
      synced_at: new Date().toISOString(),
    }))
    .filter((row) => row.balance_transaction_id);

  await upsertRows(
    pool,
    "public.shopify_payment_balance_transactions",
    shopifyPaymentBalanceTransactionColumns,
    rows,
    ["shop_domain", "balance_transaction_id"],
  );
}

function graphqlOrderToRestLike(order) {
  return {
    id: order.legacyResourceId ?? gidTail(order.id),
    name: order.name,
    order_number: order.number,
    processed_at: order.processedAt,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    source_name: order.sourceName,
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
    line_items: (order.lineItems?.nodes ?? []).map((line) => ({
      id: gidTail(line.id),
      sku: line.sku,
      title: line.title,
      name: line.name,
      quantity: line.quantity,
      price: moneyAmount(line.originalUnitPriceSet),
      total_discount: moneyAmount(line.totalDiscountSet),
      tax_lines: (line.taxLines ?? []).map((taxLine) => ({
        rate: taxLine.rate,
        price: moneyAmount(taxLine.priceSet),
      })),
    })),
  };
}

async function sweepMollie(pool) {
  const sinceIso = await determineMollieSince(pool);
  await runMollieSweepFrom(pool, sinceIso);
}

export async function runMollieSweepFrom(pool, sinceIso) {
  try {
    await recordSweep(pool, "bold_afs", "running", `Sweep gestart vanaf ${sinceIso}`, 0);
    const count = await fetchMolliePayments(pool, sinceIso);
    await recordSweep(pool, "bold_afs", "ok", `Sweep voltooid vanaf ${sinceIso}`, count);
    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSweep(pool, "bold_afs", "error", message, 0);
    throw error;
  }
}

export async function runExactSweepFrom(pool, sinceIso = null, options = {}) {
  return sweepExact(pool, { ...options, sinceIso, throwOnError: options.throwOnError ?? true });
}

async function determineMollieSince(pool) {
  const lowerBound = new Date(MOLLIE_SYNC_FROM).getTime();
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const result = await pool.query(
    `
      SELECT last_sweep_at
      FROM public.sync_state
      WHERE channel = 'bold_afs'
        AND last_sweep_status = 'ok'
        AND last_sweep_at IS NOT NULL
      LIMIT 1
    `,
  );
  const lastOk = result.rows[0]?.last_sweep_at;
  const since = lastOk
    ? new Date(lastOk).getTime() - MOLLIE_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000
    : Date.now() - MOLLIE_INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000;

  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function sweepExact(pool, options = {}) {
  const configured = hasInvantiveConfig();
  if (!configured) {
    await recordSweep(pool, "exact_gl", "skipped", "Invantive configuratie ontbreekt", 0);
    return 0;
  }

  const sinceIso = options.sinceIso ?? (await determineExactSince(pool));
  const modifiedSinceIso =
    options.modifiedSinceIso === undefined
      ? options.sinceIso
        ? null
        : await determineExactModifiedSince(pool)
      : options.modifiedSinceIso;
  const until = determineExactUntil(options.untilIso);
  const untilIso = until.toISOString();
  try {
    await recordSweep(
      pool,
      "exact_gl",
      "running",
      `Exact sync gestart vanaf ${sinceIso.slice(0, 10)} t/m ${previousDayLabel(until)}; wijzigingen vanaf ${
        modifiedSinceIso ? modifiedSinceIso.slice(0, 10) : "n.v.t."
      }`,
      0,
    );
    const result = await fetchExactGl(pool, sinceIso, untilIso, modifiedSinceIso);
    await recordSweep(
      pool,
      "exact_gl",
      "ok",
      `Exact sync voltooid: ${result.accounts} rekeningen, ${result.transactions} regels`,
      result.transactions,
    );
    return result.transactions;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSweep(pool, "exact_gl", "error", message, 0);
    if (options.throwOnError) throw error;
    console.error("exact sync failed", error);
    return 0;
  }
}

async function determineExactSince(pool) {
  const lowerBound = new Date(EXACT_SYNC_FROM).getTime();
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const result = await pool.query(
    `
      SELECT last_sweep_at
      FROM public.sync_state
      WHERE channel = 'exact_gl'
        AND last_sweep_status = 'ok'
        AND last_sweep_at IS NOT NULL
      LIMIT 1
    `,
  );
  const lastOk = result.rows[0]?.last_sweep_at;
  let sinceTime = safeLowerBound;
  if (lastOk) {
    sinceTime = new Date(lastOk).getTime() - EXACT_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000;
  } else {
    const latestImported = await pool.query(
      `
        SELECT max(transaction_date) AS max_date
        FROM public.gl_transactions
        WHERE source = 'exact_invantive'
      `,
    );
    const maxDate = latestImported.rows[0]?.max_date;
    sinceTime = maxDate
      ? new Date(maxDate).getTime() - EXACT_RESUME_OVERLAP_DAYS * 24 * 3600 * 1000
      : safeLowerBound;
  }

  if (EXACT_RECHECK_OPEN_PERIODS) {
    const openPeriodStart = determineExactOpenPeriodStart();
    if (openPeriodStart) sinceTime = Math.min(sinceTime, openPeriodStart.getTime());
  }

  return new Date(Math.max(sinceTime, safeLowerBound)).toISOString();
}

async function determineExactModifiedSince(pool) {
  const lowerBound = new Date(EXACT_SYNC_FROM).getTime();
  const safeLowerBound = Number.isFinite(lowerBound) ? lowerBound : 0;
  const result = await pool.query(
    `
      SELECT last_sweep_at
      FROM public.sync_state
      WHERE channel = 'exact_gl'
        AND last_sweep_status = 'ok'
        AND last_sweep_at IS NOT NULL
      LIMIT 1
    `,
  );
  const lastOk = result.rows[0]?.last_sweep_at;
  if (!lastOk) return null;

  const since = new Date(lastOk).getTime() - EXACT_INCREMENTAL_OVERLAP_HOURS * 3600 * 1000;
  return new Date(Math.max(since, safeLowerBound)).toISOString();
}

async function fetchExactGl(pool, sinceIso, untilIso = null, modifiedSinceIso = null) {
  const accountRows = await fetchExactGlAccounts();
  const accountMap = await upsertExactGlAccounts(pool, accountRows);
  const transactions = await syncExactTransactionLines(
    pool,
    sinceIso,
    accountMap,
    untilIso,
    modifiedSinceIso,
  );
  return { accounts: accountRows.length, transactions };
}

async function fetchExactGlAccounts() {
  return fetchInvantiveODataRows(EXACT_GL_ACCOUNTS_TABLE, {
    select: [
      "ID",
      "Division",
      "Code",
      "Description",
      "BalanceType",
      "BalanceSide",
      "Type",
      "TypeDescription",
      "IsBlocked",
      "Modified",
      "DivisionCompanyName",
      "DivisionLabel",
    ],
    orderBy: "Code",
  });
}

async function fetchExactTransactionLines(sinceIso, untilIso = null) {
  const start = startOfUtcDay(sinceIso);
  const until = determineExactUntil(untilIso);
  const rowsById = new Map();

  if (!start || start >= until) return [];

  const dateRows = await fetchExactTransactionLineChunks(start, until, "Date");
  for (const row of dateRows) rowsById.set(exactTransactionKey(row), row);

  const lowerBound = startOfUtcDay(EXACT_SYNC_FROM);
  const isInitialSync = lowerBound ? start.getTime() <= lowerBound.getTime() + 60000 : false;
  if (!isInitialSync) {
    const modifiedRows = await fetchExactTransactionLineChunks(start, until, "Modified");
    for (const row of modifiedRows) rowsById.set(exactTransactionKey(row), row);
  }

  return [...rowsById.values()].filter((row) => exactTransactionKey(row));
}

async function fetchExactTransactionLineChunks(start, until, field) {
  const rows = [];
  for (const [chunkStart, chunkEnd] of dailyRanges(start, until)) {
    rows.push(...(await fetchExactTransactionLineRange(chunkStart, chunkEnd, field)));
  }
  return rows;
}

async function syncExactTransactionLines(
  pool,
  sinceIso,
  accountMap,
  untilIso = null,
  modifiedSinceIso = null,
) {
  const start = startOfUtcDay(sinceIso);
  const until = determineExactUntil(untilIso);
  if (!start || start >= until) return 0;

  const seen = new Set();
  let total = 0;

  for (const [chunkStart, chunkEnd] of dailyRanges(start, until)) {
    await recordSweep(
      pool,
      "exact_gl",
      "running",
      `Exact sync bezig: ${total} regels, dag ${chunkStart.toISOString().slice(0, 10)}`,
      total,
    );

    const rows = await fetchExactTransactionLineRange(chunkStart, chunkEnd, "Date");
    const freshRows = [];
    for (const row of rows) {
      const key = exactTransactionKey(row);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      freshRows.push(row);
    }

    const mapped = mapExactTransactionRows(freshRows, accountMap);
    await replaceManualGlRowsForExactDateChunk(pool, chunkStart, chunkEnd);
    await upsertRows(pool, "public.gl_transactions", exactGlTransactionColumns, mapped, [
      "source",
      "external_id",
    ]);

    total += mapped.length;
    await recordSweep(
      pool,
      "exact_gl",
      "running",
      `Exact sync bezig: ${total} regels t/m ${previousDayLabel(chunkEnd)}`,
      total,
    );
  }

  const modifiedStart = modifiedSinceIso ? startOfUtcDay(modifiedSinceIso) : null;
  if (modifiedStart && modifiedStart < until) {
    const modifiedRows = await fetchExactTransactionLineChunks(modifiedStart, until, "Modified");
    const freshModifiedRows = [];
    for (const row of modifiedRows) {
      const key = exactTransactionKey(row);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      freshModifiedRows.push(row);
    }
    const mapped = mapExactTransactionRows(freshModifiedRows, accountMap);
    await upsertRows(pool, "public.gl_transactions", exactGlTransactionColumns, mapped, [
      "source",
      "external_id",
    ]);
    total += mapped.length;
  }

  return total;
}

function previousDayLabel(end) {
  return new Date(end.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchExactTransactionLineRange(start, end, field, depth = 0) {
  const filter = `${field} ge ${toODataDateTime(start)} and ${field} lt ${toODataDateTime(end)}`;
  const rows = await fetchInvantiveODataRows(EXACT_TRANSACTION_LINES_TABLE, {
    select: [
      "ID",
      "Division",
      "Date",
      "FinancialYear",
      "FinancialPeriod",
      "EntryID",
      "EntryNumber",
      "JournalCode",
      "GLAccount",
      "Description",
      "InvoiceNumber",
      "YourRef",
      "Document",
      "AmountDC",
      "AmountFC",
      "AmountVATFC",
      "LineNumber",
      "LineType",
      "Modified",
      "Account",
      "PaymentReference",
      "OrderNumber",
    ],
    filter,
    orderBy: field === "Date" ? "Date,EntryNumber,LineNumber" : "Modified,EntryNumber,LineNumber",
    top: EXACT_PAGE_SIZE,
  });

  if (rows.length < EXACT_PAGE_SIZE) {
    return rows;
  }

  const durationMs = end.getTime() - start.getTime();
  if (durationMs > 1000 && depth < 24) {
    const midpoint = new Date(start.getTime() + Math.floor(durationMs / 2));
    const left = await fetchExactTransactionLineRange(start, midpoint, field, depth + 1);
    const right = await fetchExactTransactionLineRange(midpoint, end, field, depth + 1);
    return [...left, ...right];
  }

  if (field === "Modified") {
    throw new Error(
      `Exact ${field} ${toODataDateTime(start)}-${toODataDateTime(end)} blijft de limiet van ${EXACT_PAGE_SIZE} regels raken. Verfijn de Modified-sync verder voordat deze veilig compleet is.`,
    );
  }

  throw new Error(
    `Exact ${field} ${start.toISOString().slice(0, 10)} raakt de limiet van ${EXACT_PAGE_SIZE} regels. Deze datum is niet veilig compleet op te halen via alleen de dagfilter.`,
  );
}

function exactTransactionKey(row) {
  const id = cleanText(pick(row, ["ID", "Id", "id"]));
  const division = cleanText(pick(row, ["Division", "division"]));
  return id && division ? `${division}:${id}` : id;
}

function determineExactUntil(untilIso = null) {
  const configured = untilIso
    ? startOfUtcDay(untilIso)
    : process.env.EXACT_SYNC_UNTIL
      ? startOfUtcDay(process.env.EXACT_SYNC_UNTIL)
      : null;
  if (configured) return configured;

  const now = new Date();
  return startOfNextUtcDay(now);
}

function determineExactOpenPeriodStart(now = new Date()) {
  const today = startOfUtcDay(now);
  if (!today) return null;

  const currentQuarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
  const currentQuarterStart = new Date(
    Date.UTC(today.getUTCFullYear(), currentQuarterStartMonth, 1),
  );
  const daysSinceQuarterStart =
    (today.getTime() - currentQuarterStart.getTime()) / (24 * 3600 * 1000);

  if (daysSinceQuarterStart < EXACT_PREVIOUS_QUARTER_GRACE_DAYS) {
    return addUtcMonths(currentQuarterStart, -3);
  }

  return currentQuarterStart;
}

function dailyRanges(start, until) {
  const ranges = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

  while (cursor < until) {
    const nextDay = new Date(cursor.getTime() + 24 * 3600 * 1000);
    const end = nextDay < until ? nextDay : until;
    ranges.push([cursor, end]);
    cursor = end;
  }

  return ranges;
}

async function upsertExactGlAccounts(pool, rows) {
  const accountByExactId = new Map();

  for (const row of rows) {
    const accountCode = cleanText(pick(row, ["Code", "code"]));
    if (!accountCode) continue;

    const exactId = cleanText(pick(row, ["ID", "Id", "id"]));
    const division = cleanText(pick(row, ["Division", "division"]));
    const accountName = cleanText(pick(row, ["Description", "description"])) || accountCode;
    const statementType = mapExactBalanceType(pick(row, ["BalanceType", "balanceType"]));
    const debitCredit = mapExactBalanceSide(pick(row, ["BalanceSide", "balanceSide"]));
    const typeDescription = cleanText(pick(row, ["TypeDescription", "typeDescription"]));
    const blocked = Boolean(pick(row, ["IsBlocked", "isBlocked"]));

    const result = await pool.query(
      `
        INSERT INTO public.gl_accounts (
          account_code,
          account_name,
          account_type,
          statement_type,
          debit_credit,
          classification,
          active,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (account_code) DO UPDATE SET
          account_name = EXCLUDED.account_name,
          account_type = EXCLUDED.account_type,
          statement_type = EXCLUDED.statement_type,
          debit_credit = EXCLUDED.debit_credit,
          classification = EXCLUDED.classification,
          active = EXCLUDED.active
        RETURNING id, account_code, account_name, pl_section, revenue_channel
      `,
      [
        accountCode,
        accountName,
        typeDescription || cleanText(pick(row, ["Type", "type"])) || null,
        statementType,
        debitCredit,
        cleanText(pick(row, ["DivisionLabel", "DivisionCompanyName"])) || null,
        !blocked,
        Number(accountCode) || 0,
      ],
    );

    const account = result.rows[0];
    if (exactId) accountByExactId.set(`${division}:${exactId}`.toLowerCase(), account);
    if (exactId) accountByExactId.set(exactId.toLowerCase(), account);
  }

  return accountByExactId;
}

function mapExactTransactionRows(rows, accountMap) {
  const mapped = [];
  const importBatchId = `exact-invantive-${new Date().toISOString()}`;

  for (const row of rows) {
    const id = cleanText(pick(row, ["ID", "Id", "id"]));
    const division = cleanText(pick(row, ["Division", "division"]));
    const glAccountId = cleanText(pick(row, ["GLAccount", "glAccount"]));
    const account = accountMap.get(`${division}:${glAccountId}`.toLowerCase()) ?? accountMap.get(glAccountId.toLowerCase());
    const accountCode = account?.account_code ?? cleanText(pick(row, ["GLAccountCode", "glAccountCode"]));
    const transactionDate = toIsoDate(pick(row, ["Date", "date"]));
    const amount = roundMoney(Number(pick(row, ["AmountDC", "amountDC"]) ?? 0));

    if (!id || !division || !accountCode || !transactionDate || !Number.isFinite(amount)) {
      continue;
    }

    const documentId = cleanText(pick(row, ["Document", "document"]));
    const entryNumber = cleanText(pick(row, ["EntryNumber", "entryNumber"]));
    const invoiceNumber = cleanText(pick(row, ["InvoiceNumber", "invoiceNumber"]));
    const journalCode = cleanText(pick(row, ["JournalCode", "journalCode"]));
    const lineNumber = cleanText(pick(row, ["LineNumber", "lineNumber"]));
    const documentNumber = invoiceNumber || entryNumber || null;
    const exactDocumentUrl = buildExactDocumentUrl(documentId);

    mapped.push({
      source: "exact_invantive",
      external_id: `${division}:${id}`,
      transaction_date: transactionDate,
      account_id: account?.id ?? null,
      account_code: accountCode,
      description: cleanText(pick(row, ["Description", "description", "Notes", "notes"])) || null,
      relation_name: cleanText(pick(row, ["AccountName", "accountName", "YourRef", "yourRef"])) || null,
      document_number: documentNumber,
      amount,
      debit_amount: amount > 0 ? amount : 0,
      credit_amount: amount < 0 ? Math.abs(amount) : 0,
      import_batch_id: importBatchId,
      raw_payload: {
        ...row,
        source: "exact_invantive",
        division,
        entrynumber: entryNumber || null,
        journalcode: journalCode || null,
        linenumber: lineNumber || null,
        exact_document_id: documentId || null,
        exact_document_url: exactDocumentUrl,
      },
    });
  }

  return mapped;
}

async function replaceManualGlRowsForExactDateChunk(pool, start, end) {
  if (!EXACT_REPLACE_MANUAL_GL) return;
  await pool.query(
    `
      DELETE FROM public.gl_transactions
      WHERE source = 'manual'
        AND transaction_date >= $1
        AND transaction_date < $2
    `,
    [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
  );
}

async function fetchInvantiveODataRows(entitySet, options = {}) {
  const rows = [];
  let url = buildInvantiveUrl(entitySet, options);

  while (url) {
    const data = await fetchInvantiveJson(url);
    const pageRows = Array.isArray(data.value) ? data.value : [];
    rows.push(...pageRows);
    url = data["@odata.nextLink"] ?? data["odata.nextLink"] ?? null;
  }

  return rows;
}

function buildInvantiveUrl(entitySet, options = {}) {
  const base = getInvantiveBaseUrl();
  const safeEntitySet = String(entitySet ?? "").replace(/^\/+|\/+$/g, "");
  if (!safeEntitySet) throw new Error("Invantive tabelnaam ontbreekt");
  const url = new URL(`${base}/${safeEntitySet}`);
  if (options.select?.length) url.searchParams.set("$select", options.select.join(","));
  if (options.filter) url.searchParams.set("$filter", options.filter);
  if (options.orderBy) url.searchParams.set("$orderby", options.orderBy);
  url.searchParams.set("$top", String(options.top ?? EXACT_PAGE_SIZE));
  return url.toString();
}

async function fetchInvantiveJson(url) {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.INVANTIVE_BRIDGE_USERNAME}:${process.env.INVANTIVE_BRIDGE_PASSWORD}`,
        ).toString("base64")}`,
        Accept: "application/json",
      },
    },
    3,
    EXACT_FETCH_TIMEOUT_MS,
  );

  if (response.status === 503 && url.includes("bridge-online.invantive.com")) {
    return fetchInvantiveJson(url.replace("bridge-online.invantive.com", "app-online.invantive.com"));
  }

  if (!response.ok) {
    throw new Error(`Invantive ${response.status}: ${shorten(await response.text())}`);
  }

  return response.json();
}

function hasInvantiveConfig() {
  return Boolean(
    String(process.env.INVANTIVE_ODATA_URL ?? "").trim() &&
      String(process.env.INVANTIVE_BRIDGE_USERNAME ?? "").trim() &&
      String(process.env.INVANTIVE_BRIDGE_PASSWORD ?? "").trim(),
  );
}

function getInvantiveBaseUrl() {
  const raw = String(process.env.INVANTIVE_ODATA_URL ?? "").trim();
  if (!raw) throw new Error("INVANTIVE_ODATA_URL ontbreekt");
  return raw.replace(/\/$/, "");
}

function toODataDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toIsoDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfNextUtcDay(value) {
  const day = startOfUtcDay(value);
  if (!day) return null;
  return new Date(day.getTime() + 24 * 3600 * 1000);
}

function addUtcMonths(value, months) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate()),
  );
}

function buildExactDocumentUrl(documentId) {
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function mapExactBalanceType(value) {
  const normalized = cleanText(value).toUpperCase();
  if (normalized === "W") return "Winst & Verlies";
  if (normalized === "B") return "Balans";
  return cleanText(value) || null;
}

function mapExactBalanceSide(value) {
  const normalized = cleanText(value).toUpperCase();
  if (normalized === "D") return "Debit";
  if (normalized === "C") return "Credit";
  return cleanText(value) || null;
}

async function fetchMolliePayments(pool, sinceIso) {
  const apiKey = await getMollieApiKey(pool);

  let url = "https://api.mollie.com/v2/payments?limit=250";
  const since = new Date(sinceIso).getTime();
  let count = 0;
  let page = 0;

  while (url) {
    const response = await fetchWithRetry(
      url,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      3,
      MOLLIE_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Mollie ${response.status}: ${shorten(await response.text())}`);
    }

    page += 1;
    const data = await response.json();
    const payments = data._embedded?.payments ?? [];
    let reachedEnd = false;

    for (const payment of payments) {
      const created = new Date(payment.createdAt).getTime();
      if (Number.isFinite(created) && created < since) {
        reachedEnd = true;
        continue;
      }

      try {
        const imported = await processMolliePayment(pool, payment);
        if (imported) count += 1;
      } catch (error) {
        console.error("mollie payment fail", payment.id, error);
      }
    }

    if (page % 10 === 0) {
      console.log(`mollie sweep progress: ${count} payments processed, oldest page ${page}`);
    }

    if (reachedEnd) break;
    url = data._links?.next?.href ?? null;
  }

  return count;
}

export async function processShopifyOrder(pool, order, options = {}) {
  const orderId = order.id;
  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  if (!orderId || lines.length === 0) return;

  const channel = determineShopifyChannel(order);
  const status = mapShopifyStatus(order.financial_status);
  const paidAt = order.processed_at ?? order.created_at ?? null;
  const invoiceNumber = order.order_number ? String(order.order_number) : (order.name ?? null);
  const invoiceUrl = order.order_status_url ?? null;

  const rows = lines.map((line) => {
    const quantity = Number(line.quantity ?? 1);
    const linePrice = Number(line.price ?? 0) * quantity;
    const discount = Number(line.total_discount ?? 0);
    const effectiveGross = +(linePrice - discount).toFixed(2);
    let vatRate = null;
    let vatAmount = null;

    if (Array.isArray(line.tax_lines) && line.tax_lines.length > 0) {
      const taxLine = line.tax_lines[0];
      vatRate = taxLine.rate ? +(Number(taxLine.rate) * 100).toFixed(2) : null;
      vatAmount = +line.tax_lines
        .reduce((sum, item) => sum + Number(item.price ?? 0), 0)
        .toFixed(2);
    }

    const taxesIncluded = order.taxes_included !== false;
    const amountGross = taxesIncluded
      ? effectiveGross
      : +(effectiveGross + (vatAmount ?? 0)).toFixed(2);
    const amountNet =
      vatAmount !== null
        ? +(amountGross - vatAmount).toFixed(2)
        : vatRate
          ? +(amountGross / (1 + vatRate / 100)).toFixed(2)
          : null;

    return {
      external_id: `${orderId}-${line.id}`,
      source: "shopify",
      channel,
      machine_id: null,
      article_number: line.sku ?? null,
      product_name: line.title ?? line.name ?? null,
      amount_gross: amountGross,
      amount_net: amountNet,
      vat_amount: vatAmount,
      vat_rate: vatRate,
      discount_amount: discount > 0 ? discount : null,
      invoice_number: invoiceNumber,
      status,
      paid_at: paidAt,
      description_raw: null,
      invoice_url: invoiceUrl,
      raw_payload: { order_id: orderId, line },
      parse_status: "ok",
      parse_error_message: null,
    };
  });

  if (!options.skipTransactions) {
    await upsertRows(pool, "public.transactions", transactionColumns, rows, [
      "source",
      "external_id",
    ]);
  }

  const lineOriginalTotal = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.price ?? 0) * Number(line.quantity ?? 1), 0),
  );
  const lineDiscountTotal = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.total_discount ?? 0), 0),
  );
  const lineDiscountedTotal = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount_gross ?? 0), 0));
  const lineTaxTotal = roundMoney(rows.reduce((sum, row) => sum + Number(row.vat_amount ?? 0), 0));
  const taxRates = summarizeOrderTaxRates(lines);

  await upsertRows(
    pool,
    "public.shopify_order_summaries",
    shopifyOrderSummaryColumns,
    [
      {
        external_id: String(orderId),
        order_name: order.name ?? null,
        order_number: invoiceNumber,
        source_name: order.source_name ?? null,
        channel,
        financial_status: status,
        processed_at: paidAt,
        created_at_shopify: order.created_at ?? null,
        updated_at_shopify: order.updated_at ?? null,
        taxes_included: order.taxes_included ?? null,
        line_original_total: lineOriginalTotal,
        line_discounted_total: lineDiscountedTotal,
        line_discount_total: lineDiscountTotal,
        line_tax_total: lineTaxTotal,
        subtotal_price: nullableMoney(order.subtotal_price),
        current_subtotal_price: nullableMoney(order.current_subtotal_price),
        total_discounts: nullableMoney(order.total_discounts),
        current_total_discounts: nullableMoney(order.current_total_discounts),
        total_shipping: nullableMoney(order.total_shipping),
        total_tax: nullableMoney(order.total_tax),
        current_total_tax: nullableMoney(order.current_total_tax),
        total_price: nullableMoney(order.total_price),
        current_total_price: nullableMoney(order.current_total_price),
        total_refunded: nullableMoney(order.total_refunded),
        net_payment: nullableMoney(order.net_payment),
        raw_payload: {
          order_id: orderId,
          name: order.name ?? null,
          source_name: order.source_name ?? null,
          financial_status: order.financial_status ?? null,
          tax_rates: taxRates,
          line_count: lines.length,
        },
      },
    ],
    ["external_id"],
  );
}

function summarizeOrderTaxRates(lines) {
  const byRate = new Map();
  for (const line of lines) {
    const taxLines = Array.isArray(line.tax_lines) ? line.tax_lines : [];
    for (const taxLine of taxLines) {
      const rawRate = Number(taxLine.rate ?? 0);
      if (!Number.isFinite(rawRate)) continue;
      const rate = rawRate > 1 ? rawRate : rawRate * 100;
      const amount = Number(taxLine.price ?? 0);
      const key = rate.toFixed(4);
      byRate.set(key, (byRate.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0));
    }
  }

  return [...byRate.entries()]
    .map(([key, amount]) => {
      const rate = roundMoney(Number(key));
      return {
        name: `BTW ${rate}%`,
        rate,
        amount: roundMoney(amount),
      };
    })
    .filter((line) => Math.abs(line.amount) > 0.004);
}

async function processMolliePayment(pool, paymentIdOrObject) {
  const payment =
    typeof paymentIdOrObject === "string"
      ? await fetchMolliePayment(pool, paymentIdOrObject)
      : paymentIdOrObject;

  const description = payment.description ?? "";
  const amountGross = Number(payment.amount?.value ?? 0);
  const discountAmount = payment.amountRefunded?.value
    ? Number(payment.amountRefunded.value)
    : null;
  const effectiveGross = discountAmount ? +(amountGross - discountAmount).toFixed(2) : amountGross;
  const paidAtFromMollie = payment.paidAt ?? payment.createdAt ?? null;
  const status = mapMollieStatus(payment.status);
  const parsed = parseAfsDescription(description);
  const legacyBoldAt = parseLegacyBoldTimestamp(description);

  if (!parsed.ok) {
    await upsertRows(
      pool,
      "public.mollie_transactions",
      mollieTransactionColumns,
      [
        {
          payment_id: payment.id,
          mollie_created_at: payment.createdAt ?? null,
          mollie_paid_at: payment.paidAt ?? null,
          status,
          amount_gross: amountGross,
          amount_net: null,
          vat_amount: null,
          vat_rate: null,
          discount_amount: discountAmount,
          description_raw: description,
          legacy_bold_at: legacyBoldAt,
          parsed_afs_number: null,
          parsed_article_number: null,
          parsed_invoice_number: null,
          parsed_paid_at: null,
          machine_id: null,
          parse_status: "parse_error",
          parse_error_message: parsed.error,
          sales_action: "not_parsed",
          sales_transaction_id: null,
          raw_payload: payment,
        },
      ],
      ["payment_id"],
    );
    if (MOLLIE_VERBOSE_PARSE_ERRORS) {
      console.log(`mollie payment logged as not parsed ${payment.id}: ${parsed.error}`);
    }
    return true;
  }

  let machineId = null;
  const vatRate = parsed.vat_rate;
  const articleNumber = parsed.article_number;
  const invoiceNumber = parsed.invoice_number;
  const paidAt = paidAtFromMollie ?? parsed.paid_at;
  const vat = calcNetVat(effectiveGross, vatRate);
  const amountNet = vat.net;
  const vatAmount = vat.vat;

  const machine = await pool.query("SELECT id FROM public.machines WHERE afs_number = $1 LIMIT 1", [
    parsed.afs_number,
  ]);
  machineId = machine.rows[0]?.id ?? null;

  let salesAction = "added";
  let salesTransactionId = null;
  const existingSales = await findExistingSalesTransaction(pool, payment.id, invoiceNumber);

  if (existingSales) {
    salesAction = "already_exists";
    salesTransactionId = existingSales.id;
  } else {
    salesTransactionId = await upsertSalesTransaction(pool, {
      external_id: payment.id,
      source: "mollie",
      channel: "bold_afs",
      machine_id: machineId,
      article_number: articleNumber,
      product_name: null,
      amount_gross: amountGross,
      amount_net: amountNet,
      vat_amount: vatAmount,
      vat_rate: vatRate,
      discount_amount: discountAmount,
      invoice_number: invoiceNumber,
      status,
      paid_at: paidAt,
      description_raw: description,
      invoice_url: null,
      raw_payload: payment,
      parse_status: "ok",
      parse_error_message: null,
    });
  }

  await upsertRows(
    pool,
    "public.mollie_transactions",
    mollieTransactionColumns,
    [
      {
        payment_id: payment.id,
        mollie_created_at: payment.createdAt ?? null,
        mollie_paid_at: payment.paidAt ?? null,
        status,
        amount_gross: amountGross,
        amount_net: amountNet,
        vat_amount: vatAmount,
        vat_rate: vatRate,
        discount_amount: discountAmount,
        description_raw: description,
        legacy_bold_at: legacyBoldAt,
        parsed_afs_number: parsed.afs_number,
        parsed_article_number: articleNumber,
        parsed_invoice_number: invoiceNumber,
        parsed_paid_at: paidAt,
        machine_id: machineId,
        parse_status: "ok",
        parse_error_message: null,
        sales_action: salesAction,
        sales_transaction_id: salesTransactionId,
        raw_payload: payment,
      },
    ],
    ["payment_id"],
  );
  return true;
}

async function findExistingSalesTransaction(pool, paymentId, invoiceNumber) {
  const byPayment = await pool.query(
    "SELECT id FROM public.transactions WHERE source = 'mollie' AND external_id = $1 LIMIT 1",
    [paymentId],
  );
  if (byPayment.rows[0]) return byPayment.rows[0];

  if (!invoiceNumber) return null;
  const byInvoice = await pool.query(
    `
      SELECT id
      FROM public.transactions
      WHERE source = 'mollie'
        AND channel = 'bold_afs'
        AND invoice_number = $1
      ORDER BY
        CASE WHEN external_id LIKE 'bold-historical-%' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    `,
    [invoiceNumber],
  );
  return byInvoice.rows[0] ?? null;
}

async function upsertSalesTransaction(pool, row) {
  const columns = Object.keys(row).filter((key) => transactionColumns.includes(key));
  const values = columns.map((column) => row[column]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updateColumns = columns.filter((column) => !["source", "external_id"].includes(column));
  const setters = updateColumns
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ");

  const result = await pool.query(
    `
      INSERT INTO public.transactions (${columns.map(quoteIdent).join(", ")})
      VALUES (${placeholders})
      ON CONFLICT ("source", "external_id")
      DO UPDATE SET ${setters}
      RETURNING id
    `,
    values,
  );

  return result.rows[0]?.id ?? null;
}

async function fetchMolliePayment(pool, paymentId) {
  const apiKey = await getMollieApiKey(pool);

  const response = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Mollie ${response.status}: ${shorten(await response.text())}`);
  }

  return response.json();
}

async function getMollieApiKey(pool) {
  try {
    const result = await pool.query(
      "SELECT api_key, active FROM public.mollie_settings WHERE id = $1 LIMIT 1",
      ["default"],
    );
    const settings = result.rows[0];

    if (settings) {
      if (settings.active === false) throw new Error("Mollie-koppeling is uitgeschakeld");
      const storedKey = String(settings.api_key ?? "").trim();
      if (storedKey) return storedKey;
    }
  } catch (error) {
    if (error?.code !== "42P01") throw error;
  }

  const envKey = String(process.env.MOLLIE_API_KEY ?? "").trim();
  if (envKey) return envKey;

  throw new Error("Mollie API-token ontbreekt");
}

async function recordSweep(pool, channel, status, message, processed) {
  await pool.query(
    `
      INSERT INTO public.sync_state (
        channel,
        last_sweep_at,
        last_sweep_status,
        last_sweep_message,
        records_processed,
        updated_at
      )
      VALUES ($1, now(), $2, $3, $4, now())
      ON CONFLICT (channel) DO UPDATE SET
        last_sweep_at = EXCLUDED.last_sweep_at,
        last_sweep_status = EXCLUDED.last_sweep_status,
        last_sweep_message = EXCLUDED.last_sweep_message,
        records_processed = EXCLUDED.records_processed,
        updated_at = now()
    `,
    [channel, status, message, processed],
  );
}

async function upsertRows(pool, table, allowedColumns, rows, conflictColumns) {
  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => allowedColumns.includes(key));
    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    const setters = updateColumns
      .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
      .join(", ");

    await pool.query(
      `
        INSERT INTO ${table} (${columns.map(quoteIdent).join(", ")})
        VALUES (${placeholders})
        ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")})
        DO UPDATE SET ${setters}
      `,
      values,
    );
  }
}

async function fetchWithRetry(url, init, attempts = 3, timeoutMs = 30000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function normalizeShopDomain(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function determineShopifyChannel(order) {
  const source = String(order.source_name ?? "").toLowerCase();
  if (source === "pos" || order.location_id) return "shopify_winkel";
  return "shopify_webshop";
}

function mapShopifyStatus(status) {
  switch (status) {
    case "paid":
      return "paid";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "voided":
      return "canceled";
    case "pending":
      return "pending";
    case "authorized":
      return "authorized";
    case "partially_paid":
      return "partially_paid";
    case "canceled":
      return "canceled";
    default:
      return "other";
  }
}

function mapGraphqlFinancialStatus(status) {
  switch (String(status ?? "").toUpperCase()) {
    case "PAID":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "PARTIALLY_REFUNDED":
      return "partially_refunded";
    case "VOIDED":
      return "canceled";
    case "PENDING":
      return "pending";
    case "AUTHORIZED":
      return "authorized";
    case "PARTIALLY_PAID":
      return "partially_paid";
    default:
      return "other";
  }
}

function mapMollieStatus(status) {
  const allowed = ["open", "canceled", "pending", "authorized", "expired", "failed", "paid"];
  return allowed.includes(status) ? status : "other";
}

function parseAfsDescription(description) {
  if (!description || typeof description !== "string") {
    return { ok: false, error: "Lege omschrijving" };
  }

  const parts = description.trim().split(/\s+/);
  if (parts.length !== 6) {
    return { ok: false, error: `Verwacht 6 velden, gekregen ${parts.length}` };
  }

  const [afs, vatRaw, invoice, dateStr, timeStr, article] = parts;
  if (!/^\d+$/.test(afs)) return { ok: false, error: `AFS-nummer niet numeriek: "${afs}"` };
  if (vatRaw !== "09" && vatRaw !== "21") {
    return { ok: false, error: `Btw-tarief moet exact "09" of "21" zijn, kreeg "${vatRaw}"` };
  }
  if (!/^\d+$/.test(invoice))
    return { ok: false, error: `Factuurnummer niet numeriek: "${invoice}"` };
  if (!/^\d+$/.test(article))
    return { ok: false, error: `Artikelnummer niet numeriek: "${article}"` };

  const dateMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dateMatch) return { ok: false, error: `Datum moet dd-mm-jjjj zijn, kreeg "${dateStr}"` };
  if (!timeMatch) return { ok: false, error: `Tijd moet hh:mm:ss zijn, kreeg "${timeStr}"` };

  const [, dd, mm, yyyy] = dateMatch;
  const [, hh, mi, ss] = timeMatch;
  const iso = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+01:00`).toISOString();

  return {
    ok: true,
    afs_number: afs,
    vat_rate: vatRaw === "09" ? 9 : 21,
    invoice_number: invoice,
    paid_at: iso,
    article_number: article,
  };
}

function parseLegacyBoldTimestamp(description) {
  const match = String(description ?? "").match(
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(CET|CEST)\s+(\d{4})$/,
  );
  if (!match) return null;

  const monthMap = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const [, monthName, day, hour, minute, second, zone, year] = match;
  const month = monthMap[monthName];
  const offset = zone === "CEST" ? "+02:00" : "+01:00";
  const parsed = new Date(
    `${year}-${month}-${day.padStart(2, "0")}T${hour}:${minute}:${second}${offset}`,
  );

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function calcNetVat(gross, vatRate) {
  const net = +(gross / (1 + vatRate / 100)).toFixed(2);
  const vat = +(gross - net).toFixed(2);
  return { net, vat };
}

function roundMoney(value) {
  return Number.isFinite(Number(value)) ? +Number(value).toFixed(2) : 0;
}

function nullableMoney(value) {
  return value === null || value === undefined || value === "" ? null : roundMoney(value);
}

function moneyAmount(moneyBag) {
  return Number(moneyBag?.shopMoney?.amount ?? 0);
}

function pick(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function gidTail(gid) {
  return (
    String(gid ?? "")
      .split("/")
      .pop() || String(gid ?? "")
  );
}

function verifyShopifyHmac(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function shorten(value, max = 400) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
