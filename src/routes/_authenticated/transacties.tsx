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
import { useState } from "react";
import { formatEUR, formatDateTimeNL, channelLabels, statusLabels } from "@/lib/format";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/transacties")({
  head: () => ({ meta: [{ title: "Verkooptransacties - Daily Flowers" }] }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("paid");
  const [machineId, setMachineId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(0);

  const machinesQ = useQuery({
    queryKey: ["machines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id,display_name,afs_number,machine_id")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const txQ = useQuery({
    queryKey: ["tx", channel, status, machineId, from, to, search, page],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select(
          "id,external_id,source,channel,machine_id,article_number,product_name,amount_gross,amount_net,vat_amount,vat_rate,discount_amount,status,paid_at,invoice_number,invoice_url,description_raw,parse_status,parse_error_message,machines(display_name,afs_number,machine_id)",
          { count: "exact" },
        )
        .order("paid_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (channel !== "all") q = q.eq("channel", channel as any);
      if (status !== "all") q = q.eq("status", status as any);
      if (machineId !== "all") q = q.eq("machine_id", machineId);
      if (from) q = q.gte("paid_at", new Date(from).toISOString());
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        q = q.lte("paid_at", d.toISOString());
      }
      if (search) {
        q = q.or(
          `invoice_number.ilike.%${search}%,article_number.ilike.%${search}%,product_name.ilike.%${search}%,external_id.ilike.%${search}%,description_raw.ilike.%${search}%`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Verkooptransacties</h1>
        <p className="text-sm text-muted-foreground">
          Server-side gefilterd en gepagineerd met bron, btw, factuur en referentiegegevens.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div>
            <label className="text-xs text-muted-foreground">Kanaal</label>
            <Select
              value={channel}
              onValueChange={(v) => {
                setChannel(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle kanalen</SelectItem>
                <SelectItem value="shopify_webshop">{channelLabels.shopify_webshop}</SelectItem>
                <SelectItem value="shopify_winkel">{channelLabels.shopify_winkel}</SelectItem>
                <SelectItem value="bold_afs">{channelLabels.bold_afs}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Machine</label>
            <Select
              value={machineId}
              onValueChange={(v) => {
                setMachineId(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle machines</SelectItem>
                {machinesQ.data?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name} ({m.machine_id || m.afs_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Vanaf</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">T/m</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zoeken</label>
            <Input
              placeholder="Factuur, art.nr, product..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
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
                  <th className="px-3 py-2 font-medium">Datum / bron</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Machine / omschrijving</th>
                  <th className="px-3 py-2 font-medium">Factuur / extern</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Bedragen</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {txQ.isLoading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      Laden...
                    </td>
                  </tr>
                )}
                {txQ.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      Geen verkooptransacties gevonden.
                    </td>
                  </tr>
                )}
                {txQ.data?.rows.map((t: any) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="tabular-nums">{formatDateTimeNL(t.paid_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {sourceLabel(t.source)}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[140px]">
                      <div>{channelLabels[t.channel] ?? t.channel}</div>
                      <Badge variant="outline" className="mt-1 font-normal">
                        {t.channel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 min-w-[260px] max-w-[360px]">
                      <div className="font-medium truncate">{t.product_name ?? "-"}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Art.nr: <span className="tabular-nums">{t.article_number ?? "-"}</span>
                        </span>
                        {t.vat_rate !== null && t.vat_rate !== undefined && (
                          <span>Btw: {Number(t.vat_rate)}%</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[240px] max-w-[360px]">
                      <div>
                        {t.machines?.display_name ??
                          (t.channel === "bold_afs" ? (
                            <span className="text-muted-foreground italic">Onbekend</span>
                          ) : (
                            "-"
                          ))}
                      </div>
                      {t.machines?.afs_number && (
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          AFS {t.machines.afs_number}
                        </div>
                      )}
                      {t.machines?.machine_id && (
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          ID {t.machines.machine_id}
                        </div>
                      )}
                      {t.description_raw && (
                        <div
                          className="mt-1 truncate font-mono text-xs text-muted-foreground"
                          title={t.description_raw}
                        >
                          {t.description_raw}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[190px] max-w-[260px]">
                      <div className="tabular-nums">{t.invoice_number ?? "-"}</div>
                      <div
                        className="mt-1 truncate text-xs text-muted-foreground"
                        title={t.external_id}
                      >
                        Extern: <span className="font-mono">{t.external_id}</span>
                      </div>
                      {t.invoice_url && (
                        <a
                          className="mt-1 inline-block text-xs text-primary underline"
                          href={t.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Factuur openen
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(t.status)}>
                        {statusLabels[t.status] ?? t.status}
                      </Badge>
                      {t.parse_status === "parse_error" && (
                        <div className="mt-1">
                          <Badge variant="outline">Parse-fout</Badge>
                          {t.parse_error_message && (
                            <div className="mt-1 max-w-[220px] text-xs text-destructive">
                              {t.parse_error_message}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums min-w-[150px]">
                      <div className="font-medium">{formatEUR(t.amount_gross)}</div>
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        <div>Netto: {formatEUR(t.amount_net)}</div>
                        <div>Btw: {formatEUR(t.vat_amount)}</div>
                        {t.discount_amount !== null && t.discount_amount !== undefined && (
                          <div>Korting: {formatEUR(t.discount_amount)}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link to="/transacties/$id" params={{ id: t.id }}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-3 border-t">
            <div className="text-xs text-muted-foreground">
              {txQ.data
                ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, txQ.data.count)} van ${txQ.data.count}`
                : "-"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!txQ.data || (page + 1) * PAGE_SIZE >= txQ.data.count}
                onClick={() => setPage((p) => p + 1)}
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

function sourceLabel(source: string | null | undefined) {
  switch (source) {
    case "shopify":
      return "Shopify";
    case "mollie":
      return "Mollie";
    default:
      return source ?? "-";
  }
}

function statusVariant(status: string) {
  if (status === "paid") return "default";
  if (status === "failed" || status === "canceled") return "destructive";
  return "secondary";
}
