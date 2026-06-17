// Strenge parser voor de Mollie payment description bij Bold/AFS verkoop.
// Verwacht exact 6 spatie-gescheiden velden:
//   <AFS-nr> <btw-tarief> <factuurnummer> <dd-mm-jjjj> <hh:mm:ss> <artikelnummer>
// Voorbeeld: "0123 09 004567 14-06-2026 13:42:08 008901"
//
// Bij ELKE validatiefout: parse_status = 'parse_error', vat_rate blijft leeg,
// machine blijft leeg. Raad nooit een tarief of machine.

export type AfsParseOk = {
  ok: true;
  afs_number: string;
  vat_rate: 9 | 21;
  invoice_number: string;
  paid_at: string; // ISO timestamptz (Europe/Amsterdam → UTC)
  article_number: string;
};

export type AfsParseError = {
  ok: false;
  error: string;
};

export type AfsParseResult = AfsParseOk | AfsParseError;

const NUMERIC = /^\d+$/;
const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

export function parseAfsDescription(description: string | null | undefined): AfsParseResult {
  if (!description || typeof description !== "string") {
    return { ok: false, error: "Lege omschrijving" };
  }
  const parts = description.trim().split(/\s+/);
  if (parts.length !== 6) {
    return { ok: false, error: `Verwacht 6 velden, gekregen ${parts.length}` };
  }
  const [afs, vatRaw, invoice, dateStr, timeStr, article] = parts;

  if (!NUMERIC.test(afs)) return { ok: false, error: `AFS-nummer niet numeriek: "${afs}"` };
  if (vatRaw !== "09" && vatRaw !== "21")
    return { ok: false, error: `Btw-tarief moet exact "09" of "21" zijn, kreeg "${vatRaw}"` };
  if (!NUMERIC.test(invoice)) return { ok: false, error: `Factuurnummer niet numeriek: "${invoice}"` };
  if (!NUMERIC.test(article)) return { ok: false, error: `Artikelnummer niet numeriek: "${article}"` };

  const dm = DATE_RE.exec(dateStr);
  if (!dm) return { ok: false, error: `Datum moet dd-mm-jjjj zijn, kreeg "${dateStr}"` };
  const tm = TIME_RE.exec(timeStr);
  if (!tm) return { ok: false, error: `Tijd moet hh:mm:ss zijn, kreeg "${timeStr}"` };

  const [, dd, mm, yyyy] = dm;
  const [, hh, mi, ss] = tm;
  const day = Number(dd), month = Number(mm), year = Number(yyyy);
  const hour = Number(hh), minute = Number(mi), second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > 31)
    return { ok: false, error: `Ongeldige datum: ${dateStr}` };
  if (hour > 23 || minute > 59 || second > 59)
    return { ok: false, error: `Ongeldige tijd: ${timeStr}` };

  // Interpreteer als Europe/Amsterdam lokale tijd → ISO.
  // Eenvoudige aanpak: bouw UTC en pas offset toe voor CET/CEST.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Bepaal of de gegeven lokale tijd in DST valt.
  const localDate = new Date(utcGuess);
  // Europe/Amsterdam: DST tussen laatste zo maart 01:00 UTC en laatste zo oktober 01:00 UTC.
  const isDst = isAmsterdamDst(year, month, day, hour, minute);
  const offsetHours = isDst ? 2 : 1;
  const iso = new Date(utcGuess - offsetHours * 3600 * 1000).toISOString();

  return {
    ok: true,
    afs_number: afs,
    vat_rate: vatRaw === "09" ? 9 : 21,
    invoice_number: invoice,
    paid_at: iso,
    article_number: article,
  };

  function isAmsterdamDst(y: number, mo: number, d: number, h: number, mi: number) {
    // Laatste zondag van maart en oktober.
    const lastSunday = (yy: number, mm: number) => {
      const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      const dow = new Date(Date.UTC(yy, mm - 1, lastDay)).getUTCDay();
      return lastDay - dow;
    };
    const startD = lastSunday(y, 3);
    const endD = lastSunday(y, 10);
    const minutes = h * 60 + mi;
    if (mo < 3 || mo > 10) return false;
    if (mo > 3 && mo < 10) return true;
    if (mo === 3) {
      if (d > startD) return true;
      if (d < startD) return false;
      return minutes >= 120; // 02:00 lokale tijd
    }
    // mo === 10
    if (d < endD) return true;
    if (d > endD) return false;
    return minutes < 180; // tot 03:00 lokale tijd
  }
}

// Net/BTW berekening uit bruto bedrag en tarief
export function calcNetVat(grossEffective: number, vatRate: number) {
  const net = +(grossEffective / (1 + vatRate / 100)).toFixed(2);
  const vat = +(grossEffective - net).toFixed(2);
  return { net, vat };
}
