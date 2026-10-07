import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sha256Base64Url } from "../../../lib/shop/crypto";
import {
  readPaymentProofMultipart,
  SHOP_PAYMENT_PROOF_MAX_BYTES,
  submitPaymentProof,
} from "../../../lib/shop/payment-proofs";
import { ShopConflictError } from "../../../lib/shop/repository";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

function errorResponse(error: unknown) {
  if (error instanceof ShopConflictError) {
    const status = error.code === "order_not_found" ? 404
      : error.code === "invalid_payment_proof" || error.code === "invalid_transaction_reference" || error.code === "payment_proof_or_reference_required" ? 422
        : error.code === "crypto_payment_not_available" || error.code === "payment_not_available" ? 409 : 422;
    return json({ ok: false, code: error.code }, status);
  }
  const code = error instanceof Error ? error.message : "payment_proof_unavailable";
  return json({ ok: false, code: code === "shop_database_not_configured" || code === "payment_proof_storage_unavailable" ? code : "payment_proof_unavailable" }, 503);
}

export const POST: APIRoute = async ({ request }) => {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer ([A-Za-z0-9_-]{24,200})$/)?.[1];
  if (!token) return json({ ok: false, code: "order_access_required" }, 401);
  if (!env.CONTENT_DB) return json({ ok: false, code: "payment_proof_unavailable" }, 503);
  const parsed = await readPaymentProofMultipart(request);
  if ("error" in parsed) {
    return json({ ok: false, code: parsed.error }, parsed.error === "payload_too_large" ? 413 : parsed.error === "invalid_content_type" ? 415 : 400);
  }
  if ((parsed.upload.bytes?.byteLength || 0) > SHOP_PAYMENT_PROOF_MAX_BYTES) return json({ ok: false, code: "payload_too_large" }, 413);
  try {
    const tokenHash = await sha256Base64Url(token);
    const order = await env.CONTENT_DB.prepare("SELECT id FROM shop_orders WHERE public_token_hash = ? LIMIT 1").bind(tokenHash).first<{ id: string }>();
    if (!order) return json({ ok: false, code: "order_not_found" }, 404);
    const proof = await submitPaymentProof({ CONTENT_DB: env.CONTENT_DB, MEDIA: env.MEDIA }, {
      orderId: order.id,
      upload: parsed.upload,
      actor: "customer:public-order",
    });
    return json({ ok: true, proof }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
