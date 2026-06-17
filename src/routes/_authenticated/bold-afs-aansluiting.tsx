import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeNL, formatEUR, monthLabel } from "@/lib/format";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bold-afs-aansluiting")({
  head: () => ({ meta: [{ title: "Bold/AFS Aansluiting - Daily Flowers" }] }),
  component: BoldAfsReconciliationPage,
});

type ReconciliationRow = {
  period: string;
  sales_paid_count: number;
  mollie_paid_count: number;
  paid_count_diff: number;
  sales_paid_gross: number;
  mollie_paid_gross: number;
  paid_gross_diff: number;
  sales_all_count: number;
  mollie_all_count: number;
  all_count_diff: number;
  sales_all_gross: number;
  mollie_all_gross: number;
  all_gross_diff: number;
  mollie_parse_error_count: number;
  mollie_linked_sales_count: number;
  matched_paid_count: number;
  matched_paid_gross: number;
  bold_unmatched_paid_count: number;
  bold_unmatched_paid_gross: number;
  mollie_unmatched_paid_count: number;
  mollie_unmatched_paid_gross: number;
  sales_zero_paid_count: number;
  mollie_non_bold_paid_count: number;
  mollie_non_bold_paid_gross: number;
  mollie_outside_bold_paid_count: number;
  mollie_outside_bold_paid_gross: number;
  mollie_duplicate_candidate_count: number;
  paid_reconciled: boolean;
};

type IssueRow = {
  issue_type: "bold_missing_mollie" | "mollie_extra" | "mollie_duplicate_candidate";
  period: string;
  occurred_at: string | null;
  amount_gross: number | string;
  reference: string | null;
  product_name: string | null;
  machine_name: string | null;
  payment_id: string | null;
  sales_transaction_id: string | null;
  description_raw: string | null;
  duplicate_count: number | null;
};

function BoldAfsReconciliationPage() {
  const monthlyQ = useQuery({
    queryKey: ["bold-afs-reconciliation"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_bold_mollie_monthly_reconciliation")
        .select("*")
        .gte("period", "2026-01")
        .order("period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReconciliationRow[];
    },
  });

  const issuesQ = useQuery({
    queryKey: ["bold-afs-reconciliation-issues"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_bold_mollie_reconciliation_issues")
        .select("*")
        .gte("period", "2026-01")
        .order("period", { ascending: false })
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as IssueRow[];
    },
  });

  const rows = monthlyQ.data ?? [];
  const issues = issuesQ.data ?? [];
  const openMatchCount = rows.reduce(
    (sum, row) => sum + Number(row.bold_unmatched_paid_count) + Number(row.mollie_unmatched_paid_count),
    0,
  );
  const outsideBoldCount = rows.reduce((sum, row) => sum + Number(row.mollie_outside_bold_paid_count), 0);
  const duplicateCount = rows.reduce((sum, row) => sum + Number(row.mollie_duplicate_candidate_count), 0);
  const zeroSalesCount = rows.reduce((sum, row) => sum + Number(row.sales_zero_paid_count), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bold/AFS Aansluiting</h1>
        <p className="text-sm text-muted-foreground">
          Matchcontrole tussen de Bold-export en herkenbare AFS-betalingen in Mollie.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard title="Open matchverschil" value={openMatchCount} tone={openMatchCount ? "bad" : "ok"} />
        <SummaryCard title="Mollie buiten Bold-export" value={outsideBoldCount} />
        <SummaryCard title="Mollie duplicaatkandidaten" value={duplicateCount} tone={duplicateCount ? "bad" : "ok"} />
        <SummaryCard title="Bold nulbedrag betaald" value={zeroSalesCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maandelijkse match</CardTitle>
          <CardDescription>
            Bold is hier de verwachte bron. Mollie telt alleen mee als de oude AFS-datumomschrijving
            herkend wordt en binnen de dekking van de Bold-export valt.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Bold verwacht</th>
                  <th className="px-3 py-2 font-medium text-right">Mollie herkenbaar</th>
                  <th className="px-3 py-2 font-medium text-right">Gematcht</th>
                  <th className="px-3 py-2 font-medium text-right">Bold mist Mollie</th>
                  <th className="px-3 py-2 font-medium text-right">Mollie extra</th>
                  <th className="px-3 py-2 font-medium text-right">Verschil bruto</th>
                  <th className="px-3 py-2 font-medium text-right">Nulbedrag</th>
                  <th className="px-3 py-2 font-medium text-right">Buiten export</th>
                  <th className="px-3 py-2 font-medium text-right">Duplicaat</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {monthlyQ.isLoading && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                      Laden...
                    </td>
                  </tr>
                )}
                {rows.length === 0 && !monthlyQ.isLoading && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                      Geen aansluiting gevonden.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const reconciled = Boolean(row.paid_reconciled);
                  const hasIssue =
                    Number(row.bold_unmatched_paid_count) > 0 ||
                    Number(row.mollie_unmatched_paid_count) > 0 ||
                    Number(row.mollie_duplicate_candidate_count) > 0;
                  return (
                    <tr key={row.period} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{monthLabel(row.period)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={reconciled && !hasIssue ? "secondary" : "destructive"}>
                          {reconciled && !hasIssue ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 mr-1" />
                          )}
                          {reconciled && !hasIssue ? "OK" : "Controle"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.sales_paid_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.mollie_paid_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.matched_paid_count}</td>
                      <td className={diffClass(row.bold_unmatched_paid_count)}>
                        {row.bold_unmatched_paid_count}
                      </td>
                      <td className={diffClass(row.mollie_unmatched_paid_count)}>
                        {row.mollie_unmatched_paid_count}
                      </td>
                      <td className={diffClass(row.paid_gross_diff)}>
                        {formatEUR(row.paid_gross_diff)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.sales_zero_paid_count}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.mollie_outside_bold_paid_count}
                      </td>
                      <td className={diffClass(row.mollie_duplicate_candidate_count)}>
                        {row.mollie_duplicate_candidate_count}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/mollie-transacties?period=${row.period}`}>
                            Mollie
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
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
          <CardTitle className="text-base">Open posten</CardTitle>
          <CardDescription>
            De eerste 100 posten die niet exact in de maandmatch vallen of als Mollie-duplicaat
            verdacht zijn.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Moment</th>
                  <th className="px-3 py-2 font-medium text-right">Bedrag</th>
                  <th className="px-3 py-2 font-medium">Referentie</th>
                  <th className="px-3 py-2 font-medium">Context</th>
                </tr>
              </thead>
              <tbody>
                {issuesQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Laden...
                    </td>
                  </tr>
                )}
                {issues.length === 0 && !issuesQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Geen open posten.
                    </td>
                  </tr>
                )}
                {issues.map((issue, index) => (
                  <tr
                    key={`${issue.issue_type}-${issue.reference ?? index}-${issue.occurred_at ?? index}`}
                    className="border-t"
                  >
                    <td className="px-3 py-2">
                      <IssueBadge issue={issue} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTimeNL(issue.occurred_at)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEUR(issue.amount_gross)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{issue.reference ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-xl truncate">
                        {issue.product_name || issue.description_raw || "-"}
                      </div>
                      {issue.machine_name && (
                        <div className="text-xs text-muted-foreground">{issue.machine_name}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informatieve totalen</CardTitle>
          <CardDescription>
            Deze totalen tonen alle statussen uit beide bronnen en zijn bedoeld als brede
            plausibiliteitscheck naast de betaalde match.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 font-medium text-right">Bold alle statussen</th>
                  <th className="px-3 py-2 font-medium text-right">Mollie alle statussen</th>
                  <th className="px-3 py-2 font-medium text-right">Verschil aantal</th>
                  <th className="px-3 py-2 font-medium text-right">Bold bruto</th>
                  <th className="px-3 py-2 font-medium text-right">Mollie bruto</th>
                  <th className="px-3 py-2 font-medium text-right">Verschil bruto</th>
                  <th className="px-3 py-2 font-medium text-right">Niet geparsed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.period} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{monthLabel(row.period)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.sales_all_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.mollie_all_count}</td>
                    <td className={diffClass(row.all_count_diff)}>
                      {formatSignedNumber(row.all_count_diff)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.sales_all_gross)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatEUR(row.mollie_all_gross)}
                    </td>
                    <td className={diffClass(row.all_gross_diff)}>{formatEUR(row.all_gross_diff)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.mollie_parse_error_count}
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

function SummaryCard({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: number;
  tone?: "neutral" | "ok" | "bad";
}) {
  const color =
    tone === "bad" ? "text-destructive" : tone === "ok" ? "text-emerald-700" : "text-foreground";
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

function IssueBadge({ issue }: { issue: IssueRow }) {
  switch (issue.issue_type) {
    case "bold_missing_mollie":
      return <Badge variant="destructive">Bold mist Mollie</Badge>;
    case "mollie_extra":
      return <Badge variant="destructive">Mollie extra</Badge>;
    case "mollie_duplicate_candidate":
      return (
        <Badge variant="destructive">
          Duplicaat {issue.duplicate_count ? `x${issue.duplicate_count}` : ""}
        </Badge>
      );
  }
}

function diffClass(value: number | string) {
  const numeric = Number(value);
  const base = "px-3 py-2 text-right tabular-nums";
  return Math.abs(numeric) > 0.01 ? `${base} text-destructive font-medium` : `${base} text-muted-foreground`;
}

function formatSignedNumber(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric > 0 ? `+${numeric}` : String(numeric);
}
