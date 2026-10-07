import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { localizePath, locales, type Locale } from "../../../i18n/dictionaries";
import { getCustomerSession } from "../../../lib/shop/customer-auth";
import { createPublicShopCheckout, ShopConflictError } from "../../../lib/shop/service";
import { validateCreateCheckoutInput } from "../../../lib/shop/validation";
import { getMarketCookie, listMarkets, resolveMarket } from "../../../lib/shop/market";

export const prerender = false;

const MAX_BODY_BYTES = 10_000;
const localeSet = new Set<string>(locales);

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

async function readJson(request: Request): Promise<{ value: unknown } | { response: Response }> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { response: json({ ok: false, code: "invalid_content_type" }, 415) } as const;
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0) return { response: json({ ok: false, code: "invalid_content_length" }, 400) } as const;
  if (declared > MAX_BODY_BYTES) return { response: json({ ok: false, code: "payload_too_large" }, 413) } as const;
  if (!request.body) return { response: json({ ok: false, code: "empty_body" }, 400) } as const;
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
        return { response: json({ ok: false, code: "payload_too_large" }, 413) } as const;
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
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown } as const;
  } catch {
    return { response: json({ ok: false, code: "invalid_json" }, 400) } as const;
  }
}

async function verifyTurnstile(token: string, secret: string, remoteIp: string | null) {
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    return ((await response.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

const string = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const session = await getCustomerSession(env, request);
  if (!session) return json({ ok: false, code: "customer_auth_required" }, 401);
  if (!session.emailNormalized) return json({ ok: false, code: "customer_email_required" }, 403);

  const parsed = await readJson(request);
  if ("response" in parsed) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ ok: false, code: "invalid_payload" }, 400);
  const payload = parsed.value as Record<string, unknown>;
  const allowed = new Set(["customer", "items", "locale", "discountCode", "externalReference", "paymentMethodId", "idempotencyKey", "turnstileToken"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return json({ ok: false, code: "invalid_payload" }, 400);

  // The public shop is English-first; callers that omit locale must not
  // silently create a Vietnamese order snapshot or email.
  const locale = localeSet.has(payload.locale as string) ? payload.locale as Locale : "en";
  const submittedCustomer = payload.customer && typeof payload.customer === "object" && !Array.isArray(payload.customer)
    ? payload.customer as Record<string, unknown>
    : {};
  const checkout = validateCreateCheckoutInput({
    customer: {
      email: session.emailNormalized,
      displayName: session.displayName,
      ...(submittedCustomer.phone ? { phone: submittedCustomer.phone } : {}),
    },
    items: payload.items,
    locale,
    sourceChannel: "web",
    ...(payload.discountCode ? { discountCode: payload.discountCode } : {}),
    ...(payload.externalReference ? { externalReference: payload.externalReference } : {}),
    ...(payload.paymentMethodId ? { paymentMethodId: payload.paymentMethodId } : {}),
  });
  if (!checkout.ok) return json({ ok: false, code: "validation_failed", issues: checkout.issues }, 400);
  // Resolve the market server-side so the order records which market produced
  // its price. Same precedence as the catalogue: explicit cookie choice, then
  // country, then Accept-Language. Never taken from the client payload.
  let marketCode: string | undefined;
  try {
    const markets = await listMarkets(env.CONTENT_DB);
    marketCode = resolveMarket({
      explicit: getMarketCookie(request),
      country: (request as Request & { cf?: { country?: string } }).cf?.country ?? null,
      acceptLanguage: request.headers.get("accept-language"),
      ...(markets.length ? { markets } : {}),
    }).market.code;
  } catch {
    // Unmigrated database: the order is still created, without a market code.
  }
  const idempotencyKey = string(payload.idempotencyKey, 200);
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(idempotencyKey)) return json({ ok: false, code: "invalid_idempotency_key" }, 400);

  const bindings = env;
  const remoteIp = clientAddress ?? request.headers.get("CF-Connecting-IP");
  const hasSiteKey = Boolean(bindings.TURNSTILE_SITE_KEY?.trim());
  const hasSecret = Boolean(bindings.TURNSTILE_SECRET_KEY?.trim());
  if (hasSiteKey !== hasSecret) return json({ ok: false, code: "challenge_not_configured" }, 503);
  if (hasSecret) {
    const token = string(payload.turnstileToken, 2_048);
    if (!token) return json({ ok: false, code: "challenge_required" }, 400);
    if (!await verifyTurnstile(token, bindings.TURNSTILE_SECRET_KEY!, remoteIp)) {
      return json({ ok: false, code: "challenge_failed" }, 400);
    }
  }

  const requestId = crypto.randomUUID();
  try {
    const result = await createPublicShopCheckout(bindings, checkout.value, idempotencyKey, requestId, remoteIp, marketCode);
    if (!result.order.orderAccessToken) {
      return json({ ok: false, code: "checkout_replay_requires_new_session", orderNumber: result.order.orderNumber }, 409);
    }
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
      statusUrl: `${localizePath("/shop/order", locale)}?order=${encodeURIComponent(result.order.orderNumber)}`,
    }, 201);
  } catch (error) {
    const configurationCodes = new Set([
      "shop_database_not_configured",
      "vietqr_bank_account_not_configured",
      "vietqr_config_not_found",
      "payos_not_configured",
      "shop_public_origin_invalid",
      "shop_order_token_not_configured",
      "crypto_provider_not_configured",
      "crypto_catalog_currency_not_usd",
      "crypto_payment_method_not_configured",
    ]);
    const safeCode = error instanceof Error && configurationCodes.has(error.message) ? error.message : null;
    if (safeCode) {
      return json({ ok: false, code: "payment_configuration_unavailable" }, 503);
    }
    if (error instanceof ShopConflictError) {
      if (error.code === "checkout_rate_limited") {
        const response = json({ ok: false, code: error.code }, 429);
        response.headers.set("retry-after", "60");
        return response;
      }
      return json({ ok: false, code: error.code }, 409);
    }
    console.error(JSON.stringify({ event: "public_checkout_failed", requestId, errorName: error instanceof Error ? error.name : "unknown" }));
    return json({ ok: false, code: "checkout_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
