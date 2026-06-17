import { corsHeaders } from "../_shared/cors.ts";
import { processShopifyOrder } from "../_shared/shopify.ts";

const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!;

async function verifyHmac(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-shopify-hmac-sha256");
    const valid = await verifyHmac(rawBody, signature);
    if (!valid) return new Response("Ongeldige HMAC", { status: 401, headers: corsHeaders });
    const order = JSON.parse(rawBody);
    await processShopifyOrder(order);
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("shopify-webhook", e);
    return new Response(`Fout: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
