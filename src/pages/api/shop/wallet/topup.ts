import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { assertSameOriginMutation, getCustomerSession } from "../../../../lib/shop/customer-auth";
import { createWalletTopup, ShopConflictError } from "../../../../lib/shop/service";

export const prerender = false;
const MAX_BODY_BYTES = 2_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff",
  }});
}

export const POST: APIRoute = async ({ request }) => {
  if (!assertSameOriginMutation(request, env)) return json({ ok: false, code: "origin_not_allowed" }, 403);
  const session = await getCustomerSession(env, request);
  if (!session) return json({ ok: false, code: "unauthorized" }, 401);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false, code: "invalid_content_type" }, 415);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY_BYTES) return json({ ok: false, code: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ ok: false, code: "payload_too_large" }, 413);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, code: "invalid_payload" }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return json({ ok: false, code: "invalid_json" }, 400); }
  if (Object.keys(body).some((key) => !["amountMinor", "currency", "paymentMethod"].includes(key))) return json({ ok: false, code: "invalid_payload" }, 400);
  if (body.currency !== "VND" || body.paymentMethod !== "vietqr") return json({ ok: false, code: "wallet_topup_method_not_supported" }, 422);
  try {
    const topup = await createWalletTopup(env, { customerId: session.customerId, amountMinor: Number(body.amountMinor) });
    return json({ ok: true, topupId: topup.id, status: topup.status, method: "payos", amountMinor: topup.amountMinor, currency: topup.currency, transferDescription: topup.providerDescription, qrUrl: topup.qrImageUrl, checkoutUrl: topup.checkoutUrl, expiresAt: topup.expiresAt }, 201);
  } catch (error) {
    if (error instanceof ShopConflictError) return json({ ok: false, code: error.code }, 422);
    const known = new Set(["vietqr_bank_account_not_configured", "vietqr_config_not_found", "payos_not_configured", "shop_public_origin_invalid"]);
    if (error instanceof Error && known.has(error.message)) return json({ ok: false, code: "wallet_topup_unavailable" }, 503);
    console.error(JSON.stringify({ event: "wallet_topup_create_failed", errorName: error instanceof Error ? error.name : "unknown" }));
    return json({ ok: false, code: "wallet_topup_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
