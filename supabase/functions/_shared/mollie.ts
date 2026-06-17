// Gedeelde processor voor Mollie-payments (gebruikt door webhook én sweep).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAfsDescription, calcNetVat } from "./afs-parser.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function mapMollieStatus(s: string): string {
  const allowed = ["open", "canceled", "pending", "authorized", "expired", "failed", "paid"];
  return allowed.includes(s) ? s : "other";
}

export async function getMollieApiKey() {
  const { data, error } = await supabase
    .from("mollie_settings")
    .select("api_key, active")
    .eq("id", "default")
    .maybeSingle();

  if (!error && data) {
    if (data.active === false) throw new Error("Mollie-koppeling is uitgeschakeld");
    const storedKey = String(data.api_key ?? "").trim();
    if (storedKey) return storedKey;
  }

  const envKey = Deno.env.get("MOLLIE_API_KEY")?.trim();
  if (envKey) return envKey;

  if (error) throw new Error(`Mollie API-token kon niet worden geladen: ${error.message}`);
  throw new Error("Mollie API-token ontbreekt");
}

export async function processMolliePayment(paymentIdOrObject: string | any) {
  let p: any;
  if (typeof paymentIdOrObject === "string") {
    const apiKey = await getMollieApiKey();
    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentIdOrObject}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Mollie API ${res.status}: ${await res.text()}`);
    p = await res.json();
  } else {
    p = paymentIdOrObject;
  }

  const description = p.description ?? "";
  const amountGross = Number(p.amount?.value ?? 0);
  const discountAmount = p.amountRefunded?.value ? Number(p.amountRefunded.value) : null;
  const effectiveGross = discountAmount ? +(amountGross - discountAmount).toFixed(2) : amountGross;
  const status = mapMollieStatus(p.status);
  const paidAtFromMollie = p.paidAt ?? p.createdAt ?? null;

  const parsed = parseAfsDescription(description);
  let machine_id: string | null = null;

  if (!parsed.ok) {
    await upsertMollieTransaction({
      payment_id: p.id,
      mollie_created_at: p.createdAt ?? null,
      mollie_paid_at: p.paidAt ?? null,
      status,
      amount_gross: amountGross,
      amount_net: null,
      vat_amount: null,
      vat_rate: null,
      discount_amount: discountAmount,
      description_raw: description,
      parsed_afs_number: null,
      parsed_article_number: null,
      parsed_invoice_number: null,
      parsed_paid_at: null,
      machine_id: null,
      parse_status: "parse_error",
      parse_error_message: parsed.error,
      sales_action: "not_parsed",
      sales_transaction_id: null,
      raw_payload: p,
    });
    return;
  }

  const vat_rate = parsed.vat_rate;
  const article_number = parsed.article_number;
  const invoice_number = parsed.invoice_number;
  const paid_at = paidAtFromMollie ?? parsed.paid_at;
  const nv = calcNetVat(effectiveGross, vat_rate);
  const amount_net = nv.net;
  const vat_amount = nv.vat;
  const { data: machine } = await supabase
    .from("machines").select("id").eq("afs_number", parsed.afs_number).maybeSingle();
  machine_id = machine?.id ?? null;

  const row = {
    external_id: p.id,
    source: "mollie",
    channel: "bold_afs",
    machine_id,
    article_number,
    product_name: null,
    amount_gross: amountGross,
    amount_net,
    vat_amount,
    vat_rate,
    discount_amount: discountAmount,
    invoice_number,
    status,
    paid_at,
    description_raw: description,
    invoice_url: null,
    raw_payload: p,
    parse_status: "ok",
    parse_error_message: null,
  };
  const existingSales = await findExistingSalesTransaction(p.id, invoice_number);
  let sales_action: "added" | "already_exists" = "added";
  let sales_transaction_id: string | null = null;

  if (existingSales) {
    sales_action = "already_exists";
    sales_transaction_id = existingSales.id;
  } else {
    sales_transaction_id = await upsertSalesTransaction(row);
  }

  await upsertMollieTransaction({
    payment_id: p.id,
    mollie_created_at: p.createdAt ?? null,
    mollie_paid_at: p.paidAt ?? null,
    status,
    amount_gross: amountGross,
    amount_net,
    vat_amount,
    vat_rate,
    discount_amount: discountAmount,
    description_raw: description,
    parsed_afs_number: parsed.afs_number,
    parsed_article_number: article_number,
    parsed_invoice_number: invoice_number,
    parsed_paid_at: paid_at,
    machine_id,
    parse_status: "ok",
    parse_error_message: null,
    sales_action,
    sales_transaction_id,
    raw_payload: p,
  });
}

async function findExistingSalesTransaction(paymentId: string, invoiceNumber: string | null) {
  const { data: byPayment, error: paymentError } = await supabase
    .from("transactions")
    .select("id")
    .eq("source", "mollie")
    .eq("external_id", paymentId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (byPayment) return byPayment;

  if (!invoiceNumber) return null;
  const { data: byInvoice, error: invoiceError } = await supabase
    .from("transactions")
    .select("id, external_id, created_at")
    .eq("source", "mollie")
    .eq("channel", "bold_afs")
    .eq("invoice_number", invoiceNumber)
    .order("created_at", { ascending: true })
    .limit(20);
  if (invoiceError) throw invoiceError;

  return (byInvoice ?? []).sort((a: any, b: any) => {
    const aHistorical = String(a.external_id ?? "").startsWith("bold-historical-") ? 0 : 1;
    const bHistorical = String(b.external_id ?? "").startsWith("bold-historical-") ? 0 : 1;
    return aHistorical - bHistorical;
  })[0] ?? null;
}

async function upsertSalesTransaction(row: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("transactions")
    .upsert(row, { onConflict: "source,external_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

async function upsertMollieTransaction(row: Record<string, unknown>) {
  const { error } = await supabase
    .from("mollie_transactions")
    .upsert(row, { onConflict: "payment_id" });
  if (error) throw error;
}
