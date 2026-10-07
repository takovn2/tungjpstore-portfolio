import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sha256Base64Url } from "../../../lib/shop/crypto";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" },
});

const MAX_BODY_BYTES = 2_000;

export const POST: APIRoute = async ({ request }) => {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer ([A-Za-z0-9_-]{24,200})$/)?.[1];
  if (!token) return json({ ok: false, code: "order_access_required" }, 401);
  if (!env.CONTENT_DB) return json({ ok: false, code: "payment_reference_unavailable" }, 503);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, code: "invalid_content_type" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, code: "payload_too_large" }, 413);
  }
  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, code: "payload_too_large" }, 413);
    payload = JSON.parse(raw);
  } catch { return json({ ok: false, code: "invalid_json" }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ ok: false, code: "invalid_payload" }, 400);
  if (Object.keys(payload).some((key) => key !== "transactionReference")) return json({ ok: false, code: "invalid_payload" }, 400);
  const submittedReference = (payload as Record<string, unknown>).transactionReference;
  const reference = typeof submittedReference === "string"
    ? submittedReference.trim().slice(0, 180)
    : "";
  if (!reference || !/^[A-Za-z0-9:_./+=\- ]{4,180}$/.test(reference)) return json({ ok: false, code: "invalid_transaction_reference" }, 422);
  const tokenHash = await sha256Base64Url(token);
  const order = await env.CONTENT_DB.prepare("SELECT id, payment_status FROM shop_orders WHERE public_token_hash = ? LIMIT 1").bind(tokenHash).first<{ id: string; payment_status: string }>();
  if (!order) return json({ ok: false, code: "order_not_found" }, 404);
  const attempt = await env.CONTENT_DB.prepare(`SELECT id, status FROM shop_crypto_payment_attempts
    WHERE order_id = ? AND status IN ('created', 'awaiting_payment', 'detected', 'needs_review')
    ORDER BY created_at DESC LIMIT 1`).bind(order.id).first<{ id: string; status: string }>();
  if (!attempt) return json({ ok: false, code: "crypto_payment_not_available" }, 409);
  const now = new Date().toISOString();
  const referenceHash = await sha256Base64Url(reference);
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare(`UPDATE shop_crypto_payment_attempts SET status = 'needs_review', customer_reference = ?, failure_code = NULL, checked_at = NULL, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment', 'detected', 'needs_review')`).bind(reference, now, attempt.id),
    env.CONTENT_DB.prepare(`INSERT OR IGNORE INTO shop_crypto_payment_events
      (id, payment_attempt_id, order_id, provider, rail, provider_event_id, transaction_reference,
       asset, network, status, match_state, evidence_hash, occurred_at, created_at)
      SELECT ?, a.id, a.order_id, a.provider, a.rail, ?, ?, a.asset, a.network, 'pending', 'needs_review', ?, ?, ?
      FROM shop_crypto_payment_attempts a WHERE a.id = ?`).bind(crypto.randomUUID(), `customer-reference:${attempt.id}:${referenceHash}`, reference, referenceHash, now, now, attempt.id),
  ]);
  return json({ ok: true, transactionReference: reference, status: "submitted" });
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
