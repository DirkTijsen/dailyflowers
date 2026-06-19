import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiPeriodPicker } from "@/components/multi-period-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { channelLabels, currentMonth, formatEUR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/omzet-graph")({
  head: () => ({ meta: [{ title: "Omzet graph - Daily Flowers" }] }),
  component: RevenueGraphPage,
});

type ChannelActualRow = {
  period: string;
  channel: string;
  net_total: number | string | null;
  tx_count: number | null;
};

type MachineActualRow = {
  period: string;
  machine_id: string | null;
  display_name: string | null;
  afs_number: string | null;
  net_total: number | string | null;
  tx_count: number | null;
};

type MachineOption = {
  id: string;
  label: string;
  afsNumber: string | null;
  total: number;
  seriesKey: string;
};

type ChartPoint = {
  period: string;
  label: string;
  [key: string]: string | number;
};

const CHANNELS = [
  "shopify_webshop",
  "shopify_winkel",
  "bold_afs",
  "mollie_facturen",
  "wefact_facturen",
] as const;

const CHANNEL_COLORS: Record<string, string> = {
  shopify_webshop: "#2563eb",
  shopify_winkel: "#059669",
  bold_afs: "#dc2626",
  mollie_facturen: "#7c3aed",
  wefact_facturen: "#d97706",
};

const MACHINE_COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#d97706",
  "#0891b2",
  "#c026d3",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#be123c",
  "#ca8a04",
  "#0284c7",
  "#9333ea",
  "#16a34a",
  "#f97316",
];

const TARGET_MONTHLY_REVENUE = 2000;

function RevenueGraphPage() {
  const thisYear = currentMonth().split("-")[0];
  const [selectedYears, setSelectedYears] = useState<string[]>([thisYear]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [machineSearch, setMachineSearch] = useState("");
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([]);
  const periods = useMemo(
    () => multiYearPeriods(selectedYears, selectedMonths),
    [selectedMonths, selectedYears],
  );
  const includeYearInLabels = selectedYears.length > 1;

  const channelActualsQ = useQuery({
    queryKey: ["omzet-graph-channel-actuals", periods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_revenue_actuals" as never)
        .select("period,channel,tx_count,net_total")
        .in("period", periods);
      if (error) throw error;
      return (data ?? []) as ChannelActualRow[];
    },
  });

  const machineActualsQ = useQuery({
    queryKey: ["omzet-graph-machine-actuals", periods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_machine" as never)
        .select("period,machine_id,display_name,afs_number,tx_count,net_total")
        .in("period", periods);
      if (error) throw error;
      return (data ?? []) as MachineActualRow[];
    },
  });

  const channelData = useMemo(
    () => buildChannelData(periods, channelActualsQ.data ?? [], includeYearInLabels),
    [channelActualsQ.data, includeYearInLabels, periods],
  );
  const machineOptions = useMemo(
    () => buildMachineOptions(machineActualsQ.data ?? []),
    [machineActualsQ.data],
  );
  const displayedMachineOptions = useMemo(() => {
    if (selectedMachineIds.length === 0) return machineOptions;
    const selected = new Set(selectedMachineIds);
    return machineOptions.filter((machine) => selected.has(machine.id));
  }, [machineOptions, selectedMachineIds]);
  const machineData = useMemo(
    () =>
      buildMachineData(
        periods,
        machineActualsQ.data ?? [],
        displayedMachineOptions,
        includeYearInLabels,
      ),
    [displayedMachineOptions, includeYearInLabels, machineActualsQ.data, periods],
  );
  const filteredMachineOptions = useMemo(() => {
    const query = machineSearch.trim().toLowerCase();
    if (!query) return machineOptions;
    return machineOptions.filter(
      (machine) =>
        machine.label.toLowerCase().includes(query) ||
        (machine.afsNumber ?? "").toLowerCase().includes(query),
    );
  }, [machineOptions, machineSearch]);

  const selectedTotal = displayedMachineOptions.reduce((sum, machine) => sum + machine.total, 0);
  const selectionLabel =
    selectedMachineIds.length === 0
      ? `Alle AFS (${machineOptions.length})`
      : `${selectedMachineIds.length} AFS geselecteerd`;

  function toggleMachine(id: string) {
    setSelectedMachineIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Omzet graph</h1>
          <p className="text-sm text-muted-foreground">
            Maandomzet ex btw uit dezelfde actuals als Omzet monitoring.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3">
            <MultiPeriodPicker
              years={yearOptions()}
              months={monthOptions()}
              selectedYears={selectedYears}
              selectedMonths={selectedMonths}
              onYearsChange={setSelectedYears}
              onMonthsChange={setSelectedMonths}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hoofdstromen per maand</CardTitle>
          <CardDescription>
            Actuals ex btw per kanaal, inclusief dezelfde WeFact klantfactuurfiltering als dashboard
            en W&amp;V.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-[420px]">
            {channelActualsQ.isLoading ? (
              <LoadingState />
            ) : channelActualsQ.isError ? (
              <ErrorState error={channelActualsQ.error} />
            ) : (
              <RevenueLineChart
                data={channelData}
                series={CHANNELS.map((channel) => ({
                  key: channel,
                  label: channelLabels[channel],
                  color: CHANNEL_COLORS[channel],
                }))}
                showTarget={false}
              />
            )}
          </div>
          <Legend
            items={CHANNELS.map((channel) => ({
              key: channel,
              label: channelLabels[channel],
              color: CHANNEL_COLORS[channel],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">AFS per maand</CardTitle>
              <CardDescription>
                Elke lijn is een AFS-machine. De stippellijn markeert{" "}
                {formatEUR(TARGET_MONTHLY_REVENUE)} omzet ex btw per maand.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectionLabel}</Badge>
              <Badge variant="outline">Totaal selectie {formatEUR(selectedTotal)}</Badge>
              <MachinePicker
                machineOptions={machineOptions}
                filteredMachineOptions={filteredMachineOptions}
                selectedMachineIds={selectedMachineIds}
                search={machineSearch}
                onSearch={setMachineSearch}
                onToggle={toggleMachine}
                onAll={() => setSelectedMachineIds([])}
                onSetSelection={setSelectedMachineIds}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-[760px]">
            {machineActualsQ.isLoading ? (
              <LoadingState />
            ) : machineActualsQ.isError ? (
              <ErrorState error={machineActualsQ.error} />
            ) : displayedMachineOptions.length === 0 ? (
              <EmptyState />
            ) : (
              <RevenueLineChart
                data={machineData}
                series={displayedMachineOptions.map((machine, index) => ({
                  key: machine.seriesKey,
                  label: machine.label,
                  color: MACHINE_COLORS[index % MACHINE_COLORS.length],
                }))}
                showTarget
              />
            )}
          </div>
          <MachineLegend machines={displayedMachineOptions} />
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueLineChart({
  data,
  series,
  showTarget,
}: {
  data: ChartPoint[];
  series: Array<{ key: string; label: string; color: string }>;
  showTarget: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 28, left: 18, bottom: 18 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis
          width={88}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => compactEUR(Number(value))}
        />
        <Tooltip content={<RevenueTooltip series={series} />} />
        {showTarget && (
          <ReferenceLine
            y={TARGET_MONTHLY_REVENUE}
            stroke="#111827"
            strokeDasharray="6 6"
            strokeWidth={1.5}
            label={{ value: "€ 2.000", position: "insideTopRight", fill: "#111827", fontSize: 12 }}
          />
        )}
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RevenueTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string; color?: string }>;
  label?: string;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const labelByKey = new Map(series.map((item) => [item.key, item.label]));
  const rows = payload
    .filter((item) => Math.abs(Number(item.value ?? 0)) > 0.004)
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    .slice(0, 14);

  return (
    <div className="min-w-52 rounded-md border bg-background p-3 text-sm shadow-md">
      <div className="mb-2 font-medium">{label}</div>
      <div className="space-y-1">
        {rows.length === 0 ? (
          <div className="text-muted-foreground">Geen omzet</div>
        ) : (
          rows.map((item) => {
            const key = String(item.dataKey);
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{labelByKey.get(key) ?? key}</span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatEUR(Number(item.value ?? 0))}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MachinePicker({
  machineOptions,
  filteredMachineOptions,
  selectedMachineIds,
  search,
  onSearch,
  onToggle,
  onAll,
  onSetSelection,
}: {
  machineOptions: MachineOption[];
  filteredMachineOptions: MachineOption[];
  selectedMachineIds: string[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: (id: string) => void;
  onAll: () => void;
  onSetSelection: (ids: string[]) => void;
}) {
  const selected = new Set(selectedMachineIds);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">AFS filter</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              className="pl-8"
              placeholder="Zoek AFS of locatie"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onAll}>
              Alles tonen
            </Button>
          </div>
        </div>
        <ScrollArea className="h-80">
          <div className="p-2">
            {filteredMachineOptions.map((machine) => {
              const checked = selectedMachineIds.length === 0 || selected.has(machine.id);
              return (
                <label
                  key={machine.id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      if (selectedMachineIds.length === 0) {
                        onSetSelection(
                          machineOptions
                            .filter((option) => option.id !== machine.id)
                            .map((option) => option.id),
                        );
                        return;
                      }
                      onToggle(machine.id);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{machine.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {machine.afsNumber ?? "Geen AFS-code"} · {formatEUR(machine.total)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={(event) => {
                      event.preventDefault();
                      onSetSelection([machine.id]);
                    }}
                  >
                    Alleen
                  </Button>
                </label>
              );
            })}
            {filteredMachineOptions.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                Geen AFS gevonden.
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function Legend({ items }: { items: Array<{ key: string; label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function MachineLegend({ machines }: { machines: MachineOption[] }) {
  if (machines.length > 40) {
    return (
      <div className="text-sm text-muted-foreground">
        {machines.length} AFS-lijnen zichtbaar. Gebruik het filter om enkele machines met legenda te
        bekijken.
      </div>
    );
  }

  return (
    <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
      {machines.map((machine, index) => (
        <span key={machine.id} className="inline-flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: MACHINE_COLORS[index % MACHINE_COLORS.length] }}
          />
          <span className="truncate">
            {machine.label} · {formatEUR(machine.total)}
          </span>
        </span>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Grafiek laden...
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-destructive">
      Grafiek laden mislukt: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Geen AFS-omzet gevonden.
    </div>
  );
}

function buildChannelData(
  periods: string[],
  rows: ChannelActualRow[],
  includeYearInLabels: boolean,
): ChartPoint[] {
  const byPeriodChannel = new Map<string, number>();
  for (const row of rows) {
    if (!CHANNELS.includes(row.channel as (typeof CHANNELS)[number])) continue;
    byPeriodChannel.set(`${row.period}|${row.channel}`, Number(row.net_total ?? 0));
  }

  return periods.map((period) => {
    const point: ChartPoint = { period, label: shortMonthLabel(period, includeYearInLabels) };
    for (const channel of CHANNELS)
      point[channel] = byPeriodChannel.get(`${period}|${channel}`) ?? 0;
    return point;
  });
}

function buildMachineOptions(rows: MachineActualRow[]): MachineOption[] {
  const byMachine = new Map<string, MachineOption>();
  for (const row of rows) {
    if (!row.machine_id) continue;
    const existing = byMachine.get(row.machine_id);
    const label = row.display_name || row.afs_number || "Onbekende AFS";
    const total = Number(row.net_total ?? 0);
    if (existing) {
      existing.total += total;
      continue;
    }
    byMachine.set(row.machine_id, {
      id: row.machine_id,
      label,
      afsNumber: row.afs_number,
      total,
      seriesKey: machineSeriesKey(row.machine_id),
    });
  }

  return [...byMachine.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );
}

function buildMachineData(
  periods: string[],
  rows: MachineActualRow[],
  machines: MachineOption[],
  includeYearInLabels: boolean,
): ChartPoint[] {
  const selected = new Set(machines.map((machine) => machine.id));
  const keyById = new Map(machines.map((machine) => [machine.id, machine.seriesKey]));
  const values = new Map<string, number>();

  for (const row of rows) {
    if (!row.machine_id || !selected.has(row.machine_id)) continue;
    values.set(
      `${row.period}|${row.machine_id}`,
      (values.get(`${row.period}|${row.machine_id}`) ?? 0) + Number(row.net_total ?? 0),
    );
  }

  return periods.map((period) => {
    const point: ChartPoint = { period, label: shortMonthLabel(period, includeYearInLabels) };
    for (const machine of machines) {
      point[keyById.get(machine.id) ?? machine.seriesKey] =
        values.get(`${period}|${machine.id}`) ?? 0;
    }
    return point;
  });
}

function machineSeriesKey(id: string) {
  return `afs_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function multiYearPeriods(years: string[], months: string[]) {
  const selectedYears = uniqueSorted(years);
  const selectedMonths =
    months.length > 0 ? uniqueSorted(months) : monthOptions().map((m) => m.value);
  return selectedYears.flatMap((year) => selectedMonths.map((month) => `${year}-${month}`));
}

function yearOptions() {
  const current = Number(currentMonth().split("-")[0]);
  return Array.from({ length: 5 }, (_, index) => String(current - 2 + index));
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

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function shortMonthLabel(period: string, includeYear: boolean) {
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
    ...(includeYear ? { year: "2-digit" as const } : {}),
  });
}

function compactEUR(value: number) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000000) return `€ ${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `€ ${(value / 1000).toFixed(0)}K`;
  return `€ ${value.toFixed(0)}`;
}
