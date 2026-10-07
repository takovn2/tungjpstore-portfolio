import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { locales, type Locale } from "../../../i18n/dictionaries";
import { getCustomerSession } from "../../../lib/shop/customer-auth";
import { previewPublicCheckoutQuote, ShopConflictError } from "../../../lib/shop/service";
import { validateCheckoutQuoteInput } from "../../../lib/shop/validation";

export const prerender = false;

const MAX_BODY_BYTES = 8_000;
const localeSet = new Set<string>(locales);

const DISCOUNT_CODES = new Set([
  "discount_invalid",
  "discount_not_applicable",
  "discount_outside_window",
  "discount_limit_reached",
  "discount_customer_limit_reached",
  "discount_minimum_not_met",
  "discount_currency_mismatch",
  "zero_total_checkout_not_supported",
]);

const CART_CODES = new Set([
  "variant_not_found",
  "variant_not_available",
  "insufficient_inventory",
  "quantity_limit_exceeded",
  "mixed_currency_not_supported",
  "customer_blocked",
  "automatic_download_unsupported",
]);

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

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const session = await getCustomerSession(env, request).catch(() => null);
  if (!session?.emailNormalized) return json({ ok: false, code: "customer_auth_required" }, 401);

  const parsed = await readJson(request);
  if ("response" in parsed) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json({ ok: false, code: "invalid_payload" }, 400);
  }
  const payload = parsed.value as Record<string, unknown>;
  const allowed = new Set(["items", "locale", "discountCode"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return json({ ok: false, code: "invalid_payload" }, 400);

  const locale = localeSet.has(payload.locale as string) ? payload.locale as Locale : "en";
  const quote = validateCheckoutQuoteInput({
    items: payload.items,
    locale,
    ...(payload.discountCode ? { discountCode: payload.discountCode } : {}),
  });
  if (!quote.ok) return json({ ok: false, code: "validation_failed", issues: quote.issues }, 400);

  try {
    const result = await previewPublicCheckoutQuote(env, {
      items: quote.value.items,
      locale: quote.value.locale,
      ...(quote.value.discountCode ? { discountCode: quote.value.discountCode } : {}),
      customerEmail: session.emailNormalized,
    }, clientAddress ?? request.headers.get("CF-Connecting-IP"));
    return json({
      ok: true,
      currency: result.currency,
      subtotalMinor: result.subtotalMinor,
      discountMinor: result.discountMinor,
      totalMinor: result.totalMinor,
      discountCode: result.discountCode,
      discount: result.discount ? {
        code: result.discount.code,
        type: result.discount.type,
        value: result.discount.value,
        scope: result.discount.scope,
        eligibleSubtotalMinor: result.discount.eligibleSubtotalMinor,
        minimumSubtotalMinor: result.discount.minimumSubtotalMinor,
        maximumDiscountMinor: result.discount.maximumDiscountMinor,
        amountMinor: result.discount.amountMinor,
      } : null,
    });
  } catch (error) {
    if (error instanceof ShopConflictError) {
      if (error.code === "discount_quote_rate_limited") {
        const response = json({ ok: false, code: error.code }, 429);
        response.headers.set("retry-after", "60");
        return response;
      }
      if (DISCOUNT_CODES.has(error.code)) return json({ ok: false, code: error.code }, 409);
      if (CART_CODES.has(error.code)) return json({ ok: false, code: error.code }, 409);
      return json({ ok: false, code: "quote_unavailable" }, 409);
    }
    console.error(JSON.stringify({
      event: "public_checkout_quote_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }));
    return json({ ok: false, code: "quote_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
