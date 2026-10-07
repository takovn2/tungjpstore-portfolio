/**
 * Public Vietnam Mini App branding resolved from the Telegram bot identity.
 * Never exposes tokens or secrets — only display fields safe for the client.
 */

import { getTelegramBotIdentity } from "./telegram";

export type MiniShopBranding = {
  /** Store name shown in the top bar / title. */
  shopName: string;
  /** Single-character mark for the brand chip. */
  mark: string;
  /** Telegram @username without leading @, when known. */
  username: string | null;
  /** Small kicker above the hero title. */
  welcomeKicker: string;
  /** Primary hero line. */
  welcomeHeading: string;
  /** Emphasized hero fragment (inside <em>). */
  welcomeEmphasis: string;
  /** True when operator set TELEGRAM_MINI_WELCOME_* overrides. */
  welcomeCustomized: boolean;
};

type BrandingEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_MINI_SHOP_NAME?: string;
  TELEGRAM_MINI_WELCOME_KICKER?: string;
  TELEGRAM_MINI_WELCOME_HEADING?: string;
  TELEGRAM_MINI_WELCOME_EMPHASIS?: string;
  CONTENT_DB?: D1Database;
};

type BotIdentityRow = {
  first_name: string | null;
  username: string | null;
  label: string | null;
};

const IDENTITY_CACHE_TTL_MS = 10 * 60 * 1_000;
let identityCache: { at: number; tokenFingerprint: string; firstName: string; username: string | null } | null = null;

function sanitizeDisplayName(value: string, max = 64): string {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeUsername(value: string | null | undefined): string | null {
  const raw = String(value || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/.test(raw)) return null;
  return raw;
}

/** Derive a human label from a bot username when display name is missing. */
export function formatBotUsernameAsShopName(username: string | null | undefined): string {
  const raw = normalizeUsername(username);
  if (!raw) return "";
  const base = raw.replace(/_bot$/i, "").replace(/_/g, " ").trim();
  if (!base) return raw;
  return base
    .split(/\s+/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ")
    .slice(0, 64);
}

function markFromName(name: string): string {
  const letter = Array.from(name.trim())[0] || "S";
  return letter.toLocaleUpperCase("vi").slice(0, 2);
}

function tokenFingerprint(token: string | undefined): string {
  const value = String(token || "").trim();
  if (!value) return "";
  // Short non-secret fingerprint — never return the token itself.
  return `${value.length}:${value.slice(0, 6)}:${value.slice(-4)}`;
}

async function resolveEnvironmentBotIdentity(env: BrandingEnv): Promise<{ firstName: string; username: string | null }> {
  const usernameHint = normalizeUsername(env.TELEGRAM_BOT_USERNAME);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { firstName: formatBotUsernameAsShopName(usernameHint), username: usernameHint };
  }
  const fingerprint = tokenFingerprint(token);
  const now = Date.now();
  if (identityCache && identityCache.tokenFingerprint === fingerprint && now - identityCache.at < IDENTITY_CACHE_TTL_MS) {
    return { firstName: identityCache.firstName, username: identityCache.username };
  }
  try {
    const identity = await getTelegramBotIdentity({ TELEGRAM_BOT_TOKEN: token });
    const firstName = sanitizeDisplayName(identity.firstName) || formatBotUsernameAsShopName(identity.username);
    const username = normalizeUsername(identity.username) || usernameHint;
    identityCache = { at: now, tokenFingerprint: fingerprint, firstName, username };
    return { firstName, username };
  } catch {
    return {
      firstName: formatBotUsernameAsShopName(usernameHint) || "Shop",
      username: usernameHint,
    };
  }
}

async function resolveRegistryBotIdentity(
  db: D1Database | undefined,
  botConfigId: string,
): Promise<{ firstName: string; username: string | null }> {
  if (!db || !botConfigId || botConfigId === "environment") {
    return { firstName: "", username: null };
  }
  const row = await db.prepare(
    `SELECT first_name, username, label FROM shop_telegram_bot_configs WHERE id = ? LIMIT 1`,
  ).bind(botConfigId).first<BotIdentityRow>().catch(() => null);
  if (!row) return { firstName: "", username: null };
  const firstName = sanitizeDisplayName(row.first_name || row.label || "");
  const username = normalizeUsername(row.username);
  return { firstName, username };
}

function buildWelcome(
  shopName: string,
  env: BrandingEnv,
): Pick<MiniShopBranding, "welcomeKicker" | "welcomeHeading" | "welcomeEmphasis" | "welcomeCustomized"> {
  const customKicker = sanitizeDisplayName(env.TELEGRAM_MINI_WELCOME_KICKER || "", 120);
  const customHeading = sanitizeDisplayName(env.TELEGRAM_MINI_WELCOME_HEADING || "", 80);
  const customEmphasis = sanitizeDisplayName(env.TELEGRAM_MINI_WELCOME_EMPHASIS || "", 80);
  const welcomeCustomized = Boolean(customKicker || customHeading || customEmphasis);
  return {
    welcomeKicker: customKicker || `${shopName} · Hàng số chính hãng · Mua trong Telegram`,
    welcomeHeading: customHeading || "Chọn nhanh.",
    welcomeEmphasis: customEmphasis || "Nhận ngay.",
    welcomeCustomized,
  };
}

/**
 * Resolve public shop branding for the Vietnam Mini App.
 * Priority for shop name:
 * 1. TELEGRAM_MINI_SHOP_NAME (operator override)
 * 2. Telegram bot display name (getMe / registry first_name)
 * 3. Formatted TELEGRAM_BOT_USERNAME / registry username
 * 4. "Shop"
 */
export async function resolveVietnamMiniShopBranding(
  env: BrandingEnv,
  botConfigId = "environment",
): Promise<MiniShopBranding> {
  const overrideName = sanitizeDisplayName(env.TELEGRAM_MINI_SHOP_NAME || "");
  const identity = botConfigId === "environment" || !botConfigId
    ? await resolveEnvironmentBotIdentity(env)
    : await resolveRegistryBotIdentity(env.CONTENT_DB, botConfigId);

  // When the session is registry-scoped but the row is missing, fall back to
  // the environment bot so the Mini App never shows an empty brand.
  const fallback = !identity.firstName && !identity.username
    ? await resolveEnvironmentBotIdentity(env)
    : identity;

  const shopName = overrideName
    || sanitizeDisplayName(fallback.firstName)
    || formatBotUsernameAsShopName(fallback.username)
    || "Shop";
  const welcome = buildWelcome(shopName, env);

  return {
    shopName,
    mark: markFromName(shopName),
    username: fallback.username,
    ...welcome,
  };
}

/** Synchronous SSR fallback that never calls Telegram (no latency, no failure). */
export function vietnamMiniShopBrandingFallback(env: BrandingEnv): MiniShopBranding {
  const overrideName = sanitizeDisplayName(env.TELEGRAM_MINI_SHOP_NAME || "");
  const username = normalizeUsername(env.TELEGRAM_BOT_USERNAME);
  const shopName = overrideName || formatBotUsernameAsShopName(username) || "Shop";
  return {
    shopName,
    mark: markFromName(shopName),
    username,
    ...buildWelcome(shopName, env),
  };
}
