import { channelLabels } from "@/lib/format";

export const PL_SECTIONS = [
  { value: "revenue", label: "Omzet" },
  { value: "cost_of_goods", label: "Kostprijs omzet" },
  { value: "personnel", label: "Personeelskosten" },
  { value: "housing", label: "Huisvestingskosten" },
  { value: "sales_marketing", label: "Verkoop en marketing" },
  { value: "general_admin", label: "Algemene kosten" },
  { value: "depreciation", label: "Afschrijvingen" },
  { value: "financial", label: "Financieel resultaat" },
  { value: "tax", label: "Belastingen" },
  { value: "other", label: "Overig" },
] as const;

export const CHANNELS = [
  "shopify_webshop",
  "shopify_winkel",
  "bold_afs",
  "mollie_facturen",
  "wefact_facturen",
] as const;

export type PlSection = (typeof PL_SECTIONS)[number]["value"];
export type SalesChannel = (typeof CHANNELS)[number];

export type GlAccount = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string | null;
  statement_type: string | null;
  debit_credit: string | null;
  classification: string | null;
  pl_section: PlSection;
  revenue_channel: SalesChannel | null;
  sort_order: number;
  active: boolean;
};

export type GlAccountImportRow = {
  account_code: string;
  account_name: string;
  account_type: string | null;
  statement_type: string | null;
  debit_credit: string | null;
  classification: string | null;
  pl_section: PlSection;
  revenue_channel: SalesChannel | null;
  sort_order: number;
  active: boolean;
};

export type GlTransactionImportRow = {
  source: string;
  external_id: string;
  transaction_date: string;
  account_id: string;
  account_code: string;
  description: string | null;
  relation_name: string | null;
  document_number: string | null;
  amount: number;
  debit_amount: number | null;
  credit_amount: number | null;
  import_batch_id: string;
  raw_payload: Record<string, unknown>;
};

export function sectionLabel(section: string | null | undefined) {
  return PL_SECTIONS.find((item) => item.value === section)?.label ?? "Overig";
}

export function sectionIndex(section: string | null | undefined) {
  const index = PL_SECTIONS.findIndex((item) => item.value === section);
  return index === -1 ? 999 : index;
}

export function channelLabel(channel: string | null | undefined) {
  return channel ? (channelLabels[channel] ?? channel) : "-";
}

export function currentQuarterKey() {
  const now = new Date();
  return quarterKey(now.getFullYear(), Math.floor(now.getMonth() / 3) + 1);
}

export function quarterKey(year: number | string, quarter: number | string) {
  return `${year}-Q${quarter}`;
}

export function quarterOptions(year: string) {
  return [1, 2, 3, 4].map((quarter) => ({
    value: quarterKey(year, quarter),
    label: `Q${quarter} ${year}`,
  }));
}

export function quartersForYearTo(year: string, toQuarter: string) {
  const quarter = Number(toQuarter.replace(/^Q/i, ""));
  const max = Number.isFinite(quarter) ? Math.min(Math.max(quarter, 1), 4) : 4;
  return Array.from({ length: max }, (_, index) => quarterKey(year, index + 1));
}

export function monthsForYearToQuarter(year: string, toQuarter: string) {
  const quarter = Number(toQuarter.replace(/^Q/i, ""));
  const maxQuarter = Number.isFinite(quarter) ? Math.min(Math.max(quarter, 1), 4) : 4;
  const maxMonth = maxQuarter * 3;
  return Array.from({ length: maxMonth }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export function compareQuarterKey(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const [ay, aq] = parseQuarterKey(a);
  const [by, bq] = parseQuarterKey(b);
  return ay === by ? aq - bq : ay - by;
}

export function quarterLabel(value: string) {
  const [year, quarter] = parseQuarterKey(value);
  return `Q${quarter} ${year}`;
}

export function monthToQuarterKey(period: string) {
  const [year, rawMonth] = period.split("-");
  const month = Number(rawMonth);
  const quarter = Number.isFinite(month) ? Math.floor((month - 1) / 3) + 1 : 1;
  return quarterKey(year, quarter);
}

export function monthShortLabel(period: string) {
  const [year, rawMonth] = period.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "short" });
}

export function parseQuarterKey(value: string): [number, number] {
  const match = /^(\d{4})-Q([1-4])$/.exec(value);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

export async function parseAccountWorkbook(file: File): Promise<GlAccountImportRow[]> {
  const rows = await readWorkbookRows(file, ["Grootboekschema", "Grootboek", "Accounts"]);
  const parsed: GlAccountImportRow[] = [];

  for (const [index, raw] of rows.entries()) {
    const row = normalizeKeys(raw);
    const accountCode = cleanText(pick(row, ["account_code", "rekening", "grootboekrekening", "grootboek", "code", "nummer"]));
    const accountName = cleanText(pick(row, ["account_name", "naam", "omschrijving", "description"]));
    if (!accountCode && !accountName) continue;
    if (!accountCode) throw new Error(`Rij ${index + 2}: grootboekcode ontbreekt`);
    if (!accountName) throw new Error(`Rij ${index + 2}: grootboeknaam ontbreekt`);

    const accountType = cleanText(pick(row, ["account_type", "type"]));
    const statementType = cleanText(pick(row, ["statement_type", "balans_winst_verlies", "balans_wv", "balans_of_winst_verlies"]));
    const debitCredit = cleanText(pick(row, ["debit_credit", "debet_credit"]));
    const classification = cleanText(pick(row, ["classification", "classificatie", "moederclassificatie"]));
    const section = normalizeSection(
      cleanText(pick(row, ["pl_section", "wv_rubriek", "rubriek", "categorie", "section"])),
      accountCode,
      accountName,
      statementType,
      classification,
    );
    const revenueChannel = normalizeChannel(
      cleanText(pick(row, ["revenue_channel", "omzetkanaal", "kanaal", "channel"])),
    );

    parsed.push({
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType || null,
      statement_type: statementType || null,
      debit_credit: debitCredit || null,
      classification: classification || null,
      pl_section: section,
      revenue_channel: section === "revenue" ? revenueChannel : null,
      sort_order: parseInteger(pick(row, ["sort_order", "volgorde"])) ?? inferSortOrder(section, accountCode),
      active: parseBoolean(pick(row, ["active", "actief", "in_wv", "include_in_pl"])) ?? true,
    });
  }

  return parsed;
}

export async function parseGlTransactionWorkbook(
  file: File,
  accounts: GlAccount[],
  importBatchId: string,
): Promise<GlTransactionImportRow[]> {
  const rows = await readWorkbookRows(file, ["Transacties", "Grootboektransacties", "Boekingen"]);
  const accountByCode = new Map(accounts.map((account) => [account.account_code.toLowerCase(), account]));
  const parsed: GlTransactionImportRow[] = [];

  for (const [index, raw] of rows.entries()) {
    const row = normalizeKeys(raw);
    const accountCode = cleanText(
      pick(row, [
        "account_code",
        "rekening",
        "grootboekrekening",
        "grootboek",
        "code",
        "nummer",
        "glaccountcodedescriptioncode",
        "gl_account_code_description_code",
      ]),
    );
    const date = parseDateValue(pick(row, ["transaction_date", "boekdatum", "datum", "date", "entrydate", "entry_date"]));
    const rawAmount = pick(row, ["amount", "bedrag", "saldo", "resultaat", "amountdc", "amount_dc"]);
    const debit = parseOptionalAmount(pick(row, ["debit_amount", "debet", "debit"]));
    const credit = parseOptionalAmount(pick(row, ["credit_amount", "credit", "credit_amount"]));

    if (!accountCode && !date && rawAmount === undefined && debit === null && credit === null) continue;
    if (!accountCode) throw new Error(`Rij ${index + 2}: grootboekcode ontbreekt`);
    if (!date) throw new Error(`Rij ${index + 2}: datum ontbreekt of is ongeldig`);

    const account = accountByCode.get(accountCode.toLowerCase());
    if (!account) {
      throw new Error(`Rij ${index + 2}: grootboekrekening ${accountCode} staat niet in het schema`);
    }

    const amount =
      rawAmount !== undefined && cleanText(rawAmount)
        ? parseAmount(rawAmount)
        : Number((Number(credit ?? 0) - Number(debit ?? 0)).toFixed(2));
    if (!Number.isFinite(amount)) throw new Error(`Rij ${index + 2}: bedrag is ongeldig`);

    const description = cleanText(pick(row, ["description", "omschrijving", "memo"]));
    const documentNumber = cleanText(pick(row, ["document_number", "boekstuk", "factuur", "invoice", "document", "entrynumber", "entry_number"]));
    const relationName = cleanText(
      pick(row, [
        "relation_name",
        "relatie",
        "debiteur",
        "crediteur",
        "accountcodenamedescription",
        "accountcodename_description",
        "account_code_name_description",
      ]),
    );
    const suppliedId = cleanText(pick(row, ["external_id", "id"]));

    parsed.push({
      source: "manual",
      external_id:
        suppliedId ||
        makeExternalId([date, accountCode, documentNumber, description, String(amount), String(index + 2)]),
      transaction_date: date,
      account_id: account.id,
      account_code: account.account_code,
      description: description || null,
      relation_name: relationName || null,
      document_number: documentNumber || null,
      amount,
      debit_amount: debit,
      credit_amount: credit,
      import_batch_id: importBatchId,
      raw_payload: raw,
    });
  }

  return parsed;
}

export async function downloadAccountTemplate() {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    [
      {
        account_code: "8000",
        account_name: "Omzet Shopify webshop",
        account_type: "Opbrengsten",
        statement_type: "Winst & Verlies",
        debit_credit: "Credit",
        classification: "",
        pl_section: "revenue",
        revenue_channel: "shopify_webshop",
        sort_order: 100,
        active: true,
      },
      {
        account_code: "8010",
        account_name: "Omzet Shopify winkel",
        account_type: "Opbrengsten",
        statement_type: "Winst & Verlies",
        debit_credit: "Credit",
        classification: "",
        pl_section: "revenue",
        revenue_channel: "shopify_winkel",
        sort_order: 110,
        active: true,
      },
      {
        account_code: "8020",
        account_name: "Omzet Bold/AFS",
        account_type: "Opbrengsten",
        statement_type: "Winst & Verlies",
        debit_credit: "Credit",
        classification: "",
        pl_section: "revenue",
        revenue_channel: "bold_afs",
        sort_order: 120,
        active: true,
      },
      {
        account_code: "7000",
        account_name: "Kostprijs verkopen",
        account_type: "Kosten",
        statement_type: "Winst & Verlies",
        debit_credit: "Debet",
        classification: "",
        pl_section: "cost_of_goods",
        revenue_channel: "",
        sort_order: 200,
        active: true,
      },
    ],
    {
      header: [
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
      ],
    },
  );
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 34 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Grootboekschema");
  XLSX.writeFile(workbook, "grootboek-template.xlsx");
}

export async function downloadTransactionTemplate(accounts: GlAccount[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const exampleAccount = accounts[0];
  const sheet = XLSX.utils.json_to_sheet(
    [
      {
        transaction_date: `${new Date().getFullYear()}-01-31`,
        account_code: exampleAccount?.account_code ?? "8000",
        description: "Voorbeeld boeking",
        relation_name: "",
        document_number: "MEM-001",
        amount: 1000,
        debit_amount: "",
        credit_amount: "",
        external_id: "voorbeeld-001",
      },
    ],
    {
      header: [
        "transaction_date",
        "account_code",
        "description",
        "relation_name",
        "document_number",
        "amount",
        "debit_amount",
        "credit_amount",
        "external_id",
      ],
    },
  );
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 34 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Transacties");
  XLSX.writeFile(workbook, "wv-transacties-template.xlsx");
}

async function readWorkbookRows(file: File, preferredSheets: string[]) {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return readDelimitedRows(file);

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
  const sheetName =
    preferredSheets.find((name) => workbook.Sheets[name]) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Geen werkblad gevonden");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = findHeaderIndex(matrix);
  if (headerIndex === -1) throw new Error("Geen herkenbare header gevonden");

  const headers = matrix[headerIndex].map((header, index) => cleanText(header) || `column_${index + 1}`);
  return matrix.slice(headerIndex + 1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

async function readDelimitedRows(file: File) {
  const Papa = await import("papaparse");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8";
  const text = new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, "");
  const parsed = Papa.default.parse<Record<string, unknown>>(text, {
    header: true,
    delimiter: text.includes("\t") ? "\t" : "",
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });
  const hardErrors = parsed.errors.filter((error) => error.code !== "TooFewFields");
  if (hardErrors.length > 0) throw new Error(hardErrors[0].message);
  return parsed.data.filter((row) => Object.values(row).some((value) => cleanText(value)));
}

function normalizeKeys(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key
        .trim()
        .toLowerCase()
        .replace(/[^\w]+/g, "_")
        .replace(/^_+|_+$/g, ""),
      value,
    ]),
  );
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  let normalized = cleanText(value);
  if (!normalized) return Number.NaN;
  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[()\u20ac\s]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return negative ? -parsed : parsed;
}

function parseOptionalAmount(value: unknown) {
  if (value === undefined || value === null || cleanText(value) === "") return null;
  const parsed = parseAmount(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown) {
  if (value === undefined || value === null || cleanText(value) === "") return null;
  const parsed = Number.parseInt(cleanText(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: unknown) {
  if (value === undefined || value === null || cleanText(value) === "") return null;
  const normalized = cleanText(value).toLowerCase();
  if (["true", "waar", "ja", "yes", "1", "active", "actief"].includes(normalized)) return true;
  if (["false", "onwaar", "nee", "no", "0", "inactive", "inactief"].includes(normalized)) return false;
  return null;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateOnly(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return toDateOnly(epoch);
  }
  const raw = cleanText(value);
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const nl = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/.exec(raw);
  if (nl) {
    const year = nl[3].length === 2 ? `20${nl[3]}` : nl[3];
    return `${year}-${nl[2].padStart(2, "0")}-${nl[1].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
}

function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function findHeaderIndex(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cleanText(cell)));
    return (
      (normalized.includes("code") && normalized.includes("omschrijving")) ||
      (normalized.includes("account_code") && normalized.includes("account_name")) ||
      (normalized.includes("entrydate") && normalized.includes("amountdc")) ||
      (normalized.includes("entry_date") && normalized.includes("amount_dc"))
    );
  });
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSection(
  raw: string,
  accountCode: string,
  accountName: string,
  statementType = "",
  classification = "",
): PlSection {
  if (statementType && !statementType.toLowerCase().includes("winst")) return "other";
  const value = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const direct = PL_SECTIONS.find((section) => section.value === value);
  if (direct) return direct.value;
  if (["omzet", "revenue", "sales"].includes(value)) return "revenue";
  if (["kostprijs", "kostprijs_omzet", "inkoopwaarde", "cogs"].includes(value)) return "cost_of_goods";
  if (["personeel", "personeelskosten", "lonen"].includes(value)) return "personnel";
  if (["huisvesting", "huur"].includes(value)) return "housing";
  if (["verkoop", "marketing", "sales_marketing"].includes(value)) return "sales_marketing";
  if (["algemeen", "algemene_kosten", "kantoorkosten"].includes(value)) return "general_admin";
  if (["afschrijving", "afschrijvingen"].includes(value)) return "depreciation";
  if (["financieel", "rente", "bankkosten"].includes(value)) return "financial";
  if (["belasting", "belastingen"].includes(value)) return "tax";

  const code = accountCode.trim();
  const name = `${accountName} ${classification}`.toLowerCase();
  if (/^7/.test(code) || name.includes("kostprijs") || name.includes("inkoop")) return "cost_of_goods";
  if (name.includes("rente") || name.includes("bankkosten") || name.includes("financier")) return "financial";
  if (/^8/.test(code) || name.includes("omzet") || name.includes("opbreng")) return "revenue";
  if (name.includes("loon") || name.includes("personeel")) return "personnel";
  return "other";
}

function normalizeChannel(raw: string): SalesChannel | null {
  const value = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) return null;
  if (CHANNELS.includes(value as SalesChannel)) return value as SalesChannel;
  if (value.includes("webshop") || value === "shopify") return "shopify_webshop";
  if (value.includes("winkel") || value.includes("pos")) return "shopify_winkel";
  if (value.includes("bold") || value.includes("afs")) return "bold_afs";
  if (value.includes("wefact")) return "wefact_facturen";
  return null;
}

function inferSortOrder(section: PlSection, accountCode: string) {
  const codeNumber = Number.parseInt(accountCode.replace(/\D/g, ""), 10);
  return sectionIndex(section) * 1000 + (Number.isFinite(codeNumber) ? codeNumber : 999);
}

function makeExternalId(parts: string[]) {
  return `manual-${parts.join("|").replace(/\s+/g, " ").trim()}`;
}
