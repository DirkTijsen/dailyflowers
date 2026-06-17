import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { formatEUR, channelLabels, currentMonth, monthLabel } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/btw-export")({
  head: () => ({ meta: [{ title: "Btw-export — Daily Flowers" }] }),
  component: VatExportPage,
});

function monthsList(n = 24): string[] {
  const arr: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return arr;
}

type VatRow = { period: string; channel: string; vat_rate: number; tx_count: number; gross_total: number; net_total: number; vat_total: number };
type ChRow = { period: string; channel: string; tx_count: number; gross_total: number; net_total: number; vat_total: number };

function VatExportPage() {
  const [period, setPeriod] = useState(currentMonth());

  const vatQ = useQuery({
    queryKey: ["vw_monthly_vat", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_monthly_vat" as never).select("*").eq("period", period).order("channel").order("vat_rate");
      if (error) throw error;
      return data as VatRow[];
    },
  });

  const chQ = useQuery({
    queryKey: ["vw_monthly_channel", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_monthly_channel" as never).select("*").eq("period", period);
      if (error) throw error;
      return data as ChRow[];
    },
  });

  const errorsQ = useQuery({
    queryKey: ["tx-error-count", period],
    queryFn: async () => {
      const [y, m] = period.split("-").map(Number);
      const start = new Date(y, m - 1, 1).toISOString();
      const end = new Date(y, m, 1).toISOString();
      const { count, error } = await supabase
        .from("transactions").select("id", { count: "exact", head: true })
        .eq("parse_status", "parse_error").gte("paid_at", start).lt("paid_at", end);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalsPerChannel = useMemo(() => {
    const map = new Map<string, { gross: number; net: number; vat: number; count: number }>();
    vatQ.data?.forEach((r) => {
      const e = map.get(r.channel) ?? { gross: 0, net: 0, vat: 0, count: 0 };
      e.gross += Number(r.gross_total); e.net += Number(r.net_total); e.vat += Number(r.vat_total); e.count += r.tx_count;
      map.set(r.channel, e);
    });
    return map;
  }, [vatQ.data]);

  function exportCsv() {
    const rows: string[] = [];
    rows.push(["Periode", "Kanaal", "Btw-tarief", "Aantal", "Netto", "Btw", "Bruto"].join(";"));
    vatQ.data?.forEach((r) => {
      rows.push([
        r.period, channelLabels[r.channel] ?? r.channel, `${r.vat_rate}%`,
        r.tx_count, fmt(r.net_total), fmt(r.vat_total), fmt(r.gross_total),
      ].join(";"));
    });
    rows.push("");
    rows.push(["Periode", "Kanaal", "TOTAAL", "Aantal", "Netto", "Btw", "Bruto"].join(";"));
    for (const [channel, t] of totalsPerChannel) {
      rows.push([period, channelLabels[channel] ?? channel, "—", t.count, fmt(t.net), fmt(t.vat), fmt(t.gross)].join(";"));
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `btw-export-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function fmt(n: number | string) { return Number(n).toFixed(2).replace(".", ","); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Btw-export</h1>
          <p className="text-sm text-muted-foreground">
            Maandoverzicht per kanaal en btw-tarief — uitsluitend afgeronde betalingen, exclusief parse-fouten. Over te nemen in Exact Online.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Periode</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{monthsList().map((p) => <SelectItem key={p} value={p}>{monthLabel(p)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={exportCsv}><Download className="h-4 w-4 mr-2" />CSV exporteren</Button>
        </div>
      </div>

      {errorsQ.data && errorsQ.data > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm">
              <strong>{errorsQ.data}</strong> verkooptransactie(s) in deze maand hebben een parse-fout en zijn uitgesloten van deze export.
              Controleer de onderliggende Mollie-transactie of importregel voordat je exporteert.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{monthLabel(period)} — per kanaal en btw-tarief</CardTitle>
          <CardDescription>Som van netto, btw en bruto per combinatie.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Kanaal</th>
                <th className="px-3 py-2 font-medium">Btw-tarief</th>
                <th className="px-3 py-2 font-medium text-right">Aantal</th>
                <th className="px-3 py-2 font-medium text-right">Netto</th>
                <th className="px-3 py-2 font-medium text-right">Btw</th>
                <th className="px-3 py-2 font-medium text-right">Bruto</th>
              </tr>
            </thead>
            <tbody>
              {vatQ.data?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Geen afgeronde verkooptransacties in deze maand.</td></tr>}
              {vatQ.data?.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{channelLabels[r.channel] ?? r.channel}</td>
                  <td className="px-3 py-2 tabular-nums">{r.vat_rate}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tx_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(r.net_total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(r.vat_total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(r.gross_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kanaaltotalen — controle</CardTitle>
          <CardDescription>De som van de tarief-regels per kanaal moet overeenkomen met het kanaaltotaal.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Kanaal</th>
                <th className="px-3 py-2 font-medium text-right">Som tarieven (netto)</th>
                <th className="px-3 py-2 font-medium text-right">Kanaaltotaal (netto)</th>
                <th className="px-3 py-2 font-medium text-right">Verschil</th>
              </tr>
            </thead>
            <tbody>
              {(["shopify_webshop", "shopify_winkel", "bold_afs"] as const).map((ch) => {
                const t = totalsPerChannel.get(ch) ?? { net: 0, gross: 0, vat: 0, count: 0 };
                const c = chQ.data?.find((x) => x.channel === ch);
                const channelNet = Number(c?.net_total ?? 0);
                const diff = +(t.net - channelNet).toFixed(2);
                return (
                  <tr key={ch} className="border-t">
                    <td className="px-3 py-2">{channelLabels[ch]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(t.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(channelNet)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(diff) > 0.01 ? "text-destructive font-medium" : "text-muted-foreground"}`}>{formatEUR(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
