import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { channelLabels, currentMonth, formatEUR, monthLabel } from "@/lib/format";
import { normalizeVatRate, recentPeriods, vatBreakdownKey } from "@/lib/vat-export";

export const Route = createFileRoute("/_authenticated/btw-export")({
  head: () => ({ meta: [{ title: "Btw-export — Daily Flowers" }] }),
  component: VatExportPage,
});

type VatRow = {
  period: string;
  channel: string;
  vat_rate: number | string;
  tx_count: number;
  gross_total: number;
  net_total: number;
  vat_total: number;
};

type ChannelRow = {
  period: string;
  channel: string;
  tx_count: number;
  gross_total: number;
  net_total: number;
  vat_total: number;
};

type VatTotals = {
  gross: number;
  net: number;
  vat: number;
  count: number;
};

const CHANNELS = ["shopify_webshop", "shopify_winkel", "bold_afs"] as const;
const EMPTY_TOTALS: VatTotals = { gross: 0, net: 0, vat: 0, count: 0 };

function VatExportPage() {
  const availablePeriods = useMemo(() => recentPeriods(), []);
  const [periods, setPeriods] = useState<string[]>([currentMonth()]);
  const sortedPeriods = useMemo(() => [...periods].sort(), [periods]);

  const vatQ = useQuery({
    queryKey: ["vw_monthly_vat", sortedPeriods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_vat" as never)
        .select("*")
        .in("period", sortedPeriods)
        .order("period")
        .order("channel")
        .order("vat_rate");
      if (error) throw error;
      return data as VatRow[];
    },
  });

  const channelQ = useQuery({
    queryKey: ["vw_monthly_channel", sortedPeriods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_channel" as never)
        .select("*")
        .in("period", sortedPeriods);
      if (error) throw error;
      return data as ChannelRow[];
    },
  });

  const errorsQ = useQuery({
    queryKey: ["tx-error-count", sortedPeriods],
    queryFn: async () => {
      const counts = await Promise.all(
        sortedPeriods.map(async (period) => {
          const [year, month] = period.split("-").map(Number);
          const start = new Date(year, month - 1, 1).toISOString();
          const end = new Date(year, month, 1).toISOString();
          const { count, error } = await supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("parse_status", "parse_error")
            .gte("paid_at", start)
            .lt("paid_at", end);
          if (error) throw error;
          return [period, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(counts) as Record<string, number>;
    },
  });

  const vatByPeriodChannelRate = useMemo(() => {
    const result = new Map<string, VatTotals>();
    for (const row of vatQ.data ?? []) {
      result.set(vatBreakdownKey(row.period, row.channel, row.vat_rate), {
        gross: Number(row.gross_total),
        net: Number(row.net_total),
        vat: Number(row.vat_total),
        count: Number(row.tx_count),
      });
    }
    return result;
  }, [vatQ.data]);

  const channelRateRows = useMemo(() => {
    const result = new Map<string, { channel: string; vatRate: number }>();
    for (const row of vatQ.data ?? []) {
      result.set(`${row.channel}|${normalizeVatRate(row.vat_rate)}`, {
        channel: row.channel,
        vatRate: Number(row.vat_rate),
      });
    }
    return [...result.values()].sort(
      (a, b) =>
        (channelLabels[a.channel] ?? a.channel).localeCompare(
          channelLabels[b.channel] ?? b.channel,
          "nl",
        ) || a.vatRate - b.vatRate,
    );
  }, [vatQ.data]);

  const totalsPerPeriodChannel = useMemo(() => {
    const result = new Map<string, VatTotals>();
    for (const row of vatQ.data ?? []) {
      const key = `${row.period}|${row.channel}`;
      const totals = result.get(key) ?? { ...EMPTY_TOTALS };
      totals.gross += Number(row.gross_total);
      totals.net += Number(row.net_total);
      totals.vat += Number(row.vat_total);
      totals.count += Number(row.tx_count);
      result.set(key, totals);
    }
    return result;
  }, [vatQ.data]);

  const channelByPeriod = useMemo(
    () => new Map((channelQ.data ?? []).map((row) => [`${row.period}|${row.channel}`, row])),
    [channelQ.data],
  );

  const errorTotal = Object.values(errorsQ.data ?? {}).reduce((sum, count) => sum + count, 0);

  function togglePeriod(period: string) {
    setPeriods((current) => {
      if (!current.includes(period)) return [...current, period].sort();
      if (current.length === 1) return current;
      return current.filter((item) => item !== period);
    });
  }

  function exportCsv() {
    const rows: string[] = [];
    const monthHeaders = sortedPeriods.map(monthLabel);
    rows.push(["Kanaal", "Btw-tarief", "Waarde", ...monthHeaders].join(";"));

    for (const row of channelRateRows) {
      const values = sortedPeriods.map(
        (period) =>
          vatByPeriodChannelRate.get(vatBreakdownKey(period, row.channel, row.vatRate)) ??
          EMPTY_TOTALS,
      );
      const prefix = [channelLabels[row.channel] ?? row.channel, `${row.vatRate}%`];
      rows.push([...prefix, "Aantal", ...values.map((value) => value.count)].join(";"));
      rows.push(
        [...prefix, "Netto", ...values.map((value) => formatCsvNumber(value.net))].join(";"),
      );
      rows.push([...prefix, "Btw", ...values.map((value) => formatCsvNumber(value.vat))].join(";"));
      rows.push(
        [...prefix, "Bruto", ...values.map((value) => formatCsvNumber(value.gross))].join(";"),
      );
    }

    rows.push("");
    rows.push(["Kanaaltotalen", "", "Waarde", ...monthHeaders].join(";"));
    for (const channel of CHANNELS) {
      const values = sortedPeriods.map(
        (period) => totalsPerPeriodChannel.get(`${period}|${channel}`) ?? EMPTY_TOTALS,
      );
      const prefix = [channelLabels[channel], "—"];
      rows.push([...prefix, "Aantal", ...values.map((value) => value.count)].join(";"));
      rows.push(
        [...prefix, "Netto", ...values.map((value) => formatCsvNumber(value.net))].join(";"),
      );
      rows.push([...prefix, "Btw", ...values.map((value) => formatCsvNumber(value.vat))].join(";"));
      rows.push(
        [...prefix, "Bruto", ...values.map((value) => formatCsvNumber(value.gross))].join(";"),
      );
    }

    const blob = new Blob(["\uFEFF" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const periodPart =
      sortedPeriods.length === 1
        ? sortedPeriods[0]
        : `${sortedPeriods[0]}-tm-${sortedPeriods.at(-1)}`;
    anchor.href = url;
    anchor.download = `btw-export-${periodPart}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Btw-export</h1>
          <p className="text-sm text-muted-foreground">
            Maandoverzicht per kanaal en btw-tarief — uitsluitend afgeronde betalingen, exclusief
            parse-fouten. Over te nemen in Exact Online.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground">Periodes</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-[240px] justify-between">
                  {sortedPeriods.length === 1
                    ? monthLabel(sortedPeriods[0])
                    : `${sortedPeriods.length} maanden geselecteerd`}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] p-0">
                <div className="flex items-center justify-between border-b p-3">
                  <span className="text-sm font-medium">Selecteer maanden</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setPeriods([...availablePeriods].sort())}
                  >
                    Alle 24
                  </Button>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {availablePeriods.map((period) => (
                    <label
                      key={period}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={periods.includes(period)}
                        onCheckedChange={() => togglePeriod(period)}
                      />
                      <span className="text-sm">{monthLabel(period)}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={exportCsv} disabled={vatQ.isLoading || vatQ.isError}>
            <Download className="mr-2 h-4 w-4" />
            CSV exporteren
          </Button>
        </div>
      </div>

      {errorTotal > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm">
              <strong>{errorTotal}</strong> verkooptransactie(s) in de geselecteerde maanden hebben
              een parse-fout en zijn uitgesloten van deze export. Controleer de onderliggende
              Mollie-transactie of importregel voordat je exporteert.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sortedPeriods
                .filter((period) => (errorsQ.data?.[period] ?? 0) > 0)
                .map((period) => `${monthLabel(period)}: ${errorsQ.data?.[period] ?? 0}`)
                .join(" · ")}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per kanaal en btw-tarief</CardTitle>
          <CardDescription>
            Elke maand blijft een aparte kolom. Per cel zie je aantal, netto, btw en bruto.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="sticky left-0 min-w-44 bg-muted px-3 py-2 font-medium">Kanaal</th>
                <th className="min-w-24 px-3 py-2 font-medium">Btw-tarief</th>
                {sortedPeriods.map((period) => (
                  <th key={period} className="min-w-44 px-3 py-2 text-right font-medium">
                    {monthLabel(period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channelRateRows.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + sortedPeriods.length}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Geen afgeronde verkooptransacties in de geselecteerde maanden.
                  </td>
                </tr>
              )}
              {channelRateRows.map((row) => (
                <tr key={`${row.channel}|${row.vatRate}`} className="border-t align-top">
                  <td className="sticky left-0 bg-background px-3 py-2">
                    {channelLabels[row.channel] ?? row.channel}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.vatRate}%</td>
                  {sortedPeriods.map((period) => {
                    const value =
                      vatByPeriodChannelRate.get(
                        vatBreakdownKey(period, row.channel, row.vatRate),
                      ) ?? EMPTY_TOTALS;
                    return (
                      <td key={period} className="px-3 py-2 text-right tabular-nums">
                        <div className="font-medium">{formatEUR(value.net)} netto</div>
                        <div className="text-xs text-muted-foreground">
                          {formatEUR(value.vat)} btw · {formatEUR(value.gross)} bruto ·{" "}
                          {value.count}x
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kanaaltotalen — controle</CardTitle>
          <CardDescription>
            Per maand: som van de tarief-regels / kanaaltotaal en het verschil.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="sticky left-0 min-w-44 bg-muted px-3 py-2 font-medium">Kanaal</th>
                {sortedPeriods.map((period) => (
                  <th key={period} className="min-w-48 px-3 py-2 text-right font-medium">
                    {monthLabel(period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((channel) => (
                <tr key={channel} className="border-t">
                  <td className="sticky left-0 bg-background px-3 py-2">
                    {channelLabels[channel]}
                  </td>
                  {sortedPeriods.map((period) => {
                    const tariffNet = totalsPerPeriodChannel.get(`${period}|${channel}`)?.net ?? 0;
                    const channelNet = Number(
                      channelByPeriod.get(`${period}|${channel}`)?.net_total ?? 0,
                    );
                    const difference = +(tariffNet - channelNet).toFixed(2);
                    return (
                      <td key={period} className="px-3 py-2 text-right tabular-nums">
                        <div>
                          {formatEUR(tariffNet)} / {formatEUR(channelNet)}
                        </div>
                        <div
                          className={`text-xs ${
                            Math.abs(difference) > 0.01
                              ? "font-medium text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          Verschil {formatEUR(difference)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCsvNumber(value: number | string) {
  return Number(value).toFixed(2).replace(".", ",");
}
