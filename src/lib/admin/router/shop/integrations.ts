import { adminError, adminJson, isResponse, readJsonBody } from "../../http";
import { parseExpectedVersion } from "../../validation";
import { notionStatus, previewNotionEditorialSync, NotionIntegrationError } from "../../../../lib/shop/notion";
import { configureTelegramBot, getTelegramConfigurationStatus, TelegramApiError } from "../../../../lib/shop/telegram";
import { configureLegacyTelegramBotSafely } from "../../../../lib/shop/telegram-legacy-config";
import { activateTelegramBotConfig, createTelegramBotConfig, listTelegramBotConfigs, parseTelegramBotInput, revokeTelegramBotConfig, rewrapTelegramBotConfigSecrets, rollbackTelegramBotConfig, TelegramBotConfigError, testTelegramBotConfig, validateTelegramBotToken } from "../../../../lib/shop/telegram-bot-config";
import { listTelegramBotEvents } from "../../../../lib/shop/ops-repository";
import type { AdminRouteContext } from "../context";
import { parseActionVersion } from "../context";
import { recentAdminAuthError, telegramAdminView, telegramFailure } from "./shared";

async function handleNotion(ctx: AdminRouteContext, resource: string, segments: string[]): Promise<Response | null> {
  const { method, bindings } = ctx;
  if (resource !== "integrations" || segments[2] !== "notion") return null;
  const notionConfig = {
    token: bindings.NOTION_SHOP_TOKEN,
    productPlanningDatabaseId: bindings.NOTION_SHOP_DATABASE_ID,
    editorialDatabaseId: bindings.NOTION_EDITORIAL_DATABASE_ID,
    notionVersion: bindings.NOTION_API_VERSION,
  };
  const action = segments[3] ?? "status";
  if (action === "status" && method === "GET" && (segments.length === 3 || segments.length === 4)) {
    return adminJson({ ok: true, integration: notionStatus(notionConfig) });
  }
  if ((action === "test" || action === "sync") && method === "POST" && segments.length === 4) {
    try {
      const preview = await previewNotionEditorialSync(notionConfig);
      return adminJson({ ok: true, integration: preview, ...(action === "sync" ? { mode: "preview_only" } : { mode: "connectivity_test" }) });
    } catch (error) {
      if (error instanceof NotionIntegrationError) {
        const status = error.code === "notion_not_configured" ? 503 : error.code === "notion_request_failed" ? 502 : 502;
        return adminError(error.code, status);
      }
      return adminError("notion_unavailable", 503);
    }
  }
  return adminError("method_not_allowed", 405);
}

async function handleTelegramBots(ctx: AdminRouteContext, segments: string[]): Promise<Response | null> {
  const { request, method, bindings, user, session, requestId } = ctx;
  const shopDb = bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  try {
    if (method === "GET" && segments.length === 3) {
      const scopeParam = new URL(request.url).searchParams.get("scope");
      const scope = scopeParam === "glb" ? "glb" : scopeParam === "legacy" ? "legacy" : null;
      const registry = await listTelegramBotConfigs(shopDb, bindings, scope);
      const events = await listTelegramBotEvents(shopDb);
      return adminJson({ ok: true, ...registry, events });
    }
    if (method === "POST" && segments.length === 4 && segments[3] === "validate") {
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload) || !payload || typeof payload !== "object" || Array.isArray(payload)) return isResponse(payload) ? payload : adminError("telegram_bot_validation_failed", 422);
      const payloadRecord = payload as Record<string, unknown>;
      const token = typeof payloadRecord.token === "string" ? payloadRecord.token.trim() : "";
      const identity = await validateTelegramBotToken(bindings, token);
      return adminJson({ ok: true, identity });
    }
    if (method === "POST" && segments.length === 3) {
      const authError = recentAdminAuthError(session);
      if (authError) return authError;
      const payload = await readJsonBody(request, 24_000);
      if (isResponse(payload)) return payload;
      const input = parseTelegramBotInput(payload);
      const bot = await createTelegramBotConfig(shopDb, bindings, input, user.email, requestId);
      return adminJson({ ok: true, bot }, 201);
    }
    const botId = segments[3];
    if (!botId || !/^[A-Za-z0-9-]{20,64}$/.test(botId)) return adminError("telegram_bot_not_found", 404);
    if (method === "POST" && segments.length === 5 && (segments[4] === "activate" || segments[4] === "rollback")) {
      const authError = recentAdminAuthError(session);
      if (authError) return authError;
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload)) return payload;
      const expectedVersion = payload && typeof payload === "object" && !Array.isArray(payload)
        ? parseExpectedVersion((payload as Record<string, unknown>).expectedVersion)
        : null;
      if (expectedVersion === null) return adminError("telegram_bot_validation_failed", 422, { issues: [{ path: "expectedVersion", code: "invalid_version" }] });
      const bot = segments[4] === "rollback"
        ? await rollbackTelegramBotConfig(shopDb, bindings, botId, expectedVersion, user.email, requestId)
        : await activateTelegramBotConfig(shopDb, bindings, botId, expectedVersion, user.email, requestId, "activate");
      return adminJson({ ok: true, bot });
    }
    if (method === "POST" && segments.length === 5 && segments[4] === "test") {
      return adminJson({ ok: true, test: await testTelegramBotConfig(shopDb, bindings, botId, user.email, requestId) });
    }
    if (method === "POST" && segments.length === 5 && (segments[4] === "revoke" || segments[4] === "archive")) {
      const authError = recentAdminAuthError(session);
      if (authError) return authError;
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload)) return payload;
      const expectedVersion = payload && typeof payload === "object" && !Array.isArray(payload)
        ? parseExpectedVersion((payload as Record<string, unknown>).expectedVersion)
        : null;
      if (expectedVersion === null) return adminError("telegram_bot_validation_failed", 422, { issues: [{ path: "expectedVersion", code: "invalid_version" }] });
      return adminJson(await revokeTelegramBotConfig(shopDb, bindings, botId, expectedVersion, user.email, requestId));
    }
    if (method === "POST" && segments.length === 5 && segments[4] === "rewrap") {
      const authError = recentAdminAuthError(session);
      if (authError) return authError;
      const payload = await readJsonBody(request, 16_000);
      if (isResponse(payload)) return payload;
      const expectedVersion = parseActionVersion(payload);
      if (expectedVersion === null) return adminError("telegram_bot_validation_failed", 422, { issues: [{ path: "expectedVersion", code: "invalid_version" }] });
      const bot = await rewrapTelegramBotConfigSecrets(shopDb, bindings, botId, expectedVersion, user.email, requestId);
      return adminJson({ ok: true, bot });
    }
    return adminError("method_not_allowed", 405);
  } catch (error) {
    return telegramFailure(error, requestId);
  }
}

async function handleTelegram(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { segments, method, bindings, session, requestId } = ctx;
  const shopDb = bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  if (resource === "telegram" || (resource === "integrations" && segments[2] === "telegram")) {
    const isLegacyAlias = resource === "telegram";
    // The registry endpoints are the preferred path for rotating between
    // bots. Legacy `/shop/telegram/configure` remains available only while
    // no registry-owned credential is standing by, activating, or live.
    if (resource === "telegram" && segments[2] === "bots") {
      return handleTelegramBots(ctx, segments);
    }
    const action = isLegacyAlias ? (segments[2] ?? "status") : (segments[3] ?? "status");
    const statusPath = isLegacyAlias ? (segments.length === 2 || segments.length === 3) : (segments.length === 3 || segments.length === 4);
    const configurePath = isLegacyAlias ? segments.length === 3 : segments.length === 4;
    if (action === "status" && method === "GET" && statusPath) {
      try {
        const registry = await listTelegramBotConfigs(shopDb, bindings, "legacy");
        const activeBot = registry.bots.find((bot) => bot.status === "active") || null;
        const integration = activeBot ? {
          configured: true,
          webhookConfigured: Boolean(activeBot.lastConfiguredAt),
          webhookRegistered: Boolean(activeBot.lastConfiguredAt),
          registryManaged: true,
          legacyFallbackEnabled: false,
          botId: activeBot.id,
          botUsername: activeBot.username,
          botName: activeBot.firstName,
          version: activeBot.version,
        } : telegramAdminView(await getTelegramConfigurationStatus(bindings));
        return adminJson({ ok: true, integration, telegram: { ...integration, registry }, registry });
      } catch (error) {
        return telegramFailure(error, requestId);
      }
    }
    if (action === "configure" && method === "POST" && configurePath) {
      try {
        const authError = recentAdminAuthError(session);
        if (authError) return authError;
        const result = await configureLegacyTelegramBotSafely(shopDb, () => configureTelegramBot(bindings));
        if (!result.ok) return adminError(result.code, 409);
        const configured = result.value;
        const integration = telegramAdminView(await getTelegramConfigurationStatus(bindings));
        return adminJson({ ok: true, integration, telegram: { ...integration, commandsConfigured: configured.commandsConfigured } });
      } catch (error) {
        return telegramFailure(error, requestId);
      }
    }
    return adminError("method_not_allowed", 405);
  }
  return null;
}

export async function handleIntegrationRoutes(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { segments } = ctx;
  return (await handleNotion(ctx, resource, segments))
    ?? (await handleTelegram(ctx, resource));
}
