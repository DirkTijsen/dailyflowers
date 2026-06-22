import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/import-csv")({
  head: () => ({ meta: [{ title: "CSV-import — Daily Flowers" }] }),
  component: ImportPage,
});

type Row = Record<string, string>;

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/,/g, "."));
  return isNaN(n) ? 0 : n;
}

function text(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) return cleaned;
  }
  return null;
}

function isoDate(value: string | undefined): string | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function orderNumber(name: string | undefined): string | null {
  return text(name)?.replace(/^#/, "") || null;
}

function taxRatesFromRow(row: Row) {
  return [1, 2, 3, 4, 5]
    .map((idx) => {
      const name = text(row[`Tax ${idx} Name`]);
      const amount = num(row[`Tax ${idx} Value`]);
      const rateMatch = name?.match(/(\d+(?:[.,]\d+)?)\s*%/);
      const rate = rateMatch ? num(rateMatch[1]) : null;
      return name || Math.abs(amount) > 0.004 ? { name, rate, amount: +amount.toFixed(2) } : null;
    })
    .filter(Boolean);
}

function mapStatus(s: string | undefined): string {
  switch ((s ?? "").toLowerCase()) {
    case "paid":
      return "paid";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "pending":
      return "pending";
    case "authorized":
      return "authorized";
    case "partially_paid":
      return "partially_paid";
    case "voided":
      return "canceled";
    default:
      return "other";
  }
}

function determineChannelFromSource(
  source: string | undefined,
  location: string | undefined,
): "shopify_webshop" | "shopify_winkel" {
  const s = (source ?? "").toLowerCase();
  if (s === "pos" || (location && location.trim())) return "shopify_winkel";
  return "shopify_webshop";
}

interface ParsedOrder {
  orderId: string;
  orderName: string | null;
  channel: "shopify_webshop" | "shopify_winkel";
  status: string;
  paidAt: string | null;
  createdAt: string | null;
  invoiceNumber: string | null;
  sourceName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCompany: string | null;
  firstRow: Row;
  lines: Row[];
}

function groupOrders(rows: Row[]): ParsedOrder[] {
  // Group by Id (Shopify order id), accumulating lineitems across rows
  const map = new Map<string, ParsedOrder>();
  for (const r of rows) {
    const orderId = (r["Id"] || "").trim();
    if (!orderId) continue;
    let order = map.get(orderId);
    if (!order) {
      order = {
        orderId,
        orderName: text(r["Name"]),
        channel: determineChannelFromSource(r["Source"], r["Location"]),
        status: mapStatus(r["Financial Status"]),
        paidAt: isoDate(r["Paid at"]) ?? isoDate(r["Created at"]),
        createdAt: isoDate(r["Created at"]),
        invoiceNumber: orderNumber(r["Name"]),
        sourceName: text(r["Source"]),
        customerName: text(r["Billing Name"], r["Shipping Name"], r["Email"]),
        customerEmail: text(r["Email"]),
        customerPhone: text(r["Billing Phone"], r["Shipping Phone"], r["Phone"]),
        customerCompany: text(r["Billing Company"], r["Shipping Company"]),
        firstRow: r,
        lines: [],
      };
      map.set(orderId, order);
    }
    if (r["Lineitem name"]) order.lines.push(r);
  }
  return Array.from(map.values());
}

function buildOrderSummaryRow(order: ParsedOrder) {
  const originalTotal = +order.lines
    .reduce(
      (sum, line) => sum + num(line["Lineitem price"]) * (num(line["Lineitem quantity"]) || 1),
      0,
    )
    .toFixed(2);
  const lineDiscountTotal = +order.lines
    .reduce((sum, line) => sum + num(line["Lineitem discount"]), 0)
    .toFixed(2);
  const taxRates = taxRatesFromRow(order.firstRow);
  const total = num(order.firstRow["Total"]);
  const refunded = num(order.firstRow["Refunded Amount"]);
  const currentTotal = +(total - refunded).toFixed(2);

  return {
    external_id: order.orderId,
    order_name: order.orderName,
    order_number: order.invoiceNumber,
    source_name: order.sourceName,
    channel: order.channel,
    financial_status: order.status,
    customer_id: null,
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    customer_phone: order.customerPhone,
    customer_company: order.customerCompany,
    processed_at: order.paidAt,
    created_at_shopify: order.createdAt,
    updated_at_shopify: null,
    taxes_included: true,
    line_original_total: originalTotal,
    line_discounted_total: +(originalTotal - lineDiscountTotal).toFixed(2),
    line_discount_total: lineDiscountTotal,
    line_tax_total: +taxRates.reduce((sum, row) => sum + Number(row?.amount ?? 0), 0).toFixed(2),
    subtotal_price: num(order.firstRow["Subtotal"]),
    current_subtotal_price: num(order.firstRow["Subtotal"]),
    total_discounts: num(order.firstRow["Discount Amount"]),
    current_total_discounts: num(order.firstRow["Discount Amount"]),
    total_shipping: num(order.firstRow["Shipping"]),
    total_tax: num(order.firstRow["Taxes"]),
    current_total_tax: num(order.firstRow["Taxes"]),
    total_price: total,
    current_total_price: currentTotal,
    total_refunded: refunded,
    net_payment: currentTotal,
    raw_payload: {
      imported_from: "shopify_csv",
      order_name: order.orderName,
      created_at_csv: order.createdAt,
      paid_at_csv: order.firstRow["Paid at"] || null,
      payment_id: text(order.firstRow["Payment ID"]),
      payment_reference: text(
        order.firstRow["Payment Reference"],
        order.firstRow["Payment References"],
      ),
      receipt_number: text(order.firstRow["Receipt Number"]),
      cancelled_at_csv: isoDate(order.firstRow["Cancelled at"]),
      fulfillment_status_csv: text(order.firstRow["Fulfillment Status"]),
      payment_terms_name: text(order.firstRow["Payment Terms Name"]),
      next_payment_due_at: isoDate(order.firstRow["Next Payment Due At"]),
      tags: text(order.firstRow["Tags"]),
      tax_rates: taxRates,
      line_count: order.lines.length,
    },
  };
}

function buildTransactionRows(order: ParsedOrder) {
  return order.lines.map((line, idx) => {
    const qty = num(line["Lineitem quantity"]) || 1;
    const unit = num(line["Lineitem price"]);
    const lineDiscount = num(line["Lineitem discount"]);
    const gross = +(unit * qty - lineDiscount).toFixed(2);
    // VAT from order-level tax columns is per order; we leave per-line vat unknown unless single line
    return {
      external_id: `csv-${order.orderId}-${idx}-${(line["Lineitem sku"] || "").slice(0, 32)}`,
      source: "shopify" as const,
      channel: order.channel,
      machine_id: null,
      article_number: line["Lineitem sku"] || null,
      product_name: line["Lineitem name"] || null,
      amount_gross: gross,
      amount_net: null,
      vat_amount: null,
      vat_rate: null,
      discount_amount: lineDiscount > 0 ? lineDiscount : null,
      invoice_number: order.invoiceNumber,
      status: order.status,
      paid_at: order.paidAt,
      description_raw: null,
      invoice_url: null,
      raw_payload: { csv: true, order_id: order.orderId, line },
      parse_status: "ok" as const,
      parse_error_message: null,
    };
  });
}

function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ orders: ParsedOrder[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    orders: number;
  } | null>(null);

  function onFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f) return;
    Papa.parse<Row>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const orders = groupOrders(res.data as Row[]);
        const total = orders.reduce((s, o) => s + o.lines.length, 0);
        setPreview({ orders, total });
      },
      error: (err) => toast.error("CSV-fout: " + err.message),
    });
  }

  async function doImport() {
    if (!preview) return;
    setBusy(true);
    try {
      // Check duplicates: fetch existing external_ids that begin with order ids already in DB
      const orderIds = preview.orders.map((o) => o.orderId);
      const seenOrderIds = new Set<string>();
      const existingSummaries = new Map<string, any>();
      const chunkIds = 200;
      for (let i = 0; i < orderIds.length; i += chunkIds) {
        const slice = orderIds.slice(i, i + chunkIds);
        const { data: existing, error: exErr } = await supabase
          .from("transactions")
          .select("raw_payload")
          .eq("source", "shopify")
          .in("raw_payload->>order_id", slice);
        if (exErr) throw exErr;
        for (const r of existing ?? []) {
          const oid = (r as any).raw_payload?.order_id;
          if (oid) seenOrderIds.add(String(oid));
        }

        const { data: summaries, error: summaryErr } = await (supabase as any)
          .from("shopify_order_summaries")
          .select(
            "external_id,customer_id,customer_name,customer_email,customer_phone,customer_company,updated_at_shopify,raw_payload",
          )
          .in("external_id", slice);
        if (summaryErr) throw summaryErr;
        for (const summary of summaries ?? [])
          existingSummaries.set(String(summary.external_id), summary);
      }

      let inserted = 0,
        skipped = 0;
      const toInsert: any[] = [];
      const summariesToUpsert: any[] = [];
      for (const o of preview.orders) {
        const summary = buildOrderSummaryRow(o);
        const existing = existingSummaries.get(o.orderId);
        summariesToUpsert.push({
          ...summary,
          customer_id: existing?.customer_id ?? summary.customer_id,
          customer_name: existing?.customer_name || summary.customer_name,
          customer_email: existing?.customer_email || summary.customer_email,
          customer_phone: existing?.customer_phone || summary.customer_phone,
          customer_company: existing?.customer_company || summary.customer_company,
          updated_at_shopify: existing?.updated_at_shopify ?? summary.updated_at_shopify,
          raw_payload: { ...(existing?.raw_payload ?? {}), ...summary.raw_payload },
        });
        if (seenOrderIds.has(o.orderId)) {
          skipped += o.lines.length;
          continue;
        }
        const rows = buildTransactionRows(o);
        toInsert.push(...rows);
      }

      // Chunk insert
      const chunk = 500;
      for (let i = 0; i < summariesToUpsert.length; i += chunk) {
        const slice = summariesToUpsert.slice(i, i + chunk);
        const { error } = await (supabase as any)
          .from("shopify_order_summaries")
          .upsert(slice, { onConflict: "external_id" });
        if (error) throw error;
      }

      for (let i = 0; i < toInsert.length; i += chunk) {
        const slice = toInsert.slice(i, i + chunk);
        const { error } = await supabase
          .from("transactions")
          .upsert(slice, { onConflict: "source,external_id", ignoreDuplicates: true });
        if (error) throw error;
        inserted += slice.length;
      }
      setResult({ inserted, skipped, orders: preview.orders.length });
      toast.success(
        `Import voltooid: ${inserted} regels geïmporteerd, ${skipped} duplicaten overgeslagen`,
      );
    } catch (e) {
      toast.error("Import-fout: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">CSV-import Shopify-orders</h1>
        <p className="text-sm text-muted-foreground">
          Importeer een handmatige Shopify orders-export (orders_export.csv). Duplicaten worden
          automatisch overgeslagen op basis van het Shopify order-ID.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Bestand selecteren</CardTitle>
          <CardDescription>
            Verwacht formaat: standaard Shopify orders export met kolommen Name, Id, Lineitem name,
            etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {preview && (
            <div className="text-sm rounded-md border p-3 bg-muted/30">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4" />
                {file?.name}
              </div>
              <div className="text-muted-foreground mt-1">
                {preview.orders.length} orders · {preview.total} regels gevonden
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Importeren</CardTitle>
            <CardDescription>
              Het systeem controleert per order-ID of er al verkooptransacties bestaan. Bestaande
              orders worden volledig overgeslagen (geen dubbele regels).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={doImport} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" />
              {busy ? "Bezig met importeren…" : `Importeer ${preview.total} regels`}
            </Button>
            {result && (
              <div className="text-sm rounded-md border p-3 bg-muted/30 space-y-1">
                <div>
                  <span className="text-muted-foreground">Orders verwerkt:</span> {result.orders}
                </div>
                <div>
                  <span className="text-muted-foreground">Regels geïmporteerd:</span>{" "}
                  {result.inserted}
                </div>
                <div>
                  <span className="text-muted-foreground">Duplicaten overgeslagen:</span>{" "}
                  {result.skipped}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {preview && preview.orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voorbeeld (eerste 10 orders)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Kanaal</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Regels</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.orders.slice(0, 10).map((o) => (
                    <tr key={o.orderId} className="border-t">
                      <td className="px-3 py-2 tabular-nums">{o.orderName}</td>
                      <td className="px-3 py-2">
                        {o.channel === "shopify_winkel" ? "Winkel" : "Webshop"}
                      </td>
                      <td className="px-3 py-2">{o.status}</td>
                      <td className="px-3 py-2 tabular-nums">{o.lines.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
