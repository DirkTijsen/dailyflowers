import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import Papa from "papaparse";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Gebruik: node local-supabase/import-shopify-cash-sessions-csv.mjs <payment_sessions_export.csv>");
  process.exit(1);
}

const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";

const pool = new Pool({ connectionString: databaseUrl });
const importBatchId = `shopify-cash-sessions-csv-${new Date().toISOString()}`;

const columns = [
  "location_id",
  "location_name",
  "session_start",
  "session_end",
  "register_id",
  "status",
  "discrepancy",
  "currency",
  "import_source",
  "import_batch_id",
  "raw_payload",
];

async function main() {
  const csv = fs.readFileSync(inputPath, "utf8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 5))}`);
  }

  const rows = parsed.data
    .map(normalizeCsvRow)
    .filter((row) => row.location_id && row.register_id && row.session_start)
    .filter((row) => new Date(row.session_start).getTime() >= Date.parse("2026-01-01T00:00:00Z"));

  const affected = await upsertRows(
    "public.shopify_cash_sessions",
    columns,
    rows,
    ["location_id", "register_id", "session_start"],
  );

  await recordSweep(
    "shopify_cash",
    "ok",
    `Shopify kassasessies CSV import: ${affected} sessies verwerkt`,
    affected,
  );

  console.log(
    JSON.stringify(
      {
        file: inputPath,
        rows: rows.length,
        affected,
        importBatchId,
      },
      null,
      2,
    ),
  );
}

function normalizeCsvRow(row) {
  return {
    location_id: clean(row["Location ID"]) || null,
    location_name: clean(row["Location name"]) || null,
    session_start: parseShopifyDate(row["Session start"]),
    session_end: parseShopifyDate(row["Session end"]),
    register_id: clean(row["Register ID"]) || null,
    status: clean(row.Status).toLowerCase() || null,
    discrepancy: money(row.Discrepancy),
    currency: clean(row.Currency) || null,
    import_source: "shopify_cash_sessions_csv",
    import_batch_id: importBatchId,
    raw_payload: row,
  };
}

async function upsertRows(table, columnNames, rows, conflictColumns) {
  if (rows.length === 0) return 0;
  let affected = 0;

  for (const chunk of chunks(rows, 500)) {
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const fields = columnNames.map((column, columnIndex) => {
        values.push(serializeValue(row[column]));
        return `$${rowIndex * columnNames.length + columnIndex + 1}`;
      });
      return `(${fields.join(", ")})`;
    });
    const updateColumns = columnNames.filter((column) => !conflictColumns.includes(column));
    const sql = `
      INSERT INTO ${table} (${columnNames.map(quoteIdent).join(", ")})
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")})
      DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(", ")}
    `;
    const result = await pool.query(sql, values);
    affected += result.rowCount ?? chunk.length;
  }

  return affected;
}

async function recordSweep(channel, status, message, recordsProcessed) {
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
    [channel, status, message, recordsProcessed],
  );
}

function parseShopifyDate(value) {
  const raw = clean(value);
  if (!raw || raw.toLowerCase() === "n.v.t.") return null;
  const match = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/.exec(raw);
  const normalized = match ? `${match[1]}T${match[2]}${match[3]}:${match[4]}` : raw;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function money(value) {
  const raw = clean(value)
    .replace(/^'/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(raw);
  return Number.isFinite(number) ? +number.toFixed(2) : 0;
}

function serializeValue(value) {
  if (value === undefined) return null;
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

function chunks(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
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
