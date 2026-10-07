import { buildMagicLinkEmail } from "../email/auth-templates";
import { CloudflareEmailProvider } from "../email/provider";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  createCustomerSession,
  publicOrigin,
  recordCustomerSecurityEvent,
  sanitizeReturnPath,
  type IssuedSession,
} from "./customer-auth";
import { upsertVerifiedCustomerIdentity, CustomerAccountError } from "./customer-account";
import { randomOpaqueToken, sha256Base64Url } from "./crypto";
import type { ShopBindings, ShopLocale } from "./types";
import { normalizeShopEmail } from "./validation";

const MAGIC_RATE_WINDOW_SECONDS = 15 * 60;
const MAGIC_RATE_MAX = 5;

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

export function isMagicLinkEmailConfigured(bindings: Pick<ShopBindings, "SHOP_EMAIL" | "TRANSACTIONAL_EMAIL_FROM_ADDRESS" | "SHOP_PUBLIC_ORIGIN">) {
  return Boolean(
    bindings.SHOP_EMAIL
    && bindings.TRANSACTIONAL_EMAIL_FROM_ADDRESS?.trim()
    && bindings.SHOP_PUBLIC_ORIGIN?.trim(),
  );
}

async function consumeMagicRateLimit(db: D1Database, subjectHash: string) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const windowStartedAt = Math.floor(nowSeconds / MAGIC_RATE_WINDOW_SECONDS) * MAGIC_RATE_WINDOW_SECONDS;
  const expiresAt = nowSeconds + MAGIC_RATE_WINDOW_SECONDS * 2;
  const results = await db.batch([
    db.prepare("DELETE FROM shop_checkout_rate_limits WHERE expires_at <= ?").bind(nowSeconds),
    db.prepare(`INSERT INTO shop_checkout_rate_limits (subject_hash, window_started_at, request_count, expires_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(subject_hash) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        request_count = CASE WHEN shop_checkout_rate_limits.window_started_at = excluded.window_started_at THEN shop_checkout_rate_limits.request_count + 1 ELSE 1 END,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
      WHERE shop_checkout_rate_limits.window_started_at != excluded.window_started_at
        OR shop_checkout_rate_limits.request_count < ?`).bind(
      subjectHash,
      windowStartedAt,
      expiresAt,
      nowIso(),
      MAGIC_RATE_MAX,
    ),
  ]);
  return results[1]?.meta.changes === 1;
}

export async function requestMagicLink(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_EMAIL" | "TRANSACTIONAL_EMAIL_FROM_ADDRESS" | "TRANSACTIONAL_EMAIL_FROM_NAME" | "SHOP_PUBLIC_ORIGIN">,
  input: {
    email: string;
    locale?: ShopLocale;
    returnPath?: string | null;
    requestId?: string;
    remoteIp?: string | null;
  },
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  // Always-ish success responses for valid-shaped emails to reduce enumeration.
  const email = normalizeShopEmail(input.email);
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "email_invalid", status: 422 };
  }
  if (!bindings.CONTENT_DB) return { ok: false, code: "shop_database_not_configured", status: 503 };
  if (!isMagicLinkEmailConfigured(bindings)) {
    return { ok: false, code: "magic_link_not_configured", status: 503 };
  }

  // shop_checkout_rate_limits.subject_hash is fixed 43-char base64url (SHA-256).
  const subjectHash = await sha256Base64Url(`magic-link\0${email}\0${input.remoteIp ?? "unknown"}`);
  if (subjectHash.length !== 43) return { ok: false, code: "rate_limit_unavailable", status: 503 };
  const allowed = await consumeMagicRateLimit(bindings.CONTENT_DB, subjectHash);
  if (!allowed) {
    // Still return ok to avoid enumeration/timing oracle on rate limit vs success.
    await recordCustomerSecurityEvent(bindings, {
      eventType: "magic_request",
      requestId: input.requestId,
      details: { limited: true },
    });
    return { ok: true };
  }

  const token = randomOpaqueToken(32);
  const redirectPath = sanitizeReturnPath(input.returnPath);
  const locale: ShopLocale = input.locale === "en" || input.locale === "ja" || input.locale === "zh" ? input.locale : "vi";
  await createAuthChallenge(bindings, {
    kind: "magic_link",
    provider: "email",
    publicToken: token,
    redirectPath,
    email,
    payload: { locale },
  });

  const origin = publicOrigin(bindings);
  const verificationUrl = `${origin}/api/shop/auth/magic-link/consume?token=${encodeURIComponent(token)}`;
  const message = buildMagicLinkEmail({
    recipient: { email },
    magicUrl: verificationUrl,
    locale,
    from: {
      email: bindings.TRANSACTIONAL_EMAIL_FROM_ADDRESS!.trim(),
      name: bindings.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "TUNG Shop",
    },
  });

  try {
    const provider = new CloudflareEmailProvider(bindings.SHOP_EMAIL!);
    await provider.send(message);
  } catch (error) {
    console.error(JSON.stringify({
      event: "magic_link_send_failed",
      requestId: input.requestId,
      code: error instanceof Error ? error.message : "send_failed",
    }));
    // Still ok: true — do not reveal delivery failure as "invalid email".
  }

  await recordCustomerSecurityEvent(bindings, {
    eventType: "magic_request",
    requestId: input.requestId,
    details: { sent: true },
  });
  return { ok: true };
}

export async function consumeMagicLink(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  input: {
    token: string | null;
    request: Request;
    requestId?: string;
  },
): Promise<{ redirectPath: string; session: IssuedSession } | { error: string; status: number }> {
  if (!input.token || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
    return { error: "magic_link_invalid", status: 400 };
  }
  const challenge = await consumeAuthChallenge(bindings, {
    kind: "magic_link",
    publicToken: input.token,
    provider: "email",
  });
  if (!challenge || !challenge.emailNormalized) {
    return { error: "magic_link_invalid", status: 400 };
  }

  let locale: ShopLocale = "vi";
  try {
    const payload = JSON.parse(challenge.payloadJson) as { locale?: string };
    if (payload.locale === "en" || payload.locale === "ja" || payload.locale === "zh") locale = payload.locale;
  } catch {
    // default locale
  }

  try {
    const customer = await upsertVerifiedCustomerIdentity(bindings, {
      provider: "email",
      externalSubject: challenge.emailNormalized,
      email: challenge.emailNormalized,
      displayHandle: challenge.emailNormalized,
      locale,
    });
    const session = await createCustomerSession(bindings, {
      customerId: customer.id,
      authProvider: "email",
      request: input.request,
      metadata: { provider: "email" },
    });
    if (!session) return { error: "session_not_configured", status: 503 };
    await recordCustomerSecurityEvent(bindings, {
      customerId: customer.id,
      eventType: "login",
      requestId: input.requestId,
      details: { provider: "email" },
    });
    return {
      redirectPath: sanitizeReturnPath(challenge.redirectPath),
      session,
    };
  } catch (error) {
    if (error instanceof CustomerAccountError && error.code === "customer_blocked") {
      return { error: "customer_blocked", status: 403 };
    }
    console.error(JSON.stringify({
      event: "magic_link_consume_failed",
      requestId: input.requestId,
      code: error instanceof Error ? error.message : "unknown",
    }));
    return { error: "magic_link_failed", status: 503 };
  }
}
