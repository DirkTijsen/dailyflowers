export function recentPeriods(referenceDate = new Date(), count = 24): string[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function vatBreakdownKey(period: string, channel: string, vatRate: number | string): string {
  return `${period}|${channel}|${normalizeVatRate(vatRate)}`;
}

export function normalizeVatRate(vatRate: number | string): string {
  const numericRate = Number(vatRate);
  return Number.isFinite(numericRate) ? String(numericRate) : String(vatRate);
}
