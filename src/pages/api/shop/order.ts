import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerSession } from "../../../lib/shop/customer-auth";
import { getPublicShopOrderStatus, getPublicShopOrderStatusByCustomer } from "../../../lib/shop/service";

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

export const GET: APIRoute = async ({ request, url }) => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{24,200})$/);
  
  if (match) {
    try {
      const order = await getPublicShopOrderStatus(env, match[1]);
      if (!order) return json({ ok: false, code: "order_not_found" }, 404);
      return json({ ok: true, order });
    } catch (error) {
      const code = error instanceof Error ? error.message : "order_status_unavailable";
      if (code === "shop_database_not_configured") return json({ ok: false, code: "order_status_unavailable" }, 503);
      console.error(JSON.stringify({ event: "public_order_status_failed", code }));
      return json({ ok: false, code: "order_status_unavailable" }, 503);
    }
  }

  // Fallback: Authenticated customer requesting status by order number
  const orderNumber = url.searchParams.get("order")?.trim() || "";
  if (orderNumber) {
    try {
      const session = await getCustomerSession(env, request).catch(() => null);
      if (session?.customerId) {
        const order = await getPublicShopOrderStatusByCustomer(env, orderNumber, session.customerId);
        if (order) return json({ ok: true, order });
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "customer_order_status_fallback_failed" }));
    }
  }

  return json({ ok: false, code: "order_access_required" }, 401);
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
