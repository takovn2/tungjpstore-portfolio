import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  assertSameOriginMutation,
  getCustomerSession,
  jsonNoStore,
  recordCustomerSecurityEvent,
  revokeCustomerSession,
} from "../../../../lib/shop/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!assertSameOriginMutation(request, env)) {
    return jsonNoStore({ ok: false, code: "origin_mismatch" }, 403);
  }
  const session = await getCustomerSession(env, request);
  const result = await revokeCustomerSession(env, request);
  if (session) {
    await recordCustomerSecurityEvent(env, {
      customerId: session.customerId,
      eventType: "logout",
      requestId: crypto.randomUUID(),
    });
  }
  return jsonNoStore({ ok: true }, 200, { "set-cookie": result.cookie });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
