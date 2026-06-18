import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/wefact-facturen")({
  head: () => ({ meta: [{ title: "WeFact Facturen - Daily Flowers" }] }),
  component: WeFactFacturenPage,
});

type WefactInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  customer_number: string | null;
  customer_name: string | null;
  reference: string | null;
  category: string | null;
  amount_net: number | string;
  vat_amount: number | string;
  amount_gross: number | string;
  source_filename: string | null;
  imported_at: string;
};

function WeFactFacturenPage() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const syncQ = useQuery({
    queryKey: ["sync_state", "wefact_facturen"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_state")
        .select("*")
        .eq("channel", "wefact_facturen")
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
  });

  const invoicesQ = useQuery({
    queryKey: ["wefact-invoices", year],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wefact_invoices")
        .select(
          "id,invoice_number,invoice_date,due_date,status,customer_number,customer_name,reference,category,amount_net,vat_amount,amount_gross,source_filename,imported_at",
        )
        .gte("invoice_date", `${year}-01-01`)
        .lt("invoice_date", `${Number(year) + 1}-01-01`)
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as WefactInvoice[];
    },
  });

  const statuses = useMemo(
    () => uniqueValues((invoicesQ.data ?? []).map((invoice) => invoice.status)),
    [invoicesQ.data],
  );
  const categories = useMemo(
    () => uniqueValues((invoicesQ.data ?? []).map((invoice) => invoice.category ?? "overig")),
    [invoicesQ.data],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (invoicesQ.data ?? []).filter((invoice) => {
      const period = invoice.invoice_date.slice(0, 7);
      if (month !== "all" && period !== `${year}-${month}`) return false;
      if (status !== "all" && invoice.status !== status) return false;
      if (category !== "all" && (invoice.category ?? "overig") !== category) return false;
      if (!query) return true;
      return [
        invoice.invoice_number,
        invoice.customer_number,
        invoice.customer_name,
        invoice.reference,
        invoice.category,
        invoice.source_filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [category, invoicesQ.data, month, search, status, year]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, invoice) => {
          const included = invoice.status !== "canceled";
          sum.count += 1;
          if (included) {
            sum.included += 1;
            sum.gross += Number(invoice.amount_gross ?? 0);
            sum.net += Number(invoice.amount_net ?? 0);
            sum.vat += Number(invoice.vat_amount ?? 0);
            const bucket = invoice.category ?? "overig";
            sum.byCategory[bucket] = (sum.byCategory[bucket] ?? 0) + Number(invoice.amount_net ?? 0);
          }
          if (invoice.status === "paid") sum.paid += 1;
          else sum.open += 1;
          return sum;
        },
        {
          count: 0,
          included: 0,
          paid: 0,
          open: 0,
          gross: 0,
          net: 0,
          vat: 0,
          byCategory: {} as Record<string, number>,
        },
      ),
    [filtered],
  );

  const rows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const periodLabel = month === "all" ? `Jaar ${year}` : monthLabel(`${year}-${month}`);

  function resetPageFor(update: () => void) {
    update();
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">WeFact Facturen</h1>
          <p className="text-sm text-muted-foreground">
            Eenmalige import uit WeFact PDF-facturen. Alle niet-geannuleerde facturen tellen op
            factuurdatum mee in W&V en omzet monitoring, inclusief negatieve omzethuurcorrecties.
          </p>
        </div>
        <Badge variant="outline" className="gap-2 px-3 py-2">
          <FileText className="h-4 w-4" />
          PDF-import
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <StatusMetric label="Status" value={statusLabel(syncQ.data?.last_sweep_status)} />
          <StatusMetric label="Importdatum" value={formatDateTimeNL(syncQ.data?.last_sweep_at)} />
          <StatusMetric label="Facturen verwerkt" value={String(syncQ.data?.records_processed ?? "-")} />
          <StatusMetric label="Melding" value={syncQ.data?.last_sweep_message ?? "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">Jaar</label>
            <Select value={year} onValueChange={(value) => resetPageFor(() => setYear(value))}>
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
            <Select value={month} onValueChange={(value) => resetPageFor(() => setMonth(value))}>
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
            <Select value={status} onValueChange={(value) => resetPageFor(() => setStatus(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {wefactStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categorie</label>
            <Select
              value={category}
              onValueChange={(value) => resetPageFor(() => setCategory(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieen</SelectItem>
                {categories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {categoryLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <Input
              value={search}
              onChange={(event) => resetPageFor(() => setSearch(event.target.value))}
              placeholder="Factuur, klant, categorie..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Omzet ex btw" value={formatEUR(totals.net)} />
        <MetricCard title="Btw" value={formatEUR(totals.vat)} />
        <MetricCard title="Totaal incl." value={formatEUR(totals.gross)} />
        <MetricCard title="Facturen" value={`${totals.included} meegeteld`} sub={`${totals.paid} betaald, ${totals.open} open`} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Omzethuur" value={formatEUR(totals.byCategory.omzethuur ?? 0)} compact />
        <MetricCard title="Facilitair" value={formatEUR(totals.byCategory.facilitair ?? 0)} compact />
        <MetricCard title="Energie" value={formatEUR(totals.byCategory.energie ?? 0)} compact />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{periodLabel}</CardTitle>
          <CardDescription>
            De bedragen zijn ex/incl btw zoals uit de PDF-facturen gelezen. Negatieve facturen
            blijven zichtbaar en lopen mee in de omzetactuals.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Factuur</th>
                  <th className="px-3 py-2 font-medium">Klant</th>
                  <th className="px-3 py-2 font-medium">Categorie</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Vervaldatum</th>
                  <th className="px-3 py-2 text-right font-medium">Netto</th>
                  <th className="px-3 py-2 text-right font-medium">Btw</th>
                  <th className="px-3 py-2 text-right font-medium">Bruto</th>
                  <th className="px-3 py-2 font-medium">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQ.isLoading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      WeFact facturen laden...
                    </td>
                  </tr>
                )}
                {!invoicesQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      Geen WeFact facturen gevonden.
                    </td>
                  </tr>
                )}
                {rows.map((invoice) => (
                  <tr key={invoice.id} className="border-t align-top hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{invoice.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">{invoice.reference || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{invoice.customer_name || "-"}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {invoice.customer_number || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{categoryLabel(invoice.category)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={invoice.status === "paid" ? "secondary" : "outline"}>
                        {wefactStatusLabel(invoice.status)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatDateNL(invoice.invoice_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatDateNL(invoice.due_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatEUR(invoice.amount_net)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatEUR(invoice.vat_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium">
                      {formatEUR(invoice.amount_gross)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {invoice.source_filename || "-"}
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

function MetricCard({
  title,
  value,
  sub,
  compact = false,
}: {
  title: string;
  value: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={compact ? "text-2xl font-semibold tabular-nums" : "text-3xl font-semibold tabular-nums"}>
          {value}
        </div>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
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

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function categoryLabel(value: string | null | undefined) {
  switch (value) {
    case "omzethuur":
      return "Omzethuur";
    case "facilitair":
      return "Facilitair";
    case "energie":
      return "Energie";
    case "abonnement":
      return "Abonnement";
    case "bloemen/project":
      return "Bloemen/project";
    case "overig":
      return "Overig";
    default:
      return value || "Overig";
  }
}

function wefactStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "paid":
      return "Betaald";
    case "open":
      return "Open";
    case "canceled":
      return "Geannuleerd";
    default:
      return value || "-";
  }
}

function statusLabel(value: string | null | undefined) {
  switch (value) {
    case "ok":
      return "Geimporteerd";
    case "running":
      return "Draait";
    case "error":
      return "Fout";
    case "skipped":
      return "Overgeslagen";
    default:
      return "Nog niet geimporteerd";
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
