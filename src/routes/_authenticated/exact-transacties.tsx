import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateNL, formatDateTimeNL, formatEUR } from "@/lib/format";

const PAGE_SIZE = 75;

export const Route = createFileRoute("/_authenticated/exact-transacties")({
  head: () => ({ meta: [{ title: "Exact transacties - Daily Flowers" }] }),
  component: ExactTransactionsPage,
});

type ExactTransactionRow = {
  id: string;
  external_id: string;
  transaction_date: string;
  account_code: string;
  description: string | null;
  relation_name: string | null;
  document_number: string | null;
  amount: number | string;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type GlAccountRow = {
  account_code: string;
  account_name: string;
  pl_section: string | null;
};

type SyncStateRow = {
  channel: string;
  last_sweep_at: string | null;
  last_sweep_status: string | null;
  last_sweep_message: string | null;
  records_processed: number | null;
  updated_at: string | null;
};

function ExactTransactionsPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("all");
  const [accountCode, setAccountCode] = useState("all");
  const [journal, setJournal] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const accountsQ = useQuery({
    queryKey: ["exact-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
        .select("account_code,account_name,pl_section")
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as GlAccountRow[];
    },
  });

  const syncQ = useQuery({
    queryKey: ["sync_state", "exact_gl"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sync_state")
        .select("channel,last_sweep_at,last_sweep_status,last_sweep_message,records_processed,updated_at")
        .eq("channel", "exact_gl")
        .maybeSingle();
      if (error) throw error;
      return data as SyncStateRow | null;
    },
    refetchInterval: (query) => (query.state.data?.last_sweep_status === "running" ? 5000 : false),
  });

  const txQ = useQuery({
    queryKey: ["exact-transactions", year, month, accountCode, journal, search, page],
    queryFn: async () => {
      let q = (supabase as any)
        .from("gl_transactions")
        .select(
          "id,external_id,transaction_date,account_code,description,relation_name,document_number,amount,debit_amount,credit_amount,raw_payload,created_at,updated_at",
          { count: "exact" },
        )
        .eq("source", "exact_invantive")
        .order("transaction_date", { ascending: false, nullsFirst: false })
        .order("document_number", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { start, end } = periodBounds(year, month);
      if (start) q = q.gte("transaction_date", start);
      if (end) q = q.lt("transaction_date", end);
      if (accountCode !== "all") q = q.eq("account_code", accountCode);
      if (journal.trim()) q = q.ilike("raw_payload->>journalcode", `%${journal.trim()}%`);
      if (search.trim()) {
        const needle = search.trim();
        q = q.or(
          `external_id.ilike.%${needle}%,account_code.ilike.%${needle}%,document_number.ilike.%${needle}%,relation_name.ilike.%${needle}%,description.ilike.%${needle}%`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as ExactTransactionRow[], count: count ?? 0 };
    },
  });

  async function syncExact() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("exact-sync");
      if (error) throw error;
      if ((data as { status?: string } | null)?.status === "already_running") {
        toast.message("Exact sync draait al", {
          description: (data as { message?: string } | null)?.message,
        });
      } else {
        toast.success("Exact sync gestart");
      }
      qc.invalidateQueries({ queryKey: ["sync_state"] });
      qc.invalidateQueries({ queryKey: ["exact-transactions"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-monthly"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-revenue-source-monthly"] });
    } catch (error) {
      toast.error("Exact sync starten mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSyncing(false);
    }
  }

  const total = txQ.data?.count ?? 0;
  const rows = txQ.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Exact transacties</h1>
          <p className="text-sm text-muted-foreground">
            Grootboekregels die automatisch via Invantive uit Exact zijn opgehaald.
          </p>
        </div>
        <Button variant="outline" onClick={syncExact} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          Exact sync
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <MiniStatus label="Status" value={syncStatusLabel(syncQ.data)} />
          <MiniStatus label="Laatste run" value={formatDateTimeNL(syncQ.data?.last_sweep_at)} />
          <MiniStatus label="Regels verwerkt" value={String(syncQ.data?.records_processed ?? 0)} />
          <MiniStatus label="Melding" value={syncQ.data?.last_sweep_message ?? "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">Jaar</label>
            <Select
              value={year}
              onValueChange={(value) => {
                setYear(value);
                setPage(0);
              }}
            >
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
            <Select
              value={month}
              onValueChange={(value) => {
                setMonth(value);
                setPage(0);
              }}
            >
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
            <label className="text-xs text-muted-foreground">Rekening</label>
            <Select
              value={accountCode}
              onValueChange={(value) => {
                setAccountCode(value);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle rekeningen</SelectItem>
                {accountsQ.data?.map((account) => (
                  <SelectItem key={account.account_code} value={account.account_code}>
                    {account.account_code} - {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dagboek</label>
            <Input
              placeholder="Bijv. MO1"
              value={journal}
              onChange={(event) => {
                setJournal(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <Input
              placeholder="Boekstuk, relatie, omschrijving..."
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
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Dagboek</th>
                  <th className="px-3 py-2 font-medium">Boekstuk</th>
                  <th className="px-3 py-2 font-medium">Exact</th>
                  <th className="px-3 py-2 font-medium">Rekening</th>
                  <th className="px-3 py-2 font-medium">Relatie</th>
                  <th className="px-3 py-2 font-medium">Omschrijving</th>
                  <th className="px-3 py-2 text-right font-medium">Bedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Debet</th>
                  <th className="px-3 py-2 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {txQ.isLoading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      Laden...
                    </td>
                  </tr>
                )}
                {!txQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      Geen Exact transacties gevonden.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const documentUrl = exactDocumentUrl(row);
                  return (
                    <tr key={row.id} className="border-t align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatDateNL(row.transaction_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge variant="outline">{rawText(row, ["journalcode", "JournalCode"]) || "-"}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{row.document_number || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-1">
                        {documentUrl ? (
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Open Exact-document">
                            <a href={documentUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div>{row.account_code}</div>
                        <div className="text-xs text-muted-foreground">
                          {rawText(row, ["GLAccountDescription", "glaccountdescription"])}
                        </div>
                      </td>
                      <td className="min-w-[180px] px-3 py-2">{row.relation_name || "-"}</td>
                      <td className="min-w-[260px] px-3 py-2">
                        <div>{row.description || "-"}</div>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {rawText(row, ["PaymentReference", "paymentreference", "YourRef", "yourRef"])}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.debit_amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.credit_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-3">
            <div className="text-xs text-muted-foreground">
              {txQ.data ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, total)} van ${total}` : "-"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!txQ.data || (page + 1) * PAGE_SIZE >= total}
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

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}

function periodBounds(year: string, month: string) {
  const y = Number(year);
  if (!Number.isFinite(y)) return { start: null, end: null };
  if (month !== "all") {
    const m = Number(month);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(y, m, 1));
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  }
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from(new Set([current, current - 1, current - 2, current + 1].map(String))).sort((a, b) => Number(b) - Number(a));
}

function monthName(index: number) {
  return new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" });
}

function syncStatusLabel(state: SyncStateRow | null | undefined) {
  const status = state?.last_sweep_status;
  if (status === "running") return isStaleRunning(state) ? "Vastgelopen?" : "Draait";
  if (status === "ok") return "Gelukt";
  if (status === "error") return "Fout";
  if (status === "skipped") return "Overgeslagen";
  return "-";
}

function isStaleRunning(state: SyncStateRow | null | undefined) {
  if (state?.last_sweep_status !== "running" || !state.updated_at) return false;
  const updatedAt = new Date(state.updated_at).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > 5 * 60 * 1000;
}

function exactDocumentUrl(row: ExactTransactionRow) {
  const direct = rawText(row, ["exact_document_url", "ExactDocumentUrl", "document_url", "DocumentUrl"]);
  if (/^https?:\/\//i.test(direct)) return direct;
  const documentId = rawText(row, ["exact_document_id", "Document", "document"]);
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function rawText(row: ExactTransactionRow, keys: string[]) {
  for (const key of keys) {
    const value = row.raw_payload?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}
