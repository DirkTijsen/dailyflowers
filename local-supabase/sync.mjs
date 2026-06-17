import crypto from "node:crypto";

const SHOPIFY_INITIAL_LOOKBACK_DAYS = Number(
  process.env.SHOPIFY_INITIAL_LOOKBACK_DAYS ?? process.env.SHOPIFY_SYNC_DAYS ?? 60,
);
const SHOPIFY_INCREMENTAL_OVERLAP_HOURS = Number(
  process.env.SHOPIFY_INCREMENTAL_OVERLAP_HOURS ?? 24,
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

export async function markSweepRunning(pool) {
  await Promise.all([
    recordSweep(pool, "shopify_webshop", "running", "Sweep gestart...", 0),
    recordSweep(pool, "shopify_winkel", "running", "Sweep gestart...", 0),
    recordSweep(pool, "bold_afs", "running", "Sweep gestart...", 0),
  ]);
}

export async function runSweep(pool) {
  await sweepShopify(pool);
  await sweepMollie(pool);
}

export async function runShopifySweepFrom(pool, sinceIso, options = {}) {
  await sweepShopify(pool, { ...options, sinceIso });
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

    let total = 0;
    const errors = [];

    for (const conn of result.rows) {
      try {
        const sinceIso = options.sinceIso ?? determineShopifySince(conn);
        total += await sweepShopifyConnection(pool, conn, sinceIso, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${conn.label}: ${message}`);
        console.error("shopify conn fail", conn.label, message);
      }
    }

    const status = errors.length > 0 ? "error" : "ok";
    const message =
      errors.length > 0
        ? errors.join(" | ")
        : `Sweep voltooid (${result.rows.length} koppeling(en))`;
    await recordSweep(pool, "shopify_webshop", status, message, total);
    await recordSweep(pool, "shopify_winkel", status, message, total);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSweep(pool, "shopify_webshop", "error", message, 0);
    await recordSweep(pool, "shopify_winkel", "error", message, 0);
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
