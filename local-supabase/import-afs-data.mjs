import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Papa from "papaparse";
import pg from "pg";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";
const args = parseArgs(process.argv.slice(2));

if (!args.articles || !args.machines || !args.transactions) {
  console.error(
    "Gebruik: node local-supabase/import-afs-data.mjs --articles <bestand> --machines <bestand> --transactions <csv>",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const articleCount = await importArticles(pool, args.articles);
  const machineResult = await importMachines(pool, args.machines);
  const txResult = await importHistoricalTransactions(pool, args.transactions);

  console.log(`Artikelen geimporteerd: ${articleCount}`);
  console.log(`Machines ingevoerd/bijgewerkt: ${machineResult.total}`);
  console.log(`Historische transacties geimporteerd: ${txResult.count}`);
  console.log(`Legacy machines aangemaakt: ${txResult.legacyMachinesCreated}`);
} finally {
  await pool.end();
}

async function importArticles(pool, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseArticleRows(text);
  await upsertRows(pool, "public.bold_articles", rows, ["article_number"]);
  return rows.length;
}

async function importMachines(pool, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseMachineRows(text);
  const usedAfsNumbers = await loadUsedAfsNumbers(pool);
  let nextNumber = 1;
  let total = 0;

  for (const row of rows) {
    const existing = await pool.query(
      "SELECT id, afs_number FROM public.machines WHERE lower(display_name) = lower($1) LIMIT 1",
      [row.display_name],
    );

    if (existing.rows[0]) {
      await pool.query(
        `
          UPDATE public.machines
          SET display_name = $1, active = $2, notes = $3
          WHERE id = $4
        `,
        [row.display_name, row.active, row.notes, existing.rows[0].id],
      );
    } else {
      const afsNumber = nextAfsNumber(usedAfsNumbers, nextNumber);
      nextNumber += 1;
      await pool.query(
        `
          INSERT INTO public.machines (afs_number, machine_id, display_name, active, notes)
          VALUES ($1, NULL, $2, $3, $4)
        `,
        [afsNumber, row.display_name, row.active, row.notes],
      );
    }

    total += 1;
  }

  return { total };
}

async function importHistoricalTransactions(pool, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    throw new Error(`CSV kon niet volledig gelezen worden: ${parsed.errors[0].message}`);
  }

  const articles = await loadArticleMap(pool);
  const machineState = await loadMachineState(pool);
  const externalIdCounts = countHistoricalExternalIds(parsed.data);
  const externalIdSeen = new Map();
  const rows = [];
  let legacyMachinesCreated = 0;

  for (const row of parsed.data) {
    const articleNumber = clean(row["Art. nr."]);
    const productName = clean(row.Productnaam);
    const amountGross = parseMoney(row["Prijs incl."]);
    const machineName = clean(row.Machine);
    const invoiceNumber = clean(row.Factuurnummer) || null;
    const paidAt = parseDutchDate(row.Transactiedatum);
    const article = articles.get(articleNumber);
    const vatRate = article?.vat_rate ?? null;
    const vat = vatRate == null ? { net: null, vat: null } : calcNetVat(amountGross, vatRate);
    const machine = await ensureMachine(pool, machineState, machineName);

    if (machine.created) legacyMachinesCreated += 1;

    rows.push({
      external_id: makeExternalId(row, externalIdCounts, externalIdSeen),
      source: "mollie",
      channel: "bold_afs",
      machine_id: machine.id,
      article_number: articleNumber || null,
      product_name: productName || article?.product_name || null,
      amount_gross: amountGross,
      amount_net: vat.net,
      vat_amount: vat.vat,
      vat_rate: vatRate,
      discount_amount: null,
      invoice_number: invoiceNumber,
      status: mapHistoricalStatus(row.Transactiestatus),
      paid_at: paidAt,
      description_raw: null,
      invoice_url: null,
      raw_payload: {
        import_source: "bold_historical_csv",
        discount_name: clean(row["Naam korting"]) || null,
        original: row,
      },
      parse_status: "ok",
      parse_error_message: null,
    });
  }

  await upsertRows(pool, "public.transactions", rows, ["source", "external_id"]);
  return { count: rows.length, legacyMachinesCreated };
}

function parseArticleRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [articleNumber, productName, priceRaw, vatRaw, statusRaw, categoryRaw] = line
        .split(/\t+/)
        .map((part) => part.trim());

      if (!articleNumber || !productName || productName.toLowerCase().includes("test product")) {
        return null;
      }

      const vatRate = parsePercent(vatRaw);
      return {
        article_number: articleNumber,
        product_name: productName,
        price_gross: parseMoney(priceRaw),
        vat_rate: vatRate,
        active: /^actief$/i.test(statusRaw ?? ""),
        category: categoryRaw || null,
      };
    })
    .filter(Boolean);
}

function parseMachineRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, provider, status, indicator, route] = line.split(/\t+/).map((part) => part.trim());
      return {
        display_name: name,
        active: /^actief$/i.test(status ?? ""),
        notes: [`Provider: ${provider || "-"}`, `Indicator: ${indicator || "-"}`, `Route: ${route || "-"}`].join(
          "; ",
        ),
      };
    })
    .filter((row) => row.display_name);
}

async function loadArticleMap(pool) {
  const result = await pool.query(
    "SELECT article_number, product_name, vat_rate FROM public.bold_articles",
  );
  return new Map(
    result.rows.map((row) => [
      row.article_number,
      {
        product_name: row.product_name,
        vat_rate: row.vat_rate == null ? null : Number(row.vat_rate),
      },
    ]),
  );
}

async function loadMachineState(pool) {
  const result = await pool.query("SELECT id, afs_number, display_name FROM public.machines");
  const byName = new Map();
  const usedAfsNumbers = new Set();

  for (const row of result.rows) {
    byName.set(normalizeName(row.display_name), { id: row.id, created: false });
    usedAfsNumbers.add(row.afs_number);
  }

  return { byName, usedAfsNumbers, nextLegacyNumber: 1 };
}

async function loadUsedAfsNumbers(pool) {
  const result = await pool.query("SELECT afs_number FROM public.machines");
  return new Set(result.rows.map((row) => row.afs_number));
}

async function ensureMachine(pool, state, machineName) {
  const displayName = machineName || "Onbekend";
  const key = normalizeName(displayName);
  const existing = state.byName.get(key);
  if (existing) return existing;

  const afsNumber = nextLegacyAfsNumber(state);
  const active = displayName.toLowerCase() !== "weg";
  const result = await pool.query(
    `
      INSERT INTO public.machines (afs_number, machine_id, display_name, active, notes)
      VALUES ($1, NULL, $2, $3, $4)
      RETURNING id
    `,
    [afsNumber, displayName, active, "Automatisch aangemaakt uit historische Bold-import"],
  );
  const created = { id: result.rows[0].id, created: false };
  state.byName.set(key, created);
  state.usedAfsNumbers.add(afsNumber);
  return { id: result.rows[0].id, created: true };
}

function nextAfsNumber(usedAfsNumbers, start) {
  let number = start;
  while (usedAfsNumbers.has(`AFS-${String(number).padStart(3, "0")}`)) {
    number += 1;
  }
  const afsNumber = `AFS-${String(number).padStart(3, "0")}`;
  usedAfsNumbers.add(afsNumber);
  return afsNumber;
}

function nextLegacyAfsNumber(state) {
  while (state.usedAfsNumbers.has(`LEGACY-${String(state.nextLegacyNumber).padStart(3, "0")}`)) {
    state.nextLegacyNumber += 1;
  }
  const afsNumber = `LEGACY-${String(state.nextLegacyNumber).padStart(3, "0")}`;
  state.nextLegacyNumber += 1;
  return afsNumber;
}

async function upsertRows(pool, table, rows, conflictColumns, batchSize = 500) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row, rowIndex) => {
      const params = columns.map((column, columnIndex) => {
        const value = row[column];
        values.push(value && typeof value === "object" ? JSON.stringify(value) : value);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${params.join(", ")})`;
    });
    const updates = columns
      .filter((column) => !conflictColumns.includes(column))
      .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
      .join(", ");

    await pool.query(
      `
        INSERT INTO ${table} (${columns.map(quoteIdent).join(", ")})
        VALUES ${tuples.join(", ")}
        ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")})
        DO UPDATE SET ${updates}
      `,
      values,
    );
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    parsed[key] = inlineValue ?? argv[index + 1];
    if (inlineValue == null) index += 1;
  }
  return parsed;
}

function parseMoney(value) {
  const normalized = clean(value).replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercent(value) {
  const parsed = Number(clean(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDutchDate(value) {
  const match = clean(value).match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).toISOString();
}

function calcNetVat(gross, rate) {
  const net = +(gross / (1 + rate / 100)).toFixed(2);
  return { net, vat: +(gross - net).toFixed(2) };
}

function mapHistoricalStatus(status) {
  const normalized = clean(status).toLowerCase();
  if (normalized.includes("afgerond")) return "paid";
  if (normalized.includes("geannuleerd")) return "canceled";
  if (normalized.includes("mislukt")) return "failed";
  if (normalized.includes("verlopen")) return "expired";
  if (normalized.includes("terugbetaald")) return "refunded";
  if (normalized.includes("open")) return "open";
  if (normalized.includes("afwachting") || normalized.includes("pending")) return "pending";
  if (normalized.includes("geautoriseerd") || normalized.includes("authorized")) return "authorized";
  return "other";
}

function countHistoricalExternalIds(rows) {
  const counts = new Map();
  for (const row of rows) {
    const baseId = makeExternalIdBase(row);
    counts.set(baseId, (counts.get(baseId) ?? 0) + 1);
  }
  return counts;
}

function makeExternalId(row, counts, seen) {
  const baseId = makeExternalIdBase(row);
  const count = counts.get(baseId) ?? 1;
  if (count === 1) return baseId;

  const occurrence = (seen.get(baseId) ?? 0) + 1;
  seen.set(baseId, occurrence);
  return `${baseId}-${occurrence}`;
}

function makeExternalIdBase(row) {
  const stable = [
    clean(row.Factuurnummer),
    clean(row["Art. nr."]),
    clean(row.Productnaam),
    clean(row["Prijs incl."]),
    clean(row.Transactiestatus),
    clean(row.Machine),
    clean(row.Transactiedatum),
    clean(row["Naam korting"]),
  ].join("|");
  const hash = crypto.createHash("md5").update(stable).digest("hex").slice(0, 16);
  return `bold-historical-${hash}`;
}

function normalizeName(value) {
  return clean(value).toLowerCase();
}

function clean(value) {
  return String(value ?? "").trim();
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
