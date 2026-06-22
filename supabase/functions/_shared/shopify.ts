// Gedeelde processor voor Shopify-orders (gebruikt door webhook én sweep).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function mapShopifyStatus(financialStatus: string | null | undefined): string {
  switch (financialStatus) {
    case "paid": return "paid";
    case "refunded": return "refunded";
    case "partially_refunded": return "partially_refunded";
    case "voided": return "canceled";
    case "pending": return "pending";
    case "authorized": return "authorized";
    case "partially_paid": return "partially_paid";
    case "canceled": return "canceled";
    default: return "other";
  }
}

function determineChannel(order: any): "shopify_webshop" | "shopify_winkel" {
  const source = (order.source_name ?? "").toString().toLowerCase();
  if (source === "pos" || order.location_id) return "shopify_winkel";
  return "shopify_webshop";
}

export async function processShopifyOrder(order: any) {
  const channel = determineChannel(order);
  const orderId = order.id;
  const paidAt = order.processed_at ?? order.created_at ?? null;
  const status = mapShopifyStatus(order.financial_status);
  const invoiceNumber = order.order_number ? String(order.order_number) : (order.name ?? null);
  const orderInvoiceUrl = order.order_status_url ?? null;

  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  if (lines.length === 0) return;

  const rows = lines.map((line: any) => {
    const qty = Number(line.quantity ?? 1);
    const linePrice = Number(line.price ?? 0) * qty;
    const lineDiscount = Number(line.total_discount ?? 0);
    const effectiveGross = +(linePrice - lineDiscount).toFixed(2);
    let vatRate: number | null = null;
    let vatAmount: number | null = null;
    if (Array.isArray(line.tax_lines) && line.tax_lines.length > 0) {
      const tl = line.tax_lines[0];
      vatRate = tl.rate ? +(Number(tl.rate) * 100).toFixed(2) : null;
      vatAmount = +line.tax_lines.reduce((s: number, t: any) => s + Number(t.price ?? 0), 0).toFixed(2);
    }
    const taxesIncluded = order.taxes_included !== false;
    const amountGross = taxesIncluded ? effectiveGross : +(effectiveGross + (vatAmount ?? 0)).toFixed(2);
    const amountNet = vatAmount !== null
      ? +(amountGross - vatAmount).toFixed(2)
      : (vatRate ? +(amountGross / (1 + vatRate / 100)).toFixed(2) : null);

    return {
      external_id: `${orderId}-${line.id}`,
      source: "shopify" as const,
      channel,
      machine_id: null,
      article_number: line.sku ?? null,
      product_name: line.title ?? line.name ?? null,
      amount_gross: amountGross,
      amount_net: amountNet,
      vat_amount: vatAmount,
      vat_rate: vatRate,
      discount_amount: lineDiscount > 0 ? lineDiscount : null,
      invoice_number: invoiceNumber,
      status,
      paid_at: paidAt,
      description_raw: null,
      invoice_url: orderInvoiceUrl,
      raw_payload: { order_id: orderId, line },
      parse_status: "ok" as const,
      parse_error_message: null,
    };
  });

  const { error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "source,external_id" });
  if (error) throw error;

  const lineOriginalTotal = roundMoney(
    lines.reduce((sum: number, line: any) => sum + Number(line.price ?? 0) * Number(line.quantity ?? 1), 0),
  );
  const lineDiscountTotal = roundMoney(
    lines.reduce((sum: number, line: any) => sum + Number(line.total_discount ?? 0), 0),
  );
  const lineDiscountedTotal = roundMoney(rows.reduce((sum: number, row: any) => sum + Number(row.amount_gross ?? 0), 0));
  const lineTaxTotal = roundMoney(rows.reduce((sum: number, row: any) => sum + Number(row.vat_amount ?? 0), 0));
  const taxRates = summarizeOrderTaxRates(lines);

  const { error: summaryError } = await supabase
    .from("shopify_order_summaries")
    .upsert(
      [
        {
          external_id: String(orderId),
          order_name: order.name ?? null,
          order_number: invoiceNumber,
          source_name: order.source_name ?? null,
          channel,
          financial_status: status,
          processed_at: paidAt,
          created_at_shopify: order.created_at ?? null,
          updated_at_shopify: order.updated_at ?? null,
          taxes_included: order.taxes_included ?? null,
          line_original_total: lineOriginalTotal,
          line_discounted_total: lineDiscountedTotal,
          line_discount_total: lineDiscountTotal,
          line_tax_total: lineTaxTotal,
          subtotal_price: nullableMoney(order.subtotal_price),
          current_subtotal_price: nullableMoney(order.current_subtotal_price),
          total_discounts: nullableMoney(order.total_discounts),
          current_total_discounts: nullableMoney(order.current_total_discounts),
          total_shipping: nullableMoney(order.total_shipping ?? moneyFromSet(order.total_shipping_price_set)),
          total_tax: nullableMoney(order.total_tax),
          current_total_tax: nullableMoney(order.current_total_tax),
          total_price: nullableMoney(order.total_price),
          current_total_price: nullableMoney(order.current_total_price),
          total_refunded: nullableMoney(order.total_refunded),
          net_payment: nullableMoney(order.net_payment),
          raw_payload: {
            order_id: orderId,
            name: order.name ?? null,
            source_name: order.source_name ?? null,
            financial_status: order.financial_status ?? null,
            cancelled_at: order.cancelled_at ?? null,
            fulfillment_status: order.fulfillment_status ?? null,
            tax_rates: taxRates,
            line_count: lines.length,
          },
        },
      ],
      { onConflict: "external_id" },
    );
  if (summaryError) throw summaryError;
}

function summarizeOrderTaxRates(lines: any[]): Array<{ name: string; rate: number; amount: number }> {
  const byRate = new Map<string, number>();
  for (const line of lines) {
    const taxLines = Array.isArray(line.tax_lines) ? line.tax_lines : [];
    for (const taxLine of taxLines) {
      const rawRate = Number(taxLine.rate ?? 0);
      if (!Number.isFinite(rawRate)) continue;
      const rate = rawRate > 1 ? rawRate : rawRate * 100;
      const amount = Number(taxLine.price ?? 0);
      const key = rate.toFixed(4);
      byRate.set(key, (byRate.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0));
    }
  }

  return [...byRate.entries()]
    .map(([key, amount]) => {
      const rate = roundMoney(Number(key));
      return {
        name: `BTW ${rate}%`,
        rate,
        amount: roundMoney(amount),
      };
    })
    .filter((line) => Math.abs(line.amount) > 0.004);
}

function roundMoney(value: unknown): number {
  return Number.isFinite(Number(value)) ? +Number(value).toFixed(2) : 0;
}

function nullableMoney(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : roundMoney(value);
}

function moneyFromSet(value: any): number | null {
  const amount = value?.shop_money?.amount ?? value?.shopMoney?.amount;
  return amount === null || amount === undefined ? null : roundMoney(amount);
}
