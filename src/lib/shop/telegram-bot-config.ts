import { randomOpaqueToken, sha256Base64Url } from "./crypto";
import {
  callTelegramBotApi,
  TELEGRAM_COMMANDS,
  TELEGRAM_COMMANDS_NATIVE,
  telegramMiniAppUrl,
  getTelegramMiniAppEnabledSetting,
  TelegramApiError,
  configureTelegramBot,
} from "./telegram";
import type { ShopTelegramBotScope } from "./types";

const TELEGRAM_CONFIG_CRYPTO_VERSION = "telegram-bot-secret-v1";
const TELEGRAM_CONFIG_KEY_VERSION = "v1";
const TELEGRAM_CONFIG_SALT = new TextEncoder().encode("tung.codes.telegram.bot-config.v1");
const TELEGRAM_SECRET_BYTES = 32;
const TOKEN_PATTERN = /^[0-9]{5,20}:[A-Za-z0-9_-]{20,160}$/;
const WEBHOOK_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{5,32}$/;
const MAX_PREVIOUS_GRACE_MS = 15 * 60 * 1_000;
const ACTIVATION_LEASE_MS = 5 * 60 * 1_000;
const RETIREMENT_RETRY_MS = 55 * 1_000;
const ACTIVATION_RECOVERY_PENDING = "telegram_activation_recovery_pending";
const ACTIVATION_RECOVERY_FAILED = "telegram_activation_recovery_failed";
const ACTIVATION_LEASE_EXPIRED = "telegram_bot_activation_lease_expired";
const REVOKE_CLEANUP_PENDING = "telegram_bot_revoke_cleanup_pending";
const REVOKE_CLEANUP_FAILED = "telegram_bot_revoke_cleanup_failed";
const LEGACY_WEBHOOK_CLEANUP_PENDING = "telegram_legacy_webhook_cleanup_pending";
const LEGACY_WEBHOOK_CLEANUP_FAILED = "telegram_legacy_webhook_cleanup_failed";

export type TelegramBotConfigBindings = Pick<Cloudflare.Env,
  "SHOP_PUBLIC_ORIGIN" | "TELEGRAM_TOKEN_ENCRYPTION_SECRET" | "TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION" |
  "TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS" | "TELEGRAM_BOT_TOKEN"
> & { CONTENT_DB?: Cloudflare.Env["CONTENT_DB"] };

export type TelegramBotScope = ShopTelegramBotScope;

type TelegramBotConfigRow = {
  id: string;
  scope: TelegramBotScope;
  label: string;
  telegram_bot_id: string;
  username: string;
  first_name: string;
  status: "standby" | "activating" | "active" | "previous" | "retiring" | "error" | "revoked";
  crypto_version: string;
  key_version: string;
  token_ciphertext_b64: string | null;
  token_iv_b64: string | null;
  token_fingerprint: string;
  webhook_secret_ciphertext_b64: string | null;
  webhook_secret_iv_b64: string | null;
  webhook_secret_fingerprint: string;
  webhook_url: string | null;
  mini_app_url: string | null;
  previous_expires_at: string | null;
  last_validated_at: string;
  last_configured_at: string | null;
  last_error_code: string | null;
  version: number;
  auth_revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type TelegramBotSummary = {
  id: string;
  scope: TelegramBotScope;
  label: string;
  botId: string;
  username: string;
  firstName: string;
  status: TelegramBotConfigRow["status"];
  webhookUrl: string | null;
  miniAppUrl: string | null;
  previousExpiresAt: string | null;
  lastValidatedAt: string;
  lastConfiguredAt: string | null;
  lastErrorCode: string | null;
  version: number;
  authRevision: number;
  tokenFingerprint: string;
  encryptionConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramBotCredential = {
  configId: string;
  scope: TelegramBotScope;
  botId: string;
  username: string;
  firstName: string;
  token: string;
  webhookSecret: string;
  status: TelegramBotConfigRow["status"];
  version: number;
  authRevision: number;
  miniAppUrl: string | null;
  webhookUrl: string | null;
};

export class TelegramBotConfigError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 422) {
    super(code);
    this.name = "TelegramBotConfigError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isToken(value: string) {
  return TOKEN_PATTERN.test(value.trim());
}

function isKeyVersion(value: string) {
  return /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function normalizeUsername(value: string) {
  const username = value.trim().replace(/^@/, "").toLowerCase();
  return USERNAME_PATTERN.test(username) && username.endsWith("bot") ? username : null;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TelegramBotConfigError("telegram_token_crypto_invalid", 503);
  try {
    const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new TelegramBotConfigError("telegram_token_crypto_invalid", 503);
  }
}

function frame(...parts: Array<string | Uint8Array>) {
  const encoded = parts.map((part) => typeof part === "string" ? new TextEncoder().encode(part) : part);
  const output = new Uint8Array(encoded.reduce((total, part) => total + 4 + part.byteLength, 0));
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const part of encoded) {
    view.setUint32(offset, part.byteLength, false);
    offset += 4;
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  let difference = left.byteLength ^ right.byteLength;
  for (let index = 0; index < Math.max(left.byteLength, right.byteLength); index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function currentKeyVersion(bindings: TelegramBotConfigBindings) {
  const version = bindings.TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION?.trim() || TELEGRAM_CONFIG_KEY_VERSION;
  if (!isKeyVersion(version)) throw new TelegramBotConfigError("telegram_token_crypto_not_configured", 503);
  return version;
}

function rootSecretBytes(value: string, code: string) {
  const bytes = base64UrlToBytes(value);
  if (bytes.byteLength !== TELEGRAM_SECRET_BYTES || bytesToBase64Url(bytes) !== value) {
    throw new TelegramBotConfigError(code, 503);
  }
  return bytes;
}

function previousRootSecret(bindings: TelegramBotConfigBindings, requestedVersion: string) {
  const raw = bindings.TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS?.trim() ?? "";
  if (!raw || raw.length > 4_096) throw new TelegramBotConfigError("telegram_token_crypto_key_version_mismatch", 503);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || Object.keys(parsed).length > 8) throw new Error("invalid_keyring");
    const candidate = parsed[requestedVersion];
    if (typeof candidate !== "string") throw new Error("missing_key");
    return candidate.trim();
  } catch {
    throw new TelegramBotConfigError("telegram_token_crypto_key_version_mismatch", 503);
  }
}

async function encryptionContext(bindings: TelegramBotConfigBindings, requestedVersion?: string) {
  const activeVersion = currentKeyVersion(bindings);
  const keyVersion = requestedVersion ?? activeVersion;
  if (!isKeyVersion(keyVersion)) throw new TelegramBotConfigError("telegram_token_crypto_key_version_mismatch", 503);
  const secret = keyVersion === activeVersion
    ? bindings.TELEGRAM_TOKEN_ENCRYPTION_SECRET?.trim() ?? ""
    : previousRootSecret(bindings, keyVersion);
  const secretBytes = rootSecretBytes(secret, keyVersion === activeVersion
    ? "telegram_token_crypto_not_configured"
    : "telegram_token_crypto_key_version_mismatch");
  const root = await crypto.subtle.importKey("raw", secretBytes, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: TELEGRAM_CONFIG_SALT, info: new TextEncoder().encode("telegram-bot-secrets-v1") },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const fingerprintKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: TELEGRAM_CONFIG_SALT, info: new TextEncoder().encode("telegram-bot-fingerprints-v1") },
    root,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"] ,
  );
  return { key, fingerprintKey, keyVersion };
}

async function sealSecret(bindings: TelegramBotConfigBindings, botId: string, kind: "token" | "webhook", plaintext: string) {
  const context = await encryptionContext(bindings);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = frame(TELEGRAM_CONFIG_CRYPTO_VERSION, context.keyVersion, botId, kind);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, context.key, new TextEncoder().encode(plaintext));
  const fingerprint = await crypto.subtle.sign("HMAC", context.fingerprintKey, frame(TELEGRAM_CONFIG_CRYPTO_VERSION, botId, kind, plaintext));
  return { ciphertextB64: bytesToBase64Url(new Uint8Array(ciphertext)), ivB64: bytesToBase64Url(iv), fingerprint: bytesToBase64Url(new Uint8Array(fingerprint)), keyVersion: context.keyVersion };
}

async function openSecret(bindings: TelegramBotConfigBindings, row: TelegramBotConfigRow, kind: "token" | "webhook", ciphertext: string | null, ivB64: string | null) {
  if (!ciphertext || !ivB64) throw new TelegramBotConfigError("telegram_token_crypto_invalid", 503);
  if (row.crypto_version !== TELEGRAM_CONFIG_CRYPTO_VERSION) throw new TelegramBotConfigError("telegram_token_crypto_key_version_mismatch", 503);
  const context = await encryptionContext(bindings, row.key_version);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivB64), additionalData: frame(TELEGRAM_CONFIG_CRYPTO_VERSION, context.keyVersion, row.telegram_bot_id, kind), tagLength: 128 },
    context.key,
    base64UrlToBytes(ciphertext),
  ).catch(() => { throw new TelegramBotConfigError("telegram_token_crypto_invalid", 503); });
  const value = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  const fingerprint = await crypto.subtle.sign("HMAC", context.fingerprintKey, frame(TELEGRAM_CONFIG_CRYPTO_VERSION, row.telegram_bot_id, kind, value));
  const expected = kind === "token" ? row.token_fingerprint : row.webhook_secret_fingerprint;
  if (!equalBytes(base64UrlToBytes(expected), new Uint8Array(fingerprint))) throw new TelegramBotConfigError("telegram_token_crypto_integrity_failed", 503);
  return value;
}

function webhookUrl(bindings: TelegramBotConfigBindings, id: string, scope: TelegramBotScope = "legacy") {
  const origin = safeText(bindings.SHOP_PUBLIC_ORIGIN, 200);
  try {
    const url = new URL(scope === "glb" ? "/api/telegram/glb-webhook" : "/api/telegram/webhook", origin);
    url.searchParams.set("bot", id);
    return url.toString();
  } catch {
    throw new TelegramBotConfigError("telegram_bot_public_origin_invalid", 503);
  }
}

function miniAppUrl(bindings: TelegramBotConfigBindings, id: string, scope: TelegramBotScope = "legacy") {
  const base = scope === "glb" ? safeText(bindings.SHOP_PUBLIC_ORIGIN, 200) : telegramMiniAppUrl(bindings.SHOP_PUBLIC_ORIGIN);
  if (!base) throw new TelegramBotConfigError("telegram_bot_public_origin_invalid", 503);
  const url = scope === "glb" ? new URL("/telegram/glb", base) : new URL(base);
  url.searchParams.set("bot", id);
  return url.toString();
}

function telegramTokenBotId(token: string | undefined) {
  const value = token?.trim() ?? "";
  if (!isToken(value)) return null;
  return value.slice(0, value.indexOf(":"));
}

async function legacyEnvironmentWebhookNeedsCleanup(db: D1Database, bindings: TelegramBotConfigBindings, candidateBotId: string) {
  const botId = telegramTokenBotId(bindings.TELEGRAM_BOT_TOKEN);
  if (!botId) return false;
  if (botId === candidateBotId) return false;
  const managed = await db.prepare("SELECT 1 AS found FROM shop_telegram_bot_configs WHERE scope = 'legacy' AND telegram_bot_id = ? AND status IN ('active', 'previous') LIMIT 1")
    .bind(botId).first<{ found: number }>();
  return !managed;
}

function summary(row: TelegramBotConfigRow, encryptionConfigured: boolean): TelegramBotSummary {
  return {
    id: row.id,
    scope: row.scope === "glb" ? "glb" : "legacy",
    label: row.label,
    botId: row.telegram_bot_id,
    username: row.username,
    firstName: row.first_name,
    status: row.status,
    webhookUrl: row.webhook_url,
    miniAppUrl: row.mini_app_url,
    previousExpiresAt: row.previous_expires_at,
    lastValidatedAt: row.last_validated_at,
    lastConfiguredAt: row.last_configured_at,
    lastErrorCode: row.last_error_code,
    version: row.version,
    authRevision: row.auth_revision,
    tokenFingerprint: row.token_fingerprint.slice(0, 12),
    encryptionConfigured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function encryptionConfigured(bindings: TelegramBotConfigBindings) {
  const secret = bindings.TELEGRAM_TOKEN_ENCRYPTION_SECRET?.trim() ?? "";
  if (!secret || !/^[A-Za-z0-9_-]+$/.test(secret)) return false;
  try {
    return base64UrlToBytes(secret).byteLength === TELEGRAM_SECRET_BYTES;
  } catch {
    return false;
  }
}

async function rowById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE id = ? LIMIT 1").bind(id).first<TelegramBotConfigRow>();
}

async function identityForToken(token: string) {
  if (!isToken(token)) throw new TelegramBotConfigError("telegram_bot_token_invalid");
  try {
    const result = await callTelegramBotApi<Record<string, unknown>>(token, "getMe", {});
    const id = typeof result.id === "number" && Number.isSafeInteger(result.id) ? result.id : null;
    const firstName = typeof result.first_name === "string" ? result.first_name.trim().slice(0, 128) : "";
    const username = typeof result.username === "string" ? normalizeUsername(result.username) : null;
    if (id === null || !firstName || !username) throw new TelegramBotConfigError("telegram_identity_invalid");
    return { id: String(id), firstName, username } satisfies { id: string; firstName: string; username: string };
  } catch (error) {
    if (error instanceof TelegramBotConfigError) throw error;
    if (error instanceof TelegramApiError) throw new TelegramBotConfigError(error.code, error.code === "telegram_api_401" ? 422 : 502);
    throw new TelegramBotConfigError("telegram_api_unreachable", 502);
  }
}

async function event(db: D1Database, botId: string | null, action: string, outcome: "success" | "failed", actor: string, requestId: string, errorCode?: string) {
  await db.prepare(`INSERT INTO shop_telegram_bot_events
    (id, bot_config_id, action, outcome, error_code, actor, request_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`).bind(
    crypto.randomUUID(), botId, action, outcome, errorCode ?? null, actor.slice(0, 200), requestId.slice(0, 100), nowIso(),
  ).run();
}

export function parseTelegramBotInput(value: unknown) {
  if (!isRecord(value)) throw new TelegramBotConfigError("telegram_bot_validation_failed");
  const token = safeText(value.token, 200);
  const label = safeText(value.label, 80);
  if (!isToken(token)) throw new TelegramBotConfigError("telegram_bot_token_invalid");
  const scope = value.scope === "glb" ? "glb" : "legacy";
  return { token, label, scope } satisfies { token: string; label: string; scope: TelegramBotScope };
}

export async function validateTelegramBotToken(bindings: TelegramBotConfigBindings, token: string) {
  await encryptionContext(bindings);
  return identityForToken(token);
}

export async function listTelegramBotConfigs(db: D1Database, bindings: TelegramBotConfigBindings, scope: TelegramBotScope | null = null) {
  const rows = scope
    ? await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE scope = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'previous' THEN 1 WHEN 'activating' THEN 2 WHEN 'retiring' THEN 3 WHEN 'standby' THEN 4 WHEN 'error' THEN 5 ELSE 6 END, updated_at DESC LIMIT 50").bind(scope).all<TelegramBotConfigRow>()
    : await db.prepare("SELECT * FROM shop_telegram_bot_configs ORDER BY scope, CASE status WHEN 'active' THEN 0 WHEN 'previous' THEN 1 WHEN 'activating' THEN 2 WHEN 'retiring' THEN 3 WHEN 'standby' THEN 4 WHEN 'error' THEN 5 ELSE 6 END, updated_at DESC LIMIT 50").all<TelegramBotConfigRow>();
  return { bots: rows.results.map((row) => summary(row, encryptionConfigured(bindings))), encryptionConfigured: encryptionConfigured(bindings) };
}

export async function createTelegramBotConfig(db: D1Database, bindings: TelegramBotConfigBindings, input: { token: string; label: string; scope?: TelegramBotScope }, actor: string, requestId: string) {
  const identity = await validateTelegramBotToken(bindings, input.token);
  const displayLabel = input.label.trim() || identity.firstName || `@${identity.username}`;
  const id = crypto.randomUUID();
  const webhookSecret = randomOpaqueToken(32);
  const [sealedToken, sealedWebhook] = await Promise.all([
    sealSecret(bindings, identity.id, "token", input.token.trim()),
    sealSecret(bindings, identity.id, "webhook", webhookSecret),
  ]);
  const timestamp = nowIso();
  const scope = input.scope === "glb" ? "glb" : "legacy";
  const webhook = webhookUrl(bindings, id, scope);
  const miniApp = miniAppUrl(bindings, id, scope);
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_telegram_bot_configs
        (id, scope, label, telegram_bot_id, username, first_name, status, crypto_version, key_version,
         token_ciphertext_b64, token_iv_b64, token_fingerprint, webhook_secret_ciphertext_b64,
         webhook_secret_iv_b64, webhook_secret_fingerprint, webhook_url, mini_app_url,
         last_validated_at, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'standby', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`) 
        .bind(id, scope, displayLabel.slice(0, 80), identity.id, identity.username, identity.firstName, TELEGRAM_CONFIG_CRYPTO_VERSION, sealedToken.keyVersion, sealedToken.ciphertextB64, sealedToken.ivB64, sealedToken.fingerprint, sealedWebhook.ciphertextB64, sealedWebhook.ivB64, sealedWebhook.fingerprint, webhook, miniApp, timestamp, actor, actor, timestamp, timestamp),
      db.prepare(`INSERT INTO shop_telegram_bot_events (id, bot_config_id, action, outcome, actor, request_id, details_json, created_at)
        VALUES (?, ?, 'created', 'success', ?, ?, '{}', ?)`)
        .bind(crypto.randomUUID(), id, actor.slice(0, 200), requestId.slice(0, 100), timestamp),
    ]);
  } catch (error) {
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message) ? "telegram_bot_already_registered" : "telegram_bot_registry_unavailable";
    throw new TelegramBotConfigError(message, message.endsWith("registered") ? 409 : 503);
  }
  const row = await rowById(db, id);
  if (!row) throw new TelegramBotConfigError("telegram_bot_registry_unavailable", 503);
  return summary(row, true);
}

async function configureRemoteBot(bindings: TelegramBotConfigBindings, row: TelegramBotConfigRow, token: string, webhookSecret: string) {
  const privateChatScope = { type: "all_private_chats" };
  const miniAppEnabled = bindings.CONTENT_DB ? await getTelegramMiniAppEnabledSetting(bindings.CONTENT_DB) : false;
  const commandSet = miniAppEnabled ? TELEGRAM_COMMANDS : TELEGRAM_COMMANDS_NATIVE;
  if (row.scope === "glb") {
    await callTelegramBotApi(token, "setMyCommands", { commands: commandSet.en, language_code: "en", scope: privateChatScope });
    await callTelegramBotApi(token, "setMyCommands", { commands: commandSet.en, scope: privateChatScope });
  } else {
    for (const locale of ["vi", "en", "ja", "zh"] as const) {
      await callTelegramBotApi(token, "setMyCommands", { commands: commandSet[locale] || commandSet.vi, language_code: locale, scope: privateChatScope });
    }
    await callTelegramBotApi(token, "setMyCommands", { commands: commandSet.vi, scope: privateChatScope });
  }
  // Persisted URLs are informational only; recompute from the trusted Worker
  // origin so a tampered D1 value can never redirect Bot API traffic.
  const appUrl = miniAppUrl(bindings, row.id, row.scope);
  const hookUrl = webhookUrl(bindings, row.id, row.scope);
  if (miniAppEnabled) {
    await callTelegramBotApi(token, "setChatMenuButton", { menu_button: { type: "web_app", text: row.scope === "glb" ? `Open ${row.first_name}` : `Mở ${row.first_name}`, web_app: { url: appUrl } } });
  } else {
    await callTelegramBotApi(token, "setChatMenuButton", { menu_button: { type: "commands" } });
  }
  await callTelegramBotApi(token, "setWebhook", { url: hookUrl, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"], max_connections: 10 });
  return { appUrl, hookUrl };
}

export async function syncAllTelegramBotsMenus(bindings: TelegramBotConfigBindings & { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_WEBHOOK_SECRET?: string; TELEGRAM_BOT_USERNAME?: string }) {
  if (bindings.TELEGRAM_BOT_TOKEN) {
    try {
      await configureTelegramBot(bindings as any);
    } catch (e) {
      console.warn("Failed to sync environment bot menu:", e);
    }
  }
  if (bindings.CONTENT_DB) {
    try {
      const activeRows = await bindings.CONTENT_DB.prepare(
        "SELECT * FROM shop_telegram_bot_configs WHERE status IN ('active', 'standby', 'previous')"
      ).all<TelegramBotConfigRow>();
      for (const row of activeRows.results || []) {
        try {
          const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
          const webhookSecret = await openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64);
          await configureRemoteBot(bindings, row, token, webhookSecret);
        } catch (botErr) {
          console.warn(`Failed to sync registry bot ${row.id}:`, botErr);
        }
      }
    } catch (e) {
      console.warn("Failed to query registry bots for menu sync:", e);
    }
  }
}

export async function activateTelegramBotConfig(db: D1Database, bindings: TelegramBotConfigBindings, id: string, expectedVersion: number, actor: string, requestId: string, action: "activate" | "rollback" = "activate") {
  let claim: D1Result;
  try {
    claim = await db.prepare(`UPDATE shop_telegram_bot_configs SET status = 'activating', version = version + 1, last_error_code = NULL, updated_by = ?, updated_at = ?
      WHERE id = ? AND version = ? AND status IN ('standby', 'previous', 'error')`).bind(actor, nowIso(), id, expectedVersion).run();
  } catch (error) {
    // The partial unique index permits only one in-flight activation. D1 can
    // surface that race as a raw SQLite constraint error before `changes` is
    // available; expose a stable conflict for the admin UI instead.
    if (error instanceof Error && /UNIQUE constraint failed.*shop_telegram_bot_configs\.status|constraint failed.*status/i.test(error.message)) {
      throw new TelegramBotConfigError("telegram_bot_activation_in_progress", 409);
    }
    throw new TelegramBotConfigError("telegram_bot_registry_unavailable", 503);
  }
  if ((claim.meta.changes ?? 0) !== 1) throw new TelegramBotConfigError("telegram_bot_version_conflict", 409);
  const row = await rowById(db, id);
  if (!row) throw new TelegramBotConfigError("telegram_bot_not_found", 404);
  const scope = row.scope === "glb" ? "glb" : "legacy";
  let tokenForCleanup: string | null = null;
  try {
    const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
    tokenForCleanup = token;
    const webhookSecret = await openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64);
    const [displacedPrevious, legacyCleanupPending] = await Promise.all([
      db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE scope = ? AND status = 'previous' LIMIT 1").bind(scope).first<TelegramBotConfigRow>(),
      scope === "legacy" ? legacyEnvironmentWebhookNeedsCleanup(db, bindings, row.telegram_bot_id) : Promise.resolve(false),
    ]);
    const identity = await identityForToken(token);
    if (identity.id !== row.telegram_bot_id || identity.username !== row.username) throw new TelegramBotConfigError("telegram_identity_mismatch");
    const configured = await configureRemoteBot(bindings, row, token, webhookSecret);
    const timestamp = nowIso();
    const grace = new Date(Date.now() + MAX_PREVIOUS_GRACE_MS).toISOString();
    const committed = await db.batch([
      db.prepare(`UPDATE shop_telegram_bot_configs SET status = 'retiring', previous_expires_at = NULL,
          last_error_code = NULL, version = version + 1, updated_by = ?, updated_at = ?
        WHERE scope = ? AND status = 'previous' AND EXISTS (
          SELECT 1 FROM shop_telegram_bot_configs WHERE id = ? AND status = 'activating' AND version = ?
        )`).bind(actor, timestamp, scope, id, row.version),
      db.prepare(`UPDATE shop_telegram_bot_configs SET status = 'previous', previous_expires_at = ?,
          version = version + 1, updated_by = ?, updated_at = ?
        WHERE scope = ? AND status = 'active' AND EXISTS (
          SELECT 1 FROM shop_telegram_bot_configs WHERE id = ? AND status = 'activating' AND version = ?
        )`).bind(grace, actor, timestamp, scope, id, row.version),
      db.prepare(`UPDATE shop_telegram_bot_configs SET status = 'active', webhook_url = ?, mini_app_url = ?,
          last_configured_at = ?, previous_expires_at = NULL, last_error_code = ?, version = version + 1,
          updated_by = ?, updated_at = ?
        WHERE id = ? AND status = 'activating' AND version = ?`).bind(
        configured.hookUrl,
        configured.appUrl,
        timestamp,
        legacyCleanupPending ? LEGACY_WEBHOOK_CLEANUP_PENDING : null,
        actor,
        timestamp,
        id,
        row.version,
      ),
      db.prepare(`INSERT INTO shop_telegram_bot_events (id, bot_config_id, action, outcome, actor, request_id, details_json, created_at)
        SELECT ?, ?, ?, 'success', ?, ?, '{}', ?
        WHERE EXISTS (
          SELECT 1 FROM shop_telegram_bot_configs WHERE id = ? AND status = 'active' AND version = ?
        )`).bind(
        crypto.randomUUID(),
        id,
        action === "rollback" ? "rolled_back" : "activated",
        actor.slice(0, 200),
        requestId.slice(0, 100),
        timestamp,
        id,
        row.version + 1,
      ),
    ]);
    if ((committed[2]?.meta.changes ?? 0) !== 1) {
      throw new TelegramBotConfigError("telegram_bot_activation_lease_lost", 409);
    }
    await Promise.all([
      displacedPrevious
        ? finishTelegramBotRetirement(db, bindings, displacedPrevious, displacedPrevious.version + 1)
          .catch(() => ({ retired: false, failed: true, skipped: false, code: "telegram_previous_retirement_failed" }))
        : Promise.resolve({ retired: false, failed: false, skipped: true }),
      legacyCleanupPending
        ? retireLegacyEnvironmentTelegramWebhook(db, bindings, id)
          .catch(() => ({ examined: 1, retired: 0, failed: 1, skipped: 0 }))
        : Promise.resolve({ examined: 0, retired: 0, failed: 0, skipped: 1 }),
    ]);
  } catch (error) {
    const code = error instanceof TelegramBotConfigError ? error.code : error instanceof TelegramApiError ? error.code : "telegram_bot_activation_failed";
    if (tokenForCleanup) {
      // The webhook is the final remote mutation. If a later registry commit
      // fails, remove the candidate hook so an error row cannot receive live
      // traffic outside the active/previous routing set.
      await callTelegramBotApi(tokenForCleanup, "deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
    }
    await db.batch([
      db.prepare("UPDATE shop_telegram_bot_configs SET status = 'error', last_error_code = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND status = 'activating'").bind(code.slice(0, 100), actor, nowIso(), id),
      db.prepare(`INSERT INTO shop_telegram_bot_events (id, bot_config_id, action, outcome, error_code, actor, request_id, details_json, created_at)
        VALUES (?, ?, 'activation_failed', 'failed', ?, ?, ?, '{}', ?)`).bind(crypto.randomUUID(), id, code.slice(0, 100), actor.slice(0, 200), requestId.slice(0, 100), nowIso()),
    ]);
    throw error instanceof TelegramBotConfigError ? error : new TelegramBotConfigError(code, 502);
  }
  const updated = await rowById(db, id);
  if (!updated) throw new TelegramBotConfigError("telegram_bot_registry_unavailable", 503);
  return summary(updated, true);
}

/** Roll back the active pointer to the currently retained previous bot. The
 * caller supplies the active row version so a stale admin tab cannot silently
 * revert a newer rotation. */
export async function rollbackTelegramBotConfig(db: D1Database, bindings: TelegramBotConfigBindings, activeId: string, expectedActiveVersion: number, actor: string, requestId: string) {
  const active = await rowById(db, activeId);
  if (!active || active.status !== "active" || active.version !== expectedActiveVersion) {
    throw new TelegramBotConfigError("telegram_bot_version_conflict", 409);
  }
  const previous = await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE scope = ? AND status = 'previous' AND previous_expires_at > ? ORDER BY updated_at DESC LIMIT 1").bind(active.scope, nowIso()).first<TelegramBotConfigRow>();
  if (!previous) throw new TelegramBotConfigError("telegram_bot_previous_unavailable", 409);
  return activateTelegramBotConfig(db, bindings, previous.id, previous.version, actor, requestId, "rollback");
}

async function deleteTelegramWebhook(token: string) {
  try {
    await callTelegramBotApi(token, "deleteWebhook", { drop_pending_updates: false });
  } catch (error) {
    // BotFather-revoked tokens cannot receive updates, which is equivalent to
    // a completed webhook cleanup for retirement and local credential revoke.
    if (!(error instanceof TelegramApiError) || error.code !== "telegram_api_401") throw error;
  }
}

function cleanupErrorCode(error: unknown, fallback: string) {
  return error instanceof TelegramBotConfigError
    ? error.code
    : error instanceof TelegramApiError
      ? error.code
      : fallback;
}

async function finishTelegramBotRetirement(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  row: TelegramBotConfigRow,
  claimedVersion: number,
) {
  try {
    const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
    await deleteTelegramWebhook(token);
    const completedAt = nowIso();
    const completed = await db.prepare(`UPDATE shop_telegram_bot_configs SET
        status = 'standby', previous_expires_at = NULL, last_error_code = NULL,
        version = version + 1, updated_by = 'system:telegram-retirement', updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'`)
      .bind(completedAt, row.id, claimedVersion).run();
    if ((completed.meta.changes ?? 0) !== 1) return { retired: false, failed: false, skipped: true, code: undefined };
    return { retired: true, failed: false, skipped: false, code: undefined };
  } catch (error) {
    const code = cleanupErrorCode(error, "telegram_previous_retirement_failed");
    await db.prepare(`UPDATE shop_telegram_bot_configs SET
        last_error_code = ?, version = version + 1,
        updated_by = 'system:telegram-retirement', updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'`)
      .bind(code.slice(0, 100), nowIso(), row.id, claimedVersion).run().catch(() => undefined);
    return { retired: false, failed: true, skipped: false, code };
  }
}

async function finishStaleTelegramActivationRecovery(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  row: TelegramBotConfigRow,
  claimedVersion: number,
) {
  try {
    const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
    await deleteTelegramWebhook(token);
    const completed = await db.prepare(`UPDATE shop_telegram_bot_configs SET
        status = 'error', previous_expires_at = NULL, last_error_code = ?,
        version = version + 1, updated_by = 'system:telegram-activation-recovery', updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'
        AND last_error_code IN (?, ?)`)
      .bind(ACTIVATION_LEASE_EXPIRED, nowIso(), row.id, claimedVersion, ACTIVATION_RECOVERY_PENDING, ACTIVATION_RECOVERY_FAILED).run();
    if ((completed.meta.changes ?? 0) !== 1) return { retired: false, failed: false, skipped: true, code: undefined };
    return { retired: true, failed: false, skipped: false, code: ACTIVATION_LEASE_EXPIRED };
  } catch (error) {
    const code = cleanupErrorCode(error, "telegram_activation_recovery_failed");
    await db.prepare(`UPDATE shop_telegram_bot_configs SET
        last_error_code = ?, version = version + 1,
        updated_by = 'system:telegram-activation-recovery', updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'
        AND last_error_code IN (?, ?)`)
      .bind(ACTIVATION_RECOVERY_FAILED, nowIso(), row.id, claimedVersion, ACTIVATION_RECOVERY_PENDING, ACTIVATION_RECOVERY_FAILED).run().catch(() => undefined);
    return { retired: false, failed: true, skipped: false, code };
  }
}

async function finishTelegramBotRevocation(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  row: TelegramBotConfigRow,
  claimedVersion: number,
) {
  try {
    const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
    await deleteTelegramWebhook(token);
    const completed = await db.prepare(`UPDATE shop_telegram_bot_configs SET
        status = 'revoked', token_ciphertext_b64 = NULL, token_iv_b64 = NULL,
        webhook_secret_ciphertext_b64 = NULL, webhook_secret_iv_b64 = NULL,
        previous_expires_at = NULL, last_error_code = NULL, auth_revision = auth_revision + 1,
        version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'
        AND last_error_code IN (?, ?)`)
      .bind(nowIso(), row.id, claimedVersion, REVOKE_CLEANUP_PENDING, REVOKE_CLEANUP_FAILED).run();
    if ((completed.meta.changes ?? 0) !== 1) return { revoked: false, failed: false, skipped: true, code: undefined, error: undefined };
    return { revoked: true, failed: false, skipped: false, code: undefined, error: undefined };
  } catch (error) {
    const code = cleanupErrorCode(error, "telegram_bot_revoke_cleanup_failed");
    await db.prepare(`UPDATE shop_telegram_bot_configs SET
        last_error_code = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'retiring'
        AND last_error_code IN (?, ?)`)
      .bind(REVOKE_CLEANUP_FAILED, nowIso(), row.id, claimedVersion, REVOKE_CLEANUP_PENDING, REVOKE_CLEANUP_FAILED).run().catch(() => undefined);
    return { revoked: false, failed: true, skipped: false, code, error };
  }
}

/** Remove the bootstrap environment webhook once the registry owns a bot.
 * The active row carries a retry marker so a transient Telegram outage cannot
 * leave the legacy endpoint active indefinitely. */
export async function retireLegacyEnvironmentTelegramWebhook(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  activeId?: string,
) {
  const legacyToken = bindings.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (!isToken(legacyToken)) return { examined: 0, retired: 0, failed: 0, skipped: 1 };
  const active = activeId
    ? await db.prepare("SELECT id, status, last_error_code FROM shop_telegram_bot_configs WHERE id = ? AND scope = 'legacy' AND status = 'active' LIMIT 1").bind(activeId).first<{ id: string; status: string; last_error_code: string | null }>()
    : await db.prepare(`SELECT id, status, last_error_code FROM shop_telegram_bot_configs
        WHERE scope = 'legacy' AND status = 'active' AND last_error_code IN (?, ?) LIMIT 1`)
      .bind(LEGACY_WEBHOOK_CLEANUP_PENDING, LEGACY_WEBHOOK_CLEANUP_FAILED)
      .first<{ id: string; status: string; last_error_code: string | null }>();
  if (!active || (activeId === undefined && ![LEGACY_WEBHOOK_CLEANUP_PENDING, LEGACY_WEBHOOK_CLEANUP_FAILED].includes(active.last_error_code ?? ""))) {
    return { examined: 0, retired: 0, failed: 0, skipped: 1 };
  }
  // If the environment token now belongs to a registered bot, its webhook is
  // managed by the registry and must not be deleted as a legacy endpoint.
  const botId = telegramTokenBotId(legacyToken);
  const managed = botId
    ? await db.prepare("SELECT 1 AS found FROM shop_telegram_bot_configs WHERE scope = 'legacy' AND telegram_bot_id = ? AND status IN ('active', 'previous') LIMIT 1").bind(botId).first<{ found: number }>()
    : null;
  if (managed) {
    await db.prepare("UPDATE shop_telegram_bot_configs SET last_error_code = NULL, updated_at = ? WHERE id = ? AND status = 'active' AND last_error_code IN (?, ?)")
      .bind(nowIso(), active.id, LEGACY_WEBHOOK_CLEANUP_PENDING, LEGACY_WEBHOOK_CLEANUP_FAILED).run().catch(() => undefined);
    return { examined: 1, retired: 0, failed: 0, skipped: 1 };
  }
  try {
    await callTelegramBotApi(legacyToken, "deleteWebhook", { drop_pending_updates: false });
  } catch (error) {
    // A revoked legacy token can no longer receive updates; treat that as
    // equivalent to a deleted webhook while retaining retry for network/API errors.
    if (!(error instanceof TelegramApiError) || error.code !== "telegram_api_401") {
      await db.prepare("UPDATE shop_telegram_bot_configs SET last_error_code = ?, updated_at = ? WHERE id = ? AND status = 'active' AND last_error_code IN (?, ?)")
        .bind(LEGACY_WEBHOOK_CLEANUP_FAILED, nowIso(), active.id, LEGACY_WEBHOOK_CLEANUP_PENDING, LEGACY_WEBHOOK_CLEANUP_FAILED).run().catch(() => undefined);
      return { examined: 1, retired: 0, failed: 1, skipped: 0 };
    }
  }
  await db.prepare("UPDATE shop_telegram_bot_configs SET last_error_code = NULL, updated_at = ? WHERE id = ? AND status = 'active' AND last_error_code IN (?, ?)")
    .bind(nowIso(), active.id, LEGACY_WEBHOOK_CLEANUP_PENDING, LEGACY_WEBHOOK_CLEANUP_FAILED).run().catch(() => undefined);
  return { examined: 1, retired: 1, failed: 0, skipped: 0 };
}

/** Retire expired rollback bots and recover interrupted cleanup operations. A
 * short CAS lease fences admin mutations while the remote webhook is removed;
 * failed Telegram calls retain encrypted credentials for the next retry. */
export async function retireExpiredTelegramPreviousBots(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  limit = 2,
) {
  const bounded = Math.max(1, Math.min(10, Math.floor(limit)));
  const timestamp = nowIso();
  const retryBefore = new Date(Date.now() - RETIREMENT_RETRY_MS).toISOString();
  const activationStaleBefore = new Date(Date.now() - ACTIVATION_LEASE_MS).toISOString();
  const rows = await db.prepare(`SELECT * FROM shop_telegram_bot_configs
    WHERE (status = 'previous' AND previous_expires_at <= ?)
      OR (status = 'retiring' AND updated_at <= ?)
      OR (status = 'activating' AND updated_at <= ?)
    ORDER BY COALESCE(previous_expires_at, updated_at) ASC LIMIT ?`)
    .bind(timestamp, retryBefore, activationStaleBefore, bounded).all<TelegramBotConfigRow>();
  let retired = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows.results) {
    const isRevocation = row.status === "retiring" && [REVOKE_CLEANUP_PENDING, REVOKE_CLEANUP_FAILED].includes(row.last_error_code ?? "");
    const isActivationRecovery = row.status === "activating"
      || (row.status === "retiring" && [ACTIVATION_RECOVERY_PENDING, ACTIVATION_RECOVERY_FAILED].includes(row.last_error_code ?? ""));
    const claimed = isRevocation
      ? await db.prepare(`UPDATE shop_telegram_bot_configs SET
          last_error_code = ?, version = version + 1,
          updated_by = 'system:telegram-revoke', updated_at = ?
        WHERE id = ? AND version = ? AND status = 'retiring' AND updated_at <= ?
          AND last_error_code IN (?, ?)`).bind(
          REVOKE_CLEANUP_PENDING,
          timestamp,
          row.id,
          row.version,
          retryBefore,
          REVOKE_CLEANUP_PENDING,
          REVOKE_CLEANUP_FAILED,
        ).run()
      : isActivationRecovery
        ? await db.prepare(`UPDATE shop_telegram_bot_configs SET
            status = 'retiring', previous_expires_at = NULL, last_error_code = ?,
            version = version + 1, updated_by = 'system:telegram-activation-recovery', updated_at = ?
          WHERE id = ? AND version = ? AND (
            (status = 'activating' AND updated_at <= ?)
            OR (status = 'retiring' AND updated_at <= ? AND last_error_code IN (?, ?))
          )`).bind(
            ACTIVATION_RECOVERY_PENDING,
            timestamp,
            row.id,
            row.version,
            activationStaleBefore,
            retryBefore,
            ACTIVATION_RECOVERY_PENDING,
            ACTIVATION_RECOVERY_FAILED,
          ).run()
        : await db.prepare(`UPDATE shop_telegram_bot_configs SET
            status = 'retiring', last_error_code = NULL, version = version + 1,
            updated_by = 'system:telegram-retirement', updated_at = ?
          WHERE id = ? AND version = ? AND (
            (status = 'previous' AND previous_expires_at <= ?)
            OR (status = 'retiring' AND updated_at <= ?)
          )`).bind(timestamp, row.id, row.version, timestamp, retryBefore).run();
    if ((claimed.meta.changes ?? 0) !== 1) {
      skipped += 1;
      continue;
    }

    const claimedVersion = row.version + 1;
    const result = isRevocation
      ? await finishTelegramBotRevocation(db, bindings, row, claimedVersion)
      : isActivationRecovery
        ? await finishStaleTelegramActivationRecovery(db, bindings, row, claimedVersion)
        : await finishTelegramBotRetirement(db, bindings, row, claimedVersion);
    const completed = "revoked" in result ? result.revoked : result.retired;
    const eventAction = isRevocation ? "revoked" : isActivationRecovery ? "activation_failed" : "previous_retired";
    if (completed) {
      retired += 1;
      await event(
        db,
        row.id,
        eventAction,
        isActivationRecovery ? "failed" : "success",
        isRevocation ? "system:telegram-revoke" : isActivationRecovery ? "system:telegram-activation-recovery" : "system:telegram-retirement",
        crypto.randomUUID(),
        isActivationRecovery ? ACTIVATION_LEASE_EXPIRED : undefined,
      ).catch(() => undefined);
    } else if (result.failed) {
      failed += 1;
      await event(
        db,
        row.id,
        eventAction,
        "failed",
        isRevocation ? "system:telegram-revoke" : isActivationRecovery ? "system:telegram-activation-recovery" : "system:telegram-retirement",
        crypto.randomUUID(),
        result.code,
      ).catch(() => undefined);
    } else {
      skipped += 1;
    }
  }

  return { examined: rows.results.length, retired, failed, skipped };
}

export async function revokeTelegramBotConfig(db: D1Database, bindings: TelegramBotConfigBindings, id: string, expectedVersion: number, actor: string, requestId: string) {
  const row = await rowById(db, id);
  if (!row) throw new TelegramBotConfigError("telegram_bot_not_found", 404);
  if (row.status === "active") throw new TelegramBotConfigError("telegram_active_bot_requires_switch", 409);
  await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
  const changed = await db.prepare(`UPDATE shop_telegram_bot_configs SET
    status = 'retiring', previous_expires_at = NULL, last_error_code = ?,
    version = version + 1, updated_by = ?, updated_at = ?
    WHERE id = ? AND version = ? AND status IN ('standby', 'previous', 'error')`)
    .bind(REVOKE_CLEANUP_PENDING, actor, nowIso(), id, expectedVersion).run();
  if ((changed.meta.changes ?? 0) !== 1) throw new TelegramBotConfigError("telegram_bot_version_conflict", 409);
  const result = await finishTelegramBotRevocation(db, bindings, row, row.version + 1);
  if (!result.revoked) {
    const code = result.code ?? "telegram_bot_version_conflict";
    await event(db, id, "revoked", "failed", actor, requestId, code).catch(() => undefined);
    if (result.error instanceof TelegramBotConfigError) throw result.error;
    throw new TelegramBotConfigError(code, result.failed ? 502 : 409);
  }
  await event(db, id, "revoked", "success", actor, requestId).catch(() => undefined);
  return { ok: true, id, status: "revoked" as const };
}

/** Re-encrypt stored credentials with the current-write root without changing
 * either Telegram secret. Old roots remain read-only keyring entries until all
 * rows using that version have been rewrapped. */
export async function rewrapTelegramBotConfigSecrets(
  db: D1Database,
  bindings: TelegramBotConfigBindings,
  id: string,
  expectedVersion: number,
  actor: string,
  requestId: string,
) {
  const row = await rowById(db, id);
  if (!row || row.status === "revoked") throw new TelegramBotConfigError("telegram_bot_not_found", 404);
  if (row.status === "activating" || row.status === "retiring") {
    throw new TelegramBotConfigError("telegram_bot_operation_in_progress", 409);
  }
  const targetVersion = currentKeyVersion(bindings);
  if (row.key_version === targetVersion) throw new TelegramBotConfigError("telegram_bot_crypto_already_current", 409);

  const [token, webhookSecret] = await Promise.all([
    openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64),
    openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64),
  ]);
  const [sealedToken, sealedWebhook] = await Promise.all([
    sealSecret(bindings, row.telegram_bot_id, "token", token),
    sealSecret(bindings, row.telegram_bot_id, "webhook", webhookSecret),
  ]);
  if (sealedToken.keyVersion !== targetVersion || sealedWebhook.keyVersion !== targetVersion) {
    throw new TelegramBotConfigError("telegram_bot_registry_unavailable", 503);
  }

  const timestamp = nowIso();
  const changed = await db.prepare(`UPDATE shop_telegram_bot_configs SET
      key_version = ?, token_ciphertext_b64 = ?, token_iv_b64 = ?, token_fingerprint = ?,
      webhook_secret_ciphertext_b64 = ?, webhook_secret_iv_b64 = ?, webhook_secret_fingerprint = ?,
      last_error_code = NULL, version = version + 1, updated_by = ?, updated_at = ?
    WHERE id = ? AND version = ? AND key_version = ?
      AND status IN ('standby', 'active', 'previous', 'error')`).bind(
    targetVersion,
    sealedToken.ciphertextB64,
    sealedToken.ivB64,
    sealedToken.fingerprint,
    sealedWebhook.ciphertextB64,
    sealedWebhook.ivB64,
    sealedWebhook.fingerprint,
    actor,
    timestamp,
    id,
    expectedVersion,
    row.key_version,
  ).run();
  if ((changed.meta.changes ?? 0) !== 1) throw new TelegramBotConfigError("telegram_bot_version_conflict", 409);
  await event(db, id, "credentials_rewrapped", "success", actor, requestId).catch(() => undefined);
  const updated = await rowById(db, id);
  if (!updated) throw new TelegramBotConfigError("telegram_bot_registry_unavailable", 503);
  return summary(updated, true);
}

export async function resolveTelegramBotByWebhookSecret(db: D1Database, bindings: TelegramBotConfigBindings, providedSecret: string | null, botHint?: string | null, scope: TelegramBotScope = "legacy") {
  if (!providedSecret || !WEBHOOK_PATTERN.test(providedSecret.trim())) return null;
  // A bot hint is part of the webhook URL and therefore part of Telegram's
  // configured endpoint. Without it, scan only the small active/previous set.
  const now = nowIso();
  const rows = botHint
    ? await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE id = ? AND scope = ? AND (status = 'active' OR (status = 'previous' AND previous_expires_at > ?)) LIMIT 1").bind(botHint, scope, now).all<TelegramBotConfigRow>()
    : await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE scope = ? AND (status = 'active' OR (status = 'previous' AND previous_expires_at > ?)) ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 2").bind(scope, now).all<TelegramBotConfigRow>();
  for (const row of rows.results) {
    const webhookSecret = await openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64);
    const [providedHash, expectedHash] = await Promise.all([
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(providedSecret.trim())),
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(webhookSecret)),
    ]);
    if (equalBytes(new Uint8Array(providedHash), new Uint8Array(expectedHash))) {
      const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
      return { config: summary(row, true), credential: { configId: row.id, scope: row.scope, botId: row.telegram_bot_id, username: row.username, firstName: row.first_name, token, webhookSecret, status: row.status, version: row.version, authRevision: row.auth_revision, miniAppUrl: row.mini_app_url, webhookUrl: row.webhook_url } satisfies TelegramBotCredential };
    }
  }
  return null;
}

export async function listTelegramBotCredentials(db: D1Database, bindings: TelegramBotConfigBindings, scope: TelegramBotScope = "legacy") {
  const rows = await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE scope = ? AND (status = 'active' OR (status = 'previous' AND previous_expires_at > ?)) ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 2").bind(scope, nowIso()).all<TelegramBotConfigRow>();
  const credentials: TelegramBotCredential[] = [];
  for (const row of rows.results) {
    try {
      credentials.push({ configId: row.id, scope: row.scope, botId: row.telegram_bot_id, username: row.username, firstName: row.first_name, token: await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64), webhookSecret: await openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64), status: row.status, version: row.version, authRevision: row.auth_revision, miniAppUrl: row.mini_app_url, webhookUrl: row.webhook_url });
    } catch {
      // A corrupt previous row must not prevent the active bot from serving.
    }
  }
  return credentials;
}

export async function getTelegramBotCredential(db: D1Database, bindings: TelegramBotConfigBindings, id: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  const row = await db.prepare("SELECT * FROM shop_telegram_bot_configs WHERE id = ? AND status <> 'revoked' LIMIT 1")
    .bind(id).first<TelegramBotConfigRow>();
  if (!row) return null;
  try {
    const [token, webhookSecret] = await Promise.all([
      openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64),
      openSecret(bindings, row, "webhook", row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64),
    ]);
    return {
      configId: row.id,
      scope: row.scope,
      botId: row.telegram_bot_id,
      username: row.username,
      firstName: row.first_name,
      token,
      webhookSecret,
      status: row.status,
      version: row.version,
      authRevision: row.auth_revision,
      miniAppUrl: row.mini_app_url,
      webhookUrl: row.webhook_url,
    } satisfies TelegramBotCredential;
  } catch {
    return null;
  }
}

export async function testTelegramBotConfig(db: D1Database, bindings: TelegramBotConfigBindings, id: string, actor: string, requestId: string) {
  const row = await rowById(db, id);
  if (!row || row.status === "revoked") throw new TelegramBotConfigError("telegram_bot_not_found", 404);
  if (row.status === "activating" || row.status === "retiring") {
    throw new TelegramBotConfigError("telegram_bot_operation_in_progress", 409);
  }
  try {
    const token = await openSecret(bindings, row, "token", row.token_ciphertext_b64, row.token_iv_b64);
    const [identity, hook] = await Promise.all([
      identityForToken(token),
      callTelegramBotApi<Record<string, unknown>>(token, "getWebhookInfo", {}),
    ]);
    if (identity.id !== row.telegram_bot_id || identity.username !== row.username) throw new TelegramBotConfigError("telegram_identity_mismatch");
    const expectedWebhook = webhookUrl(bindings, row.id);
    const configuredWebhook = typeof hook.url === "string" ? hook.url : "";
    const timestamp = nowIso();
    await db.batch([
      db.prepare(`UPDATE shop_telegram_bot_configs SET last_validated_at = ?,
          last_error_code = CASE WHEN last_error_code IN (?, ?) THEN last_error_code ELSE NULL END,
          updated_by = ?, updated_at = ?
        WHERE id = ? AND status <> 'activating'`).bind(
        timestamp,
        LEGACY_WEBHOOK_CLEANUP_PENDING,
        LEGACY_WEBHOOK_CLEANUP_FAILED,
        actor,
        timestamp,
        id,
      ),
      db.prepare(`INSERT INTO shop_telegram_bot_events (id, bot_config_id, action, outcome, actor, request_id, details_json, created_at)
        VALUES (?, ?, 'validated', 'success', ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, actor.slice(0, 200), requestId.slice(0, 100), JSON.stringify({ webhookMatches: configuredWebhook === expectedWebhook }), timestamp),
    ]);
    return {
      id,
      reachable: true,
      identityMatches: true,
      webhookMatches: configuredWebhook === expectedWebhook,
      pendingUpdateCount: typeof hook.pending_update_count === "number" ? Math.max(0, Math.floor(hook.pending_update_count)) : 0,
      testedAt: timestamp,
    };
  } catch (error) {
    const code = error instanceof TelegramBotConfigError ? error.code : error instanceof TelegramApiError ? error.code : "telegram_unavailable";
    const timestamp = nowIso();
    await db.batch([
      db.prepare(`UPDATE shop_telegram_bot_configs SET
          last_error_code = CASE WHEN last_error_code IN (?, ?) THEN last_error_code ELSE ? END,
          updated_by = ?, updated_at = ?
        WHERE id = ? AND status <> 'activating'`).bind(
        LEGACY_WEBHOOK_CLEANUP_PENDING,
        LEGACY_WEBHOOK_CLEANUP_FAILED,
        code.slice(0, 100),
        actor,
        timestamp,
        id,
      ),
      db.prepare(`INSERT INTO shop_telegram_bot_events (id, bot_config_id, action, outcome, error_code, actor, request_id, details_json, created_at)
        VALUES (?, ?, 'validated', 'failed', ?, ?, ?, '{}', ?)`).bind(crypto.randomUUID(), id, code.slice(0, 100), actor.slice(0, 200), requestId.slice(0, 100), timestamp),
    ]).catch(() => undefined);
    throw error instanceof TelegramBotConfigError ? error : new TelegramBotConfigError(code, 502);
  }
}

export async function botConfigFingerprint(bindings: TelegramBotConfigBindings, value: string) {
  const context = await encryptionContext(bindings);
  return sha256Base64Url(frame(TELEGRAM_CONFIG_CRYPTO_VERSION, context.keyVersion, value));
}
