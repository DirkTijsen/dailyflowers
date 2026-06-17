import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDateTimeNL, channelLabels, statusLabels } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transacties/$id")({
  head: () => ({ meta: [{ title: "Verkooptransactie - Daily Flowers" }] }),
  component: TxDetail,
});

function TxDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["tx", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, machines(display_name,afs_number,machine_id)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <p className="text-muted-foreground">Laden…</p>;
  if (!q.data) return <p className="text-muted-foreground">Niet gevonden.</p>;
  const t: any = q.data;

  const fields: Array<[string, React.ReactNode]> = [
    ["Externe ID", t.external_id],
    ["Bron", t.source],
    ["Kanaal", channelLabels[t.channel] ?? t.channel],
    ["Machine", t.machines?.display_name ?? "—"],
    ["AFS-code", t.machines?.afs_number ?? "—"],
    ["Machine-ID", t.machines?.machine_id ?? "—"],
    ["Artikelnummer", t.article_number ?? "—"],
    ["Productnaam", t.product_name ?? "—"],
    ["Factuurnummer", t.invoice_number ?? "—"],
    ["Status", <Badge variant={t.status === "paid" ? "default" : "secondary"}>{statusLabels[t.status] ?? t.status}</Badge>],
    ["Parse-status", t.parse_status === "ok" ? <Badge variant="secondary">OK</Badge> : <Badge variant="destructive">Parse-fout</Badge>],
    ["Betaald op", formatDateTimeNL(t.paid_at)],
    ["Bruto (incl. btw)", formatEUR(t.amount_gross)],
    ["Netto", formatEUR(t.amount_net)],
    ["Btw", formatEUR(t.vat_amount)],
    ["Btw-tarief", t.vat_rate ? `${t.vat_rate}%` : "—"],
    ["Korting", t.discount_amount ? formatEUR(t.discount_amount) : "—"],
    ["Originele omschrijving", t.description_raw ? <code className="text-xs bg-muted px-1 py-0.5 rounded">{t.description_raw}</code> : "—"],
    ["Factuur-URL", t.invoice_url ? <a className="text-primary underline" href={t.invoice_url} target="_blank" rel="noreferrer">Open</a> : "—"],
  ];
  if (t.parse_error_message) fields.push(["Parse-foutmelding", <span className="text-destructive text-sm">{t.parse_error_message}</span>]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link to="/transacties"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Terug</Button></Link>
        <h1 className="text-2xl font-semibold">Verkooptransactie</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y">
            {fields.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[200px_1fr] gap-2 py-2 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Ruwe payload</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[400px]">{JSON.stringify(t.raw_payload, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
