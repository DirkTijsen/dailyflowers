import pg from "pg";
import { runShopifySweepFrom } from "./sync.mjs";

const { Pool } = pg;

const sinceIso = process.argv[2] ?? "2026-01-01T00:00:00Z";
const pool = new Pool({
  connectionString:
    process.env.LOCAL_DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/daily_flowers_local",
});

try {
  console.log(`Shopify one-off summary sweep vanaf ${sinceIso}`);
  const started = Date.now();
  await runShopifySweepFrom(pool, sinceIso, { skipTransactions: true });
  console.log(`Shopify one-off summary sweep klaar in ${Math.round((Date.now() - started) / 1000)}s`);
} finally {
  await pool.end();
}
