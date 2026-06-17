import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { runMollieSweepFrom } from "./sync.mjs";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";
const sinceIso = process.argv[2] ?? process.env.MOLLIE_SYNC_FROM ?? "2026-01-01T00:00:00Z";
const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log(`Mollie one-off sweep vanaf ${sinceIso}`);
  const count = await runMollieSweepFrom(pool, sinceIso);
  console.log(`Mollie one-off sweep klaar: ${count} betalingen verwerkt`);
} finally {
  await pool.end();
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
