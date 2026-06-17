import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import Papa from "papaparse";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Gebruik: node local-supabase/import-shopify-payments-csv.mjs <payment_transactions_export.csv>");
  process.exit(1);
}

const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";

const pool = new Pool({ connectionString: databaseUrl });

const balanceColumns = [
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

const payoutColumns = [
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
  "raw_payload",
  "synced_at",
];

async function main() {
  const csv = fs.readFileSync(inputPath, "utf8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 5))}`);
  }

  const rows = parsed.data.map(normalizeCsvRow).filter((row) => row.processed_at);
  const connection = await activeShopifyConnection();
  const orderMap = await loadOrderMap(rows.map((row) => row.order_name).filter(Boolean));
  const batchId = `shopify-payments-csv-${new Date().toISOString()}`;
  const existing = await loadExistingBalanceRows(connection.shop_domain, rows);
  const payoutGroups = new Map();

  let updatedExisting = 0;
  let insertedCsv = 0;
  let skippedRows = 0;

  for (const csvRow of rows) {
    const sourceOrderId = orderMap.get(csvRow.order_name) ?? null;
    const matchKeys = [
      matchKey(sourceOrderId, csvRow),
      matchKey(csvRow.order_name, csvRow),
      paymentMovementKey(csvRow),
    ].filter(Boolean);
    const existingRow = takeFirstExisting(existing, matchKeys);
    const balanceTransactionId = existingRow?.balance_transaction_id ?? `csv:${hashCsvRow(csvRow)}`;
    const dbRow = {
      connection_id: connection.id,
      shop_domain: connection.shop_domain,
      balance_transaction_id: balanceTransactionId,
      payout_id: csvRow.payout_id,
      type: csvRow.type,
      test: null,
      payout_status: csvRow.payout_status,
      currency: csvRow.currency,
      amount: csvRow.amount,
      fee: csvRow.fee,
      net: csvRow.net,
      source_id: csvRow.checkout_id,
      source_type: "shopify_payments_csv",
      source_order_id: sourceOrderId,
      source_order_transaction_id: null,
      processed_at: csvRow.processed_at,
      order_name: csvRow.order_name,
      checkout_id: csvRow.checkout_id,
      payment_method_name: csvRow.payment_method_name,
      card_brand: csvRow.card_brand,
      card_source: csvRow.card_source,
      available_on: csvRow.available_on,
      presentment_amount: csvRow.presentment_amount,
      presentment_currency: csvRow.presentment_currency,
      vat_amount: csvRow.vat_amount,
      import_source: "shopify_payments_csv",
      import_batch_id: batchId,
      raw_payload: csvRow.raw,
      synced_at: new Date().toISOString(),
    };

    if (existingRow) {
      await updateExistingBalanceRow(existingRow.id, dbRow);
      updatedExisting += 1;
    } else {
      const inserted = await upsertRows(
        "public.shopify_payment_balance_transactions",
        balanceColumns,
        [dbRow],
        ["shop_domain", "balance_transaction_id"],
      );
      insertedCsv += inserted;
    }

    if (csvRow.payout_id) addPayoutGroup(payoutGroups, csvRow, connection, batchId);
  }

  const payoutRows = [...payoutGroups.values()].map((group) => payoutGroupToRow(group));
  const upsertedPayouts = await upsertRows(
    "public.shopify_payment_payouts",
    payoutColumns,
    payoutRows,
    ["shop_domain", "payout_id"],
  );

  await recordSweep(
    "shopify_payments",
    "ok",
    `Shopify Payments CSV import: ${insertedCsv} nieuw, ${updatedExisting} verrijkt, ${upsertedPayouts} payouts`,
    insertedCsv + updatedExisting,
  );

  console.log(
    JSON.stringify(
      {
        file: inputPath,
        rows: rows.length,
        insertedCsv,
        updatedExisting,
        skippedRows,
        upsertedPayouts,
        batchId,
      },
      null,
      2,
    ),
  );
}

function normalizeCsvRow(row) {
  const processedAt = parseShopifyDate(row["Transaction Date"]);
  const orderName = clean(row.Order);
  return {
    processed_at: processedAt,
    type: normalizePaymentType(row.Type),
    order_name: orderName || null,
    card_brand: clean(row["Card Brand"]) || null,
    card_source: clean(row["Card Source"]) || null,
    payout_status: clean(row["Payout Status"]).toLowerCase() || null,
    payout_date: parseDateOnly(row["Payout Date"]),
    payout_id: clean(row["Payout ID"]) || null,
    available_on: parseDateOnly(row["Available On"]),
    amount: money(row.Amount),
    fee: money(row.Fee),
    net: money(row.Net),
    checkout_id: clean(row.Checkout) || null,
    payment_method_name: clean(row["Payment Method Name"]) || null,
    presentment_amount: money(row["Presentment Amount"]),
    presentment_currency: clean(row["Presentment Currency"]) || null,
    currency: clean(row.Currency) || null,
    vat_amount: money(row.VAT),
    raw: row,
  };
}

async function activeShopifyConnection() {
  const result = await pool.query(
    `
      SELECT id, shop_domain, label
      FROM public.shopify_connections
      WHERE active = true
      ORDER BY created_at
      LIMIT 1
    `,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Geen actieve Shopify-koppeling gevonden");
  return { ...row, shop_domain: normalizeShopDomain(row.shop_domain) };
}

async function loadOrderMap(orderNames) {
  const unique = [...new Set(orderNames)].filter(Boolean);
  const map = new Map();
  for (const chunk of chunks(unique, 1000)) {
    const result = await pool.query(
      `
        SELECT external_id, order_name
        FROM public.shopify_order_summaries
        WHERE order_name = ANY($1)
      `,
      [chunk],
    );
    for (const row of result.rows) map.set(row.order_name, row.external_id);
  }
  return map;
}

async function loadExistingBalanceRows(shopDomain, rows) {
  const dates = rows.map((row) => new Date(row.processed_at).getTime()).filter(Number.isFinite);
  if (dates.length === 0) return new Map();

  const start = new Date(Math.min(...dates) - 24 * 3600 * 1000).toISOString();
  const end = new Date(Math.max(...dates) + 24 * 3600 * 1000).toISOString();
  const result = await pool.query(
    `
      SELECT
        id,
        balance_transaction_id,
        source_order_id,
        order_name,
        type,
        processed_at,
        amount,
        fee,
        net,
        payout_id,
        import_source
      FROM public.shopify_payment_balance_transactions
      WHERE shop_domain = $1
        AND processed_at >= $2
        AND processed_at <= $3
      ORDER BY processed_at, (import_source = 'shopify_payments_csv'), balance_transaction_id
    `,
    [shopDomain, start, end],
  );

  const map = new Map();
  for (const row of result.rows) {
    for (const key of [matchKey(row.source_order_id, row), matchKey(row.order_name, row)].filter(Boolean)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    const movementKey = paymentMovementKey(row);
    if (movementKey) {
      if (!map.has(movementKey)) map.set(movementKey, []);
      map.get(movementKey).push(row);
    }
  }
  return map;
}

function takeFirstExisting(existing, keys) {
  for (const key of keys) {
    const rows = existing.get(key);
    if (rows?.length) return rows.shift();
  }
  return null;
}

function matchKey(orderRef, row) {
  if (!orderRef || !row.processed_at || !row.type) return null;
  return [
    orderRef,
    row.type,
    secondKey(row.processed_at),
    moneyKey(row.amount),
    moneyKey(row.fee),
    moneyKey(row.net),
  ].join("|");
}

function paymentMovementKey(row) {
  if (!row.payout_id || !row.processed_at || !row.type) return null;
  return [
    "movement",
    row.payout_id,
    row.type,
    secondKey(row.processed_at),
    moneyKey(row.amount),
    moneyKey(row.fee),
    moneyKey(row.net),
  ].join("|");
}

async function updateExistingBalanceRow(id, row) {
  await pool.query(
    `
      UPDATE public.shopify_payment_balance_transactions
      SET
        payout_id = coalesce($2, payout_id),
        payout_status = coalesce($3, payout_status),
        currency = coalesce($4, currency),
        source_order_id = coalesce(source_order_id, $5),
        order_name = $6,
        checkout_id = $7,
        payment_method_name = $8,
        card_brand = $9,
        card_source = $10,
        available_on = $11,
        presentment_amount = $12,
        presentment_currency = $13,
        vat_amount = $14,
        import_source = 'shopify_payments_csv',
        import_batch_id = $15,
        raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('csv_import', $16::jsonb),
        synced_at = now()
      WHERE id = $1
    `,
    [
      id,
      row.payout_id,
      row.payout_status,
      row.currency,
      row.source_order_id,
      row.order_name,
      row.checkout_id,
      row.payment_method_name,
      row.card_brand,
      row.card_source,
      row.available_on,
      row.presentment_amount,
      row.presentment_currency,
      row.vat_amount,
      row.import_batch_id,
      JSON.stringify(row.raw_payload),
    ],
  );
}

function addPayoutGroup(groups, row, connection, batchId) {
  const key = `${connection.shop_domain}|${row.payout_id}`;
  if (!groups.has(key)) {
    groups.set(key, {
      connection_id: connection.id,
      shop_domain: connection.shop_domain,
      payout_id: row.payout_id,
      status: row.payout_status,
      payout_date: row.payout_date,
      currency: row.currency,
      amount: 0,
      charges_gross_amount: 0,
      charges_fee_amount: 0,
      refunds_gross_amount: 0,
      refunds_fee_amount: 0,
      adjustments_gross_amount: 0,
      adjustments_fee_amount: 0,
      row_count: 0,
      import_batch_id: batchId,
    });
  }
  const group = groups.get(key);
  group.row_count += 1;
  group.amount = roundMoney(group.amount + row.net);
  if (row.type === "charge") {
    group.charges_gross_amount = roundMoney(group.charges_gross_amount + row.amount);
    group.charges_fee_amount = roundMoney(group.charges_fee_amount + row.fee);
  } else if (row.type === "refund") {
    group.refunds_gross_amount = roundMoney(group.refunds_gross_amount + row.amount);
    group.refunds_fee_amount = roundMoney(group.refunds_fee_amount + row.fee);
  } else {
    group.adjustments_gross_amount = roundMoney(group.adjustments_gross_amount + row.amount);
    group.adjustments_fee_amount = roundMoney(group.adjustments_fee_amount + row.fee);
  }
}

function payoutGroupToRow(group) {
  return {
    connection_id: group.connection_id,
    shop_domain: group.shop_domain,
    payout_id: group.payout_id,
    status: group.status,
    payout_date: group.payout_date,
    currency: group.currency,
    amount: group.amount,
    charges_gross_amount: group.charges_gross_amount,
    charges_fee_amount: group.charges_fee_amount,
    refunds_gross_amount: group.refunds_gross_amount,
    refunds_fee_amount: group.refunds_fee_amount,
    adjustments_gross_amount: group.adjustments_gross_amount,
    adjustments_fee_amount: group.adjustments_fee_amount,
    raw_payload: {
      import_source: "shopify_payments_csv",
      import_batch_id: group.import_batch_id,
      row_count: group.row_count,
    },
    synced_at: new Date().toISOString(),
  };
}

async function upsertRows(table, allowedColumns, rows, conflictColumns) {
  let count = 0;
  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => allowedColumns.includes(key));
    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    const setters = updateColumns
      .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
      .join(", ");
    const result = await pool.query(
      `
        INSERT INTO ${table} (${columns.map(quoteIdent).join(", ")})
        VALUES (${placeholders})
        ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")})
        DO UPDATE SET ${setters}
        RETURNING id
      `,
      values,
    );
    count += result.rowCount ?? 0;
  }
  return count;
}

async function recordSweep(channel, status, message, processed) {
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

function parseShopifyDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/.exec(raw);
  const iso = match ? `${match[1]}T${match[2]}${match[3]}:${match[4]}` : raw;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizePaymentType(value) {
  const type = clean(value).toLowerCase();
  if (type === "chargeback") return "dispute";
  return type || null;
}

function parseDateOnly(value) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function money(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? roundMoney(number) : 0;
}

function moneyKey(value) {
  return Number(value ?? 0).toFixed(2);
}

function secondKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return Math.floor(date.getTime() / 1000);
}

function roundMoney(value) {
  return Number.isFinite(Number(value)) ? +Number(value).toFixed(2) : 0;
}

function hashCsvRow(row) {
  return crypto
    .createHash("sha1")
    .update(
      [
        row.processed_at,
        row.type,
        row.order_name,
        row.payout_id,
        row.amount,
        row.fee,
        row.net,
        row.checkout_id,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

function chunks(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function normalizeShopDomain(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function clean(value) {
  return String(value ?? "").trim();
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
