import { corsHeaders } from "../_shared/cors.ts";
import { processMolliePayment } from "../_shared/mollie.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ct = req.headers.get("content-type") ?? "";
    let paymentId: string | null = null;
    if (ct.includes("application/x-www-form-urlencoded")) {
      const fd = await req.formData();
      paymentId = fd.get("id")?.toString() ?? null;
    } else if (ct.includes("application/json")) {
      const body = await req.json();
      paymentId = body.id ?? null;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      paymentId = params.get("id");
    }
    if (!paymentId) return new Response("Geen id", { status: 400, headers: corsHeaders });
    await processMolliePayment(paymentId);
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("mollie-webhook", e);
    return new Response(`Fout: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
