import {
  computeInventoryKeyFingerprint,
  createOrderIdentifiers,
  hashCanonicalJson,
  hashIdempotencyKey,
  randomOpaqueToken,
  sha256Base64Url,
} from "./crypto";
import type { ShopCryptoContext } from "./crypto";
import {
  PAYOS_RECONCILIATION_GRACE_SECONDS,
  payOsPaymentOccurredWithinRecoveryWindow,
  payOsTransferDescriptionMatches,
} from "./payos";
import type {
  CheckoutLine,
  CheckoutResult,
  CreateCheckoutInput,
  EncryptedInventoryUnit,
  EncryptedInventoryUnitRow,
  InventoryImportChunkInput,
  InventoryImportChunkResult,
  InventoryImportPreviewInput,
  InventoryImportPreviewResult,
  InventoryImportSourceFormat,
  JsonObject,
  OutboxMessage,
  PaymentAttempt,
  PaymentAttemptInput,
  PaymentConfirmationInput,
  PaymentReconciliationContext,
  PaymentReconciliationResult,
  PaymentProviderConfigInput,
  ProductUpsertInput,
  DiscountUpsertInput,
  PublicProduct,
  PublicVariant,
  ShopActor,
  ShopAvailability,
  ShopCategory,
  ShopCategoryInput,
  ShopFulfillmentType,
  ShopInventoryPolicy,
  ShopLocale,
  ShopOrderStatus,
  ShopPaymentStatus,
  ShopCryptoPaymentMethod,
  ShopCryptoPaymentMethodInput,
  ShopCryptoAttemptStatus,
} from "./types";
import { maskShopEmail, normalizeCurrency, normalizeDiscountCode, normalizeInventoryKey, normalizeShopEmail } from "./validation";
// Money primitives are shared with pricing.ts and the storefront. They used to be
// duplicated inline here because the smoke-test bundler strips imports; the
// harnesses that bundle this file now concatenate money.ts ahead of it instead.
import {
  SHOP_BASE_CURRENCY,
  SHOP_DISPLAY_CURRENCY,
  SHOP_RATE_SCALE,
  DEFAULT_USD_VND_RATE_SCALED,
  type ShopPricingSettings,
  rateScaledToNumber,
  convertVndPricePair,
} from "./money";

function fallbackShopPricingSettings(): ShopPricingSettings {
  return {
    id: "default",
    baseCurrency: SHOP_BASE_CURRENCY,
    displayCurrency: SHOP_DISPLAY_CURRENCY,
    usdVndRateScaled: DEFAULT_USD_VND_RATE_SCALED,
    rateScale: SHOP_RATE_SCALE,
    version: 0,
    updatedBy: "fallback",
    updatedAt: "",
  };
}

const DEFAULT_RESERVATION_MINUTES = 30;
const DEFAULT_OUTBOX_LEASE_SECONDS = 90;
const CHECKOUT_RATE_WINDOW_SECONDS = 60;
const CHECKOUT_RATE_MAX_REQUESTS = 8;
const CHECKOUT_RATE_ROW_TTL_SECONDS = 86_400;
const CHECKOUT_MAX_ACTIVE_ORDERS_PER_SUBJECT = 3;

type ProductRow = {
  id: string;
  slug: string;
  status: "draft" | "active" | "archived";
  product_type: PublicProduct["productType"];
  featured: number;
  default_locale: ShopLocale;
  sort_order: number;
  metadata_json: string;
  version: number;
  loc_title: string | null;
  loc_eyebrow: string | null;
  loc_short_description: string | null;
  loc_description: string | null;
  loc_seo_title: string | null;
  loc_seo_description: string | null;
  fallback_title: string | null;
  fallback_eyebrow: string | null;
  fallback_short_description: string | null;
  fallback_description: string | null;
  fallback_seo_title: string | null;
  fallback_seo_description: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  status: "draft" | "active" | "archived";
  fulfillment_type: ShopFulfillmentType;
  delivery_mode: "automatic" | "manual";
  inventory_policy: ShopInventoryPolicy;
  price_minor: number;
  compare_at_minor: number | null;
  currency: string;
  low_stock_threshold: number;
  max_per_order: number;
  option_values_json: string;
  version: number;
  variant_title: string | null;
  fallback_variant_title: string | null;
  available_quantity: number;
};

type MediaRow = { id: string; product_id: string; media_type: "image" | "video"; asset_url: string; alt: string; sort_order: number };

type CheckoutVariantRow = VariantRow & {
  product_slug: string;
  product_status: "draft" | "active" | "archived";
  product_id: string;
  product_title: string | null;
  fallback_product_title: string | null;
  product_type: PublicProduct["productType"];
  base_price_minor?: number;
  base_compare_at_minor?: number | null;
  base_currency?: string;
  exchange_rate_vnd_per_usd_scaled?: number | null;
};

type CheckoutTransaction = {
  requestHash: string;
  idempotencyNamespace: string;
  idempotencyKeyHash: string;
  idempotencyTokenSalt: string;
  input: CreateCheckoutInput;
  customerId: string;
  orderAccessToken: string;
  publicTokenHash: string;
  checkoutSubjectHash: string | null;
  orderId: string;
  orderNumber: string;
  orderReference: string;
  expiresAt: string;
  lines: CheckoutLine[];
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  discountId: string | null;
  discountCode: string | null;
  pricingSnapshot: {
    baseCurrency: string;
    displayCurrency: string;
    usdVndRateScaled: number | null;
    /** Provenance of the rate, so an order stays auditable after it moves. */
    fxProvider: string | null;
    fxAsOf: string | null;
    /** Which market produced this price; null when the checkout did not say. */
    marketCode: string | null;
  };
};

function nowIso() {
  return new Date().toISOString();
}

export async function getShopPricingSettings(db: D1Database): Promise<ShopPricingSettings> {
  // Prefer the generic FX table (migration 0053). It can hold any pair and is
  // refreshed by a provider, so it supersedes the single hand-maintained
  // VND/USD scalar in shop_currency_settings. The 0043 row stays authoritative
  // until 0053 is applied, which keeps older local and test databases usable.
  try {
    const rate = await db.prepare(`SELECT rate_scaled AS rateScaled, rate_scale AS rateScale
      FROM shop_fx_rates WHERE from_currency = 'VND' AND to_currency = 'USD' LIMIT 1`)
      .first<{ rateScaled: number; rateScale: number }>();
    if (rate && rate.rateScale === SHOP_RATE_SCALE && rateScaledToNumber(rate.rateScaled)) {
      const legacy = await readLegacyCurrencySettings(db);
      return legacy
        ? { ...legacy, usdVndRateScaled: rate.rateScaled }
        : { ...fallbackShopPricingSettings(), usdVndRateScaled: rate.rateScaled };
    }
  } catch {
    // Migration 0053 is additive; fall through to 0043.
  }
  const legacy = await readLegacyCurrencySettings(db);
  return legacy ?? fallbackShopPricingSettings();
}

async function readLegacyCurrencySettings(db: D1Database): Promise<ShopPricingSettings | null> {
  try {
    const row = await db.prepare(`SELECT id, base_currency AS baseCurrency, display_currency AS displayCurrency,
        usd_vnd_rate_scaled AS usdVndRateScaled, rate_scale AS rateScale, version,
        updated_by AS updatedBy, updated_at AS updatedAt
      FROM shop_currency_settings WHERE id = 'default' LIMIT 1`).first<{
        id: "default";
        baseCurrency: "VND";
        displayCurrency: "USD";
        usdVndRateScaled: number;
        rateScale: number;
        version: number;
        updatedBy: string;
        updatedAt: string;
      }>();
    if (row && row.rateScale === SHOP_RATE_SCALE && rateScaledToNumber(row.usdVndRateScaled)) return { ...row, rateScale: SHOP_RATE_SCALE };
  } catch {
    // Migration 0043 is additive. Keep older local/test databases usable with
    // the documented default until the migration is applied.
  }
  return null;
}

export async function updateShopPricingSettings(
  db: D1Database,
  input: { usdVndRateScaled: number; expectedVersion?: number },
  actor: ShopActor | string,
  requestId: string,
) {
  if (!Number.isSafeInteger(input.usdVndRateScaled) || input.usdVndRateScaled < 1_000_000 || input.usdVndRateScaled > 100_000_000_000_000) {
    throw new ShopConflictError("currency_rate_invalid");
  }
  const current = await db.prepare("SELECT version FROM shop_currency_settings WHERE id = 'default' LIMIT 1").first<{ version: number }>();
  if (!current) throw new ShopConflictError("currency_pricing_not_migrated");
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) throw new ShopConflictError("currency_rate_conflict");
  const now = nowIso();
  const actorId = typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
  const nextVersion = current.version + 1;
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN EXISTS (
          SELECT 1 FROM shop_currency_settings WHERE id = 'default' AND version = ?
        ) THEN 1 ELSE 0 END`).bind(guard, current.version),
      db.prepare(`UPDATE shop_currency_settings
        SET usd_vnd_rate_scaled = ?, rate_scale = ?, version = ?, updated_by = ?, updated_at = ?
        WHERE id = 'default' AND version = ?`).bind(input.usdVndRateScaled, SHOP_RATE_SCALE, nextVersion, actorId, now, current.version),
      db.prepare(`INSERT INTO shop_currency_rate_history
        (id, settings_id, usd_vnd_rate_scaled, rate_scale, version, changed_by, created_at)
        VALUES (?, 'default', ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), input.usdVndRateScaled, SHOP_RATE_SCALE, nextVersion, actorId, now),
      auditStatement(db, actor, "shop.currency_rate.updated", "shop_currency_settings", "default", requestId, {
        usdVndRateScaled: input.usdVndRateScaled,
        usdVndRate: input.usdVndRateScaled / SHOP_RATE_SCALE,
        version: nextVersion,
      }),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("currency_rate_conflict");
    throw error;
  }
  // Mirror into shop_fx_rates, which getShopPricingSettings now prefers. Best
  // effort: if migration 0053 has not been applied the table does not exist and
  // the 0043 row above remains authoritative, which is exactly the fallback path.
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_fx_rates
        (from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, fetched_at, updated_by, created_at, updated_at)
        VALUES ('VND', 'USD', ?, ?, 'manual', ?, ?, ?, ?, ?)
        ON CONFLICT (from_currency, to_currency) DO UPDATE SET
          rate_scaled = excluded.rate_scaled,
          rate_scale = excluded.rate_scale,
          provider = 'manual',
          as_of = excluded.as_of,
          fetched_at = excluded.fetched_at,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`).bind(input.usdVndRateScaled, SHOP_RATE_SCALE, now, now, actorId, now, now),
      db.prepare(`INSERT INTO shop_fx_rate_history
        (id, from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, changed_by, created_at)
        VALUES (?, 'VND', 'USD', ?, ?, 'manual', ?, ?, ?)`).bind(crypto.randomUUID(), input.usdVndRateScaled, SHOP_RATE_SCALE, now, actorId, now),
    ]);
  } catch (error) {
    // Only a real problem once 0053 exists: the two tables would then disagree.
    console.error(JSON.stringify({
      event: "shop_fx_rate_mirror_failed",
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
  }
  return getShopPricingSettings(db);
}

async function scopedOrderAccessToken(providedAccessToken: string | undefined, tokenSalt: string) {
  if (!providedAccessToken) return null;
  // Rows created before the salt migration keep their original deterministic
  // token. New generations scope that base token so an expired key can be
  // reused without revoking or colliding with the previous order token.
  if (!tokenSalt) return providedAccessToken;
  return sha256Base64Url(`tungjpstore.shop.order-access-scope.v1\u0000${providedAccessToken}\u0000${tokenSalt}`);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function idList(values: string[]) {
  return values.length ? values.map(() => "?").join(", ") : "NULL";
}

export function auditStatement(db: D1Database, actor: ShopActor | string, action: string, entityType: string, entityId: string | null, requestId: string, details: JsonObject = {}) {
  const actorId = typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
  return db.prepare(`INSERT INTO audit_logs
    (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, requestId, JSON.stringify(details), nowIso());
}

// Conditional audit rows keep stale lease operations from leaving a false
// success trail when another worker wins the same allocation first.
function guardedAuditStatement(db: D1Database, actor: ShopActor | string, action: string, entityType: string, entityId: string | null, requestId: string, guard: string, details: JsonObject = {}) {
  const actorId = typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
  return db.prepare(`INSERT INTO audit_logs
    (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, requestId, JSON.stringify(details), nowIso(), guard);
}

function inventoryMovementActor(actor: ShopActor | string) {
  return typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
}

function refreshOrderFulfillmentStatement(db: D1Database, orderId: string, now: string, guard: string) {
  return db.prepare(`UPDATE shop_orders SET
      fulfillment_status = CASE
        WHEN NOT EXISTS (SELECT 1 FROM shop_order_items WHERE order_id = ? AND fulfillment_status NOT IN ('fulfilled', 'cancelled')) THEN 'fulfilled'
        WHEN EXISTS (
          SELECT 1 FROM shop_inventory_allocations a
          JOIN shop_order_items oi ON oi.id = a.order_item_id
          WHERE oi.order_id = ? AND a.status = 'fulfilled'
        ) OR EXISTS (SELECT 1 FROM shop_order_items WHERE order_id = ? AND fulfillment_status = 'fulfilled') THEN 'partial'
        WHEN EXISTS (SELECT 1 FROM shop_order_items WHERE order_id = ? AND fulfillment_status = 'failed') THEN 'failed'
        ELSE 'unfulfilled'
      END,
      status = CASE
        WHEN NOT EXISTS (SELECT 1 FROM shop_order_items WHERE order_id = ? AND fulfillment_status NOT IN ('fulfilled', 'cancelled')) THEN 'fulfilled'
        ELSE status
      END,
      fulfilled_at = CASE
        WHEN NOT EXISTS (SELECT 1 FROM shop_order_items WHERE order_id = ? AND fulfillment_status NOT IN ('fulfilled', 'cancelled')) THEN COALESCE(fulfilled_at, ?)
        ELSE fulfilled_at
      END,
      updated_at = ?
    WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
    .bind(orderId, orderId, orderId, orderId, orderId, orderId, now, now, orderId, guard);
}

function isConflict(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed|FOREIGN KEY constraint failed|CHECK constraint failed/.test(error.message);
}

export class ShopConflictError extends Error {
  readonly code: string;

  constructor(code = "shop_conflict") {
    super("Shop state conflict");
    this.name = "ShopConflictError";
    this.code = code;
  }
}

export class ShopNotFoundError extends Error {
  readonly code = "shop_not_found";

  constructor() {
    super("Shop resource was not found");
    this.name = "ShopNotFoundError";
  }
}

function availability(policy: ShopInventoryPolicy, quantity: number, threshold: number): ShopAvailability {
  if (policy === "unlimited") return "unlimited";
  if (quantity <= 0) return "out_of_stock";
  return quantity <= threshold ? "low_stock" : "in_stock";
}

/** Schema max_per_order upper bound (shop_variants CHECK). */
const MAX_PER_ORDER_HARD_CAP = 1000;

/**
 * Public buy limit: tracked variants may purchase up to current available stock;
 * unlimited variants keep the configured max_per_order (1..1000).
 */
function resolvePublicMaxPerOrder(
  inventoryPolicy: ShopInventoryPolicy,
  configuredMax: number,
  availableQuantity: number | null,
): number {
  const configured = Math.max(1, Math.min(MAX_PER_ORDER_HARD_CAP, Math.floor(configuredMax) || 1));
  if (inventoryPolicy === "unlimited" || availableQuantity == null) return configured;
  if (availableQuantity <= 0) return 1;
  return Math.min(MAX_PER_ORDER_HARD_CAP, availableQuantity);
}

function aggregateAvailability(variants: PublicVariant[]): ShopAvailability {
  if (variants.some((variant) => variant.availability === "unlimited")) return "unlimited";
  if (variants.some((variant) => variant.availability === "in_stock")) return "in_stock";
  if (variants.some((variant) => variant.availability === "low_stock")) return "low_stock";
  return "out_of_stock";
}

/**
 * Overrides the currency and amount a visitor is shown, e.g. from a market's
 * price book. Returning null keeps the legacy behaviour.
 *
 * This is a callback rather than an import of ./price-book on purpose: this file
 * is bundled by smoke-test harnesses that strip imports, so every new module it
 * depends on has to be added to four of them. Callers compose the resolver.
 */
export type PublicPriceResolver = (input: {
  variantId: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
}) => { priceMinor: number; compareAtMinor: number | null; currency: string } | null;

function projectPublicVariant(
  variant: VariantRow,
  locale: ShopLocale,
  pricing: ShopPricingSettings,
  priceResolver: PublicPriceResolver | null = null,
): PublicVariant {
  const quantity = variant.available_quantity < 0 ? 0 : variant.available_quantity;
  const availableQuantity = variant.inventory_policy === "unlimited" ? null : quantity;
  const maxPerOrder = resolvePublicMaxPerOrder(variant.inventory_policy, variant.max_per_order, availableQuantity);
  const catalogCurrency = normalizeCurrency(variant.currency);
  const shouldDisplayUsd = locale !== "vi" && catalogCurrency === SHOP_BASE_CURRENCY;
  const resolved = priceResolver?.({
    variantId: variant.id,
    priceMinor: variant.price_minor,
    compareAtMinor: variant.compare_at_minor,
    currency: catalogCurrency,
  }) ?? null;
  const displayed = resolved
    ?? (shouldDisplayUsd
      ? convertVndPricePair(variant.price_minor, variant.compare_at_minor, pricing.usdVndRateScaled)
      : { priceMinor: variant.price_minor, compareAtMinor: variant.compare_at_minor, currency: catalogCurrency });
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.variant_title ?? variant.fallback_variant_title ?? variant.sku,
    priceMinor: displayed.priceMinor,
    compareAtMinor: displayed.compareAtMinor,
    currency: displayed.currency,
    fulfillmentType: variant.fulfillment_type,
    deliveryMode: variant.delivery_mode,
    availability: availability(variant.inventory_policy, quantity, variant.low_stock_threshold),
    availableQuantity,
    maxPerOrder,
    optionValues: parseJson<Record<string, string>>(variant.option_values_json, {}),
  };
}

function makePublicProduct(product: ProductRow, variants: PublicVariant[], media: MediaRow[], locale: ShopLocale, canonicalCategories = new Map<string, string>()): PublicProduct {
  const fallbackUsed = !product.loc_title && Boolean(product.fallback_title);
  const title = product.loc_title ?? product.fallback_title ?? product.slug;
  const prices = variants.map((variant) => variant.priceMinor);
  const firstCurrency = variants[0]?.currency ?? "VND";
  const metadata = parseJson<{ badges?: unknown; category?: unknown; categorySlug?: unknown }>(product.metadata_json, {});
  const badges = Array.isArray(metadata.badges) ? metadata.badges.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  const metadataCategory = typeof metadata.category === "string" ? metadata.category.trim().slice(0, 80) : "";
  const explicitCategorySlug = typeof metadata.categorySlug === "string"
    ? metadata.categorySlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
    : "";
  const categorySlug = explicitCategorySlug || (metadataCategory ? metadataCategory.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) : "");
  const category = canonicalCategories.get(categorySlug) || metadataCategory;
  return {
    id: product.id,
    slug: product.slug,
    status: "active",
    featured: product.featured === 1,
    productType: product.product_type,
    ...(category ? { category } : {}),
    ...(categorySlug ? { categorySlug } : {}),
    title,
    ...(product.loc_eyebrow ?? product.fallback_eyebrow ? { eyebrow: product.loc_eyebrow ?? product.fallback_eyebrow ?? "" } : {}),
    shortDescription: product.loc_short_description ?? product.fallback_short_description ?? "",
    description: product.loc_description ?? product.fallback_description ?? "",
    locale,
    ...(fallbackUsed ? { fallbackLocale: product.default_locale } : {}),
    badges,
    media: media.map((entry) => ({ id: entry.id, type: entry.media_type, url: entry.asset_url, alt: entry.alt, sortOrder: entry.sort_order })),
    variants,
    minPriceMinor: prices.length ? Math.min(...prices) : 0,
    maxPriceMinor: prices.length ? Math.max(...prices) : 0,
    currency: firstCurrency,
    availability: aggregateAvailability(variants),
    seo: {
      title: product.loc_seo_title ?? product.fallback_seo_title ?? title,
      description: product.loc_seo_description ?? product.fallback_seo_description ?? product.loc_short_description ?? "",
    },
  };
}

async function loadPublicProducts(
  db: D1Database,
  locale: ShopLocale,
  slug?: string,
  featuredOnly = false,
  limit = 24,
  priceResolver: PublicPriceResolver | null = null,
  catalogFilter: ((productId: string) => boolean) | null = null,
) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const pricing = locale !== "vi" ? await getShopPricingSettings(db) : fallbackShopPricingSettings();
  const filters = ["p.status = 'active'", "p.deleted_at IS NULL"];
  const values: unknown[] = [locale];
  if (slug) {
    filters.push("p.slug = ?");
    values.push(slug);
  }
  if (featuredOnly) filters.push("p.featured = 1");
  values.push(boundedLimit);
  const products = await db.prepare(`SELECT p.id, p.slug, p.status, p.product_type, p.featured,
      p.default_locale, p.sort_order, p.metadata_json, p.version,
      l.title AS loc_title, l.eyebrow AS loc_eyebrow, l.short_description AS loc_short_description,
      l.description AS loc_description, l.seo_title AS loc_seo_title, l.seo_description AS loc_seo_description,
      f.title AS fallback_title, f.eyebrow AS fallback_eyebrow, f.short_description AS fallback_short_description,
      f.description AS fallback_description, f.seo_title AS fallback_seo_title, f.seo_description AS fallback_seo_description
    FROM shop_products p
    LEFT JOIN shop_product_localizations l ON l.product_id = p.id AND l.locale = ?
    LEFT JOIN shop_product_localizations f ON f.product_id = p.id AND f.locale = p.default_locale
    WHERE ${filters.join(" AND ")}
    ORDER BY p.featured DESC, p.sort_order ASC, p.updated_at DESC
    LIMIT ?`).bind(...values).all<ProductRow>();
  if (!products.results.length) return [];
  const productIds = products.results.map((product) => product.id);
  const variants = await db.prepare(`SELECT v.id, v.product_id, v.sku, v.fulfillment_type, v.delivery_mode,
      v.inventory_policy, v.price_minor, v.compare_at_minor, v.currency, v.low_stock_threshold, v.max_per_order,
      v.option_values_json, v.version, l.title AS variant_title, f.title AS fallback_variant_title,
      CASE WHEN v.inventory_policy = 'unlimited' THEN -1 ELSE COALESCE((SELECT COUNT(*)
        FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) END AS available_quantity
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    LEFT JOIN shop_variant_localizations l ON l.variant_id = v.id AND l.locale = ?
    LEFT JOIN shop_variant_localizations f ON f.variant_id = v.id AND f.locale = p.default_locale
    WHERE v.product_id IN (${idList(productIds)}) AND v.status = 'active' AND v.deleted_at IS NULL
    ORDER BY v.product_id, v.price_minor, v.updated_at DESC`).bind(locale, ...productIds).all<VariantRow>();
  const media = await db.prepare(`SELECT id, product_id, media_type, asset_url, alt, sort_order
    FROM shop_product_media WHERE product_id IN (${idList(productIds)}) ORDER BY product_id, sort_order, id`).bind(...productIds).all<MediaRow>();
  const byProduct = new Map<string, PublicVariant[]>();
  for (const variant of variants.results) {
    const item = projectPublicVariant(variant, locale, pricing, priceResolver);
    const list = byProduct.get(variant.product_id) ?? [];
    list.push(item);
    byProduct.set(variant.product_id, list);
  }
  const mediaByProduct = new Map<string, MediaRow[]>();
  for (const entry of media.results) mediaByProduct.set(entry.product_id, [...(mediaByProduct.get(entry.product_id) ?? []), entry]);
  const canonicalCategories = new Map<string, string>();
  try {
    // Category migration is additive. Keep legacy metadata readable while a
    // deployment is rolling forward, then prefer canonical localized titles.
    const categories = await db.prepare(`SELECT c.slug, c.default_locale, l.locale, l.title
      FROM shop_categories c
      LEFT JOIN shop_category_localizations l ON l.category_id = c.id
        AND (l.locale = ? OR l.locale = c.default_locale)
      WHERE c.status = 'active' AND c.deleted_at IS NULL
      ORDER BY c.sort_order ASC, c.updated_at DESC`).bind(locale).all<{ slug: string; default_locale: ShopLocale; locale: ShopLocale | null; title: string | null }>();
    for (const category of categories.results) {
      if (!category.title) continue;
      if (!canonicalCategories.has(category.slug) || category.locale === locale) canonicalCategories.set(category.slug, category.title);
    }
  } catch {
    // Older environments continue using validated product metadata until
    // 0017_shop_categories.sql is applied.
  }
  return products.results
    // Catalogue visibility is per market, so it is applied after the query.
    // Filtering in SQL would need the market bound into every call site.
    .filter((product) => (catalogFilter ? catalogFilter(product.id) : true))
    .map((product) => makePublicProduct(product, byProduct.get(product.id) ?? [], mediaByProduct.get(product.id) ?? [], locale, canonicalCategories))
    .filter((product) => product.variants.length > 0);
}

export async function listPublicProducts(db: D1Database, input: {
  locale: ShopLocale;
  featuredOnly?: boolean;
  limit?: number;
  priceResolver?: PublicPriceResolver | null;
  catalogFilter?: ((productId: string) => boolean) | null;
}) {
  return loadPublicProducts(
    db,
    input.locale,
    undefined,
    input.featuredOnly ?? false,
    input.limit ?? 24,
    input.priceResolver ?? null,
    input.catalogFilter ?? null,
  );
}

export type PublicProductSummary = {
  id: string;
  slug: string;
  featured: boolean;
  title: string;
  category?: string;
  categorySlug?: string;
  variantCount: number;
  minPriceMinor: number;
  maxPriceMinor: number;
  currency: string;
  availability: ShopAvailability;
  soldQuantity30d: number;
};

/** One-query catalog projection for menus that do not need media or variant detail. */
export async function listPublicProductSummaries(
  db: D1Database,
  input: { locale: ShopLocale; limit?: number },
): Promise<PublicProductSummary[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 24)));
  const pricing = input.locale !== "vi" ? await getShopPricingSettings(db) : fallbackShopPricingSettings();
  const rows = await db.prepare(`WITH recent_sales AS (
      SELECT oi.product_id, SUM(oi.quantity) AS sold_quantity
      FROM shop_order_items oi
      JOIN shop_orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid'
        AND o.paid_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
        AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
    )
    SELECT p.id, p.slug, p.featured, p.metadata_json,
      COALESCE(l.title, f.title, p.slug) AS title,
      COUNT(v.id) AS variant_count,
      MIN(v.price_minor) AS min_price_minor,
      MAX(v.price_minor) AS max_price_minor,
      COALESCE((SELECT v2.currency FROM shop_variants v2
        WHERE v2.product_id = p.id AND v2.status = 'active' AND v2.deleted_at IS NULL
        ORDER BY v2.price_minor, v2.updated_at DESC LIMIT 1), 'VND') AS currency,
      MAX(CASE
        WHEN v.inventory_policy = 'unlimited' THEN 3
        WHEN COALESCE((SELECT COUNT(*) FROM shop_inventory_units iu
          WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) <= 0 THEN 0
        WHEN COALESCE((SELECT COUNT(*) FROM shop_inventory_units iu
          WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) <= v.low_stock_threshold THEN 1
        ELSE 2
      END) AS availability_rank,
      COALESCE(s.sold_quantity, 0) AS sold_quantity_30d
    FROM shop_products p
    JOIN shop_variants v ON v.product_id = p.id AND v.status = 'active' AND v.deleted_at IS NULL
    LEFT JOIN recent_sales s ON s.product_id = p.id
    LEFT JOIN shop_product_localizations l ON l.product_id = p.id AND l.locale = ?
    LEFT JOIN shop_product_localizations f ON f.product_id = p.id AND f.locale = p.default_locale
    WHERE p.status = 'active' AND p.deleted_at IS NULL
    GROUP BY p.id, p.slug, p.featured, p.metadata_json, l.title, f.title, p.sort_order, p.updated_at, s.sold_quantity
    ORDER BY p.featured DESC, p.sort_order ASC, p.updated_at DESC
    LIMIT ?`).bind(input.locale, boundedLimit).all<{
      id: string;
      slug: string;
      featured: number;
      metadata_json: string;
      title: string;
      variant_count: number;
      min_price_minor: number;
      max_price_minor: number;
      currency: string;
      availability_rank: number;
      sold_quantity_30d: number;
    }>();
  return rows.results.map((row) => {
    const metadata = parseJson<{ category?: unknown; categorySlug?: unknown }>(row.metadata_json, {});
    const category = typeof metadata.category === "string" ? metadata.category.trim().slice(0, 80) : "";
    const explicitCategorySlug = typeof metadata.categorySlug === "string"
      ? metadata.categorySlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
      : "";
    const categorySlug = explicitCategorySlug || (category
      ? category.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
      : "");
    const availabilityState: ShopAvailability = row.availability_rank >= 3
      ? "unlimited"
      : row.availability_rank >= 2
        ? "in_stock"
        : row.availability_rank >= 1
          ? "low_stock"
          : "out_of_stock";
    const shouldDisplayUsd = input.locale !== "vi" && normalizeCurrency(row.currency) === SHOP_BASE_CURRENCY;
    const displayed = shouldDisplayUsd
      ? convertVndPricePair(row.min_price_minor, row.max_price_minor, pricing.usdVndRateScaled)
      : { priceMinor: row.min_price_minor, compareAtMinor: row.max_price_minor, currency: normalizeCurrency(row.currency) };
    return {
      id: row.id,
      slug: row.slug,
      featured: row.featured === 1,
      title: row.title,
      ...(category ? { category } : {}),
      ...(categorySlug ? { categorySlug } : {}),
      variantCount: Number(row.variant_count),
      minPriceMinor: displayed.priceMinor,
      maxPriceMinor: displayed.compareAtMinor ?? displayed.priceMinor,
      currency: displayed.currency,
      availability: availabilityState,
      soldQuantity30d: Math.max(0, Number(row.sold_quantity_30d) || 0),
    };
  });
}

export async function getPublicProductBySlug(
  db: D1Database,
  slug: string,
  locale: ShopLocale,
  priceResolver: PublicPriceResolver | null = null,
  catalogFilter: ((productId: string) => boolean) | null = null,
) {
  const products = await loadPublicProducts(db, locale, slug, false, 1, priceResolver, catalogFilter);
  return products[0] ?? null;
}

/**
 * Product detail lookup for latency-sensitive consumers such as Telegram.
 * D1 batch keeps the product and variant reads in one database round trip;
 * media is intentionally omitted because it is not needed to complete a sale.
 */
export async function getPublicProductById(db: D1Database, productId: string, locale: ShopLocale) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(productId)) return null;
  // Non-Vietnamese callers get the USD projection using dynamic shop pricing settings.
  const pricing = locale !== "vi" ? await getShopPricingSettings(db) : fallbackShopPricingSettings();
  const [products, variants] = await db.batch([
    db.prepare(`SELECT p.id, p.slug, p.status, p.product_type, p.featured,
        p.default_locale, p.sort_order, p.metadata_json, p.version,
        l.title AS loc_title, l.eyebrow AS loc_eyebrow, l.short_description AS loc_short_description,
        l.description AS loc_description, l.seo_title AS loc_seo_title, l.seo_description AS loc_seo_description,
        f.title AS fallback_title, f.eyebrow AS fallback_eyebrow, f.short_description AS fallback_short_description,
        f.description AS fallback_description, f.seo_title AS fallback_seo_title, f.seo_description AS fallback_seo_description
      FROM shop_products p
      LEFT JOIN shop_product_localizations l ON l.product_id = p.id AND l.locale = ?
      LEFT JOIN shop_product_localizations f ON f.product_id = p.id AND f.locale = p.default_locale
      WHERE p.id = ? AND p.status = 'active' AND p.deleted_at IS NULL LIMIT 1`).bind(locale, productId),
    db.prepare(`SELECT v.id, v.product_id, v.sku, v.fulfillment_type, v.delivery_mode,
        v.inventory_policy, v.price_minor, v.compare_at_minor, v.currency, v.low_stock_threshold, v.max_per_order,
        v.option_values_json, v.version, l.title AS variant_title, f.title AS fallback_variant_title,
        CASE WHEN v.inventory_policy = 'unlimited' THEN -1 ELSE COALESCE((SELECT COUNT(*)
          FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) END AS available_quantity
      FROM shop_variants v
      JOIN shop_products p ON p.id = v.product_id AND p.status = 'active' AND p.deleted_at IS NULL
      LEFT JOIN shop_variant_localizations l ON l.variant_id = v.id AND l.locale = ?
      LEFT JOIN shop_variant_localizations f ON f.variant_id = v.id AND f.locale = p.default_locale
      WHERE v.product_id = ? AND v.status = 'active' AND v.deleted_at IS NULL
      ORDER BY v.price_minor, v.updated_at DESC`).bind(locale, productId),
  ]) as [D1Result<ProductRow>, D1Result<VariantRow>];
  const product = products.results[0];
  if (!product || !variants.results.length) return null;
  const publicVariants = variants.results.map((variant) => projectPublicVariant(variant, locale, pricing));
  return makePublicProduct(product, publicVariants, [], locale);
}

export type PublicVariantContext = {
  productId: string;
  productTitle: string;
  variant: PublicVariant;
};

/** Single-query variant lookup used by quantity selectors. */
export async function getPublicVariantContext(db: D1Database, variantId: string, locale: ShopLocale): Promise<PublicVariantContext | null> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(variantId)) return null;
  const pricing = locale !== "vi" ? await getShopPricingSettings(db) : fallbackShopPricingSettings();
  const row = await db.prepare(`SELECT v.id, v.sku, v.fulfillment_type, v.delivery_mode, v.inventory_policy,
      v.price_minor, v.compare_at_minor, v.currency, v.low_stock_threshold, v.max_per_order, v.option_values_json,
      vl.title AS variant_title, vf.title AS fallback_variant_title,
      p.id AS product_id, pl.title AS product_title, pf.title AS fallback_product_title,
      CASE WHEN v.inventory_policy = 'unlimited' THEN -1 ELSE COALESCE((SELECT COUNT(*)
        FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) END AS available_quantity
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    LEFT JOIN shop_variant_localizations vl ON vl.variant_id = v.id AND vl.locale = ?
    LEFT JOIN shop_variant_localizations vf ON vf.variant_id = v.id AND vf.locale = p.default_locale
    LEFT JOIN shop_product_localizations pl ON pl.product_id = p.id AND pl.locale = ?
    LEFT JOIN shop_product_localizations pf ON pf.product_id = p.id AND pf.locale = p.default_locale
    WHERE v.id = ? AND v.status = 'active' AND v.deleted_at IS NULL
      AND p.status = 'active' AND p.deleted_at IS NULL LIMIT 1`).bind(locale, locale, variantId).first<{
        id: string;
        sku: string;
        fulfillment_type: ShopFulfillmentType;
        delivery_mode: "automatic" | "manual";
        inventory_policy: ShopInventoryPolicy;
        price_minor: number;
        compare_at_minor: number | null;
        currency: string;
        low_stock_threshold: number;
        max_per_order: number;
        option_values_json: string;
        variant_title: string | null;
        fallback_variant_title: string | null;
        product_id: string;
        product_title: string | null;
        fallback_product_title: string | null;
        available_quantity: number;
      }>();
  if (!row) return null;
  const quantity = row.available_quantity < 0 ? 0 : row.available_quantity;
  const availableQuantity = row.inventory_policy === "unlimited" ? null : quantity;
  const maxPerOrder = resolvePublicMaxPerOrder(row.inventory_policy, row.max_per_order, availableQuantity);
  const shouldDisplayUsd = locale !== "vi" && normalizeCurrency(row.currency) === SHOP_BASE_CURRENCY;
  const displayed = shouldDisplayUsd
    ? convertVndPricePair(row.price_minor, row.compare_at_minor, pricing.usdVndRateScaled)
    : { priceMinor: row.price_minor, compareAtMinor: row.compare_at_minor, currency: normalizeCurrency(row.currency) };
  return {
    productId: row.product_id,
    productTitle: row.product_title ?? row.fallback_product_title ?? row.product_id,
    variant: {
      id: row.id,
      sku: row.sku,
      title: row.variant_title ?? row.fallback_variant_title ?? row.sku,
      priceMinor: displayed.priceMinor,
      compareAtMinor: displayed.compareAtMinor,
      currency: displayed.currency,
      fulfillmentType: row.fulfillment_type,
      deliveryMode: row.delivery_mode,
      availability: availability(row.inventory_policy, quantity, row.low_stock_threshold),
      availableQuantity,
      maxPerOrder,
      optionValues: parseJson<Record<string, string>>(row.option_values_json, {}),
    },
  };
}

export type PublicVariantLabel = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  optionValues: Record<string, string>;
};

/** One bounded query for the labels shown in a Telegram cart. */
export async function getPublicVariantLabels(db: D1Database, variantIds: string[], locale: ShopLocale): Promise<PublicVariantLabel[]> {
  const unique = [...new Set(variantIds.filter((id) => /^[A-Za-z0-9_-]{8,80}$/.test(id)))].slice(0, 8);
  if (!unique.length) return [];
  const rows = await db.prepare(`SELECT v.id, v.sku, v.option_values_json,
      vl.title AS variant_title, vf.title AS fallback_variant_title,
      pl.title AS product_title, pf.title AS fallback_product_title, p.slug
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    LEFT JOIN shop_variant_localizations vl ON vl.variant_id = v.id AND vl.locale = ?
    LEFT JOIN shop_variant_localizations vf ON vf.variant_id = v.id AND vf.locale = p.default_locale
    LEFT JOIN shop_product_localizations pl ON pl.product_id = p.id AND pl.locale = ?
    LEFT JOIN shop_product_localizations pf ON pf.product_id = p.id AND pf.locale = p.default_locale
    WHERE v.id IN (${idList(unique)}) AND v.status = 'active' AND v.deleted_at IS NULL
      AND p.status = 'active' AND p.deleted_at IS NULL`).bind(locale, locale, ...unique).all<{
        id: string;
        sku: string;
        option_values_json: string;
        variant_title: string | null;
        fallback_variant_title: string | null;
        product_title: string | null;
        fallback_product_title: string | null;
        slug: string;
      }>();
  return rows.results.map((row) => ({
    variantId: row.id,
    productTitle: row.product_title ?? row.fallback_product_title ?? row.slug,
    variantTitle: row.variant_title ?? row.fallback_variant_title ?? row.sku,
    optionValues: parseJson<Record<string, string>>(row.option_values_json, {}),
  }));
}

type ShopCategoryRow = {
  id: string;
  slug: string;
  status: ShopCategory["status"];
  sort_order: number;
  default_locale: ShopLocale;
  version: number;
  usage_count: number;
};

export async function listShopCategories(db: D1Database): Promise<ShopCategory[]> {
  const categories = await db.prepare(`SELECT c.id, c.slug, c.status, c.sort_order, c.default_locale, c.version,
      COUNT(p.id) AS usage_count
    FROM shop_categories c
    LEFT JOIN shop_products p ON p.deleted_at IS NULL
      AND json_extract(p.metadata_json, '$.categorySlug') = c.slug
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.slug, c.status, c.sort_order, c.default_locale, c.version
    ORDER BY c.status = 'active' DESC, c.sort_order ASC, c.updated_at DESC`).all<ShopCategoryRow>();
  if (!categories.results.length) return [];
  const categoryIds = categories.results.map((category) => category.id);
  const localizations = await db.prepare(`SELECT category_id, locale, title, description
    FROM shop_category_localizations WHERE category_id IN (${idList(categoryIds)})
    ORDER BY category_id, locale`).bind(...categoryIds).all<{ category_id: string; locale: ShopLocale; title: string; description: string }>();
  const localizationMap = new Map<string, ShopCategory["localizations"]>();
  for (const row of localizations.results) {
    localizationMap.set(row.category_id, {
      ...(localizationMap.get(row.category_id) ?? {}),
      [row.locale]: { title: row.title, ...(row.description ? { description: row.description } : {}) },
    });
  }
  return categories.results.map((category) => ({
    id: category.id,
    slug: category.slug,
    status: category.status,
    sortOrder: category.sort_order,
    defaultLocale: category.default_locale,
    version: category.version,
    usageCount: Number(category.usage_count || 0),
    localizations: localizationMap.get(category.id) ?? {},
  }));
}

async function getShopCategory(db: D1Database, id: string) {
  return (await listShopCategories(db)).find((category) => category.id === id) ?? null;
}

function categoryLocalizationStatements(db: D1Database, categoryId: string, input: ShopCategoryInput) {
  return Object.entries(input.localizations).flatMap(([locale, localization]) => localization
    ? [db.prepare(`INSERT INTO shop_category_localizations (category_id, locale, title, description)
        VALUES (?, ?, ?, ?)`).bind(categoryId, locale, localization.title, localization.description ?? "")]
    : []);
}

export async function createShopCategory(db: D1Database, input: ShopCategoryInput, actor: ShopActor | string, requestId: string) {
  const now = nowIso();
  const categoryId = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_categories
        (id, slug, status, sort_order, default_locale, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).bind(categoryId, input.slug, input.status, input.sortOrder ?? 0, input.defaultLocale ?? "vi", typeof actor === "string" ? actor : actor.id, typeof actor === "string" ? actor : actor.id, now, now),
      ...categoryLocalizationStatements(db, categoryId, input),
      auditStatement(db, actor, "shop.category.created", "shop_category", categoryId, requestId, { slug: input.slug }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("category_create_conflict");
    throw error;
  }
  return getShopCategory(db, categoryId);
}

export async function updateShopCategory(db: D1Database, id: string, input: ShopCategoryInput, expectedVersion: number, actor: ShopActor | string, requestId: string) {
  const existing = await getShopCategory(db, id);
  if (!existing) throw new ShopNotFoundError();
  if (existing.slug !== input.slug && existing.usageCount > 0) throw new ShopConflictError("category_slug_in_use");
  if (input.status === "archived" && existing.usageCount > 0) throw new ShopConflictError("category_in_use");
  const requiresUnusedCategory = existing.slug !== input.slug || input.status === "archived";
  const now = nowIso();
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN
          EXISTS (SELECT 1 FROM shop_categories WHERE id = ? AND version = ? AND deleted_at IS NULL)
          AND (? = 0 OR NOT EXISTS (
            SELECT 1 FROM shop_products p
            WHERE p.deleted_at IS NULL
              AND json_extract(p.metadata_json, '$.categorySlug') = (SELECT slug FROM shop_categories WHERE id = ?)
          ))
        THEN 1 ELSE 0 END`)
        .bind(guard, id, expectedVersion, requiresUnusedCategory ? 1 : 0, id),
      db.prepare(`UPDATE shop_categories SET slug = ?, status = ?, sort_order = ?, default_locale = ?,
        version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .bind(input.slug, input.status, input.sortOrder ?? 0, input.defaultLocale ?? "vi", typeof actor === "string" ? actor : actor.id, now, id, expectedVersion),
      db.prepare("DELETE FROM shop_category_localizations WHERE category_id = ?").bind(id),
      ...categoryLocalizationStatements(db, id, input),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      auditStatement(db, actor, "shop.category.updated", "shop_category", id, requestId, { slug: input.slug, version: expectedVersion + 1 }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("category_update_conflict");
    throw error;
  }
  return getShopCategory(db, id);
}

export async function archiveShopCategory(db: D1Database, id: string, expectedVersion: number, actor: ShopActor | string, requestId: string) {
  const existing = await getShopCategory(db, id);
  if (!existing) throw new ShopNotFoundError();
  if (existing.usageCount > 0) throw new ShopConflictError("category_in_use");
  const now = nowIso();
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN
          EXISTS (SELECT 1 FROM shop_categories WHERE id = ? AND version = ? AND deleted_at IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM shop_products p
            WHERE p.deleted_at IS NULL
              AND json_extract(p.metadata_json, '$.categorySlug') = (SELECT slug FROM shop_categories WHERE id = ?)
          )
        THEN 1 ELSE 0 END`)
        .bind(guard, id, expectedVersion, id),
      db.prepare(`UPDATE shop_categories SET status = 'archived', version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`).bind(typeof actor === "string" ? actor : actor.id, now, id, expectedVersion),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      auditStatement(db, actor, "shop.category.archived", "shop_category", id, requestId, { slug: existing.slug }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("category_archive_conflict");
    throw error;
  }
  return getShopCategory(db, id);
}

export type ShopProductDetail = {
  id: string;
  slug: string;
  status: "draft" | "active" | "archived";
  productType: ProductUpsertInput["productType"];
  featured: boolean;
  sortOrder: number;
  defaultLocale: ShopLocale;
  coverMediaId: string | null;
  metadata: JsonObject;
  version: number;
  localizations: ProductUpsertInput["localizations"];
  variants: ProductUpsertInput["variants"];
  media: ProductUpsertInput["media"];
};

export async function getShopProduct(db: D1Database, id: string): Promise<ShopProductDetail | null> {
  const product = await db.prepare(`SELECT id, slug, status, product_type, featured, sort_order, default_locale,
      cover_media_id, metadata_json, version FROM shop_products WHERE id = ? LIMIT 1`).bind(id).first<{
    id: string; slug: string; status: ShopProductDetail["status"]; product_type: ShopProductDetail["productType"]; featured: number; sort_order: number; default_locale: ShopLocale; cover_media_id: string | null; metadata_json: string; version: number;
  }>();
  if (!product) return null;
  const [localizations, variants, media] = await Promise.all([
    db.prepare("SELECT locale, title, eyebrow, short_description, description, seo_title, seo_description FROM shop_product_localizations WHERE product_id = ?").bind(id).all<{ locale: ShopLocale; title: string; eyebrow: string; short_description: string; description: string; seo_title: string; seo_description: string }>(),
    db.prepare("SELECT id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order, option_values_json, metadata_json FROM shop_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY price_minor, id").bind(id).all<{ id: string; sku: string; status: "draft" | "active" | "archived"; fulfillment_type: ShopFulfillmentType; delivery_mode: "automatic" | "manual"; inventory_policy: ShopInventoryPolicy; price_minor: number; compare_at_minor: number | null; currency: string; low_stock_threshold: number; max_per_order: number; option_values_json: string; metadata_json: string }>(),
    db.prepare("SELECT id, variant_id, media_id, media_type, asset_url, alt, sort_order FROM shop_product_media WHERE product_id = ? ORDER BY sort_order, id").bind(id).all<{ id: string; variant_id: string | null; media_id: string | null; media_type: "image" | "video"; asset_url: string; alt: string; sort_order: number }>(),
  ]);
  const variantIds = variants.results.map((variant) => variant.id);
  const variantLocs = variantIds.length ? await db.prepare(`SELECT variant_id, locale, title, option_summary FROM shop_variant_localizations WHERE variant_id IN (${idList(variantIds)})`).bind(...variantIds).all<{ variant_id: string; locale: ShopLocale; title: string; option_summary: string }>() : { results: [] } as { results: Array<{ variant_id: string; locale: ShopLocale; title: string; option_summary: string }> };
  const variantLocMap = new Map<string, ProductUpsertInput["variants"][number]["localizations"]>();
  for (const row of variantLocs.results) variantLocMap.set(row.variant_id, { ...(variantLocMap.get(row.variant_id) ?? {}), [row.locale]: { title: row.title, optionSummary: row.option_summary } });
  return {
    id: product.id, slug: product.slug, status: product.status, productType: product.product_type, featured: product.featured === 1,
    sortOrder: product.sort_order, defaultLocale: product.default_locale, coverMediaId: product.cover_media_id,
    metadata: parseJson<JsonObject>(product.metadata_json, {}), version: product.version,
    localizations: Object.fromEntries(localizations.results.map((row) => [row.locale, { title: row.title, eyebrow: row.eyebrow, shortDescription: row.short_description, description: row.description, seoTitle: row.seo_title, seoDescription: row.seo_description }])) as ProductUpsertInput["localizations"],
    variants: variants.results.map((row) => ({ id: row.id, sku: row.sku, status: row.status, fulfillmentType: row.fulfillment_type, deliveryMode: row.delivery_mode, inventoryPolicy: row.inventory_policy, priceMinor: row.price_minor, compareAtMinor: row.compare_at_minor, currency: row.currency, lowStockThreshold: row.low_stock_threshold, maxPerOrder: row.max_per_order, optionValues: parseJson<Record<string, string>>(row.option_values_json, {}), metadata: parseJson<JsonObject>(row.metadata_json, {}), localizations: variantLocMap.get(row.id) ?? {} })),
    media: media.results.map((row) => ({ id: row.id, variantId: row.variant_id, mediaId: row.media_id, type: row.media_type, url: row.asset_url, alt: row.alt, sortOrder: row.sort_order })),
  } satisfies ShopProductDetail;
}

function productStatements(db: D1Database, productId: string, input: ProductUpsertInput, now: string, variantIds: Map<number, string>, includeVariants = true) {
  const statements: D1PreparedStatement[] = [];
  for (const [locale, localization] of Object.entries(input.localizations)) {
    if (!localization) continue;
    statements.push(db.prepare(`INSERT INTO shop_product_localizations
      (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(productId, locale, localization.title, localization.eyebrow ?? "", localization.shortDescription, localization.description, localization.seoTitle, localization.seoDescription));
  }
  if (includeVariants) input.variants.forEach((variant, index) => {
    const variantId = variantIds.get(index) as string;
    statements.push(db.prepare(`INSERT INTO shop_variants
      (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
       low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(variantId, productId, variant.sku, variant.status, variant.fulfillmentType, variant.deliveryMode, variant.inventoryPolicy, variant.priceMinor, variant.compareAtMinor ?? null, variant.currency, variant.lowStockThreshold ?? 3, variant.maxPerOrder ?? 10, JSON.stringify(variant.optionValues ?? {}), JSON.stringify(variant.metadata ?? {}), now, now));
    for (const [locale, localization] of Object.entries(variant.localizations)) {
      if (!localization) continue;
      statements.push(db.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES (?, ?, ?, ?)`).bind(variantId, locale, localization.title, localization.optionSummary ?? ""));
    }
  });
  for (const media of input.media ?? []) {
    const mappedVariantId = media.variantId ? media.variantId : null;
    statements.push(db.prepare(`INSERT INTO shop_product_media
      (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(media.id ?? crypto.randomUUID(), productId, mappedVariantId, media.mediaId ?? null, media.type, media.url, media.alt, media.sortOrder ?? 0, now));
  }
  return statements;
}

async function assertCanonicalProductCategory(db: D1Database, input: ProductUpsertInput) {
  const rawSlug = input.metadata?.categorySlug;
  if (rawSlug === undefined || rawSlug === null || rawSlug === "") return;
  if (typeof rawSlug !== "string") throw new ShopConflictError("category_not_found");
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new ShopConflictError("category_not_found");
  const category = await db.prepare(`SELECT id FROM shop_categories
    WHERE slug = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`).bind(slug).first<{ id: string }>();
  if (!category) throw new ShopConflictError("category_not_found");
}

function canonicalProductCategorySlug(input: ProductUpsertInput) {
  const rawSlug = input.metadata?.categorySlug;
  if (typeof rawSlug !== "string") return null;
  const slug = rawSlug.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ? slug : null;
}

export async function createShopProduct(db: D1Database, input: ProductUpsertInput, actor: ShopActor | string, requestId: string) {
  await assertCanonicalProductCategory(db, input);
  const now = nowIso();
  const productId = crypto.randomUUID();
  const categorySlug = canonicalProductCategorySlug(input);
  const categoryGuard = categorySlug ? crypto.randomUUID() : null;
  const variantIds = new Map(input.variants.map((variant, index) => [index, variant.id ?? crypto.randomUUID()]));
  const statements: D1PreparedStatement[] = [
    ...(categoryGuard && categorySlug ? [db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_categories WHERE slug = ? AND status = 'active' AND deleted_at IS NULL
      ) THEN 1 ELSE 0 END`).bind(categoryGuard, categorySlug)] : []),
    db.prepare(`INSERT INTO shop_products
      (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id, metadata_json, version,
       published_at, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`).bind(productId, input.slug, input.status, input.productType, input.featured ? 1 : 0, input.sortOrder ?? 0, input.defaultLocale ?? "vi", input.coverMediaId ?? null, JSON.stringify(input.metadata ?? {}), input.status === "active" ? now : null, typeof actor === "string" ? actor : actor.id, typeof actor === "string" ? actor : actor.id, now, now),
    ...productStatements(db, productId, input, now, variantIds),
    ...(categoryGuard ? [db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(categoryGuard)] : []),
    auditStatement(db, actor, "shop.product.created", "shop_product", productId, requestId, { variantCount: input.variants.length }),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("product_create_conflict");
    throw error;
  }
  return getShopProduct(db, productId);
}

export async function updateShopProduct(db: D1Database, id: string, input: ProductUpsertInput, expectedVersion: number, actor: ShopActor | string, requestId: string) {
  const existing = await getShopProduct(db, id);
  if (!existing) throw new ShopNotFoundError();
  await assertCanonicalProductCategory(db, input);
  const now = nowIso();
  const categorySlug = canonicalProductCategorySlug(input);
  const variantIds = new Map(input.variants.map((variant, index) => [index, variant.id ?? crypto.randomUUID()]));
  const retainedVariantIds = [...variantIds.values()];
  const foreignVariant = await db.prepare(`SELECT id FROM shop_variants
    WHERE id IN (${idList(retainedVariantIds)}) AND product_id <> ? LIMIT 1`)
    .bind(...retainedVariantIds, id).first<{ id: string }>();
  if (foreignVariant) throw new ShopConflictError("variant_product_mismatch");
  const omittedVariantPredicate = retainedVariantIds.length
    ? `v.id NOT IN (${idList(retainedVariantIds)})`
    : "1 = 1";
  const unsafeOmittedVariant = await db.prepare(`SELECT v.id FROM shop_variants v
    WHERE v.product_id = ? AND v.deleted_at IS NULL AND ${omittedVariantPredicate}
      AND (
        EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status IN ('available', 'reserved'))
        OR EXISTS (SELECT 1 FROM shop_inventory_reservations r WHERE r.variant_id = v.id AND r.status IN ('active', 'converted'))
      )
    LIMIT 1`).bind(id, ...retainedVariantIds).first<{ id: string }>();
  if (unsafeOmittedVariant) throw new ShopConflictError("variant_archive_inventory_conflict");
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN
        EXISTS (SELECT 1 FROM shop_products WHERE id = ? AND version = ? AND deleted_at IS NULL)
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM shop_categories WHERE slug = ? AND status = 'active' AND deleted_at IS NULL
        ))
        AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE id IN (${idList(retainedVariantIds)}) AND product_id <> ?)
        AND NOT EXISTS (
          SELECT 1 FROM shop_variants v
          WHERE v.product_id = ? AND v.deleted_at IS NULL AND ${omittedVariantPredicate}
            AND (
              EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status IN ('available', 'reserved'))
              OR EXISTS (SELECT 1 FROM shop_inventory_reservations r WHERE r.variant_id = v.id AND r.status IN ('active', 'converted'))
            )
        )
      THEN 1 ELSE 0 END`)
      .bind(guard, id, expectedVersion, categorySlug, categorySlug, ...retainedVariantIds, id, id, ...retainedVariantIds),
    db.prepare(`UPDATE shop_products SET slug = ?, status = ?, product_type = ?, featured = ?, sort_order = ?, default_locale = ?, cover_media_id = ?, metadata_json = ?, version = version + 1, published_at = ?, updated_by = ?, updated_at = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`)
      .bind(input.slug, input.status, input.productType, input.featured ? 1 : 0, input.sortOrder ?? 0, input.defaultLocale ?? "vi", input.coverMediaId ?? null, JSON.stringify(input.metadata ?? {}), input.status === "active" ? now : null, typeof actor === "string" ? actor : actor.id, now, id, expectedVersion),
    db.prepare("DELETE FROM shop_product_localizations WHERE product_id = ?").bind(id),
    db.prepare("DELETE FROM shop_product_media WHERE product_id = ?").bind(id),
  ];
  if (retainedVariantIds.length) {
    statements.push(db.prepare(`UPDATE shop_variants SET status = 'archived', deleted_at = ?, version = version + 1, updated_at = ? WHERE product_id = ? AND id NOT IN (${idList(retainedVariantIds)}) AND deleted_at IS NULL`).bind(now, now, id, ...retainedVariantIds));
  } else {
    statements.push(db.prepare("UPDATE shop_variants SET status = 'archived', deleted_at = ?, version = version + 1, updated_at = ? WHERE product_id = ? AND deleted_at IS NULL").bind(now, now, id));
  }
  for (const [index, variant] of input.variants.entries()) {
    const variantId = variantIds.get(index) as string;
    statements.push(db.prepare(`INSERT INTO shop_variants
      (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
       low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET sku = excluded.sku, status = excluded.status, deleted_at = NULL,
        fulfillment_type = excluded.fulfillment_type, delivery_mode = excluded.delivery_mode, inventory_policy = excluded.inventory_policy,
        price_minor = excluded.price_minor, compare_at_minor = excluded.compare_at_minor, currency = excluded.currency,
        low_stock_threshold = excluded.low_stock_threshold, max_per_order = excluded.max_per_order,
        option_values_json = excluded.option_values_json, metadata_json = excluded.metadata_json,
        version = shop_variants.version + 1, updated_at = excluded.updated_at
      WHERE shop_variants.product_id = excluded.product_id`).bind(variantId, id, variant.sku, variant.status, variant.fulfillmentType, variant.deliveryMode, variant.inventoryPolicy, variant.priceMinor, variant.compareAtMinor ?? null, variant.currency, variant.lowStockThreshold ?? 3, variant.maxPerOrder ?? 10, JSON.stringify(variant.optionValues ?? {}), JSON.stringify(variant.metadata ?? {}), now, now));
    statements.push(db.prepare(`DELETE FROM shop_variant_localizations WHERE variant_id = ?
      AND EXISTS (SELECT 1 FROM shop_variants WHERE id = ? AND product_id = ?)`)
      .bind(variantId, variantId, id));
    for (const [locale, localization] of Object.entries(variant.localizations)) if (localization) statements.push(db.prepare("INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES (?, ?, ?, ?)").bind(variantId, locale, localization.title, localization.optionSummary ?? ""));
  }
  statements.push(...productStatements(db, id, input, now, variantIds, false), db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard), auditStatement(db, actor, "shop.product.updated", "shop_product", id, requestId, { version: expectedVersion + 1 }));
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("product_update_conflict");
    throw error;
  }
  return getShopProduct(db, id);
}

export async function archiveShopProduct(db: D1Database, id: string, expectedVersion: number, actor: ShopActor | string, requestId: string) {
  // Archiving is a soft delete, but it must not strand sellable or reserved
  // inventory. Fulfill/release it first so keys remain reachable and auditable.
  const liveInventory = await db.prepare(`SELECT 1 AS present
    FROM shop_variants v
    WHERE v.product_id = ? AND v.deleted_at IS NULL
      AND (
        EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status IN ('available', 'reserved'))
        OR EXISTS (SELECT 1 FROM shop_inventory_reservations r WHERE r.variant_id = v.id AND r.status IN ('active', 'converted'))
      )
    LIMIT 1`).bind(id).first<{ present: number }>();
  if (liveInventory) throw new ShopConflictError("variant_archive_inventory_conflict");
  const now = nowIso();
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN
          EXISTS (SELECT 1 FROM shop_products WHERE id = ? AND version = ? AND deleted_at IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM shop_variants v
            WHERE v.product_id = ? AND v.deleted_at IS NULL
              AND (
                EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status IN ('available', 'reserved'))
                OR EXISTS (SELECT 1 FROM shop_inventory_reservations r WHERE r.variant_id = v.id AND r.status IN ('active', 'converted'))
              )
          )
        THEN 1 ELSE 0 END`).bind(guard, id, expectedVersion, id),
      db.prepare("UPDATE shop_products SET status = 'archived', deleted_at = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ? AND deleted_at IS NULL").bind(now, typeof actor === "string" ? actor : actor.id, now, id, expectedVersion),
      db.prepare("UPDATE shop_variants SET status = 'archived', deleted_at = ?, version = version + 1, updated_at = ? WHERE product_id = ? AND deleted_at IS NULL").bind(now, now, id),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      auditStatement(db, actor, "shop.product.archived", "shop_product", id, requestId),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("product_archive_conflict");
    throw error;
  }
  return getShopProduct(db, id);
}

/**
 * Fast-path activation for drafts that already satisfy the storefront
 * contract. The SQL guard re-checks the localization invariants the editor
 * enforces, so a stale or incomplete product can never go live.
 */
export async function activateShopProduct(db: D1Database, id: string, expectedVersion: number, actor: ShopActor | string, requestId: string) {
  const productLocales = await db.prepare(
    "SELECT COUNT(DISTINCT locale) AS count FROM shop_product_localizations WHERE product_id = ?",
  ).bind(id).first<{ count: number }>();
  if (Number(productLocales?.count ?? 0) < 4) throw new ShopConflictError("shop_product_not_publishable");
  const now = nowIso();
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN
          EXISTS (SELECT 1 FROM shop_products WHERE id = ? AND version = ? AND deleted_at IS NULL AND status = 'draft')
          AND (SELECT COUNT(DISTINCT locale) FROM shop_product_localizations WHERE product_id = ?) = 4
          AND EXISTS (
            SELECT 1 FROM shop_variants v
            WHERE v.product_id = ? AND v.deleted_at IS NULL AND v.status = 'active'
              AND (SELECT COUNT(DISTINCT locale) FROM shop_variant_localizations WHERE variant_id = v.id) = 4
          )
        THEN 1 ELSE 0 END`).bind(guard, id, expectedVersion, id, id),
      db.prepare(`UPDATE shop_products
        SET status = 'active', published_at = COALESCE(published_at, ?), version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`).bind(now, typeof actor === "string" ? actor : actor.id, now, id, expectedVersion),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      auditStatement(db, actor, "shop.product.activated", "shop_product", id, requestId, { version: expectedVersion + 1 }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("product_update_conflict");
    throw error;
  }
  return getShopProduct(db, id);
}

export async function insertEncryptedInventoryUnits(db: D1Database, units: EncryptedInventoryUnit[], actor: ShopActor | string, requestId: string) {
  if (units.length < 1 || units.length > 25) throw new RangeError("inventory_batch_limit");
  const variantIds = new Set(units.map((unit) => unit.variantId));
  if (variantIds.size !== 1) throw new ShopConflictError("inventory_import_mixed_variant");
  const variantId = units[0].variantId;
  await assertImportVariant(db, variantId);
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const unit of units) {
    statements.push(
      db.prepare(`INSERT INTO shop_inventory_units
        (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
         key_fingerprint, imported_by, imported_at, updated_at)
        VALUES (?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(unit.id, unit.variantId, unit.cryptoVersion, unit.keyVersion, unit.ciphertextB64, unit.dataIvB64, unit.wrappedDekB64, unit.wrapIvB64, unit.keyFingerprint, typeof actor === "string" ? actor : actor.id, now, now),
      db.prepare(`INSERT INTO shop_inventory_movements
        (id, inventory_unit_id, variant_id, event_type, from_status, to_status, actor, reason_code, details_json, created_at)
        SELECT ?, id, variant_id, 'imported', NULL, 'available', ?, 'legacy_encrypted_import', '{}', ?
        FROM shop_inventory_units WHERE id = ? AND status = 'available'`)
        .bind(crypto.randomUUID(), inventoryMovementActor(actor), now, unit.id),
    );
  }
  statements.push(auditStatement(db, actor, "shop.inventory.imported", "shop_variant", variantId, requestId, { count: units.length, path: "legacy_encrypted" }));
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("inventory_import_conflict");
    throw error;
  }
  return { count: units.length, variantId };
}

type InventoryImportBatchRow = {
  id: string;
  variant_id: string;
  status: "ready" | "processing" | "completed" | "partial" | "failed" | "cancelled";
  source_format: InventoryImportSourceFormat;
  source_name: string | null;
  source_hash: string | null;
  request_hash: string;
  total_rows: number;
  valid_rows: number;
  duplicate_in_file_count: number;
  duplicate_in_stock_count: number;
  invalid_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type InventoryImportRow = {
  batch_id: string;
  line_number: number;
  chunk_index: number | null;
  status: "valid" | "invalid" | "duplicate_in_file" | "already_in_stock" | "imported" | "failed";
  key_fingerprint: string | null;
  inventory_unit_id: string | null;
  error_code: string | null;
};

const INVENTORY_IMPORT_CHUNK_SIZE = 25;

function maskInventoryKey(value: string) {
  const normalized = normalizeInventoryKey(value);
  return normalized.length > 4 ? `**** ${normalized.slice(-4)}` : "****";
}

function validInventoryKey(value: string) {
  return value.length >= 1 && value.length <= 4_096 && !/[\u0000-\u001f\u007f]/.test(value);
}

function chunkValues<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function previewRowsResult(input: InventoryImportPreviewInput, rows: InventoryImportRow[], idempotentReplay: boolean, batch: InventoryImportBatchRow): InventoryImportPreviewResult {
  const byLine = new Map(rows.map((row) => [row.line_number, row]));
  return {
    batchId: batch.id,
    variantId: batch.variant_id,
    status: batch.status === "completed" ? "completed" : "ready",
    sourceFormat: batch.source_format,
    sourceName: batch.source_name,
    totalRows: batch.total_rows,
    validRows: batch.valid_rows,
    duplicateInFileCount: batch.duplicate_in_file_count,
    duplicateInStockCount: batch.duplicate_in_stock_count,
    invalidCount: batch.invalid_count,
    chunkCount: Math.ceil(batch.valid_rows / INVENTORY_IMPORT_CHUNK_SIZE),
    rows: input.rows.map((key, index) => {
      const row = byLine.get(index + 1);
      return {
        lineNumber: index + 1,
        chunkIndex: row?.chunk_index ?? null,
        maskedKey: maskInventoryKey(key),
        status: row?.status === "imported"
          ? "valid"
          : row?.status === "failed"
            ? "invalid"
            : row?.status ?? "invalid",
        errorCode: row?.error_code ?? null,
      };
    }),
    idempotentReplay,
  };
}

async function loadInventoryImportBatch(db: D1Database, batchId: string) {
  return db.prepare(`SELECT id, variant_id, status, source_format, source_name, source_hash, request_hash,
      total_rows, valid_rows, duplicate_in_file_count, duplicate_in_stock_count, invalid_count,
      imported_count, skipped_count, failed_count, created_by, created_at, updated_at, completed_at
    FROM shop_inventory_import_batches WHERE id = ? LIMIT 1`).bind(batchId).first<InventoryImportBatchRow>();
}

// Expose only non-sensitive batch metadata to the service layer. Import rows
// contain blind fingerprints, never plaintext key material.
export async function getInventoryImportBatch(db: D1Database, batchId: string) {
  const batch = await loadInventoryImportBatch(db, batchId);
  return batch ? { id: batch.id, variantId: batch.variant_id, status: batch.status } : null;
}

async function loadInventoryImportRows(db: D1Database, batchId: string) {
  return db.prepare(`SELECT batch_id, line_number, chunk_index, status, key_fingerprint, inventory_unit_id, error_code
    FROM shop_inventory_import_rows WHERE batch_id = ? ORDER BY line_number`).bind(batchId).all<InventoryImportRow>();
}

async function existingInventoryFingerprints(db: D1Database, variantId: string, fingerprints: string[]) {
  const found = new Set<string>();
  for (const group of chunkValues(fingerprints, 80)) {
    if (!group.length) continue;
    const rows = await db.prepare(`SELECT key_fingerprint FROM shop_inventory_units
      WHERE variant_id = ? AND key_fingerprint IN (${idList(group)})`).bind(variantId, ...group).all<{ key_fingerprint: string }>();
    for (const row of rows.results) found.add(row.key_fingerprint);
  }
  return found;
}

export async function assertImportVariant(db: D1Database, variantId: string) {
  const variant = await db.prepare(`SELECT id, fulfillment_type, inventory_policy, status, deleted_at
    FROM shop_variants WHERE id = ? LIMIT 1`).bind(variantId).first<{ id: string; fulfillment_type: ShopFulfillmentType; inventory_policy: ShopInventoryPolicy; status: "draft" | "active" | "archived"; deleted_at: string | null }>();
  if (!variant || variant.status === "archived" || variant.deleted_at || variant.fulfillment_type !== "license_key" || variant.inventory_policy !== "tracked") throw new ShopConflictError("inventory_variant_not_eligible");
  return variant;
}

export async function createInventoryImportPreview(
  db: D1Database,
  context: ShopCryptoContext,
  input: InventoryImportPreviewInput,
  actor: ShopActor | string,
  requestId: string,
): Promise<InventoryImportPreviewResult> {
  await assertImportVariant(db, input.variantId);
  const now = nowIso();
  const prepared = input.rows.map((raw, index) => {
    const key = normalizeInventoryKey(raw);
    return { lineNumber: index + 1, raw, key, valid: validInventoryKey(key), fingerprint: null as string | null };
  });
  const validRows = prepared.filter((row) => row.valid);
  const fingerprintValues = await Promise.all(validRows.map((row) => computeInventoryKeyFingerprint(context, input.variantId, row.key)));
  validRows.forEach((row, index) => { row.fingerprint = fingerprintValues[index]; });
  const seen = new Set<string>();
  const existing = await existingInventoryFingerprints(db, input.variantId, validRows.map((row) => row.fingerprint as string));
  const classified = prepared.map((row) => {
    if (!row.valid || !row.fingerprint) return { ...row, status: "invalid" as const, errorCode: "invalid_inventory_key" };
    if (seen.has(row.fingerprint)) return { ...row, status: "duplicate_in_file" as const, errorCode: "duplicate_key_in_file" };
    seen.add(row.fingerprint);
    if (existing.has(row.fingerprint)) return { ...row, status: "already_in_stock" as const, errorCode: "duplicate_key_in_stock" };
    return { ...row, status: "valid" as const, errorCode: null };
  });
  const candidateRows = classified.filter((row) => row.status === "valid");
  const candidateChunk = new Map<number, number>();
  candidateRows.forEach((row, index) => candidateChunk.set(row.lineNumber, Math.floor(index / INVENTORY_IMPORT_CHUNK_SIZE)));
  const requestHash = await hashCanonicalJson({
    variantId: input.variantId,
    sourceFormat: input.sourceFormat,
    sourceName: input.sourceName ?? null,
    sourceHash: input.sourceHash ?? null,
    rows: classified.map((row) => ({ lineNumber: row.lineNumber, status: row.status, fingerprint: row.fingerprint })),
  });
  const idempotencyKeyHash = await hashIdempotencyKey("inventory:preview", input.idempotencyKey);
  const prior = await db.prepare(`SELECT id, request_hash FROM shop_inventory_import_batches
    WHERE variant_id = ? AND idempotency_key_hash = ? LIMIT 1`).bind(input.variantId, idempotencyKeyHash).first<{ id: string; request_hash: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ShopConflictError("idempotency_key_reused");
    const batch = await loadInventoryImportBatch(db, prior.id);
    if (!batch) throw new ShopConflictError("inventory_import_not_found");
    const rows = await loadInventoryImportRows(db, prior.id);
    return previewRowsResult(input, rows.results, true, batch);
  }
  const batchId = crypto.randomUUID();
  const duplicateInFileCount = classified.filter((row) => row.status === "duplicate_in_file").length;
  const duplicateInStockCount = classified.filter((row) => row.status === "already_in_stock").length;
  const invalidCount = classified.filter((row) => row.status === "invalid").length;
  const candidateCount = candidateRows.length;
  const batchStatus = candidateCount ? "ready" : "completed";
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO shop_inventory_import_batches
      (id, variant_id, status, source_format, source_name, source_hash, idempotency_key_hash, request_hash,
       total_rows, valid_rows, duplicate_in_file_count, duplicate_in_stock_count, invalid_count, skipped_count,
       created_by, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      batchId, input.variantId, batchStatus, input.sourceFormat, input.sourceName ?? null, input.sourceHash ?? null,
      idempotencyKeyHash, requestHash, classified.length, candidateCount, duplicateInFileCount, duplicateInStockCount,
      invalidCount, duplicateInFileCount + duplicateInStockCount + invalidCount, typeof actor === "string" ? actor : actor.id,
      now, now, batchStatus === "completed" ? now : null,
    ),
  ];
  for (const row of classified) {
    const chunkIndex = candidateChunk.get(row.lineNumber) ?? null;
    statements.push(db.prepare(`INSERT INTO shop_inventory_import_rows
      (batch_id, line_number, chunk_index, status, key_fingerprint, error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(batchId, row.lineNumber, chunkIndex, row.status, row.fingerprint, row.errorCode, now, now));
  }
  for (const group of chunkValues(candidateRows, INVENTORY_IMPORT_CHUNK_SIZE)) {
    const index = Math.floor((candidateRows.indexOf(group[0]) || 0) / INVENTORY_IMPORT_CHUNK_SIZE);
    statements.push(db.prepare(`INSERT INTO shop_inventory_import_chunks
      (id, batch_id, chunk_index, status, first_line_number, row_count, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`).bind(crypto.randomUUID(), batchId, index, group[0].lineNumber, group.length, now, now));
  }
  statements.push(auditStatement(db, actor, "shop.inventory.import_previewed", "shop_inventory_import_batch", batchId, requestId, {
    variantId: input.variantId,
    totalRows: classified.length,
    validRows: candidateCount,
    duplicateInFileCount,
    duplicateInStockCount,
    invalidCount,
    sourceFormat: input.sourceFormat,
  }));
  await db.batch(statements);
  const batch = await loadInventoryImportBatch(db, batchId);
  if (!batch) throw new ShopConflictError("inventory_import_not_found");
  const rows = await loadInventoryImportRows(db, batchId);
  return previewRowsResult(input, rows.results, false, batch);
}

export async function commitInventoryImportChunk(
  db: D1Database,
  input: InventoryImportChunkInput,
  units: Array<{ lineNumber: number; unit: EncryptedInventoryUnit }>,
  actor: ShopActor | string,
  requestId: string,
): Promise<InventoryImportChunkResult> {
  const batch = await loadInventoryImportBatch(db, input.batchId);
  if (!batch) throw new ShopConflictError("inventory_import_not_found");
  const chunk = await db.prepare(`SELECT id, chunk_index, status, request_hash, row_count
    FROM shop_inventory_import_chunks WHERE batch_id = ? AND chunk_index = ? LIMIT 1`).bind(input.batchId, input.chunkIndex).first<{ id: string; chunk_index: number; status: "pending" | "completed" | "failed"; request_hash: string | null; row_count: number }>();
  if (!chunk) throw new ShopConflictError("inventory_import_chunk_not_found");
  const expected = await db.prepare(`SELECT line_number, key_fingerprint, status FROM shop_inventory_import_rows
    WHERE batch_id = ? AND chunk_index = ? ORDER BY line_number`).bind(input.batchId, input.chunkIndex).all<{ line_number: number; key_fingerprint: string; status: string }>();
  if (expected.results.length !== units.length || new Set(units.map((entry) => entry.lineNumber)).size !== units.length) throw new ShopConflictError("inventory_import_chunk_mismatch");
  const expectedByLine = new Map(expected.results.map((row) => [row.line_number, row]));
  for (const entry of units) {
    const expectedRow = expectedByLine.get(entry.lineNumber);
    if (!expectedRow || expectedRow.key_fingerprint !== entry.unit.keyFingerprint || entry.unit.variantId !== batch.variant_id) throw new ShopConflictError("inventory_import_chunk_mismatch");
  }
  const canonicalUnits = [...units].sort((left, right) => left.lineNumber - right.lineNumber);
  const requestHash = await hashCanonicalJson({ batchId: input.batchId, chunkIndex: input.chunkIndex, rows: canonicalUnits.map((entry) => ({ lineNumber: entry.lineNumber, fingerprint: entry.unit.keyFingerprint })) });
  if (chunk.status === "completed") {
    if (chunk.request_hash !== requestHash) throw new ShopConflictError("idempotency_key_reused");
    const current = await db.prepare(`SELECT imported_count, duplicate_count, failed_count FROM shop_inventory_import_chunks WHERE id = ?`).bind(chunk.id).first<{ imported_count: number; duplicate_count: number; failed_count: number }>();
    const latest = await loadInventoryImportBatch(db, input.batchId);
    return {
      batchId: input.batchId, variantId: batch.variant_id, chunkIndex: input.chunkIndex, status: "completed",
      importedCount: current?.imported_count ?? 0, duplicateCount: current?.duplicate_count ?? 0, failedCount: current?.failed_count ?? 0,
      batchStatus: latest?.status === "completed" ? "completed" : latest?.status === "partial" ? "partial" : "processing",
      batchImportedCount: latest?.imported_count ?? 0, batchSkippedCount: latest?.skipped_count ?? 0, batchFailedCount: latest?.failed_count ?? 0,
      idempotentReplay: true,
    };
  }
  if (expected.results.some((row) => row.status !== "valid")) throw new ShopConflictError("inventory_import_chunk_conflict");
  await assertImportVariant(db, batch.variant_id);
  const now = nowIso();
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
      SELECT 1 FROM shop_inventory_import_chunks c JOIN shop_inventory_import_batches b ON b.id = c.batch_id
      WHERE c.id = ? AND c.status = 'pending' AND b.status IN ('ready', 'processing')
        AND EXISTS (
          SELECT 1 FROM shop_variants v
          WHERE v.id = b.variant_id AND v.deleted_at IS NULL AND v.status <> 'archived'
            AND v.fulfillment_type = 'license_key' AND v.inventory_policy = 'tracked'
        )
    ) THEN 1 ELSE 0 END`).bind(guard, chunk.id),
  ];
  for (const entry of units) {
    const unit = entry.unit;
    statements.push(db.prepare(`INSERT OR IGNORE INTO shop_inventory_units
      (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
       key_fingerprint, imported_by, imported_at, updated_at, import_batch_id, import_line_number)
      SELECT ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`).bind(
      unit.id, unit.variantId, unit.cryptoVersion, unit.keyVersion, unit.ciphertextB64, unit.dataIvB64, unit.wrappedDekB64,
      unit.wrapIvB64, unit.keyFingerprint, typeof actor === "string" ? actor : actor.id, now, now, input.batchId, entry.lineNumber, guard,
    ));
    statements.push(db.prepare(`UPDATE shop_inventory_import_rows SET status = CASE
        WHEN EXISTS (SELECT 1 FROM shop_inventory_units WHERE import_batch_id = ? AND import_line_number = ? AND id = ?) THEN 'imported'
        WHEN EXISTS (SELECT 1 FROM shop_inventory_units WHERE variant_id = ? AND key_fingerprint = ?) THEN 'already_in_stock'
        ELSE 'failed' END,
        inventory_unit_id = (SELECT id FROM shop_inventory_units WHERE import_batch_id = ? AND import_line_number = ? LIMIT 1),
        error_code = CASE WHEN EXISTS (SELECT 1 FROM shop_inventory_units WHERE import_batch_id = ? AND import_line_number = ? AND id = ?) THEN NULL
          WHEN EXISTS (SELECT 1 FROM shop_inventory_units WHERE variant_id = ? AND key_fingerprint = ?) THEN 'duplicate_key_in_stock'
          ELSE 'inventory_insert_failed' END, updated_at = ?
      WHERE batch_id = ? AND line_number = ? AND status = 'valid' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`).bind(
      input.batchId, entry.lineNumber, unit.id, unit.variantId, unit.keyFingerprint, input.batchId, entry.lineNumber,
      input.batchId, entry.lineNumber, unit.id, unit.variantId, unit.keyFingerprint, now, input.batchId, entry.lineNumber, guard,
    ));
    statements.push(db.prepare(`INSERT INTO shop_inventory_movements
      (id, inventory_unit_id, variant_id, event_type, from_status, to_status, import_batch_id, actor, reason_code, details_json, created_at)
      SELECT ?, ?, ?, 'imported', NULL, 'available', ?, ?, 'bulk_import', '{}', ?
      WHERE EXISTS (SELECT 1 FROM shop_inventory_units WHERE id = ? AND import_batch_id = ? AND import_line_number = ?)
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`).bind(
      crypto.randomUUID(), unit.id, unit.variantId, input.batchId, typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`,
      now, unit.id, input.batchId, entry.lineNumber, guard,
    ));
  }
  statements.push(
    db.prepare(`UPDATE shop_inventory_import_chunks SET status = 'completed', request_hash = ?, imported_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND chunk_index = ? AND status = 'imported'), duplicate_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND chunk_index = ? AND status = 'already_in_stock'), failed_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND chunk_index = ? AND status = 'failed'), attempt_count = attempt_count + 1, updated_at = ?, completed_at = ? WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`).bind(requestHash, input.batchId, input.chunkIndex, input.batchId, input.chunkIndex, input.batchId, input.chunkIndex, now, now, chunk.id, guard),
    db.prepare(`UPDATE shop_inventory_import_batches SET imported_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND status = 'imported'), skipped_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND status IN ('invalid', 'duplicate_in_file', 'already_in_stock')), failed_count = (SELECT COUNT(*) FROM shop_inventory_import_rows WHERE batch_id = ? AND status = 'failed'), status = CASE WHEN EXISTS (SELECT 1 FROM shop_inventory_import_chunks WHERE batch_id = ? AND status = 'pending') THEN 'processing' WHEN EXISTS (SELECT 1 FROM shop_inventory_import_rows WHERE batch_id = ? AND status = 'failed') THEN 'partial' ELSE 'completed' END, updated_at = ?, completed_at = CASE WHEN EXISTS (SELECT 1 FROM shop_inventory_import_chunks WHERE batch_id = ? AND status = 'pending') THEN NULL ELSE ? END WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`).bind(input.batchId, input.batchId, input.batchId, input.batchId, input.batchId, now, input.batchId, now, input.batchId, guard),
    auditStatement(db, actor, "shop.inventory.import_chunk_committed", "shop_inventory_import_batch", input.batchId, requestId, { chunkIndex: input.chunkIndex, rowCount: units.length }),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
  );
  try {
    const results = await db.batch(statements);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("inventory_import_chunk_conflict");
  } catch (error) {
    if (error instanceof ShopConflictError) throw error;
    if (isConflict(error)) throw new ShopConflictError("inventory_import_chunk_conflict");
    throw error;
  }
  const chunkResult = await db.prepare(`SELECT imported_count, duplicate_count, failed_count FROM shop_inventory_import_chunks WHERE id = ?`).bind(chunk.id).first<{ imported_count: number; duplicate_count: number; failed_count: number }>();
  const latest = await loadInventoryImportBatch(db, input.batchId);
  if (!latest || !chunkResult) throw new ShopConflictError("inventory_import_not_found");
  return {
    batchId: input.batchId, variantId: latest.variant_id, chunkIndex: input.chunkIndex, status: "completed",
    importedCount: chunkResult.imported_count, duplicateCount: chunkResult.duplicate_count, failedCount: chunkResult.failed_count,
    batchStatus: latest.status === "completed" ? "completed" : latest.status === "partial" ? "partial" : "processing",
    batchImportedCount: latest.imported_count, batchSkippedCount: latest.skipped_count, batchFailedCount: latest.failed_count,
    idempotentReplay: false,
  };
}

export async function listInventoryImportBatches(db: D1Database, variantId?: string, limit = 50) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const where = variantId ? "WHERE b.variant_id = ?" : "";
  const rows = await db.prepare(`SELECT b.id AS batchId, b.variant_id AS variantId, b.status, b.source_format AS sourceFormat,
      b.source_name AS sourceName, b.total_rows AS totalRows, b.valid_rows AS validRows,
      b.duplicate_in_file_count AS duplicateInFileCount, b.duplicate_in_stock_count AS duplicateInStockCount,
      b.invalid_count AS invalidCount, b.imported_count AS importedCount, b.skipped_count AS skippedCount,
      b.failed_count AS failedCount, b.created_by AS createdBy, b.created_at AS createdAt,
      b.updated_at AS updatedAt, b.completed_at AS completedAt,
      (SELECT COUNT(*) FROM shop_inventory_import_chunks c WHERE c.batch_id = b.id) AS chunkCount,
      (SELECT COUNT(*) FROM shop_inventory_import_chunks c WHERE c.batch_id = b.id AND c.status = 'completed') AS completedChunkCount
    FROM shop_inventory_import_batches b ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ?`).bind(...(variantId ? [variantId, boundedLimit] : [boundedLimit])).all<Record<string, unknown>>();
  return rows.results;
}

export async function getInventorySummary(db: D1Database, variantId?: string) {
  const where = variantId ? "WHERE v.id = ?" : "";
  const rows = await db.prepare(`SELECT v.id AS variant_id, v.product_id, v.sku, v.status AS variant_status, v.inventory_policy,
      v.fulfillment_type, v.deleted_at AS variant_deleted_at, v.low_stock_threshold,
      p.slug AS product_slug, p.status AS product_status,
      COALESCE(pl.title, p.slug) AS product_title, COALESCE(vl.title, v.sku) AS variant_title,
      COALESCE(SUM(CASE WHEN iu.status = 'available' THEN 1 ELSE 0 END), 0) AS available_count,
      COALESCE(SUM(CASE WHEN iu.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_count,
      COALESCE(SUM(CASE WHEN iu.status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled_count,
      COALESCE(SUM(CASE WHEN iu.status = 'quarantined' THEN 1 ELSE 0 END), 0) AS quarantined_count,
      COALESCE(SUM(CASE WHEN iu.status = 'revoked' THEN 1 ELSE 0 END), 0) AS revoked_count,
      MAX(iu.imported_at) AS last_imported_at,
      (SELECT b.id FROM shop_inventory_import_batches b WHERE b.variant_id = v.id ORDER BY b.created_at DESC, b.id DESC LIMIT 1) AS last_import_batch_id,
      (SELECT b.status FROM shop_inventory_import_batches b WHERE b.variant_id = v.id ORDER BY b.created_at DESC, b.id DESC LIMIT 1) AS last_import_batch_status,
      (SELECT b.source_format FROM shop_inventory_import_batches b WHERE b.variant_id = v.id ORDER BY b.created_at DESC, b.id DESC LIMIT 1) AS last_import_source_format,
      (SELECT b.imported_count FROM shop_inventory_import_batches b WHERE b.variant_id = v.id ORDER BY b.created_at DESC, b.id DESC LIMIT 1) AS last_import_count
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    -- Admin-only inventory view. Pinned to 'vi' deliberately: the operator UI is
    -- Vietnamese and a per-product default_locale would mix languages inside one
    -- table. Storefront queries must use p.default_locale, never this pattern.
    LEFT JOIN shop_product_localizations pl ON pl.product_id = p.id AND pl.locale = 'vi'
    LEFT JOIN shop_variant_localizations vl ON vl.variant_id = v.id AND vl.locale = 'vi'
    LEFT JOIN shop_inventory_units iu ON iu.variant_id = v.id
    ${where} GROUP BY v.id, v.product_id, v.sku, v.status, v.inventory_policy, v.low_stock_threshold ORDER BY v.sku`).bind(...(variantId ? [variantId] : [])).all<{
      variant_id: string;
      product_id: string;
      sku: string;
      variant_status: "draft" | "active" | "archived";
      inventory_policy: ShopInventoryPolicy;
      fulfillment_type: ShopFulfillmentType;
      variant_deleted_at: string | null;
      product_slug: string;
      product_status: "draft" | "active" | "archived";
      product_title: string;
      variant_title: string;
      low_stock_threshold: number;
      available_count: number;
      reserved_count: number;
      fulfilled_count: number;
      quarantined_count: number;
      revoked_count: number;
      last_imported_at: string | null;
      last_import_batch_id: string | null;
      last_import_batch_status: InventoryImportBatchRow["status"] | null;
      last_import_source_format: InventoryImportSourceFormat | null;
      last_import_count: number | null;
    }>();
  return rows.results.map((row) => ({
    variantId: row.variant_id,
    productId: row.product_id,
    productSlug: row.product_slug,
    productTitle: row.product_title,
    productStatus: row.product_status,
    variantTitle: row.variant_title,
    sku: row.sku,
    variantStatus: row.variant_status,
    fulfillmentType: row.fulfillment_type,
    inventoryPolicy: row.inventory_policy,
    inventoryImportEligible: !row.variant_deleted_at && row.variant_status !== "archived" && row.fulfillment_type === "license_key" && row.inventory_policy === "tracked",
    lowStockThreshold: row.low_stock_threshold,
    availability: availability(row.inventory_policy, row.available_count, row.low_stock_threshold),
    availableCount: row.available_count,
    reservedCount: row.reserved_count,
    fulfilledCount: row.fulfilled_count,
    quarantinedCount: row.quarantined_count,
    revokedCount: row.revoked_count,
    blockedCount: row.quarantined_count + row.revoked_count,
    lastImportedAt: row.last_imported_at,
    lastImportBatchId: row.last_import_batch_id,
    lastImportBatchStatus: row.last_import_batch_status,
    lastImportSourceFormat: row.last_import_source_format,
    lastImportCount: row.last_import_count ?? 0,
  }));
}

/** Public stock snapshot for cart revalidation. Caps ID fan-out; no secrets. */
export async function getPublicVariantStock(db: D1Database, variantIds: string[], locale: ShopLocale = "vi") {
  const pricing = locale !== "vi" ? await getShopPricingSettings(db) : fallbackShopPricingSettings();
  const unique = [...new Set(variantIds.map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{8,80}$/.test(id)))].slice(0, 30);
  if (!unique.length) return [] as Array<{
    variantId: string;
    purchasable: boolean;
    availability: ShopAvailability;
    availableQuantity: number | null;
    maxPerOrder: number;
    maxQuantity: number;
    currency: string;
    priceMinor: number;
  }>;
  const rows = await db.prepare(`SELECT v.id, v.status AS variant_status, v.inventory_policy, v.price_minor, v.currency,
      v.low_stock_threshold, v.max_per_order, p.status AS product_status,
      CASE WHEN v.inventory_policy = 'unlimited' THEN -1 ELSE COALESCE((
        SELECT COUNT(*) FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available'
      ), 0) END AS available_quantity
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    WHERE v.id IN (${idList(unique)}) AND v.deleted_at IS NULL AND p.deleted_at IS NULL`)
    .bind(...unique)
    .all<{
      id: string;
      variant_status: "draft" | "active" | "archived";
      inventory_policy: ShopInventoryPolicy;
      price_minor: number;
      currency: string;
      low_stock_threshold: number;
      max_per_order: number;
      product_status: "draft" | "active" | "archived";
      available_quantity: number;
    }>();
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  return unique.map((variantId) => {
    const row = byId.get(variantId);
    if (!row || row.product_status !== "active" || row.variant_status !== "active") {
      return {
        variantId,
        purchasable: false,
        availability: "out_of_stock" as const,
        availableQuantity: 0,
        maxPerOrder: 1,
        maxQuantity: 0,
        currency: locale !== "vi" ? "USD" : "VND",
        priceMinor: 0,
      };
    }
    const available = row.available_quantity < 0 ? null : row.available_quantity;
    const stockState = availability(row.inventory_policy, available ?? 0, row.low_stock_threshold);
    const purchasable = stockState !== "out_of_stock";
    const maxPerOrder = resolvePublicMaxPerOrder(row.inventory_policy, row.max_per_order, available);
    const maxQuantity = purchasable
      ? (available === null ? maxPerOrder : Math.max(0, available))
      : 0;
    const shouldDisplayUsd = locale !== "vi" && normalizeCurrency(row.currency) === SHOP_BASE_CURRENCY;
    const displayed = shouldDisplayUsd
      ? convertVndPricePair(row.price_minor, null, pricing.usdVndRateScaled)
      : { priceMinor: row.price_minor, currency: normalizeCurrency(row.currency) };
    return {
      variantId,
      purchasable: purchasable && maxQuantity > 0,
      availability: stockState,
      availableQuantity: available,
      maxPerOrder,
      maxQuantity,
      currency: displayed.currency,
      priceMinor: displayed.priceMinor,
    };
  });
}

async function loadCheckoutVariants(db: D1Database, input: CreateCheckoutInput) {
  const ids = input.items.map((item) => item.variantId);
  const variants = await db.prepare(`SELECT v.id, v.product_id, v.sku, v.status, v.fulfillment_type, v.delivery_mode, v.inventory_policy,
      v.price_minor, v.compare_at_minor, v.currency, v.low_stock_threshold, v.max_per_order, v.option_values_json, v.version,
      p.slug AS product_slug, p.status AS product_status, p.product_type,
      l.title AS product_title, f.title AS fallback_product_title,
      vl.title AS variant_title, vf.title AS fallback_variant_title,
      CASE WHEN v.inventory_policy = 'unlimited' THEN -1 ELSE COALESCE((SELECT COUNT(*) FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available'), 0) END AS available_quantity
    FROM shop_variants v JOIN shop_products p ON p.id = v.product_id
    LEFT JOIN shop_product_localizations l ON l.product_id = p.id AND l.locale = ?
    LEFT JOIN shop_product_localizations f ON f.product_id = p.id AND f.locale = p.default_locale
    LEFT JOIN shop_variant_localizations vl ON vl.variant_id = v.id AND vl.locale = ?
    LEFT JOIN shop_variant_localizations vf ON vf.variant_id = v.id AND vf.locale = p.default_locale
    WHERE v.id IN (${idList(ids)}) AND v.deleted_at IS NULL AND p.deleted_at IS NULL`).bind(input.locale ?? "vi", input.locale ?? "vi", ...ids).all<CheckoutVariantRow>();
  const isUsdPricing = input.pricingCurrency === "USD" || (input.pricingCurrency !== "VND" && Boolean(input.locale && input.locale !== "vi"));
  const pricing = isUsdPricing ? await getShopPricingSettings(db) : null;
  const pricedRows = variants.results.map((row) => {
    if (!pricing) {
      return { ...row, base_price_minor: row.price_minor, base_compare_at_minor: row.compare_at_minor, base_currency: normalizeCurrency(row.currency), exchange_rate_vnd_per_usd_scaled: null };
    }
    if (normalizeCurrency(row.currency) !== SHOP_BASE_CURRENCY) throw new ShopConflictError("crypto_currency_usd_required");
    const displayed = convertVndPricePair(row.price_minor, row.compare_at_minor, pricing.usdVndRateScaled);
    return {
      ...row,
      price_minor: displayed.priceMinor,
      compare_at_minor: displayed.compareAtMinor,
      currency: displayed.currency,
      base_price_minor: row.price_minor,
      base_compare_at_minor: row.compare_at_minor,
      base_currency: SHOP_BASE_CURRENCY,
      exchange_rate_vnd_per_usd_scaled: pricing.usdVndRateScaled,
    };
  });
  const byId = new Map(pricedRows.map((row) => [row.id, row]));
  if (pricedRows.length !== ids.length) throw new ShopConflictError("variant_not_found");
  for (const item of input.items) {
    const row = byId.get(item.variantId) as CheckoutVariantRow;
    if (row.product_status !== "active" || row.status !== "active") throw new ShopConflictError("variant_not_available");
    if (row.fulfillment_type === "download" && row.delivery_mode === "automatic") {
      throw new ShopConflictError("automatic_download_unsupported");
    }
    if (row.inventory_policy === "tracked") {
      // Buy limit for tracked stock is available inventory, not the static admin field.
      if (item.quantity > row.available_quantity) throw new ShopConflictError("insufficient_inventory");
    } else {
      const configuredMax = Math.max(1, Math.min(MAX_PER_ORDER_HARD_CAP, Math.floor(row.max_per_order) || 1));
      if (item.quantity > configuredMax) throw new ShopConflictError("quantity_limit_exceeded");
    }
  }
  return { rows: input.items.map((item) => ({ input: item, row: byId.get(item.variantId) as CheckoutVariantRow })) };
}

async function loadCustomer(db: D1Database, email: string) {
  return db.prepare("SELECT id, display_name, locale, status FROM shop_customers WHERE email_normalized = ? AND deleted_at IS NULL LIMIT 1").bind(normalizeShopEmail(email)).first<{ id: string; display_name: string; locale: ShopLocale; status: "active" | "blocked" | "archived" }>();
}

type CheckoutLineBase = {
  row: CheckoutVariantRow;
  subtotal: number;
};

async function calculateDiscount(db: D1Database, input: CreateCheckoutInput, customerId: string | null, lines: CheckoutLineBase[], currency: string, now: string) {
  if (!input.discountCode) return {
    id: null,
    code: null,
    amount: 0,
    eligibleLineIndexes: [] as number[],
    type: null,
    value: null,
    scope: null,
    eligibleSubtotalMinor: 0,
    minimumSubtotalMinor: 0,
    maximumDiscountMinor: null,
  };
  const discount = await db.prepare(`SELECT id, code_normalized, discount_type, value, currency, minimum_subtotal_minor,
      maximum_discount_minor, maximum_redemptions, maximum_per_customer, starts_at, ends_at
    FROM shop_discounts WHERE code_normalized = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`).bind(normalizeDiscountCode(input.discountCode)).first<{
      id: string; code_normalized: string; discount_type: "percentage" | "fixed_amount"; value: number; currency: string | null; minimum_subtotal_minor: number; maximum_discount_minor: number | null; maximum_redemptions: number | null; maximum_per_customer: number | null; starts_at: string | null; ends_at: string | null;
    }>();
  if (!discount) throw new ShopConflictError("discount_invalid");
  if ((discount.starts_at && now < discount.starts_at) || (discount.ends_at && now >= discount.ends_at)) throw new ShopConflictError("discount_outside_window");
  if (discount.currency && discount.currency !== currency) throw new ShopConflictError("discount_currency_mismatch");
  if (discount.maximum_redemptions !== null) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM shop_discount_redemptions WHERE discount_id = ? AND status IN ('reserved', 'committed')").bind(discount.id).first<{ count: number }>();
    if ((count?.count ?? 0) >= discount.maximum_redemptions) throw new ShopConflictError("discount_limit_reached");
  }
  if (customerId && discount.maximum_per_customer !== null) {
    const count = await db.prepare(`SELECT COUNT(*) AS count
      FROM shop_discount_redemptions r
      WHERE r.discount_id = ? AND r.status IN ('reserved', 'committed')
        AND r.customer_id = ?`)
      .bind(discount.id, customerId)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= discount.maximum_per_customer) throw new ShopConflictError("discount_customer_limit_reached");
  }
  const targetCount = await db.prepare("SELECT COUNT(*) AS count FROM shop_discount_targets WHERE discount_id = ?").bind(discount.id).first<{ count: number }>();
  const targetRows = (targetCount?.count ?? 0) > 0
    ? await db.prepare(`SELECT target_type, target_id FROM shop_discount_targets
        WHERE discount_id = ?
          AND ((target_type = 'product' AND target_id IN (${idList(lines.map((line) => line.row.product_id))}))
            OR (target_type = 'variant' AND target_id IN (${idList(lines.map((line) => line.row.id))})))`)
      .bind(discount.id, ...lines.map((line) => line.row.product_id), ...lines.map((line) => line.row.id))
      .all<{ target_type: "product" | "variant"; target_id: string }>()
    : { results: [] };
  const matchedProducts = new Set(targetRows.results.filter((target) => target.target_type === "product").map((target) => target.target_id));
  const matchedVariants = new Set(targetRows.results.filter((target) => target.target_type === "variant").map((target) => target.target_id));
  const eligibleLineIndexes = (targetCount?.count ?? 0) === 0
    ? lines.map((_, index) => index)
    : lines.flatMap((line, index) => matchedProducts.has(line.row.product_id) || matchedVariants.has(line.row.id) ? [index] : []);
  if (!eligibleLineIndexes.length) throw new ShopConflictError("discount_not_applicable");
  const eligibleSubtotalMinor = eligibleLineIndexes.reduce((sum, index) => sum + lines[index].subtotal, 0);
  if (eligibleSubtotalMinor < discount.minimum_subtotal_minor) throw new ShopConflictError("discount_minimum_not_met");
  let amount = discount.discount_type === "percentage" ? Math.floor((eligibleSubtotalMinor * discount.value) / 10_000) : discount.value;
  if (discount.maximum_discount_minor !== null) amount = Math.min(amount, discount.maximum_discount_minor);
  amount = Math.max(0, Math.min(amount, eligibleSubtotalMinor));
  return {
    id: discount.id,
    code: discount.code_normalized,
    amount,
    eligibleLineIndexes,
    type: discount.discount_type,
    value: discount.value,
    scope: (targetCount?.count ?? 0) === 0 ? "order" as const : "eligible_items" as const,
    eligibleSubtotalMinor,
    minimumSubtotalMinor: discount.minimum_subtotal_minor,
    maximumDiscountMinor: discount.maximum_discount_minor,
  };
}

function allocateLineDiscounts(lines: CheckoutLineBase[], amount: number, eligibleLineIndexes: number[]) {
  const discounts = new Map<number, number>();
  if (amount <= 0 || !eligibleLineIndexes.length) return discounts;
  const eligibleSubtotal = eligibleLineIndexes.reduce((sum, index) => sum + lines[index].subtotal, 0);
  let remainingAmount = amount;
  let remainingSubtotal = eligibleSubtotal;
  for (const [position, index] of eligibleLineIndexes.entries()) {
    const lineSubtotal = lines[index].subtotal;
    const isLast = position === eligibleLineIndexes.length - 1;
    const lineDiscount = isLast
      ? Math.min(remainingAmount, lineSubtotal)
      : Math.min(lineSubtotal, Math.floor((remainingAmount * lineSubtotal) / remainingSubtotal));
    discounts.set(index, lineDiscount);
    remainingAmount -= lineDiscount;
    remainingSubtotal -= lineSubtotal;
  }
  return discounts;
}

async function buildCheckoutTransaction(db: D1Database, input: CreateCheckoutInput, requestHash: string, idempotencyNamespace: string, idempotencyKeyHash: string, idempotencyTokenSalt: string, providedAccessToken?: string, checkoutSubjectHash?: string) {
  const now = nowIso();
  const existingCustomer = await loadCustomer(db, input.customer.email);
  if (existingCustomer?.status === "blocked") throw new ShopConflictError("customer_blocked");
  const customerId = existingCustomer?.id ?? crypto.randomUUID();
  const isUsdPricing = input.pricingCurrency === "USD" || (input.pricingCurrency !== "VND" && Boolean(input.locale && input.locale !== "vi"));
  const { rows } = await loadCheckoutVariants(db, input);
  const currency = normalizeCurrency(rows[0]?.row.currency ?? "VND");
  if (rows.some(({ row }) => normalizeCurrency(row.currency) !== currency)) throw new ShopConflictError("mixed_currency_not_supported");
  const linesBase = rows.map(({ input: item, row }) => {
    const productTitle = row.product_title ?? row.fallback_product_title ?? row.product_slug;
    const variantTitle = row.variant_title ?? row.fallback_variant_title ?? row.sku;
    const subtotal = row.price_minor * item.quantity;
    return { input: item, row, productTitle, variantTitle, subtotal };
  });
  const subtotalMinor = linesBase.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = await calculateDiscount(db, input, existingCustomer?.id ?? null, linesBase, currency, now);
  const lineDiscounts = allocateLineDiscounts(linesBase, discount.amount, discount.eligibleLineIndexes);
  const lines: CheckoutLine[] = linesBase.map(({ input: item, row, productTitle, variantTitle, subtotal }, index) => {
    const lineDiscount = lineDiscounts.get(index) ?? 0;
    return {
      orderItemId: crypto.randomUUID(), variantId: row.id, productId: row.product_id, productSlug: row.product_slug, sku: row.sku,
      productTitle, variantTitle, fulfillmentType: row.fulfillment_type, deliveryMode: row.delivery_mode, inventoryPolicy: row.inventory_policy,
      currency: row.currency, variantVersion: row.version, quantity: item.quantity, unitPriceMinor: row.price_minor,
      subtotalMinor: subtotal, discountMinor: lineDiscount, totalMinor: subtotal - lineDiscount,
      baseCurrency: row.base_currency,
      baseUnitPriceMinor: row.base_price_minor,
      exchangeRateVndPerUsd: row.exchange_rate_vnd_per_usd_scaled === null || row.exchange_rate_vnd_per_usd_scaled === undefined
        ? null
        : row.exchange_rate_vnd_per_usd_scaled / SHOP_RATE_SCALE,
    };
  });
  const { orderNumber, orderReference } = createOrderIdentifiers(new Date(now));
  const orderAccessToken = await scopedOrderAccessToken(providedAccessToken, idempotencyTokenSalt) ?? randomOpaqueToken(32);
  if (!/^[A-Za-z0-9_-]{43}$/.test(orderAccessToken)) throw new TypeError("invalid_order_access_token");
  const publicTokenHash = await sha256Base64Url(orderAccessToken);
  const orderId = crypto.randomUUID();
  const expiresAt = new Date(Date.parse(now) + DEFAULT_RESERVATION_MINUTES * 60_000).toISOString();
  const totalMinor = subtotalMinor - discount.amount;
  if (totalMinor <= 0) throw new ShopConflictError("zero_total_checkout_not_supported");
  // Where the rate came from, so an order can be audited long after the rate
  // row has been overwritten. Best effort: a missing table or row records nulls
  // rather than failing a checkout that has already passed validation.
  let fxProvider: string | null = null;
  let fxAsOf: string | null = null;
  try {
    const rateRow = await db.prepare(`SELECT provider, as_of FROM shop_fx_rates
      WHERE from_currency = 'VND' AND to_currency = 'USD' LIMIT 1`).first<{ provider: string; as_of: string }>();
    if (rateRow) {
      fxProvider = rateRow.provider;
      fxAsOf = rateRow.as_of;
    }
  } catch {
    // Migration 0053 is additive.
  }
  return {
    requestHash, idempotencyNamespace, idempotencyKeyHash, idempotencyTokenSalt, input, customerId, orderAccessToken, publicTokenHash,
    checkoutSubjectHash: checkoutSubjectHash ?? null, orderId, orderNumber, orderReference, expiresAt, lines, currency, subtotalMinor,
    discountMinor: discount.amount, taxMinor: 0, totalMinor, discountId: discount.id, discountCode: discount.code,
    pricingSnapshot: {
      baseCurrency: SHOP_BASE_CURRENCY,
      displayCurrency: currency,
      usdVndRateScaled: isUsdPricing ? (lines[0]?.exchangeRateVndPerUsd ? Math.round(lines[0].exchangeRateVndPerUsd * SHOP_RATE_SCALE) : DEFAULT_USD_VND_RATE_SCALED) : null,
      fxProvider,
      fxAsOf,
      marketCode: input.marketCode ?? null,
    },
  } satisfies CheckoutTransaction;
}

export type CheckoutDiscountPreview = {
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  scope: "order" | "eligible_items";
  eligibleSubtotalMinor: number;
  minimumSubtotalMinor: number;
  maximumDiscountMinor: number | null;
  amountMinor: number;
};

export type CheckoutQuotePreview = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  discountCode: string | null;
  discountId: string | null;
  discount: CheckoutDiscountPreview | null;
};

/**
 * Price a cart (+ optional discount) without creating an order or reserving inventory.
 * Uses the same variant/discount rules as checkout so the storefront summary matches payment.
 */
export async function previewCheckoutQuote(
  db: D1Database,
  input: {
    items: Array<{ variantId: string; quantity: number }>;
    locale?: ShopLocale;
    discountCode?: string;
    customerEmail?: string | null;
    pricingCurrency?: "VND" | "USD";
  },
): Promise<CheckoutQuotePreview> {
  const locale = input.locale ?? "en";
  const email = input.customerEmail?.trim() ? normalizeShopEmail(input.customerEmail) : null;
  const isUsdQuotePricing = input.pricingCurrency === "USD" || (input.pricingCurrency !== "VND" && locale !== "vi");
  const checkoutInput: CreateCheckoutInput = {
    customer: {
      email: email || "quote@preview.local",
      displayName: "Quote",
      locale,
      marketingConsent: false,
    },
    items: input.items,
    locale,
    sourceChannel: "web",
    ...(isUsdQuotePricing ? { pricingCurrency: "USD" } : {}),
    ...(input.discountCode ? { discountCode: normalizeDiscountCode(input.discountCode) } : {}),
  };
  const now = nowIso();
  const existingCustomer = email ? await loadCustomer(db, email) : null;
  if (existingCustomer?.status === "blocked") throw new ShopConflictError("customer_blocked");
  const { rows } = await loadCheckoutVariants(db, checkoutInput);
  const currency = normalizeCurrency(rows[0]?.row.currency ?? "VND");
  if (rows.some(({ row }) => normalizeCurrency(row.currency) !== currency)) {
    throw new ShopConflictError("mixed_currency_not_supported");
  }
  const linesBase = rows.map(({ input: item, row }) => ({
    row,
    subtotal: row.price_minor * item.quantity,
  }));
  const subtotalMinor = linesBase.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = await calculateDiscount(
    db,
    checkoutInput,
    existingCustomer?.id ?? null,
    linesBase,
    currency,
    now,
  );
  const totalMinor = subtotalMinor - discount.amount;
  if (totalMinor <= 0) throw new ShopConflictError("zero_total_checkout_not_supported");
  return {
    currency,
    subtotalMinor,
    discountMinor: discount.amount,
    totalMinor,
    discountCode: discount.code,
    discountId: discount.id,
    discount: discount.id && discount.code && discount.type && discount.value !== null && discount.scope
      ? {
          code: discount.code,
          type: discount.type,
          value: discount.value,
          scope: discount.scope,
          eligibleSubtotalMinor: discount.eligibleSubtotalMinor,
          minimumSubtotalMinor: discount.minimumSubtotalMinor,
          maximumDiscountMinor: discount.maximumDiscountMinor,
          amountMinor: discount.amount,
        }
      : null,
  };
}

export async function consumeCheckoutRateLimit(db: D1Database, subjectHash: string) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const windowStartedAt = Math.floor(nowSeconds / CHECKOUT_RATE_WINDOW_SECONDS) * CHECKOUT_RATE_WINDOW_SECONDS;
  const expiresAt = nowSeconds + CHECKOUT_RATE_ROW_TTL_SECONDS;
  const now = nowIso();
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
        OR shop_checkout_rate_limits.request_count < ?`).bind(subjectHash, windowStartedAt, expiresAt, now, CHECKOUT_RATE_MAX_REQUESTS),
  ]);
  return { allowed: results[1]?.meta.changes === 1, retryAfterSeconds: Math.max(1, windowStartedAt + CHECKOUT_RATE_WINDOW_SECONDS - nowSeconds) };
}

export async function cleanupExpiredIdempotencyKeys(db: D1Database, limit = 100) {
  const now = nowIso();
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await db.prepare(`DELETE FROM shop_idempotency_keys
    WHERE (namespace, key_hash) IN (
      SELECT namespace, key_hash FROM shop_idempotency_keys
      WHERE expires_at <= ? ORDER BY expires_at, namespace, key_hash LIMIT ?
    ) AND expires_at <= ?`).bind(now, boundedLimit, now).run();
  return result.meta.changes;
}

export async function createCheckoutOrder(db: D1Database, input: CreateCheckoutInput, idempotencyKey: string, actor: ShopActor | string, requestId: string, providedAccessToken?: string, checkoutSubjectHash?: string): Promise<CheckoutResult> {
  // UNIQUE(source_channel, external_reference) — always uniquify attribution refs.
  const { ensureUniqueExternalReference } = await import("./platform/attribution");
  const normalizedExternalReference = ensureUniqueExternalReference(input.externalReference ?? null);
  const normalizedInput: CreateCheckoutInput = normalizedExternalReference
    ? { ...input, externalReference: normalizedExternalReference }
    : { ...input, externalReference: undefined };
  input = normalizedInput;

  const idempotencyNamespace = `checkout:${input.sourceChannel ?? "web"}`;
  const telegramBotConfigId = input.sourceChannel === "telegram"
    && input.customer.telegramBotConfigId
    && /^[A-Za-z0-9_-]{8,80}$/.test(input.customer.telegramBotConfigId)
    ? input.customer.telegramBotConfigId
    : "environment";
  const idempotencyKeyHash = await hashIdempotencyKey(idempotencyNamespace, idempotencyKey);
  const requestHash = await hashCanonicalJson(input);
  const lookupNow = nowIso();
  const prior = await db.prepare("SELECT request_hash, state, response_json, access_token_salt, expires_at FROM shop_idempotency_keys WHERE namespace = ? AND key_hash = ? LIMIT 1").bind(idempotencyNamespace, idempotencyKeyHash).first<{ request_hash: string; state: "processing" | "completed" | "failed"; response_json: string | null; access_token_salt: string; expires_at: string }>();
  if (prior && prior.expires_at > lookupNow) {
    if (prior.request_hash !== requestHash) throw new ShopConflictError("idempotency_key_reused");
    if (prior.state === "completed" && prior.response_json) return { ...parseJson<Omit<CheckoutResult, "idempotentReplay">>(prior.response_json, {} as Omit<CheckoutResult, "idempotentReplay">), orderAccessToken: await scopedOrderAccessToken(providedAccessToken, prior.access_token_salt), idempotentReplay: true };
    throw new ShopConflictError("idempotency_in_progress");
  }
  const idempotencyTokenSalt = crypto.randomUUID();
  const transaction = await buildCheckoutTransaction(db, input, requestHash, idempotencyNamespace, idempotencyKeyHash, idempotencyTokenSalt, providedAccessToken, checkoutSubjectHash);
  const now = nowIso();
  const statements: D1PreparedStatement[] = [
    // Delete only this expired key inside the same transaction as its
    // replacement. Concurrent creators cannot erase a newly-active row.
    db.prepare("DELETE FROM shop_idempotency_keys WHERE namespace = ? AND key_hash = ? AND expires_at <= ?")
      .bind(transaction.idempotencyNamespace, transaction.idempotencyKeyHash, now),
    db.prepare(`INSERT INTO shop_idempotency_keys (namespace, key_hash, request_hash, state, access_token_salt, created_at, updated_at, expires_at) VALUES (?, ?, ?, 'processing', ?, ?, ?, ?)`)
      .bind(transaction.idempotencyNamespace, transaction.idempotencyKeyHash, transaction.requestHash, transaction.idempotencyTokenSalt, now, now, transaction.expiresAt),
  ];
  const guardTokens: string[] = [];
  if (transaction.checkoutSubjectHash) {
    const activeOrdersGuard = crypto.randomUUID();
    guardTokens.push(activeOrdersGuard);
    statements.push(db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN (SELECT COUNT(*) FROM shop_orders
        WHERE checkout_subject_hash = ? AND status = 'pending_payment' AND payment_status IN ('unpaid', 'pending')
          AND expires_at > ?) < ? THEN 1 ELSE 0 END`)
      .bind(activeOrdersGuard, transaction.checkoutSubjectHash, now, CHECKOUT_MAX_ACTIVE_ORDERS_PER_SUBJECT));
  }
  const existingCustomer = await loadCustomer(db, input.customer.email);
  if (!existingCustomer) statements.push(db.prepare(`INSERT INTO shop_customers (id, email_normalized, email_masked, display_name, phone, locale, marketing_consent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(transaction.customerId, normalizeShopEmail(input.customer.email), maskShopEmail(input.customer.email), input.customer.displayName, input.customer.phone ?? null, input.customer.locale ?? input.locale ?? "vi", input.customer.marketingConsent ? 1 : 0, now, now));
  else statements.push(db.prepare("UPDATE shop_customers SET display_name = ?, phone = COALESCE(?, phone), locale = ?, marketing_consent = MAX(marketing_consent, ?), updated_at = ? WHERE id = ?").bind(input.customer.displayName, input.customer.phone ?? null, input.customer.locale ?? input.locale ?? "vi", input.customer.marketingConsent ? 1 : 0, now, existingCustomer.id));
  for (const line of transaction.lines) {
    const guardToken = crypto.randomUUID();
    guardTokens.push(guardToken);
    statements.push(db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM shop_variants v JOIN shop_products p ON p.id = v.product_id
        WHERE v.id = ? AND v.version = ? AND v.status = 'active' AND v.deleted_at IS NULL AND p.status = 'active' AND p.deleted_at IS NULL
        AND v.price_minor = ? AND v.currency = ?
        AND (v.inventory_policy = 'unlimited' OR (SELECT COUNT(*) FROM shop_inventory_units iu WHERE iu.variant_id = v.id AND iu.status = 'available') >= ?)) THEN 1 ELSE 0 END`)
      .bind(guardToken, line.variantId, line.variantVersion, line.baseUnitPriceMinor ?? line.unitPriceMinor, line.baseCurrency ?? line.currency, line.quantity));
  }
  const pricingMetadata = JSON.stringify({ pricing: {
    baseCurrency: transaction.pricingSnapshot.baseCurrency,
    displayCurrency: transaction.pricingSnapshot.displayCurrency,
    usdVndRate: transaction.pricingSnapshot.usdVndRateScaled === null ? null : transaction.pricingSnapshot.usdVndRateScaled / SHOP_RATE_SCALE,
    usdVndRateScaled: transaction.pricingSnapshot.usdVndRateScaled,
    fxProvider: transaction.pricingSnapshot.fxProvider,
    fxAsOf: transaction.pricingSnapshot.fxAsOf,
    marketCode: transaction.pricingSnapshot.marketCode,
  } });
  const orderInsert = input.sourceChannel === "telegram"
    ? db.prepare(`INSERT INTO shop_orders
        (id, order_number, order_reference, public_token_hash, checkout_subject_hash, customer_id, source_channel, telegram_bot_config_id, external_reference, locale, status, payment_status,
         fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, discount_code_snapshot,
         metadata_json, customer_email_snapshot, customer_name_snapshot, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'telegram', ?, ?, ?, 'pending_payment', 'unpaid', 'unfulfilled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(transaction.orderId, transaction.orderNumber, transaction.orderReference, transaction.publicTokenHash, transaction.checkoutSubjectHash, transaction.customerId, telegramBotConfigId, input.externalReference ?? null, input.locale ?? "vi", transaction.currency, transaction.subtotalMinor, transaction.discountMinor, transaction.taxMinor, transaction.totalMinor, transaction.discountCode, pricingMetadata, normalizeShopEmail(input.customer.email), input.customer.displayName, transaction.expiresAt, now, now)
    : db.prepare(`INSERT INTO shop_orders
        (id, order_number, order_reference, public_token_hash, checkout_subject_hash, customer_id, source_channel, external_reference, locale, status, payment_status,
         fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, discount_code_snapshot,
         metadata_json, customer_email_snapshot, customer_name_snapshot, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'unpaid', 'unfulfilled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(transaction.orderId, transaction.orderNumber, transaction.orderReference, transaction.publicTokenHash, transaction.checkoutSubjectHash, transaction.customerId, input.sourceChannel ?? "web", input.externalReference ?? null, input.locale ?? "vi", transaction.currency, transaction.subtotalMinor, transaction.discountMinor, transaction.taxMinor, transaction.totalMinor, transaction.discountCode, pricingMetadata, normalizeShopEmail(input.customer.email), input.customer.displayName, transaction.expiresAt, now, now);
  statements.push(orderInsert);
  for (const line of transaction.lines) {
    statements.push(db.prepare(`INSERT INTO shop_order_items
      (id, order_id, line_number, product_id, variant_id, product_slug_snapshot, sku_snapshot, product_title_snapshot, variant_title_snapshot,
       fulfillment_type, delivery_mode, inventory_policy, quantity, unit_price_minor, subtotal_minor, discount_minor, total_minor, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        line.orderItemId, transaction.orderId, transaction.lines.indexOf(line) + 1, line.productId, line.variantId, line.productSlug, line.sku,
        line.productTitle, line.variantTitle, line.fulfillmentType, line.deliveryMode, line.inventoryPolicy, line.quantity, line.unitPriceMinor,
        line.subtotalMinor, line.discountMinor, line.totalMinor,
        JSON.stringify({ pricing: { baseCurrency: line.baseCurrency ?? line.currency, baseUnitPriceMinor: line.baseUnitPriceMinor ?? line.unitPriceMinor, displayCurrency: line.currency, exchangeRateVndPerUsd: line.exchangeRateVndPerUsd ?? null } }),
        now, now));
    const reservationId = crypto.randomUUID();
    statements.push(db.prepare(`INSERT INTO shop_inventory_reservations (id, order_id, order_item_id, variant_id, status, quantity, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`).bind(reservationId, transaction.orderId, line.orderItemId, line.variantId, line.quantity, transaction.expiresAt, now, now));
    if (line.inventoryPolicy === "tracked") {
      const allocationIdPrefix = reservationId;
      statements.push(db.prepare(`INSERT INTO shop_inventory_allocations (id, reservation_id, order_item_id, inventory_unit_id, status, created_at, updated_at)
        SELECT ? || ':' || id, ?, ?, id, 'held', ?, ? FROM shop_inventory_units WHERE variant_id = ? AND status = 'available' ORDER BY imported_at, id LIMIT ?`).bind(allocationIdPrefix, reservationId, line.orderItemId, now, now, line.variantId, line.quantity));
      const allocationGuardToken = crypto.randomUUID();
      guardTokens.push(allocationGuardToken);
      statements.push(db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN (SELECT COUNT(*) FROM shop_inventory_allocations WHERE reservation_id = ? AND status = 'held') = ? THEN 1 ELSE 0 END`).bind(allocationGuardToken, reservationId, line.quantity));
      statements.push(db.prepare(`UPDATE shop_inventory_units SET status = 'reserved', updated_at = ? WHERE id IN (SELECT inventory_unit_id FROM shop_inventory_allocations WHERE reservation_id = ? AND status = 'held') AND status = 'available'`).bind(now, reservationId));
      statements.push(db.prepare(`INSERT INTO shop_inventory_movements
        (id, inventory_unit_id, variant_id, event_type, from_status, to_status, reservation_id, allocation_id, actor, reason_code, details_json, created_at)
        SELECT ? || ':reserved:' || iu.id, iu.id, iu.variant_id, 'reserved', 'available', 'reserved', a.reservation_id, a.id, ?, 'checkout_reservation', ?, ?
        FROM shop_inventory_allocations a
        JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
        WHERE a.reservation_id = ? AND a.status = 'held' AND iu.status = 'reserved'
          AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(reservationId, inventoryMovementActor(actor), JSON.stringify({ orderId: transaction.orderId, orderItemId: line.orderItemId }), now, reservationId, allocationGuardToken));
    }
  }
  if (transaction.discountId) {
    const discountGuardToken = crypto.randomUUID();
    guardTokens.push(discountGuardToken);
    statements.push(db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
      SELECT 1 FROM shop_discounts d WHERE d.id = ?
        AND (d.maximum_redemptions IS NULL OR (SELECT COUNT(*) FROM shop_discount_redemptions r WHERE r.discount_id = d.id AND r.status IN ('reserved', 'committed')) < d.maximum_redemptions)
        AND (d.maximum_per_customer IS NULL OR (SELECT COUNT(*)
          FROM shop_discount_redemptions r
          WHERE r.discount_id = d.id AND r.status IN ('reserved', 'committed')
            AND r.customer_id = ?) < d.maximum_per_customer)
    ) THEN 1 ELSE 0 END`).bind(discountGuardToken, transaction.discountId, transaction.customerId));
    statements.push(db.prepare(`INSERT INTO shop_discount_redemptions (id, discount_id, order_id, customer_id, code_snapshot, amount_minor, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`)
      .bind(crypto.randomUUID(), transaction.discountId, transaction.orderId, transaction.customerId, transaction.discountCode, transaction.discountMinor, now));
  }
  const result: CheckoutResult = {
    orderId: transaction.orderId, orderNumber: transaction.orderNumber, orderReference: transaction.orderReference, orderAccessToken: transaction.orderAccessToken,
    status: "pending_payment", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", currency: transaction.currency,
    subtotalMinor: transaction.subtotalMinor, discountMinor: transaction.discountMinor, taxMinor: transaction.taxMinor, totalMinor: transaction.totalMinor,
    expiresAt: transaction.expiresAt, lines: transaction.lines, idempotentReplay: false,
  };
  // Never persist the bearer token in the idempotency record. A replay is
  // intentionally metadata-only and cannot mint a second access credential.
  const persistedResponse = JSON.stringify({ ...result, orderAccessToken: null });
  statements.push(db.prepare("UPDATE shop_idempotency_keys SET state = 'completed', resource_type = 'shop_order', resource_id = ?, response_status = 201, response_json = ?, updated_at = ? WHERE namespace = ? AND key_hash = ? AND request_hash = ?")
    .bind(transaction.orderId, persistedResponse, now, idempotencyNamespace, idempotencyKeyHash, requestHash));
  statements.push(
    db.prepare(`INSERT INTO transactional_email_outbox
      (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
      VALUES (?, 'shop.order.created', 'shop_order', ?, ?, 'pending', ?, ?, ?)`)
      .bind(crypto.randomUUID(), transaction.orderId, `shop-order-created:${transaction.orderId}`, now, now, now),
    auditStatement(db, actor, "shop.order.created", "shop_order", transaction.orderId, requestId, { orderNumber: transaction.orderNumber, itemCount: transaction.lines.length, totalMinor: transaction.totalMinor }),
  );
  for (const guardToken of guardTokens) statements.push(db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guardToken));
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConflict(error)) {
      const duplicate = await db.prepare("SELECT request_hash, state, response_json, access_token_salt FROM shop_idempotency_keys WHERE namespace = ? AND key_hash = ? AND expires_at > ? LIMIT 1").bind(idempotencyNamespace, idempotencyKeyHash, nowIso()).first<{ request_hash: string; state: "processing" | "completed" | "failed"; response_json: string | null; access_token_salt: string }>();
      if (duplicate?.request_hash === requestHash && duplicate.state === "completed" && duplicate.response_json) return { ...parseJson<Omit<CheckoutResult, "idempotentReplay">>(duplicate.response_json, {} as Omit<CheckoutResult, "idempotentReplay">), orderAccessToken: await scopedOrderAccessToken(providedAccessToken, duplicate.access_token_salt), idempotentReplay: true };
      if (duplicate?.request_hash && duplicate.request_hash !== requestHash) throw new ShopConflictError("idempotency_key_reused");
      if (transaction.checkoutSubjectHash) {
        const activeCount = await db.prepare(`SELECT COUNT(*) AS count FROM shop_orders
          WHERE checkout_subject_hash = ? AND status = 'pending_payment' AND payment_status IN ('unpaid', 'pending') AND expires_at > ?`)
          .bind(transaction.checkoutSubjectHash, nowIso()).first<{ count: number }>();
        if ((activeCount?.count ?? 0) >= CHECKOUT_MAX_ACTIVE_ORDERS_PER_SUBJECT) throw new ShopConflictError("checkout_active_order_limit");
      }
      throw new ShopConflictError("checkout_conflict");
    }
    throw error;
  }
  return result;
}

export async function getOrderByAccessToken(db: D1Database, accessToken: string) {
  const tokenHash = await sha256Base64Url(accessToken);
  return db.prepare(`SELECT id, order_number, order_reference, status, payment_status, fulfillment_status, currency,
      subtotal_minor, discount_minor, tax_minor, total_minor, expires_at, paid_at, fulfilled_at, created_at
    FROM shop_orders WHERE public_token_hash = ? LIMIT 1`).bind(tokenHash).first<{
      id: string; order_number: string; order_reference: string; status: ShopOrderStatus; payment_status: ShopPaymentStatus; fulfillment_status: "unfulfilled" | "partial" | "fulfilled" | "failed"; currency: string; subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; expires_at: string | null; paid_at: string | null; fulfilled_at: string | null; created_at: string;
  }>();
}

function mapCryptoPaymentMethod(row: Record<string, unknown>): ShopCryptoPaymentMethod {
  let publicConfig: ShopCryptoPaymentMethod["publicConfig"] = {};
  if (typeof row.publicConfig === "string") {
    try {
      const parsed = JSON.parse(row.publicConfig) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) publicConfig = parsed as ShopCryptoPaymentMethod["publicConfig"];
    } catch {
      publicConfig = {};
    }
  }
  return {
    id: String(row.id),
    storefrontScope: row.storefrontScope === "legacy" ? "legacy" : "glb",
    provider: row.provider as ShopCryptoPaymentMethod["provider"],
    rail: row.rail as ShopCryptoPaymentMethod["rail"],
    asset: row.asset as ShopCryptoPaymentMethod["asset"],
    network: String(row.network ?? ""),
    verificationMode: "manual",
    destinationType: row.destinationType as ShopCryptoPaymentMethod["destinationType"],
    destinationValue: String(row.destinationValue ?? ""),
    memoOrTag: String(row.memoOrTag ?? ""),
    displayName: String(row.displayName ?? ""),
    status: row.status as ShopCryptoPaymentMethod["status"],
    minConfirmations: Number(row.minConfirmations ?? 0),
    expiryMinutes: Number(row.expiryMinutes ?? 30),
    sortOrder: Number(row.sortOrder ?? 0),
    version: Number(row.version ?? 1),
    publicConfig,
    ...(row.createdAt ? { createdAt: String(row.createdAt) } : {}),
    ...(row.updatedAt ? { updatedAt: String(row.updatedAt) } : {}),
  };
}

export async function listCryptoPaymentMethods(db: D1Database, publicOnly = false, storefrontScope: "legacy" | "glb" = "glb") {
  const rows = await db.prepare(`SELECT id, provider, rail, asset, network,
      destination_type AS destinationType, destination_value AS destinationValue,
      memo_or_tag AS memoOrTag, display_name AS displayName, status,
      min_confirmations AS minConfirmations, expiry_minutes AS expiryMinutes,
      sort_order AS sortOrder, version, storefront_scope AS storefrontScope,
      public_config_json AS publicConfig,
      created_at AS createdAt, updated_at AS updatedAt
    FROM shop_crypto_payment_methods
    WHERE storefront_scope = ? AND ${publicOnly ? "status = 'active'" : "status != 'archived'"}
    ORDER BY sort_order, provider, asset, network, updated_at DESC, id`).bind(storefrontScope).all<Record<string, unknown>>();
  return rows.results.map(mapCryptoPaymentMethod);
}

export async function createCryptoPaymentMethod(
  db: D1Database,
  input: ShopCryptoPaymentMethodInput,
  actor: ShopActor | string,
  requestId: string,
) {
  const id = crypto.randomUUID();
  const now = nowIso();
  const actorId = typeof actor === "string" ? actor : actor.id;
  const network = (input.network ?? "").trim().toUpperCase().slice(0, 40);
  const destination = input.destinationValue.trim();
  const memo = (input.memoOrTag ?? "").trim().slice(0, 180);
  if (!destination) throw new ShopConflictError("crypto_destination_required");
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_crypto_payment_methods
        (id, storefront_scope, provider, rail, asset, network, destination_type, destination_value, memo_or_tag,
         display_name, status, min_confirmations, expiry_minutes, sort_order, public_config_json,
         created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, input.storefrontScope ?? "glb", input.provider, input.rail, input.asset, network, input.destinationType, destination, memo,
          input.displayName.trim().slice(0, 180), input.status, Math.max(0, Math.min(100000, Math.floor(input.minConfirmations ?? 1))),
          Math.max(5, Math.min(1440, Math.floor(input.expiryMinutes ?? 30))), Math.max(0, Math.min(100000, Math.floor(input.sortOrder ?? 0))),
          JSON.stringify(input.publicConfig ?? {}), actorId, actorId, now, now),
      auditStatement(db, actor, "shop.crypto_payment_method.created", "shop_crypto_payment_method", id, requestId, {
        provider: input.provider, rail: input.rail, asset: input.asset, network,
      }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("crypto_payment_method_conflict");
    throw error;
  }
  const row = await db.prepare(`SELECT id, storefront_scope AS storefrontScope, provider, rail, asset, network,
      destination_type AS destinationType, destination_value AS destinationValue,
      memo_or_tag AS memoOrTag, display_name AS displayName, status,
      min_confirmations AS minConfirmations, expiry_minutes AS expiryMinutes,
      sort_order AS sortOrder, version, created_at AS createdAt, updated_at AS updatedAt
      , public_config_json AS publicConfig
    FROM shop_crypto_payment_methods WHERE id = ? LIMIT 1`).bind(id).first<Record<string, unknown>>();
  return row ? mapCryptoPaymentMethod(row) : null;
}

export async function getCryptoPaymentMethod(db: D1Database, id: string, publicOnly = false, storefrontScope: "legacy" | "glb" | null = null) {
  const row = await db.prepare(`SELECT id, storefront_scope AS storefrontScope, provider, rail, asset, network,
      destination_type AS destinationType, destination_value AS destinationValue,
      memo_or_tag AS memoOrTag, display_name AS displayName, status,
      min_confirmations AS minConfirmations, expiry_minutes AS expiryMinutes,
      sort_order AS sortOrder, version, public_config_json AS publicConfig,
      created_at AS createdAt, updated_at AS updatedAt
    FROM shop_crypto_payment_methods WHERE id = ? ${storefrontScope ? "AND storefront_scope = ?" : ""} ${publicOnly ? "AND status = 'active'" : "AND status != 'archived'"} LIMIT 1`).bind(...(storefrontScope ? [id, storefrontScope] : [id])).first<Record<string, unknown>>();
  return row ? mapCryptoPaymentMethod(row) : null;
}

export async function updateCryptoPaymentMethod(
  db: D1Database,
  id: string,
  input: ShopCryptoPaymentMethodInput,
  expectedVersion: number,
  actor: ShopActor | string,
  requestId: string,
) {
  const existing = await db.prepare("SELECT id FROM shop_crypto_payment_methods WHERE id = ? AND status != 'archived' LIMIT 1").bind(id).first<{ id: string }>();
  if (!existing) throw new ShopNotFoundError();
  const now = nowIso();
  const result = await db.prepare(`UPDATE shop_crypto_payment_methods SET storefront_scope = COALESCE(?, storefront_scope), provider = ?, rail = ?, asset = ?, network = ?,
      destination_type = ?, destination_value = ?, memo_or_tag = ?, display_name = ?, status = ?, min_confirmations = ?,
      expiry_minutes = ?, sort_order = ?, public_config_json = ?, version = version + 1, updated_by = ?, updated_at = ?
    WHERE id = ? AND version = ? AND status != 'archived'`).bind(
    input.storefrontScope ?? null, input.provider, input.rail, input.asset, (input.network ?? "").trim().toUpperCase().slice(0, 40), input.destinationType,
    input.destinationValue.trim(), (input.memoOrTag ?? "").trim().slice(0, 180), input.displayName.trim().slice(0, 180), input.status,
    Math.max(0, Math.min(100000, Math.floor(input.minConfirmations ?? 1))), Math.max(5, Math.min(1440, Math.floor(input.expiryMinutes ?? 30))),
    Math.max(0, Math.min(100000, Math.floor(input.sortOrder ?? 0))), JSON.stringify(input.publicConfig ?? {}), typeof actor === "string" ? actor : actor.id, now, id, expectedVersion,
  ).run();
  if (result.meta.changes !== 1) throw new ShopConflictError("crypto_payment_method_conflict");
  await db.batch([auditStatement(db, actor, "shop.crypto_payment_method.updated", "shop_crypto_payment_method", id, requestId, { provider: input.provider, rail: input.rail, asset: input.asset })]);
  return getCryptoPaymentMethod(db, id);
}

export async function archiveCryptoPaymentMethod(db: D1Database, id: string, actor: ShopActor | string, requestId: string) {
  const result = await db.prepare("UPDATE shop_crypto_payment_methods SET status = 'archived', version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND status != 'archived'").bind(typeof actor === "string" ? actor : actor.id, nowIso(), id).run();
  if (result.meta.changes !== 1) throw new ShopNotFoundError();
  await db.batch([auditStatement(db, actor, "shop.crypto_payment_method.archived", "shop_crypto_payment_method", id, requestId)]);
  return getCryptoPaymentMethod(db, id);
}

export async function createPaymentProviderConfig(db: D1Database, input: PaymentProviderConfigInput, actor: ShopActor | string, requestId: string) {
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_payment_provider_configs
        (id, provider, display_name, status, bank_id, account_ref, account_name_display, qr_template, confirmation_adapter, secret_ref, public_config_json, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, input.provider, input.displayName, input.status, input.bankId, input.accountRef, input.accountNameDisplay ?? "", input.qrTemplate ?? "compact2", input.confirmationAdapter, input.secretRef ?? null, JSON.stringify(input.publicConfig ?? {}), typeof actor === "string" ? actor : actor.id, typeof actor === "string" ? actor : actor.id, now, now),
      auditStatement(db, actor, "shop.payment_provider.created", "shop_payment_provider_config", id, requestId, { provider: input.provider, confirmationAdapter: input.confirmationAdapter }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("payment_provider_conflict");
    throw error;
  }
  return db.prepare(`SELECT id, provider, display_name AS displayName, status, bank_id AS bankId, account_ref AS accountRef,
      account_name_display AS accountNameDisplay, qr_template AS qrTemplate, confirmation_adapter AS confirmationAdapter,
      secret_ref AS secretRef, public_config_json AS publicConfig, version, created_at AS createdAt, updated_at AS updatedAt
    FROM shop_payment_provider_configs WHERE id = ?`).bind(id).first<Record<string, unknown>>();
}

export async function createPaymentAttempt(db: D1Database, input: PaymentAttemptInput, actor: ShopActor | string, requestId: string): Promise<PaymentAttempt> {
  const order = await db.prepare(`SELECT id, order_reference, status, payment_status, currency, total_minor, expires_at
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{ id: string; order_reference: string; status: ShopOrderStatus; payment_status: ShopPaymentStatus; currency: string; total_minor: number; expires_at: string | null }>();
  const config = await db.prepare(`SELECT id, provider, status, confirmation_adapter
    FROM shop_payment_provider_configs
    WHERE id = ?
      AND provider = 'vietqr'
      AND status = 'active'
      AND account_ref = 'VIETQR_BANK_ACCOUNT'
      AND confirmation_adapter = 'payos'
      AND secret_ref = 'PAYOS_CHECKSUM_KEY'
    LIMIT 1`).bind(input.providerConfigId).first<{ id: string; provider: "vietqr"; status: "active"; confirmation_adapter: "payos" }>();
  if (!order || !config || order.status === "cancelled" || order.status === "expired" || order.payment_status === "paid") throw new ShopConflictError("payment_not_available");
  if (!Number.isSafeInteger(order.total_minor) || order.total_minor <= 0) throw new ShopConflictError("zero_total_checkout_not_supported");
  if (!Number.isSafeInteger(input.providerOrderCode) || Number(input.providerOrderCode) <= 0
    || typeof input.providerDescription !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(input.providerDescription)) {
    throw new ShopConflictError("payment_identity_required");
  }
  const paymentExpiry = Date.parse(input.expiresAt);
  const orderExpiry = order.expires_at ? Date.parse(order.expires_at) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(paymentExpiry) || paymentExpiry <= Date.now() || paymentExpiry > orderExpiry) throw new ShopConflictError("payment_expired");
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_payment_attempts
        (id, order_id, provider_config_id, provider, confirmation_provider, method, status, amount_minor, currency, order_reference,
         provider_reference, provider_order_code, provider_description, checkout_url, qr_image_url, qr_payload_hash, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, 'vietqr', ?, 'bank_transfer_qr', 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, order.id, config.id, config.confirmation_adapter, order.total_minor, order.currency, order.order_reference,
          input.providerReference ?? null, input.providerOrderCode ?? null, input.providerDescription ?? null, input.checkoutUrl ?? null,
          input.qrImageUrl ?? null, input.qrPayloadHash ?? null, input.expiresAt, now, now),
      db.prepare("UPDATE shop_orders SET payment_status = CASE WHEN payment_status = 'unpaid' THEN 'pending' ELSE payment_status END, updated_at = ? WHERE id = ? AND payment_status IN ('unpaid', 'pending')").bind(now, order.id),
      db.prepare(`INSERT INTO shop_payment_events
        (id, provider, provider_event_id, payment_attempt_id, order_id, event_type, order_reference, payload_hash, signature_verified, match_state, processing_state, occurred_at, processed_at, created_at)
        VALUES (?, 'vietqr', ?, ?, ?, 'qr.generated', ?, ?, 1, 'matched', 'accepted', ?, ?, ?)`)
        .bind(crypto.randomUUID(), `qr:${id}`, id, order.id, order.order_reference, input.qrPayloadHash ?? await sha256Base64Url(id), now, now, now),
      auditStatement(db, actor, "shop.payment_attempt.created", "shop_payment_attempt", id, requestId, { orderId: order.id, amountMinor: order.total_minor, provider: "vietqr" }),
    ]);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("payment_attempt_conflict");
    throw error;
  }
  return {
    id,
    orderId: order.id,
    provider: "vietqr",
    confirmationProvider: config.confirmation_adapter,
    status: "awaiting_payment",
    amountMinor: order.total_minor,
    currency: order.currency,
    orderReference: order.order_reference,
    providerReference: input.providerReference ?? null,
    providerOrderCode: input.providerOrderCode ?? null,
    providerDescription: input.providerDescription ?? null,
    checkoutUrl: input.checkoutUrl ?? null,
    qrImageUrl: input.qrImageUrl ?? null,
    expiresAt: input.expiresAt,
    confirmedAt: null,
  };
}

type ConfirmationOrderRow = { id: string; order_reference: string; status: ShopOrderStatus; payment_status: ShopPaymentStatus; currency: string; total_minor: number };

type ExistingPaymentEventRow = {
  id: string;
  order_id: string | null;
  payment_attempt_id: string | null;
  payload_hash: string;
  processing_state: "accepted" | "ignored" | "rejected" | "processed";
  error_code: string | null;
};

async function findExistingPaymentEvent(db: D1Database, input: PaymentConfirmationInput) {
  return db.prepare(`SELECT id, order_id, payment_attempt_id, payload_hash, processing_state, error_code
    FROM shop_payment_events WHERE provider = ? AND provider_event_id = ? LIMIT 1`)
    .bind(input.provider, input.providerEventId).first<ExistingPaymentEventRow>();
}

function replayExistingPaymentEvent(existing: ExistingPaymentEventRow, input: PaymentConfirmationInput) {
  if (existing.payload_hash !== input.payloadHash) throw new ShopConflictError("payment_event_payload_mismatch");
  if (existing.processing_state === "rejected") {
    return { eventId: existing.id, orderId: existing.order_id, paymentAttemptId: existing.payment_attempt_id, outcome: "rejected" as const, code: existing.error_code ?? "payment_event_rejected" };
  }
  if (existing.processing_state !== "processed") {
    return { eventId: existing.id, orderId: existing.order_id, paymentAttemptId: existing.payment_attempt_id, outcome: "unmatched" as const, code: existing.error_code ?? "payment_event_not_processed" };
  }
  return { eventId: existing.id, orderId: existing.order_id, paymentAttemptId: existing.payment_attempt_id, outcome: "already_processed" as const };
}

async function insertRejectedPaymentEvent(db: D1Database, input: PaymentConfirmationInput, order: ConfirmationOrderRow | null, matchState: "unmatched" | "amount_mismatch" | "currency_mismatch" | "invalid_signature", code: string) {
  const eventId = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO shop_payment_events
      (id, provider, provider_event_id, order_id, event_type, transaction_reference, amount_minor, currency, order_reference,
       payload_hash, signature_verified, match_state, processing_state, error_code, occurred_at, processed_at, created_at)
      VALUES (?, ?, ?, ?, 'payment.confirmation', ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?)`)
      .bind(eventId, input.provider, input.providerEventId, order?.id ?? null, input.transactionReference ?? null, input.amountMinor, input.currency, input.orderReference, input.payloadHash, input.signatureVerified ? 1 : 0, matchState, code, input.occurredAt, nowIso(), nowIso()).run();
  } catch (error) {
    if (!isConflict(error)) throw error;
    const existing = await findExistingPaymentEvent(db, input);
    if (existing) return replayExistingPaymentEvent(existing, input);
    throw error;
  }
  return { eventId, orderId: order?.id ?? null, paymentAttemptId: null, outcome: "rejected" as const, code };
}

export async function reconcilePaymentConfirmation(db: D1Database, input: PaymentConfirmationInput, actor: ShopActor | string, requestId: string, context: PaymentReconciliationContext = {}): Promise<PaymentReconciliationResult> {
  const existingEvent = await findExistingPaymentEvent(db, input);
  if (existingEvent) return replayExistingPaymentEvent(existingEvent, input);
  if (input.provider !== "payos") {
    const legacyOrder = await db.prepare(`SELECT id, order_reference, status, payment_status, currency, total_minor
      FROM shop_orders WHERE order_reference = ? LIMIT 1`).bind(input.orderReference).first<ConfirmationOrderRow>();
    return insertRejectedPaymentEvent(db, input, legacyOrder, "unmatched", "provider_not_supported");
  }
  const payosAttempt = input.providerOrderCode
    ? await db.prepare(`SELECT pa.id AS payment_attempt_id, pa.provider_reference, pa.provider_description,
        pa.provider_account_number, pa.status AS payment_attempt_status, pa.expires_at,
        pc.account_ref,
        o.id, o.order_reference, o.status, o.payment_status, o.currency, o.total_minor
      FROM shop_payment_attempts pa
      JOIN shop_orders o ON o.id = pa.order_id
      JOIN shop_payment_provider_configs pc ON pc.id = pa.provider_config_id
      WHERE pa.provider = 'vietqr'
        AND pa.confirmation_provider = 'payos'
        AND pa.provider_order_code = ?
        AND pc.provider = 'vietqr'
        AND pc.account_ref = 'VIETQR_BANK_ACCOUNT'
        AND pc.confirmation_adapter = 'payos'
        AND pc.secret_ref = 'PAYOS_CHECKSUM_KEY'
      LIMIT 1`)
      .bind(input.providerOrderCode).first<ConfirmationOrderRow & {
        payment_attempt_id: string;
        provider_reference: string | null;
        provider_description: string | null;
        provider_account_number: string | null;
        account_ref: string;
        payment_attempt_status: PaymentAttempt["status"];
        expires_at: string;
      }>()
    : null;
  const order = payosAttempt;
  if (!input.signatureVerified) return insertRejectedPaymentEvent(db, input, order, "invalid_signature", "signature_invalid");
  if (!order) return insertRejectedPaymentEvent(db, input, null, "unmatched", "order_not_found");
  const expectedAccount = context.payOsAccountNumber?.trim() ?? "";
  const expectedDescription = payosAttempt.provider_description ?? "";
  // Webhook "orderReference" is payOS data.description = transfer content, not TUNG order id.
  const identityMatches = payosAttempt?.account_ref === "VIETQR_BANK_ACCOUNT"
    && /^[0-9]{4,32}$/.test(expectedAccount)
    && (input.destinationAccountNumber === expectedAccount
      || input.destinationAccountNumber === payosAttempt.provider_account_number)
    && Boolean(expectedDescription)
    && payOsTransferDescriptionMatches(input.orderReference, expectedDescription);
  if (!identityMatches) return insertRejectedPaymentEvent(db, input, order, "unmatched", "payment_identity_mismatch");
  if (normalizeCurrency(input.currency) !== normalizeCurrency(order.currency)) return insertRejectedPaymentEvent(db, input, order, "currency_mismatch", "currency_mismatch");
  if (input.amountMinor !== order.total_minor) return insertRejectedPaymentEvent(db, input, order, "amount_mismatch", "amount_mismatch");
  const payOsAttemptEligible = payosAttempt
    && (payosAttempt.payment_attempt_status === "created" || payosAttempt.payment_attempt_status === "awaiting_payment")
    && payOsPaymentOccurredWithinRecoveryWindow(input.occurredAt, payosAttempt.expires_at);
  const attempt = payOsAttemptEligible ? { id: payosAttempt.payment_attempt_id, provider_reference: payosAttempt.provider_reference } : null;
  if (!attempt) {
    if (order.payment_status === "paid") return insertRejectedPaymentEvent(db, input, order, "unmatched", "order_already_paid");
    return insertRejectedPaymentEvent(db, input, order, "unmatched", "payment_attempt_not_found");
  }
  if (attempt.provider_reference && input.providerReference && attempt.provider_reference !== input.providerReference) {
    return insertRejectedPaymentEvent(db, input, order, "unmatched", "provider_reference_mismatch");
  }
  if (!attempt.provider_reference || input.providerReference !== attempt.provider_reference) {
    return insertRejectedPaymentEvent(db, input, order, "unmatched", "provider_reference_mismatch");
  }
  const now = nowIso();
  const guard = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const eventDedupe = `payment:${input.provider}:${input.providerEventId}`;
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS
        (SELECT 1 FROM shop_orders WHERE id = ? AND payment_status IN ('unpaid', 'pending') AND status NOT IN ('cancelled', 'expired')) THEN 1 ELSE 0 END`).bind(guard, order.id),
      db.prepare(`INSERT INTO shop_payment_events
        (id, provider, provider_event_id, payment_attempt_id, order_id, event_type, transaction_reference, amount_minor, currency, order_reference,
         payload_hash, signature_verified, match_state, processing_state, occurred_at, processed_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'payment.confirmation', ?, ?, ?, ?, ?, 1, 'matched', 'processed', ?, ?, ?)`)
        .bind(eventId, input.provider, input.providerEventId, attempt.id, order.id, input.transactionReference ?? null, input.amountMinor, input.currency, input.orderReference, input.payloadHash, input.occurredAt, now, now),
      db.prepare("UPDATE shop_payment_attempts SET status = 'confirmed', provider_reference = COALESCE(?, provider_reference), confirmed_at = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')").bind(input.providerReference ?? null, now, now, attempt.id),
      db.prepare("UPDATE shop_discounts SET redeemed_count = redeemed_count + 1, updated_at = ? WHERE id IN (SELECT discount_id FROM shop_discount_redemptions WHERE order_id = ? AND status = 'reserved')").bind(now, order.id),
      db.prepare("UPDATE shop_discount_redemptions SET status = 'committed', committed_at = ? WHERE order_id = ? AND status = 'reserved'").bind(now, order.id),
      db.prepare("UPDATE shop_orders SET status = CASE WHEN status = 'pending_payment' THEN 'processing' ELSE status END, payment_status = 'paid', paid_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND payment_status IN ('unpaid', 'pending')").bind(now, now, order.id),
      db.prepare("UPDATE shop_inventory_reservations SET status = 'converted', updated_at = ? WHERE order_id = ? AND status = 'active'").bind(now, order.id),
      db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, event_type, channel, details_json, actor, created_at)
        SELECT ? || ':' || oi.id, oi.order_id, oi.id, 'requested',
          CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic'
            THEN CASE WHEN oi.order_id IN (SELECT id FROM shop_orders WHERE source_channel = 'telegram') THEN 'telegram' ELSE 'web' END
            ELSE 'manual' END,
          '{"source":"payment_confirmation"}', ?, ?
        FROM shop_order_items oi WHERE oi.order_id = ? AND oi.fulfillment_status = 'unfulfilled'`).bind(eventId, typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`, now, order.id),
      db.prepare(`INSERT INTO shop_webhook_outbox (id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, status, available_at, created_at, updated_at)
        SELECT ?, 'shop.order.paid', 'shop_order', ?,
          'telegram_worker',
          ?, ?, 'pending', ?, ?, ?
        FROM shop_orders WHERE id = ? AND source_channel = 'telegram'`)
        .bind(outboxId, order.id, eventDedupe, JSON.stringify({ orderId: order.id, paymentAttemptId: attempt.id, paymentEventId: eventId }), now, now, now, order.id),
      db.prepare(`INSERT OR IGNORE INTO transactional_email_outbox
        (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
        SELECT ?, 'shop.order.payment_confirmed', 'shop_order', id, ?, 'pending', ?, ?, ?
        FROM shop_orders WHERE id = ? AND payment_status = 'paid'`)
        .bind(crypto.randomUUID(), `shop-order-paid:${order.id}`, now, now, now, order.id),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      auditStatement(db, actor, "shop.payment.confirmed", "shop_order", order.id, requestId, { paymentAttemptId: attempt.id, paymentEventId: eventId }),
    ]);
  } catch (error) {
    if (isConflict(error)) {
      const duplicate = await findExistingPaymentEvent(db, input);
      if (duplicate) return replayExistingPaymentEvent(duplicate, input);
      throw new ShopConflictError("payment_reconciliation_conflict");
    }
    throw error;
  }
  return { eventId, orderId: order.id, paymentAttemptId: attempt.id, outcome: "paid" };
}

export async function recordPayOsPaymentAttention(db: D1Database, input: {
  paymentAttemptId: string;
  providerEventId: string;
  transactionReference: string | null;
  amountMinor: number;
  currency: string;
  orderReference: string;
  payloadHash: string;
  matchState: "matched" | "unmatched";
  errorCode: string;
  occurredAt: string;
}) {
  const now = nowIso();
  const result = await db.prepare(`INSERT OR IGNORE INTO shop_payment_events
    (id, provider, provider_event_id, payment_attempt_id, order_id, event_type, transaction_reference,
     amount_minor, currency, order_reference, payload_hash, signature_verified, match_state,
     processing_state, error_code, occurred_at, processed_at, created_at)
    SELECT ?, 'payos', ?, pa.id, pa.order_id, 'payment.attention', ?, ?, ?, ?, ?, 1, ?,
      'accepted', ?, ?, ?, ?
    FROM shop_payment_attempts pa
    WHERE pa.id = ? AND pa.confirmation_provider = 'payos'`)
    .bind(
      crypto.randomUUID(), input.providerEventId, input.transactionReference, input.amountMinor,
      input.currency, input.orderReference, input.payloadHash, input.matchState, input.errorCode,
      input.occurredAt, now, now, input.paymentAttemptId,
    ).run();
  return result.meta.changes === 1;
}

export async function expirePaymentAttempts(db: D1Database, limit = 100) {
  const now = nowIso();
  const rows = await db.prepare(`SELECT id, order_id FROM shop_payment_attempts
    WHERE status IN ('created', 'awaiting_payment')
      AND (
        (confirmation_provider <> 'payos' AND expires_at <= ?)
        OR (
          confirmation_provider = 'payos'
          AND unixepoch(expires_at) + ? <= unixepoch(?)
          AND unixepoch(reconciliation_checked_at) >= unixepoch(expires_at) + ?
        )
      )
    ORDER BY expires_at LIMIT ?`).bind(
      now,
      PAYOS_RECONCILIATION_GRACE_SECONDS,
      now,
      PAYOS_RECONCILIATION_GRACE_SECONDS,
      Math.max(1, Math.min(500, limit)),
    ).all<{ id: string; order_id: string }>();
  if (!rows.results.length) return 0;
  const statements = rows.results.flatMap((row) => [
    db.prepare("UPDATE shop_payment_attempts SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')").bind(now, row.id),
    db.prepare("UPDATE shop_orders SET payment_status = CASE WHEN payment_status = 'pending' THEN 'failed' ELSE payment_status END, updated_at = ? WHERE id = ? AND payment_status = 'pending' AND status = 'pending_payment'").bind(now, row.order_id),
  ]);
  await db.batch(statements);
  return rows.results.length;
}

export async function releaseExpiredReservations(db: D1Database, limit = 100) {
  const now = nowIso();
  const rows = await db.prepare(`SELECT r.id, r.order_id FROM shop_inventory_reservations r
    WHERE r.status = 'active' AND r.expires_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM shop_payment_attempts pa
        WHERE pa.order_id = r.order_id
          AND pa.confirmation_provider = 'payos'
          AND pa.status IN ('created', 'awaiting_payment')
      )
    ORDER BY r.expires_at LIMIT ?`).bind(now, Math.max(1, Math.min(500, limit))).all<{ id: string; order_id: string }>();
  let released = 0;
  for (const row of rows.results) {
    const guard = crypto.randomUUID();
    try {
      const results = await db.batch([
        db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
          SELECT 1 FROM shop_inventory_reservations r
          WHERE r.id = ? AND r.status = 'active' AND r.expires_at <= ?
            AND NOT EXISTS (
              SELECT 1 FROM shop_payment_attempts pa
              WHERE pa.order_id = r.order_id
                AND pa.confirmation_provider = 'payos'
                AND pa.status IN ('created', 'awaiting_payment')
            )
        ) THEN 1 ELSE 0 END`).bind(guard, row.id, now),
        db.prepare("UPDATE shop_inventory_units SET status = 'available', updated_at = ? WHERE id IN (SELECT inventory_unit_id FROM shop_inventory_allocations WHERE reservation_id = ? AND status = 'held') AND status = 'reserved' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, row.id, guard),
        db.prepare(`INSERT INTO shop_inventory_movements
          (id, inventory_unit_id, variant_id, event_type, from_status, to_status, reservation_id, allocation_id, actor, reason_code, details_json, created_at)
          SELECT ? || ':released:' || iu.id, iu.id, iu.variant_id, 'released', 'reserved', 'available', a.reservation_id, a.id,
            'system:inventory-expiry', 'reservation_expired', ?, ?
          FROM shop_inventory_allocations a
          JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
          WHERE a.reservation_id = ? AND a.status = 'held' AND iu.status = 'available'
            AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
          .bind(row.id, JSON.stringify({ orderId: row.order_id }), now, row.id, guard),
        db.prepare("UPDATE shop_inventory_allocations SET status = 'released', released_at = ?, release_reason = 'reservation_expired', updated_at = ? WHERE reservation_id = ? AND status = 'held' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, now, row.id, guard),
        db.prepare("UPDATE shop_inventory_reservations SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, row.id, guard),
        db.prepare("UPDATE shop_discount_redemptions SET status = 'released', released_at = ? WHERE order_id = ? AND status = 'reserved' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, row.order_id, guard),
        db.prepare("UPDATE shop_orders SET status = CASE WHEN payment_status IN ('unpaid', 'pending', 'failed') THEN 'expired' ELSE status END, updated_at = ? WHERE id = ? AND status = 'pending_payment' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, row.order_id, guard),
        db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
      ]);
      // The guard insert is the compare-and-swap. A competing payment can make
      // it fail before any expiry mutation is committed.
      if (results[0]?.meta?.changes !== 1) continue;
      released += 1;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  return released;
}

type OutboxRow = {
  id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  destination: string;
  dedupe_key: string;
  payload_json: string;
  attempt_count: number;
  available_at: string;
};

export async function claimWebhookOutbox(db: D1Database, input: { destination?: string; workerId: string; limit?: number; leaseSeconds?: number }) {
  const now = nowIso();
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const rows = await db.prepare(`SELECT id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, attempt_count, available_at
    FROM shop_webhook_outbox
    WHERE status IN ('pending', 'failed', 'processing') AND available_at <= ?
      AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
      ${input.destination ? "AND destination = ?" : ""}
    ORDER BY available_at, created_at LIMIT ?`).bind(...(input.destination ? [now, now, input.destination, limit] : [now, now, limit])).all<OutboxRow>();
  const claimed: OutboxMessage[] = [];
  const leaseToken = rows.results.length > 0 ? randomOpaqueToken(32) : null;
  const leaseTokenHash = leaseToken ? await sha256Base64Url(leaseToken) : null;
  const leaseSeconds = Math.max(30, Math.min(900, input.leaseSeconds ?? DEFAULT_OUTBOX_LEASE_SECONDS));
  const leaseExpiresAt = new Date(Date.parse(now) + leaseSeconds * 1_000).toISOString();
  for (const row of rows.results) {
    const result = await db.prepare(`UPDATE shop_webhook_outbox
      SET status = 'processing', locked_by = ?, lock_token_hash = ?, lock_expires_at = ?, attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed', 'processing') AND available_at <= ?
        AND (lock_expires_at IS NULL OR lock_expires_at <= ?)`)
      .bind(input.workerId, leaseTokenHash, leaseExpiresAt, now, row.id, now, now).run();
    if (result.meta.changes !== 1) continue;
    claimed.push({ id: row.id, topic: row.topic, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id, destination: row.destination, dedupeKey: row.dedupe_key, payload: parseJson<JsonObject>(row.payload_json, {}), attemptCount: row.attempt_count + 1, availableAt: row.available_at });
  }
  return { messages: claimed, leaseToken: claimed.length > 0 ? leaseToken : null, leaseExpiresAt };
}

export async function markWebhookDelivered(db: D1Database, id: string, workerId: string, leaseToken: string) {
  const now = nowIso();
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const result = await db.prepare(`UPDATE shop_webhook_outbox SET status = 'delivered', delivered_at = ?, locked_by = NULL, lock_token_hash = NULL, lock_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'processing' AND locked_by = ? AND lock_token_hash = ? AND lock_expires_at > ?`).bind(now, now, id, workerId, leaseTokenHash, now).run();
  return result.meta.changes === 1;
}

export async function markWebhookFailed(db: D1Database, id: string, workerId: string, leaseToken: string, errorCode: string, retryAfterSeconds = 60) {
  const now = nowIso();
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const next = new Date(Date.parse(now) + Math.max(5, Math.min(86_400, retryAfterSeconds)) * 1_000).toISOString();
  const result = await db.prepare(`UPDATE shop_webhook_outbox SET status = CASE WHEN attempt_count >= 10 THEN 'dead_letter' ELSE 'failed' END,
      available_at = ?, locked_by = NULL, lock_token_hash = NULL, lock_expires_at = NULL, last_error_code = ?, updated_at = ?
    WHERE id = ? AND status = 'processing' AND locked_by = ? AND lock_token_hash = ? AND lock_expires_at > ?`).bind(next, errorCode.slice(0, 80), now, id, workerId, leaseTokenHash, now).run();
  return result.meta.changes === 1;
}

export type EncryptedFulfillmentDelivery = EncryptedInventoryUnitRow & {
  allocationId: string;
  orderId: string;
  orderItemId: string;
};

export type FulfilledFulfillmentAllocation = EncryptedInventoryUnitRow & {
  allocationId: string;
  orderId: string;
  orderItemId: string;
};

export async function listFulfilledFulfillmentAllocations(db: D1Database, orderId: string) {
  const rows = await db.prepare(`SELECT a.id AS allocation_id, oi.order_id, a.order_item_id,
      iu.id, iu.variant_id AS variantId, iu.status, iu.crypto_version AS cryptoVersion, iu.key_version AS keyVersion,
      iu.ciphertext_b64 AS ciphertextB64, iu.data_iv_b64 AS dataIvB64, iu.wrapped_dek_b64 AS wrappedDekB64,
      iu.wrap_iv_b64 AS wrapIvB64, iu.key_fingerprint AS keyFingerprint
    FROM shop_inventory_allocations a
    JOIN shop_order_items oi ON oi.id = a.order_item_id
    JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
    WHERE oi.order_id = ? AND a.status = 'fulfilled' AND iu.status = 'fulfilled'
    ORDER BY oi.line_number, a.created_at, a.id`).bind(orderId).all<EncryptedInventoryUnitRow & { allocation_id: string; order_id: string; order_item_id: string }>();
  return rows.results.map((row) => ({ ...row, allocationId: row.allocation_id, orderId: row.order_id, orderItemId: row.order_item_id } satisfies FulfilledFulfillmentAllocation));
}

export async function claimFulfillmentAllocation(
  db: D1Database,
  orderItemId: string,
  leaseTokenHash: string,
  leaseSeconds = DEFAULT_OUTBOX_LEASE_SECONDS,
  channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram",
) {
  const now = nowIso();
  const allocation = await db.prepare(`SELECT a.id, oi.order_id, a.order_item_id, a.inventory_unit_id
    FROM shop_inventory_allocations a
    JOIN shop_order_items oi ON oi.id = a.order_item_id
    JOIN shop_orders o ON o.id = oi.order_id
    JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
    WHERE a.order_item_id = ?
      AND (a.status = 'held' OR (a.status = 'delivering' AND a.lease_expires_at <= ?))
      AND iu.status = 'reserved' AND oi.fulfillment_status IN ('unfulfilled', 'processing')
      AND o.payment_status = 'paid' AND o.status IN ('processing', 'fulfilled')
    ORDER BY a.created_at, a.id LIMIT 1`).bind(orderItemId, now).first<{ id: string; order_id: string; order_item_id: string; inventory_unit_id: string }>();
  if (!allocation) return null;
  const leaseExpiresAt = new Date(Date.parse(now) + Math.max(30, Math.min(900, leaseSeconds)) * 1_000).toISOString();
  const guard = crypto.randomUUID();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_inventory_allocations a
        JOIN shop_order_items oi ON oi.id = a.order_item_id
        JOIN shop_orders o ON o.id = oi.order_id
        JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
        WHERE a.id = ? AND (a.status = 'held' OR (a.status = 'delivering' AND a.lease_expires_at <= ?))
          AND iu.status = 'reserved' AND oi.fulfillment_status IN ('unfulfilled', 'processing')
          AND o.payment_status = 'paid' AND o.status IN ('processing', 'fulfilled')
      ) THEN 1 ELSE 0 END`).bind(guard, allocation.id, now),
      db.prepare(`UPDATE shop_inventory_allocations SET status = 'delivering', lease_token_hash = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND (status = 'held' OR (status = 'delivering' AND lease_expires_at <= ?))
          AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(leaseTokenHash, leaseExpiresAt, now, allocation.id, now, guard),
      db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, inventory_unit_id, event_type, channel, details_json, actor, created_at)
        SELECT ?, ?, ?, ?, 'claimed', ?, '{}', 'system:fulfillment', ?
        WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(crypto.randomUUID(), allocation.order_id, allocation.order_item_id, allocation.inventory_unit_id, channel, now, guard),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    ]);
    if (results[0]?.meta?.changes !== 1) return null;
  } catch (error) {
    if (isConflict(error)) return null;
    throw error;
  }
  const row = await db.prepare(`SELECT a.id AS allocation_id, oi.order_id, a.order_item_id, a.lease_expires_at,
      iu.id, iu.variant_id AS variantId, iu.status, iu.crypto_version AS cryptoVersion, iu.key_version AS keyVersion,
      iu.ciphertext_b64 AS ciphertextB64, iu.data_iv_b64 AS dataIvB64, iu.wrapped_dek_b64 AS wrappedDekB64,
      iu.wrap_iv_b64 AS wrapIvB64, iu.key_fingerprint AS keyFingerprint
    FROM shop_inventory_allocations a
    JOIN shop_order_items oi ON oi.id = a.order_item_id
    JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
    WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? AND iu.status = 'reserved' LIMIT 1`).bind(allocation.id, leaseTokenHash).first<EncryptedInventoryUnitRow & { allocation_id: string; order_id: string; order_item_id: string; lease_expires_at: string | null }>();
  return row ? { ...row, allocationId: row.allocation_id, orderId: row.order_id, orderItemId: row.order_item_id } : null;
}

export async function releaseFulfillmentLease(db: D1Database, allocationId: string, leaseTokenHash: string) {
  const now = nowIso();
  const guard = crypto.randomUUID();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_inventory_allocations a
        JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
        WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? AND iu.status = 'reserved'
      ) THEN 1 ELSE 0 END`).bind(guard, allocationId, leaseTokenHash),
      db.prepare("UPDATE shop_inventory_allocations SET status = 'held', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'delivering' AND lease_token_hash = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocationId, leaseTokenHash, guard),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    ]);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("fulfillment_lease_invalid");
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("fulfillment_lease_invalid");
    throw error;
  }
}

export async function quarantineFulfillmentAllocation(
  db: D1Database,
  allocationId: string,
  leaseTokenHash: string,
  actor: ShopActor | string,
  requestId: string,
  channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram",
) {
  const allocation = await db.prepare(`SELECT oi.order_id, a.reservation_id, a.order_item_id, a.inventory_unit_id, iu.variant_id
    FROM shop_inventory_allocations a
    JOIN shop_order_items oi ON oi.id = a.order_item_id
    JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
    WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? LIMIT 1`).bind(allocationId, leaseTokenHash).first<{
      order_id: string;
      reservation_id: string;
      order_item_id: string;
      inventory_unit_id: string;
      variant_id: string;
    }>();
  if (!allocation) throw new ShopConflictError("fulfillment_lease_invalid");
  const replacement = await db.prepare(`SELECT id FROM shop_inventory_units
    WHERE variant_id = ? AND status = 'available' ORDER BY imported_at, id LIMIT 1`).bind(allocation.variant_id).first<{ id: string }>();
  const now = nowIso();
  const guard = crypto.randomUUID();
  const replacementAllocationId = replacement ? crypto.randomUUID() : null;
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
      SELECT 1 FROM shop_inventory_allocations a
      WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ?
        AND EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.id = a.inventory_unit_id AND iu.status = 'reserved')
    ) ${replacement ? "AND EXISTS (SELECT 1 FROM shop_inventory_units WHERE id = ? AND status = 'available')" : ""} THEN 1 ELSE 0 END`)
      .bind(...(replacement ? [guard, allocationId, leaseTokenHash, replacement.id] : [guard, allocationId, leaseTokenHash])),
    db.prepare("UPDATE shop_inventory_allocations SET status = 'released', lease_token_hash = NULL, lease_expires_at = NULL, released_at = ?, release_reason = 'key_integrity_failed', updated_at = ? WHERE id = ? AND status = 'delivering' AND lease_token_hash = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, now, allocationId, leaseTokenHash, guard),
    db.prepare("UPDATE shop_inventory_units SET status = 'quarantined', updated_at = ? WHERE id = ? AND status = 'reserved' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocation.inventory_unit_id, guard),
    db.prepare(`INSERT INTO shop_inventory_movements
      (id, inventory_unit_id, variant_id, event_type, from_status, to_status, reservation_id, allocation_id, actor, reason_code, details_json, created_at)
      SELECT ? || ':quarantined', iu.id, iu.variant_id, 'quarantined', 'reserved', 'quarantined', ?, ?, ?, 'key_integrity_failed', ?, ?
      FROM shop_inventory_units iu
      WHERE iu.id = ? AND iu.status = 'quarantined'
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
      .bind(allocationId, allocation.reservation_id, allocationId, inventoryMovementActor(actor), JSON.stringify({ orderId: allocation.order_id, orderItemId: allocation.order_item_id }), now, allocation.inventory_unit_id, guard),
  ];
  if (replacement && replacementAllocationId) {
    statements.push(
      db.prepare(`INSERT INTO shop_inventory_allocations
        (id, reservation_id, order_item_id, inventory_unit_id, status, created_at, updated_at)
        SELECT ?, ?, ?, ?, 'held', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(replacementAllocationId, allocation.reservation_id, allocation.order_item_id, replacement.id, now, now, guard),
      db.prepare("UPDATE shop_inventory_units SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'available' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, replacement.id, guard),
      db.prepare(`INSERT INTO shop_inventory_movements
        (id, inventory_unit_id, variant_id, event_type, from_status, to_status, reservation_id, allocation_id, actor, reason_code, details_json, created_at)
        SELECT ? || ':reserved', iu.id, iu.variant_id, 'reserved', 'available', 'reserved', ?, ?, ?, 'replacement_after_quarantine', ?, ?
        FROM shop_inventory_units iu
        WHERE iu.id = ? AND iu.status = 'reserved'
          AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(replacementAllocationId, allocation.reservation_id, replacementAllocationId, inventoryMovementActor(actor), JSON.stringify({ orderId: allocation.order_id, orderItemId: allocation.order_item_id, replacesAllocationId: allocationId }), now, replacement.id, guard),
      db.prepare("UPDATE shop_order_items SET fulfillment_status = 'processing', updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocation.order_item_id, guard),
    );
  } else {
    statements.push(db.prepare("UPDATE shop_order_items SET fulfillment_status = 'failed', updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocation.order_item_id, guard));
  }
  statements.push(
    refreshOrderFulfillmentStatement(db, allocation.order_id, now, guard),
    db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, inventory_unit_id, event_type, channel, error_code, details_json, actor, created_at)
      SELECT ?, ?, ?, ?, 'failed', ?, 'key_integrity_failed', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
      .bind(crypto.randomUUID(), allocation.order_id, allocation.order_item_id, allocation.inventory_unit_id, channel, JSON.stringify({ replacementAllocated: Boolean(replacement) }), typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`, now, guard),
    guardedAuditStatement(db, actor, "shop.fulfillment.key_quarantined", "shop_order", allocation.order_id, requestId, guard, { allocationId, replacementAllocated: Boolean(replacement) }),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
  );
  try {
    const results = await db.batch(statements);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("fulfillment_lease_invalid");
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("fulfillment_quarantine_conflict");
    throw error;
  }
  return { orderId: allocation.order_id, orderItemId: allocation.order_item_id, replaced: Boolean(replacement) };
}

export async function markFulfillmentDelivered(db: D1Database, allocationId: string, leaseTokenHash: string, actor: ShopActor | string, requestId: string, channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram") {
  const now = nowIso();
  const allocation = await db.prepare(`SELECT oi.order_id, a.order_item_id, a.inventory_unit_id
    FROM shop_inventory_allocations a JOIN shop_order_items oi ON oi.id = a.order_item_id
    WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? LIMIT 1`).bind(allocationId, leaseTokenHash).first<{ order_id: string; order_item_id: string; inventory_unit_id: string }>();
  if (!allocation) throw new ShopConflictError("fulfillment_lease_invalid");
  const guard = crypto.randomUUID();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_inventory_allocations a
        WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ?
          AND EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.id = a.inventory_unit_id AND iu.status = 'reserved')
      ) THEN 1 ELSE 0 END`).bind(guard, allocationId, leaseTokenHash),
      db.prepare("UPDATE shop_inventory_allocations SET status = 'fulfilled', fulfilled_at = ?, lease_token_hash = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'delivering' AND lease_token_hash = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, now, allocationId, leaseTokenHash, guard),
      db.prepare("UPDATE shop_inventory_units SET status = 'fulfilled', fulfilled_at = ?, updated_at = ? WHERE id = ? AND status = 'reserved' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, now, allocation.inventory_unit_id, guard),
      db.prepare(`INSERT INTO shop_inventory_movements
        (id, inventory_unit_id, variant_id, event_type, from_status, to_status, reservation_id, allocation_id, actor, reason_code, details_json, created_at)
        SELECT ? || ':fulfilled', iu.id, iu.variant_id, 'fulfilled', 'reserved', 'fulfilled', a.reservation_id, a.id, ?, 'order_fulfilled', ?, ?
        FROM shop_inventory_allocations a
        JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
        WHERE a.id = ? AND a.status = 'fulfilled' AND iu.status = 'fulfilled'
          AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(allocationId, inventoryMovementActor(actor), JSON.stringify({ orderId: allocation.order_id, orderItemId: allocation.order_item_id, channel }), now, allocationId, guard),
      db.prepare(`UPDATE shop_order_items SET fulfillment_status = CASE
          WHEN (SELECT COUNT(*) FROM shop_inventory_allocations WHERE order_item_id = ? AND status = 'fulfilled') >= quantity THEN 'fulfilled'
          WHEN EXISTS (SELECT 1 FROM shop_inventory_allocations WHERE order_item_id = ? AND status IN ('held', 'delivering')) THEN 'processing'
          ELSE 'failed'
        END, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(allocation.order_item_id, allocation.order_item_id, now, allocation.order_item_id, guard),
      refreshOrderFulfillmentStatement(db, allocation.order_id, now, guard),
      db.prepare(`INSERT OR IGNORE INTO transactional_email_outbox
        (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
        SELECT ?, 'shop.order.fulfilled', 'shop_order', id, ?, 'pending', ?, ?, ?
        FROM shop_orders WHERE id = ? AND fulfillment_status = 'fulfilled'
          AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(crypto.randomUUID(), `shop-order-fulfilled:${allocation.order_id}`, now, now, now, allocation.order_id, guard),
      db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, inventory_unit_id, event_type, channel, details_json, actor, created_at)
        SELECT ?, ?, ?, ?, 'delivered', ?, '{}', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(crypto.randomUUID(), allocation.order_id, allocation.order_item_id, allocation.inventory_unit_id, channel, typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`, now, guard),
      guardedAuditStatement(db, actor, "shop.fulfillment.delivered", "shop_order", allocation.order_id, requestId, guard, { allocationId }),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    ]);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("fulfillment_lease_invalid");
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("fulfillment_delivery_conflict");
    throw error;
  }
  return { orderId: allocation.order_id, orderItemId: allocation.order_item_id, inventoryUnitId: allocation.inventory_unit_id, deliveredAt: now };
}

export async function markFulfillmentFailed(db: D1Database, allocationId: string, leaseTokenHash: string, errorCode: string, actor: ShopActor | string, requestId: string, channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram") {
  const now = nowIso();
  const allocation = await db.prepare(`SELECT oi.order_id, a.order_item_id, a.inventory_unit_id
    FROM shop_inventory_allocations a JOIN shop_order_items oi ON oi.id = a.order_item_id
    WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? LIMIT 1`).bind(allocationId, leaseTokenHash).first<{ order_id: string; order_item_id: string; inventory_unit_id: string }>();
  if (!allocation) throw new ShopConflictError("fulfillment_lease_invalid");
  const guard = crypto.randomUUID();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_inventory_allocations a
        JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
        WHERE a.id = ? AND a.status = 'delivering' AND a.lease_token_hash = ? AND iu.status = 'reserved'
      ) THEN 1 ELSE 0 END`).bind(guard, allocationId, leaseTokenHash),
      db.prepare("UPDATE shop_inventory_allocations SET status = 'held', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'delivering' AND lease_token_hash = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocationId, leaseTokenHash, guard),
      db.prepare("UPDATE shop_inventory_units SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'reserved' AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, allocation.inventory_unit_id, guard),
      db.prepare(`UPDATE shop_order_items SET fulfillment_status = CASE
          WHEN (SELECT COUNT(*) FROM shop_inventory_allocations WHERE order_item_id = ? AND status = 'fulfilled') >= quantity THEN 'fulfilled'
          WHEN EXISTS (SELECT 1 FROM shop_inventory_allocations WHERE order_item_id = ? AND status IN ('held', 'delivering')) THEN 'processing'
          ELSE 'failed'
        END, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(allocation.order_item_id, allocation.order_item_id, now, allocation.order_item_id, guard),
      refreshOrderFulfillmentStatement(db, allocation.order_id, now, guard),
      db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, inventory_unit_id, event_type, channel, error_code, details_json, actor, created_at)
        SELECT ?, ?, ?, ?, 'failed', ?, ?, '{}', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)`)
        .bind(crypto.randomUUID(), allocation.order_id, allocation.order_item_id, allocation.inventory_unit_id, channel, errorCode.slice(0, 80), typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`, now, guard),
      guardedAuditStatement(db, actor, "shop.fulfillment.failed", "shop_order", allocation.order_id, requestId, guard, { allocationId, errorCode: errorCode.slice(0, 80) }),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    ]);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("fulfillment_lease_invalid");
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("fulfillment_lease_invalid");
    throw error;
  }
  return { orderId: allocation.order_id, orderItemId: allocation.order_item_id, inventoryUnitId: allocation.inventory_unit_id, failedAt: now };
}

/**
 * Admin override when payOS webhooks fail or a bank transfer is verified offline.
 * Replays the same paid-side effects as automatic reconciliation (reservation
 * conversion, discount commit, fulfillment request, email/telegram outbox).
 */
export async function manuallyConfirmOrderPayment(
  db: D1Database,
  orderId: string,
  input: { reason: string },
  actor: ShopActor | string,
  requestId: string,
) {
  const reason = input.reason.trim().slice(0, 500);
  if (reason.length < 5) throw new ShopConflictError("manual_confirm_reason_required");
  const order = await db.prepare(`SELECT id, order_number, order_reference, status, payment_status, currency, total_minor, source_channel
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(orderId).first<{
      id: string;
      order_number: string;
      order_reference: string;
      status: ShopOrderStatus;
      payment_status: ShopPaymentStatus;
      currency: string;
      total_minor: number;
      source_channel: string;
    }>();
  if (!order) throw new ShopNotFoundError();
  if (order.payment_status === "paid") {
    return { orderId: order.id, orderNumber: order.order_number, paymentEventId: null as string | null, outcome: "already_paid" as const };
  }
  if (order.status === "cancelled" || order.status === "expired" || order.status === "refunded") {
    throw new ShopConflictError("order_not_payable");
  }
  if (order.payment_status !== "unpaid" && order.payment_status !== "pending") {
    throw new ShopConflictError("order_payment_not_pending");
  }

  const attempt = await db.prepare(`SELECT id, status FROM shop_payment_attempts
    WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).bind(order.id).first<{ id: string; status: string }>();
  let cryptoAttempt: {
    id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit" | "pay_order";
    asset: "USDT" | "USDC"; network: string; expectedAmountAtomic: string; destinationSnapshot: string;
    status: ShopCryptoAttemptStatus; transactionReference: string | null;
  } | null = null;
  try {
    cryptoAttempt = await db.prepare(`SELECT id, provider, rail, asset, network,
        expected_amount_atomic AS expectedAmountAtomic, destination_snapshot AS destinationSnapshot,
        status, transaction_reference AS transactionReference
      FROM shop_crypto_payment_attempts WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).bind(order.id).first<{
        id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit" | "pay_order";
        asset: "USDT" | "USDC"; network: string; expectedAmountAtomic: string; destinationSnapshot: string;
        status: ShopCryptoAttemptStatus; transactionReference: string | null;
      }>();
  } catch (error) {
    if (!(error instanceof Error) || !/no such table:\s*shop_crypto_payment_attempts/i.test(error.message)) throw error;
  }

  const now = nowIso();
  const eventId = crypto.randomUUID();
  const guard = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const providerEventId = `manual:${order.id}:${requestId}`.slice(0, 120);
  const payloadHash = await sha256Base64Url(`manual-confirm\n${order.id}\n${reason}\n${requestId}`);
  const actorLabel = typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
  const cryptoProviderEventId = `manual:${order.id}:${requestId}`.slice(0, 180);
  let paymentProofsAvailable = true;
  try {
    await db.prepare("SELECT id FROM shop_payment_proofs WHERE order_id = ? LIMIT 1").bind(order.id).first<{ id: string }>();
  } catch (error) {
    if (error instanceof Error && /no such table:\s*shop_payment_proofs/i.test(error.message)) paymentProofsAvailable = false;
    else throw error;
  }

  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO transaction_guards (token, valid) SELECT ?, CASE WHEN EXISTS
        (SELECT 1 FROM shop_orders WHERE id = ? AND payment_status IN ('unpaid', 'pending') AND status NOT IN ('cancelled', 'expired', 'refunded')) THEN 1 ELSE 0 END`).bind(guard, order.id),
      db.prepare(`INSERT INTO shop_payment_events
        (id, provider, provider_event_id, payment_attempt_id, order_id, event_type, transaction_reference, amount_minor, currency, order_reference,
         payload_hash, signature_verified, match_state, processing_state, occurred_at, processed_at, created_at)
        VALUES (?, 'manual', ?, ?, ?, 'payment.confirmation', ?, ?, ?, ?, ?, 1, 'matched', 'processed', ?, ?, ?)`) 
        .bind(eventId, providerEventId, attempt?.id ?? null, order.id, `manual:${reason.slice(0, 80)}`, order.total_minor, order.currency, order.order_reference, payloadHash, now, now, now),
    ];
    if (cryptoAttempt) {
      statements.push(
        db.prepare(`INSERT OR IGNORE INTO shop_crypto_payment_events
          (id, payment_attempt_id, order_id, provider, rail, provider_event_id, transaction_reference,
           asset, network, amount_atomic, destination, status, match_state, evidence_json, evidence_hash,
           occurred_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', 'matched', ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), cryptoAttempt.id, order.id, cryptoAttempt.provider, cryptoAttempt.rail,
            cryptoProviderEventId, cryptoAttempt.transactionReference || `manual:${order.order_reference}`,
            cryptoAttempt.asset, cryptoAttempt.network, cryptoAttempt.expectedAmountAtomic, cryptoAttempt.destinationSnapshot,
            JSON.stringify({ source: "admin_manual_confirmation", reason }), payloadHash, now, now),
        db.prepare(`UPDATE shop_crypto_payment_attempts SET status = 'confirmed', transaction_reference = COALESCE(transaction_reference, ?),
          evidence_json = ?, evidence_hash = ?, confirmed_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('created', 'awaiting_payment', 'detected', 'needs_review')`)
          .bind(cryptoAttempt.transactionReference || `manual:${order.order_reference}`, JSON.stringify({ source: "admin_manual_confirmation", reason }), payloadHash, now, now, cryptoAttempt.id),
      );
    }
    if (attempt && (attempt.status === "created" || attempt.status === "awaiting_payment")) {
      statements.push(db.prepare("UPDATE shop_payment_attempts SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')").bind(now, now, attempt.id));
    }
    if (paymentProofsAvailable) {
      statements.push(db.prepare(`UPDATE shop_payment_proofs SET status = 'reviewed', review_note = ?, reviewed_by = ?, reviewed_at = ?
        WHERE order_id = ? AND status = 'submitted'`).bind(reason, actorLabel, now, order.id));
    }
    statements.push(
      db.prepare("UPDATE shop_discounts SET redeemed_count = redeemed_count + 1, updated_at = ? WHERE id IN (SELECT discount_id FROM shop_discount_redemptions WHERE order_id = ? AND status = 'reserved')").bind(now, order.id),
      db.prepare("UPDATE shop_discount_redemptions SET status = 'committed', committed_at = ? WHERE order_id = ? AND status = 'reserved'").bind(now, order.id),
      db.prepare("UPDATE shop_orders SET status = CASE WHEN status = 'pending_payment' THEN 'processing' ELSE status END, payment_status = 'paid', paid_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND payment_status IN ('unpaid', 'pending') AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ?)").bind(now, now, order.id, guard),
      db.prepare("UPDATE shop_inventory_reservations SET status = 'converted', updated_at = ? WHERE order_id = ? AND status = 'active'").bind(now, order.id),
      db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, event_type, channel, details_json, actor, created_at)
        SELECT ? || ':' || oi.id, oi.order_id, oi.id, 'requested',
          CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic'
            THEN CASE WHEN oi.order_id IN (SELECT id FROM shop_orders WHERE source_channel = 'telegram') THEN 'telegram' ELSE 'web' END
            ELSE 'manual' END,
          ?, ?, ?
        FROM shop_order_items oi WHERE oi.order_id = ? AND oi.fulfillment_status = 'unfulfilled'`)
        .bind(eventId, JSON.stringify({ source: "manual_payment_confirmation", reason }), actorLabel, now, order.id),
      db.prepare(`INSERT INTO shop_webhook_outbox (id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, status, available_at, created_at, updated_at)
        SELECT ?, 'shop.order.paid', 'shop_order', ?, 'telegram_worker', ?, ?, 'pending', ?, ?, ?
        FROM shop_orders WHERE id = ? AND source_channel = 'telegram'`)
        .bind(outboxId, order.id, `payment:manual:${providerEventId}`, JSON.stringify({ orderId: order.id, paymentEventId: eventId, source: "manual" }), now, now, now, order.id),
      db.prepare(`INSERT OR IGNORE INTO transactional_email_outbox
        (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
        SELECT ?, 'shop.order.payment_confirmed', 'shop_order', id, ?, 'pending', ?, ?, ?
        FROM shop_orders WHERE id = ? AND payment_status = 'paid'`)
        .bind(crypto.randomUUID(), `shop-order-paid:${order.id}`, now, now, now, order.id),
      auditStatement(db, actor, "shop.payment.manual_confirmed", "shop_order", order.id, requestId, { paymentEventId: eventId, reason }),
      db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    );
    const results = await db.batch(statements);
    if (results[0]?.meta?.changes !== 1) throw new ShopConflictError("manual_confirm_conflict");
  } catch (error) {
    if (error instanceof ShopConflictError || error instanceof ShopNotFoundError) throw error;
    if (isConflict(error)) throw new ShopConflictError("manual_confirm_conflict");
    throw error;
  }
  return { orderId: order.id, orderNumber: order.order_number, paymentEventId: eventId, outcome: "paid" as const };
}

export async function listShopDiscounts(db: D1Database, limit = 100) {
  const bounded = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.prepare(`SELECT d.id, d.code_normalized AS code, d.status, d.discount_type AS type, d.value,
      d.currency, d.minimum_subtotal_minor AS minimumSubtotalMinor, d.maximum_discount_minor AS maximumDiscountMinor,
      d.maximum_redemptions AS maximumRedemptions, d.maximum_per_customer AS maximumPerCustomer,
      d.redeemed_count AS redeemedCount, d.stackable, d.starts_at AS startsAt, d.ends_at AS endsAt,
      d.metadata_json AS metadataJson, d.version, d.created_at AS createdAt, d.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM shop_discount_targets t WHERE t.discount_id = d.id AND t.target_type = 'product') AS productTargetCount,
      (SELECT COUNT(*) FROM shop_discount_targets t WHERE t.discount_id = d.id AND t.target_type = 'variant') AS variantTargetCount
    FROM shop_discounts d
    WHERE d.deleted_at IS NULL
    ORDER BY d.updated_at DESC, d.id DESC
    LIMIT ?`).bind(bounded).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    ...row,
    stackable: Number(row.stackable) === 1,
    metadata: parseJson<JsonObject>(String(row.metadataJson || "{}"), {}),
    metadataJson: undefined,
  }));
}

export async function getShopDiscount(db: D1Database, discountId: string) {
  const row = await db.prepare(`SELECT id, code_normalized AS code, status, discount_type AS type, value,
      currency, minimum_subtotal_minor AS minimumSubtotalMinor, maximum_discount_minor AS maximumDiscountMinor,
      maximum_redemptions AS maximumRedemptions, maximum_per_customer AS maximumPerCustomer,
      redeemed_count AS redeemedCount, stackable, starts_at AS startsAt, ends_at AS endsAt,
      metadata_json AS metadataJson, version, created_at AS createdAt, updated_at AS updatedAt
    FROM shop_discounts WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(discountId).first<Record<string, unknown>>();
  if (!row) return null;
  const targets = await db.prepare(`SELECT target_type AS targetType, target_id AS targetId
    FROM shop_discount_targets WHERE discount_id = ?`).bind(discountId).all<{ targetType: "product" | "variant"; targetId: string }>();
  return {
    ...row,
    stackable: Number(row.stackable) === 1,
    metadata: parseJson<JsonObject>(String(row.metadataJson || "{}"), {}),
    productIds: targets.results.filter((item) => item.targetType === "product").map((item) => item.targetId),
    variantIds: targets.results.filter((item) => item.targetType === "variant").map((item) => item.targetId),
  };
}

export async function upsertShopDiscount(
  db: D1Database,
  input: DiscountUpsertInput,
  actor: ShopActor | string,
  requestId: string,
  discountId?: string,
) {
  const now = nowIso();
  const actorId = typeof actor === "string" ? actor : actor.id;
  const code = normalizeDiscountCode(input.code);
  const id = discountId || crypto.randomUUID();
  const existing = discountId
    ? await db.prepare("SELECT id, version FROM shop_discounts WHERE id = ? AND deleted_at IS NULL LIMIT 1").bind(discountId).first<{ id: string; version: number }>()
    : null;
  if (discountId && !existing) throw new ShopNotFoundError();

  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(db.prepare(`UPDATE shop_discounts SET
      code_normalized = ?, status = ?, discount_type = ?, value = ?, currency = ?,
      minimum_subtotal_minor = ?, maximum_discount_minor = ?, maximum_redemptions = ?, maximum_per_customer = ?,
      stackable = ?, starts_at = ?, ends_at = ?, metadata_json = ?, version = version + 1,
      updated_by = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
      .bind(
        code, input.status, input.type, input.value, input.currency ?? null,
        input.minimumSubtotalMinor ?? 0, input.maximumDiscountMinor ?? null, input.maximumRedemptions ?? null, input.maximumPerCustomer ?? null,
        input.stackable ? 1 : 0, input.startsAt ?? null, input.endsAt ?? null, JSON.stringify(input.metadata ?? {}),
        actorId, now, id,
      ));
    statements.push(db.prepare("DELETE FROM shop_discount_targets WHERE discount_id = ?").bind(id));
  } else {
    statements.push(db.prepare(`INSERT INTO shop_discounts
      (id, code_normalized, status, discount_type, value, currency, minimum_subtotal_minor, maximum_discount_minor,
       maximum_redemptions, maximum_per_customer, redeemed_count, stackable, starts_at, ends_at, metadata_json,
       version, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(
        id, code, input.status, input.type, input.value, input.currency ?? null,
        input.minimumSubtotalMinor ?? 0, input.maximumDiscountMinor ?? null, input.maximumRedemptions ?? null, input.maximumPerCustomer ?? null,
        input.stackable ? 1 : 0, input.startsAt ?? null, input.endsAt ?? null, JSON.stringify(input.metadata ?? {}),
        actorId, actorId, now, now,
      ));
  }
  for (const productId of input.productIds ?? []) {
    statements.push(db.prepare("INSERT INTO shop_discount_targets (discount_id, target_type, target_id) VALUES (?, 'product', ?)").bind(id, productId));
  }
  for (const variantId of input.variantIds ?? []) {
    statements.push(db.prepare("INSERT INTO shop_discount_targets (discount_id, target_type, target_id) VALUES (?, 'variant', ?)").bind(id, variantId));
  }
  statements.push(auditStatement(db, actor, existing ? "shop.discount.updated" : "shop.discount.created", "shop_discount", id, requestId, {
    code, status: input.status, type: input.type, value: input.value,
  }));
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConflict(error)) throw new ShopConflictError("discount_code_conflict");
    throw error;
  }
  return getShopDiscount(db, id);
}

export async function archiveShopDiscount(db: D1Database, discountId: string, actor: ShopActor | string, requestId: string) {
  const now = nowIso();
  const actorId = typeof actor === "string" ? actor : actor.id;
  const result = await db.batch([
    db.prepare(`UPDATE shop_discounts SET status = 'archived', deleted_at = ?, updated_by = ?, updated_at = ?, version = version + 1
      WHERE id = ? AND deleted_at IS NULL`).bind(now, actorId, now, discountId),
    auditStatement(db, actor, "shop.discount.archived", "shop_discount", discountId, requestId, {}),
  ]);
  if (result[0]?.meta?.changes !== 1) throw new ShopNotFoundError();
  return { id: discountId, status: "archived" as const };
}
