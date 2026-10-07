import { adminError } from "../../http";
import type { AdminBindings } from "../../types";
import { shopErrorCode, shopHttpStatus } from "../../../../lib/shop/api-errors";
import { TelegramApiError } from "../../../../lib/shop/telegram";
import { TelegramBotConfigError } from "../../../../lib/shop/telegram-bot-config";
import type { getTelegramConfigurationStatus } from "../../../../lib/shop/telegram";

export function paymentRuntimeStatus(bindings: AdminBindings) {
  const accountConfigured = typeof bindings.VIETQR_BANK_ACCOUNT === "string"
    && /^[0-9]{4,32}$/.test(bindings.VIETQR_BANK_ACCOUNT.trim());
  const clientIdConfigured = typeof bindings.PAYOS_CLIENT_ID === "string"
    && bindings.PAYOS_CLIENT_ID.trim().length >= 16;
  const apiKeyConfigured = typeof bindings.PAYOS_API_KEY === "string"
    && bindings.PAYOS_API_KEY.trim().length >= 16;
  const checksumKeyConfigured = typeof bindings.PAYOS_CHECKSUM_KEY === "string"
    && bindings.PAYOS_CHECKSUM_KEY.trim().length >= 32;
  return {
    accountConfigured,
    clientIdConfigured,
    apiKeyConfigured,
    checksumKeyConfigured,
    payOsConfigured: clientIdConfigured && apiKeyConfigured && checksumKeyConfigured,
  };
}

export function cryptoPaymentRuntimeStatus() {
  return { verificationMode: "manual", apiVerification: false };
}

/** Clamp a 1-based page number from an unknown query value. */
export function parsePage(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000 ? parsed : 1;
}

/** Clamp a page size between 1 and 100 with a per-call fallback. */
export function parseLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : fallback;
}

export function paymentConfigError(input: { ok: boolean; value?: Record<string, unknown> }, bindings: AdminBindings) {
  if (!input.ok || !input.value) return null;
  const value = input.value as Record<string, unknown>;
  if (value.accountRef !== "VIETQR_BANK_ACCOUNT") return "shop_payment_account_ref_invalid";
  if (value.confirmationAdapter !== "payos") return "shop_payment_payos_required";
  if (value.secretRef !== "PAYOS_CHECKSUM_KEY") return "shop_payment_secret_ref_invalid";
  if (value.status !== "active") return null;
  const runtime = paymentRuntimeStatus(bindings);
  if (!runtime.accountConfigured) return "shop_payment_account_not_configured";
  if (!runtime.clientIdConfigured) return "shop_payment_payos_client_id_not_configured";
  if (!runtime.apiKeyConfigured) return "shop_payment_payos_api_key_not_configured";
  if (!runtime.checksumKeyConfigured) return "shop_payment_payos_checksum_key_not_configured";
  return null;
}

export function shopFailure(error: unknown, id: string) {
  const code = shopErrorCode(error);
  const status = shopHttpStatus(code);
  console.error(JSON.stringify({
    event: "admin_shop_api_failed",
    requestId: id,
    errorName: error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : "UnknownError",
    code: code === "shop_unavailable" ? code : "shop_request_failed",
  }));
  return adminError(code, status);
}

export function telegramFailure(error: unknown, id: string) {
  if (error instanceof TelegramBotConfigError) {
    console.error(JSON.stringify({ event: "admin_telegram_registry_failed", requestId: id, code: error.code }));
    return adminError(error.code, error.status);
  }
  const candidate = error instanceof TelegramApiError ? error.code : "";
  const code = /^telegram_[a-z0-9._:-]{1,80}$/.test(candidate)
    ? candidate
    : "telegram_unavailable";
  const status = code === "telegram_bot_not_configured" ? 503 : 502;
  console.error(JSON.stringify({
    event: "admin_telegram_api_failed",
    requestId: id,
    code,
  }));
  return adminError(code, status);
}

export function telegramAdminView(value: Awaited<ReturnType<typeof getTelegramConfigurationStatus>>) {
  const operational = value.webhookConfigured && value.allowedUpdatesConfigured && value.identityMatchesExpected;
  return {
    ...value,
    // Keep the admin response descriptive without exposing either secret.
    configured: value.ready && value.identityMatchesExpected,
    webhookRegistered: value.webhookConfigured,
    webhookConfigured: operational,
    botUsername: value.identity?.username ?? null,
    botName: value.identity?.firstName ?? null,
  };
}

const ADMIN_RECENT_AUTH_WINDOW_MS = 30 * 60 * 1_000;

/**
 * Credential rotation changes a persistent integration boundary. Require a
 * recently-created password session at the server, even if the UI already
 * showed a confirmation dialog.
 */
export function recentAdminAuthError(session: { createdAt?: string } | null) {
  if (!session) return adminError("password_required", 401);
  const createdAt = Date.parse(session.createdAt ?? "");
  const age = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age > ADMIN_RECENT_AUTH_WINDOW_MS) {
    return adminError("admin_recent_auth_required", 401);
  }
  return null;
}
