import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { CustomerAccountError, revealCustomerOrderKeys } from "../../../../../../lib/shop/customer-account";
import { assertSameOriginMutation, getCustomerSession, jsonNoStore } from "../../../../../../lib/shop/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  if (!assertSameOriginMutation(request, env)) {
    return jsonNoStore({ ok: false, code: "origin_mismatch" }, 403);
  }
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  const orderId = params.orderId?.trim() ?? "";
  if (!orderId || orderId.length > 64) return jsonNoStore({ ok: false, code: "order_not_found" }, 404);
  if (Number(request.headers.get("content-length") ?? "0") > 0) {
    return jsonNoStore({ ok: false, code: "request_body_not_allowed" }, 400);
  }

  const requestId = crypto.randomUUID();
  try {
    const delivery = await revealCustomerOrderKeys(env, {
      customerId: session.customerId,
      orderId,
      requestId,
    });
    return jsonNoStore({
      ok: true,
      order: { id: delivery.orderId, number: delivery.orderNumber, state: delivery.state },
      deliveries: delivery.deliveries,
      deliveredAt: delivery.deliveredAt,
    });
  } catch (error) {
    if (error instanceof CustomerAccountError) {
      const status = error.code === "order_not_found" ? 404
        : error.code === "key_reveal_rate_limited" ? 429
        : error.code === "order_not_paid" || error.code === "order_not_deliverable" ? 409
        : 409;
      const response = jsonNoStore({ ok: false, code: error.code }, status);
      if (error.code === "key_reveal_rate_limited") response.headers.set("retry-after", "3600");
      return response;
    }
    console.error(JSON.stringify({
      event: "customer_key_reveal_failed",
      requestId,
      code: error instanceof Error ? error.message : "unknown",
    }));
    return jsonNoStore({ ok: false, code: "order_delivery_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
