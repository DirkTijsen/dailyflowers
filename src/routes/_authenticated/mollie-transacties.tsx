import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeNL, formatEUR, statusLabels } from "@/lib/format";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/mollie-transacties")({
  validateSearch: (search: Record<string, unknown>) => ({
    period: typeof search.period === "string" ? search.period : "",
  }),
  head: () => ({ meta: [{ title: "Mollie Transacties - Daily Flowers" }] }),
  component: MollieTransactionsPage,
});

function MollieTransactionsPage() {
  const { period } = Route.useSearch();
  const [parseStatus, setParseStatus] = useState("all");
  const [salesAction, setSalesAction] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["mollie-transactions", parseStatus, salesAction, status, search, period, page],
    queryFn: async () => {
      let query = (supabase as any)
        .from("mollie_transactions")
        .select(
          "id,payment_id,mollie_created_at,mollie_paid_at,status,amount_gross,amount_net,vat_amount,vat_rate,discount_amount,description_raw,parsed_afs_number,parsed_article_number,parsed_invoice_number,parsed_paid_at,parse_status,parse_error_message,sales_action,sales_transaction_id,created_at",
          { count: "exact" },
        )
        .order("mollie_created_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (parseStatus !== "all") query = query.eq("parse_status", parseStatus);
      if (salesAction !== "all") query = query.eq("sales_action", salesAction);
      if (status !== "all") query = query.eq("status", status);
      if (period) {
        const [year, month] = period.split("-").map(Number);
        const start = new Date(year, month - 1, 1).toISOString();
        const end = new Date(year, month, 1).toISOString();
        query = query.gte("mollie_created_at", start).lt("mollie_created_at", end);
      }
      if (search) {
        query = query.or(
          `payment_id.ilike.%${search}%,parsed_invoice_number.ilike.%${search}%,parsed_article_number.ilike.%${search}%,parsed_afs_number.ilike.%${search}%,description_raw.ilike.%${search}%`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mollie Transacties</h1>
        <p className="text-sm text-muted-foreground">
          Importlog van Mollie-betalingen met parse-status en verkooptransactie-resultaat.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
          {period && (
            <p className="text-xs text-muted-foreground">
              Maandfilter actief: <span className="tabular-nums">{period}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Parsing</label>
            <Select
              value={parseStatus}
              onValueChange={(value) => {
                setParseStatus(value);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alles</SelectItem>
                <SelectItem value="ok">Geparsed</SelectItem>
                <SelectItem value="parse_error">Niet geparsed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Verkooptransactie</label>
            <Select
              value={salesAction}
              onValueChange={(value) => {
                setSalesAction(value);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alles</SelectItem>
                <SelectItem value="added">Toegevoegd</SelectItem>
                <SelectItem value="already_exists">Bestond al</SelectItem>
                <SelectItem value="not_parsed">Niet toegevoegd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Mollie status</label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <Input
              placeholder="Payment, factuur, AFS, artikel..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Mollie</th>
                  <th className="px-3 py-2 font-medium">Omschrijving</th>
                  <th className="px-3 py-2 font-medium">Parsing</th>
                  <th className="px-3 py-2 font-medium">Verkooptransactie</th>
                  <th className="px-3 py-2 font-medium">Herkenning</th>
                  <th className="px-3 py-2 font-medium text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Laden...
                    </td>
                  </tr>
                )}
                {q.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Geen Mollie transacties gevonden.
                    </td>
                  </tr>
                )}
                {q.data?.rows.map((row: any) => (
                  <tr key={row.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 min-w-[210px]">
                      <div className="font-mono text-xs">{row.payment_id}</div>
                      <div className="mt-1 tabular-nums text-xs text-muted-foreground">
                        {formatDateTimeNL(row.mollie_paid_at ?? row.mollie_created_at)}
                      </div>
                      <Badge variant="outline" className="mt-1 font-normal">
                        {statusLabels[row.status] ?? row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 min-w-[280px] max-w-[460px]">
                      <div className="truncate font-mono text-xs" title={row.description_raw ?? ""}>
                        {row.description_raw || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[170px]">
                      <Badge variant={row.parse_status === "ok" ? "secondary" : "destructive"}>
                        {row.parse_status === "ok" ? "Geparsed" : "Niet geparsed"}
                      </Badge>
                      {row.parse_error_message && (
                        <div className="mt-1 max-w-[260px] text-xs text-destructive">
                          {row.parse_error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[190px]">
                      <Badge variant={salesActionVariant(row.sales_action)}>
                        {salesActionLabel(row.sales_action)}
                      </Badge>
                      {row.sales_transaction_id && (
                        <div className="mt-1">
                          <Link
                            to="/transacties/$id"
                            params={{ id: row.sales_transaction_id }}
                            className="inline-flex items-center gap-1 text-xs text-primary underline"
                          >
                            Verkooptransactie
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[200px] text-xs">
                      <div>Factuur: {row.parsed_invoice_number ?? "-"}</div>
                      <div>AFS: {row.parsed_afs_number ?? "-"}</div>
                      <div>Art.nr: {row.parsed_article_number ?? "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums min-w-[150px]">
                      <div className="font-medium">{formatEUR(row.amount_gross)}</div>
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        <div>Netto: {formatEUR(row.amount_net)}</div>
                        <div>Btw: {formatEUR(row.vat_amount)}</div>
                        {row.vat_rate !== null && row.vat_rate !== undefined && (
                          <div>{Number(row.vat_rate)}%</div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-3 border-t">
            <div className="text-xs text-muted-foreground">
              {q.data
                ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, q.data.count)} van ${q.data.count}`
                : "-"}
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
                disabled={!q.data || (page + 1) * PAGE_SIZE >= q.data.count}
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

function salesActionLabel(action: string) {
  if (action === "added") return "Toegevoegd";
  if (action === "already_exists") return "Bestond al";
  return "Niet toegevoegd";
}

function salesActionVariant(action: string) {
  if (action === "added") return "default";
  if (action === "already_exists") return "secondary";
  return "outline";
}
