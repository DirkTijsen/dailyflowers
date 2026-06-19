import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, RefreshCw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { currentMonth, formatDateNL, formatDateTimeNL, formatEUR } from "@/lib/format";
import {
  CHANNELS,
  channelLabel,
  downloadTransactionTemplate,
  monthShortLabel,
  monthToQuarterKey,
  parseGlTransactionWorkbook,
  sectionIndex,
  sectionLabel,
  type GlAccount,
} from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/winst-verlies")({
  head: () => ({ meta: [{ title: "W&V - Daily Flowers" }] }),
  component: ProfitLossPage,
});

type GlPeriodRow = {
  period: string;
  quarter_key: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  pl_section: string;
  revenue_channel: string | null;
  sort_order: number;
  entry_count: number;
  amount: number;
};

type SalesPeriodRow = {
  period: string;
  channel: string;
  tx_count: number;
  net_total: number;
  gross_total: number;
  vat_total: number;
};

type PlBudgetLine = {
  period: string;
  section: string;
  line_key: string;
  line_label: string;
  kind: "revenue" | "cost";
  amount: number | string;
  source_workbook: string;
  source_sheet: string;
  source_label: string;
  sort_order: number;
};

type RevenueBudgetRow = {
  period: string;
  channel: string;
  machine_id: string | null;
  amount: number | string;
};

type ViewMode = "month" | "range" | "year";
type PlMetricColumn = "actual" | "budget" | "variance";

const PL_METRIC_COLUMNS: Array<{ value: PlMetricColumn; label: string }> = [
  { value: "actual", label: "Actueel" },
  { value: "budget", label: "Budget" },
  { value: "variance", label: "Verschil" },
];
const WEFACT_NON_CUSTOMER_CATEGORIES = new Set(["omzethuur", "facilitair", "energie"]);

type DetailBase = {
  source: "gl" | "sales";
  label: string;
  channel?: string;
  accountCodes?: string[];
  invertGlSign?: boolean;
};

type DetailSelection = DetailBase & {
  period: string;
  amount: number;
  title: string;
};

type PlRow = {
  key: string;
  label: string;
  section: string;
  level: 0 | 1;
  kind: "normal" | "subtotal" | "result";
  valueFormat?: "currency" | "percentage";
  values: Record<string, number>;
  ytd: number;
  budgetValues?: Record<string, number>;
  budgetYtd?: number;
  budgetOnly?: boolean;
  detailByPeriod?: Record<string, DetailBase>;
};

type GlDetailRow = {
  id: string;
  transaction_date: string | null;
  account_code: string | null;
  description: string | null;
  relation_name: string | null;
  document_number: string | null;
  amount: number | string | null;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  raw_payload: Record<string, unknown> | null;
};

type SalesDetailRow = {
  id: string;
  external_id: string | null;
  source: string | null;
  channel: string | null;
  article_number: string | null;
  product_name: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  vat_rate: number | string | null;
  invoice_number: string | null;
  status: string | null;
  paid_at: string | null;
  description_raw: string | null;
  parse_status: string | null;
  invoice_url?: string | null;
};

type ShopifyOrderDetailRow = {
  id: string;
  external_id: string;
  order_name: string | null;
  source_name: string | null;
  channel: string | null;
  financial_status: string | null;
  processed_at: string | null;
  current_total_price: number | string | null;
  current_total_tax: number | string | null;
  total_price: number | string | null;
  total_tax: number | string | null;
  line_tax_total?: number | string | null;
  total_shipping: number | string | null;
  total_refunded: number | string | null;
  raw_payload: Record<string, unknown> | null;
};

type MollieSalesInvoiceDetailRow = {
  id: string;
  sales_invoice_id: string;
  reference: string | null;
  status: string | null;
  issued_at: string | null;
  paid_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  invoice_url: string | null;
};

type WefactInvoiceDetailRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  status: string | null;
  customer_number: string | null;
  customer_name: string | null;
  reference: string | null;
  category: string | null;
  amount_gross: number | string | null;
  amount_net: number | string | null;
  vat_amount: number | string | null;
  source_filename: string | null;
};

type SupabaseError = { message: string };
type SupabaseResult<T> = { data: T[] | null; error: SupabaseError | null };
type SupabaseQuery<T> = PromiseLike<SupabaseResult<T>> & {
  select(columns: string): SupabaseQuery<T>;
  order(column: string, options?: Record<string, unknown>): SupabaseQuery<T>;
  in(column: string, values: unknown[]): SupabaseQuery<T>;
  gte(column: string, value: unknown): SupabaseQuery<T>;
  lt(column: string, value: unknown): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  limit(count: number): SupabaseQuery<T>;
  upsert(values: unknown, options?: Record<string, unknown>): PromiseLike<SupabaseResult<T>>;
};

const db = supabase as unknown as {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

function ProfitLossPage() {
  const qc = useQueryClient();
  const thisMonth = currentMonth();
  const thisYear = thisMonth.split("-")[0];
  const thisMonthNumber = thisMonth.split("-")[1];
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonthNumber);
  const [fromMonth, setFromMonth] = useState("01");
  const [toMonth, setToMonth] = useState(thisMonthNumber);
  const [visibleColumns, setVisibleColumns] = useState<PlMetricColumn[]>([
    "actual",
    "budget",
    "variance",
  ]);
  const [detail, setDetail] = useState<DetailSelection | null>(null);
  const [exactSyncing, setExactSyncing] = useState(false);
  const months = useMemo(() => {
    if (viewMode === "month") return [composePeriod(year, month)];
    if (viewMode === "year") return yearPeriods(year);
    return periodsBetween(composePeriod(year, fromMonth), composePeriod(year, toMonth));
  }, [fromMonth, month, toMonth, viewMode, year]);
  const periodColumns = visibleColumns;
  const totalColumns = visibleColumns;
  const totalLabel = aggregateLabel(viewMode, months);
  const tableColSpan = 2 + months.length * periodColumns.length + totalColumns.length;

  const accountsQ = useQuery({
    queryKey: ["gl-accounts"],
    queryFn: async () => {
      const { data, error } = await db
        .from<GlAccount>("gl_accounts")
        .select("*")
        .order("sort_order")
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as GlAccount[];
    },
  });

  const glQ = useQuery({
    queryKey: ["wv-gl-monthly", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<GlPeriodRow>("vw_gl_monthly_account")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as GlPeriodRow[];
    },
    enabled: months.length > 0,
  });

  const salesQ = useQuery({
    queryKey: ["wv-sales-monthly", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<SalesPeriodRow>("vw_monthly_revenue_actuals")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as SalesPeriodRow[];
    },
    enabled: months.length > 0,
  });

  const budgetsQ = useQuery({
    queryKey: ["wv-pl-budget-lines", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<PlBudgetLine>("pl_budget_lines")
        .select(
          "period,section,line_key,line_label,kind,amount,source_workbook,source_sheet,source_label,sort_order",
        )
        .in("period", months)
        .order("sort_order")
        .order("line_label");
      if (error) throw error;
      return (data ?? []) as PlBudgetLine[];
    },
    enabled: months.length > 0,
  });

  const revenueBudgetsQ = useQuery({
    queryKey: ["wv-revenue-budgets", months],
    queryFn: async () => {
      const { data, error } = await db
        .from<RevenueBudgetRow>("budgets")
        .select("period,channel,machine_id,amount")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as RevenueBudgetRow[];
    },
    enabled: months.length > 0,
  });

  const { rows } = useMemo(
    () =>
      buildProfitLoss({
        months,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        budgetLines: budgetsQ.data ?? [],
        revenueBudgets: revenueBudgetsQ.data ?? [],
        accounts: accountsQ.data ?? [],
      }),
    [
      accountsQ.data,
      budgetsQ.data,
      glQ.data,
      months,
      revenueBudgetsQ.data,
      salesQ.data,
    ],
  );

  function toggleColumn(column: PlMetricColumn) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== column);
      }
      return orderPlMetricColumns([...current, column]);
    });
  }

  function openDetail(row: PlRow, period: string) {
    const base = row.detailByPeriod?.[period];
    const amount = row.values[period] ?? 0;
    if (!base || Math.abs(amount) < 0.005) return;
    setDetail({
      ...base,
      period,
      amount,
      title: `${row.label} - ${monthLabel(period)}`,
    });
  }

  async function uploadTransactions(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const accounts = accountsQ.data ?? [];
      if (accounts.length === 0) throw new Error("Importeer eerst het grootboekschema");
      const importBatchId = `${new Date().toISOString()}-${file.name}`;
      const rows = await parseGlTransactionWorkbook(file, accounts, importBatchId);
      if (rows.length === 0) {
        toast.error("Geen grootboektransacties gevonden");
        return;
      }

      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await db
          .from("gl_transactions")
          .upsert(rows.slice(i, i + chunk), { onConflict: "source,external_id" });
        if (error) throw error;
      }

      toast.success(`${rows.length} grootboektransacties geimporteerd`);
      qc.invalidateQueries({ queryKey: ["wv-gl-monthly"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-quarterly"] });
    } catch (error) {
      toast.error("W&V-transacties importeren mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      event.target.value = "";
    }
  }

  async function syncExact() {
    setExactSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("exact-sync");
      if (error) throw error;
      if ((data as { status?: string } | null)?.status === "already_running") {
        toast.message("Exact sync draait al", {
          description: (data as { message?: string } | null)?.message,
        });
      } else {
        toast.success("Exact sync gestart", {
          description: "De grootboekregels worden op de achtergrond opgehaald.",
        });
      }
      qc.invalidateQueries({ queryKey: ["sync_state"] });
      qc.invalidateQueries({ queryKey: ["gl-accounts"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-monthly"] });
      qc.invalidateQueries({ queryKey: ["wv-gl-revenue-source-monthly"] });
    } catch (error) {
      toast.error("Exact sync starten mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExactSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">W&V</h1>
          <p className="text-sm text-muted-foreground">
            Maandrapportage met omzet uit eigen verkoopdata, omzetbudget uit omzet monitoring en
            kosten uit het grootboek.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={syncExact} disabled={exactSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${exactSyncing ? "animate-spin" : ""}`} />
            Exact sync
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadTransactionTemplate(accountsQ.data ?? [])}
          >
            <Download className="mr-2 h-4 w-4" />
            Transactie-template
          </Button>
          <Button variant="outline" asChild>
            <label>
              <Upload className="mr-2 h-4 w-4" />
              W&V-transacties uploaden
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={uploadTransactions}
              />
            </label>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 items-end">
            <Field label="View">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Maand</SelectItem>
                  <SelectItem value="range">YTD / periode</SelectItem>
                  <SelectItem value="year">Jaar</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Jaar">
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
            </Field>

            {viewMode === "month" && (
              <Field label="Periode">
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
              </Field>
            )}

            {viewMode === "range" && (
              <>
                <Field label="Vanaf">
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
                </Field>
                <Field label="T/m">
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
                </Field>
              </>
            )}

            <PlColumnToggles columns={visibleColumns} onToggle={toggleColumn} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{selectionTitle(viewMode, months, year)}</CardTitle>
          <CardDescription>
            Actuals naast omzetbudgetten en W&V-kostenbudgetten. Klik op een actual om de
            onderliggende grootboekregels of verkooptransacties te zien.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1680px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Rubriek
                  </th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Regel
                  </th>
                  {months.map((period) => (
                    <th
                      key={period}
                      className="border-l px-3 py-2 text-center font-medium"
                      colSpan={periodColumns.length}
                    >
                      <span className="block">{monthShortLabel(period)}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {monthToQuarterKey(period).replace(`${year}-`, "")}
                      </span>
                    </th>
                  ))}
                  <th
                    className="border-l px-3 py-2 text-center font-medium"
                    colSpan={totalColumns.length}
                  >
                    {totalLabel}
                  </th>
                </tr>
                <tr>
                  {months.map((period) => (
                    <BudgetHeaderCells key={`${period}-headers`} columns={periodColumns} />
                  ))}
                  <BudgetHeaderCells columns={totalColumns} totalLabel={totalLabel} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      row.kind === "subtotal" || row.kind === "result"
                        ? "border-t bg-muted/20"
                        : "border-t hover:bg-muted/30"
                    }
                  >
                    <td className="px-3 py-2">
                      {row.level === 0 ? (
                        <Badge variant="outline">{sectionLabel(row.section)}</Badge>
                      ) : null}
                    </td>
                    <td className={row.level === 0 ? "px-3 py-2 font-semibold" : "px-3 py-2 pl-8"}>
                      {row.label}
                    </td>
                    {months.map((period) => {
                      const value = row.values[period] ?? 0;
                      const budget = row.budgetValues?.[period];
                      const canOpen =
                        Boolean(row.detailByPeriod?.[period]) && Math.abs(value) >= 0.005;
                      return (
                        <BudgetAmountCells
                          key={`${row.key}-${period}`}
                          columns={periodColumns}
                          value={value}
                          budget={budget}
                          budgetOnly={row.budgetOnly}
                          valueFormat={row.valueFormat}
                          strong={row.kind !== "normal"}
                          onClick={canOpen ? () => openDetail(row, period) : undefined}
                        />
                      );
                    })}
                    <BudgetAmountCells
                      columns={totalColumns}
                      value={row.ytd}
                      budget={row.budgetYtd}
                      budgetOnly={row.budgetOnly}
                      valueFormat={row.valueFormat}
                      strong
                    />
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={tableColSpan}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Geen W&V-data voor deze selectie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TransactionDetailDialog detail={detail} onOpenChange={(open) => !open && setDetail(null)} />
    </div>
  );
}

function buildProfitLoss({
  months,
  glRows,
  salesRows,
  budgetLines,
  revenueBudgets,
  accounts,
}: {
  months: string[];
  glRows: GlPeriodRow[];
  salesRows: SalesPeriodRow[];
  budgetLines: PlBudgetLine[];
  revenueBudgets: RevenueBudgetRow[];
  accounts: GlAccount[];
}) {
  const accountsByCode = new Map(accounts.map((account) => [account.account_code, account]));
  const ownRevenue = new Map<string, number>();
  const rows: PlRow[] = [];
  const revenueBudgetByChannel = revenueBudgetValuesByChannel(revenueBudgets, budgetLines, months);
  const budgetBySection = budgetLinesBySection(budgetLines, months);
  const budgetRowsBySection = budgetOnlyRowsBySection(budgetLines, months);

  for (const row of salesRows) {
    add(ownRevenue, `${row.period}|${row.channel}`, Number(row.net_total ?? 0));
  }

  const revenueTotal = blankValues(months);
  const revenueBudgetTotal = blankValues(months);
  const revenueTotalDetails: Record<string, DetailBase> = {};
  for (const channel of CHANNELS) {
    const values = blankValues(months);
    const budgetValues = revenueBudgetByChannel.get(channel) ?? blankValues(months);
    const detailByPeriod: Record<string, DetailBase> = {};
    for (const period of months) {
      const own = ownRevenue.get(`${period}|${channel}`) ?? 0;
      values[period] = own;
      revenueTotal[period] += values[period];
      revenueBudgetTotal[period] += budgetValues[period] ?? 0;
      detailByPeriod[period] = {
        source: "sales",
        label: `${channelLabel(channel)} verkooptransacties`,
        channel,
      };
    }
    rows.push(
      makeRow(
        `revenue-${channel}`,
        channelLabel(channel),
        "revenue",
        1,
        "normal",
        values,
        months,
        detailByPeriod,
        undefined,
        undefined,
        budgetValues,
      ),
    );
  }

  for (const period of months) {
    revenueTotalDetails[period] = {
      source: "sales",
      label: "Omzet totaal verkooptransacties",
    };
  }

  rows.push(
    makeRow(
      "revenue-total",
      "Omzet totaal",
      "revenue",
      0,
      "subtotal",
      revenueTotal,
      months,
      revenueTotalDetails,
      undefined,
      undefined,
      revenueBudgetTotal,
    ),
  );

  const costTotal = blankValues(months);
  const costBudgetTotal = blankValues(months);
  const revenueYtd = sumValues(revenueTotal, months);
  const revenueBudgetYtd = sumValues(revenueBudgetTotal, months);
  const nonRevenueAccounts = new Map<
    string,
    {
      label: string;
      section: string;
      sort: number;
      values: Record<string, number>;
      accountCode: string;
    }
  >();
  for (const row of glRows) {
    if (row.pl_section === "revenue") continue;
    const account = accountsByCode.get(row.account_code);
    if (account && account.active === false) continue;
    const statement = String(account?.statement_type ?? "").toLowerCase();
    if (statement && !statement.includes("winst")) continue;
    const key = row.account_code;
    if (!nonRevenueAccounts.has(key)) {
      nonRevenueAccounts.set(key, {
        label: `${row.account_code} - ${row.account_name}`,
        section: row.pl_section || "other",
        sort: Number(row.sort_order ?? 999999),
        values: blankValues(months),
        accountCode: row.account_code,
      });
    }
    nonRevenueAccounts.get(key)!.values[row.period] += Number(row.amount ?? 0);
  }

  const accountsBySection = [...nonRevenueAccounts.values()].sort((a, b) => {
    const sectionSort = sectionIndex(a.section) - sectionIndex(b.section);
    if (sectionSort !== 0) return sectionSort;
    return a.sort - b.sort || a.label.localeCompare(b.label);
  });

  let currentSection = "";
  let sectionValues = blankValues(months);
  let sectionAccountCodes: string[] = [];
  const flushedSections = new Set<string>();
  const flushSection = () => {
    if (!currentSection) return;
    flushedSections.add(currentSection);
    const sectionBudgetValues = budgetBySection.get(currentSection) ?? blankValues(months);
    for (const period of months) costTotal[period] += sectionValues[period] ?? 0;
    for (const period of months) costBudgetTotal[period] += sectionBudgetValues[period] ?? 0;
    const sectionDetails = Object.fromEntries(
      months.map((period) => [
        period,
        {
          source: "gl" as const,
          label: `${sectionLabel(currentSection)} totaal`,
          accountCodes: sectionAccountCodes,
        },
      ]),
    );
    for (const budgetRow of budgetRowsBySection.get(currentSection) ?? []) rows.push(budgetRow);
    rows.push(
      makeRow(
        `subtotal-${currentSection}`,
        `${sectionLabel(currentSection)} totaal`,
        currentSection,
        0,
        "subtotal",
        sectionValues,
        months,
        sectionDetails,
        undefined,
        undefined,
        sectionBudgetValues,
      ),
    );
    if (currentSection === "cost_of_goods") {
      const grossMarginValues = blankValues(months);
      const grossMarginPercentageValues = blankValues(months);
      const grossMarginBudgetValues = blankValues(months);
      const grossMarginPercentageBudgetValues = blankValues(months);
      for (const period of months) {
        grossMarginValues[period] = revenueTotal[period] - (sectionValues[period] ?? 0);
        grossMarginPercentageValues[period] = percentage(
          grossMarginValues[period],
          revenueTotal[period],
        );
        grossMarginBudgetValues[period] =
          revenueBudgetTotal[period] - (sectionBudgetValues[period] ?? 0);
        grossMarginPercentageBudgetValues[period] = percentage(
          grossMarginBudgetValues[period],
          revenueBudgetTotal[period],
        );
      }

      const grossMarginYtd = revenueYtd - sumValues(sectionValues, months);
      const grossMarginPercentageYtd = percentage(grossMarginYtd, revenueYtd);
      const grossMarginBudgetYtd = revenueBudgetYtd - sumValues(sectionBudgetValues, months);
      const grossMarginPercentageBudgetYtd = percentage(grossMarginBudgetYtd, revenueBudgetYtd);
      rows.push(
        makeRow(
          "gross-margin",
          "Brutomarge",
          "cost_of_goods",
          0,
          "result",
          grossMarginValues,
          months,
          undefined,
          undefined,
          undefined,
          grossMarginBudgetValues,
          grossMarginBudgetYtd,
        ),
      );
      rows.push(
        makeRow(
          "gross-margin-percentage",
          "Brutomarge %",
          "cost_of_goods",
          0,
          "result",
          grossMarginPercentageValues,
          months,
          undefined,
          "percentage",
          grossMarginPercentageYtd,
          grossMarginPercentageBudgetValues,
          grossMarginPercentageBudgetYtd,
        ),
      );
    }
    sectionValues = blankValues(months);
    sectionAccountCodes = [];
  };

  for (const account of accountsBySection) {
    if (account.section !== currentSection) {
      flushSection();
      currentSection = account.section;
    }
    const detailByPeriod = Object.fromEntries(
      months.map((period) => [
        period,
        {
          source: "gl" as const,
          label: account.label,
          accountCodes: [account.accountCode],
        },
      ]),
    );
    rows.push(
      makeRow(
        `account-${account.accountCode}`,
        account.label,
        account.section,
        1,
        "normal",
        account.values,
        months,
        detailByPeriod,
      ),
    );
    sectionAccountCodes.push(account.accountCode);
    for (const period of months) sectionValues[period] += account.values[period] ?? 0;
  }
  flushSection();

  for (const section of [...budgetBySection.keys()].sort(
    (a, b) => sectionIndex(a) - sectionIndex(b),
  )) {
    if (section === "revenue" || flushedSections.has(section)) continue;
    currentSection = section;
    sectionValues = blankValues(months);
    sectionAccountCodes = [];
    flushSection();
  }

  const resultValues = blankValues(months);
  const resultBudgetValues = blankValues(months);
  for (const period of months) {
    resultValues[period] = revenueTotal[period] - costTotal[period];
    resultBudgetValues[period] = revenueBudgetTotal[period] - costBudgetTotal[period];
  }
  rows.push(
    makeRow(
      "result",
      "Resultaat",
      "other",
      0,
      "result",
      resultValues,
      months,
      undefined,
      undefined,
      undefined,
      resultBudgetValues,
    ),
  );

  return { rows };
}

function TransactionDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: DetailSelection | null;
  onOpenChange: (open: boolean) => void;
}) {
  const range = useMemo(() => (detail ? monthRange(detail.period) : null), [detail]);
  const detailQ = useQuery({
    queryKey: ["wv-detail", detail],
    queryFn: async () => {
      if (!detail || !range) return [];
      if (detail.source === "gl") {
        let q = db
          .from<GlDetailRow>("gl_transactions")
          .select(
            "id,transaction_date,account_code,description,relation_name,document_number,amount,debit_amount,credit_amount,raw_payload",
          )
          .gte("transaction_date", range.startDate)
          .lt("transaction_date", range.endDate)
          .order("transaction_date", { ascending: false })
          .limit(10000);
        if (detail.accountCodes && detail.accountCodes.length > 0)
          q = q.in("account_code", detail.accountCodes);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as GlDetailRow[];
      }

      const wantsShopify =
        !detail.channel ||
        detail.channel === "shopify_webshop" ||
        detail.channel === "shopify_winkel";
      const wantsTransactions = !detail.channel || detail.channel === "bold_afs";
      const wantsMollieInvoices = !detail.channel || detail.channel === "mollie_facturen";
      const wantsWefactInvoices = !detail.channel || detail.channel === "wefact_facturen";
      const rows: SalesDetailRow[] = [];

      if (wantsShopify) {
        let q = db
          .from<ShopifyOrderDetailRow>("shopify_order_summaries")
          .select(
            "id,external_id,order_name,source_name,channel,financial_status,processed_at,current_total_price,current_total_tax,total_price,total_tax,line_tax_total,total_shipping,total_refunded,raw_payload",
          )
          .gte("processed_at", range.startIso)
          .lt("processed_at", range.endIso)
          .order("processed_at", { ascending: false, nullsFirst: false })
          .limit(5000);
        if (detail.channel) q = q.eq("channel", detail.channel);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...(data ?? []).filter(hasShopifyInvoiceData).map(mapShopifyOrderDetail));
      }

      if (wantsTransactions) {
        let q = db
          .from<SalesDetailRow>("transactions")
          .select(
            "id,external_id,source,channel,article_number,product_name,amount_gross,amount_net,vat_amount,vat_rate,invoice_number,status,paid_at,description_raw,parse_status",
          )
          .eq("status", "paid")
          .eq("parse_status", "ok")
          .gte("paid_at", range.startIso)
          .lt("paid_at", range.endIso)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .limit(2000);
        if (detail.channel) q = q.eq("channel", detail.channel);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...((data ?? []) as SalesDetailRow[]));
      }

      if (wantsMollieInvoices) {
        const { data, error } = await (supabase as any)
          .from("mollie_sales_invoices")
          .select(
            "id,sales_invoice_id,reference,status,issued_at,paid_at,recipient_name,recipient_email,amount_gross,amount_net,vat_amount,invoice_url",
          )
          .eq("status", "paid")
          .gte("paid_at", range.startIso)
          .lt("paid_at", range.endIso)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .limit(5000);
        if (error) throw error;
        rows.push(...((data ?? []) as MollieSalesInvoiceDetailRow[]).map(mapMollieInvoiceDetail));
      }

      if (wantsWefactInvoices) {
        const { data, error } = await (supabase as any)
          .from("wefact_invoices")
          .select(
            "id,invoice_number,invoice_date,due_date,status,customer_number,customer_name,reference,category,amount_gross,amount_net,vat_amount,source_filename",
          )
          .neq("status", "canceled")
          .gte("invoice_date", range.startDate)
          .lt("invoice_date", range.endDate)
          .order("invoice_date", { ascending: false })
          .limit(5000);
        if (error) throw error;
        rows.push(
          ...((data ?? []) as WefactInvoiceDetailRow[])
            .filter((row) => !WEFACT_NON_CUSTOMER_CATEGORIES.has(row.category ?? ""))
            .map(mapWefactInvoiceDetail),
        );
      }

      return rows.sort(
        (a, b) => new Date(b.paid_at ?? 0).getTime() - new Date(a.paid_at ?? 0).getTime(),
      );
    },
    enabled: Boolean(detail && range),
  });

  const rows = detailQ.data ?? [];
  const sourceTotal = rows.reduce((sum, row) => {
    if (detail?.source === "gl") return sum + Number((row as GlDetailRow).amount ?? 0);
    return sum + Number((row as SalesDetailRow).amount_net ?? 0);
  }, 0);
  const normalizedSourceTotal =
    detail?.source === "gl" && detail.invertGlSign ? -sourceTotal : sourceTotal;

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[1100px] overflow-hidden p-0">
        <div className="p-6 pb-3">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "Transacties"}</DialogTitle>
            <DialogDescription>
              {detail?.source === "gl"
                ? "Onderliggende grootboektransacties"
                : "Onderliggende verkooptransacties"}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="grid gap-3 px-6 md:grid-cols-3">
          <MiniMetric label="W&V bedrag" value={formatEUR(detail?.amount ?? 0)} />
          <MiniMetric label="Controle totaal" value={formatEUR(normalizedSourceTotal)} />
          <MiniMetric label="Regels" value={detailQ.isLoading ? "..." : String(rows.length)} />
        </div>
        <div className="max-h-[58vh] overflow-auto px-6 pb-6 pt-3">
          {detailQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Transacties laden...
            </div>
          ) : detailQ.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Detail ophalen mislukt:{" "}
              {detailQ.error instanceof Error ? detailQ.error.message : String(detailQ.error)}
            </div>
          ) : detail?.source === "gl" ? (
            <GlDetailTable rows={rows as GlDetailRow[]} />
          ) : (
            <SalesDetailTable rows={rows as SalesDetailRow[]} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GlDetailTable({ rows }: { rows: GlDetailRow[] }) {
  if (rows.length === 0) return <EmptyDetails />;
  return (
    <table className="w-full min-w-[940px] text-sm">
      <thead className="sticky top-0 bg-background text-left shadow-sm">
        <tr>
          <th className="px-3 py-2 font-medium">Datum</th>
          <th className="px-3 py-2 font-medium">Rekening</th>
          <th className="px-3 py-2 font-medium">Boekstuk</th>
          <th className="px-3 py-2 font-medium">Exact</th>
          <th className="px-3 py-2 font-medium">Relatie</th>
          <th className="px-3 py-2 font-medium">Omschrijving</th>
          <th className="px-3 py-2 text-right font-medium">Bedrag</th>
          <th className="px-3 py-2 text-right font-medium">Debet</th>
          <th className="px-3 py-2 text-right font-medium">Credit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const documentUrl = exactDocumentUrl(row);
          return (
            <tr key={row.id} className="border-t align-top">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatGlDate(row)}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.account_code ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.document_number || "-"}</td>
              <td className="whitespace-nowrap px-3 py-1">
                {documentUrl ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Open Exact-document"
                  >
                    <a href={documentUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2">{row.relation_name || "-"}</td>
              <td className="px-3 py-2">{row.description || "-"}</td>
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
  );
}

function SalesDetailTable({ rows }: { rows: SalesDetailRow[] }) {
  if (rows.length === 0) return <EmptyDetails />;
  return (
    <table className="w-full min-w-[940px] text-sm">
      <thead className="sticky top-0 bg-background text-left shadow-sm">
        <tr>
          <th className="px-3 py-2 font-medium">Betaald</th>
          <th className="px-3 py-2 font-medium">Kanaal</th>
          <th className="px-3 py-2 font-medium">Factuur</th>
          <th className="px-3 py-2 font-medium">Artikel</th>
          <th className="px-3 py-2 font-medium">Omschrijving</th>
          <th className="px-3 py-2 text-right font-medium">Netto</th>
          <th className="px-3 py-2 text-right font-medium">Btw</th>
          <th className="px-3 py-2 text-right font-medium">Bruto</th>
          <th className="px-3 py-2 font-medium">Bron</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t align-top">
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
              {formatDateTimeNL(row.paid_at)}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{channelLabel(row.channel)}</td>
            <td className="whitespace-nowrap px-3 py-2">
              {row.invoice_url ? (
                <a
                  href={row.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  {row.invoice_number || row.external_id || "Open"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                row.invoice_number || row.external_id || "-"
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{row.article_number || "-"}</td>
            <td className="px-3 py-2">{row.product_name || row.description_raw || "-"}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.amount_net)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.vat_amount)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
              {formatEUR(row.amount_gross)}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{row.source || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function mapShopifyOrderDetail(row: ShopifyOrderDetailRow): SalesDetailRow {
  const { gross, vat } = shopifyInvoiceAmounts(row);
  return {
    id: row.id,
    external_id: row.external_id,
    source: "shopify_orderdata",
    channel: row.channel,
    article_number: row.source_name ?? null,
    product_name: `Shopify order ${row.order_name ?? row.external_id}`,
    amount_gross: gross,
    amount_net: roundMoney(gross - vat),
    vat_amount: vat,
    vat_rate: null,
    invoice_number: row.order_name ?? row.external_id,
    status: row.financial_status,
    paid_at: row.processed_at,
    description_raw: [
      row.source_name ? `Bron: ${row.source_name}` : null,
      Number(row.total_shipping ?? 0) ? `Verzendkosten: ${formatEUR(row.total_shipping)}` : null,
      Number(row.total_refunded ?? 0) ? `Refunds: ${formatEUR(row.total_refunded)}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    parse_status: "ok",
  };
}

function mapMollieInvoiceDetail(row: MollieSalesInvoiceDetailRow): SalesDetailRow {
  return {
    id: row.id,
    external_id: row.sales_invoice_id,
    source: "mollie_sales_invoice",
    channel: "mollie_facturen",
    article_number: null,
    product_name: row.recipient_name || row.recipient_email || "Mollie factuur",
    amount_gross: row.amount_gross,
    amount_net: row.amount_net,
    vat_amount: row.vat_amount,
    vat_rate: null,
    invoice_number: row.reference ?? row.sales_invoice_id,
    status: row.status,
    paid_at: row.paid_at ?? row.issued_at,
    description_raw: row.recipient_email,
    parse_status: "ok",
    invoice_url: row.invoice_url,
  };
}

function mapWefactInvoiceDetail(row: WefactInvoiceDetailRow): SalesDetailRow {
  return {
    id: row.id,
    external_id: row.invoice_number,
    source: "wefact_invoice_pdf",
    channel: "wefact_facturen",
    article_number: row.category,
    product_name: row.customer_name || row.reference || "WeFact factuur",
    amount_gross: row.amount_gross,
    amount_net: row.amount_net,
    vat_amount: row.vat_amount,
    vat_rate: null,
    invoice_number: row.invoice_number,
    status: row.status,
    paid_at: row.invoice_date,
    description_raw: [
      row.reference ? `Referentie: ${row.reference}` : null,
      row.customer_number ? `Klant: ${row.customer_number}` : null,
      row.source_filename,
    ]
      .filter(Boolean)
      .join(" | "),
    parse_status: "ok",
  };
}

function hasShopifyInvoiceData(row: ShopifyOrderDetailRow) {
  return Boolean(
    row.raw_payload?.tax_rates !== undefined ||
    row.total_tax !== null ||
    row.current_total_tax !== null,
  );
}

function exactDocumentUrl(row: GlDetailRow) {
  const rawUrl = payloadValue(row.raw_payload, [
    "exact_document_url",
    "ExactDocumentUrl",
    "document_url",
    "DocumentUrl",
  ]);
  const url = String(rawUrl ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;

  const rawDocumentId = payloadValue(row.raw_payload, [
    "exact_document_id",
    "Document",
    "document",
  ]);
  const documentId = String(rawDocumentId ?? "").trim();
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function shopifyInvoiceAmounts(row: ShopifyOrderDetailRow) {
  const gross = coalesceMoney(row.current_total_price, row.total_price);
  const vat = coalesceMoney(row.current_total_tax, row.total_tax, row.line_tax_total);
  return { gross, vat };
}

function coalesceMoney(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return roundMoney(numeric);
  }
  return 0;
}

function roundMoney(value: unknown) {
  return Number.isFinite(Number(value)) ? +Number(value).toFixed(2) : 0;
}

function makeRow(
  key: string,
  label: string,
  section: string,
  level: 0 | 1,
  kind: PlRow["kind"],
  values: Record<string, number>,
  months: string[],
  detailByPeriod?: Record<string, DetailBase>,
  valueFormat?: PlRow["valueFormat"],
  ytd?: number,
  budgetValues?: Record<string, number>,
  budgetYtd?: number,
  budgetOnly = false,
): PlRow {
  return {
    key,
    label,
    section,
    level,
    kind,
    valueFormat,
    values,
    ytd: ytd ?? sumValues(values, months),
    budgetValues,
    budgetYtd: budgetValues ? (budgetYtd ?? sumValues(budgetValues, months)) : undefined,
    budgetOnly,
    detailByPeriod,
  };
}

function blankValues(months: string[]) {
  return Object.fromEntries(months.map((period) => [period, 0]));
}

function budgetLinesByKey(budgetLines: PlBudgetLine[], months: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const line of budgetLines) {
    if (!result.has(line.line_key)) result.set(line.line_key, blankValues(months));
    result.get(line.line_key)![line.period] += Number(line.amount ?? 0);
  }
  return result;
}

function revenueBudgetValuesByChannel(
  revenueBudgets: RevenueBudgetRow[],
  budgetLines: PlBudgetLine[],
  months: string[],
) {
  const result = new Map<string, Record<string, number>>();
  const machineBudgetByChannelPeriod = new Map<string, number>();
  const explicitChannelBudgetPeriods = new Set<string>();

  for (const channel of CHANNELS) {
    result.set(channel, blankValues(months));
  }

  for (const budget of revenueBudgets) {
    if (!CHANNELS.includes(budget.channel as (typeof CHANNELS)[number])) continue;
    const period = budget.period;
    if (!months.includes(period)) continue;
    const amount = Number(budget.amount ?? 0);
    if (!Number.isFinite(amount)) continue;

    const key = `${budget.channel}|${period}`;
    if (!budget.machine_id) {
      explicitChannelBudgetPeriods.add(key);
      result.get(budget.channel)![period] += amount;
      continue;
    }

    machineBudgetByChannelPeriod.set(key, (machineBudgetByChannelPeriod.get(key) ?? 0) + amount);
  }

  for (const [key, amount] of machineBudgetByChannelPeriod.entries()) {
    if (explicitChannelBudgetPeriods.has(key)) continue;
    const [channel, period] = key.split("|");
    result.get(channel)![period] += amount;
  }

  const forecastRevenue = budgetLinesByKey(
    budgetLines.filter((line) => line.kind === "revenue"),
    months,
  );
  for (const channel of CHANNELS) {
    const values = result.get(channel)!;
    const fallback = forecastRevenue.get(`revenue-${channel}`);
    if (!fallback) continue;
    for (const period of months) {
      if (Math.abs(values[period] ?? 0) < 0.005) values[period] = fallback[period] ?? 0;
    }
  }

  return result;
}

function budgetLinesBySection(budgetLines: PlBudgetLine[], months: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const line of budgetLines) {
    if (line.kind === "revenue") continue;
    if (!result.has(line.section)) result.set(line.section, blankValues(months));
    result.get(line.section)![line.period] += Number(line.amount ?? 0);
  }
  return result;
}

function budgetOnlyRowsBySection(budgetLines: PlBudgetLine[], months: string[]) {
  const grouped = new Map<string, Map<string, PlBudgetLine[]>>();
  for (const line of budgetLines) {
    if (line.kind === "revenue") continue;
    if (!grouped.has(line.section)) grouped.set(line.section, new Map());
    const section = grouped.get(line.section)!;
    if (!section.has(line.line_key)) section.set(line.line_key, []);
    section.get(line.line_key)!.push(line);
  }

  const result = new Map<string, PlRow[]>();
  for (const [section, linesByKey] of grouped.entries()) {
    const rows = [...linesByKey.entries()]
      .map(([lineKey, lines]) => {
        const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
        const first = sorted[0];
        const budgetValues = blankValues(months);
        for (const line of sorted) budgetValues[line.period] += Number(line.amount ?? 0);
        return makeRow(
          `budget-${lineKey}`,
          first.line_label,
          section,
          1,
          "normal",
          blankValues(months),
          months,
          undefined,
          undefined,
          0,
          budgetValues,
          undefined,
          true,
        );
      })
      .sort((a, b) => {
        const aLine = linesByKey.get(a.key.replace(/^budget-/, ""))?.[0];
        const bLine = linesByKey.get(b.key.replace(/^budget-/, ""))?.[0];
        return Number(aLine?.sort_order ?? 999999) - Number(bLine?.sort_order ?? 999999);
      });
    result.set(section, rows);
  }
  return result;
}

function sumValues(values: Record<string, number>, months: string[]) {
  return months.reduce((sum, period) => sum + Number(values[period] ?? 0), 0);
}

function percentage(value: number, total: number) {
  return Math.abs(total) < 0.005 ? Number.NaN : (value / total) * 100;
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PlColumnToggles({
  columns,
  onToggle,
}: {
  columns: PlMetricColumn[];
  onToggle: (column: PlMetricColumn) => void;
}) {
  return (
    <div className="md:col-span-2 xl:col-span-2">
      <div className="mb-2 text-xs text-muted-foreground">Kolommen</div>
      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {PL_METRIC_COLUMNS.map((option) => {
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

function BudgetHeaderCells({
  columns,
  totalLabel,
}: {
  columns: PlMetricColumn[];
  totalLabel?: string;
}) {
  return (
    <>
      {columns.map((column, index) => (
        <th
          key={column}
          className={`${index === 0 ? "border-l" : ""} px-3 py-2 text-right font-medium`}
        >
          {totalLabel ? totalPlMetricLabel(column, totalLabel) : plMetricLabel(column)}
        </th>
      ))}
    </>
  );
}

function BudgetAmountCells({
  columns,
  value,
  budget,
  budgetOnly = false,
  valueFormat = "currency",
  strong = false,
  onClick,
}: {
  columns: PlMetricColumn[];
  value: number;
  budget?: number;
  budgetOnly?: boolean;
  valueFormat?: "currency" | "percentage";
  strong?: boolean;
  onClick?: () => void;
}) {
  const hasBudget = budget !== undefined && Number.isFinite(budget);
  const variance = hasBudget && !budgetOnly ? value - Number(budget) : undefined;
  return (
    <>
      {columns.map((column, index) => {
        const isActual = column === "actual";
        const metricValue =
          column === "actual"
            ? budgetOnly
              ? undefined
              : value
            : column === "budget"
              ? hasBudget
                ? Number(budget)
                : undefined
              : variance;
        return (
          <BudgetValueCell
            key={column}
            value={metricValue}
            valueFormat={valueFormat}
            strong={strong}
            muted={(column === "budget" || column === "variance") && !hasBudget}
            onClick={isActual && !budgetOnly ? onClick : undefined}
            className={index === 0 ? "border-l" : ""}
          />
        );
      })}
    </>
  );
}

function BudgetValueCell({
  value,
  valueFormat = "currency",
  strong = false,
  muted = false,
  className = "",
  onClick,
}: {
  value?: number;
  valueFormat?: "currency" | "percentage";
  strong?: boolean;
  muted?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const numericValue = Number(value);
  const hasValue = value !== undefined && Number.isFinite(numericValue);
  const classes = [
    "px-3 py-2 text-right tabular-nums",
    strong ? "font-semibold" : "",
    muted || !hasValue ? "text-muted-foreground" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const formatted = hasValue
    ? valueFormat === "percentage"
      ? formatPercentage(numericValue)
      : formatEUR(numericValue)
    : "-";
  if (!onClick || !hasValue) return <td className={classes}>{formatted}</td>;
  return (
    <td className={classes}>
      <button
        type="button"
        className="rounded px-1 text-right underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={onClick}
      >
        {formatted}
      </button>
    </td>
  );
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
}

function composePeriod(year: string, month: string) {
  return `${year}-${month}`;
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

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return {
      value,
      label: new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" }),
    };
  });
}

function selectionTitle(viewMode: ViewMode, periods: string[], year: string) {
  if (viewMode === "year") return `Winst en verlies - jaar ${year}`;
  if (periods.length === 1) return `Winst en verlies - ${monthLabel(periods[0])}`;
  return `Winst en verlies - ${monthLabel(periods[0])} t/m ${monthLabel(periods[periods.length - 1])}`;
}

function aggregateLabel(viewMode: ViewMode, periods: string[]) {
  if (viewMode === "year") return "Jaar totaal";
  if (periods.length <= 1) return "Totaal";
  return periods[0]?.endsWith("-01") ? "YTD totaal" : "Periode totaal";
}

function plMetricLabel(column: PlMetricColumn) {
  switch (column) {
    case "actual":
      return "Actueel";
    case "budget":
      return "Budget";
    case "variance":
      return "Verschil";
  }
}

function totalPlMetricLabel(column: PlMetricColumn, totalLabel: string) {
  const suffix = totalLabel === "YTD totaal" ? " YTD" : totalLabel === "Jaar totaal" ? " jaar" : "";
  switch (column) {
    case "actual":
      return `Actueel${suffix}`;
    case "budget":
      return `Budget${suffix}`;
    case "variance":
      return `Verschil${suffix}`;
  }
}

function orderPlMetricColumns(columns: PlMetricColumn[]) {
  const order = new Map(PL_METRIC_COLUMNS.map((column, index) => [column.value, index]));
  return [...columns].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function EmptyDetails() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Geen onderliggende transacties gevonden.
    </div>
  );
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 2 - index));
}

function monthRange(period: string) {
  const [year, rawMonth] = period.split("-");
  const start = new Date(Number(year), Number(rawMonth) - 1, 1);
  const end = new Date(Number(year), Number(rawMonth), 1);
  return {
    startDate: `${year}-${rawMonth}-01`,
    endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function monthLabel(period: string) {
  const [year, rawMonth] = period.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function formatGlDate(row: GlDetailRow) {
  const rawDate = payloadValue(row.raw_payload, [
    "EntryDate",
    "entrydate",
    "entry_date",
    "Datum",
    "Boekdatum",
  ]);
  return (
    formatLooseDate(rawDate) ??
    formatLooseDate(row.transaction_date) ??
    formatDateNL(row.transaction_date)
  );
}

function payloadValue(payload: Record<string, unknown> | null, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const found = Object.entries(payload).find(([key]) => normalizedKeys.has(normalizeKey(key)));
  return found?.[1] ?? null;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatLooseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const nl = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/.exec(raw);
  if (nl) {
    const year = nl[3].length === 2 ? `20${nl[3]}` : nl[3];
    return `${nl[1].padStart(2, "0")}-${nl[2].padStart(2, "0")}-${year}`;
  }
  return null;
}
