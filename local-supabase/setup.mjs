import fs from "node:fs";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const rootUrl =
  process.env.LOCAL_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const appUrl =
  process.env.LOCAL_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";
const reset = process.argv.includes("--reset");
const hostedRuntime = isHostedRuntime();
const existingDb = process.argv.includes("--existing-db") || hostedRuntime;
const adminEmail =
  process.env.LOCAL_ADMIN_EMAIL ?? (hostedRuntime ? "" : "admin@dailyflowers.local");
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD ?? (hostedRuntime ? "" : "dailyflowers");
const appDbName = databaseName(appUrl);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

const bootstrapSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;
`;

const localAuthSql = `
CREATE SCHEMA IF NOT EXISTS local_auth;

CREATE TABLE IF NOT EXISTS local_auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sync_state (channel, last_sweep_status, last_sweep_message, records_processed)
VALUES
  ('shopify_webshop', NULL, NULL, NULL),
  ('shopify_winkel', NULL, NULL, NULL),
  ('shopify_payments', NULL, NULL, NULL),
  ('bold_afs', NULL, NULL, NULL)
ON CONFLICT (channel) DO NOTHING;
`;

async function main() {
  if (!existingDb) await ensureDatabase();

  const app = new Client({ connectionString: appUrl });
  await app.connect();
  try {
    await app.query(bootstrapSql);

    const applied = await schemaIsApplied(app);
    if (!applied) {
      const files = (await fsp.readdir(migrationsDir))
        .filter((name) => name.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const sql = await fsp.readFile(path.join(migrationsDir, file), "utf8");
        process.stdout.write(`Applying ${file}\n`);
        await app.query(sql);
      }
    } else {
      process.stdout.write("Schema already present; migrations skipped.\n");
    }

    await applyMigrationIfMissing(
      app,
      "public.mollie_settings",
      "20260616140000_add_mollie_settings.sql",
    );
    await applyMigrationIfMissing(
      app,
      "public.gl_accounts",
      "20260616190000_add_profit_loss_general_ledger.sql",
    );
    await applyMigrationIfMissing(
      app,
      "public.vw_gl_monthly_account",
      "20260616203000_add_pl_monthly_view.sql",
    );
    await applyMigrationIfMissing(
      app,
      "public.vw_gl_yearly_status",
      "20260616204500_add_gl_yearly_status_view.sql",
    );
    await applyMigrationIfMissing(
      app,
      "public.vw_shopify_analytics_monthly",
      "20260616212000_add_shopify_order_summaries.sql",
    );
    await applyMigrationIfMissing(
      app,
      "public.vw_monthly_revenue_actuals",
      "20260616214000_add_revenue_monitoring_actuals.sql",
    );
    await ensureEnumValue(app, "public", "tx_status", "partially_paid");
    await applyMigration(app, "20260616224000_shopify_vat_invoice_actuals.sql");
    await applyMigration(app, "20260616225000_shopify_invoice_actuals_include_pending.sql");
    await applyMigration(app, "20260616230000_add_gl_revenue_source_monthly.sql");
    await applyMigration(app, "20260616231000_shopify_current_total_actuals.sql");
    await applyMigration(app, "20260618100000_add_mollie_facturen_channel.sql");
    await applyMigration(app, "20260618101000_add_mollie_sales_invoices.sql");
    await applyMigration(app, "20260618110000_add_wefact_facturen_channel.sql");
    await applyMigration(app, "20260618111000_add_wefact_invoices.sql");
    await applyMigration(app, "20260619100000_filter_wefact_customer_invoices_in_actuals.sql");
    await applyMigration(app, "20260622152000_zero_fully_refunded_shopify_actuals.sql");
    await applyMigration(app, "20260622165000_include_open_mollie_invoices_in_revenue.sql");
    await applyMigration(app, "20260623103000_add_afs_fulfillment_logistics_pl_section.sql");
    await applyMigrationIfMissing(
      app,
      "public.afs_rental_invoices",
      "20260617120000_add_afs_rental_invoicing.sql",
    );
    await applyMigration(app, "20260617140000_add_afs_invoice_delivery.sql");
    await applyMigration(app, "20260617170000_add_afs_invoice_email_queue.sql");
    await applyMigration(app, "20260617200000_add_afs_invoice_mail_settings.sql");
    await applyMigration(app, "20260617214000_clear_afs_huur_test_data.sql");
    await applyMigration(app, "20260618123000_add_afs_rental_energy_costs.sql");
    await applyMigration(app, "20260617110000_add_exact_sync_state.sql");
    await applyMigration(app, "20260617183000_add_shopify_payments_reconciliation.sql");
    await applyMigration(app, "20260617190000_add_shopify_payment_csv_import.sql");
    await applyMigration(app, "20260617193000_add_shopify_cash_reconciliation.sql");
    await applyMigration(app, "20260617203000_add_shopify_cash_api_sync.sql");
    await applyMigration(app, "20260617210000_add_shopify_order_payment_coverage.sql");
    await applyMigration(app, "20260617211500_add_shopify_open_customer_balances.sql");
    await applyMigration(app, "20260617203000_add_pl_budget_lines.sql");
    await applyMigration(app, "20260617215000_deduplicate_shopify_exact_payout_candidates.sql");

    await app.query(localAuthSql);
    await seedAdminUser(app);
    process.stdout.write(`Local database ready: ${appUrl}\n`);
    if (hostedRuntime) {
      process.stdout.write(`Admin login seeded for ${adminEmail}\n`);
    } else {
      process.stdout.write("Dev login: admin@dailyflowers.local / dailyflowers\n");
    }
  } finally {
    await app.end();
  }
}

async function seedAdminUser(client) {
  if (!adminEmail || !adminPassword) {
    if (hostedRuntime) {
      throw new Error(
        "LOCAL_ADMIN_EMAIL en LOCAL_ADMIN_PASSWORD moeten gezet zijn voor Railway/productie.",
      );
    }
    return;
  }

  await client.query(
    `
      INSERT INTO local_auth.users (email, password)
      VALUES ($1, $2)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
    `,
    [adminEmail, hashPassword(adminPassword)],
  );
}

function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
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

async function ensureDatabase() {
  const root = new Client({ connectionString: rootUrl });
  await root.connect();
  try {
    if (reset) {
      process.stdout.write(`Dropping local database ${appDbName}...\n`);
      await root.query(`DROP DATABASE IF EXISTS ${quoteIdent(appDbName)} WITH (FORCE)`);
    }

    const exists = await root.query("SELECT 1 FROM pg_database WHERE datname = $1", [appDbName]);
    if (exists.rowCount === 0) {
      process.stdout.write(`Creating local database ${appDbName}...\n`);
      await root.query(`CREATE DATABASE ${quoteIdent(appDbName)}`);
    }
  } finally {
    await root.end();
  }
}

async function schemaIsApplied(client) {
  const result = await client.query("SELECT to_regclass('public.machines') AS table_name");
  return Boolean(result.rows[0]?.table_name);
}

async function applyMigrationIfMissing(client, objectName, migrationFile) {
  const result = await client.query("SELECT to_regclass($1) AS object_name", [objectName]);
  if (result.rows[0]?.object_name) return;

  const sql = await fsp.readFile(path.join(migrationsDir, migrationFile), "utf8");
  process.stdout.write(`Applying ${migrationFile}\n`);
  await client.query(sql);
}

async function applyMigration(client, migrationFile) {
  const sql = await fsp.readFile(path.join(migrationsDir, migrationFile), "utf8");
  process.stdout.write(`Applying ${migrationFile}\n`);
  await client.query(sql);
}

async function ensureEnumValue(client, schemaName, typeName, value) {
  const exists = await client.query(
    `
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = $1
        AND t.typname = $2
        AND e.enumlabel = $3
      LIMIT 1
    `,
    [schemaName, typeName, value],
  );
  if (exists.rowCount > 0) return;

  const typeIdent = `${quoteIdent(schemaName)}.${quoteIdent(typeName)}`;
  await client.query(
    `ALTER TYPE ${typeIdent} ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`,
  );
}

function databaseName(connectionString) {
  const parsed = new URL(connectionString);
  const db = parsed.pathname.replace(/^\//, "");
  if (!db) throw new Error("LOCAL_DATABASE_URL must include a database name");
  return db;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
