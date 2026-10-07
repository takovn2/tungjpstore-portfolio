import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { claimOrderByAccessToken, CustomerAccountError } from "../../../../../lib/shop/customer-account";
import { assertSameOriginMutation, getCustomerSession, jsonNoStore } from "../../../../../lib/shop/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!assertSameOriginMutation(request, env)) {
    return jsonNoStore({ ok: false, code: "origin_mismatch" }, 403);
  }
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);

  let accessToken = "";
  try {
    const body = await request.json() as { accessToken?: unknown };
    accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  } catch {
    return jsonNoStore({ ok: false, code: "invalid_json" }, 400);
  }

  const requestId = crypto.randomUUID();
  try {
    const claimed = await claimOrderByAccessToken(env, {
      customerId: session.customerId,
      accessToken,
      requestId,
    });
    return jsonNoStore({ ok: true, order: claimed });
  } catch (error) {
    if (error instanceof CustomerAccountError) {
      const status = error.code === "order_not_found" ? 404
        : error.code === "order_owned_by_other" ? 409
        : error.code === "order_access_required" ? 401
        : 400;
      return jsonNoStore({ ok: false, code: error.code }, status);
    }
    return jsonNoStore({ ok: false, code: "claim_failed" }, 503);
  }
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
