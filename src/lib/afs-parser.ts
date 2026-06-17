// Frontend-versie van de AFS parser (gelijk aan supabase/functions/_shared/afs-parser.ts).

export type AfsParseOk = {
  ok: true;
  afs_number: string;
  vat_rate: 9 | 21;
  invoice_number: string;
  paid_at: string;
  article_number: string;
};
export type AfsParseError = { ok: false; error: string };
export type AfsParseResult = AfsParseOk | AfsParseError;

const NUMERIC = /^\d+$/;
const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

export function parseAfsDescription(description: string | null | undefined): AfsParseResult {
  if (!description || typeof description !== "string") return { ok: false, error: "Lege omschrijving" };
  const parts = description.trim().split(/\s+/);
  if (parts.length !== 6) return { ok: false, error: `Verwacht 6 velden, gekregen ${parts.length}` };
  const [afs, vatRaw, invoice, dateStr, timeStr, article] = parts;
  if (!NUMERIC.test(afs)) return { ok: false, error: `AFS-nummer niet numeriek` };
  if (vatRaw !== "09" && vatRaw !== "21") return { ok: false, error: `Btw-tarief moet 09 of 21 zijn` };
  if (!NUMERIC.test(invoice)) return { ok: false, error: `Factuurnummer niet numeriek` };
  if (!NUMERIC.test(article)) return { ok: false, error: `Artikelnummer niet numeriek` };
  const dm = DATE_RE.exec(dateStr);
  if (!dm) return { ok: false, error: `Datum moet dd-mm-jjjj zijn` };
  const tm = TIME_RE.exec(timeStr);
  if (!tm) return { ok: false, error: `Tijd moet hh:mm:ss zijn` };
  const [, dd, mm, yyyy] = dm;
  const [, hh, mi, ss] = tm;
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

export function calcNetVat(gross: number, vatRate: number) {
  const net = +(gross / (1 + vatRate / 100)).toFixed(2);
  const vat = +(gross - net).toFixed(2);
  return { net, vat };
}
