import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, RefreshCw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDateNL, formatDateTimeNL, formatEUR } from "@/lib/format";
import {
  CHANNELS,
  channelLabel,
  downloadTransactionTemplate,
  monthShortLabel,
  monthsForYearToQuarter,
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

type GlRevenueSourceRow = {
  period: string;
  revenue_source: "shopify" | "mollie_journal";
  tx_count: number;
  net_total: number;
};

type DetailBase = {
  source: "gl" | "sales";
  label: string;
  channel?: string;
  accountCodes?: string[];
  invertGlSign?: boolean;
  revenueSource?: GlRevenueSourceRow["revenue_source"];
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
  detailByPeriod?: Record<string, DetailBase>;
};

type ReconciliationRow = {
  key: string;
  period: string;
  gl: number;
  own: number;
  diff: number;
  shopifyDiff: number;
  mollieDiff: number;
  glMollie: number;
  ownMollie: number;
  source: "Grootboek" | "Eigen data";
  glDetail: DetailBase;
  ownDetail: DetailBase;
  glMollieDetail: DetailBase;
  ownMollieDetail: DetailBase;
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

function ProfitLossPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [toQuarter, setToQuarter] = useState(`Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const [detail, setDetail] = useState<DetailSelection | null>(null);
  const [exactSyncing, setExactSyncing] = useState(false);
  const months = useMemo(() => monthsForYearToQuarter(year, toQuarter), [toQuarter, year]);

  const accountsQ = useQuery({
    queryKey: ["gl-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
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
      const { data, error } = await (supabase as any)
        .from("vw_gl_monthly_account")
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
      const { data, error } = await (supabase as any)
        .from("vw_monthly_revenue_actuals")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as SalesPeriodRow[];
    },
    enabled: months.length > 0,
  });

  const glRevenueSourceQ = useQuery({
    queryKey: ["wv-gl-revenue-source-monthly", months],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_gl_revenue_source_monthly")
        .select("*")
        .in("period", months);
      if (error) throw error;
      return (data ?? []) as GlRevenueSourceRow[];
    },
    enabled: months.length > 0,
  });

  const { rows, reconciliation } = useMemo(
    () =>
      buildProfitLoss({
        months,
        glRows: glQ.data ?? [],
        salesRows: salesQ.data ?? [],
        glRevenueSourceRows: glRevenueSourceQ.data ?? [],
        accounts: accountsQ.data ?? [],
      }),
    [accountsQ.data, glQ.data, glRevenueSourceQ.data, months, salesQ.data],
  );

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

  function openReconciliationDetail(base: DetailBase, period: string, amount: number) {
    if (Math.abs(amount) < 0.005) return;
    setDetail({
      ...base,
      period,
      amount,
      title: `${base.label} - ${monthLabel(period)}`,
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
        const { error } = await (supabase as any)
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
            Maandrapportage met omzet uit eigen verkoopdata en kosten uit het grootboek.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={syncExact} disabled={exactSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${exactSyncing ? "animate-spin" : ""}`} />
            Exact sync
          </Button>
          <Button variant="outline" onClick={() => downloadTransactionTemplate(accountsQ.data ?? [])}>
            <Download className="mr-2 h-4 w-4" />
            Transactie-template
          </Button>
          <Button variant="outline" asChild>
            <label>
              <Upload className="mr-2 h-4 w-4" />
              W&V-transacties uploaden
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={uploadTransactions} />
            </label>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-[130px_130px] items-end">
          <Field label="Jaar">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions().map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="T/m kwartaal">
            <Select value={toQuarter} onValueChange={setToQuarter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((quarter) => <SelectItem key={quarter} value={`Q${quarter}`}>Q{quarter}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Winst en verlies per maand</CardTitle>
          <CardDescription>
            Klik op een maandbedrag om de onderliggende grootboekregels of verkooptransacties te zien.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Rubriek</th>
                  <th className="px-3 py-2 font-medium">Regel</th>
                  {months.map((period) => (
                    <th key={period} className="px-3 py-2 text-right font-medium">
                      <span className="block">{monthShortLabel(period)}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">{monthToQuarterKey(period).replace(`${year}-`, "")}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">YTD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={row.kind === "subtotal" || row.kind === "result" ? "border-t bg-muted/20" : "border-t hover:bg-muted/30"}>
                    <td className="px-3 py-2">
                      {row.level === 0 ? <Badge variant="outline">{sectionLabel(row.section)}</Badge> : null}
                    </td>
                    <td className={row.level === 0 ? "px-3 py-2 font-semibold" : "px-3 py-2 pl-8"}>{row.label}</td>
                    {months.map((period) => {
                      const value = row.values[period] ?? 0;
                      const canOpen = Boolean(row.detailByPeriod?.[period]) && Math.abs(value) >= 0.005;
                      return (
                        <AmountCell
                          key={`${row.key}-${period}`}
                          value={value}
                          valueFormat={row.valueFormat}
                          strong={row.kind !== "normal"}
                          onClick={canOpen ? () => openDetail(row, period) : undefined}
                        />
                      );
                    })}
                    <AmountCell value={row.ytd} valueFormat={row.valueFormat} strong />
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={months.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                      Geen W&V-data voor deze selectie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzetaansluiting GL versus eigen data</CardTitle>
          <CardDescription>
            Exact Mollie-dagboek wordt aangesloten op de AFS-transacties in de app. De resterende Exact-omzet vormt de Shopify-delta.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 text-right font-medium">Grootboek omzet</th>
                  <th className="px-3 py-2 text-right font-medium">Eigen omzet ex btw</th>
                  <th className="px-3 py-2 text-right font-medium">Totaal verschil</th>
                  <th className="px-3 py-2 text-right font-medium">Exact Mollie dagboek</th>
                  <th className="px-3 py-2 text-right font-medium">AFS app</th>
                  <th className="px-3 py-2 text-right font-medium">Mollie dagboek &lt;&gt; AFS</th>
                  <th className="px-3 py-2 text-right font-medium">Delta &lt;&gt; Shopify</th>
                  <th className="px-3 py-2 font-medium">Bron W&V</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.map((row) => (
                  <tr key={row.key} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums">{monthLabel(row.period)}</td>
                    <AmountCell value={row.gl} onClick={() => openReconciliationDetail(row.glDetail, row.period, row.gl)} />
                    <AmountCell value={row.own} onClick={() => openReconciliationDetail(row.ownDetail, row.period, row.own)} />
                    <AmountCell value={row.diff} toneBySign />
                    <AmountCell value={row.glMollie} onClick={() => openReconciliationDetail(row.glMollieDetail, row.period, row.glMollie)} />
                    <AmountCell value={row.ownMollie} onClick={() => openReconciliationDetail(row.ownMollieDetail, row.period, row.ownMollie)} />
                    <AmountCell value={row.mollieDiff} />
                    <AmountCell value={row.shopifyDiff} toneBySign />
                    <td className="px-3 py-2">
                      <Badge variant={row.source === "Eigen data" ? "secondary" : "outline"}>{row.source}</Badge>
                    </td>
                  </tr>
                ))}
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
  glRevenueSourceRows,
  accounts,
}: {
  months: string[];
  glRows: GlPeriodRow[];
  salesRows: SalesPeriodRow[];
  glRevenueSourceRows: GlRevenueSourceRow[];
  accounts: GlAccount[];
}) {
  const accountsByCode = new Map(accounts.map((account) => [account.account_code, account]));
  const glRevenueTotal = new Map<string, number>();
  const glAllRevenueCodes = new Map<string, Set<string>>();
  const ownRevenue = new Map<string, number>();
  const ownRevenueTotal = new Map<string, number>();
  const glRevenueBySource = new Map<string, number>();
  const rows: PlRow[] = [];
  const reconciliation: ReconciliationRow[] = [];

  for (const row of glRows) {
    const account = accountsByCode.get(row.account_code);
    if (account && account.active === false) continue;
    const statement = String(account?.statement_type ?? "").toLowerCase();
    if (statement && !statement.includes("winst")) continue;
    const amount = Number(row.amount ?? 0);
    if (row.pl_section === "revenue") {
      const normalized = -amount;
      addSet(glAllRevenueCodes, row.period, row.account_code);
      add(glRevenueTotal, row.period, normalized);
    }
  }

  for (const row of salesRows) {
    add(ownRevenue, `${row.period}|${row.channel}`, Number(row.net_total ?? 0));
    add(ownRevenueTotal, row.period, Number(row.net_total ?? 0));
  }

  for (const row of glRevenueSourceRows) {
    add(glRevenueBySource, `${row.period}|${row.revenue_source}`, Number(row.net_total ?? 0));
  }

  const revenueTotal = blankValues(months);
  const revenueTotalDetails: Record<string, DetailBase> = {};
  for (const channel of CHANNELS) {
    const values = blankValues(months);
    const detailByPeriod: Record<string, DetailBase> = {};
    for (const period of months) {
      const own = ownRevenue.get(`${period}|${channel}`) ?? 0;
      values[period] = own;
      revenueTotal[period] += values[period];
      detailByPeriod[period] = {
        source: "sales",
        label: `${channelLabel(channel)} verkooptransacties`,
        channel,
      };
    }
    rows.push(makeRow(`revenue-${channel}`, channelLabel(channel), "revenue", 1, "normal", values, months, detailByPeriod));
  }

  for (const period of months) {
    revenueTotalDetails[period] = {
      source: "sales",
      label: "Omzet totaal verkooptransacties",
    };
  }

  for (const period of months) {
    const gl = glRevenueTotal.get(period) ?? 0;
    const own = ownRevenueTotal.get(period) ?? 0;
    const glMollie = glRevenueBySource.get(`${period}|mollie_journal`) ?? 0;
    const ownShopify =
      (ownRevenue.get(`${period}|shopify_webshop`) ?? 0) +
      (ownRevenue.get(`${period}|shopify_winkel`) ?? 0);
    const ownMollie = ownRevenue.get(`${period}|bold_afs`) ?? 0;
    const mollieDelta = glMollie - ownMollie;
    reconciliation.push({
      key: period,
      period,
      gl,
      own,
      diff: gl - own,
      shopifyDiff: mollieDelta - ownShopify,
      mollieDiff: mollieDelta,
      glMollie,
      ownMollie,
      source: "Eigen data",
      glDetail: {
        source: "gl",
        label: "Totale grootboekomzet",
        accountCodes: [...(glAllRevenueCodes.get(period) ?? new Set<string>())],
        invertGlSign: true,
      },
      ownDetail: {
        source: "sales",
        label: "Totale verkooptransacties",
      },
      glMollieDetail: {
        source: "gl",
        label: "Exact Mollie dagboek omzet",
        accountCodes: [...(glAllRevenueCodes.get(period) ?? new Set<string>())],
        invertGlSign: true,
        revenueSource: "mollie_journal",
      },
      ownMollieDetail: {
        source: "sales",
        label: "AFS verkooptransacties",
        channel: "bold_afs",
      },
    });
  }

  rows.push(makeRow("revenue-total", "Omzet totaal", "revenue", 0, "subtotal", revenueTotal, months, revenueTotalDetails));

  const costTotal = blankValues(months);
  const revenueYtd = sumValues(revenueTotal, months);
  const nonRevenueAccounts = new Map<string, { label: string; section: string; sort: number; values: Record<string, number>; accountCode: string }>();
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
  const flushSection = () => {
    if (!currentSection) return;
    for (const period of months) costTotal[period] += sectionValues[period] ?? 0;
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
    rows.push(makeRow(`subtotal-${currentSection}`, `${sectionLabel(currentSection)} totaal`, currentSection, 0, "subtotal", sectionValues, months, sectionDetails));
    if (currentSection === "cost_of_goods") {
      const grossMarginValues = blankValues(months);
      const grossMarginPercentageValues = blankValues(months);
      for (const period of months) {
        grossMarginValues[period] = revenueTotal[period] - (sectionValues[period] ?? 0);
        grossMarginPercentageValues[period] = percentage(grossMarginValues[period], revenueTotal[period]);
      }

      const grossMarginYtd = revenueYtd - sumValues(sectionValues, months);
      const grossMarginPercentageYtd = percentage(grossMarginYtd, revenueYtd);
      rows.push(makeRow("gross-margin", "Brutomarge", "cost_of_goods", 0, "result", grossMarginValues, months));
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
    rows.push(makeRow(`account-${account.accountCode}`, account.label, account.section, 1, "normal", account.values, months, detailByPeriod));
    sectionAccountCodes.push(account.accountCode);
    for (const period of months) sectionValues[period] += account.values[period] ?? 0;
  }
  flushSection();

  const resultValues = blankValues(months);
  for (const period of months) {
    resultValues[period] = revenueTotal[period] - costTotal[period];
  }
  rows.push(makeRow("result", "Resultaat", "other", 0, "result", resultValues, months));

  return { rows, reconciliation };
}

function TransactionDetailDialog({ detail, onOpenChange }: { detail: DetailSelection | null; onOpenChange: (open: boolean) => void }) {
  const range = useMemo(() => (detail ? monthRange(detail.period) : null), [detail]);
  const detailQ = useQuery({
    queryKey: ["wv-detail", detail],
    queryFn: async () => {
      if (!detail || !range) return [];
      if (detail.source === "gl") {
        let q = (supabase as any)
          .from("gl_transactions")
          .select("id,transaction_date,account_code,description,relation_name,document_number,amount,debit_amount,credit_amount,raw_payload")
          .gte("transaction_date", range.startDate)
          .lt("transaction_date", range.endDate)
          .order("transaction_date", { ascending: false })
          .limit(detail.revenueSource ? 30000 : 10000);
        if (!detail.revenueSource && detail.accountCodes && detail.accountCodes.length > 0) q = q.in("account_code", detail.accountCodes);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as GlDetailRow[];
        if (!detail.revenueSource) return rows;

        const accountSet = new Set((detail.accountCodes ?? []).map(String));
        const mollieEntryNumbers = new Set(
          rows.map((row) => (isMollieClearingGlRow(row) ? glEntryNumber(row) : null)).filter(Boolean) as string[],
        );
        return rows.filter((row) => {
          if (accountSet.size > 0 && !accountSet.has(String(row.account_code ?? ""))) return false;
          return classifyGlRevenueSource(row, mollieEntryNumbers) === detail.revenueSource;
        });
      }

      const wantsShopify = !detail.channel || detail.channel === "shopify_webshop" || detail.channel === "shopify_winkel";
      const wantsTransactions = !detail.channel || detail.channel === "bold_afs";
      const rows: SalesDetailRow[] = [];

      if (wantsShopify) {
        let q = (supabase as any)
          .from("shopify_order_summaries")
          .select("id,external_id,order_name,source_name,channel,financial_status,processed_at,current_total_price,current_total_tax,total_price,total_tax,line_tax_total,total_shipping,total_refunded,raw_payload")
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
        let q = (supabase as any)
          .from("transactions")
          .select("id,external_id,source,channel,article_number,product_name,amount_gross,amount_net,vat_amount,vat_rate,invoice_number,status,paid_at,description_raw,parse_status")
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

      return rows.sort((a, b) => new Date(b.paid_at ?? 0).getTime() - new Date(a.paid_at ?? 0).getTime());
    },
    enabled: Boolean(detail && range),
  });

  const rows = detailQ.data ?? [];
  const sourceTotal = rows.reduce((sum, row) => {
    if (detail?.source === "gl") return sum + Number((row as GlDetailRow).amount ?? 0);
    return sum + Number((row as SalesDetailRow).amount_net ?? 0);
  }, 0);
  const normalizedSourceTotal = detail?.source === "gl" && detail.invertGlSign ? -sourceTotal : sourceTotal;

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[1100px] overflow-hidden p-0">
        <div className="p-6 pb-3">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "Transacties"}</DialogTitle>
            <DialogDescription>
              {detail?.source === "gl" ? "Onderliggende grootboektransacties" : "Onderliggende verkooptransacties"}
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
            <div className="py-8 text-center text-sm text-muted-foreground">Transacties laden...</div>
          ) : detailQ.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Detail ophalen mislukt: {detailQ.error instanceof Error ? detailQ.error.message : String(detailQ.error)}
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
                  <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Open Exact-document">
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
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.amount)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.debit_amount)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.credit_amount)}</td>
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
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTimeNL(row.paid_at)}</td>
            <td className="whitespace-nowrap px-3 py-2">{channelLabel(row.channel)}</td>
            <td className="whitespace-nowrap px-3 py-2">{row.invoice_number || row.external_id || "-"}</td>
            <td className="whitespace-nowrap px-3 py-2">{row.article_number || "-"}</td>
            <td className="px-3 py-2">{row.product_name || row.description_raw || "-"}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.amount_net)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.vat_amount)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatEUR(row.amount_gross)}</td>
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
    ].filter(Boolean).join(" | "),
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

function classifyGlRevenueSource(
  row: GlDetailRow,
  mollieEntryNumbers: Set<string> = new Set(),
): GlRevenueSourceRow["revenue_source"] {
  const entryNumber = glEntryNumber(row);
  if (entryNumber && mollieEntryNumbers.has(entryNumber)) {
    return "mollie_journal";
  }

  return "shopify";
}

function glEntryNumber(row: GlDetailRow) {
  const raw = payloadValue(row.raw_payload, ["entrynumber", "entry_number", "EntryNumber", "Boekstuk"]);
  const value = String(raw ?? "").trim();
  return value || null;
}

function exactDocumentUrl(row: GlDetailRow) {
  const rawUrl = payloadValue(row.raw_payload, ["exact_document_url", "ExactDocumentUrl", "document_url", "DocumentUrl"]);
  const url = String(rawUrl ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;

  const rawDocumentId = payloadValue(row.raw_payload, ["exact_document_id", "Document", "document"]);
  const documentId = String(rawDocumentId ?? "").trim();
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function isMollieClearingGlRow(row: GlDetailRow) {
  const accountCode = String(row.account_code ?? "");
  const accountDescription = String(
    payloadValue(row.raw_payload, [
      "glaccountcodedescriptiondescription",
      "gl_account_code_description_description",
      "grootboekrekening_omschrijving",
    ]) ?? "",
  ).toLowerCase();
  return accountCode === "1258" || accountDescription.includes("mollie");
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
): PlRow {
  return { key, label, section, level, kind, valueFormat, values, ytd: ytd ?? sumValues(values, months), detailByPeriod };
}

function blankValues(months: string[]) {
  return Object.fromEntries(months.map((period) => [period, 0]));
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

function addSet(map: Map<string, Set<string>>, key: string, value: string) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
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

function AmountCell({
  value,
  valueFormat = "currency",
  strong = false,
  toneBySign = false,
  onClick,
}: {
  value: number;
  valueFormat?: "currency" | "percentage";
  strong?: boolean;
  toneBySign?: boolean;
  onClick?: () => void;
}) {
  const tone = toneBySign && Math.abs(value) > 0.01 ? (value > 0 ? "text-emerald-700" : "text-destructive") : "";
  const className = `px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone}`;
  const formatted = valueFormat === "percentage" ? formatPercentage(value) : formatEUR(value);
  if (!onClick) return <td className={className}>{formatted}</td>;
  return (
    <td className={className}>
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

function EmptyDetails() {
  return <div className="py-8 text-center text-sm text-muted-foreground">Geen onderliggende transacties gevonden.</div>;
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 1 - index));
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
  const rawDate = payloadValue(row.raw_payload, ["EntryDate", "entrydate", "entry_date", "Datum", "Boekdatum"]);
  return formatLooseDate(rawDate) ?? formatLooseDate(row.transaction_date) ?? formatDateNL(row.transaction_date);
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
  return value.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
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
