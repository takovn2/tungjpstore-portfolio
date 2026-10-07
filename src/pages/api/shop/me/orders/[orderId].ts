import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerOrderDetail } from "../../../../../lib/shop/customer-account";
import { getCustomerSession, jsonNoStore } from "../../../../../lib/shop/customer-auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  const orderId = params.orderId?.trim() ?? "";
  if (!orderId || orderId.length > 64) return jsonNoStore({ ok: false, code: "order_not_found" }, 404);
  const order = await getCustomerOrderDetail(env, session.customerId, orderId);
  if (!order) return jsonNoStore({ ok: false, code: "order_not_found" }, 404);
  return jsonNoStore({ ok: true, order });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
