import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerSession } from "../../../../../lib/shop/customer-auth";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff",
  }});
}

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getCustomerSession(env, request);
  if (!session) return json({ ok: false, code: "unauthorized" }, 401);
  if (!env.CONTENT_DB || !params.id || !/^[A-Za-z0-9-]{20,80}$/.test(params.id)) return json({ ok: false, code: "not_found" }, 404);
  const row = await env.CONTENT_DB.prepare(`SELECT id, amount_minor, currency, status, provider_description, qr_image_url, checkout_url, expires_at, confirmed_at
    FROM shop_wallet_topups WHERE id = ? AND customer_id = ? LIMIT 1`).bind(params.id, session.customerId).first<Record<string, unknown>>().catch(() => null);
  if (!row) return json({ ok: false, code: "not_found" }, 404);
  return json({ ok: true, topup: {
    id: row.id, amountMinor: row.amount_minor, currency: row.currency, status: row.status,
    transferDescription: row.provider_description, qrUrl: row.qr_image_url, checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at, confirmedAt: row.confirmed_at,
  }});
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
