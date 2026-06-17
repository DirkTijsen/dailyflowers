import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  markSweepRunning,
  processMollieWebhook,
  processShopifyWebhook,
  runSweep,
} from "./sync.mjs";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const port = Number(process.env.PORT ?? process.env.LOCAL_SUPABASE_PORT ?? 54321);
const host = process.env.HOST ?? process.env.LOCAL_SUPABASE_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const hostedRuntime = isHostedRuntime();
const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";
const jwtSecret = process.env.LOCAL_JWT_SECRET ?? "daily-flowers-local-jwt-secret-change-me";
const tokenTtlSeconds = Number(process.env.LOCAL_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const pool = new Pool({ connectionString: databaseUrl });
const staticRoot = path.resolve(process.cwd(), "dist", "client");
const builtServerEntry = path.resolve(process.cwd(), "dist", "server", "server.js");
let builtAppServerPromise;

const resources = {
  budgets: {
    table: "public.budgets",
    columns: ["id", "channel", "machine_id", "period", "amount", "created_at", "updated_at"],
    writable: true,
  },
  bold_articles: {
    table: "public.bold_articles",
    columns: [
      "id",
      "article_number",
      "product_name",
      "price_gross",
      "vat_rate",
      "active",
      "category",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  gl_accounts: {
    table: "public.gl_accounts",
    columns: [
      "id",
      "account_code",
      "account_name",
      "account_type",
      "statement_type",
      "debit_credit",
      "classification",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "active",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  gl_transactions: {
    table: "public.gl_transactions",
    columns: [
      "id",
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
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  pl_settings: {
    table: "public.pl_settings",
    columns: ["id", "revenue_cutoff_quarter", "created_at", "updated_at"],
    writable: true,
  },
  machines: {
    table: "public.machines",
    columns: [
      "id",
      "afs_number",
      "machine_id",
      "display_name",
      "active",
      "notes",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_connections: {
    table: "public.shopify_connections",
    columns: [
      "id",
      "label",
      "shop_domain",
      "client_id",
      "access_token",
      "active",
      "last_synced_at",
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  shopify_order_summaries: {
    table: "public.shopify_order_summaries",
    columns: [
      "id",
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
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  mollie_settings: {
    table: "public.mollie_settings",
    columns: ["id", "api_key", "active", "created_at", "updated_at"],
    writable: true,
  },
  mollie_settings_status: {
    table: "public.mollie_settings_status",
    columns: ["id", "active", "api_key_configured", "created_at", "updated_at"],
    writable: false,
  },
  mollie_transactions: {
    table: "public.mollie_transactions",
    columns: [
      "id",
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
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  users: {
    table: "(SELECT id, email, created_at FROM local_auth.users) AS users",
    columns: ["id", "email", "created_at"],
    writable: true,
  },
  vw_bold_mollie_monthly_reconciliation: {
    table: "public.vw_bold_mollie_monthly_reconciliation",
    columns: [
      "period",
      "sales_paid_count",
      "mollie_paid_count",
      "paid_count_diff",
      "sales_paid_gross",
      "mollie_paid_gross",
      "paid_gross_diff",
      "sales_all_count",
      "mollie_all_count",
      "all_count_diff",
      "sales_all_gross",
      "mollie_all_gross",
      "all_gross_diff",
      "mollie_parsed_count",
      "mollie_parse_error_count",
      "mollie_linked_sales_count",
      "mollie_added_sales_count",
      "mollie_existing_sales_count",
      "mollie_not_added_count",
      "matched_paid_count",
      "matched_paid_gross",
      "bold_unmatched_paid_count",
      "bold_unmatched_paid_gross",
      "mollie_unmatched_paid_count",
      "mollie_unmatched_paid_gross",
      "sales_zero_paid_count",
      "mollie_non_bold_paid_count",
      "mollie_non_bold_paid_gross",
      "mollie_outside_bold_paid_count",
      "mollie_outside_bold_paid_gross",
      "mollie_duplicate_candidate_count",
      "paid_reconciled",
    ],
    writable: false,
  },
  vw_bold_mollie_reconciliation_issues: {
    table: "public.vw_bold_mollie_reconciliation_issues",
    columns: [
      "issue_type",
      "period",
      "occurred_at",
      "amount_gross",
      "reference",
      "product_name",
      "machine_name",
      "payment_id",
      "sales_transaction_id",
      "description_raw",
      "duplicate_count",
    ],
    writable: false,
  },
  sync_state: {
    table: "public.sync_state",
    columns: [
      "channel",
      "last_sweep_at",
      "last_sweep_status",
      "last_sweep_message",
      "records_processed",
      "updated_at",
    ],
    writable: true,
  },
  transactions: {
    table: "public.transactions",
    columns: [
      "id",
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
      "created_at",
      "updated_at",
    ],
    writable: true,
  },
  vat_rates: {
    table: "public.vat_rates",
    columns: ["id", "rate", "label", "active", "created_at"],
    writable: true,
  },
  vw_monthly_channel: {
    table: "public.vw_monthly_channel",
    columns: ["period", "channel", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_monthly_machine: {
    table: "public.vw_monthly_machine",
    columns: [
      "period",
      "channel",
      "machine_id",
      "display_name",
      "afs_number",
      "tx_count",
      "gross_total",
      "net_total",
      "vat_total",
    ],
    writable: false,
  },
  vw_monthly_vat: {
    table: "public.vw_monthly_vat",
    columns: ["period", "channel", "vat_rate", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_monthly_revenue_actuals: {
    table: "public.vw_monthly_revenue_actuals",
    columns: ["period", "channel", "tx_count", "gross_total", "net_total", "vat_total"],
    writable: false,
  },
  vw_shopify_analytics_monthly: {
    table: "public.vw_shopify_analytics_monthly",
    columns: [
      "period",
      "order_count",
      "paid_order_count",
      "non_paid_order_count",
      "paid_line_gross",
      "paid_line_tax",
      "paid_line_net",
      "paid_current_total",
      "non_paid_current_total",
      "api_current_total",
      "shipping_total",
      "refunded_total",
      "discount_total",
      "current_tax_total",
      "tax_total",
      "line_original_total",
      "line_discounted_total",
      "line_discount_total",
      "line_tax_total",
      "status_summary",
    ],
    writable: false,
  },
  vw_gl_quarterly_account: {
    table: "public.vw_gl_quarterly_account",
    columns: [
      "quarter_key",
      "year",
      "quarter",
      "account_id",
      "account_code",
      "account_name",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "entry_count",
      "amount",
    ],
    writable: false,
  },
  vw_gl_monthly_account: {
    table: "public.vw_gl_monthly_account",
    columns: [
      "period",
      "quarter_key",
      "year",
      "month",
      "account_id",
      "account_code",
      "account_name",
      "pl_section",
      "revenue_channel",
      "sort_order",
      "entry_count",
      "amount",
    ],
    writable: false,
  },
  vw_gl_yearly_status: {
    table: "public.vw_gl_yearly_status",
    columns: ["year", "transaction_count", "min_date", "max_date", "updated_through_date"],
    writable: false,
  },
  vw_gl_revenue_source_monthly: {
    table: "public.vw_gl_revenue_source_monthly",
    columns: ["period", "revenue_source", "tx_count", "net_total"],
    writable: false,
  },
  vw_sales_quarterly_channel: {
    table: "public.vw_sales_quarterly_channel",
    columns: [
      "quarter_key",
      "year",
      "quarter",
      "channel",
      "tx_count",
      "gross_total",
      "net_total",
      "vat_total",
    ],
    writable: false,
  },
};

const server = http.createServer(async (req, res) => {
  try {
    addCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${port}`}`);

    if (url.pathname.startsWith("/auth/v1/")) {
      await handleAuth(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      await handleRest(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/functions/v1/")) {
      await handleFunction(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      code: "LOCAL_SUPABASE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`Daily Flowers app/API: http://${host}:${port}`);
  console.log(`Postgres: ${redactConnectionString(databaseUrl)}`);
  console.log("Shopify sync: client_credentials + GraphQL Admin API");
  if (!hostedRuntime) console.log("Dev login: admin@dailyflowers.local / dailyflowers");
});

async function handleAuth(req, res, url) {
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const grantType = url.searchParams.get("grant_type");
    if (grantType !== "password") {
      sendJson(res, 400, {
        error: "unsupported_grant_type",
        error_description: "Only password login is implemented locally.",
      });
      return;
    }

    const body = await readJson(req);
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const user = await findLocalUser(email, password);

    if (!user) {
      sendJson(res, 400, {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
      return;
    }

    sendJson(res, 200, makeSession(user));
    return;
  }

  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const claims = verifyRequestClaims(req);
    if (!claims) {
      sendJson(res, 401, { message: "Invalid or missing access token" });
      return;
    }

    sendJson(res, 200, userFromClaims(claims));
    return;
  }

  if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
    sendJson(res, 204, null);
    return;
  }

  sendJson(res, 404, { message: "Auth endpoint not implemented locally" });
}

async function handleRest(req, res, url) {
  const resourceName = decodeURIComponent(
    url.pathname.replace(/^\/rest\/v1\//, "").split("/")[0] ?? "",
  );
  const resource = resources[resourceName];

  if (!resource) {
    sendJson(res, 404, { code: "PGRST102", message: `Unknown local resource: ${resourceName}` });
    return;
  }

  if (resourceName === "users") {
    await handleUsersRest(req, res, url, resource);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await selectRows(req, res, url, resource);
    return;
  }

  if (!resource.writable) {
    sendJson(res, 405, { message: `${resourceName} is read-only` });
    return;
  }

  if (req.method === "POST") {
    await insertRows(req, res, url, resource);
    return;
  }

  if (req.method === "PATCH") {
    await updateRows(req, res, url, resource);
    return;
  }

  if (req.method === "DELETE") {
    await deleteRows(req, res, url, resource);
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
}

const userWritableResource = {
  table: "local_auth.users",
  columns: ["id", "email", "password", "created_at"],
  writable: true,
};

async function handleUsersRest(req, res, url, publicResource) {
  if (req.method === "GET" || req.method === "HEAD") {
    await selectRows(req, res, url, publicResource);
    return;
  }

  if (req.method === "POST") {
    await insertUsers(req, res);
    return;
  }

  if (req.method === "PATCH") {
    await updateUsers(req, res, url);
    return;
  }

  if (req.method === "DELETE") {
    await deleteUsers(res, url);
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
}

async function insertUsers(req, res) {
  const body = await readJson(req);
  const rows = Array.isArray(body) ? body : [body];
  const returned = [];

  for (const row of rows) {
    const email = normalizeUserEmail(row?.email);
    const password = String(row?.password ?? "");
    if (!email || !password) {
      sendJson(res, 400, { message: "E-mail en wachtwoord zijn verplicht" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO local_auth.users (email, password)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, hashPassword(password)],
    );
    returned.push(...result.rows);
  }

  sendJson(res, 201, returned);
}

async function updateUsers(req, res, url) {
  const body = await readJson(req);
  const values = [];
  const setters = [];

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "email")) {
    const email = normalizeUserEmail(body.email);
    if (!email) {
      sendJson(res, 400, { message: "E-mail is verplicht" });
      return;
    }
    values.push(email);
    setters.push(`email = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "password")) {
    const password = String(body.password ?? "");
    if (!password) {
      sendJson(res, 400, { message: "Wachtwoord is verplicht" });
      return;
    }
    values.push(hashPassword(password));
    setters.push(`password = $${values.length}`);
  }

  if (setters.length === 0) {
    sendJson(res, 400, { message: "Geen wijzigingen opgegeven" });
    return;
  }

  const where = buildWhere(userWritableResource, url.searchParams, values);
  if (!where.clause) {
    sendJson(res, 400, { message: "Filter verplicht voor gebruikerswijziging" });
    return;
  }

  const result = await pool.query(
    `UPDATE local_auth.users SET ${setters.join(", ")}${where.clause} RETURNING id, email, created_at`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function deleteUsers(res, url) {
  const where = buildWhere(userWritableResource, url.searchParams);
  if (!where.clause) {
    sendJson(res, 400, { message: "Filter verplicht voor gebruikersverwijdering" });
    return;
  }

  const result = await pool.query(
    `DELETE FROM local_auth.users${where.clause} RETURNING id, email, created_at`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function handleFunction(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  const name = url.pathname.replace(/^\/functions\/v1\//, "");
  if (name === "daily-sweep") {
    await markSweepRunning(pool);
    runSweep(pool).catch((error) => console.error("local daily-sweep failed", error));
    sendJson(res, 202, {
      status: "started",
      local: true,
      message: "Sweep draait op de achtergrond. Status verschijnt onderaan het dashboard.",
    });
    return;
  }

  if (name === "shopify-webhook") {
    const rawBody = await readRaw(req);
    await processShopifyWebhook(pool, rawBody, req.headers["x-shopify-hmac-sha256"] ?? null);
    sendJson(res, 200, { ok: true, local: true });
    return;
  }

  if (name === "mollie-webhook") {
    const paymentId = await readMolliePaymentId(req);
    await processMollieWebhook(pool, paymentId);
    sendJson(res, 200, { ok: true, local: true });
    return;
  }

  sendJson(res, 404, { message: `Function not implemented locally: ${name}` });
}

async function selectRows(req, res, url, resource) {
  const select = parseSelect(url.searchParams.get("select") ?? "*");
  const { clause, values } = buildWhere(resource, url.searchParams);
  const order = buildOrder(resource, url.searchParams.getAll("order"));
  const range = getRange(req, url);
  const single = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
  const wantsCount = String(req.headers.prefer ?? "").includes("count=exact");

  const selectedColumns = selectSqlColumns(resource, select);
  let sql = `SELECT ${selectedColumns.sql} FROM ${resource.table}${clause}${order.sql}`;

  if (range.limit !== null) {
    values.push(range.limit);
    sql += ` LIMIT $${values.length}`;
  }
  if (range.offset !== null) {
    values.push(range.offset);
    sql += ` OFFSET $${values.length}`;
  }

  const result = await pool.query(sql, values);
  let rows = result.rows;
  if (select.nestedMachines) rows = await attachMachines(rows, select.machineColumns);
  if (selectedColumns.joinOnlyMachineId) {
    rows = rows.map(({ machine_id, ...row }) => row);
  }

  let count = null;
  if (wantsCount) {
    const countWhere = buildWhere(resource, url.searchParams);
    const countResult = await pool.query(
      `SELECT count(*)::int AS count FROM ${resource.table}${countWhere.clause}`,
      countWhere.values,
    );
    count = countResult.rows[0]?.count ?? 0;
  }

  const headers = {};
  if (wantsCount || range.limit !== null) {
    const start = range.offset ?? 0;
    const end = rows.length > 0 ? start + rows.length - 1 : start;
    headers["content-range"] = `${start}-${end}/${count ?? "*"}`;
  }

  if (req.method === "HEAD") {
    sendHead(res, 200, headers);
    return;
  }

  if (single) {
    if (rows.length !== 1) {
      sendJson(
        res,
        406,
        { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        headers,
      );
      return;
    }
    sendJson(res, 200, rows[0], headers);
    return;
  }

  sendJson(res, range.limit !== null ? 206 : 200, rows, headers);
}

async function insertRows(req, res, url, resource) {
  const body = await readJson(req);
  const rows = Array.isArray(body) ? body : [body];
  const returned = [];
  const conflictColumns = parseConflictColumns(resource, url.searchParams.get("on_conflict"));
  const prefer = String(req.headers.prefer ?? "");
  const ignoreDuplicates = prefer.includes("resolution=ignore-duplicates");

  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => resource.columns.includes(key));
    if (columns.length === 0) continue;

    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const conflictSql = buildConflictSql(columns, conflictColumns, ignoreDuplicates);
    const sql = `INSERT INTO ${resource.table} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders}) ${conflictSql} RETURNING *`;
    const result = await pool.query(sql, values);
    returned.push(...result.rows);
  }

  sendJson(res, 201, returned);
}

async function updateRows(req, res, url, resource) {
  const body = await readJson(req);
  const columns = Object.keys(body).filter((key) => resource.columns.includes(key));

  if (columns.length === 0) {
    sendJson(res, 400, { message: "No writable columns supplied" });
    return;
  }

  const values = columns.map((column) => body[column]);
  const setSql = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(", ");
  const where = buildWhere(resource, url.searchParams, values);
  const result = await pool.query(
    `UPDATE ${resource.table} SET ${setSql}${where.clause} RETURNING *`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function deleteRows(req, res, url, resource) {
  const where = buildWhere(resource, url.searchParams);
  const result = await pool.query(
    `DELETE FROM ${resource.table}${where.clause} RETURNING *`,
    where.values,
  );
  sendJson(res, 200, result.rows);
}

async function attachMachines(rows, machineColumns) {
  const ids = [...new Set(rows.map((row) => row.machine_id).filter(Boolean))];
  if (ids.length === 0) {
    return rows.map((row) => ({ ...row, machines: null }));
  }

  const columns = machineColumns.length > 0 ? machineColumns : ["display_name", "afs_number"];
  const select = ["id", ...columns.filter((column) => column !== "id")].map(quoteIdent).join(", ");
  const result = await pool.query(
    `SELECT ${select} FROM public.machines WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const machines = new Map(result.rows.map((row) => [row.id, stripToColumns(row, columns)]));
  return rows.map((row) => ({
    ...row,
    machines: row.machine_id ? (machines.get(row.machine_id) ?? null) : null,
  }));
}

function parseSelect(selectValue) {
  const parts = splitTopLevel(selectValue);
  const baseColumns = [];
  let star = false;
  let nestedMachines = false;
  let machineColumns = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === "*") {
      star = true;
      continue;
    }

    const machineMatch = /^machines\((.*)\)$/.exec(trimmed);
    if (machineMatch) {
      nestedMachines = true;
      machineColumns = splitTopLevel(machineMatch[1])
        .map((column) => column.trim())
        .filter(Boolean);
      continue;
    }

    baseColumns.push(trimmed);
  }

  return { baseColumns, machineColumns, nestedMachines, star };
}

function selectSqlColumns(resource, select) {
  if (select.star) return { sql: "*", joinOnlyMachineId: false };

  const columns = select.baseColumns.filter((column) => resource.columns.includes(column));
  let joinOnlyMachineId = false;

  if (
    select.nestedMachines &&
    resource.columns.includes("machine_id") &&
    !columns.includes("machine_id")
  ) {
    columns.push("machine_id");
    joinOnlyMachineId = true;
  }

  if (columns.length === 0) return { sql: "*", joinOnlyMachineId: false };
  return { sql: columns.map(quoteIdent).join(", "), joinOnlyMachineId };
}

function buildWhere(resource, searchParams, initialValues = []) {
  const values = [...initialValues];
  const clauses = [];
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);

  for (const [key, value] of searchParams) {
    if (reserved.has(key)) continue;
    if (key === "or") {
      const orClause = parseOrFilter(resource, value, values);
      if (orClause) clauses.push(orClause);
      continue;
    }
    clauses.push(parseFilter(resource, key, value, values));
  }

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function parseFilter(resource, key, value, values) {
  const columnSql = columnExpression(resource, key);

  if (value === "is.null") return `${columnSql} IS NULL`;
  if (value === "not.is.null") return `${columnSql} IS NOT NULL`;

  const inMatch = /^in\.\((.*)\)$/.exec(value);
  if (inMatch) {
    const items = parseList(inMatch[1]);
    if (items.length === 0) return "false";
    const placeholders = items.map((item) => {
      values.push(item);
      return `$${values.length}`;
    });
    return `${columnSql} IN (${placeholders.join(", ")})`;
  }

  const match = /^([a-z]+)\.(.*)$/s.exec(value);
  if (!match) throw new Error(`Unsupported filter value: ${value}`);

  const [, operator, raw] = match;
  values.push(raw);
  const placeholder = `$${values.length}`;

  switch (operator) {
    case "eq":
      return `${columnSql} = ${placeholder}`;
    case "neq":
      return `${columnSql} <> ${placeholder}`;
    case "gte":
      return `${columnSql} >= ${placeholder}`;
    case "lte":
      return `${columnSql} <= ${placeholder}`;
    case "gt":
      return `${columnSql} > ${placeholder}`;
    case "lt":
      return `${columnSql} < ${placeholder}`;
    case "ilike":
      return `${columnSql} ILIKE ${placeholder}`;
    default:
      throw new Error(`Unsupported filter operator: ${operator}`);
  }
}

function parseOrFilter(resource, value, values) {
  const trimmed = value.replace(/^\(/, "").replace(/\)$/, "");
  const clauses = splitTopLevel(trimmed)
    .map((part) => {
      const match = /^(.+?)\.([a-z]+)\.(.*)$/s.exec(part.trim());
      if (!match) return null;
      const [, key, operator, raw] = match;
      if (operator !== "ilike" && operator !== "eq")
        throw new Error(`Unsupported OR operator: ${operator}`);
      values.push(raw);
      const comparison = operator === "ilike" ? "ILIKE" : "=";
      return `${columnExpression(resource, key)} ${comparison} $${values.length}`;
    })
    .filter(Boolean);

  return clauses.length > 0 ? `(${clauses.join(" OR ")})` : "";
}

function columnExpression(resource, key) {
  const jsonMatch = /^([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/i.exec(key);
  if (jsonMatch) {
    const [, column, jsonKey] = jsonMatch;
    if (!resource.columns.includes(column)) throw new Error(`Unknown column: ${column}`);
    return `${quoteIdent(column)} ->> '${jsonKey}'`;
  }

  if (!resource.columns.includes(key)) throw new Error(`Unknown column: ${key}`);
  return quoteIdent(key);
}

function buildOrder(resource, values) {
  const parts = values.flatMap((value) => splitTopLevel(value));
  const clauses = [];

  for (const part of parts) {
    const [column, direction = "asc", nulls] = part.trim().split(".");
    if (!column) continue;
    if (!resource.columns.includes(column)) throw new Error(`Unknown order column: ${column}`);

    const dir = direction.toLowerCase() === "desc" ? "DESC" : "ASC";
    const nullsSql =
      nulls?.toLowerCase() === "nullsfirst"
        ? " NULLS FIRST"
        : nulls?.toLowerCase() === "nullslast"
          ? " NULLS LAST"
          : "";
    clauses.push(`${quoteIdent(column)} ${dir}${nullsSql}`);
  }

  return { sql: clauses.length > 0 ? ` ORDER BY ${clauses.join(", ")}` : "" };
}

function getRange(req, url) {
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  if (limitParam) {
    return {
      limit: Number(limitParam),
      offset: offsetParam ? Number(offsetParam) : 0,
    };
  }

  const range = String(req.headers.range ?? "");
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) return { limit: null, offset: null };

  const start = Number(match[1]);
  const end = Number(match[2]);
  return { limit: end - start + 1, offset: start };
}

function parseConflictColumns(resource, value) {
  if (!value) return [];
  const columns = value
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  for (const column of columns) {
    if (!resource.columns.includes(column)) throw new Error(`Unknown conflict column: ${column}`);
  }
  return columns;
}

function buildConflictSql(columns, conflictColumns, ignoreDuplicates) {
  if (conflictColumns.length === 0) return "";
  const target = conflictColumns.map(quoteIdent).join(", ");
  if (ignoreDuplicates) return `ON CONFLICT (${target}) DO NOTHING`;

  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  if (updateColumns.length === 0) return `ON CONFLICT (${target}) DO NOTHING`;
  const setters = updateColumns
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ");
  return `ON CONFLICT (${target}) DO UPDATE SET ${setters}`;
}

async function findLocalUser(email, password) {
  const result = await pool.query(
    "SELECT id, email, password, created_at FROM local_auth.users WHERE lower(email) = lower($1) LIMIT 1",
    [email],
  );
  const row = result.rows[0];
  if (!row || !verifyPassword(password, String(row.password ?? ""))) return null;
  return { id: row.id, email: row.email, created_at: row.created_at };
}

function normalizeUserEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored.startsWith("pbkdf2_sha256$")) return stored === password;

  const parts = stored.split("$");
  if (parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], "hex");
  if (!Number.isFinite(iterations) || !salt || expected.length === 0) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function redactConnectionString(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<configured>";
  }
}

function isHostedRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RAILWAY_ENVIRONMENT_ID ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.NODE_ENV === "production",
  );
}

function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + tokenTtlSeconds;
  const accessToken = signJwt({
    aud: "authenticated",
    exp: expiresAt,
    iat: now,
    iss: "supabase",
    role: "authenticated",
    sub: user.id,
    email: user.email,
  });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: tokenTtlSeconds,
    expires_at: expiresAt,
    refresh_token: crypto.randomBytes(32).toString("base64url"),
    user: userFromClaims({ sub: user.id, email: user.email, role: "authenticated" }),
  };
}

function signJwt(payload) {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const body = base64urlJson(payload);
  const data = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", jwtSecret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifyRequestClaims(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return null;

  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const expected = crypto
      .createHmac("sha256", jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function userFromClaims(claims) {
  return {
    id: claims.sub,
    aud: "authenticated",
    role: claims.role ?? "authenticated",
    email: claims.email,
    email_confirmed_at: new Date(0).toISOString(),
    confirmed_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
  };
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function readRaw(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

async function readMolliePaymentId(req) {
  const rawBody = await readRaw(req);
  const contentType = req.headers["content-type"] ?? "";

  if (String(contentType).includes("application/json")) {
    const body = rawBody.trim() ? JSON.parse(rawBody) : {};
    return body.id ?? null;
  }

  const params = new URLSearchParams(rawBody);
  return params.get("id");
}

function splitTopLevel(value) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function parseList(value) {
  if (!value.trim()) return [];
  return splitTopLevel(value).map((item) => item.trim().replace(/^"|"$/g, ""));
}

function stripToColumns(row, columns) {
  const out = {};
  for (const column of columns) out[column] = row[column];
  return out;
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

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function addCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    [
      "authorization",
      "apikey",
      "content-type",
      "x-client-info",
      "x-supabase-api-version",
      "prefer",
      "range",
      "accept-profile",
      "content-profile",
    ].join(", "),
  );
  res.setHeader("access-control-expose-headers", "content-range");
}

function sendHead(res, status, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, String(value));
  res.writeHead(status);
  res.end();
}

function sendJson(res, status, data, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, String(value));
  if (status === 204) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  const staticOnly = isStaticAssetPath(url.pathname);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    if (staticOnly) {
      sendJson(res, 404, { message: "Static asset not found" });
      return;
    }
    await serveBuiltApp(req, res, url);
    return;
  }

  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    if (staticOnly) {
      sendJson(res, 404, { message: "Static asset not found" });
      return;
    }
    await serveBuiltApp(req, res, url);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": stat.size,
    "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function resolveStaticPath(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/\\/g, "/");
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const requested = path.resolve(staticRoot, relativePath);
  const rootWithSep = `${staticRoot}${path.sep}`;
  if (requested !== staticRoot && !requested.startsWith(rootWithSep)) return null;
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) return requested;

  const indexPath = path.join(staticRoot, "index.html");
  return fs.existsSync(indexPath) ? indexPath : null;
}

function isStaticAssetPath(pathname) {
  const cleanPath = pathname.split("?")[0] ?? "";
  if (cleanPath.startsWith("/assets/")) return true;
  return Boolean(path.extname(cleanPath));
}

async function serveBuiltApp(req, res, url) {
  if (!fs.existsSync(builtServerEntry)) {
    sendJson(res, 404, { message: "Built app not found. Run npm run build first." });
    return;
  }

  const builtAppServer = await getBuiltAppServer();
  const request = new Request(url.toString(), {
    method: req.method,
    headers: nodeHeadersToWebHeaders(req.headers),
  });
  const response = await builtAppServer.fetch(request, {}, {});
  await sendWebResponse(res, response);
}

async function getBuiltAppServer() {
  if (!builtAppServerPromise) {
    builtAppServerPromise = import(pathToFileURL(builtServerEntry).href).then((module) => module.default);
  }
  return builtAppServerPromise;
}

function nodeHeadersToWebHeaders(headers) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, String(value));
    }
  }
  return result;
}

async function sendWebResponse(res, response) {
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") res.setHeader(key, value);
  });
  res.writeHead(response.status, response.statusText);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] ?? "application/octet-stream";
}
