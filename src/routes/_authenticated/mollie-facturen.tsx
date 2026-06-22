import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateNL, formatDateTimeNL, formatEUR, monthLabel } from "@/lib/format";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/mollie-facturen")({
  head: () => ({ meta: [{ title: "Mollie Facturen - Daily Flowers" }] }),
  component: MollieFacturenPage,
});

type MollieSalesInvoice = {
  id: string;
  sales_invoice_id: string;
  reference: string | null;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  due_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  amount_gross: number | string;
  amount_net: number | string;
  vat_amount: number | string;
  discount_amount: number | string | null;
  invoice_url: string | null;
  synced_at: string | null;
  created_at: string;
};

function MollieFacturenPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const syncQ = useQuery({
    queryKey: ["sync_state", "mollie_facturen"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_state")
        .select("*")
        .eq("channel", "mollie_facturen")
        .maybeSingle();
      if (error) throw error;
      return data as
        | {
            last_sweep_at: string | null;
            last_sweep_status: string | null;
            last_sweep_message: string | null;
            records_processed: number | null;
          }
        | null;
    },
    refetchInterval: 5000,
  });

  const invoicesQ = useQuery({
    queryKey: ["mollie-sales-invoices", year],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mollie_sales_invoices")
        .select(
          "id,sales_invoice_id,reference,status,issued_at,paid_at,due_at,recipient_name,recipient_email,amount_gross,amount_net,vat_amount,discount_amount,invoice_url,synced_at,created_at",
        )
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("issued_at", { ascending: false, nullsFirst: false })
        .limit(10000);
      if (error) throw error;
      return ((data ?? []) as MollieSalesInvoice[]).filter(
        (invoice) => !isCancelledMollieInvoice(invoice),
      );
    },
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (invoicesQ.data ?? []).filter((invoice) => {
      const period = invoicePeriod(invoice);
      if (!period.startsWith(`${year}-`)) return false;
      if (month !== "all" && period !== `${year}-${month}`) return false;
      if (status !== "all" && invoice.status !== status) return false;
      if (!query) return true;
      return [
        invoice.sales_invoice_id,
        invoice.reference,
        invoice.recipient_name,
        invoice.recipient_email,
        invoice.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [invoicesQ.data, month, search, status, year]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, invoice) => {
          sum.count += 1;
          if (invoice.status === "paid") {
            sum.paid += 1;
            sum.gross += Number(invoice.amount_gross ?? 0);
            sum.net += Number(invoice.amount_net ?? 0);
            sum.vat += Number(invoice.vat_amount ?? 0);
          } else {
            sum.open += 1;
          }
          return sum;
        },
        { count: 0, paid: 0, open: 0, gross: 0, net: 0, vat: 0 },
      ),
    [filtered],
  );

  const statuses = useMemo(() => {
    const values = new Set((invoicesQ.data ?? []).map((invoice) => invoice.status).filter(Boolean));
    return [...values].sort();
  }, [invoicesQ.data]);

  const rows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function syncInvoices() {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("mollie-sales-invoices-sync");
      if (error) throw error;
      toast.success("Mollie facturen sync gestart", {
        description: "De facturen worden op de achtergrond opgehaald.",
      });
      syncQ.refetch();
      window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["mollie-sales-invoices"] });
        qc.invalidateQueries({ queryKey: ["vw_monthly_revenue_actuals"] });
      }, 3000);
    } catch (error) {
      toast.error("Mollie facturen sync starten mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSyncing(false);
    }
  }

  function updateMonth(value: string) {
    setMonth(value);
    setPage(0);
  }

  function updateStatus(value: string) {
    setStatus(value);
    setPage(0);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mollie Facturen</h1>
          <p className="text-sm text-muted-foreground">
            Sales invoices uit Mollie. Alleen betaalde facturen tellen mee als omzet in W&V en
            omzet monitoring.
          </p>
        </div>
        <Button variant="outline" onClick={syncInvoices} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          Mollie facturen sync
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <StatusMetric label="Status" value={statusLabel(syncQ.data?.last_sweep_status)} />
          <StatusMetric label="Laatste run" value={formatDateTimeNL(syncQ.data?.last_sweep_at)} />
          <StatusMetric label="Regels verwerkt" value={String(syncQ.data?.records_processed ?? "-")} />
          <StatusMetric label="Melding" value={syncQ.data?.last_sweep_message ?? "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Jaar</label>
            <Select value={year} onValueChange={(value) => { setYear(value); setPage(0); }}>
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
            <Select value={month} onValueChange={updateMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle maanden</SelectItem>
                {monthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={updateStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {salesInvoiceStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <Input
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Factuur, klant, e-mail..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Omzet ex btw" value={formatEUR(totals.net)} />
        <MetricCard title="Btw" value={formatEUR(totals.vat)} />
        <MetricCard title="Totaal incl." value={formatEUR(totals.gross)} />
        <MetricCard title="Betaald / open" value={`${totals.paid} / ${totals.open}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {month === "all" ? `Jaar ${year}` : monthLabel(`${year}-${month}`)}
          </CardTitle>
          <CardDescription>
            Betaalde regels lopen mee in de omzetactuals. Concepten, issued en open facturen staan
            hier alleen ter controle.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Factuur</th>
                  <th className="px-3 py-2 font-medium">Klant</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Vervaldatum</th>
                  <th className="px-3 py-2 text-right font-medium">Netto</th>
                  <th className="px-3 py-2 text-right font-medium">Btw</th>
                  <th className="px-3 py-2 text-right font-medium">Bruto</th>
                  <th className="px-3 py-2 font-medium">Mollie</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQ.isLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      Facturen laden...
                    </td>
                  </tr>
                )}
                {!invoicesQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      Geen Mollie facturen gevonden.
                    </td>
                  </tr>
                )}
                {rows.map((invoice) => (
                  <tr key={invoice.id} className="border-t align-top hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{invoice.reference || invoice.sales_invoice_id}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {invoice.sales_invoice_id}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{invoice.recipient_name || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.recipient_email || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={invoice.status === "paid" ? "secondary" : "outline"}>
                        {salesInvoiceStatusLabel(invoice.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <div>Betaald: {formatDateTimeNL(invoice.paid_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        Uitgegeven: {formatDateTimeNL(invoice.issued_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDateNL(invoice.due_at)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(invoice.amount_net)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(invoice.vat_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatEUR(invoice.amount_gross)}
                    </td>
                    <td className="px-3 py-2">
                      {invoice.invoice_url ? (
                        <Button asChild variant="ghost" size="icon" title="Open Mollie factuur">
                          <a href={invoice.invoice_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-3">
            <div className="text-xs text-muted-foreground">
              {filtered.length > 0
                ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, filtered.length)} van ${filtered.length}`
                : "0 van 0"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                onClick={() => setPage((current) => current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function invoicePeriod(invoice: MollieSalesInvoice) {
  const date = new Date(invoice.paid_at ?? invoice.issued_at ?? invoice.created_at);
  if (!Number.isFinite(date.getTime())) return "0000-00";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isCancelledMollieInvoice(invoice: MollieSalesInvoice) {
  const status = String(invoice.status ?? "").toLowerCase();
  return status === "canceled" || status === "cancelled";
}

function salesInvoiceStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "paid":
      return "Betaald";
    case "issued":
      return "Uitgegeven";
    case "draft":
      return "Concept";
    case "overdue":
      return "Vervallen";
    case "canceled":
    case "cancelled":
      return "Geannuleerd";
    default:
      return value || "-";
  }
}

function statusLabel(value: string | null | undefined) {
  switch (value) {
    case "ok":
      return "Gelukt";
    case "running":
      return "Draait";
    case "error":
      return "Fout";
    case "skipped":
      return "Overgeslagen";
    default:
      return "Nog niet gedraaid";
  }
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 1 - index));
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return {
      value,
      label: new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" }),
    };
  });
}
