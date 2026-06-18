import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { formatEUR, channelLabels, currentMonth, monthLabel, formatDateTimeNL } from "@/lib/format";
import { toast } from "sonner";
import { FileText, RefreshCw, Store, ShoppingCart, Cpu, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Daily Flowers" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [initialYear, initialMonth] = currentMonth().split("-");
  const [year, setYear] = useState<string>(initialYear);
  const [month, setMonth] = useState<string>(initialMonth);
  const period = `${year}-${month}`;

  const channelQ = useQuery({
    queryKey: ["vw_monthly_revenue_actuals", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_revenue_actuals" as never)
        .select("*")
        .eq("period", period);
      if (error) throw error;
      return data as Array<{ period: string; channel: string; tx_count: number; gross_total: number; net_total: number; vat_total: number }>;
    },
  });

  const machineQ = useQuery({
    queryKey: ["vw_monthly_machine", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_machine" as never)
        .select("*")
        .eq("period", period)
        .eq("channel", "bold_afs");
      if (error) throw error;
      return data as Array<{ display_name: string | null; afs_number: string | null; machine_id: string | null; tx_count: number; gross_total: number; net_total: number; vat_total: number }>;
    },
  });

  const syncQ = useQuery({
    queryKey: ["sync_state"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sync_state").select("*");
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const [sweeping, setSweeping] = useState(false);
  async function runSweep() {
    setSweeping(true);
    toast.message("Sweep gestart…", { description: "Dit draait op de achtergrond en kan enkele minuten duren." });
    const { error } = await supabase.functions.invoke("daily-sweep");
    setSweeping(false);
    if (error) toast.error("Sweep starten mislukt", { description: error.message });
    else { toast.success("Sweep loopt op de achtergrond"); syncQ.refetch(); }
  }


  const byChannel = (c: string) => channelQ.data?.find((x) => x.channel === c);
  const cards = [
    { key: "shopify_webshop", icon: ShoppingCart },
    { key: "shopify_winkel", icon: Store },
    { key: "bold_afs", icon: Cpu },
    { key: "mollie_facturen", icon: ReceiptText },
    { key: "wefact_facturen", icon: FileText },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Omzet ex btw per kanaal voor <span className="font-medium">{monthLabel(period)}</span>. Shopify gebruikt alle orders met btw-factuurdata, inclusief pending.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Jaar</div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions().map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Periode</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSweep} variant="outline" disabled={sweeping}><RefreshCw className={`h-4 w-4 mr-2 ${sweeping ? "animate-spin" : ""}`} />{sweeping ? "Bezig…" : "Sweep nu"}</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ key, icon: Icon }) => {
          const row = byChannel(key);
          return (
            <Card key={key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{channelLabels[key]}</CardTitle>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {row?.tx_count ?? 0}{" "}
                  {key === "bold_afs"
                    ? "omzetrecords"
                    : key === "mollie_facturen"
                      ? "betaalde facturen"
                      : key === "wefact_facturen"
                        ? "facturen"
                        : "btw-factuurorders"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">{formatEUR(row?.net_total ?? 0)}</div>
                <div className="mt-2 text-sm text-muted-foreground space-y-0.5 tabular-nums">
                  <div>Btw: {formatEUR(row?.vat_total ?? 0)}</div>
                  <div>Totaal incl. btw: {formatEUR(row?.gross_total ?? 0)}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bold/AFS — per machine</CardTitle>
          <CardDescription>Uitsplitsing van de Bold-omzet ex btw per uitgiftemachine.</CardDescription>
        </CardHeader>
        <CardContent>
          {machineQ.data && machineQ.data.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Machine</th>
                    <th className="px-3 py-2 font-medium">AFS</th>
                    <th className="px-3 py-2 font-medium text-right">Aantal</th>
                    <th className="px-3 py-2 font-medium text-right">Netto</th>
                    <th className="px-3 py-2 font-medium text-right">Btw</th>
                    <th className="px-3 py-2 font-medium text-right">Totaal incl.</th>
                  </tr>
                </thead>
                <tbody>
                  {machineQ.data.map((m) => (
                    <tr key={(m.machine_id ?? "x") + (m.afs_number ?? "")} className="border-t">
                      <td className="px-3 py-2">{m.display_name ?? <span className="text-muted-foreground italic">Onbekende machine</span>}</td>
                      <td className="px-3 py-2 tabular-nums">{m.afs_number ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.tx_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(m.net_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(m.vat_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(m.gross_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Geen Bold-verkooptransacties in deze periode.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Laatste reconciliatie-sweep</CardTitle>
          <CardDescription>Wanneer is per kanaal voor het laatst gecontroleerd op ontbrekende verkooptransacties.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {(["shopify_webshop", "shopify_winkel", "bold_afs"] as const).map((c) => {
              const s = syncQ.data?.find((x: any) => x.channel === c);
              return (
                <div key={c} className="border rounded-md p-3">
                  <div className="text-sm font-medium">{channelLabels[c]}</div>
                  <div className="text-xs text-muted-foreground mt-1">{formatDateTimeNL(s?.last_sweep_at ?? null)}</div>
                  <div className="mt-2">
                    {s?.last_sweep_status === "ok" ? (
                      <Badge variant="secondary">OK · {s?.records_processed ?? 0} records</Badge>
                    ) : s?.last_sweep_status === "error" ? (
                      <Badge variant="destructive">Fout</Badge>
                    ) : (
                      <Badge variant="outline">Nog niet gedraaid</Badge>
                    )}
                  </div>
                  {s?.last_sweep_message && (
                    <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.last_sweep_message}</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 1 - index));
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return {
      value: month,
      label: monthLabel(`2000-${month}`).replace(" 2000", ""),
    };
  });
}
