import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listCustomerOrders } from "../../../../../lib/shop/customer-account";
import { getCustomerSession, jsonNoStore } from "../../../../../lib/shop/customer-auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const result = await listCustomerOrders(env, session.customerId, { cursor, limit });
  return jsonNoStore({ ok: true, ...result });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
