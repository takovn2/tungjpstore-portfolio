import { randomOpaqueToken, sha256Base64Url } from "./crypto";
import type { TelegramUser } from "./telegram";
import type { ShopBindings, ShopLocale } from "./types";

const SESSION_COOKIE = "__Host-tg_mini_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1_000;
const BOOTSTRAP_RECOVERY_MS = 2 * 60 * 1_000;
const TOKEN_BYTES = 32;
const sessionEncoder = new TextEncoder();

type TelegramMiniSessionBindings = Pick<
  ShopBindings,
  "CONTENT_DB" | "SHOP_PUBLIC_ORIGIN" | "SHOP_ORDER_TOKEN_SECRET" | "SHOP_CUSTOMER_SESSION_SECRET" | "TELEGRAM_MINI_APP_SESSION_SECRET"
>;

export type TelegramMiniSession = {
  tokenHash: string;
  telegramUserId: number;
  customerId: string;
  user: TelegramUser;
  locale: ShopLocale;
  botConfigId: string;
  botVersion: number;
  expiresAt: string;
};

export type IssuedTelegramMiniSession = TelegramMiniSession & {
  cookie: string;
};

export class TelegramMiniSessionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "TelegramMiniSessionError";
    this.code = code;
  }
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function sessionBase64Url(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sessionSecret(bindings: TelegramMiniSessionBindings) {
  const candidates = [
    bindings.TELEGRAM_MINI_APP_SESSION_SECRET,
    bindings.SHOP_ORDER_TOKEN_SECRET,
    bindings.SHOP_CUSTOMER_SESSION_SECRET,
  ];
  return candidates.map((value) => value?.trim()).find((value) => value && value.length >= 32) ?? null;
}

async function hmacBase64Url(secret: string, purpose: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    sessionEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return sessionBase64Url(await crypto.subtle.sign("HMAC", key, sessionEncoder.encode(`${purpose}\0${value}`)));
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(token: string, now = Date.now()) {
  const expires = new Date(now + SESSION_MAX_AGE_SECONDS * 1_000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${expires.toUTCString()}; Secure; HttpOnly; SameSite=Strict; Priority=High`;
}

async function hashTelegramInitData(raw: string) {
  // URLSearchParams normalizes equivalent percent-encoding. Length-framed JSON
  // prevents a captured initData payload bypassing replay fencing by merely
  // reordering fields or changing their wire encoding.
  const params = new URLSearchParams(raw);
  const signedHash = params.get("hash")?.toLowerCase() || "";
  const entries = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return sha256Base64Url(`telegram-mini-init-data-v3\0${JSON.stringify({ signedHash, entries })}`);
}

export function clearTelegramMiniSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict; Priority=High`;
}

function safeUserMetadata(raw: string, fallbackName: string, telegramUserId: number, locale: ShopLocale): TelegramUser {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      id: telegramUserId,
      first_name: typeof value.firstName === "string" && value.firstName ? value.firstName.slice(0, 80) : fallbackName.slice(0, 80),
      ...(typeof value.lastName === "string" && value.lastName ? { last_name: value.lastName.slice(0, 80) } : {}),
      ...(typeof value.username === "string" && value.username ? { username: value.username.slice(0, 64) } : {}),
      language_code: typeof value.languageCode === "string" && value.languageCode ? value.languageCode.slice(0, 16) : locale,
    };
  } catch {
    return { id: telegramUserId, first_name: fallbackName.slice(0, 80), language_code: locale };
  }
}

export async function createTelegramMiniSession(
  bindings: TelegramMiniSessionBindings,
  input: {
    request: Request;
    initData: string;
    authDate: number;
    user: TelegramUser;
    customerId: string;
    locale: ShopLocale;
    botConfigId?: string;
    botVersion?: number;
  },
  now = Date.now(),
): Promise<IssuedTelegramMiniSession> {
  const secret = sessionSecret(bindings);
  if (!secret || !bindings.CONTENT_DB) throw new TelegramMiniSessionError("telegram_session_not_configured");
  const botConfigId = input.botConfigId || "environment";
  const botVersion = input.botVersion || 1;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(botConfigId) || !Number.isSafeInteger(botVersion) || botVersion < 1) {
    throw new TelegramMiniSessionError("telegram_bot_context_invalid");
  }
  const telegramUserId = String(input.user.id);
  const initDataHash = await hashTelegramInitData(input.initData);
  const token = randomOpaqueToken(TOKEN_BYTES);
  const tokenHash = await hmacBase64Url(secret, "telegram-mini-session-v1", token);
  const userAgent = input.request.headers.get("user-agent")?.slice(0, 400) || null;
  const userAgentHash = userAgent ? await hmacBase64Url(secret, "telegram-mini-user-agent-v1", userAgent) : null;
  const createdAt = nowIso(now);
  const expiresAt = new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
  const firstName = input.user.first_name?.trim().slice(0, 80) || `Telegram ${input.user.id}`;
  const metadata = JSON.stringify({
    firstName,
    ...(input.user.last_name ? { lastName: input.user.last_name.slice(0, 80) } : {}),
    ...(input.user.username ? { username: input.user.username.slice(0, 64) } : {}),
    ...(input.user.language_code ? { languageCode: input.user.language_code.slice(0, 16) } : {}),
  });
  const issued = (): IssuedTelegramMiniSession => ({
    tokenHash,
    telegramUserId: input.user.id,
    customerId: input.customerId,
    user: { ...input.user, first_name: firstName },
    locale: input.locale,
    botConfigId,
    botVersion,
    expiresAt,
    cookie: sessionCookie(token, now),
  });

  const replay = await bindings.CONTENT_DB.prepare(`SELECT token_hash, telegram_user_id, customer_id,
      auth_date, user_agent_hash, auth_bot_config_id, auth_bot_version, created_at, recovered_at
    FROM shop_telegram_mini_sessions WHERE init_data_hash = ? LIMIT 1`).bind(initDataHash).first<{
    token_hash: string;
    telegram_user_id: string;
    customer_id: string;
    auth_date: number;
    user_agent_hash: string | null;
    auth_bot_config_id: string;
    auth_bot_version: number;
    created_at: string;
    recovered_at: string | null;
  }>();
  if (replay) {
    const created = Date.parse(replay.created_at);
    const recoverable = replay.telegram_user_id === telegramUserId
      && replay.customer_id === input.customerId
      && replay.auth_date === input.authDate
      && replay.auth_bot_config_id === botConfigId
      && (!replay.user_agent_hash || replay.user_agent_hash === userAgentHash)
      && !replay.recovered_at
      && Number.isFinite(created)
      && now - created >= 0
      && now - created <= BOOTSTRAP_RECOVERY_MS;
    if (recoverable) {
      const recovered = await bindings.CONTENT_DB.prepare(`UPDATE shop_telegram_mini_sessions SET
          token_hash = ?, user_agent_hash = ?, metadata_json = ?, auth_bot_version = ?, recovered_at = ?,
          last_seen_at = ?, expires_at = ?, revoked_at = NULL
        WHERE init_data_hash = ? AND token_hash = ? AND recovered_at IS NULL`).bind(
        tokenHash,
        userAgentHash,
        metadata,
        botVersion,
        createdAt,
        createdAt,
        expiresAt,
        initDataHash,
        replay.token_hash,
      ).run();
      if (recovered.meta.changes === 1) return issued();
    }
    throw new TelegramMiniSessionError("telegram_auth_replayed");
  }

  try {
    await bindings.CONTENT_DB.prepare(`INSERT INTO shop_telegram_mini_sessions
      (token_hash, telegram_user_id, customer_id, init_data_hash, auth_date, user_agent_hash,
        auth_bot_config_id, auth_bot_version, created_at, last_seen_at, expires_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      tokenHash,
      telegramUserId,
      input.customerId,
      initDataHash,
      input.authDate,
      userAgentHash,
      botConfigId,
      botVersion,
      createdAt,
      createdAt,
      expiresAt,
      metadata,
    ).run();
  } catch (error) {
    const racedReplay = await bindings.CONTENT_DB.prepare(
      "SELECT 1 AS found FROM shop_telegram_mini_sessions WHERE init_data_hash = ? LIMIT 1",
    ).bind(initDataHash).first<{ found: number }>().catch(() => null);
    if (racedReplay) throw new TelegramMiniSessionError("telegram_auth_replayed");
    throw error;
  }

  return issued();
}

export async function getTelegramMiniSession(
  bindings: TelegramMiniSessionBindings,
  request: Request,
  now = Date.now(),
): Promise<TelegramMiniSession | null> {
  const secret = sessionSecret(bindings);
  if (!secret || !bindings.CONTENT_DB) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await hmacBase64Url(secret, "telegram-mini-session-v1", token);
  const row = await bindings.CONTENT_DB.prepare(`SELECT s.token_hash, s.telegram_user_id, s.customer_id,
      s.user_agent_hash, s.auth_bot_config_id, s.auth_bot_version, s.metadata_json, s.last_seen_at, s.expires_at,
      c.display_name, c.locale, c.status, c.deleted_at
    FROM shop_telegram_mini_sessions s
    JOIN shop_customers c ON c.id = s.customer_id
    JOIN shop_customer_identities i ON i.customer_id = s.customer_id
      AND i.provider = 'telegram' AND i.external_subject = s.telegram_user_id
      AND i.verified_at IS NOT NULL
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
    LIMIT 1`).bind(tokenHash).first<{
    token_hash: string;
    telegram_user_id: string;
    customer_id: string;
    user_agent_hash: string | null;
    auth_bot_config_id: string;
    auth_bot_version: number;
    metadata_json: string;
    last_seen_at: string;
    expires_at: string;
    display_name: string;
    locale: ShopLocale;
    status: "active" | "blocked" | "archived";
    deleted_at: string | null;
  }>();
  if (!row || row.deleted_at || row.status !== "active" || Date.parse(row.expires_at) <= now) return null;
  const telegramUserId = Number(row.telegram_user_id);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return null;

  const userAgent = request.headers.get("user-agent")?.slice(0, 400) || null;
  const currentUserAgentHash = userAgent ? await hmacBase64Url(secret, "telegram-mini-user-agent-v1", userAgent) : null;
  if (row.user_agent_hash && currentUserAgentHash !== row.user_agent_hash) {
    await bindings.CONTENT_DB.prepare(
      "UPDATE shop_telegram_mini_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    ).bind(nowIso(now), tokenHash).run().catch(() => undefined);
    return null;
  }

  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || now - lastSeen > LAST_SEEN_THROTTLE_MS) {
    await bindings.CONTENT_DB.prepare(
      "UPDATE shop_telegram_mini_sessions SET last_seen_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
    ).bind(nowIso(now), tokenHash, nowIso(now)).run().catch(() => undefined);
  }
  const locale = row.locale === "en" || row.locale === "ja" || row.locale === "zh" ? row.locale : "vi";
  return {
    tokenHash: row.token_hash,
    telegramUserId,
    customerId: row.customer_id,
    user: safeUserMetadata(row.metadata_json, row.display_name || `Telegram ${telegramUserId}`, telegramUserId, locale),
    locale,
    botConfigId: row.auth_bot_config_id,
    botVersion: row.auth_bot_version,
    expiresAt: row.expires_at,
  };
}

export async function revokeTelegramMiniSession(bindings: TelegramMiniSessionBindings, request: Request) {
  const secret = sessionSecret(bindings);
  if (!secret || !bindings.CONTENT_DB) return { revoked: false, cookie: clearTelegramMiniSessionCookie() };
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { revoked: false, cookie: clearTelegramMiniSessionCookie() };
  const tokenHash = await hmacBase64Url(secret, "telegram-mini-session-v1", token);
  const result = await bindings.CONTENT_DB.prepare(
    "UPDATE shop_telegram_mini_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
  ).bind(nowIso(), tokenHash).run();
  return { revoked: result.meta.changes === 1, cookie: clearTelegramMiniSessionCookie() };
}

export async function purgeExpiredTelegramMiniSessions(db: D1Database, limit = 200) {
  const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await db.prepare(`DELETE FROM shop_telegram_mini_sessions
    WHERE token_hash IN (
      SELECT token_hash FROM shop_telegram_mini_sessions
      WHERE expires_at <= ? OR revoked_at IS NOT NULL
      ORDER BY expires_at LIMIT ?
    )`).bind(nowIso(), bounded).run();
  return result.meta.changes;
}

export function assertTelegramMiniMutationOrigin(request: Request, bindings: TelegramMiniSessionBindings) {
  const configuredOrigin = bindings.SHOP_PUBLIC_ORIGIN?.trim();
  if (!configuredOrigin) return false;
  let expected: string;
  try {
    const configured = new URL(configuredOrigin);
    if (configured.protocol !== "https:" || configured.pathname !== "/" || configured.search || configured.hash) return false;
    expected = configured.origin;
  } catch {
    return false;
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === expected;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!referer || fetchSite !== "same-origin") return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
