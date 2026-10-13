import { otpBindings } from "../../../lib/shop/otp/bindings";
import { reconcileOtpGrants } from "../../../lib/shop/otp/reconciliation";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { dispatchTransactionalEmails } from "../../../lib/email/outbox";
import { CloudflareEmailProvider } from "../../../lib/email/provider";
import { purgeExpiredCustomerAuth } from "../../../lib/shop/customer-auth";
import { runShopExpirySweep, seedTestInventoryKeys } from "../../../lib/shop/service";
import { cleanupExpiredTelegramUpdates } from "../../../lib/shop/telegram";
import { purgeExpiredTelegramCarts } from "../../../lib/shop/telegram-commerce";
import { purgeExpiredTelegramMiniSessions } from "../../../lib/shop/telegram-mini-session";
import { dispatchTelegramPaidOrderNotifications } from "../../../lib/shop/telegram-outbox";
import { retireExpiredTelegramPreviousBots, retireLegacyEnvironmentTelegramWebhook } from "../../../lib/shop/telegram-bot-config";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

/**
 * Private maintenance hook called by the Worker cron handler. It is not an
 * admin UI endpoint: the secret is kept in the Worker secret store and no
 * sweep details are returned to unauthenticated callers.
 */
export const POST: APIRoute = async ({ request }) => {
  const configured = env.SHOP_CRON_SECRET?.trim();
  if (!configured) return json({ ok: false, code: "maintenance_not_configured" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!provided || provided.length !== configured.length) return json({ ok: false, code: "maintenance_unauthorized" }, 401);

  // Compare HMACs under a fixed, unrelated key so the secret itself never
  // enters a direct equality operation.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("tungjpstore.shop.maintenance.compare.v1"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [expected, actual] = await Promise.all([
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(configured)),
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(provided)),
  ]);
  const left = new Uint8Array(expected);
  const right = new Uint8Array(actual);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  if (mismatch !== 0) return json({ ok: false, code: "maintenance_unauthorized" }, 401);

  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);

  // Optional one-shot test inventory seed. Body must explicitly confirm to avoid accidental runs
  // from the normal cron schedule (cron sends "{}").
  let seedConfirm = "";
  let keysPerVariant = 100;
  // Default true: only variants with zero inventory units receive synthetic keys.
  let onlyEmpty = true;
  let productSlugs: string[] = [];
  let emailDomain: string | undefined;
  try {
    const body = await request.clone().json() as {
      action?: unknown;
      confirm?: unknown;
      keysPerVariant?: unknown;
      onlyEmpty?: unknown;
      productSlugs?: unknown;
      emailDomain?: unknown;
    };
    if (body && typeof body === "object") {
      if (body.action === "seed_test_inventory" && body.confirm === "SEED_TEST_INVENTORY") {
        seedConfirm = "SEED_TEST_INVENTORY";
        if (typeof body.keysPerVariant === "number" && Number.isSafeInteger(body.keysPerVariant)) {
          keysPerVariant = Math.max(1, Math.min(500, body.keysPerVariant));
        }
        if (typeof body.onlyEmpty === "boolean") onlyEmpty = body.onlyEmpty;
        if (Array.isArray(body.productSlugs)) {
          productSlugs = body.productSlugs
            .filter((slug): slug is string => typeof slug === "string")
            .map((slug) => slug.trim().toLowerCase())
            .filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug))
            .slice(0, 20);
        }
        if (typeof body.emailDomain === "string") {
          const domain = body.emailDomain.trim().toLowerCase();
          if (/^[a-z0-9.-]{3,80}$/.test(domain)) emailDomain = domain;
        }
      }
    }
  } catch {
    // Cron and empty bodies fall through to the normal sweep path.
  }

  if (seedConfirm === "SEED_TEST_INVENTORY") {
    try {
      const seed = await seedTestInventoryKeys({
        CONTENT_DB: env.CONTENT_DB,
        SHOP_KEY_ENCRYPTION_SECRET: env.SHOP_KEY_ENCRYPTION_SECRET,
        SHOP_KEY_ENCRYPTION_KEY_VERSION: env.SHOP_KEY_ENCRYPTION_KEY_VERSION,
      }, { keysPerVariant, onlyEmpty, productSlugs, emailDomain, requestId: crypto.randomUUID() });
      return json({ ok: true, seed });
    } catch (error) {
      console.error(JSON.stringify({
        event: "shop_seed_test_inventory_failed",
        code: error instanceof Error ? error.message : "unknown_error",
      }));
      return json({ ok: false, code: "seed_test_inventory_failed" }, 503);
    }
  }

  try {
    const sweep = await runShopExpirySweep({
      CONTENT_DB: env.CONTENT_DB,
      VIETQR_BANK_ACCOUNT: env.VIETQR_BANK_ACCOUNT,
      PAYOS_CLIENT_ID: env.PAYOS_CLIENT_ID,
      PAYOS_API_KEY: env.PAYOS_API_KEY,
      PAYOS_CHECKSUM_KEY: env.PAYOS_CHECKSUM_KEY,
      SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
    });
    const telegram = await dispatchTelegramPaidOrderNotifications({
      CONTENT_DB: env.CONTENT_DB,
      SHOP_KEY_ENCRYPTION_SECRET: env.SHOP_KEY_ENCRYPTION_SECRET,
      SHOP_KEY_ENCRYPTION_KEY_VERSION: env.SHOP_KEY_ENCRYPTION_KEY_VERSION,
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_TOKEN_ENCRYPTION_SECRET: env.TELEGRAM_TOKEN_ENCRYPTION_SECRET,
      TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: env.TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION,
      TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: env.TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
      SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
    });
    const emailFrom = env.TRANSACTIONAL_EMAIL_FROM_ADDRESS?.trim() ?? "";
    const publicOrigin = env.SHOP_PUBLIC_ORIGIN?.trim() ?? "";
    const email = emailFrom && publicOrigin && env.SHOP_EMAIL
      ? {
          configured: true,
          shop: await dispatchTransactionalEmails({
            db: env.CONTENT_DB,
            source: "shop",
            provider: new CloudflareEmailProvider(env.SHOP_EMAIL),
            from: { email: emailFrom, name: env.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "TUNG Shop" },
            origin: publicOrigin,
            deliverKeysByEmail: env.TRANSACTIONAL_EMAIL_DELIVER_KEYS === "1",
            cryptoBindings: {
              SHOP_KEY_ENCRYPTION_SECRET: env.SHOP_KEY_ENCRYPTION_SECRET,
              SHOP_KEY_ENCRYPTION_KEY_VERSION: env.SHOP_KEY_ENCRYPTION_KEY_VERSION,
            },
          }),
          contact: env.CONTACT_DB
            ? await dispatchTransactionalEmails({
                db: env.CONTACT_DB,
                source: "contact",
                provider: new CloudflareEmailProvider(env.SHOP_EMAIL),
                from: { email: emailFrom, name: env.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "TUNG Shop" },
                origin: publicOrigin,
              })
            : null,
        }
      : { configured: false, shop: null, contact: null };
    const otp = env.SHOP_OTP_ENABLED === "true" ? await reconcileOtpGrants(otpBindings(env)).catch(() => ({ activated: 0, pending: 0 })) : { activated: 0, pending: 0 };
    const customerAuth = await purgeExpiredCustomerAuth(env.CONTENT_DB, 200).catch(() => ({
      sessionsDeleted: 0,
      challengesDeleted: 0,
    }));
    const [telegramUpdatesDeleted, telegramCartsDeleted, telegramMiniSessionsDeleted, telegramBots, telegramLegacyWebhook] = await Promise.all([
      cleanupExpiredTelegramUpdates(env.CONTENT_DB, 200).catch(() => 0),
      purgeExpiredTelegramCarts(env.CONTENT_DB, 100).catch(() => 0),
      purgeExpiredTelegramMiniSessions(env.CONTENT_DB, 200).catch(() => 0),
      env.TELEGRAM_TOKEN_ENCRYPTION_SECRET
        ? retireExpiredTelegramPreviousBots(env.CONTENT_DB, {
            SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
            TELEGRAM_TOKEN_ENCRYPTION_SECRET: env.TELEGRAM_TOKEN_ENCRYPTION_SECRET,
            TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: env.TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION,
            TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: env.TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
            TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
          }).catch(() => ({ examined: 0, retired: 0, failed: 1, skipped: 0 }))
        : Promise.resolve({ examined: 0, retired: 0, failed: 0, skipped: 0 }),
      env.TELEGRAM_TOKEN_ENCRYPTION_SECRET
        ? retireLegacyEnvironmentTelegramWebhook(env.CONTENT_DB, {
            SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
            TELEGRAM_TOKEN_ENCRYPTION_SECRET: env.TELEGRAM_TOKEN_ENCRYPTION_SECRET,
            TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: env.TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION,
            TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: env.TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
            TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
          }).catch(() => ({ examined: 0, retired: 0, failed: 1, skipped: 0 }))
        : Promise.resolve({ examined: 0, retired: 0, failed: 0, skipped: 0 }),
    ]);
    return json({
      ok: true,
      sweep,
      telegram,
      email,
      customerAuth,
      otp,
      telegramCleanup: {
        updatesDeleted: telegramUpdatesDeleted,
        cartsDeleted: telegramCartsDeleted,
        miniSessionsDeleted: telegramMiniSessionsDeleted,
        bots: telegramBots,
        legacyWebhook: telegramLegacyWebhook,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "shop_maintenance_failed", code: error instanceof Error ? error.message : "unknown_error" }));
    return json({ ok: false, code: "maintenance_failed" }, 503);
  }
};

export const ALL: APIRoute = ({ request }) => request.method === "POST"
  ? POST({ request } as Parameters<NonNullable<typeof POST>>[0])
  : json({ ok: false, code: "method_not_allowed" }, 405);
