import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { channelLabels, formatDateNL, formatDateTimeNL, formatEUR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/openstaand-klanten")({
  head: () => ({ meta: [{ title: "Openstaand klanten - Daily Flowers" }] }),
  component: OpenstaandKlantenPage,
});

type OpenCustomerOrderRow = {
  customer_key: string;
  customer_label: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_company: string | null;
  period: string;
  order_summary_id: string;
  external_id: string;
  order_name: string | null;
  order_number: string | null;
  channel: string;
  source_name: string | null;
  financial_status: string | null;
  processed_at: string | null;
  order_amount: number | string;
  paid_amount: number | string;
  open_amount: number | string;
  payment_difference: number | string;
  payment_coverage_status: string;
  payment_gateways: string | null;
  transaction_count: number;
  last_payment_at: string | null;
};

type CustomerSummary = {
  customerKey: string;
  customerLabel: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCompany: string | null;
  openAmount: number;
  orderCount: number;
  oldestOrderAt: string | null;
  newestOrderAt: string | null;
  webshopOpenAmount: number;
  winkelOpenAmount: number;
  channels: string[];
};

function OpenstaandKlantenPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("all");
  const [channel, setChannel] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const periodStart = `${year}-01`;
  const periodEnd = `${year}-12`;
  const selectedPeriod = month === "all" ? null : `${year}-${month}`;

  const ordersQ = useQuery({
    queryKey: ["shopify-open-customer-orders", year, month, channel],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_open_customer_orders")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("open_amount", { ascending: false })
        .limit(3000);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      if (channel !== "all") q = q.eq("channel", channel);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OpenCustomerOrderRow[];
    },
  });

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = ordersQ.data ?? [];
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.customer_label,
        row.customer_name,
        row.customer_email,
        row.customer_phone,
        row.customer_company,
        row.order_name,
        row.order_number,
        row.financial_status,
        row.payment_gateways,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [ordersQ.data, search]);

  const customers = useMemo(() => summarizeCustomers(visibleOrders), [visibleOrders]);
  const selectedCustomer =
    customers.find((customer) => customer.customerKey === selectedCustomerKey) ?? customers[0] ?? null;
  const selectedOrders = selectedCustomer
    ? visibleOrders
        .filter((row) => row.customer_key === selectedCustomer.customerKey)
        .sort((a, b) => Number(b.open_amount ?? 0) - Number(a.open_amount ?? 0))
    : [];

  const totals = useMemo(
    () => ({
      customers: customers.length,
      orders: visibleOrders.length,
      openAmount: visibleOrders.reduce((sum, row) => sum + Number(row.open_amount ?? 0), 0),
      oldestOrderAt: minDate(visibleOrders.map((row) => row.processed_at)),
    }),
    [customers.length, visibleOrders],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Openstaand klanten</h1>
        <p className="text-sm text-muted-foreground">
          Openstaande Shopify-orders gegroepeerd per klant, gebaseerd op orderbedrag minus herkende betalingen.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 lg:grid-cols-[160px_180px_210px_1fr]">
          <div>
            <label className="text-xs text-muted-foreground">Jaar</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions().map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Periode</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle maanden</SelectItem>
                {Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1).padStart(2, "0");
                  return (
                    <SelectItem key={value} value={value}>
                      {monthName(index)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Kanaal</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Shopify kanalen</SelectItem>
                <SelectItem value="shopify_webshop">Shopify webshop</SelectItem>
                <SelectItem value="shopify_winkel">Shopify winkel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Klant, order, e-mail, status..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard title="Openstaand" value={formatEUR(totals.openAmount)} tone={totals.openAmount} />
        <SummaryCard title="Klanten" value={String(totals.customers)} />
        <SummaryCard title="Open orders" value={String(totals.orders)} tone={totals.orders} />
        <SummaryCard title="Oudste post" value={formatDateNL(totals.oldestOrderAt)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Openstaand per klant</CardTitle>
          <CardDescription>Selecteer een klant om de onderliggende Shopify-orders te zien.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Klant</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 text-right font-medium">Openstaand</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Webshop</th>
                  <th className="px-3 py-2 text-right font-medium">Winkel</th>
                  <th className="px-3 py-2 font-medium">Oudste</th>
                  <th className="px-3 py-2 font-medium">Laatste</th>
                </tr>
              </thead>
              <tbody>
                {ordersQ.isLoading && <EmptyRow colSpan={8} text="Laden..." />}
                {!ordersQ.isLoading && customers.length === 0 && (
                  <EmptyRow colSpan={8} text="Geen openstaande klantposten gevonden." />
                )}
                {customers.map((customer) => {
                  const selected = selectedCustomer?.customerKey === customer.customerKey;
                  return (
                    <tr
                      key={customer.customerKey}
                      className={`cursor-pointer border-t hover:bg-muted/30 ${selected ? "bg-muted/40" : ""}`}
                      onClick={() => setSelectedCustomerKey(customer.customerKey)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{customer.customerLabel}</div>
                        {customer.customerCompany && customer.customerCompany !== customer.customerLabel && (
                          <div className="text-xs text-muted-foreground">{customer.customerCompany}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div>{customer.customerEmail ?? "-"}</div>
                        {customer.customerPhone && (
                          <div className="text-xs text-muted-foreground">{customer.customerPhone}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">
                        {formatEUR(customer.openAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{customer.orderCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(customer.webshopOpenAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(customer.winkelOpenAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateNL(customer.oldestOrderAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateNL(customer.newestOrderAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Onderliggende orders{selectedCustomer ? ` - ${selectedCustomer.customerLabel}` : ""}
          </CardTitle>
          <CardDescription>Alle posten in deze tabel tellen op naar het openstaande klantbedrag.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Orderbedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Betaald</th>
                  <th className="px-3 py-2 text-right font-medium">Openstaand</th>
                  <th className="px-3 py-2 font-medium">Betaling</th>
                  <th className="px-3 py-2 font-medium">Laatste betaling</th>
                </tr>
              </thead>
              <tbody>
                {!selectedCustomer && <EmptyRow colSpan={9} text="Selecteer een klant." />}
                {selectedOrders.map((row) => (
                  <tr key={row.order_summary_id} className="border-t align-top hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTimeNL(row.processed_at)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.order_name ?? row.order_number ?? "-"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{row.external_id}</div>
                    </td>
                    <td className="px-3 py-2">{channelLabels[row.channel] ?? row.channel}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{row.financial_status ?? "-"}</Badge>
                        <IssueBadge status={row.payment_coverage_status} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.order_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.paid_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">
                      {formatEUR(row.open_amount)}
                    </td>
                    <td className="px-3 py-2">{row.payment_gateways ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTimeNL(row.last_payment_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function summarizeCustomers(rows: OpenCustomerOrderRow[]) {
  const byCustomer = new Map<string, CustomerSummary>();

  for (const row of rows) {
    const key = row.customer_key || "unknown";
    const current =
      byCustomer.get(key) ??
      ({
        customerKey: key,
        customerLabel: row.customer_label || "Onbekende klant",
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        customerCompany: row.customer_company,
        openAmount: 0,
        orderCount: 0,
        oldestOrderAt: null,
        newestOrderAt: null,
        webshopOpenAmount: 0,
        winkelOpenAmount: 0,
        channels: [],
      } satisfies CustomerSummary);

    const openAmount = Number(row.open_amount ?? 0);
    current.openAmount += openAmount;
    current.orderCount += 1;
    current.oldestOrderAt = minDate([current.oldestOrderAt, row.processed_at]);
    current.newestOrderAt = maxDate([current.newestOrderAt, row.processed_at]);
    current.customerName ||= row.customer_name;
    current.customerEmail ||= row.customer_email;
    current.customerPhone ||= row.customer_phone;
    current.customerCompany ||= row.customer_company;
    if (row.channel === "shopify_webshop") current.webshopOpenAmount += openAmount;
    if (row.channel === "shopify_winkel") current.winkelOpenAmount += openAmount;
    if (!current.channels.includes(row.channel)) current.channels.push(row.channel);

    byCustomer.set(key, current);
  }

  return [...byCustomer.values()].sort((a, b) => b.openAmount - a.openAmount);
}

function SummaryCard({ title, value, tone = 0 }: { title: string; value: string; tone?: number }) {
  const color = Number(tone) > 0.01 ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function IssueBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    no_transactions: "Geen betaling",
    unpaid: "Onbetaald",
    underpaid: "Onderbetaald",
    overpaid: "Overbetaald",
    amount_covered_status_open: "Bedrag OK, status open",
  };
  return <Badge variant="destructive">{labels[status] ?? status}</Badge>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  );
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from(new Set([current, current - 1, current - 2, current + 1].map(String))).sort((a, b) => Number(b) - Number(a));
}

function monthName(index: number) {
  return new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" });
}

function minDate(values: Array<string | null | undefined>) {
  const dates = values.filter(Boolean).map((value) => String(value));
  if (dates.length === 0) return null;
  return dates.reduce((oldest, value) => (new Date(value) < new Date(oldest) ? value : oldest));
}

function maxDate(values: Array<string | null | undefined>) {
  const dates = values.filter(Boolean).map((value) => String(value));
  if (dates.length === 0) return null;
  return dates.reduce((newest, value) => (new Date(value) > new Date(newest) ? value : newest));
}
