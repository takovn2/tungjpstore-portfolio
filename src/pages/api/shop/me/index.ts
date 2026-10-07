import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerProfile } from "../../../../lib/shop/customer-account";
import { getCustomerSession, jsonNoStore } from "../../../../lib/shop/customer-auth";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  const profile = await getCustomerProfile(env, session.customerId);
  if (!profile) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  return jsonNoStore({
    ok: true,
    customer: profile,
    session: { expiresAt: session.expiresAt, authProvider: session.authProvider },
  });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
