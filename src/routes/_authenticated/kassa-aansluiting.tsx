import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateNL, formatDateTimeNL, formatEUR, monthLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/kassa-aansluiting")({
  head: () => ({ meta: [{ title: "Kassa aansluiting - Daily Flowers" }] }),
  component: CashReconciliationPage,
});

type MonthlyRow = {
  period: string;
  cash_order_count: number;
  cash_sales_amount: number | string;
  pos_order_amount: number | string;
  shopify_payment_amount: number | string;
  cash_orders_without_session: number;
  session_count: number;
  open_session_count: number;
  discrepancy_amount: number | string;
  exact_geldmaat_count: number;
  exact_geldmaat_amount: number | string;
  cash_minus_exact: number | string;
  cash_after_discrepancy_minus_exact: number | string;
};

type DailyRow = MonthlyRow & {
  business_date: string;
};

type OrderRow = {
  order_summary_id: string;
  external_id: string;
  order_name: string | null;
  financial_status: string | null;
  processed_at: string | null;
  business_date: string;
  order_amount: number | string;
  shopify_payment_amount: number | string;
  cash_amount: number | string;
  cash_match_status: string;
  location_name: string | null;
  register_id: string | null;
  session_start: string | null;
  session_end: string | null;
  session_status: string | null;
};

type ExactRow = {
  gl_transaction_id: string;
  transaction_date: string;
  account_code: string | null;
  description: string | null;
  document_number: string | null;
  exact_amount: number | string;
  exact_document_url: string | null;
};

function CashReconciliationPage() {
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("all");

  const periodStart = `${year}-01`;
  const periodEnd = `${year}-12`;
  const selectedPeriod = month === "all" ? null : `${year}-${month}`;

  const monthlyQ = useQuery({
    queryKey: ["shopify-cash-monthly", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_cash_monthly_reconciliation")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("period", { ascending: false });
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });

  const dailyQ = useQuery({
    queryKey: ["shopify-cash-daily", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_cash_daily_reconciliation")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("business_date", { ascending: false })
        .limit(120);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DailyRow[];
    },
  });

  const orderQ = useQuery({
    queryKey: ["shopify-cash-orders", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_cash_order_reconciliation")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .neq("cash_match_status", "fully_shopify_payments")
        .order("processed_at", { ascending: false, nullsFirst: false })
        .limit(250);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const exactQ = useQuery({
    queryKey: ["shopify-cash-exact", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_cash_exact_geldmaat")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("transaction_date", { ascending: false })
        .limit(100);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExactRow[];
    },
  });

  const totals = useMemo(() => {
    return (monthlyQ.data ?? []).reduce(
      (acc, row) => ({
        cash: acc.cash + Number(row.cash_sales_amount ?? 0),
        exact: acc.exact + Number(row.exact_geldmaat_amount ?? 0),
        discrepancy: acc.discrepancy + Number(row.discrepancy_amount ?? 0),
        ordersWithoutSession: acc.ordersWithoutSession + Number(row.cash_orders_without_session ?? 0),
        openSessions: acc.openSessions + Number(row.open_session_count ?? 0),
      }),
      { cash: 0, exact: 0, discrepancy: 0, ordersWithoutSession: 0, openSessions: 0 },
    );
  }, [monthlyQ.data]);

  const cashAfterDiscrepancy = totals.cash + totals.discrepancy;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kassa aansluiting</h1>
          <p className="text-sm text-muted-foreground">
            Contante winkelbetalingen als rest tussen POS-orders en Shopify Payments, aangesloten met kassasessies en Geldmaat in Exact.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Field label="Jaar">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["2026", "2025", "2024"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Periode">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle maanden</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((value) => (
                  <SelectItem key={value} value={value}>
                    {monthLabel(`${year}-${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <SummaryCard title="Contant / extern uit orders" value={formatEUR(totals.cash)} />
        <SummaryCard title="Kasverschillen sessies" value={formatEUR(totals.discrepancy)} tone={totals.discrepancy} />
        <SummaryCard title="Geldmaat Exact" value={formatEUR(totals.exact)} />
        <SummaryCard title="Rest na kasverschil" value={formatEUR(cashAfterDiscrepancy - totals.exact)} tone={cashAfterDiscrepancy - totals.exact} />
      </div>

      {(totals.ordersWithoutSession > 0 || totals.openSessions > 0) && (
        <Card>
          <CardContent className="flex flex-wrap gap-3 py-4 text-sm">
            {totals.ordersWithoutSession > 0 && (
              <Badge variant="destructive">{totals.ordersWithoutSession} cash orders zonder kassasessie</Badge>
            )}
            {totals.openSessions > 0 && <Badge variant="secondary">{totals.openSessions} open kassasessies</Badge>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Maand aansluiting</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <Th>Periode</Th>
                <Th right>Cash orders</Th>
                <Th right>Cash bedrag</Th>
                <Th right>Kasverschil</Th>
                <Th right>Geldmaat</Th>
                <Th right>Rest</Th>
                <Th right>Sessies</Th>
                <Th right>Zonder sessie</Th>
              </tr>
            </thead>
            <tbody>
              {(monthlyQ.data ?? []).map((row) => (
                <tr key={row.period} className="border-b">
                  <Td>{monthLabel(row.period)}</Td>
                  <Td right>{row.cash_order_count}</Td>
                  <Td right>{formatEUR(row.cash_sales_amount)}</Td>
                  <Td right tone={Number(row.discrepancy_amount)}>{formatEUR(row.discrepancy_amount)}</Td>
                  <Td right>{formatEUR(row.exact_geldmaat_amount)}</Td>
                  <Td right tone={Number(row.cash_after_discrepancy_minus_exact)}>
                    {formatEUR(row.cash_after_discrepancy_minus_exact)}
                  </Td>
                  <Td right>{row.session_count}</Td>
                  <Td right tone={Number(row.cash_orders_without_session)}>{row.cash_orders_without_session}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dag aansluiting</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <Th>Datum</Th>
                <Th right>Cash orders</Th>
                <Th right>Cash bedrag</Th>
                <Th right>Kasverschil</Th>
                <Th right>Geldmaat</Th>
                <Th right>Rest</Th>
                <Th right>Sessies</Th>
                <Th right>Open</Th>
              </tr>
            </thead>
            <tbody>
              {(dailyQ.data ?? []).map((row) => (
                <tr key={row.business_date} className="border-b">
                  <Td>{formatDateNL(row.business_date)}</Td>
                  <Td right>{row.cash_order_count}</Td>
                  <Td right>{formatEUR(row.cash_sales_amount)}</Td>
                  <Td right tone={Number(row.discrepancy_amount)}>{formatEUR(row.discrepancy_amount)}</Td>
                  <Td right>{formatEUR(row.exact_geldmaat_amount)}</Td>
                  <Td right tone={Number(row.cash_after_discrepancy_minus_exact)}>
                    {formatEUR(row.cash_after_discrepancy_minus_exact)}
                  </Td>
                  <Td right>{row.session_count}</Td>
                  <Td right tone={Number(row.open_session_count)}>{row.open_session_count}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cash orders</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <Th>Order</Th>
                  <Th>Moment</Th>
                  <Th right>Order</Th>
                  <Th right>Shopify Payments</Th>
                  <Th right>Cash</Th>
                  <Th>Sessie</Th>
                </tr>
              </thead>
              <tbody>
                {(orderQ.data ?? []).map((row) => (
                  <tr key={row.order_summary_id} className="border-b">
                    <Td>{row.order_name ?? row.external_id}</Td>
                    <Td>{formatDateTimeNL(row.processed_at)}</Td>
                    <Td right>{formatEUR(row.order_amount)}</Td>
                    <Td right>{formatEUR(row.shopify_payment_amount)}</Td>
                    <Td right>{formatEUR(row.cash_amount)}</Td>
                    <Td>
                      {row.cash_match_status === "cash_session_missing" ? (
                        <Badge variant="destructive">Mist</Badge>
                      ) : (
                        <span>{row.register_id ?? "-"}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exact Geldmaat</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <Th>Datum</Th>
                  <Th>Boekstuk</Th>
                  <Th>Omschrijving</Th>
                  <Th right>Bedrag</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {(exactQ.data ?? []).map((row) => (
                  <tr key={row.gl_transaction_id} className="border-b">
                    <Td>{formatDateNL(row.transaction_date)}</Td>
                    <Td>{row.document_number ?? "-"}</Td>
                    <Td>
                      <div className="max-w-sm truncate">{row.description ?? "-"}</div>
                    </Td>
                    <Td right>{formatEUR(row.exact_amount)}</Td>
                    <Td right>
                      {row.exact_document_url && (
                        <a
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          href={row.exact_document_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Exact <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, tone = 0 }: { title: string; value: string; tone?: number }) {
  const toneClass = Math.abs(tone) < 0.01 ? "" : tone > 0 ? "text-emerald-700" : "text-destructive";
  return (
    <Card>
      <CardContent className="py-5">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({
  children,
  right = false,
  tone,
}: {
  children?: ReactNode;
  right?: boolean;
  tone?: number;
}) {
  const toneClass =
    tone === undefined || Math.abs(tone) < 0.01 ? "" : tone > 0 ? "text-emerald-700" : "text-destructive";
  return <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${toneClass}`}>{children}</td>;
}
