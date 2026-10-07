import { randomOpaqueToken, sha256Base64Url } from "./crypto";
import type { ShopBindings, ShopLocale } from "./types";
import { maskShopEmail, normalizeShopEmail } from "./validation";

const SESSION_COOKIE = "__Host-shop_session";
const OAUTH_STATE_COOKIE = "__Host-shop_oauth_state";
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const SESSION_SLIDING_REFRESH_SECONDS = 24 * 60 * 60;
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1_000;
const TOKEN_BYTES = 32;
const OAUTH_CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1_000;

export type CustomerAuthProvider = "google" | "github" | "email";

export type CustomerSession = {
  tokenHash: string;
  customerId: string;
  emailNormalized: string | null;
  emailMasked: string | null;
  displayName: string;
  locale: ShopLocale;
  status: "active" | "blocked" | "archived";
  authProvider: CustomerAuthProvider;
  expiresAt: string;
};

export type IssuedSession = {
  token: string;
  cookie: string;
  expiresAt: string;
  tokenHash: string;
};

export type AuthChallengeKind = "oauth_state" | "magic_link";

export type AuthChallengeRecord = {
  id: string;
  kind: AuthChallengeKind;
  provider: CustomerAuthProvider | null;
  tokenHash: string;
  redirectPath: string | null;
  emailNormalized: string | null;
  payloadJson: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function requireDb(bindings: Pick<ShopBindings, "CONTENT_DB">) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  return bindings.CONTENT_DB;
}

export function isCustomerSessionSecretConfigured(secret: string | undefined) {
  return Boolean(secret && secret.trim().length >= 32);
}

function sessionSecret(bindings: Pick<ShopBindings, "SHOP_CUSTOMER_SESSION_SECRET">) {
  const secret = bindings.SHOP_CUSTOMER_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function toBase64Url(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacBase64Url(secret: string, purpose: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${purpose}\0${value}`),
  );
  return toBase64Url(signature);
}

export async function hashCustomerSessionToken(token: string, secret: string) {
  return hmacBase64Url(secret, "shop-customer-session-v1", token);
}

export async function hashAuthChallengeToken(token: string) {
  return sha256Base64Url(`shop-auth-challenge-v1\0${token}`);
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
}

export function issueCustomerSessionCookie(now = Date.now()): IssuedSession {
  const token = randomOpaqueToken(TOKEN_BYTES);
  const expiresAt = new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toUTCString()}; Secure; HttpOnly; SameSite=Lax`;
  return { token, cookie, expiresAt, tokenHash: "" };
}

export function clearCustomerSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`;
}

export function issueOAuthStateCookie(state: string, maxAgeSeconds = 600) {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * Only same-site relative paths under shop/account (locale-aware). Blocks open redirects.
 */
export function sanitizeReturnPath(value: string | null | undefined, fallback = "/shop/account"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("\0")) {
    return fallback;
  }
  try {
    const url = new URL(trimmed, "https://tung.codes");
    if (url.origin !== "https://tung.codes") return fallback;
    const path = `${url.pathname}${url.search}`;
    const allowed = /^\/(en|ja|zh|vi)?\/?shop(\/account(\/.*)?)?$/.test(url.pathname)
      || /^\/(en|ja|zh|vi)?\/?shop\/order$/.test(url.pathname)
      || /^\/(en|ja|zh|vi)?\/?shop\/cart$/.test(url.pathname)
      || url.pathname === "/shop"
      || url.pathname === "/shop/"
      || /^\/(en|ja|zh|vi)\/shop\/?$/.test(url.pathname);
    if (!allowed) return fallback;
    if (path.length > 512) return fallback;
    return path;
  } catch {
    return fallback;
  }
}

export async function createCustomerSession(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  input: {
    customerId: string;
    authProvider: CustomerAuthProvider;
    request: Request;
    metadata?: Record<string, unknown>;
  },
  now = Date.now(),
): Promise<IssuedSession | null> {
  const secret = sessionSecret(bindings);
  if (!secret) return null;
  const db = requireDb(bindings);
  const issued = issueCustomerSessionCookie(now);
  const tokenHash = await hashCustomerSessionToken(issued.token, secret);
  const ua = input.request.headers.get("user-agent");
  const userAgentHash = ua ? await hmacBase64Url(secret, "shop-customer-ua-v1", ua.slice(0, 400)) : null;
  await db.prepare(`INSERT INTO shop_customer_sessions
    (token_hash, customer_id, auth_provider, created_at, last_seen_at, expires_at, user_agent_hash, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    tokenHash,
    input.customerId,
    input.authProvider,
    nowIso(now),
    nowIso(now),
    issued.expiresAt,
    userAgentHash,
    JSON.stringify(input.metadata ?? {}),
  ).run();
  return { ...issued, tokenHash };
}

export async function getCustomerSession(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  request: Request,
  now = Date.now(),
): Promise<CustomerSession | null> {
  const secret = sessionSecret(bindings);
  if (!secret || !bindings.CONTENT_DB) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await hashCustomerSessionToken(token, secret);
  const row = await bindings.CONTENT_DB.prepare(`SELECT s.token_hash, s.customer_id, s.auth_provider, s.expires_at, s.last_seen_at,
      c.email_normalized, c.email_masked, c.display_name, c.locale, c.status, c.deleted_at
    FROM shop_customer_sessions s
    JOIN shop_customers c ON c.id = s.customer_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
    LIMIT 1`).bind(tokenHash).first<{
      token_hash: string;
      customer_id: string;
      auth_provider: CustomerAuthProvider;
      expires_at: string;
      last_seen_at: string;
      email_normalized: string | null;
      email_masked: string | null;
      display_name: string;
      locale: ShopLocale;
      status: "active" | "blocked" | "archived";
      deleted_at: string | null;
    }>();
  if (!row || row.deleted_at || Date.parse(row.expires_at) <= now) return null;
  if (row.status !== "active") return null;

  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || now - lastSeen > LAST_SEEN_THROTTLE_MS) {
    const remainingMs = Date.parse(row.expires_at) - now;
    let nextExpires = row.expires_at;
    if (remainingMs < SESSION_SLIDING_REFRESH_SECONDS * 1_000) {
      nextExpires = new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
    }
    await bindings.CONTENT_DB.prepare(
      "UPDATE shop_customer_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    ).bind(nowIso(now), nextExpires, tokenHash).run().catch(() => undefined);
    row.expires_at = nextExpires;
  }

  return {
    tokenHash: row.token_hash,
    customerId: row.customer_id,
    emailNormalized: row.email_normalized,
    emailMasked: row.email_masked ?? (row.email_normalized ? maskShopEmail(row.email_normalized) : null),
    displayName: row.display_name,
    locale: row.locale,
    status: row.status,
    authProvider: row.auth_provider,
    expiresAt: row.expires_at,
  };
}

export async function requireCustomerSession(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  request: Request,
): Promise<CustomerSession> {
  const session = await getCustomerSession(bindings, request);
  if (!session) {
    const error = new Error("customer_auth_required");
    (error as Error & { code: string }).code = "customer_auth_required";
    throw error;
  }
  return session;
}

export async function revokeCustomerSession(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  request: Request,
): Promise<{ revoked: boolean; cookie: string }> {
  const secret = sessionSecret(bindings);
  const cookie = clearCustomerSessionCookie();
  if (!secret || !bindings.CONTENT_DB) return { revoked: false, cookie };
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { revoked: false, cookie };
  const tokenHash = await hashCustomerSessionToken(token, secret);
  const result = await bindings.CONTENT_DB.prepare(
    "UPDATE shop_customer_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
  ).bind(nowIso(), tokenHash).run();
  return { revoked: result.meta.changes === 1, cookie };
}

export async function createAuthChallenge(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: {
    kind: AuthChallengeKind;
    provider: CustomerAuthProvider;
    publicToken: string;
    redirectPath?: string | null;
    email?: string | null;
    payload?: Record<string, unknown>;
    ttlMs?: number;
  },
  now = Date.now(),
) {
  const db = requireDb(bindings);
  const id = crypto.randomUUID();
  const tokenHash = await hashAuthChallengeToken(input.publicToken);
  const ttl = input.ttlMs ?? (input.kind === "magic_link" ? MAGIC_LINK_TTL_MS : OAUTH_CHALLENGE_TTL_MS);
  const expiresAt = new Date(now + ttl).toISOString();
  const emailNormalized = input.email ? normalizeShopEmail(input.email) : null;
  await db.prepare(`INSERT INTO shop_auth_challenges
    (id, kind, provider, token_hash, redirect_path, email_normalized, payload_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    input.kind,
    input.provider,
    tokenHash,
    input.redirectPath ?? null,
    emailNormalized,
    JSON.stringify(input.payload ?? {}),
    nowIso(now),
    expiresAt,
  ).run();
  return { id, tokenHash, expiresAt };
}

export async function consumeAuthChallenge(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: { kind: AuthChallengeKind; publicToken: string; provider?: CustomerAuthProvider },
  now = Date.now(),
): Promise<AuthChallengeRecord | null> {
  const db = requireDb(bindings);
  const tokenHash = await hashAuthChallengeToken(input.publicToken);
  const row = await db.prepare(`SELECT id, kind, provider, token_hash, redirect_path, email_normalized,
      payload_json, created_at, expires_at, consumed_at
    FROM shop_auth_challenges WHERE token_hash = ? AND kind = ? LIMIT 1`).bind(tokenHash, input.kind).first<{
      id: string;
      kind: AuthChallengeKind;
      provider: CustomerAuthProvider | null;
      token_hash: string;
      redirect_path: string | null;
      email_normalized: string | null;
      payload_json: string;
      created_at: string;
      expires_at: string;
      consumed_at: string | null;
    }>();
  if (!row || row.consumed_at || Date.parse(row.expires_at) <= now) return null;
  if (input.provider && row.provider && row.provider !== input.provider) return null;
  const updated = await db.prepare(
    "UPDATE shop_auth_challenges SET consumed_at = ?, attempt_count = attempt_count + 1 WHERE id = ? AND consumed_at IS NULL AND expires_at > ?",
  ).bind(nowIso(now), row.id, nowIso(now)).run();
  if (updated.meta.changes !== 1) return null;
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    tokenHash: row.token_hash,
    redirectPath: row.redirect_path,
    emailNormalized: row.email_normalized,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: nowIso(now),
  };
}

export async function recordCustomerSecurityEvent(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: {
    customerId?: string | null;
    eventType: "login" | "logout" | "login_failed" | "magic_request" | "key_reveal" | "claim_order" | "blocked" | "oauth_start" | "session_purged";
    requestId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  if (!bindings.CONTENT_DB) return;
  try {
    await bindings.CONTENT_DB.prepare(`INSERT INTO shop_customer_security_events
      (id, customer_id, event_type, request_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      input.customerId ?? null,
      input.eventType,
      input.requestId ?? null,
      JSON.stringify(input.details ?? {}),
      nowIso(),
    ).run();
  } catch {
    // Telemetry must never break auth.
  }
}

export async function purgeExpiredCustomerAuth(db: D1Database, limit = 200) {
  const now = nowIso();
  const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
  const sessions = await db.prepare(`DELETE FROM shop_customer_sessions
    WHERE token_hash IN (
      SELECT token_hash FROM shop_customer_sessions
      WHERE expires_at <= ? OR revoked_at IS NOT NULL
      ORDER BY expires_at LIMIT ?
    )`).bind(now, bounded).run();
  const challenges = await db.prepare(`DELETE FROM shop_auth_challenges
    WHERE id IN (
      SELECT id FROM shop_auth_challenges
      WHERE expires_at <= ? OR consumed_at IS NOT NULL
      ORDER BY expires_at LIMIT ?
    )`).bind(now, bounded).run();
  return {
    sessionsDeleted: sessions.meta.changes,
    challengesDeleted: challenges.meta.changes,
  };
}

export function publicOrigin(bindings: Pick<ShopBindings, "SHOP_PUBLIC_ORIGIN">) {
  const origin = bindings.SHOP_PUBLIC_ORIGIN?.trim() || "https://tung.codes";
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "https://tung.codes";
    }
    return url.origin;
  } catch {
    return "https://tung.codes";
  }
}

export function jsonNoStore(body: Record<string, unknown>, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      ...headers,
    },
  });
}

export function setPrivateNoStore(headers: Headers) {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Cookie");
  headers.set("X-Robots-Tag", "noindex, nofollow");
}

export function assertSameOriginMutation(request: Request, bindings: Pick<ShopBindings, "SHOP_PUBLIC_ORIGIN">) {
  const originHeader = request.headers.get("origin");
  const expected = publicOrigin(bindings);
  if (originHeader) {
    try {
      if (new URL(originHeader).origin !== expected) return false;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (!originHeader && referer) {
    try {
      if (new URL(referer).origin !== expected) return false;
    } catch {
      return false;
    }
  }
  return true;
}
