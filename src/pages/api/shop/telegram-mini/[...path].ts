import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkoutTelegramItems, ensureTelegramCustomer, listTelegramCustomerOrders, previewTelegramItems, revealKeysForTelegramOrder, statusForTelegramOrder } from "../../../../lib/shop/telegram-commerce";
import { verifyTelegramMiniAppInitData } from "../../../../lib/shop/telegram-mini-auth";
import {
  assertTelegramMiniMutationOrigin,
  clearTelegramMiniSessionCookie,
  createTelegramMiniSession,
  getTelegramMiniSession,
  revokeTelegramMiniSession,
  TelegramMiniSessionError,
  type TelegramMiniSession,
} from "../../../../lib/shop/telegram-mini-session";
import { type TelegramUser, getTelegramMiniAppEnabledSetting } from "../../../../lib/shop/telegram";
import { listTelegramBotCredentials } from "../../../../lib/shop/telegram-bot-config";
import { resolveVietnamMiniShopBranding } from "../../../../lib/shop/telegram-mini-branding";
import { ShopConflictError } from "../../../../lib/shop/service";
import { listPublicProducts } from "../../../../lib/shop/repository";
import { toMiniMarketProduct } from "../../../../lib/shop/product-view";
import { validateCheckoutQuoteInput } from "../../../../lib/shop/validation";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

async function body(request: Request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > 16_000 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_000) { await reader.cancel("payload_too_large").catch(() => undefined); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>; } catch { return null; }
}

type MiniIdentity = {
  session: TelegramMiniSession;
  setCookie: string | null;
};

type MiniAuthFailure = {
  ok: false;
  code: string;
  nextBotUsername?: string;
  nextBotUrl?: string;
};

type MiniAuthResult = MiniAuthFailure | {
  ok: true;
  user: TelegramUser;
  authDate: number;
  botConfigId: string;
  botVersion: number;
};

async function verifyMiniAppIdentity(raw: string, request: Request): Promise<MiniAuthResult> {
  const hint = request.headers.get("x-telegram-bot-config")?.trim() || "";
  const registryRows = env.CONTENT_DB
    ? await env.CONTENT_DB.prepare("SELECT COUNT(*) AS count FROM shop_telegram_bot_configs WHERE scope = 'legacy' AND status IN ('active', 'previous')").first<{ count: number }>().catch(() => null)
    : null;
  if (!registryRows) return { ok: false as const, code: "telegram_registry_unavailable" } satisfies MiniAuthFailure;
  const registryHasBots = Number(registryRows?.count || 0) > 0;
  const candidates = env.CONTENT_DB && env.TELEGRAM_TOKEN_ENCRYPTION_SECRET
    ? await listTelegramBotCredentials(env.CONTENT_DB, env).catch(() => null)
    : [];
  if (registryHasBots && !candidates) return { ok: false as const, code: "telegram_registry_unavailable" } satisfies MiniAuthFailure;
  const ordered = hint
    ? (candidates || []).filter((candidate) => candidate.configId === hint)
    : (candidates || []);

  // `/telegram/shop` is the original Vietnam Mini App and does not carry a
  // registry bot hint. Check its environment token first so adding a separate
  // global bot to the registry does not strand existing Vietnamese users.
  // A global Mini App supplies `x-telegram-bot-config` and therefore never
  // falls through to this legacy credential.
  const legacy = !hint
    ? await verifyTelegramMiniAppInitData(raw, env.TELEGRAM_BOT_TOKEN)
    : null;
  if (legacy?.ok) return { ...legacy, botConfigId: "environment", botVersion: 1 };

  for (const candidate of ordered) {
    const verified = await verifyTelegramMiniAppInitData(raw, candidate.token);
    if (verified.ok) return { ...verified, botConfigId: candidate.configId, botVersion: candidate.authRevision };
  }
  if (hint || registryHasBots) {
    // Only expose a migration target from the encrypted, registry-backed bot
    // list; never reflect a caller-controlled hint into a Telegram URL.
    const active = candidates?.find((candidate) => candidate.status === "active") ?? candidates?.[0];
    const migrationHint = active && typeof active.username === "string" && /^[A-Za-z0-9_]{5,32}$/.test(active.username)
      ? { nextBotUsername: active.username, nextBotUrl: `https://t.me/${active.username}` }
      : {};
    return { ok: false as const, code: "telegram_bot_context_invalid", ...migrationHint } satisfies MiniAuthFailure;
  }
  return (legacy && !registryHasBots
    ? legacy
    : { ok: false as const, code: "telegram_auth_invalid" }) satisfies MiniAuthFailure;
}

async function telegramSessionBotValid(session: TelegramMiniSession) {
  if (!env.CONTENT_DB) return false;
  if (session.botConfigId === "environment") {
    // The environment-token bot is the independent Vietnam surface. Its
    // session must not be revoked merely because a registry-managed global
    // bot is active alongside it.
    return Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  }
  const row = await env.CONTENT_DB.prepare(`SELECT auth_revision, status, previous_expires_at
    FROM shop_telegram_bot_configs WHERE id = ? LIMIT 1`).bind(session.botConfigId).first<{
    auth_revision: number;
    status: string;
    previous_expires_at: string | null;
  }>().catch(() => null);
  if (!row) return false;
  if (row.auth_revision !== session.botVersion) return false;
  return row.status === "active" || (row.status === "previous" && Boolean(row.previous_expires_at && row.previous_expires_at > new Date().toISOString()));
}

async function authenticate(request: Request, allowInitDataBootstrap: boolean): Promise<{ ok: true; identity: MiniIdentity } | { ok: false; response: Response }> {
  // The existing Telegram bot is the Vietnam/VND PayOS surface. Global
  // Telegram traffic will use a separate bot and endpoint when introduced.
  const requestLocale = "vi" as const;
  const rawInitData = request.headers.get("x-telegram-init-data")?.trim() || "";
  const hadSessionCookie = /(?:^|;)\s*__Host-tg_mini_session=/.test(request.headers.get("cookie") ?? "");
  const authFailure = (response: Response) => {
    if (hadSessionCookie) response.headers.set("set-cookie", clearTelegramMiniSessionCookie());
    return { ok: false as const, response };
  };
  let existing = await getTelegramMiniSession(env, request);
  if (existing && !await telegramSessionBotValid(existing)) {
    await revokeTelegramMiniSession(env, request).catch(() => undefined);
    existing = null;
  }
  if (rawInitData && !allowInitDataBootstrap) {
    // Older Mini App bundles attached initData to every API call. Keep that
    // traffic compatible only when the request already has a valid session
    // and the signed payload identifies the same Telegram account. Never use
    // a non-bootstrap header to create or switch a session.
    if (!existing) return authFailure(json({ ok: false, code: "telegram_session_required" }, 401));
    const legacyAuth = await verifyMiniAppIdentity(rawInitData, request);
    if (!legacyAuth.ok) {
      const migrationHint = "nextBotUrl" in legacyAuth ? { nextBotUsername: legacyAuth.nextBotUsername, nextBotUrl: legacyAuth.nextBotUrl } : {};
      return authFailure(json({ ok: false, code: legacyAuth.code, ...migrationHint }, legacyAuth.code === "telegram_auth_expired" ? 401 : 403));
    }
    if (legacyAuth.user.id !== existing.telegramUserId) {
      await revokeTelegramMiniSession(env, request).catch(() => undefined);
      return authFailure(json({ ok: false, code: "telegram_identity_mismatch" }, 403));
    }
    if (legacyAuth.botConfigId !== existing.botConfigId) {
      await revokeTelegramMiniSession(env, request).catch(() => undefined);
      return authFailure(json({ ok: false, code: "telegram_session_required" }, 401));
    }
    return { ok: true, identity: { session: existing.locale === requestLocale ? existing : { ...existing, locale: requestLocale }, setCookie: null } };
  }
  if (!rawInitData && existing) {
    // Bootstrap is the account-binding boundary. A stale cookie must not be
    // accepted when Telegram has not supplied signed initData, otherwise a
    // WebView that switched accounts (or lost SDK state) can keep acting as
    // the previous account.
    if (allowInitDataBootstrap) return authFailure(json({ ok: false, code: "telegram_auth_required" }, 401));
    return { ok: true, identity: { session: existing.locale === requestLocale ? existing : { ...existing, locale: requestLocale }, setCookie: null } };
  }
  if (!rawInitData) return authFailure(json({ ok: false, code: "telegram_auth_required" }, 401));

  const auth = await verifyMiniAppIdentity(rawInitData || "", request);
  if (!auth.ok) {
    const migrationHint = "nextBotUrl" in auth ? { nextBotUsername: auth.nextBotUsername, nextBotUrl: auth.nextBotUrl } : {};
    return authFailure(json({ ok: false, code: auth.code, ...migrationHint }, auth.code === "telegram_auth_expired" ? 401 : 403));
  }
  // A Telegram WebView can survive an account switch. Fresh signed initData is
  // authoritative: never let a cookie issued to account A act for account B.
  if (existing?.telegramUserId === auth.user.id
    && existing.botConfigId === auth.botConfigId) {
    return { ok: true, identity: { session: existing.locale === requestLocale ? existing : { ...existing, locale: requestLocale }, setCookie: null } };
  }
  if (existing) await revokeTelegramMiniSession(env, request);
  if (!env.CONTENT_DB) return authFailure(json({ ok: false, code: "shop_database_not_configured" }, 503));
  try {
    // Geo/cookie preference controls storefront language and pricing. Telegram
    // language remains useful as user metadata but must not override it.
    const locale = requestLocale;
    const customer = await ensureTelegramCustomer(env, auth.user, locale);
    const session = await createTelegramMiniSession(env, {
      request,
      initData: rawInitData,
      authDate: auth.authDate,
      user: auth.user,
      customerId: customer.customerId,
      locale,
      botConfigId: auth.botConfigId,
      botVersion: auth.botVersion,
    });
    return { ok: true, identity: { session, setCookie: session.cookie } };
  } catch (error) {
    if (error instanceof TelegramMiniSessionError) {
      const status = error.code === "telegram_auth_replayed" ? 401 : 503;
      return authFailure(json({ ok: false, code: error.code }, status));
    }
    console.error(JSON.stringify({ event: "telegram_mini_session_failed", errorName: error instanceof Error ? error.name : "unknown" }));
    return authFailure(json({ ok: false, code: "telegram_session_unavailable" }, 503));
  }
}

async function handle(request: Request, rawPath: string | undefined) {
  const miniAppEnabled = env.TELEGRAM_MINI_APP_ENABLED === "1" || env.TELEGRAM_MINI_APP_ENABLED === "true" || (env.CONTENT_DB ? await getTelegramMiniAppEnabledSetting(env.CONTENT_DB) : false);
  if (!miniAppEnabled) {
    return json({ ok: false, code: "telegram_mini_app_disabled" }, 403);
  }
  const segments = (rawPath || "").split("/").filter(Boolean);
  const allowInitDataBootstrap = request.method === "GET" && segments[0] === "session" && segments.length === 1;
  const authentication = await authenticate(request, allowInitDataBootstrap);
  if (!authentication.ok) return authentication.response;
  const { session, setCookie } = authentication.identity;
  const applySessionCookie = (response: Response) => {
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  };
  if (request.method === "POST") {
    if (!assertTelegramMiniMutationOrigin(request, env)) {
      return applySessionCookie(json({ ok: false, code: "origin_mismatch" }, 403));
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return applySessionCookie(json({ ok: false, code: "invalid_content_type" }, 415));
    }
  }
  if (!env.CONTENT_DB) return applySessionCookie(json({ ok: false, code: "shop_database_not_configured" }, 503));
  const locale = session.locale;

  try {
    if (request.method === "GET" && segments[0] === "me" && segments.length === 1) {
      // Keep the legacy history isolated from orders created through the GLB
      // bot when both bots resolve to the same Telegram customer identity.
      const orders = await listTelegramCustomerOrders(env, session.customerId, 20, session.botConfigId);
      const shop = await resolveVietnamMiniShopBranding(env, session.botConfigId);
      return applySessionCookie(json({
        ok: true,
        user: { id: session.telegramUserId, firstName: session.user.first_name, username: session.user.username || null },
        customer: { displayName: session.user.first_name },
        shop,
        expiresAt: session.expiresAt,
        orders,
      }));
    }
    if (request.method === "GET" && segments[0] === "session" && segments.length === 1) {
      const shop = await resolveVietnamMiniShopBranding(env, session.botConfigId);
      return applySessionCookie(json({
        ok: true,
        user: { id: session.telegramUserId, firstName: session.user.first_name, username: session.user.username || null },
        shop,
        expiresAt: session.expiresAt,
      }));
    }
    if (request.method === "GET" && segments[0] === "catalog" && segments.length === 1) {
      const catalogProducts = await listPublicProducts(env.CONTENT_DB, { locale, limit: 48 });
      return applySessionCookie(json({
        ok: true,
        products: catalogProducts.map(toMiniMarketProduct),
      }));
    }
    if (request.method === "POST" && segments[0] === "quote" && segments.length === 1) {
      const input = await body(request);
      if (!input || Array.isArray(input) || Object.keys(input).some((key) => key !== "items" && key !== "discountCode")) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload" }, 400));
      }
      const quote = validateCheckoutQuoteInput({
        items: input.items,
        locale,
        ...(input.discountCode !== undefined ? { discountCode: input.discountCode } : {}),
      });
      if (!quote.ok || quote.value.items.length > 8) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload", issues: quote.ok ? [{ path: "items", code: "too_many_items" }] : quote.issues }, 400));
      }
      const result = await previewTelegramItems(env, {
        customerId: session.customerId,
        telegramUserId: session.user.id,
        locale,
        items: quote.value.items,
        discountCode: quote.value.discountCode,
      });
      return applySessionCookie(json({
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
      }));
    }
    if (request.method === "GET" && segments[0] === "orders" && segments[1] && segments.length === 2) {
      if (!/^[A-Za-z0-9-]{8,80}$/.test(segments[1])) return applySessionCookie(json({ ok: false, code: "order_not_found" }, 404));
      const result = await statusForTelegramOrder(env, session.customerId, segments[1], session.botConfigId);
      return applySessionCookie(result ? json({ ok: true, ...result }) : json({ ok: false, code: "order_not_found" }, 404));
    }
    if (request.method === "POST" && segments[0] === "checkout" && segments.length === 1) {
      const input = await body(request);
      if (!input || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 8) return applySessionCookie(json({ ok: false, code: "invalid_payload" }, 400));
      // Platform-wave Mini App clients always attach an attribution
      // externalReference (ref/promo/channel + per-order nonce). Rejecting that
      // field made checkout return invalid_payload before any order, VietQR, or
      // key delivery could run. Keep the allowlist tight but include it.
      const allowedCheckoutKeys = new Set(["items", "idempotencyKey", "discountCode", "externalReference"]);
      if (Object.keys(input).some((key) => !allowedCheckoutKeys.has(key))) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload" }, 400));
      }
      const checkout = validateCheckoutQuoteInput({
        items: input.items,
        locale,
        ...(input.discountCode !== undefined ? { discountCode: input.discountCode } : {}),
      });
      if (!checkout.ok || checkout.value.items.length > 8) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload", issues: checkout.ok ? [{ path: "items", code: "too_many_items" }] : checkout.issues }, 400));
      }
      const items = checkout.value.items;
      const idempotencyKey = typeof input.idempotencyKey === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(input.idempotencyKey) ? input.idempotencyKey : crypto.randomUUID();
      const discountCode = checkout.value.discountCode ?? null;
      const externalReference = typeof input.externalReference === "string"
        ? input.externalReference.trim().slice(0, 180)
        : "";
      if (input.externalReference !== undefined && (typeof input.externalReference !== "string" || !externalReference)) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload" }, 400));
      }
      const result = await checkoutTelegramItems(env, {
        user: session.user,
        locale,
        botConfigId: session.botConfigId,
        items,
        discountCode,
        idempotencyKey,
        ...(externalReference ? { externalReference } : {}),
      });
      return applySessionCookie(json({
        ok: true,
        order: {
          id: result.order.orderId,
          number: result.order.orderNumber,
          reference: result.order.orderReference,
          totalMinor: result.order.totalMinor,
          currency: result.order.currency,
          expiresAt: result.order.expiresAt,
        },
        payment: result.payment,
        paymentConfiguration: result.paymentConfiguration,
      }, 201));
    }
    if (request.method === "POST" && segments[0] === "orders" && segments[1] && segments[2] === "keys" && segments.length === 3) {
      if (!/^[A-Za-z0-9-]{8,80}$/.test(segments[1])) return applySessionCookie(json({ ok: false, code: "order_not_found" }, 404));
      const input = await body(request);
      if (!input || Array.isArray(input) || Object.keys(input).length !== 0) {
        return applySessionCookie(json({ ok: false, code: "invalid_payload" }, 400));
      }
      const delivery = await revealKeysForTelegramOrder(env, session.customerId, segments[1], session.botConfigId);
      // Keep the Mini App contract aligned with the public/account delivery
      // APIs: `deliveries` is always the line-item array, not the wrapper
      // result. Returning the wrapper here made the client call `.flatMap()`
      // on an object after fulfillment had already succeeded.
      return applySessionCookie(json({
        ok: true,
        orderId: delivery.orderId,
        orderNumber: delivery.orderNumber,
        state: delivery.state,
        deliveredAt: delivery.deliveredAt,
        deliveries: delivery.deliveries,
      }));
    }
    return applySessionCookie(json({ ok: false, code: "not_found" }, 404));
  } catch (error) {
    if (error instanceof ShopConflictError) {
      if (error.code === "discount_quote_rate_limited") {
        const response = json({ ok: false, code: error.code }, 429);
        response.headers.set("retry-after", "60");
        return applySessionCookie(response);
      }
      if (error.code === "key_reveal_rate_limited") {
        const response = json({ ok: false, code: error.code }, 429);
        response.headers.set("retry-after", "3600");
        return applySessionCookie(response);
      }
      return applySessionCookie(json({ ok: false, code: error.code }, error.code === "order_not_found" ? 404 : 409));
    }
    console.error(JSON.stringify({ event: "telegram_mini_app_failed", path: segments[0] || "root" }));
    return applySessionCookie(json({ ok: false, code: "telegram_mini_app_unavailable" }, 503));
  }
}

export const GET: APIRoute = ({ request, params }) => handle(request, params.path);
export const POST: APIRoute = ({ request, params }) => handle(request, params.path);
export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
