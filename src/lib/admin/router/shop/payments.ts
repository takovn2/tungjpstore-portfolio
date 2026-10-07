import { adminError, adminJson } from "../../http";
import { readJsonObject } from "../../db-utils";
import { parseExpectedVersion } from "../../validation";
import { archiveCryptoPaymentMethod, archiveShopDiscount, createPaymentProviderConfig, getShopDiscount, listCryptoPaymentMethods, listShopDiscounts, updateCryptoPaymentMethod, upsertShopDiscount, ShopConflictError, ShopNotFoundError } from "../../../../lib/shop/repository";
import { getVietQrProviderRow, listPaymentWorkbench } from "../../../../lib/shop/ops-repository";
import { createCryptoPaymentMethodConfig } from "../../../../lib/shop/service";
import { validateCryptoPaymentMethodInput, validateDiscountUpsertInput, validatePaymentProviderConfigInput } from "../../../../lib/shop/validation";
import type { AdminRouteContext } from "../context";
import { cryptoPaymentRuntimeStatus, paymentConfigError, paymentRuntimeStatus } from "./shared";

async function handlePayment(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, bindings, requestId } = ctx;
  if (resource !== "payment") return null;
  const shopDb = bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 2) {
    const workbench = await listPaymentWorkbench(shopDb);
    return adminJson({ ok: true, ...workbench, cryptoRuntime: cryptoPaymentRuntimeStatus() });
  }
  if (method === "GET" && segments.length === 3 && segments[2] === "providers") {
    const provider = await getVietQrProviderRow(shopDb);
    const configurationSupported = provider?.confirmationAdapter === "payos"
      && provider?.secretRef === "PAYOS_CHECKSUM_KEY"
      && provider?.accountRef === "VIETQR_BANK_ACCOUNT";
    const runtime = paymentRuntimeStatus(bindings);
    return adminJson({ ok: true, provider: provider ? {
      ...provider,
      configurationSupported,
      ...runtime,
      secretConfigured: configurationSupported && runtime.checksumKeyConfigured,
      ready: configurationSupported && provider.status === "active" && runtime.accountConfigured && runtime.payOsConfigured,
    } : null });
  }
  if (segments.length === 3 && segments[2] === "crypto-methods") {
    if (method === "GET") {
      const scopeParam = new URL(request.url).searchParams.get("scope");
      const scope = scopeParam === "legacy" ? "legacy" : "glb";
      return adminJson({ ok: true, scope, methods: await listCryptoPaymentMethods(shopDb, false, scope), runtime: cryptoPaymentRuntimeStatus() });
    }
    if (method === "POST") {
      const payload = await readJsonObject(request, 64_000, { code: "shop_crypto_payment_validation_failed" });
      if (payload instanceof Response) return payload;
      const parsed = validateCryptoPaymentMethodInput(payload);
      if (!parsed.ok) return adminError("shop_crypto_payment_validation_failed", 422, { issues: parsed.issues });
      return adminJson({ ok: true, method: await createCryptoPaymentMethodConfig(bindings, parsed.value, actor, requestId) }, 201);
    }
    return adminError("method_not_allowed", 405);
  }
  if ((segments.length === 4 || segments.length === 5) && segments[2] === "crypto-methods") {
    const methodId = segments[3];
    if (method === "PUT") {
      const payload = await readJsonObject(request, 64_000, { code: "shop_crypto_payment_validation_failed" });
      if (payload instanceof Response) return payload;
      const version = parseExpectedVersion(payload.expectedVersion);
      const { expectedVersion: _expectedVersion, ...candidate } = payload;
      const parsed = validateCryptoPaymentMethodInput(candidate);
      if (version === null || !parsed.ok) return adminError("shop_crypto_payment_validation_failed", 422, { issues: parsed.ok ? [{ path: "expectedVersion", code: "invalid_version" }] : parsed.issues });
      return adminJson({ ok: true, method: await updateCryptoPaymentMethod(shopDb, methodId, parsed.value, version, actor, requestId) });
    }
    if (method === "POST" && segments.length === 5 && segments[4] === "archive") {
      return adminJson({ ok: true, method: await archiveCryptoPaymentMethod(shopDb, methodId, actor, requestId) });
    }
    return adminError("method_not_allowed", 405);
  }
  const payload = await readJsonObject(request, 64_000, { code: "shop_payment_validation_failed" });
  if (payload instanceof Response) return payload;
  if (method === "POST" && segments.length === 3 && segments[2] === "providers") {
    const parsed = validatePaymentProviderConfigInput(payload);
    if (!parsed.ok) return adminError("shop_payment_validation_failed", 422, { issues: parsed.issues });
    const configError = paymentConfigError(parsed, bindings);
    if (configError) return adminError(configError, configError.endsWith("not_configured") ? 503 : 422);
    return adminJson({ ok: true, provider: await createPaymentProviderConfig(shopDb, parsed.value, actor, requestId) }, 201);
  }
  return adminError("method_not_allowed", 405);
}

async function handleDiscounts(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, requestId } = ctx;
  if (resource !== "discounts") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 2) {
    return adminJson({ ok: true, discounts: await listShopDiscounts(shopDb, 100) });
  }
  if (method === "GET" && segments.length === 3) {
    const discount = await getShopDiscount(shopDb, segments[2]);
    if (!discount) return adminError("shop_discount_not_found", 404);
    return adminJson({ ok: true, discount });
  }
  if (method === "POST" && segments.length === 2) {
    const payload = await readJsonObject(request, 32_000, { code: "shop_discount_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateDiscountUpsertInput(payload);
    if (!parsed.ok) return adminError("shop_discount_validation_failed", 422, { issues: parsed.issues });
    try {
      return adminJson({ ok: true, discount: await upsertShopDiscount(shopDb, parsed.value, actor, requestId) }, 201);
    } catch (error) {
      if (error instanceof ShopConflictError) return adminError(error.code, 409);
      throw error;
    }
  }
  if (method === "PUT" && segments.length === 3) {
    const payload = await readJsonObject(request, 32_000, { code: "shop_discount_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateDiscountUpsertInput(payload);
    if (!parsed.ok) return adminError("shop_discount_validation_failed", 422, { issues: parsed.issues });
    try {
      return adminJson({ ok: true, discount: await upsertShopDiscount(shopDb, parsed.value, actor, requestId, segments[2]) });
    } catch (error) {
      if (error instanceof ShopNotFoundError) return adminError("shop_discount_not_found", 404);
      if (error instanceof ShopConflictError) return adminError(error.code, 409);
      throw error;
    }
  }
  if (method === "POST" && segments.length === 4 && segments[3] === "archive") {
    try {
      return adminJson({ ok: true, discount: await archiveShopDiscount(shopDb, segments[2], actor, requestId) });
    } catch (error) {
      if (error instanceof ShopNotFoundError) return adminError("shop_discount_not_found", 404);
      throw error;
    }
  }
  return adminError("method_not_allowed", 405);
}

export async function handlePaymentRoutes(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  return (await handlePayment(ctx, resource))
    ?? (await handleDiscounts(ctx, resource));
}
