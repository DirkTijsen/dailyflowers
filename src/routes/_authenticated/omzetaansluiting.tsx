import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, monthLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/omzetaansluiting")({
  head: () => ({ meta: [{ title: "Omzetaansluiting Exact <> App Data - Daily Flowers" }] }),
  component: RevenueReconciliationPage,
});

type GlAccount = {
  account_code: string;
  statement_type: string | null;
  active: boolean;
};

type GlMonthlyRow = {
  period: string;
  account_code: string;
  pl_section: string | null;
  amount: number | string | null;
};

type SalesActualRow = {
  period: string;
  net_total: number | string | null;
};

type ReconciliationRow = {
  period: string;
  gl: number;
  own: number;
  diff: number;
};

function RevenueReconciliationPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const periods = useMemo(() => yearPeriods(year), [year]);

  const accountsQ = useQuery({
    queryKey: ["omzetaansluiting-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
        .select("account_code,statement_type,active");
      if (error) throw error;
      return (data ?? []) as GlAccount[];
    },
  });

  const glQ = useQuery({
    queryKey: ["omzetaansluiting-gl", periods],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_gl_monthly_account")
        .select("period,account_code,pl_section,amount")
        .in("period", periods);
      if (error) throw error;
      return (data ?? []) as GlMonthlyRow[];
    },
    enabled: periods.length > 0,
  });

  const salesQ = useQuery({
    queryKey: ["omzetaansluiting-sales", periods],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_monthly_revenue_actuals")
        .select("period,net_total")
        .in("period", periods);
      if (error) throw error;
      return (data ?? []) as SalesActualRow[];
    },
    enabled: periods.length > 0,
  });

  const rows = useMemo(
    () => buildRows(periods, accountsQ.data ?? [], glQ.data ?? [], salesQ.data ?? []),
    [accountsQ.data, glQ.data, periods, salesQ.data],
  );

  const totals = rows.reduce(
    (sum, row) => ({
      gl: sum.gl + row.gl,
      own: sum.own + row.own,
      diff: sum.diff + row.diff,
    }),
    { gl: 0, own: 0, diff: 0 },
  );

  const loading = accountsQ.isLoading || glQ.isLoading || salesQ.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Omzetaansluiting Exact &lt;&gt; App Data</h1>
          <p className="text-sm text-muted-foreground">
            Grootboekomzet uit Exact naast de eigen omzetactuals uit de app-data per maand.
          </p>
        </div>
        <div className="w-[140px]">
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Grootboek omzet" value={formatEUR(totals.gl)} />
        <MetricCard title="Eigen omzet ex btw" value={formatEUR(totals.own)} />
        <MetricCard title="Totaal verschil" value={formatEUR(totals.diff)} toneBySign />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzetaansluiting Exact &lt;&gt; App Data</CardTitle>
          <CardDescription>
            Eigen omzet ex btw komt uit `vw_monthly_revenue_actuals`; dit is dezelfde app-data die
            in W&V en Omzet monitoring wordt gebruikt.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 text-right font-medium">Grootboek omzet</th>
                  <th className="px-3 py-2 text-right font-medium">Eigen omzet ex btw</th>
                  <th className="px-3 py-2 text-right font-medium">Totaal verschil</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      Omzetaansluiting laden...
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((row) => (
                    <tr key={row.period} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums">{monthLabel(row.period)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.gl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.own)}</td>
                      <td className={moneyDeltaClass(row.diff)}>{formatEUR(row.diff)}</td>
                    </tr>
                  ))}
              </tbody>
              {!loading && (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-2">Totaal</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(totals.gl)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(totals.own)}</td>
                    <td className={moneyDeltaClass(totals.diff, true)}>
                      {formatEUR(totals.diff)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildRows(
  periods: string[],
  accounts: GlAccount[],
  glRows: GlMonthlyRow[],
  salesRows: SalesActualRow[],
): ReconciliationRow[] {
  const accountsByCode = new Map(accounts.map((account) => [account.account_code, account]));
  const glByPeriod = new Map<string, number>();
  const ownByPeriod = new Map<string, number>();

  for (const row of glRows) {
    const account = accountsByCode.get(row.account_code);
    if (account && account.active === false) continue;
    const statement = String(account?.statement_type ?? "").toLowerCase();
    if (statement && !statement.includes("winst")) continue;
    if (row.pl_section !== "revenue") continue;
    add(glByPeriod, row.period, -Number(row.amount ?? 0));
  }

  for (const row of salesRows) {
    add(ownByPeriod, row.period, Number(row.net_total ?? 0));
  }

  return periods.map((period) => {
    const gl = glByPeriod.get(period) ?? 0;
    const own = ownByPeriod.get(period) ?? 0;
    return {
      period,
      gl,
      own,
      diff: gl - own,
    };
  });
}

function MetricCard({
  title,
  value,
  toneBySign = false,
}: {
  title: string;
  value: string;
  toneBySign?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-3xl font-semibold tabular-nums ${
            toneBySign ? moneyToneClass(value) : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function moneyDeltaClass(value: number, strong = false) {
  const tone = value < -0.005 ? "text-red-600" : value > 0.005 ? "text-emerald-700" : "";
  return `px-3 py-2 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone}`;
}

function moneyToneClass(value: string) {
  if (value.includes("-")) return "text-red-600";
  if (!value.includes("0,00")) return "text-emerald-700";
  return "";
}

function add(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function yearPeriods(year: string) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => String(current + 1 - index));
}
