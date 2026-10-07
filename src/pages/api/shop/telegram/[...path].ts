import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createTelegramShopCheckout, deliverPublicShopOrder, getPublicShopOrderStatus, ShopConflictError } from "../../../../lib/shop/service";
import { listPublicProducts } from "../../../../lib/shop/repository";
import { verifyShopIntegrationBearer } from "../../../../lib/shop/integration-auth";
import { validateCreateCheckoutInput } from "../../../../lib/shop/validation";

export const prerender = false;

const MAX_BODY_BYTES = 12_000;

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "private, no-store, max-age=0");
  responseHeaders.set("pragma", "no-cache");
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("x-robots-tag", "noindex, nofollow");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

async function readJson(request: Request): Promise<{ value: unknown } | { response: Response }> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { response: json({ ok: false, code: "invalid_content_type" }, 415) };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY_BYTES) return { response: json({ ok: false, code: "payload_too_large" }, 413) };
  if (!request.body) return { response: json({ ok: false, code: "empty_body" }, 400) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return { response: json({ ok: false, code: "payload_too_large" }, 413) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { response: json({ ok: false, code: "invalid_json" }, 400) };
  }
}

function pathSegments(rawPath: string | undefined) {
  try {
    return (rawPath ?? "").split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function orderToken(request: Request) {
  const value = request.headers.get("x-order-access-token") ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function safeCheckoutError(error: unknown) {
  if (error instanceof ShopConflictError) return error.code;
  const value = error instanceof Error ? error.message : "";
  return new Set([
    "shop_database_not_configured", "vietqr_bank_account_not_configured", "vietqr_config_not_found",
    "payos_not_configured", "shop_public_origin_invalid", "telegram_identity_required", "telegram_identity_invalid", "shop_order_token_not_configured",
  ]).has(value) ? value : "checkout_unavailable";
}

async function handle(request: Request, segments: string[]) {
  const auth = await verifyShopIntegrationBearer(request, env.SHOP_TELEGRAM_VPS_SECRET);
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status);
  const db = env.CONTENT_DB;
  if (!db) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const resource = segments[0] ?? "";
  const requestId = crypto.randomUUID();

  if (resource === "catalog" && request.method === "GET" && segments.length === 1) {
    const params = new URL(request.url).searchParams;
    // Legacy Telegram integration is Vietnam-only; global checkout will use
    // a separate bot contract rather than changing this surface in place.
    const locale = "vi" as const;
    const featuredOnly = params.get("featured") === "1" || params.get("featuredOnly") === "true";
    const parsedLimit = Number(params.get("limit") ?? "24");
    const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 24;
    try {
      return json({ ok: true, locale, products: await listPublicProducts(db, { locale, featuredOnly, limit }) });
    } catch {
      console.error(JSON.stringify({ event: "telegram_catalog_failed", requestId }));
      return json({ ok: false, code: "catalog_unavailable" }, 503);
    }
  }

  if (resource === "checkout" && request.method === "POST" && segments.length === 1) {
    const parsed = await readJson(request);
    if ("response" in parsed) return parsed.response;
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ ok: false, code: "invalid_payload" }, 400);
    const payload = parsed.value as Record<string, unknown>;
    const allowed = new Set(["customer", "items", "locale", "discountCode", "externalReference", "idempotencyKey"]);
    if (Object.keys(payload).some((key) => !allowed.has(key))) return json({ ok: false, code: "invalid_payload" }, 400);
    const locale = "vi" as const;
    const checkout = validateCreateCheckoutInput({
      customer: payload.customer,
      items: payload.items,
      locale,
      sourceChannel: "telegram",
      ...(payload.externalReference ? { externalReference: payload.externalReference } : {}),
      ...(payload.discountCode ? { discountCode: payload.discountCode } : {}),
    });
    if (!checkout.ok) return json({ ok: false, code: "validation_failed", issues: checkout.issues }, 400);
    if (!checkout.value.customer.telegramSubject) return json({ ok: false, code: "telegram_identity_required" }, 400);
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(idempotencyKey)) return json({ ok: false, code: "invalid_idempotency_key" }, 400);
    try {
      const result = await createTelegramShopCheckout(env, checkout.value, idempotencyKey, requestId);
      if (!result.order.orderAccessToken) return json({ ok: false, code: "checkout_replay_requires_new_session", orderNumber: result.order.orderNumber }, 409);
      return json({
        ok: true,
        orderAccessToken: result.order.orderAccessToken,
        order: {
          id: result.order.orderId,
          number: result.order.orderNumber,
          reference: result.order.orderReference,
          state: result.payment?.state ?? "created",
          totalMinor: result.order.totalMinor,
          currency: result.order.currency,
          expiresAt: result.order.expiresAt,
        },
        payment: result.payment,
        paymentConfiguration: result.paymentConfiguration,
      }, 201);
    } catch (error) {
      const code = safeCheckoutError(error);
      if (code === "checkout_rate_limited") {
        return json({ ok: false, code }, 429, { "retry-after": "60" });
      }
      if (error instanceof ShopConflictError) return json({ ok: false, code }, 409);
      if (code === "checkout_unavailable") console.error(JSON.stringify({ event: "telegram_checkout_failed", requestId }));
      return json({ ok: false, code }, code.endsWith("not_configured") || code.endsWith("_invalid") ? 503 : 400);
    }
  }

  if (resource === "order" && request.method === "GET" && segments.length === 1) {
    const token = orderToken(request);
    if (!token) return json({ ok: false, code: "order_access_required" }, 401);
    try {
      const order = await getPublicShopOrderStatus(env, token);
      return order ? json({ ok: true, order }) : json({ ok: false, code: "order_not_found" }, 404);
    } catch {
      return json({ ok: false, code: "order_status_unavailable" }, 503);
    }
  }

  if (resource === "delivery" && request.method === "POST" && segments.length === 1) {
    const token = orderToken(request);
    if (!token) return json({ ok: false, code: "order_access_required" }, 401);
    if (Number(request.headers.get("content-length") ?? "0") > 0) return json({ ok: false, code: "request_body_not_allowed" }, 400);
    try {
      const delivery = await deliverPublicShopOrder(env, token, "telegram");
      return json({ ok: true, order: { id: delivery.orderId, number: delivery.orderNumber, state: delivery.state }, deliveries: delivery.deliveries, deliveredAt: delivery.deliveredAt });
    } catch (error) {
      if (error instanceof ShopConflictError) return json({ ok: false, code: error.code }, error.code === "order_not_found" ? 404 : error.code === "order_access_required" ? 401 : 409);
      console.error(JSON.stringify({ event: "telegram_delivery_failed", requestId }));
      return json({ ok: false, code: "order_delivery_unavailable" }, 503);
    }
  }

  if (resource === "outbox") return json({ ok: false, code: "legacy_outbox_retired" }, 410);

  return json({ ok: false, code: "not_found" }, 404);
}

export const GET: APIRoute = ({ request, params }) => {
  const segments = pathSegments(params.path);
  return segments ? handle(request, segments) : Promise.resolve(json({ ok: false, code: "invalid_path" }, 400));
};

export const POST: APIRoute = ({ request, params }) => {
  const segments = pathSegments(params.path);
  return segments ? handle(request, segments) : Promise.resolve(json({ ok: false, code: "invalid_path" }, 400));
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405, { allow: "GET, POST" });
