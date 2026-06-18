import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelLabels, formatDateNL, formatDateTimeNL, formatEUR, monthLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/shopify-betalingen")({
  head: () => ({ meta: [{ title: "Shopify betalingen - Daily Flowers" }] }),
  component: ShopifyPaymentsPage,
});

type SyncStateRow = {
  channel: string;
  last_sweep_at: string | null;
  last_sweep_status: string | null;
  last_sweep_message: string | null;
  records_processed: number | null;
  updated_at: string | null;
};

type MonthlyRow = {
  period: string;
  payout_count: number;
  paid_payout_count: number;
  exact_matched_payout_count: number;
  exact_missing_payout_count: number;
  payout_with_missing_orders_count: number;
  payout_amount: number | string;
  balance_gross_amount: number | string;
  balance_fee_amount: number | string;
  balance_net_amount: number | string;
  payout_balance_diff: number | string;
  exact_amount: number | string;
  exact_amount_diff: number | string;
  balance_tx_count: number;
  charge_count: number;
  refund_count: number;
  adjustment_count: number;
  matched_order_count: number;
  missing_order_count: number;
};

type PayoutRow = {
  period: string;
  payout_row_id: string;
  shop_domain: string;
  payout_id: string;
  payout_status: string | null;
  payout_date: string | null;
  currency: string | null;
  payout_amount: number | string;
  balance_gross_amount: number | string;
  balance_fee_amount: number | string;
  balance_net_amount: number | string;
  payout_balance_diff: number | string;
  order_reference_count: number;
  matched_order_count: number;
  missing_order_count: number;
  exact_gl_transaction_id: string | null;
  exact_transaction_date: string | null;
  exact_account_code: string | null;
  exact_description: string | null;
  exact_document_number: string | null;
  exact_amount: number | string | null;
  exact_raw_payload: Record<string, unknown> | null;
  exact_candidate_count: number;
  exact_amount_diff: number | string | null;
  exact_match_status: string;
};

type TraceRow = {
  balance_row_id: string;
  balance_transaction_id: string;
  balance_type: string | null;
  balance_processed_at: string | null;
  payout_id: string | null;
  balance_amount: number | string;
  balance_fee: number | string;
  balance_net: number | string;
  source_order_id: string | null;
  source_order_transaction_id: string | null;
  order_name: string | null;
  order_number: string | null;
  channel: string | null;
  financial_status: string | null;
  order_current_total_price: number | string | null;
  payout_date: string | null;
  exact_gl_transaction_id: string | null;
  exact_document_number: string | null;
  exact_raw_payload: Record<string, unknown> | null;
  exact_match_status: string | null;
  trace_status: string;
};

type IssueRow = {
  issue_type: string;
  period: string | null;
  occurred_at: string | null;
  amount: number | string | null;
  order_name: string | null;
  order_number: string | null;
  payout_id: string | null;
  balance_transaction_id: string | null;
  source_order_id: string | null;
  exact_document_number: string | null;
  exact_description: string | null;
  note: string | null;
};

type OrderCoverageMonthlyRow = {
  period: string;
  channel: string;
  order_count: number;
  paid_order_count: number;
  open_order_count: number;
  order_amount: number | string;
  paid_amount: number | string;
  shopify_payments_amount: number | string;
  cash_amount: number | string;
  other_payment_amount: number | string;
  payment_difference: number | string;
  no_transaction_count: number;
  underpaid_count: number;
  overpaid_count: number;
  amount_covered_status_open_count: number;
};

type OrderPaymentIssueRow = {
  issue_type: string;
  period: string | null;
  occurred_at: string | null;
  order_amount: number | string;
  paid_amount: number | string;
  payment_difference: number | string;
  order_name: string | null;
  order_number: string | null;
  channel: string | null;
  financial_status: string | null;
  payment_gateways: string | null;
  transaction_count: number;
  last_payment_at: string | null;
};

const paymentSections = [
  { id: "betaalcontrole-orders", label: "Betaalcontrole alle Shopify orders" },
  { id: "open-order-betaalpunten", label: "Open Shopify order-betaalpunten" },
  { id: "maandaansluiting-payments", label: "Maandaansluiting Shopify Payments" },
  { id: "payouts-exact", label: "Payouts naar Exact" },
  { id: "open-punten", label: "Open punten" },
] as const;

function ShopifyPaymentsPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("all");
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const periodStart = `${year}-01`;
  const periodEnd = `${year}-12`;
  const selectedPeriod = month === "all" ? null : `${year}-${month}`;

  const syncQ = useQuery({
    queryKey: ["sync_state", "shopify_payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sync_state")
        .select(
          "channel,last_sweep_at,last_sweep_status,last_sweep_message,records_processed,updated_at",
        )
        .eq("channel", "shopify_payments")
        .maybeSingle();
      if (error) throw error;
      return data as SyncStateRow | null;
    },
    refetchInterval: (query) => (query.state.data?.last_sweep_status === "running" ? 5000 : false),
  });

  const monthlyQ = useQuery({
    queryKey: ["shopify-payments-monthly", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_payments_monthly_reconciliation")
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

  const payoutsQ = useQuery({
    queryKey: ["shopify-payout-reconciliation", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_payout_reconciliation")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("payout_date", { ascending: false, nullsFirst: false })
        .limit(250);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PayoutRow[];
    },
  });

  const selectedPayout = useMemo(() => {
    const rows = payoutsQ.data ?? [];
    return rows.find((row) => row.payout_id === selectedPayoutId) ?? rows[0] ?? null;
  }, [payoutsQ.data, selectedPayoutId]);

  const traceQ = useQuery({
    queryKey: ["shopify-payment-trace", selectedPayout?.payout_id],
    enabled: Boolean(selectedPayout?.payout_id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_shopify_order_payment_trace")
        .select("*")
        .eq("payout_id", selectedPayout?.payout_id)
        .neq("balance_type", "payout")
        .order("balance_processed_at", { ascending: false, nullsFirst: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as TraceRow[];
    },
  });

  const issuesQ = useQuery({
    queryKey: ["shopify-payment-issues", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_payment_issues")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IssueRow[];
    },
  });

  const orderCoverageMonthlyQ = useQuery({
    queryKey: ["shopify-order-payment-coverage-monthly", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_order_payment_coverage_monthly")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("period", { ascending: true })
        .order("channel", { ascending: true });
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderCoverageMonthlyRow[];
    },
  });

  const orderPaymentIssuesQ = useQuery({
    queryKey: ["shopify-order-payment-issues", year, month],
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_shopify_order_payment_issues")
        .select("*")
        .gte("period", periodStart)
        .lte("period", periodEnd)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(150);
      if (selectedPeriod) q = q.eq("period", selectedPeriod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderPaymentIssueRow[];
    },
  });

  const totals = useMemo(() => {
    const rows = monthlyQ.data ?? [];
    return rows.reduce(
      (acc, row) => ({
        payoutAmount: acc.payoutAmount + Number(row.payout_amount ?? 0),
        exactAmount: acc.exactAmount + Number(row.exact_amount ?? 0),
        exactDiff: acc.exactDiff + Number(row.exact_amount_diff ?? 0),
        balanceDiff: acc.balanceDiff + Number(row.payout_balance_diff ?? 0),
        missingOrders: acc.missingOrders + Number(row.missing_order_count ?? 0),
        missingExact: acc.missingExact + Number(row.exact_missing_payout_count ?? 0),
      }),
      {
        payoutAmount: 0,
        exactAmount: 0,
        exactDiff: 0,
        balanceDiff: 0,
        missingOrders: 0,
        missingExact: 0,
      },
    );
  }, [monthlyQ.data]);

  const orderCoverageTotals = useMemo(() => {
    const rows = orderCoverageMonthlyQ.data ?? [];
    return rows.reduce(
      (acc, row) => ({
        orders: acc.orders + Number(row.order_count ?? 0),
        paidOrders: acc.paidOrders + Number(row.paid_order_count ?? 0),
        openOrders: acc.openOrders + Number(row.open_order_count ?? 0),
        orderAmount: acc.orderAmount + Number(row.order_amount ?? 0),
        paidAmount: acc.paidAmount + Number(row.paid_amount ?? 0),
        difference: acc.difference + Number(row.payment_difference ?? 0),
      }),
      { orders: 0, paidOrders: 0, openOrders: 0, orderAmount: 0, paidAmount: 0, difference: 0 },
    );
  }, [orderCoverageMonthlyQ.data]);

  async function syncPayments() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-order-payments-sync");
      if (error) throw error;
      toast.success("Shopify orders en betalingen sync gestart", {
        description: (data as { message?: string } | null)?.message,
      });
      qc.invalidateQueries({ queryKey: ["sync_state"] });
      qc.invalidateQueries({ queryKey: ["shopify-payments-monthly"] });
      qc.invalidateQueries({ queryKey: ["shopify-payout-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["shopify-payment-trace"] });
      qc.invalidateQueries({ queryKey: ["shopify-payment-issues"] });
      qc.invalidateQueries({ queryKey: ["shopify-order-payment-coverage-monthly"] });
      qc.invalidateQueries({ queryKey: ["shopify-order-payment-issues"] });
    } catch (error) {
      toast.error("Shopify orders en betalingen sync mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Shopify betalingen</h1>
          <p className="text-sm text-muted-foreground">
            Trace van Shopify orders naar Shopify Payments uitbetalingen en de ontvangsten in Exact.
          </p>
        </div>
        <Button variant="outline" onClick={syncPayments} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          Shopify sync
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 lg:grid-cols-[1fr_1fr_1fr_1fr_180px_180px]">
          <MiniStatus label="Status" value={syncStatusLabel(syncQ.data)} />
          <MiniStatus label="Laatste run" value={formatDateTimeNL(syncQ.data?.last_sweep_at)} />
          <MiniStatus label="Regels verwerkt" value={String(syncQ.data?.records_processed ?? 0)} />
          <MiniStatus label="Melding" value={syncQ.data?.last_sweep_message ?? "-"} />
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
          <div>
            <label className="text-xs text-muted-foreground">Periode</label>
            <Select
              value={month}
              onValueChange={(value) => {
                setMonth(value);
                setSelectedPayoutId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle maanden</SelectItem>
                {Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1).padStart(2, "0");
                  return (
                    <SelectItem key={value} value={value}>
                      {monthName(index)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <nav className="sticky top-14 z-10 -mx-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur">
        <div className="flex min-w-max gap-2">
          {paymentSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard title="Shopify orders" value={String(orderCoverageTotals.orders)} />
        <SummaryCard title="Betaald rondgelopen" value={String(orderCoverageTotals.paidOrders)} />
        <SummaryCard
          title="Open orders"
          value={String(orderCoverageTotals.openOrders)}
          tone={orderCoverageTotals.openOrders}
        />
        <SummaryCard
          title="Verschil order <> betaald"
          value={formatEUR(orderCoverageTotals.difference)}
          tone={orderCoverageTotals.difference}
        />
      </div>

      <Card id="betaalcontrole-orders" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-base">Betaalcontrole alle Shopify orders</CardTitle>
          <CardDescription>
            Orderbedrag vergeleken met succesvolle Shopify ordertransacties: Shopify Payments,
            contant en overige gateways.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Betaald</th>
                  <th className="px-3 py-2 text-right font-medium">Open</th>
                  <th className="px-3 py-2 text-right font-medium">Orderbedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Gedekt</th>
                  <th className="px-3 py-2 text-right font-medium">Shopify Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Contant</th>
                  <th className="px-3 py-2 text-right font-medium">Overig</th>
                  <th className="px-3 py-2 text-right font-medium">Verschil</th>
                </tr>
              </thead>
              <tbody>
                {orderCoverageMonthlyQ.isLoading && <EmptyRow colSpan={11} text="Laden..." />}
                {!orderCoverageMonthlyQ.isLoading &&
                  (orderCoverageMonthlyQ.data ?? []).length === 0 && (
                    <EmptyRow
                      colSpan={11}
                      text="Geen Shopify ordertransacties gevonden. Start de Shopify Payments sync."
                    />
                  )}
                {(orderCoverageMonthlyQ.data ?? []).map((row) => (
                  <tr key={`${row.period}-${row.channel}`} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{monthLabel(row.period)}</td>
                    <td className="px-3 py-2">{channelLabels[row.channel] ?? row.channel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.order_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.paid_order_count}</td>
                    <td className={diffClass(row.open_order_count)}>{row.open_order_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.order_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.paid_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.shopify_payments_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.cash_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.other_payment_amount)}
                    </td>
                    <td className={diffClass(row.payment_difference)}>
                      {formatEUR(row.payment_difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card id="open-order-betaalpunten" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-base">Open Shopify order-betaalpunten</CardTitle>
          <CardDescription>
            Orders waarvan bedrag, betaalstatus of ordertransacties nog niet helemaal rondlopen.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Moment</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 font-medium">Gateways</th>
                  <th className="px-3 py-2 text-right font-medium">Orderbedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Betaald</th>
                  <th className="px-3 py-2 text-right font-medium">Verschil</th>
                  <th className="px-3 py-2 font-medium">Shopify status</th>
                </tr>
              </thead>
              <tbody>
                {orderPaymentIssuesQ.isLoading && <EmptyRow colSpan={9} text="Laden..." />}
                {!orderPaymentIssuesQ.isLoading &&
                  (orderPaymentIssuesQ.data ?? []).length === 0 && (
                    <EmptyRow colSpan={9} text="Geen open Shopify order-betaalpunten." />
                  )}
                {(orderPaymentIssuesQ.data ?? []).map((row, index) => (
                  <tr
                    key={`${row.issue_type}-${row.order_number ?? index}`}
                    className="border-t align-top hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <TraceBadge status={row.issue_type} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDateTimeNL(row.occurred_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.order_name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.transaction_count} transactie(s)
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.channel ? (channelLabels[row.channel] ?? row.channel) : "-"}
                    </td>
                    <td className="px-3 py-2">{row.payment_gateways ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.order_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.paid_amount)}
                    </td>
                    <td className={diffClass(row.payment_difference)}>
                      {formatEUR(row.payment_difference)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{row.financial_status ?? "-"}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDateTimeNL(row.last_payment_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard title="Shopify payouts" value={formatEUR(totals.payoutAmount)} />
        <SummaryCard title="Exact ontvangsten" value={formatEUR(totals.exactAmount)} />
        <SummaryCard
          title="Verschil payout <> Exact"
          value={formatEUR(totals.exactDiff)}
          tone={totals.exactDiff}
        />
        <SummaryCard
          title="Open order/payout checks"
          value={String(totals.missingOrders + totals.missingExact)}
          tone={totals.missingOrders + totals.missingExact}
        />
      </div>

      <Card id="maandaansluiting-payments" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-base">Maandaansluiting Shopify Payments</CardTitle>
          <CardDescription>
            Payoutbedragen worden vergeleken met de onderliggende balance transactions en met Exact.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 text-right font-medium">Payouts</th>
                  <th className="px-3 py-2 text-right font-medium">Payout bedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Balance netto</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium">Exact</th>
                  <th className="px-3 py-2 text-right font-medium">Verschil Exact</th>
                  <th className="px-3 py-2 text-right font-medium">Orders gematcht</th>
                  <th className="px-3 py-2 text-right font-medium">Open orders</th>
                  <th className="px-3 py-2 text-right font-medium">Open Exact</th>
                </tr>
              </thead>
              <tbody>
                {monthlyQ.isLoading && <EmptyRow colSpan={10} text="Laden..." />}
                {!monthlyQ.isLoading && (monthlyQ.data ?? []).length === 0 && (
                  <EmptyRow colSpan={10} text="Geen Shopify Payments data gevonden." />
                )}
                {(monthlyQ.data ?? []).map((row) => (
                  <tr key={row.period} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{monthLabel(row.period)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.payout_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.payout_amount)}
                    </td>
                    <td className={diffClass(row.payout_balance_diff)}>
                      {formatEUR(row.balance_net_amount)}
                      <div className="text-[11px] text-muted-foreground">
                        diff {formatEUR(row.payout_balance_diff)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.balance_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.exact_amount)}
                    </td>
                    <td className={diffClass(row.exact_amount_diff)}>
                      {formatEUR(row.exact_amount_diff)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.matched_order_count}</td>
                    <td className={diffClass(row.missing_order_count)}>
                      {row.missing_order_count}
                    </td>
                    <td className={diffClass(row.exact_missing_payout_count)}>
                      {row.exact_missing_payout_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card id="payouts-exact" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-base">Payouts naar Exact</CardTitle>
          <CardDescription>
            Selecteer een payout om de onderliggende Shopify-orderregels te zien.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Payout</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Payout</th>
                  <th className="px-3 py-2 text-right font-medium">Balance netto</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 font-medium">Exact match</th>
                  <th className="px-3 py-2 text-right font-medium">Verschil</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payoutsQ.isLoading && <EmptyRow colSpan={10} text="Laden..." />}
                {!payoutsQ.isLoading && (payoutsQ.data ?? []).length === 0 && (
                  <EmptyRow colSpan={10} text="Geen payouts gevonden." />
                )}
                {(payoutsQ.data ?? []).map((row) => {
                  const selected = selectedPayout?.payout_id === row.payout_id;
                  const documentUrl = exactDocumentUrl(row.exact_raw_payload);
                  return (
                    <tr
                      key={`${row.shop_domain}-${row.payout_id}`}
                      className={`border-t hover:bg-muted/30 ${selected ? "bg-muted/40" : ""}`}
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDateNL(row.payout_date)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.payout_id}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{row.payout_status ?? "-"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.payout_amount)}
                      </td>
                      <td className={diffClass(row.payout_balance_diff)}>
                        {formatEUR(row.balance_net_amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.balance_fee_amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.matched_order_count}/{row.order_reference_count}
                        {row.missing_order_count > 0 && (
                          <div className="text-[11px] text-destructive">
                            {row.missing_order_count} mist
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MatchBadge status={row.exact_match_status} />
                          {documentUrl && (
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
                          )}
                        </div>
                        <div className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground">
                          {row.exact_document_number || row.exact_description || "-"}
                        </div>
                      </td>
                      <td className={diffClass(row.exact_amount_diff ?? 0)}>
                        {formatEUR(row.exact_amount_diff)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant={selected ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setSelectedPayoutId(row.payout_id)}
                        >
                          Trace
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ordertrace {selectedPayout ? `voor payout ${selectedPayout.payout_id}` : ""}
          </CardTitle>
          <CardDescription>
            Elke regel komt uit Shopify Payments balance transactions en linkt terug naar de Shopify
            order.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Moment</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Kanaal</th>
                  <th className="px-3 py-2 text-right font-medium">Order totaal</th>
                  <th className="px-3 py-2 text-right font-medium">Bruto</th>
                  <th className="px-3 py-2 text-right font-medium">Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Netto</th>
                  <th className="px-3 py-2 font-medium">Trace</th>
                  <th className="px-3 py-2 font-medium">Exact</th>
                </tr>
              </thead>
              <tbody>
                {traceQ.isLoading && <EmptyRow colSpan={10} text="Laden..." />}
                {!traceQ.isLoading && (traceQ.data ?? []).length === 0 && (
                  <EmptyRow colSpan={10} text="Selecteer een payout of sync Shopify Payments." />
                )}
                {(traceQ.data ?? []).map((row) => {
                  const documentUrl = exactDocumentUrl(row.exact_raw_payload);
                  return (
                    <tr key={row.balance_row_id} className="border-t align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDateTimeNL(row.balance_processed_at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{row.balance_type ?? "-"}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.order_name ?? "-"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.source_order_id ?? row.balance_transaction_id}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.channel ? (channelLabels[row.channel] ?? row.channel) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.order_current_total_price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.balance_amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.balance_fee)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEUR(row.balance_net)}
                      </td>
                      <td className="px-3 py-2">
                        <TraceBadge status={row.trace_status} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MatchBadge status={row.exact_match_status ?? "exact_missing"} />
                          {documentUrl && (
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
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.exact_document_number ?? "-"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card id="open-punten" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-base">Open punten</CardTitle>
          <CardDescription>Ontbrekende order-, payout- of Exact-koppelingen.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Moment</th>
                  <th className="px-3 py-2 text-right font-medium">Bedrag</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Payout / transactie</th>
                  <th className="px-3 py-2 font-medium">Context</th>
                </tr>
              </thead>
              <tbody>
                {issuesQ.isLoading && <EmptyRow colSpan={6} text="Laden..." />}
                {!issuesQ.isLoading && (issuesQ.data ?? []).length === 0 && (
                  <EmptyRow colSpan={6} text="Geen open punten." />
                )}
                {(issuesQ.data ?? []).map((row, index) => (
                  <tr
                    key={`${row.issue_type}-${row.balance_transaction_id ?? row.source_order_id ?? index}`}
                    className="border-t"
                  >
                    <td className="px-3 py-2">
                      <TraceBadge status={row.issue_type} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDateTimeNL(row.occurred_at)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(row.amount)}</td>
                    <td className="px-3 py-2">
                      <div>{row.order_name ?? "-"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.source_order_id ?? row.order_number ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.payout_id ?? row.balance_transaction_id ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-xl truncate">
                        {row.exact_description ?? row.note ?? "-"}
                      </div>
                      {row.exact_document_number && (
                        <div className="text-xs text-muted-foreground">
                          {row.exact_document_number}
                        </div>
                      )}
                    </td>
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

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, tone = 0 }: { title: string; value: string; tone?: number }) {
  const color = Math.abs(Number(tone)) > 0.01 ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MatchBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Exact OK
      </Badge>
    );
  }
  if (status === "multiple_exact_candidates") {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Meerdere Exact
      </Badge>
    );
  }
  if (status === "not_paid_yet") {
    return <Badge variant="outline">Nog niet uitbetaald</Badge>;
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="mr-1 h-3 w-3" />
      Exact mist
    </Badge>
  );
}

function TraceBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    ok: "OK",
    payout_movement: "Payout",
    order_id_missing: "Order-id mist",
    order_missing: "Order mist",
    payout_missing: "Payout mist",
    exact_missing: "Exact mist",
    order_missing_payment: "Payment mist",
    paid: "Betaald",
    no_transactions: "Geen betaling",
    unpaid: "Onbetaald",
    underpaid: "Onderbetaald",
    overpaid: "Overbetaald",
    amount_covered_status_open: "Bedrag OK, status open",
  };
  const ok = status === "ok" || status === "payout_movement" || status === "paid";
  return <Badge variant={ok ? "secondary" : "destructive"}>{label[status] ?? status}</Badge>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  );
}

function diffClass(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  const base = "px-3 py-2 text-right tabular-nums";
  return Math.abs(numeric) > 0.01
    ? `${base} text-destructive font-medium`
    : `${base} text-muted-foreground`;
}

function syncStatusLabel(state: SyncStateRow | null | undefined) {
  const status = state?.last_sweep_status;
  if (status === "running") return "Draait";
  if (status === "ok") return "Gelukt";
  if (status === "error") return "Fout";
  if (status === "skipped") return "Overgeslagen";
  return "-";
}

function yearOptions() {
  const current = new Date().getFullYear();
  return Array.from(new Set([current, current - 1, current - 2, current + 1].map(String))).sort(
    (a, b) => Number(b) - Number(a),
  );
}

function monthName(index: number) {
  return new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" });
}

function exactDocumentUrl(raw: Record<string, unknown> | null | undefined) {
  const direct = rawText(raw, [
    "exact_document_url",
    "ExactDocumentUrl",
    "document_url",
    "DocumentUrl",
  ]);
  if (/^https?:\/\//i.test(direct)) return direct;
  const documentId = rawText(raw, ["exact_document_id", "Document", "document"]);
  if (!documentId) return null;
  return `https://start.exactonline.nl/docs/DocView.aspx?DocumentID=${encodeURIComponent(documentId)}`;
}

function rawText(raw: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}
