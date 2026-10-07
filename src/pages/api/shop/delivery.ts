import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { deliverPublicShopOrder, ShopConflictError } from "../../../lib/shop/service";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

export const POST: APIRoute = async ({ request }) => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match) return json({ ok: false, code: "order_access_required" }, 401);
  if (Number(request.headers.get("content-length") ?? "0") > 0) {
    return json({ ok: false, code: "request_body_not_allowed" }, 400);
  }

  const requestId = crypto.randomUUID();
  try {
    const delivery = await deliverPublicShopOrder(env, match[1]);
    return json({ ok: true, order: { id: delivery.orderId, number: delivery.orderNumber, state: delivery.state }, deliveries: delivery.deliveries, deliveredAt: delivery.deliveredAt });
  } catch (error) {
    if (error instanceof ShopConflictError) {
      if (error.code === "order_not_found") return json({ ok: false, code: error.code }, 404);
      if (error.code === "order_access_required") return json({ ok: false, code: error.code }, 401);
      return json({ ok: false, code: error.code }, 409);
    }
    const code = error instanceof Error ? error.message : "order_delivery_unavailable";
    console.error(JSON.stringify({ event: "public_order_delivery_failed", requestId, code }));
    return json({ ok: false, code: "order_delivery_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
