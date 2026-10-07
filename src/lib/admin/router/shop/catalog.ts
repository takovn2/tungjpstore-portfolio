import { adminError, adminJson } from "../../http";
import { readJsonObject } from "../../db-utils";
import { parseExpectedVersion } from "../../validation";
import { activateShopProduct, archiveShopCategory, archiveShopProduct, createShopCategory, createShopProduct, getInventorySummary, getShopPricingSettings, getShopProduct, listInventoryImportBatches, listPublicProducts, listShopCategories, updateShopCategory, updateShopPricingSettings, updateShopProduct, ShopConflictError, ShopNotFoundError } from "../../../../lib/shop/repository";
import { listShopProductsForAdmin } from "../../../../lib/shop/ops-repository";
import { requireShopCrypto } from "../../../../lib/shop/crypto";
import { commitInventoryImport, importInventoryKeys, previewInventoryImport } from "../../../../lib/shop/service";
import { parseUsdVndRateInput, validateAffiliateUpsertInput, validateInventoryImportChunkInput, validateInventoryImportInput, validateInventoryImportPreviewInput, validateProductUpsertInput, validateShopCategoryInput } from "../../../../lib/shop/validation";
import type { AdminRouteContext } from "../context";
import { parseLimit, parsePage } from "./shared";

const BULK_PRODUCT_LIMIT = 20;

async function handlePricing(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, requestId } = ctx;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (resource === "pricing" && method === "GET" && segments.length === 2) {
    return adminJson({ ok: true, pricing: await getShopPricingSettings(shopDb) });
  }
  if (resource === "pricing" && method === "PUT" && segments.length === 2) {
    const payload = await readJsonObject(request, 16_000, { code: "currency_rate_invalid" });
    if (payload instanceof Response) return payload;
    const usdVndRateScaled = parseUsdVndRateInput(payload.usdVndRate ?? payload.usdVndRateScaled);
    const expectedVersion = payload.expectedVersion === undefined ? undefined : Number(payload.expectedVersion);
    if (usdVndRateScaled === null || (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))) return adminError("currency_rate_invalid", 422);
    try {
      return adminJson({ ok: true, pricing: await updateShopPricingSettings(shopDb, { usdVndRateScaled, ...(expectedVersion === undefined ? {} : { expectedVersion }) }, actor, requestId) });
    } catch (error) {
      if (error instanceof ShopConflictError) return adminError(error.code, 409);
      throw error;
    }
  }
  return null;
}

async function handleAffiliates(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method } = ctx;
  if (resource !== "affiliates") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const { listAffiliatePartners, upsertAffiliatePartner, listCommissionAccruals } = await import("../../../../lib/shop/platform/service");
  if (method === "GET" && segments.length === 2) {
    try {
      const [partners, commissions] = await Promise.all([
        listAffiliatePartners(shopDb),
        listCommissionAccruals(shopDb, 30).catch(() => []),
      ]);
      return adminJson({ ok: true, partners, commissions });
    } catch (error) {
      if (/no such table/i.test(String(error))) return adminJson({ ok: true, partners: [], commissions: [], migrated: false });
      throw error;
    }
  }
  if (method === "POST" && segments.length === 2) {
    const payload = await readJsonObject(request, 16_000);
    if (payload instanceof Response) return payload;
    const parsed = validateAffiliateUpsertInput(payload);
    if (!parsed.ok) return adminError("validation_failed", 422, { issues: parsed.issues });
    try {
      const partner = await upsertAffiliatePartner(shopDb, parsed.value);
      return adminJson({ ok: true, partner }, 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "affiliate_failed";
      if (code === "invalid_affiliate_code") return adminError(code, 422);
      if (/no such table/i.test(String(error))) return adminError("affiliate_not_migrated", 503);
      throw error;
    }
  }
  return adminError("method_not_allowed", 405);
}

async function handleCategories(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, requestId } = ctx;
  if (resource !== "categories") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 2) {
    return adminJson({ ok: true, categories: await listShopCategories(shopDb) });
  }
  if (method === "POST" && segments.length === 2) {
    const payload = await readJsonObject(request, 64_000, { code: "shop_category_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateShopCategoryInput(payload);
    if (!parsed.ok) return adminError("shop_category_validation_failed", 422, { issues: parsed.issues });
    return adminJson({ ok: true, category: await createShopCategory(shopDb, parsed.value, actor, requestId) }, 201);
  }
  const categoryId = segments[2];
  if (!categoryId) return adminError("shop_category_not_found", 404);
  if (method === "PUT" && segments.length === 3) {
    const payload = await readJsonObject(request, 64_000, { code: "shop_category_validation_failed" });
    if (payload instanceof Response) return payload;
    const { expectedVersion, ...candidate } = payload;
    const version = parseExpectedVersion(expectedVersion);
    const parsed = validateShopCategoryInput(candidate);
    if (version === null || !parsed.ok) return adminError("shop_category_validation_failed", 422, { issues: parsed.ok ? [{ path: "expectedVersion", code: "invalid_version" }] : parsed.issues });
    return adminJson({ ok: true, category: await updateShopCategory(shopDb, categoryId, parsed.value, version, actor, requestId) });
  }
  if (method === "POST" && segments.length === 4 && segments[3] === "archive") {
    const payload = await readJsonObject(request, 16_000, { code: "shop_category_validation_failed" });
    if (payload instanceof Response) return payload;
    const version = parseExpectedVersion(payload.expectedVersion);
    if (version === null) return adminError("shop_category_validation_failed", 422);
    return adminJson({ ok: true, category: await archiveShopCategory(shopDb, categoryId, version, actor, requestId) });
  }
  return adminError("method_not_allowed", 405);
}

async function handleProducts(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, requestId } = ctx;
  if (resource !== "products") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 2) {
    const url = new URL(request.url);
    const locale = url.searchParams.get("locale");
    const storefront = locale === "vi" || locale === "en" || locale === "ja" || locale === "zh"
      ? await listPublicProducts(shopDb, { locale, limit: 100 })
      : null;
    if (storefront) return adminJson({ ok: true, products: storefront });
    const page = await listShopProductsForAdmin(shopDb, {
      page: parsePage(url.searchParams.get("page")),
      limit: parseLimit(url.searchParams.get("limit"), 20),
    });
    return adminJson({ ok: true, products: page.products, total: page.total, pagination: page.pagination });
  }
  if (method === "POST" && segments.length === 3 && segments[2] === "bulk") {
    const payload = await readJsonObject(request, 64_000, { code: "shop_product_validation_failed" });
    if (payload instanceof Response) return payload;
    const action = payload.action;
    const rawItems = payload.items;
    if ((action !== "archive" && action !== "activate") || !Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > BULK_PRODUCT_LIMIT) {
      return adminError("shop_product_validation_failed", 422, { issues: [{ path: "items", code: "one_to_twenty_required" }] });
    }
    const items = rawItems.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const entry = raw as Record<string, unknown>;
      const id = typeof entry.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(entry.id) ? entry.id : null;
      const version = parseExpectedVersion(entry.expectedVersion);
      return id && version !== null ? { id, expectedVersion: version } : null;
    });
    if (items.some((entry) => entry === null)) return adminError("shop_product_validation_failed", 422, { issues: [{ path: "items", code: "invalid_item" }] });
    const results = [];
    for (const item of items as Array<{ id: string; expectedVersion: number }>) {
      try {
        const product = action === "archive"
          ? await archiveShopProduct(shopDb, item.id, item.expectedVersion, actor, requestId)
          : await activateShopProduct(shopDb, item.id, item.expectedVersion, actor, requestId);
        results.push({ id: item.id, ok: true, product });
      } catch (error) {
        if (error instanceof ShopConflictError || error instanceof ShopNotFoundError) {
          results.push({ id: item.id, ok: false, code: error instanceof ShopConflictError ? error.code : "shop_product_not_found" });
          continue;
        }
        throw error;
      }
    }
    return adminJson({ ok: true, results });
  }
  if (method === "POST" && segments.length === 2) {
    const payload = await readJsonObject(request, 256_000, { code: "shop_product_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateProductUpsertInput(payload);
    if (!parsed.ok) return adminError("shop_product_validation_failed", 422, { issues: parsed.issues });
    return adminJson({ ok: true, product: await createShopProduct(shopDb, parsed.value, actor, requestId) }, 201);
  }
  const productId = segments[2];
  if (!productId) return adminError("shop_product_not_found", 404);
  if (method === "GET" && segments.length === 3) {
    const product = await getShopProduct(shopDb, productId);
    return product ? adminJson({ ok: true, product }) : adminError("shop_product_not_found", 404);
  }
  if (method === "PUT" && segments.length === 3) {
    const payload = await readJsonObject(request, 256_000, { code: "shop_product_validation_failed" });
    if (payload instanceof Response) return payload;
    const { expectedVersion, ...candidate } = payload;
    const version = parseExpectedVersion(expectedVersion);
    const parsed = validateProductUpsertInput(candidate);
    if (version === null || !parsed.ok) return adminError("shop_product_validation_failed", 422, { issues: parsed.ok ? [{ path: "expectedVersion", code: "invalid_version" }] : parsed.issues });
    return adminJson({ ok: true, product: await updateShopProduct(shopDb, productId, parsed.value, version, actor, requestId) });
  }
  if (method === "POST" && segments.length === 4 && segments[3] === "archive") {
    const payload = await readJsonObject(request, 16_000, { code: "shop_product_validation_failed" });
    if (payload instanceof Response) return payload;
    const version = parseExpectedVersion(payload.expectedVersion);
    if (version === null) return adminError("shop_product_validation_failed", 422);
    return adminJson({ ok: true, product: await archiveShopProduct(shopDb, productId, version, actor, requestId) });
  }
  return adminError("method_not_allowed", 405);
}

async function handleInventory(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, bindings, requestId } = ctx;
  if (resource !== "inventory") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 3 && segments[2] === "batches") {
    const url = new URL(request.url);
    const variantId = url.searchParams.get("variantId")?.trim() || undefined;
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isSafeInteger(requestedLimit) ? requestedLimit : 50;
    return adminJson({ ok: true, batches: await listInventoryImportBatches(shopDb, variantId, limit) });
  }
  if (method === "GET" && (segments.length === 2 || segments.length === 3)) {
    let cryptoReady = false;
    try {
      await requireShopCrypto(bindings);
      cryptoReady = true;
    } catch {
      // Readiness is intentionally coarse so this endpoint never exposes secret details.
    }
    return adminJson({
      ok: true,
      inventory: await getInventorySummary(shopDb, segments[2]),
      cryptoReady,
      cryptoStatus: cryptoReady ? "ready" : "not_configured",
    });
  }
  if (method === "POST" && segments.length === 3 && segments[2] === "preview") {
    // Resolve cryptography before reading key material into memory.
    await requireShopCrypto(bindings);
    const payload = await readJsonObject(request, 700_000, { code: "shop_inventory_preview_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateInventoryImportPreviewInput(payload);
    if (!parsed.ok) return adminError("shop_inventory_preview_validation_failed", 422, { issues: parsed.issues });
    return adminJson({ ok: true, preview: await previewInventoryImport(bindings, parsed.value, actor, requestId) });
  }
  if (method === "POST" && segments.length === 3 && segments[2] === "commit") {
    await requireShopCrypto(bindings);
    const payload = await readJsonObject(request, 128_000, { code: "shop_inventory_commit_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateInventoryImportChunkInput(payload);
    if (!parsed.ok) return adminError("shop_inventory_commit_validation_failed", 422, { issues: parsed.issues });
    return adminJson({ ok: true, inventory: await commitInventoryImport(bindings, parsed.value, actor, requestId) });
  }
  if (method === "POST" && segments.length === 3 && segments[2] === "import") {
    // Fail closed before reading key material if the Worker secret is unavailable.
    await requireShopCrypto(bindings);
    const payload = await readJsonObject(request, 128_000, { code: "shop_inventory_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateInventoryImportInput(payload);
    if (!parsed.ok) return adminError("shop_inventory_validation_failed", 422, { issues: parsed.issues });
    return adminJson({ ok: true, inventory: await importInventoryKeys(bindings, parsed.value, actor, requestId) }, 201);
  }
  return adminError("method_not_allowed", 405);
}

export async function handleCatalogRoutes(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  return (await handlePricing(ctx, resource))
    ?? (await handleAffiliates(ctx, resource))
    ?? (await handleCategories(ctx, resource))
    ?? (await handleProducts(ctx, resource))
    ?? (await handleInventory(ctx, resource));
}
