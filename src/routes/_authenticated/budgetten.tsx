import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiPeriodPicker } from "@/components/multi-period-picker";
import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { formatEUR, channelLabels, currentMonth, monthLabel } from "@/lib/format";
import { Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budgetten")({
  head: () => ({ meta: [{ title: "Omzet monitoring - Daily Flowers" }] }),
  component: BudgetsPage,
});

const CHANNELS = [
  "wefact_facturen",
  "mollie_facturen",
  "shopify_webshop",
  "shopify_winkel",
  "bold_afs",
] as const;

type BudgetRow = {
  id: string;
  channel: string;
  machine_id: string | null;
  period: string;
  amount: number;
  machines?: { display_name: string | null; afs_number: string | null } | null;
};

type ActualRow = {
  period: string;
  channel: string;
  machine_id?: string | null;
  display_name?: string | null;
  afs_number?: string | null;
  gross_total: number;
  net_total?: number;
  vat_total?: number;
  tx_count?: number;
};

type Machine = {
  id: string;
  afs_number: string;
  machine_id: string | null;
  display_name: string;
  active: boolean;
};

type PeriodMetric = {
  actual: number;
  budget: number;
  lyActual: number;
};

type AnalysisRow = {
  key: string;
  channel: string;
  machineId: string | null;
  afsNumber: string | null;
  label: string;
  level: 0 | 1;
  periodValues: Record<string, PeriodMetric>;
  actual: number;
  budget: number;
  lyActual: number;
};

type ViewMode = "month" | "range" | "year" | "multiYear";
type DetailLevel = "channel" | "both" | "machine";
type MetricColumn = "actual" | "budget" | "variance" | "ly" | "vsLy";

const METRIC_COLUMNS: Array<{ value: MetricColumn; label: string }> = [
  { value: "actual", label: "Actuals" },
  { value: "budget", label: "Budget" },
  { value: "ly", label: "LY" },
  { value: "variance", label: "Variance act<>bud" },
  { value: "vsLy", label: "Variance act<>LY" },
];

function BudgetsPage() {
  const qc = useQueryClient();
  const thisMonth = currentMonth();
  const thisYear = String(new Date().getFullYear());
  const thisMonthNumber = thisMonth.split("-")[1];
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonthNumber);
  const [fromMonth, setFromMonth] = useState("01");
  const [toMonth, setToMonth] = useState(thisMonthNumber);
  const [selectedYears, setSelectedYears] = useState<string[]>([thisYear]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("both");
  const [visibleColumns, setVisibleColumns] = useState<MetricColumn[]>([
    "actual",
    "budget",
    "variance",
  ]);

  const selectedPeriods = useMemo(() => {
    if (viewMode === "month") return [composePeriod(year, month)];
    if (viewMode === "year") return yearPeriods(year);
    if (viewMode === "multiYear") return multiYearPeriods(selectedYears, selectedMonths);
    return periodsBetween(composePeriod(year, fromMonth), composePeriod(year, toMonth));
  }, [fromMonth, month, selectedMonths, selectedYears, toMonth, viewMode, year]);
  const lyPeriods = useMemo(() => selectedPeriods.map(previousYearPeriod), [selectedPeriods]);
  const needsLy = visibleColumns.includes("ly") || visibleColumns.includes("vsLy");

  const machinesQ = useQuery({
    queryKey: ["machines-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id,afs_number,machine_id,display_name,active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Machine[];
    },
  });

  const budgetsQ = useQuery({
    queryKey: ["budgets-analysis", selectedPeriods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, channel, machine_id, period, amount, machines(display_name, afs_number)")
        .in("period", selectedPeriods);
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
    enabled: selectedPeriods.length > 0,
  });

  const channelActualsQ = useQuery({
    queryKey: ["vw_monthly_revenue_actuals", selectedPeriods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_revenue_actuals" as never)
        .select("period,channel,tx_count,gross_total,net_total,vat_total")
        .in("period", selectedPeriods);
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
    enabled: selectedPeriods.length > 0,
  });

  const machineActualsQ = useQuery({
    queryKey: ["vw_monthly_machine", selectedPeriods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_machine" as never)
        .select(
          "period,channel,machine_id,display_name,afs_number,tx_count,gross_total,net_total,vat_total",
        )
        .in("period", selectedPeriods);
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
    enabled: selectedPeriods.length > 0,
  });

  const lyChannelActualsQ = useQuery({
    queryKey: ["vw_monthly_revenue_actuals-ly", lyPeriods, needsLy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_revenue_actuals" as never)
        .select("period,channel,tx_count,gross_total,net_total,vat_total")
        .in("period", lyPeriods);
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
    enabled: needsLy && lyPeriods.length > 0,
  });

  const lyMachineActualsQ = useQuery({
    queryKey: ["vw_monthly_machine-ly", lyPeriods, needsLy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_machine" as never)
        .select(
          "period,channel,machine_id,display_name,afs_number,tx_count,gross_total,net_total,vat_total",
        )
        .in("period", lyPeriods);
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
    enabled: needsLy && lyPeriods.length > 0,
  });

  const rows = useMemo(
    () =>
      buildAnalysisRows({
        periods: selectedPeriods,
        budgets: budgetsQ.data ?? [],
        channelActuals: channelActualsQ.data ?? [],
        machineActuals: machineActualsQ.data ?? [],
        lyChannelActuals: lyChannelActualsQ.data ?? [],
        lyMachineActuals: lyMachineActualsQ.data ?? [],
        detailLevel,
      }),
    [
      budgetsQ.data,
      channelActualsQ.data,
      detailLevel,
      lyChannelActualsQ.data,
      lyMachineActualsQ.data,
      machineActualsQ.data,
      selectedPeriods,
    ],
  );

  const totalRow = useMemo(
    () =>
      buildTotalRevenueRow({
        periods: selectedPeriods,
        budgets: budgetsQ.data ?? [],
        channelActuals: channelActualsQ.data ?? [],
        lyChannelActuals: lyChannelActualsQ.data ?? [],
      }),
    [budgetsQ.data, channelActualsQ.data, lyChannelActualsQ.data, selectedPeriods],
  );

  const periodColumns = visibleColumns;
  const totalColumns = visibleColumns;
  const tableColSpan = 3 + selectedPeriods.length * periodColumns.length + totalColumns.length;
  const totalLabel = aggregateLabel(viewMode, selectedPeriods);

  function toggleColumn(column: MetricColumn) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== column);
      }
      return orderMetricColumns([...current, column]);
    });
  }

  async function onExcelUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseBudgetWorkbook(file, machinesQ.data ?? []);
      if (rows.length === 0) {
        toast.error("Geen geldige budgetregels gevonden");
        return;
      }

      for (const row of rows) {
        let del = supabase
          .from("budgets")
          .delete()
          .eq("channel", row.channel)
          .eq("period", row.period);
        del = row.machine_id ? del.eq("machine_id", row.machine_id) : del.is("machine_id", null);
        const deleteResult = await del;
        if (deleteResult.error) throw deleteResult.error;

        const { error } = await supabase.from("budgets").insert(row);
        if (error) throw error;
      }

      toast.success(`${rows.length} budgetregels geimporteerd`);
      qc.invalidateQueries({ queryKey: ["budgets-analysis"] });
      event.target.value = "";
    } catch (error) {
      toast.error("Excel import mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const activeMachines = (machinesQ.data ?? []).filter((machine) => machine.active);
    const periods = futurePeriods(currentMonth(), 12);
    const budgetRows: Array<Record<string, string | number>> = [];

    for (const p of periods) {
      for (const channel of CHANNELS) {
        budgetRows.push({
          channel,
          afs_number: "",
          machine_name: "",
          period: p,
          amount: "",
        });
      }
      for (const machine of activeMachines) {
        budgetRows.push({
          channel: "bold_afs",
          afs_number: machine.afs_number,
          machine_name: machine.display_name,
          period: p,
          amount: "",
        });
      }
    }

    const workbook = XLSX.utils.book_new();
    const budgetSheet = XLSX.utils.json_to_sheet(budgetRows, {
      header: ["channel", "afs_number", "machine_name", "period", "amount"],
    });
    budgetSheet["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, budgetSheet, "Budgetten");

    const channelSheet = XLSX.utils.json_to_sheet(
      CHANNELS.map((channel) => ({ channel, label: channelLabels[channel] ?? channel })),
    );
    channelSheet["!cols"] = [{ wch: 22 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, channelSheet, "Kanalen");

    const machineSheet = XLSX.utils.json_to_sheet(
      activeMachines.map((machine) => ({
        afs_number: machine.afs_number,
        machine_id: machine.machine_id ?? "",
        machine_name: machine.display_name,
      })),
    );
    machineSheet["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(workbook, machineSheet, "Machines");

    XLSX.writeFile(workbook, `budget-template-${currentMonth()}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Omzet monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Voer omzetbudgetten ex btw in en vergelijk actuals, budget, delta en LY per maand, YTD
            of jaar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Template downloaden
          </Button>
          <Button variant="outline" asChild>
            <label>
              <Upload className="h-4 w-4 mr-2" />
              Excel uploaden
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onExcelUpload}
              />
            </label>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 items-end">
            <div>
              <label className="text-xs text-muted-foreground">View</label>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Maand</SelectItem>
                  <SelectItem value="range">YTD / periode</SelectItem>
                  <SelectItem value="year">Jaar</SelectItem>
                  <SelectItem value="multiYear">Meerdere jaren</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {viewMode !== "multiYear" && (
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
            )}

            {viewMode === "month" && (
              <div>
                <label className="text-xs text-muted-foreground">Periode</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {viewMode === "range" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">Vanaf</label>
                  <Select value={fromMonth} onValueChange={setFromMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">T/m</label>
                  <Select value={toMonth} onValueChange={setToMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-muted-foreground">Detailniveau</label>
              <Select
                value={detailLevel}
                onValueChange={(value) => setDetailLevel(value as DetailLevel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Kanalen + AFS</SelectItem>
                  <SelectItem value="channel">Alleen kanalen</SelectItem>
                  <SelectItem value="machine">Alleen AFS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ColumnToggles columns={visibleColumns} onToggle={toggleColumn} />

            {viewMode === "multiYear" && (
              <MultiPeriodPicker
                years={yearOptions()}
                months={monthOptions()}
                selectedYears={selectedYears}
                selectedMonths={selectedMonths}
                onYearsChange={setSelectedYears}
                onMonthsChange={setSelectedMonths}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectionTitle(viewMode, selectedPeriods, year)}
          </CardTitle>
          <CardDescription>
            Omzetbudgetten zijn ex btw. Regels met <code>afs_number</code> rollen onder Bold/AFS in
            als AFS-regel.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Type
                  </th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Kanaal
                  </th>
                  <th className="px-3 py-2 font-medium min-w-[240px]" rowSpan={2}>
                    Naam
                  </th>
                  {selectedPeriods.map((p) => (
                    <th
                      key={p}
                      className="px-3 py-2 font-medium text-center border-l"
                      colSpan={periodColumns.length}
                    >
                      {shortMonthLabel(p)}
                    </th>
                  ))}
                  <th
                    className="px-3 py-2 font-medium text-center border-l"
                    colSpan={totalColumns.length}
                  >
                    {totalLabel}
                  </th>
                </tr>
                <tr className="text-left">
                  {selectedPeriods.map((p) =>
                    periodColumns.map((column) => (
                      <th
                        key={`${p}-${column}`}
                        className="px-3 py-2 font-medium text-right first:border-l"
                      >
                        {metricLabel(column)}
                      </th>
                    )),
                  )}
                  {totalColumns.map((column) => (
                    <th
                      key={`total-${column}`}
                      className="px-3 py-2 font-medium text-right first:border-l"
                    >
                      {totalMetricLabel(column, totalLabel)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !hasAnyValue(totalRow) && (
                  <tr>
                    <td
                      colSpan={tableColSpan}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      Geen actuals of budgetten voor deze selectie.
                    </td>
                  </tr>
                )}
                {(rows.length > 0 || hasAnyValue(totalRow)) && (
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-3 py-2">
                      <Badge variant="default">Totaal</Badge>
                    </td>
                    <td className="px-3 py-2">Alle kanalen</td>
                    <td className="px-3 py-2 font-semibold">Totale omzet</td>
                    {selectedPeriods.map((p) =>
                      periodColumns.map((column) => (
                        <MetricCell
                          key={`${totalRow.key}-${p}-${column}`}
                          value={metricValue(totalRow.periodValues[p], column)}
                          column={column}
                          strong
                        />
                      )),
                    )}
                    {totalColumns.map((column) => (
                      <MetricCell
                        key={`${totalRow.key}-total-${column}`}
                        value={totalMetricValue(totalRow, column)}
                        column={column}
                        strong
                      />
                    ))}
                  </tr>
                )}
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      row.level === 0
                        ? "border-t hover:bg-muted/30"
                        : "border-t bg-muted/10 hover:bg-muted/30"
                    }
                  >
                    <td className="px-3 py-2">
                      <Badge variant={row.level === 0 ? "outline" : "secondary"}>
                        {row.level === 0 ? "Kanaal" : "AFS"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{channelLabels[row.channel] ?? row.channel}</td>
                    <td className={row.level === 0 ? "px-3 py-2 font-medium" : "px-3 py-2 pl-8"}>
                      <div>{row.label}</div>
                      {row.afsNumber && (
                        <div className="text-xs text-muted-foreground tabular-nums">
                          AFS {row.afsNumber}
                        </div>
                      )}
                    </td>
                    {selectedPeriods.map((p) =>
                      periodColumns.map((column) => (
                        <MetricCell
                          key={`${row.key}-${p}-${column}`}
                          value={metricValue(row.periodValues[p], column)}
                          column={column}
                        />
                      )),
                    )}
                    {totalColumns.map((column) => (
                      <MetricCell
                        key={`${row.key}-total-${column}`}
                        value={totalMetricValue(row, column)}
                        column={column}
                        strong
                      />
                    ))}
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

function ColumnToggles({
  columns,
  onToggle,
}: {
  columns: MetricColumn[];
  onToggle: (column: MetricColumn) => void;
}) {
  return (
    <div className="md:col-span-2 xl:col-span-2">
      <div className="mb-2 text-xs text-muted-foreground">Kolommen</div>
      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {METRIC_COLUMNS.map((option) => {
          const checked = columns.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex min-h-8 items-center gap-2 rounded border bg-muted/20 px-2 text-sm"
            >
              <Checkbox
                checked={checked}
                disabled={checked && columns.length === 1}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function MetricCell({
  value,
  column,
  strong = false,
}: {
  value: number;
  column: MetricColumn;
  strong?: boolean;
}) {
  const isDelta = column === "variance" || column === "vsLy";
  const base = `px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""}`;
  const className = isDelta ? moneyDeltaClass(value, strong) : base;
  return <td className={className}>{formatEUR(value)}</td>;
}

function buildTotalRevenueRow({
  periods,
  budgets,
  channelActuals,
  lyChannelActuals,
}: {
  periods: string[];
  budgets: BudgetRow[];
  channelActuals: ActualRow[];
  lyChannelActuals: ActualRow[];
}): AnalysisRow {
  const row: AnalysisRow = {
    key: "__total_revenue",
    channel: "__total",
    machineId: null,
    afsNumber: null,
    label: "Totale omzet",
    level: 0,
    periodValues: Object.fromEntries(
      periods.map((period) => [period, { actual: 0, budget: 0, lyActual: 0 }]),
    ),
    actual: 0,
    budget: 0,
    lyActual: 0,
  };
  const explicitChannelBudgetPeriods = new Set<string>();
  const machineBudgetByChannelPeriod = new Map<string, number>();

  for (const budget of budgets) {
    const amount = Number(budget.amount ?? 0);
    if (!budget.machine_id) {
      explicitChannelBudgetPeriods.add(`${budget.channel}|${budget.period}`);
      if (row.periodValues[budget.period]) row.periodValues[budget.period].budget += amount;
      continue;
    }

    const key = `${budget.channel}|${budget.period}`;
    machineBudgetByChannelPeriod.set(key, (machineBudgetByChannelPeriod.get(key) ?? 0) + amount);
  }

  for (const [key, amount] of machineBudgetByChannelPeriod.entries()) {
    const [channel, period] = key.split("|");
    if (channel !== "bold_afs") continue;
    if (explicitChannelBudgetPeriods.has(key)) continue;
    if (row.periodValues[period]) row.periodValues[period].budget += amount;
  }

  for (const actual of channelActuals) {
    if (row.periodValues[actual.period]) {
      row.periodValues[actual.period].actual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
  }

  for (const actual of lyChannelActuals) {
    const period = previousYearToCurrentPeriod(actual.period);
    if (row.periodValues[period]) {
      row.periodValues[period].lyActual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
  }

  for (const period of periods) {
    const values = row.periodValues[period] ?? { actual: 0, budget: 0, lyActual: 0 };
    row.actual += values.actual;
    row.budget += values.budget;
    row.lyActual += values.lyActual;
  }

  return row;
}

function buildAnalysisRows({
  periods,
  budgets,
  channelActuals,
  machineActuals,
  lyChannelActuals,
  lyMachineActuals,
  detailLevel,
}: {
  periods: string[];
  budgets: BudgetRow[];
  channelActuals: ActualRow[];
  machineActuals: ActualRow[];
  lyChannelActuals: ActualRow[];
  lyMachineActuals: ActualRow[];
  detailLevel: DetailLevel;
}) {
  const rows = new Map<string, AnalysisRow>();
  const machineBudgetByChannelPeriod = new Map<string, number>();
  const explicitChannelBudgetPeriods = new Set<string>();
  const showChannel = detailLevel === "channel" || detailLevel === "both";
  const showMachine = detailLevel === "machine" || detailLevel === "both";

  const ensure = (
    channel: string,
    machineId: string | null,
    label: string,
    afsNumber: string | null = null,
  ) => {
    const key = `${channel}|${machineId ?? "channel"}`;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        channel,
        machineId,
        afsNumber,
        label,
        level: machineId ? 1 : 0,
        periodValues: Object.fromEntries(
          periods.map((p) => [p, { actual: 0, budget: 0, lyActual: 0 }]),
        ),
        actual: 0,
        budget: 0,
        lyActual: 0,
      });
    }
    return rows.get(key)!;
  };

  if (showChannel) {
    for (const channel of CHANNELS) {
      ensure(channel, null, channel === "bold_afs" ? "Totaal Bold/AFS" : "Totaal kanaal");
    }
  }

  for (const budget of budgets) {
    const amount = Number(budget.amount ?? 0);
    if (!budget.machine_id) {
      explicitChannelBudgetPeriods.add(`${budget.channel}|${budget.period}`);
      if (showChannel) {
        ensure(
          budget.channel,
          null,
          budget.channel === "bold_afs" ? "Totaal Bold/AFS" : "Totaal kanaal",
        ).periodValues[budget.period].budget += amount;
      }
      continue;
    }

    const machineBudgetKey = `${budget.channel}|${budget.period}`;
    machineBudgetByChannelPeriod.set(
      machineBudgetKey,
      (machineBudgetByChannelPeriod.get(machineBudgetKey) ?? 0) + amount,
    );

    if (showMachine) {
      const label = budget.machines?.display_name || "Onbekende AFS";
      ensure(
        budget.channel,
        budget.machine_id,
        label,
        budget.machines?.afs_number ?? null,
      ).periodValues[budget.period].budget += amount;
    }
  }

  if (showChannel) {
    for (const [key, amount] of machineBudgetByChannelPeriod.entries()) {
      const [channel, period] = key.split("|");
      if (channel !== "bold_afs") continue;
      if (explicitChannelBudgetPeriods.has(key)) continue;
      ensure(channel, null, "Totaal Bold/AFS").periodValues[period].budget += amount;
    }

    for (const actual of channelActuals) {
      ensure(
        actual.channel,
        null,
        actual.channel === "bold_afs" ? "Totaal Bold/AFS" : "Totaal kanaal",
      ).periodValues[actual.period].actual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
    for (const actual of lyChannelActuals) {
      const period = previousYearToCurrentPeriod(actual.period);
      ensure(
        actual.channel,
        null,
        actual.channel === "bold_afs" ? "Totaal Bold/AFS" : "Totaal kanaal",
      ).periodValues[period].lyActual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
  }

  if (showMachine) {
    for (const actual of machineActuals) {
      if (!actual.machine_id) continue;
      ensure(
        actual.channel,
        actual.machine_id,
        actual.display_name || "Onbekende AFS",
        actual.afs_number ?? null,
      ).periodValues[actual.period].actual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
    for (const actual of lyMachineActuals) {
      if (!actual.machine_id) continue;
      const period = previousYearToCurrentPeriod(actual.period);
      ensure(
        actual.channel,
        actual.machine_id,
        actual.display_name || "Onbekende AFS",
        actual.afs_number ?? null,
      ).periodValues[period].lyActual += Number(actual.net_total ?? actual.gross_total ?? 0);
    }
  }

  for (const row of rows.values()) {
    for (const period of periods) {
      const values = row.periodValues[period] ?? { actual: 0, budget: 0, lyActual: 0 };
      row.actual += values.actual;
      row.budget += values.budget;
      row.lyActual += values.lyActual;
    }
  }

  return [...rows.values()]
    .filter((row) => row.level === 0 || hasAnyValue(row))
    .sort((a, b) => {
      const channelSort = channelIndex(a.channel) - channelIndex(b.channel);
      if (channelSort !== 0) return channelSort;
      if (a.level !== b.level) return a.level - b.level;
      return a.label.localeCompare(b.label);
    });
}

async function parseBudgetWorkbook(file: File, machines: Machine[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets.Budgetten ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Geen werkblad gevonden");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const machineByAfs = new Map(
    machines.map((machine) => [machine.afs_number.toLowerCase(), machine]),
  );
  const machineByMachineId = new Map(
    machines
      .filter((machine) => machine.machine_id)
      .map((machine) => [String(machine.machine_id).toLowerCase(), machine]),
  );
  const rows: Array<{
    channel: string;
    machine_id: string | null;
    period: string;
    amount: number;
  }> = [];

  for (const [index, rawRow] of rawRows.entries()) {
    const row = normalizeKeys(rawRow);
    const channel = String(pick(row, ["channel", "kanaal"]) ?? "").trim();
    const afs = String(pick(row, ["afs_number", "afs", "afs_nummer"]) ?? "").trim();
    const machineCode = String(pick(row, ["machine_id", "machineid"]) ?? "").trim();
    const period = String(pick(row, ["period", "periode", "maand"]) ?? "").trim();
    const rawAmount = pick(row, ["amount", "bedrag", "budget"]);

    if (!channel && !period && !rawAmount) continue;
    if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
      throw new Error(`Rij ${index + 2}: onbekend kanaal "${channel}"`);
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`Rij ${index + 2}: periode moet YYYY-MM zijn`);
    }
    if (rawAmount === "" || rawAmount === null || rawAmount === undefined) continue;

    const amount = parseAmount(rawAmount);
    if (!Number.isFinite(amount)) throw new Error(`Rij ${index + 2}: ongeldig bedrag`);

    let machine_id: string | null = null;
    if (afs || machineCode) {
      const machine =
        (afs ? machineByAfs.get(afs.toLowerCase()) : undefined) ??
        (machineCode ? machineByMachineId.get(machineCode.toLowerCase()) : undefined);
      if (!machine)
        throw new Error(`Rij ${index + 2}: machine niet gevonden (${afs || machineCode})`);
      machine_id = machine.id;
    }

    rows.push({ channel, machine_id, period, amount });
  }

  return rows;
}

function normalizeKeys(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.trim().toLowerCase().replace(/\s+/g, "_"),
      value,
    ]),
  );
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  let normalized = String(value ?? "").trim();
  if (!normalized) return Number.NaN;
  normalized = normalized.replace(/[\u20ac\s]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return Number(normalized);
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 2 - index));
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

function composePeriod(year: string, month: string) {
  return `${year}-${month}`;
}

function futurePeriods(startPeriod: string, count: number) {
  const [year, month] = startPeriod.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  const periods: string[] = [];
  for (let i = 0; i < count; i += 1) {
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return periods;
}

function periodsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, 1);
  const end = new Date(ty, tm - 1, 1);
  if (start > end) return periodsBetween(to, from);
  const periods: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return periods;
}

function yearPeriods(year: string) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function multiYearPeriods(years: string[], months: string[]) {
  const selectedYears = uniqueSorted(years);
  const selectedMonths =
    months.length > 0 ? uniqueSorted(months) : monthOptions().map((m) => m.value);
  return selectedYears.flatMap((year) => selectedMonths.map((month) => composePeriod(year, month)));
}

function previousYearPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${year - 1}-${String(month).padStart(2, "0")}`;
}

function previousYearToCurrentPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${year + 1}-${String(month).padStart(2, "0")}`;
}

function selectionTitle(viewMode: ViewMode, periods: string[], year: string) {
  if (viewMode === "year") return `Jaar ${year}`;
  if (viewMode === "multiYear") return `Meerdere jaren - ${multiPeriodLabel(periods)}`;
  if (periods.length === 1) return monthLabel(periods[0]);
  return `${monthLabel(periods[0])} t/m ${monthLabel(periods[periods.length - 1])}`;
}

function aggregateLabel(viewMode: ViewMode, periods: string[]) {
  if (viewMode === "year") return "Jaar totaal";
  if (viewMode === "multiYear") return "Selectie totaal";
  if (periods.length <= 1) return "Totaal";
  return periods[0]?.endsWith("-01") ? "YTD totaal" : "Periode totaal";
}

function multiPeriodLabel(periods: string[]) {
  const years = uniqueSorted(periods.map((period) => period.split("-")[0]));
  const months = uniqueSorted(periods.map((period) => period.split("-")[1]));
  const monthText =
    months.length === 12 ? "alle maanden" : months.map((month) => shortMonthName(month)).join(", ");
  return `${years.join(", ")} - ${monthText}`;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function shortMonthName(month: string) {
  return new Date(2026, Number(month) - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
  });
}

function metricLabel(column: MetricColumn) {
  switch (column) {
    case "actual":
      return "Actuals ex";
    case "budget":
      return "Budget ex";
    case "variance":
      return "Var act<>bud";
    case "ly":
      return "LY";
    case "vsLy":
      return "Var act<>LY";
  }
}

function totalMetricLabel(column: MetricColumn, totalLabel: string) {
  const suffix = totalLabel === "YTD totaal" ? " YTD" : totalLabel === "Jaar totaal" ? " jaar" : "";
  switch (column) {
    case "actual":
      return `Actuals ex${suffix}`;
    case "budget":
      return `Budget ex${suffix}`;
    case "variance":
      return `Var act<>bud${suffix}`;
    case "ly":
      return `LY${suffix}`;
    case "vsLy":
      return `Var act<>LY${suffix}`;
  }
}

function orderMetricColumns(columns: MetricColumn[]) {
  const order = new Map(METRIC_COLUMNS.map((column, index) => [column.value, index]));
  return [...columns].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function metricValue(metric: PeriodMetric | undefined, column: MetricColumn) {
  const values = metric ?? { actual: 0, budget: 0, lyActual: 0 };
  switch (column) {
    case "actual":
      return values.actual;
    case "budget":
      return values.budget;
    case "variance":
      return values.actual - values.budget;
    case "ly":
      return values.lyActual;
    case "vsLy":
      return values.actual - values.lyActual;
  }
}

function totalMetricValue(row: AnalysisRow, column: MetricColumn) {
  switch (column) {
    case "actual":
      return row.actual;
    case "budget":
      return row.budget;
    case "variance":
      return row.actual - row.budget;
    case "ly":
      return row.lyActual;
    case "vsLy":
      return row.actual - row.lyActual;
  }
}

function hasAnyValue(row: AnalysisRow) {
  return (
    Math.abs(row.actual) > 0.01 || Math.abs(row.budget) > 0.01 || Math.abs(row.lyActual) > 0.01
  );
}

function channelIndex(channel: string) {
  const index = CHANNELS.indexOf(channel as (typeof CHANNELS)[number]);
  return index === -1 ? 999 : index;
}

function shortMonthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
    year: "2-digit",
  });
}

function moneyDeltaClass(value: number, strong = false) {
  const base = `px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""}`;
  if (Math.abs(value) < 0.01) return `${base} text-muted-foreground`;
  return value >= 0
    ? `${base} text-emerald-700 font-medium`
    : `${base} text-destructive font-medium`;
}
