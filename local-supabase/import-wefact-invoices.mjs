import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Pool } = pg;

loadDotEnv(path.resolve(process.cwd(), ".env"));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Gebruik: node local-supabase/import-wefact-invoices.mjs <Facturen-per-pdf.zip>");
  process.exit(1);
}

const databaseUrl =
  process.env.LOCAL_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/daily_flowers_local";

const pool = new Pool({ connectionString: databaseUrl });

const invoiceColumns = [
  "invoice_number",
  "invoice_date",
  "due_date",
  "status",
  "customer_number",
  "customer_name",
  "reference",
  "category",
  "amount_net",
  "vat_amount",
  "amount_gross",
  "source_filename",
  "pdf_sha256",
  "raw_text",
  "raw_payload",
  "imported_at",
];

const lineColumns = [
  "invoice_id",
  "invoice_number",
  "line_no",
  "quantity",
  "description",
  "unit_price",
  "amount_net",
  "raw_line",
];

async function main() {
  const invoices = parseInvoices(inputPath);
  if (invoices.length === 0) throw new Error("Geen WeFact PDF-facturen gevonden in de zip.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const invoice of invoices) {
      const invoiceId = await upsertInvoice(client, invoice);
      await client.query("DELETE FROM public.wefact_invoice_lines WHERE invoice_number = $1", [
        invoice.invoice_number,
      ]);

      for (const line of invoice.lines) {
        await insertInvoiceLine(client, invoiceId, invoice.invoice_number, line);
      }
    }

    await client.query(
      `
        INSERT INTO public.sync_state (
          channel,
          last_sweep_at,
          last_sweep_status,
          last_sweep_message,
          records_processed,
          updated_at
        )
        VALUES ('wefact_facturen', now(), 'ok', $1, $2, now())
        ON CONFLICT (channel) DO UPDATE SET
          last_sweep_at = EXCLUDED.last_sweep_at,
          last_sweep_status = EXCLUDED.last_sweep_status,
          last_sweep_message = EXCLUDED.last_sweep_message,
          records_processed = EXCLUDED.records_processed,
          updated_at = now()
      `,
      [`WeFact PDF-import voltooid: ${invoices.length} facturen`, invoices.length],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const totals = invoices.reduce(
    (sum, invoice) => {
      sum.net += Number(invoice.amount_net ?? 0);
      sum.vat += Number(invoice.vat_amount ?? 0);
      sum.gross += Number(invoice.amount_gross ?? 0);
      sum[invoice.status === "paid" ? "paid" : "open"] += 1;
      return sum;
    },
    { net: 0, vat: 0, gross: 0, paid: 0, open: 0 },
  );

  console.log(
    `WeFact import klaar: ${invoices.length} facturen, netto ${money(totals.net)}, btw ${money(
      totals.vat,
    )}, bruto ${money(totals.gross)}, betaald ${totals.paid}, open ${totals.open}.`,
  );
}

async function upsertInvoice(client, invoice) {
  const values = invoiceColumns.map((column) =>
    column === "imported_at" ? new Date().toISOString() : invoice[column],
  );
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updates = invoiceColumns
    .filter((column) => !["invoice_number", "imported_at"].includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  const result = await client.query(
    `
      INSERT INTO public.wefact_invoices (${invoiceColumns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (invoice_number) DO UPDATE SET
        ${updates},
        imported_at = now(),
        updated_at = now()
      RETURNING id
    `,
    values,
  );
  return result.rows[0].id;
}

async function insertInvoiceLine(client, invoiceId, invoiceNumber, line) {
  const row = {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    line_no: line.line_no,
    quantity: line.quantity,
    description: line.description,
    unit_price: line.unit_price,
    amount_net: line.amount_net,
    raw_line: line.raw_line,
  };
  const values = lineColumns.map((column) => row[column]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

  await client.query(
    `
      INSERT INTO public.wefact_invoice_lines (${lineColumns.join(", ")})
      VALUES (${placeholders})
    `,
    values,
  );
}

function parseInvoices(zipPath) {
  const output = execFileSync("python", ["-c", PYTHON_PARSER, zipPath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });
  return JSON.parse(output);
}

function money(value) {
  return Number(value).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

const PYTHON_PARSER = String.raw`
import hashlib
import io
import json
import re
import sys
import zipfile

try:
    import pdfplumber
except ImportError as exc:
    raise SystemExit("Python package pdfplumber is nodig voor WeFact PDF-import.") from exc

MONEY_RE = re.compile(r"-?\d[\d.]*,\d{2}")
LINE_RE = re.compile(r"^\s*(\d+(?:[,.]\d+)?)\s+(.+?)\s+(?:€\s*)?(-?[\d.]+,\d{2})\s+(?:€\s*)?(-?[\d.]+,\d{2})\s*$")

def clean(value):
    return " ".join(str(value or "").replace("\xa0", " ").split()).strip()

def parse_money(value):
    if value is None:
        return None
    text = clean(value).replace("€", "").replace(" ", "")
    if not text:
        return None
    text = text.replace(".", "").replace(",", ".")
    return round(float(text), 2)

def parse_quantity(value):
    if value is None:
        return None
    text = clean(value).replace(",", ".")
    return round(float(text), 2)

def parse_date_nl(value):
    match = re.search(r"(\d{2})-(\d{2})-(\d{4})", value or "")
    if not match:
        return None
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"

def find_regex(pattern, text, flags=0):
    match = re.search(pattern, text, flags)
    return clean(match.group(1)) if match else None

def total_for(lines, label):
    for line in lines:
        if line.lower().startswith(label.lower()):
            values = MONEY_RE.findall(line)
            if values:
                return parse_money(values[-1])
    return 0.0

def extract_customer_name(lines):
    for index, line in enumerate(lines):
        if line.startswith("Website:"):
            for candidate in lines[index + 1:]:
                candidate = clean(candidate)
                if not candidate:
                    continue
                if candidate.startswith(("Klantnummer:", "Factuur", "Creditfactuur")):
                    return None
                return clean(re.split(r"\s+KvK nummer:", candidate)[0])
    return None

def extract_reference(lines):
    collecting = False
    parts = []
    for line in lines:
        if line.startswith("Aantal Omschrijving"):
            break
        if collecting:
            parts.append(line)
            continue
        if line.startswith("Referentie:"):
            parts.append(line.replace("Referentie:", "", 1).strip())
            collecting = True
    return clean(" ".join(parts)) or None

def body_lines(lines):
    started = False
    body = []
    for line in lines:
        if line.startswith("Aantal Omschrijving"):
            started = True
            continue
        if started and line.startswith("Totaal excl. BTW"):
            break
        if started:
            body.append(line)
    return body

def parse_lines(body):
    parsed = []
    for raw in body:
        line = clean(raw)
        if not line:
            continue
        if line.startswith("Periode:") and parsed:
            parsed[-1]["description"] = clean(f"{parsed[-1]['description']} {line}")
            parsed[-1]["raw_line"] = clean(f"{parsed[-1]['raw_line']} | {line}")
            continue
        match = LINE_RE.match(line)
        if not match:
            continue
        parsed.append({
            "line_no": len(parsed) + 1,
            "quantity": parse_quantity(match.group(1)),
            "description": clean(match.group(2)),
            "unit_price": parse_money(match.group(3)),
            "amount_net": parse_money(match.group(4)),
            "raw_line": line,
        })
    return parsed

def classify_invoice(lines, reference):
    text = " ".join([reference or ""] + [line.get("description", "") for line in lines]).lower()
    if "omzethuur" in text:
        return "omzethuur"
    if "facilitaire" in text or "facilitair" in text:
        return "facilitair"
    if "energievergoeding" in text or "energie" in text:
        return "energie"
    if "abonnement" in text:
        return "abonnement"
    if any(word in text for word in ["boeket", "rozen", "tulip", "garland", "flower", "preserved", "installation", "check up"]):
        return "bloemen/project"
    return "overig"

def parse_pdf(name, content):
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        page_count = len(pdf.pages)
        text = "\n".join(page.extract_text(x_tolerance=1, y_tolerance=3) or "" for page in pdf.pages)
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    invoice_number = find_regex(r"Factuurnummer:\s*(F\d{4}-\d+)", text)
    invoice_date = parse_date_nl(find_regex(r"Factuurdatum:\s*(\d{2}-\d{2}-\d{4})", text) or "")
    if not invoice_number or not invoice_date:
        raise ValueError(f"{name}: factuurnummer of factuurdatum ontbreekt")

    rows = parse_lines(body_lines(lines))
    amount_net = total_for(lines, "Totaal excl. BTW")
    amount_gross = total_for(lines, "Totaal incl. BTW")
    vat_amount = round(amount_gross - amount_net, 2)
    reference = extract_reference(lines)

    return {
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "due_date": parse_date_nl(find_regex(r"voor\s+(\d{2}-\d{2}-\d{4})", text) or ""),
        "status": "paid" if "de factuur is reeds betaald" in text.lower() else "open",
        "customer_number": find_regex(r"Klantnummer:\s*([A-Z0-9-]+)", text),
        "customer_name": extract_customer_name(lines),
        "reference": reference,
        "category": classify_invoice(rows, reference),
        "amount_net": amount_net,
        "vat_amount": vat_amount,
        "amount_gross": amount_gross,
        "source_filename": name,
        "pdf_sha256": hashlib.sha256(content).hexdigest(),
        "raw_text": text,
        "raw_payload": {
            "parser": "wefact_pdf_v1",
            "page_count": page_count,
            "source_zip_filename": zip_path.split("\\")[-1].split("/")[-1],
        },
        "lines": rows,
    }

zip_path = sys.argv[1]
invoices = []
with zipfile.ZipFile(zip_path) as archive:
    for name in sorted(archive.namelist()):
        if not name.lower().endswith(".pdf") or name.startswith("__MACOSX/"):
            continue
        invoices.append(parse_pdf(name, archive.read(name)))

invoices.sort(key=lambda row: row["invoice_number"])
print(json.dumps(invoices, ensure_ascii=False))
`;

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
