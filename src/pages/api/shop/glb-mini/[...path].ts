import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  checkoutGlbTelegramItems,
  ensureTelegramCustomer,
  listTelegramCustomerOrders,
  getTelegramOwnedOrder,
  previewTelegramItems,
  revealKeysForTelegramOrder,
  statusForGlbTelegramOrder,
  statusSummaryForGlbTelegramOrder,
  type GlbTelegramCommerceBindings,
} from "../../../../lib/shop/telegram-commerce";
import { verifyTelegramMiniAppInitData } from "../../../../lib/shop/telegram-mini-auth";
import { listTelegramBotCredentials } from "../../../../lib/shop/telegram-bot-config";
import {
  assertTelegramMiniMutationOrigin,
  clearTelegramMiniSessionCookie,
  createTelegramMiniSession,
  getTelegramMiniSession,
  revokeTelegramMiniSession,
  TelegramMiniSessionError,
  type TelegramMiniSession,
} from "../../../../lib/shop/telegram-mini-session";
import type { TelegramUser } from "../../../../lib/shop/telegram";
import { cryptoAccountUid, cryptoQrUrl, listPublicCryptoPaymentMethods, ShopConflictError } from "../../../../lib/shop/service";
import { readPaymentProofMultipart, submitPaymentProof } from "../../../../lib/shop/payment-proofs";
import { validateCheckoutQuoteInput } from "../../../../lib/shop/validation";

export const prerender = false;

const GLB_SCOPE = "glb" as const;

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

async function readBody(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_000) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return null;
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
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

type GlbIdentity = { session: TelegramMiniSession; setCookie: string | null };

type GlbAuthResult =
  | { ok: true; user: TelegramUser; authDate: number; botConfigId: string; botVersion: number }
  | { ok: false; code: string };

async function verifyGlbIdentity(raw: string, request: Request): Promise<GlbAuthResult> {
  const hint = request.headers.get("x-telegram-bot-config")?.trim() || "";
  const credentials = env.CONTENT_DB && env.TELEGRAM_TOKEN_ENCRYPTION_SECRET
    ? await listTelegramBotCredentials(env.CONTENT_DB, env, GLB_SCOPE).catch(() => null)
    : null;
  if (!credentials) return { ok: false, code: "telegram_registry_unavailable" };
  // Telegram can keep an older Mini App URL (and therefore an older bot
  // hint) in its WebView cache. The hint only narrows verification order; if
  // it no longer exists, try the active GLB credentials instead.
  const hinted = hint ? credentials.filter((candidate) => candidate.configId === hint) : [];
  const ordered = hinted.length ? hinted : credentials;
  for (const credential of ordered) {
    const verified = await verifyTelegramMiniAppInitData(raw, credential.token);
    if (verified.ok) return { ...verified, botConfigId: credential.configId, botVersion: credential.authRevision };
  }
  return { ok: false, code: "telegram_auth_invalid" };
}

async function glbSessionBotValid(session: TelegramMiniSession) {
  if (!env.CONTENT_DB || session.botConfigId.length < 8) return false;
  const row = await env.CONTENT_DB.prepare(`SELECT auth_revision, status, previous_expires_at
    FROM shop_telegram_bot_configs WHERE id = ? AND scope = 'glb' LIMIT 1`).bind(session.botConfigId).first<{
    auth_revision: number;
    status: string;
    previous_expires_at: string | null;
  }>().catch(() => null);
  if (!row || row.auth_revision !== session.botVersion) return false;
  return row.status === "active" || (row.status === "previous" && Boolean(row.previous_expires_at && row.previous_expires_at > new Date().toISOString()));
}

async function authenticate(request: Request, allowInitDataBootstrap: boolean): Promise<{ ok: true; identity: GlbIdentity } | { ok: false; response: Response }> {
  if (!env.CONTENT_DB || !env.TELEGRAM_TOKEN_ENCRYPTION_SECRET) return { ok: false, response: json({ ok: false, code: "telegram_registry_unavailable" }, 503) };
  const raw = request.headers.get("x-telegram-init-data")?.trim() || "";
  const hadSessionCookie = /(?:^|;)\s*__Host-tg_mini_session=/.test(request.headers.get("cookie") ?? "");
  const authFailure = (response: Response) => {
    if (hadSessionCookie) response.headers.set("set-cookie", clearTelegramMiniSessionCookie());
    return { ok: false as const, response };
  };
  let existing = await getTelegramMiniSession(env, request);
  if (existing && (!await glbSessionBotValid(existing))) {
    await revokeTelegramMiniSession(env, request).catch(() => undefined);
    existing = null;
  }

  // New GLB clients send signed initData only to the bootstrap request. All
  // subsequent requests use the opaque HttpOnly session, avoiding repeated
  // registry reads, token decryptions, and HMAC verification during polling.
  if (existing && !raw) {
    if (allowInitDataBootstrap) return authFailure(json({ ok: false, code: "telegram_auth_required" }, 401));
    return { ok: true, identity: { session: existing, setCookie: null } };
  }
  if (existing && raw && !allowInitDataBootstrap) {
    // Keep old GLB bundles compatible. They still pay the verification cost,
    // while the current bundle omits initData after its session is issued.
    const legacyAuth = await verifyGlbIdentity(raw, request);
    if (!legacyAuth.ok) return authFailure(json({ ok: false, code: legacyAuth.code }, legacyAuth.code === "telegram_auth_expired" ? 401 : 403));
    if (legacyAuth.user.id !== existing.telegramUserId || legacyAuth.botConfigId !== existing.botConfigId) {
      await revokeTelegramMiniSession(env, request).catch(() => undefined);
      return authFailure(json({ ok: false, code: "telegram_session_required" }, 401));
    }
    return { ok: true, identity: { session: existing, setCookie: null } };
  }
  if (!raw) return authFailure(json({ ok: false, code: "telegram_auth_required" }, 401));

  const auth = await verifyGlbIdentity(raw, request);
  if (!auth.ok) return authFailure(json({ ok: false, code: auth.code }, auth.code === "telegram_auth_expired" ? 401 : 403));
  if (existing && existing.telegramUserId === auth.user.id && existing.botConfigId === auth.botConfigId) {
    return { ok: true, identity: { session: existing, setCookie: null } };
  }
  if (existing) await revokeTelegramMiniSession(env, request).catch(() => undefined);

  try {
    const customer = await ensureTelegramCustomer(env, auth.user, "en");
    const session = await createTelegramMiniSession(env, {
      request,
      initData: raw,
      authDate: auth.authDate,
      user: auth.user,
      customerId: customer.customerId,
      locale: "en",
      botConfigId: auth.botConfigId,
      botVersion: auth.botVersion,
    });
    return { ok: true, identity: { session, setCookie: session.cookie } };
  } catch (error) {
    if (error instanceof TelegramMiniSessionError) {
      return authFailure(json({ ok: false, code: error.code }, error.code === "telegram_auth_replayed" ? 401 : 503));
    }
    return authFailure(json({ ok: false, code: "telegram_session_unavailable" }, 503));
  }
}

function glbBindings(): GlbTelegramCommerceBindings {
  return {
    CONTENT_DB: env.CONTENT_DB,
    SHOP_ORDER_TOKEN_SECRET: env.SHOP_ORDER_TOKEN_SECRET,
    SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
    SHOP_KEY_ENCRYPTION_SECRET: env.SHOP_KEY_ENCRYPTION_SECRET,
    SHOP_KEY_ENCRYPTION_KEY_VERSION: env.SHOP_KEY_ENCRYPTION_KEY_VERSION,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof ShopConflictError) {
    const status = error.code === "order_not_found" ? 404 : error.code === "checkout_rate_limited" ? 429 : 409;
    return json({ ok: false, code: error.code }, status);
  }
  const code = error instanceof Error ? error.message : "glb_store_unavailable";
  const safe = /^([a-z0-9]+_?)+$/.test(code) ? code.slice(0, 100) : "glb_store_unavailable";
  const status = safe === "crypto_payment_method_not_configured" || safe === "payment_proof_storage_unavailable" ? 503
    : ["invalid_payment_proof", "invalid_transaction_reference", "payment_proof_or_reference_required"].includes(safe) ? 422
      : ["payment_not_available", "crypto_payment_not_available"].includes(safe) ? 409 : 502;
  return json({ ok: false, code: safe }, status);
}

export const ALL: APIRoute = async ({ request, params }) => {
  const path = (params.path || "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const allowInitDataBootstrap = method === "GET" && path[0] === "session" && path.length === 1;
  const authentication = await authenticate(request, allowInitDataBootstrap);
  if (!authentication.ok) return authentication.response;
  const { session, setCookie } = authentication.identity;
  const applySessionCookie = (response: Response) => {
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  };
  if (method === "POST" && !assertTelegramMiniMutationOrigin(request, env)) return applySessionCookie(json({ ok: false, code: "origin_mismatch" }, 403));
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const bindings = glbBindings();
  try {
    const customer = { customerId: session.customerId, displayName: session.user.first_name };
    if (method === "GET" && path[0] === "session" && path.length === 1) {
      return applySessionCookie(json({ ok: true, user: { id: session.user.id, firstName: session.user.first_name, username: session.user.username || null }, botConfigId: session.botConfigId }));
    }
    if (method === "GET" && path[0] === "me" && path.length === 1) {
      const orders = await listTelegramCustomerOrders(env, customer.customerId, 20, session.botConfigId);
      return applySessionCookie(json({ ok: true, user: { id: session.user.id, firstName: session.user.first_name, username: session.user.username || null }, customer: { displayName: customer.displayName }, orders }));
    }
    if (method === "GET" && path[0] === "methods" && path.length === 1) {
      const methods = await listPublicCryptoPaymentMethods(env);
      return applySessionCookie(json({ ok: true, methods: methods.map((item) => ({ id: item.id, provider: item.provider, rail: item.rail, asset: item.asset, network: item.network, destinationType: item.destinationType, destination: item.destinationValue, memoOrTag: item.memoOrTag, displayName: item.displayName, expiryMinutes: item.expiryMinutes, qrUrl: item.destinationType === "uid" ? null : cryptoQrUrl(item.publicConfig), accountUid: item.destinationType === "uid" ? cryptoAccountUid(item.publicConfig) : null })) }));
    }
    if (method === "POST" && path[0] === "quote" && path.length === 1) {
      const payload = await readBody(request);
      const parsed = validateCheckoutQuoteInput({ items: payload?.items, locale: "en", ...(payload?.discountCode !== undefined ? { discountCode: payload.discountCode } : {}) });
      if (!parsed.ok || parsed.value.items.length > 8) return json({ ok: false, code: "invalid_payload", ...(parsed.ok ? {} : { issues: parsed.issues }) }, 400);
      const quote = await previewTelegramItems({ CONTENT_DB: env.CONTENT_DB, SHOP_ORDER_TOKEN_SECRET: env.SHOP_ORDER_TOKEN_SECRET }, { customerId: customer.customerId, telegramUserId: session.user.id, locale: "en", pricingCurrency: "USD", items: parsed.value.items, discountCode: parsed.value.discountCode });
      return applySessionCookie(json({ ok: true, ...quote, currency: "USD" }));
    }
    if (method === "POST" && path[0] === "checkout" && path.length === 1) {
      const payload = await readBody(request);
      const parsed = validateCheckoutQuoteInput({ items: payload?.items, locale: "en", ...(payload?.discountCode !== undefined ? { discountCode: payload.discountCode } : {}) });
      if (!parsed.ok || parsed.value.items.length > 8) return json({ ok: false, code: "invalid_payload", ...(parsed.ok ? {} : { issues: parsed.issues }) }, 400);
      const externalReference = typeof payload?.externalReference === "string" ? payload.externalReference.trim().slice(0, 180) : "";
      const result = await checkoutGlbTelegramItems(bindings, {
        user: session.user,
        botConfigId: session.botConfigId,
        items: parsed.value.items,
        discountCode: parsed.value.discountCode,
        paymentMethodId: typeof payload?.paymentMethodId === "string" ? payload.paymentMethodId : undefined,
        idempotencyKey: typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey : undefined,
        ...(externalReference ? { externalReference } : {}),
      });
      return applySessionCookie(json({ ok: true, order: { id: result.order.orderId, number: result.order.orderNumber, reference: result.order.orderReference, currency: result.order.currency, totalMinor: result.order.totalMinor, accessToken: result.order.orderAccessToken }, payment: result.payment }));
    }
    if (path[0] === "orders" && path[1] && path.length === 2 && method === "GET") {
      const result = await statusForGlbTelegramOrder(bindings, customer.customerId, path[1], session.botConfigId);
      return applySessionCookie(result ? json({ ok: true, ...result }) : json({ ok: false, code: "order_not_found" }, 404));
    }
    if (path[0] === "orders" && path[1] && path[2] === "status" && path.length === 3 && method === "GET") {
      const result = await statusSummaryForGlbTelegramOrder(bindings, customer.customerId, path[1], session.botConfigId);
      return applySessionCookie(result ? json({ ok: true, ...result }) : json({ ok: false, code: "order_not_found" }, 404));
    }
    if (path[0] === "orders" && path[1] && path[2] === "payment-proof" && path.length === 3 && method === "POST") {
      const owned = await getTelegramOwnedOrder(bindings, customer.customerId, path[1], session.botConfigId);
      if (!owned) return applySessionCookie(json({ ok: false, code: "order_not_found" }, 404));
      const parsed = await readPaymentProofMultipart(request);
      if ("error" in parsed) return applySessionCookie(json({ ok: false, code: parsed.error }, parsed.error === "payload_too_large" ? 413 : parsed.error === "invalid_content_type" ? 415 : 400));
      const proof = await submitPaymentProof({ CONTENT_DB: env.CONTENT_DB, MEDIA: env.MEDIA }, {
        orderId: owned.id,
        upload: parsed.upload,
        actor: `telegram:${session.user.id}`,
      });
      return applySessionCookie(json({ ok: true, proof }, 201));
    }
    if (path[0] === "orders" && path[1] && path[2] === "keys" && path.length === 3 && method === "POST") {
      const delivery = await revealKeysForTelegramOrder(bindings, customer.customerId, path[1], session.botConfigId);
      return applySessionCookie(json({ ok: true, delivery }));
    }
    return applySessionCookie(json({ ok: false, code: "not_found" }, 404));
  } catch (error) {
    return applySessionCookie(errorResponse(error));
  }
};

export const GET = ALL;
export const POST = ALL;
