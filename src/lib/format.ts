const nlNumber = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return nlNumber.format(n);
}

export function formatDateTimeNL(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateNL(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL");
}

export const channelLabels: Record<string, string> = {
  shopify_webshop: "Shopify webshop",
  shopify_winkel: "Shopify winkel",
  bold_afs: "Bold/AFS",
  mollie_facturen: "Mollie facturen",
  wefact_facturen: "WeFact facturen",
};

export const statusLabels: Record<string, string> = {
  paid: "Betaling afgerond",
  pending: "In afwachting",
  open: "Open",
  failed: "Mislukt",
  canceled: "Geannuleerd",
  expired: "Verlopen",
  refunded: "Terugbetaald",
  partially_refunded: "Gedeeltelijk terugbetaald",
  authorized: "Geautoriseerd",
  other: "Overig",
};

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}
