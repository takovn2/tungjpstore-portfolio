import {
  SHOP_DELIVERY_MODES,
  SHOP_FULFILLMENT_TYPES,
  SHOP_LOCALES,
  SHOP_PRODUCT_TYPES,
  SHOP_CRYPTO_NETWORKS,
  SHOP_SOURCE_CHANNELS,
  type CreateCheckoutInput,
  type DiscountUpsertInput,
  type InventoryImportInput,
  type InventoryImportChunkInput,
  type InventoryImportPreviewInput,
  type InventoryImportSourceFormat,
  type JsonObject,
  type JsonValue,
  type PaymentAttemptInput,
  type PaymentConfirmationInput,
  type PaymentProviderConfigInput,
  type ShopCryptoPaymentMethodInput,
  type ProductLocalizationInput,
  type ProductMediaInput,
  type ProductUpsertInput,
  type ProductVariantInput,
  type ShopCategoryInput,
  type ShopLocale,
  type ValidationIssue,
  type ValidationResult,
  type VariantLocalizationInput,
} from "./types";

const localeSet = new Set<string>(SHOP_LOCALES);
const productTypeSet = new Set<string>(SHOP_PRODUCT_TYPES);
const fulfillmentTypeSet = new Set<string>(SHOP_FULFILLMENT_TYPES);
const deliveryModeSet = new Set<string>(SHOP_DELIVERY_MODES);
const sourceChannelSet = new Set<string>(SHOP_SOURCE_CHANNELS);
const cryptoNetworkAliases = new Map([
  ["ERC20", "ETHEREUM"], ["ETH", "ETHEREUM"], ["ETHEREUM", "ETHEREUM"],
  ["BEP20", "BSC"], ["BEP-20", "BSC"], ["BSC", "BSC"], ["BNB", "BSC"],
  ["SOL", "SOLANA"], ["SOLANA", "SOLANA"],
  ["POLYGON", "POLYGON"], ["MATIC", "POLYGON"],
  ["TRC20", "TRON"], ["TRON", "TRON"],
]);
const cryptoNetworkSet = new Set<string>(SHOP_CRYPTO_NETWORKS);
const DISCOUNT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,99}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) => {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
};

function text(value: unknown, min: number, max: number, trim = true): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  const parsed = trim ? value.trim() : value;
  if (parsed.length < min || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(parsed)) return null;
  return parsed;
}

function optionValueText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return text(String(value), 1, 180);
  if (typeof value === "boolean") return text(String(value), 1, 180);
  return text(value, 1, 180);
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, 1, max);
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function booleanOr(value: unknown, fallback: boolean): boolean | null {
  return value === undefined ? fallback : typeof value === "boolean" ? value : null;
}

function timestamp(value: unknown): string | null {
  const parsed = text(value, 20, 40);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}T/.test(parsed) || !parsed.endsWith("Z")) return null;
  return Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

export function normalizeShopEmail(value: string) {
  return value.trim().toLowerCase();
}

// Telegram-native customers use this synthetic mailbox internally. It must
// never be claimable through the public web checkout before identity proof.
export function isTelegramSyntheticEmail(value: string) {
  return /^tg[0-9]+@telegram\.tungjpstore\.local$/.test(normalizeShopEmail(value));
}

export function maskShopEmail(value: string) {
  const normalized = normalizeShopEmail(value);
  const at = normalized.lastIndexOf("@");
  if (at < 1) return "***";
  const local = normalized.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${normalized.slice(at)}`;
}

export function normalizeDiscountCode(value: string) {
  return value.trim().toUpperCase();
}

function parsedDiscountCode(value: unknown): string | null | undefined {
  const parsed = optionalText(value, 100);
  if (parsed === undefined || parsed === null) return parsed;
  const normalized = normalizeDiscountCode(parsed);
  return DISCOUNT_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeInventoryKey(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
}

function currency(value: unknown): string | null {
  const parsed = text(value, 3, 3);
  return parsed && /^[A-Za-z]{3}$/.test(parsed) ? normalizeCurrency(parsed) : null;
}

function id(value: unknown): string | null {
  const parsed = text(value, 1, 100);
  return parsed && /^[A-Za-z0-9_-]+$/.test(parsed) ? parsed : null;
}

function safeAssetUrl(value: unknown): string | null {
  const parsed = text(value, 1, 2_000);
  if (!parsed || parsed.includes("\\") || /[\u0000-\u001f\u007f]/.test(parsed)) return null;
  if (/^\/(?!\/)/.test(parsed)) return parsed;
  if (!/^https:\/\//i.test(parsed)) return null;
  try {
    const url = new URL(parsed);
    return !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseJsonValue(value: unknown, depth = 0): JsonValue | null {
  if (depth > 5) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    if (value.length > 50) return null;
    const parsed = value.map((item) => parseJsonValue(item, depth + 1));
    return parsed.some((item, index) => item === null && value[index] !== null) ? null : parsed as JsonValue[];
  }
  if (!isRecord(value) || Object.keys(value).length > 50) return null;
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) return null;
    const parsed = parseJsonValue(item, depth + 1);
    if (parsed === null && item !== null) return null;
    result[key] = parsed;
  }
  return result;
}

function jsonObject(value: unknown, fallback: JsonObject = {}): JsonObject | null {
  if (value === undefined) return fallback;
  const parsed = parseJsonValue(value);
  return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed as JsonObject : null;
}

function add(issues: ValidationIssue[], path: string, code: string) {
  issues.push({ path, code });
}

function parseProductLocalization(value: unknown, path: string, issues: ValidationIssue[]): ProductLocalizationInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["title", "eyebrow", "shortDescription", "description", "seoTitle", "seoDescription"])) {
    add(issues, path, "invalid_localization");
    return null;
  }
  const title = text(value.title, 1, 180);
  const eyebrow = optionalText(value.eyebrow, 120);
  const shortDescription = text(value.shortDescription, 1, 500);
  const description = text(value.description, 1, 20_000);
  const seoTitle = text(value.seoTitle, 1, 180);
  const seoDescription = text(value.seoDescription, 1, 320);
  if (!title || !shortDescription || !description || !seoTitle || !seoDescription) {
    add(issues, path, "localization_fields_required");
    return null;
  }
  return { title, ...(eyebrow ? { eyebrow } : {}), shortDescription, description, seoTitle, seoDescription };
}

function parseVariantLocalization(value: unknown, path: string, issues: ValidationIssue[]): VariantLocalizationInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["title", "optionSummary"])) {
    add(issues, path, "invalid_variant_localization");
    return null;
  }
  const title = text(value.title, 1, 180);
  const optionSummary = optionalText(value.optionSummary, 300);
  if (!title) {
    add(issues, `${path}.title`, "required");
    return null;
  }
  return { title, ...(optionSummary ? { optionSummary } : {}) };
}

function parseLocalizedRecord<T>(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  parser: (entry: unknown, entryPath: string, entryIssues: ValidationIssue[]) => T | null,
) {
  if (!isRecord(value)) {
    add(issues, path, "invalid_localizations");
    return null;
  }
  const result: Partial<Record<ShopLocale, T>> = {};
  for (const [locale, entry] of Object.entries(value)) {
    if (!localeSet.has(locale)) {
      add(issues, `${path}.${locale}`, "unsupported_locale");
      continue;
    }
    const parsed = parser(entry, `${path}.${locale}`, issues);
    if (parsed) result[locale as ShopLocale] = parsed;
  }
  return result;
}

function parseVariant(value: unknown, path: string, issues: ValidationIssue[]): ProductVariantInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "id", "sku", "status", "fulfillmentType", "deliveryMode", "inventoryPolicy", "priceMinor",
    "compareAtMinor", "currency", "lowStockThreshold", "maxPerOrder", "optionValues", "metadata", "localizations",
  ])) {
    add(issues, path, "invalid_variant");
    return null;
  }
  const parsedId = value.id === undefined ? undefined : id(value.id);
  const sku = text(value.sku, 1, 100)?.toUpperCase() ?? null;
  const status = value.status === "draft" || value.status === "active" || value.status === "archived" ? value.status : null;
  const fulfillmentType = typeof value.fulfillmentType === "string" && fulfillmentTypeSet.has(value.fulfillmentType)
    ? value.fulfillmentType as ProductVariantInput["fulfillmentType"] : null;
  const deliveryMode = typeof value.deliveryMode === "string" && deliveryModeSet.has(value.deliveryMode)
    ? value.deliveryMode as ProductVariantInput["deliveryMode"] : null;
  const inventoryPolicy = value.inventoryPolicy === "tracked" || value.inventoryPolicy === "unlimited" ? value.inventoryPolicy : null;
  const priceMinor = integer(value.priceMinor, 0, 9_000_000_000_000);
  const compareAtMinor = value.compareAtMinor === undefined || value.compareAtMinor === null
    ? null : integer(value.compareAtMinor, 0, 9_000_000_000_000);
  const parsedCurrency = currency(value.currency);
  const lowStockThreshold = value.lowStockThreshold === undefined ? 3 : integer(value.lowStockThreshold, 0, 1_000_000);
  const maxPerOrder = value.maxPerOrder === undefined ? 10 : integer(value.maxPerOrder, 1, 1_000);
  const optionValues = value.optionValues === undefined ? {} : isRecord(value.optionValues)
    ? Object.fromEntries(Object.entries(value.optionValues).map(([key, raw]) => [key, optionValueText(raw)])) : null;
  const metadata = jsonObject(value.metadata);
  const localizations = parseLocalizedRecord(value.localizations, `${path}.localizations`, issues, parseVariantLocalization);
  if ((value.id !== undefined && !parsedId) || !sku || !/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(sku) || !status || !fulfillmentType || !deliveryMode || !inventoryPolicy || priceMinor === null || !parsedCurrency || lowStockThreshold === null || maxPerOrder === null || !optionValues || Object.values(optionValues).some((item) => item === null) || !metadata || !localizations) {
    add(issues, path, "invalid_variant_fields");
    return null;
  }
  if (compareAtMinor !== null && compareAtMinor < priceMinor) add(issues, `${path}.compareAtMinor`, "must_not_be_lower_than_price");
  if (parsedCurrency && parsedCurrency !== "VND") add(issues, `${path}.currency`, "shop_source_price_must_be_vnd");
  if (inventoryPolicy === "unlimited" && fulfillmentType === "license_key") add(issues, `${path}.inventoryPolicy`, "license_keys_must_be_tracked");
  if (deliveryMode === "automatic" && fulfillmentType === "manual") add(issues, `${path}.deliveryMode`, "manual_fulfillment_cannot_be_automatic");
  if (!localizations.vi) add(issues, `${path}.localizations.vi`, "required");
  return {
    ...(parsedId ? { id: parsedId } : {}), sku, status, fulfillmentType, deliveryMode, inventoryPolicy,
    priceMinor, compareAtMinor, currency: parsedCurrency, lowStockThreshold, maxPerOrder,
    optionValues: optionValues as Record<string, string>, metadata, localizations,
  };
}

function parseMedia(value: unknown, path: string, issues: ValidationIssue[]): ProductMediaInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "variantId", "mediaId", "type", "url", "alt", "sortOrder"])) {
    add(issues, path, "invalid_media");
    return null;
  }
  const parsedId = value.id === undefined ? undefined : id(value.id);
  const variantId = value.variantId === undefined || value.variantId === null ? null : id(value.variantId);
  const mediaId = value.mediaId === undefined || value.mediaId === null ? null : id(value.mediaId);
  const type = value.type === "image" || value.type === "video" ? value.type : null;
  const url = safeAssetUrl(value.url);
  const alt = text(value.alt, 0, 300);
  const sortOrder = value.sortOrder === undefined ? 0 : integer(value.sortOrder, -100_000, 100_000);
  if ((value.id !== undefined && !parsedId) || (value.variantId != null && !variantId) || (value.mediaId != null && !mediaId) || !type || !url || alt === null || sortOrder === null) {
    add(issues, path, "invalid_media_fields");
    return null;
  }
  return { ...(parsedId ? { id: parsedId } : {}), variantId, mediaId, type, url, alt, sortOrder };
}

export function validateProductUpsertInput(value: unknown): ValidationResult<ProductUpsertInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value) || !hasOnlyKeys(value, ["slug", "status", "productType", "featured", "sortOrder", "defaultLocale", "coverMediaId", "metadata", "localizations", "variants", "media"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_product" }] };
  }
  const slug = text(value.slug, 1, 120);
  const status = value.status === "draft" || value.status === "active" || value.status === "archived" ? value.status : null;
  const productType = typeof value.productType === "string" && productTypeSet.has(value.productType)
    ? value.productType as ProductUpsertInput["productType"] : null;
  const featured = booleanOr(value.featured, false);
  const sortOrder = value.sortOrder === undefined ? 0 : integer(value.sortOrder, -100_000, 100_000);
  const defaultLocale = value.defaultLocale === undefined ? "vi" : typeof value.defaultLocale === "string" && localeSet.has(value.defaultLocale)
    ? value.defaultLocale as ShopLocale : null;
  const coverMediaId = value.coverMediaId === undefined || value.coverMediaId === null ? null : id(value.coverMediaId);
  const metadata = jsonObject(value.metadata);
  const localizations = parseLocalizedRecord(value.localizations, "localizations", issues, parseProductLocalization);
  const variants = Array.isArray(value.variants) && value.variants.length > 0 && value.variants.length <= 50
    ? value.variants.map((entry, index) => parseVariant(entry, `variants.${index}`, issues)) : null;
  const media = value.media === undefined ? [] : Array.isArray(value.media) && value.media.length <= 50
    ? value.media.map((entry, index) => parseMedia(entry, `media.${index}`, issues)) : null;
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) add(issues, "slug", "invalid_slug");
  if (!status) add(issues, "status", "invalid_status");
  if (!productType) add(issues, "productType", "invalid_product_type");
  if (featured === null) add(issues, "featured", "invalid_boolean");
  if (sortOrder === null) add(issues, "sortOrder", "invalid_integer");
  if (!defaultLocale) add(issues, "defaultLocale", "unsupported_locale");
  if (value.coverMediaId != null && !coverMediaId) add(issues, "coverMediaId", "invalid_id");
  if (!metadata) add(issues, "metadata", "invalid_json_object");
  if (!localizations?.vi) add(issues, "localizations.vi", "required");
  if (!variants) add(issues, "variants", "one_to_fifty_required");
  if (!media) add(issues, "media", "invalid_media_list");
  const parsedVariants = variants?.filter((entry): entry is ProductVariantInput => Boolean(entry)) ?? [];
  const parsedMedia = media?.filter((entry): entry is ProductMediaInput => Boolean(entry)) ?? [];
  if (status === "active") {
    for (const locale of SHOP_LOCALES) if (!localizations?.[locale]) add(issues, `localizations.${locale}`, "required_for_active_product");
    for (const [index, variant] of parsedVariants.entries()) {
      if (variant.status === "active") for (const locale of SHOP_LOCALES) if (!variant.localizations[locale]) add(issues, `variants.${index}.localizations.${locale}`, "required_for_active_variant");
    }
  }
  if (new Set(parsedVariants.map((variant) => variant.sku)).size !== parsedVariants.length) add(issues, "variants", "duplicate_sku");
  const currencies = new Set(parsedVariants.map((variant) => variant.currency));
  if (currencies.size > 1) add(issues, "variants", "mixed_currency_not_supported");
  // Product type is a business invariant, not a UI convention. Keep the
  // fulfillment and stock model aligned even when callers bypass the editor.
  for (const [index, variant] of parsedVariants.entries()) {
    const path = `variants.${index}`;
    if (productType === "digital_key") {
      if (variant.fulfillmentType !== "license_key") add(issues, `${path}.fulfillmentType`, "digital_key_requires_license_key");
      if (variant.inventoryPolicy !== "tracked") add(issues, `${path}.inventoryPolicy`, "digital_key_requires_tracked_inventory");
    } else if (productType === "digital_download") {
      if (variant.fulfillmentType !== "download") add(issues, `${path}.fulfillmentType`, "digital_download_requires_download");
      if (variant.deliveryMode !== "manual") add(issues, `${path}.deliveryMode`, "digital_download_requires_manual_delivery");
      if (variant.inventoryPolicy !== "unlimited") add(issues, `${path}.inventoryPolicy`, "digital_download_requires_unlimited_inventory");
    } else if (productType === "service") {
      if (variant.fulfillmentType !== "manual") add(issues, `${path}.fulfillmentType`, "service_requires_manual_fulfillment");
      if (variant.deliveryMode !== "manual") add(issues, `${path}.deliveryMode`, "service_requires_manual_delivery");
      if (variant.inventoryPolicy !== "unlimited") add(issues, `${path}.inventoryPolicy`, "service_requires_unlimited_inventory");
    }
  }
  if (status === "active" && !parsedVariants.some((variant) => variant.status === "active")) {
    add(issues, "variants", "active_product_requires_active_variant");
  }
  const variantIds = new Set(parsedVariants.flatMap((variant) => variant.id ? [variant.id] : []));
  for (const [index, entry] of parsedMedia.entries()) if (entry.variantId && !variantIds.has(entry.variantId)) add(issues, `media.${index}.variantId`, "variant_not_in_payload");
  if (issues.length || !slug || !status || !productType || featured === null || sortOrder === null || !defaultLocale || !metadata || !localizations || !variants || !media) return { ok: false, issues };
  return { ok: true, value: { slug, status, productType, featured, sortOrder, defaultLocale, coverMediaId, metadata, localizations, variants: parsedVariants, media: parsedMedia } };
}

function parseCategoryLocalization(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value) || !hasOnlyKeys(value, ["title", "description"])) {
    add(issues, path, "invalid_category_localization");
    return null;
  }
  const title = text(value.title, 1, 120);
  const description = optionalText(value.description, 500);
  if (!title) {
    add(issues, `${path}.title`, "required");
    return null;
  }
  return { title, ...(description ? { description } : {}) };
}

export function validateShopCategoryInput(value: unknown): ValidationResult<ShopCategoryInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value) || !hasOnlyKeys(value, ["slug", "status", "sortOrder", "defaultLocale", "localizations"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_category" }] };
  }
  const slug = text(value.slug, 1, 80)?.toLowerCase() ?? null;
  const status = value.status === "active" || value.status === "archived" ? value.status : null;
  const sortOrder = value.sortOrder === undefined ? 0 : integer(value.sortOrder, -100_000, 100_000);
  const defaultLocale = value.defaultLocale === undefined ? "vi" : typeof value.defaultLocale === "string" && localeSet.has(value.defaultLocale)
    ? value.defaultLocale as ShopLocale : null;
  const localizations = parseLocalizedRecord(value.localizations, "localizations", issues, parseCategoryLocalization);
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) add(issues, "slug", "invalid_slug");
  if (!status) add(issues, "status", "invalid_status");
  if (sortOrder === null) add(issues, "sortOrder", "invalid_integer");
  if (!defaultLocale) add(issues, "defaultLocale", "unsupported_locale");
  if (!localizations?.vi) add(issues, "localizations.vi", "required");
  if (issues.length || !slug || !status || sortOrder === null || !defaultLocale || !localizations) return { ok: false, issues };
  return { ok: true, value: { slug, status, sortOrder, defaultLocale, localizations } };
}

export function validateInventoryImportInput(value: unknown): ValidationResult<InventoryImportInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["variantId", "keys"])) return { ok: false, issues: [{ path: "$", code: "invalid_inventory_import" }] };
  const variantId = id(value.variantId);
  const keys = Array.isArray(value.keys) && value.keys.length > 0 && value.keys.length <= 25
    ? value.keys.map((entry) => typeof entry === "string" && entry.length <= 4_096 ? normalizeInventoryKey(entry) : null) : null;
  const issues: ValidationIssue[] = [];
  if (!variantId) add(issues, "variantId", "invalid_id");
  if (!keys || keys.some((entry) => entry === null)) add(issues, "keys", "one_to_twenty_five_keys_required");
  if (keys && new Set(keys).size !== keys.length) add(issues, "keys", "duplicate_key_in_batch");
  return issues.length || !variantId || !keys ? { ok: false, issues } : { ok: true, value: { variantId, keys: keys as string[] } };
}

function inventoryRows(value: unknown, maxRows: number) {
  return Array.isArray(value) && value.length > 0 && value.length <= maxRows && value.every((entry) => typeof entry === "string" && entry.length <= 4_096)
    ? value as string[]
    : null;
}

function inventorySourceFormat(value: unknown): InventoryImportSourceFormat | null {
  return value === "json" || value === "csv" || value === "txt" ? value : null;
}

export function validateInventoryImportPreviewInput(value: unknown): ValidationResult<InventoryImportPreviewInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["variantId", "rows", "sourceFormat", "sourceName", "sourceHash", "idempotencyKey"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_inventory_preview" }] };
  }
  const issues: ValidationIssue[] = [];
  const variantId = id(value.variantId);
  const rows = inventoryRows(value.rows, 500);
  const sourceFormat = inventorySourceFormat(value.sourceFormat);
  const sourceName = value.sourceName === undefined || value.sourceName === null || value.sourceName === "" ? undefined : text(value.sourceName, 1, 240);
  const sourceHash = value.sourceHash === undefined || value.sourceHash === null || value.sourceHash === "" ? undefined : text(value.sourceHash, 43, 64);
  const idempotencyKey = text(value.idempotencyKey, 20, 200);
  if (!variantId) add(issues, "variantId", "invalid_id");
  if (!rows) add(issues, "rows", "one_to_five_hundred_rows_required");
  if (!sourceFormat) add(issues, "sourceFormat", "invalid_source_format");
  if (value.sourceName != null && value.sourceName !== "" && !sourceName) add(issues, "sourceName", "invalid_source_name");
  if (value.sourceHash != null && value.sourceHash !== "" && (!sourceHash || !/^(?:[A-Za-z0-9_-]{43}|[A-Fa-f0-9]{64})$/.test(sourceHash))) add(issues, "sourceHash", "invalid_sha256");
  if (!idempotencyKey) add(issues, "idempotencyKey", "idempotency_key_required");
  if (rows && rows.reduce((total, row) => total + row.length, 0) > 512_000) add(issues, "rows", "preview_payload_too_large");
  if (issues.length || !variantId || !rows || !sourceFormat || !idempotencyKey) return { ok: false, issues };
  return { ok: true, value: {
    variantId,
    rows,
    sourceFormat,
    ...(sourceName ? { sourceName } : {}),
    ...(sourceHash ? { sourceHash } : {}),
    idempotencyKey,
  } };
}

export function validateInventoryImportChunkInput(value: unknown): ValidationResult<InventoryImportChunkInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["batchId", "chunkIndex", "rows"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_inventory_chunk" }] };
  }
  const issues: ValidationIssue[] = [];
  const batchId = id(value.batchId);
  const chunkIndex = integer(value.chunkIndex, 0, 19);
  const rows = Array.isArray(value.rows) && value.rows.length > 0 && value.rows.length <= 25 ? value.rows.map((entry, index) => {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["lineNumber", "key"])) {
      add(issues, `rows.${index}`, "invalid_row");
      return null;
    }
    const lineNumber = integer(entry.lineNumber, 1, 500);
    const key = typeof entry.key === "string" && entry.key.length <= 4_096 ? normalizeInventoryKey(entry.key) : null;
    if (lineNumber === null || key === null) add(issues, `rows.${index}`, "invalid_row_fields");
    return lineNumber === null || key === null ? null : { lineNumber, key };
  }) : null;
  if (!batchId) add(issues, "batchId", "invalid_id");
  if (chunkIndex === null) add(issues, "chunkIndex", "invalid_chunk_index");
  if (!rows) add(issues, "rows", "one_to_twenty_five_rows_required");
  const parsedRows = rows?.filter((entry): entry is { lineNumber: number; key: string } => Boolean(entry)) ?? [];
  if (new Set(parsedRows.map((entry) => entry.lineNumber)).size !== parsedRows.length) add(issues, "rows", "duplicate_line_number");
  if (issues.length || !batchId || chunkIndex === null || !rows) return { ok: false, issues };
  return { ok: true, value: { batchId, chunkIndex, rows: parsedRows } };
}

export type CheckoutQuoteInput = {
  items: Array<{ variantId: string; quantity: number }>;
  locale: ShopLocale;
  discountCode?: string;
};

export function validateCheckoutQuoteInput(value: unknown): ValidationResult<CheckoutQuoteInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["items", "locale", "discountCode"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_quote" }] };
  }
  const issues: ValidationIssue[] = [];
  const locale = typeof value.locale === "string" && localeSet.has(value.locale) ? value.locale as ShopLocale : null;
  const discountCode = parsedDiscountCode(value.discountCode);
  const items = Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 20
    ? value.items.map((entry, index) => {
      if (!isRecord(entry) || !hasOnlyKeys(entry, ["variantId", "quantity"])) {
        add(issues, `items.${index}`, "invalid_item");
        return null;
      }
      const variantId = id(entry.variantId);
      const quantity = integer(entry.quantity, 1, 1_000);
      if (!variantId || quantity === null) {
        add(issues, `items.${index}`, "invalid_item_fields");
        return null;
      }
      return { variantId, quantity };
    })
    : null;
  if (!locale) add(issues, "locale", "unsupported_locale");
  if (!items) add(issues, "items", "one_to_twenty_required");
  if (value.discountCode !== undefined && value.discountCode !== null && value.discountCode !== "" && !discountCode) {
    add(issues, "discountCode", "invalid_code");
  }
  const parsedItems = items?.filter((entry): entry is { variantId: string; quantity: number } => Boolean(entry)) ?? [];
  if (new Set(parsedItems.map((entry) => entry.variantId)).size !== parsedItems.length) add(issues, "items", "duplicate_variant");
  if (issues.length || !locale || !items) return { ok: false, issues };
  return {
    ok: true,
    value: {
      items: parsedItems,
      locale,
      ...(discountCode ? { discountCode } : {}),
    },
  };
}

export function validateCreateCheckoutInput(value: unknown): ValidationResult<CreateCheckoutInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["customer", "items", "locale", "sourceChannel", "externalReference", "discountCode", "paymentMethodId"]) || !isRecord(value.customer)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_checkout" }] };
  }
  const issues: ValidationIssue[] = [];
  const customer = value.customer;
  if (!hasOnlyKeys(customer, ["email", "displayName", "phone", "locale", "marketingConsent", "telegramSubject"])) add(issues, "customer", "unknown_field");
  const email = text(customer.email, 3, 320)?.toLowerCase() ?? null;
  const displayName = text(customer.displayName, 1, 180);
  const phone = optionalText(customer.phone, 40);
  const customerLocale = customer.locale === undefined ? undefined : typeof customer.locale === "string" && localeSet.has(customer.locale) ? customer.locale as ShopLocale : null;
  const marketingConsent = booleanOr(customer.marketingConsent, false);
  const telegramSubject = optionalText(customer.telegramSubject, 100);
  const locale = value.locale === undefined ? customerLocale ?? "vi" : typeof value.locale === "string" && localeSet.has(value.locale) ? value.locale as ShopLocale : null;
  const sourceChannel = value.sourceChannel === undefined ? "web" : typeof value.sourceChannel === "string" && sourceChannelSet.has(value.sourceChannel) ? value.sourceChannel as CreateCheckoutInput["sourceChannel"] : null;
  const externalReference = optionalText(value.externalReference, 180);
  const discountCode = parsedDiscountCode(value.discountCode);
  const paymentMethodId = value.paymentMethodId === undefined || value.paymentMethodId === null || value.paymentMethodId === ""
    ? undefined
    : id(value.paymentMethodId);
  const items = Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 20
    ? value.items.map((entry, index) => {
      if (!isRecord(entry) || !hasOnlyKeys(entry, ["variantId", "quantity"])) {
        add(issues, `items.${index}`, "invalid_item");
        return null;
      }
      const variantId = id(entry.variantId);
      const quantity = integer(entry.quantity, 1, 1_000);
      if (!variantId || quantity === null) {
        add(issues, `items.${index}`, "invalid_item_fields");
        return null;
      }
      return { variantId, quantity };
    }) : null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add(issues, "customer.email", "invalid_email");
  if (sourceChannel === "web" && email && isTelegramSyntheticEmail(email)) add(issues, "customer.email", "reserved_identity_email");
  if (!displayName) add(issues, "customer.displayName", "required");
  if (customer.locale !== undefined && !customerLocale) add(issues, "customer.locale", "unsupported_locale");
  if (marketingConsent === null) add(issues, "customer.marketingConsent", "invalid_boolean");
  if (!locale) add(issues, "locale", "unsupported_locale");
  if (!sourceChannel) add(issues, "sourceChannel", "invalid_channel");
  if (!items) add(issues, "items", "one_to_twenty_required");
  if (value.discountCode !== undefined && value.discountCode !== null && value.discountCode !== "" && !discountCode) {
    add(issues, "discountCode", "invalid_code");
  }
  if (value.paymentMethodId !== undefined && value.paymentMethodId !== null && value.paymentMethodId !== "" && !paymentMethodId) {
    add(issues, "paymentMethodId", "invalid_id");
  }
  const parsedItems = items?.filter((entry): entry is { variantId: string; quantity: number } => Boolean(entry)) ?? [];
  if (new Set(parsedItems.map((entry) => entry.variantId)).size !== parsedItems.length) add(issues, "items", "duplicate_variant");
  if (issues.length || !email || !displayName || marketingConsent === null || !locale || !sourceChannel || !items) return { ok: false, issues };
  return { ok: true, value: {
    customer: { email: normalizeShopEmail(email), displayName, ...(phone ? { phone } : {}), locale: customerLocale ?? locale, marketingConsent, ...(telegramSubject ? { telegramSubject } : {}) },
    items: parsedItems, locale, sourceChannel, ...(externalReference ? { externalReference } : {}), ...(discountCode ? { discountCode } : {}), ...(paymentMethodId ? { paymentMethodId } : {}),
  } };
}

export function validatePaymentAttemptInput(value: unknown): ValidationResult<PaymentAttemptInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["orderId", "providerConfigId", "providerReference", "qrPayloadHash", "expiresAt"])) return { ok: false, issues: [{ path: "$", code: "invalid_payment_attempt" }] };
  const orderId = id(value.orderId);
  const providerConfigId = id(value.providerConfigId);
  const providerReference = optionalText(value.providerReference, 180);
  const qrPayloadHash = value.qrPayloadHash == null ? undefined : text(value.qrPayloadHash, 43, 64);
  const expiresAt = timestamp(value.expiresAt);
  const issues: ValidationIssue[] = [];
  if (!orderId) add(issues, "orderId", "invalid_id");
  if (!providerConfigId) add(issues, "providerConfigId", "invalid_id");
  if (value.qrPayloadHash != null && (!qrPayloadHash || !/^(?:[A-Za-z0-9_-]{43}|[A-Fa-f0-9]{64})$/.test(qrPayloadHash))) add(issues, "qrPayloadHash", "invalid_sha256");
  if (!expiresAt) add(issues, "expiresAt", "invalid_timestamp");
  return issues.length || !orderId || !providerConfigId || !expiresAt ? { ok: false, issues } : { ok: true, value: { orderId, providerConfigId, providerReference: providerReference ?? null, qrPayloadHash: qrPayloadHash ?? null, expiresAt } };
}

export function validatePaymentConfirmation(value: unknown): ValidationResult<PaymentConfirmationInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["provider", "providerEventId", "providerReference", "providerOrderCode", "destinationAccountNumber", "transactionReference", "orderReference", "amountMinor", "currency", "payloadHash", "signatureVerified", "occurredAt"])) return { ok: false, issues: [{ path: "$", code: "invalid_payment_confirmation" }] };
  const provider = value.provider === "payos" || value.provider === "casso" || value.provider === "generic_signed" || value.provider === "manual" ? value.provider : null;
  const providerEventId = text(value.providerEventId, 1, 180);
  const providerReference = optionalText(value.providerReference, 180);
  const providerOrderCode = value.providerOrderCode == null ? null : integer(value.providerOrderCode, 1, 9_007_199_254_740_991);
  const destinationAccountNumber = optionalText(value.destinationAccountNumber, 32);
  const transactionReference = optionalText(value.transactionReference, 180);
  const orderReference = text(value.orderReference, 4, 64)?.toUpperCase() ?? null;
  const amountMinor = integer(value.amountMinor, 0, 9_000_000_000_000);
  const parsedCurrency = currency(value.currency);
  const payloadHash = text(value.payloadHash, 43, 64);
  const occurredAt = timestamp(value.occurredAt);
  const signatureVerified = typeof value.signatureVerified === "boolean" ? value.signatureVerified : null;
  const issues: ValidationIssue[] = [];
  if (!provider) add(issues, "provider", "invalid_provider");
  if (!providerEventId) add(issues, "providerEventId", "required");
  if (value.providerOrderCode != null && providerOrderCode === null || provider === "payos" && providerOrderCode === null) add(issues, "providerOrderCode", "invalid_order_code");
  if (value.destinationAccountNumber != null && (!destinationAccountNumber || !/^[A-Za-z0-9]{4,32}$/.test(destinationAccountNumber))
    || provider === "payos" && !destinationAccountNumber) add(issues, "destinationAccountNumber", "invalid_account_number");
  if (!orderReference || !/^[A-Z0-9_-]+$/.test(orderReference)) add(issues, "orderReference", "invalid_reference");
  if (amountMinor === null) add(issues, "amountMinor", "invalid_amount");
  if (!parsedCurrency) add(issues, "currency", "invalid_currency");
  if (!payloadHash || !/^(?:[A-Za-z0-9_-]{43}|[A-Fa-f0-9]{64})$/.test(payloadHash)) add(issues, "payloadHash", "invalid_sha256");
  if (!occurredAt) add(issues, "occurredAt", "invalid_timestamp");
  if (signatureVerified === null) add(issues, "signatureVerified", "invalid_boolean");
  return issues.length || !provider || !providerEventId || !orderReference || amountMinor === null || !parsedCurrency || !payloadHash || !occurredAt || signatureVerified === null
    ? { ok: false, issues }
    : { ok: true, value: { provider, providerEventId, providerReference: providerReference ?? null, providerOrderCode, ...(destinationAccountNumber ? { destinationAccountNumber } : {}), transactionReference: transactionReference ?? null, orderReference, amountMinor, currency: parsedCurrency, payloadHash, signatureVerified, occurredAt } };
}

export function validateManualOrderConfirmInput(value: unknown): ValidationResult<{ reason: string }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["reason"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_manual_confirm" }] };
  }
  const reason = text(value.reason, 5, 500);
  if (!reason) return { ok: false, issues: [{ path: "reason", code: "reason_required" }] };
  return { ok: true, value: { reason } };
}

export function validateDiscountUpsertInput(value: unknown): ValidationResult<DiscountUpsertInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["code", "status", "type", "value", "currency", "minimumSubtotalMinor", "maximumDiscountMinor", "maximumRedemptions", "maximumPerCustomer", "stackable", "startsAt", "endsAt", "productIds", "variantIds", "metadata"])) return { ok: false, issues: [{ path: "$", code: "invalid_discount" }] };
  const issues: ValidationIssue[] = [];
  const code = text(value.code, 2, 100)?.toUpperCase() ?? null;
  const status = value.status === "draft" || value.status === "active" || value.status === "paused" || value.status === "archived" ? value.status : null;
  const type = value.type === "percentage" || value.type === "fixed_amount" ? value.type : null;
  const parsedValue = integer(value.value, 1, 9_000_000_000_000);
  const parsedCurrency = value.currency == null ? null : currency(value.currency);
  const minimumSubtotalMinor = value.minimumSubtotalMinor === undefined ? 0 : integer(value.minimumSubtotalMinor, 0, 9_000_000_000_000);
  const maximumDiscountMinor = value.maximumDiscountMinor == null ? null : integer(value.maximumDiscountMinor, 0, 9_000_000_000_000);
  const maximumRedemptions = value.maximumRedemptions == null ? null : integer(value.maximumRedemptions, 1, 1_000_000_000);
  const maximumPerCustomer = value.maximumPerCustomer == null ? null : integer(value.maximumPerCustomer, 1, 1_000_000);
  const stackable = booleanOr(value.stackable, false);
  const startsAt = value.startsAt == null ? null : timestamp(value.startsAt);
  const endsAt = value.endsAt == null ? null : timestamp(value.endsAt);
  const productIds = value.productIds === undefined ? [] : Array.isArray(value.productIds) && value.productIds.length <= 200 ? value.productIds.map(id) : null;
  const variantIds = value.variantIds === undefined ? [] : Array.isArray(value.variantIds) && value.variantIds.length <= 200 ? value.variantIds.map(id) : null;
  const metadata = jsonObject(value.metadata);
  if (!code || !/^[A-Z0-9][A-Z0-9_-]+$/.test(code)) add(issues, "code", "invalid_code");
  if (!status) add(issues, "status", "invalid_status");
  if (!type) add(issues, "type", "invalid_type");
  if (parsedValue === null || (type === "percentage" && parsedValue > 10_000)) add(issues, "value", "invalid_value");
  if (type === "fixed_amount" && !parsedCurrency) add(issues, "currency", "required_for_fixed_amount");
  if (minimumSubtotalMinor === null || maximumDiscountMinor === null && value.maximumDiscountMinor != null || maximumRedemptions === null && value.maximumRedemptions != null || maximumPerCustomer === null && value.maximumPerCustomer != null) add(issues, "$", "invalid_limits");
  if (status === "active" && maximumPerCustomer === null) add(issues, "maximumPerCustomer", "required_for_active_discount");
  if (stackable === null) add(issues, "stackable", "invalid_boolean");
  if (value.startsAt != null && !startsAt || value.endsAt != null && !endsAt || startsAt && endsAt && startsAt >= endsAt) add(issues, "$", "invalid_window");
  if (!productIds || productIds.some((entry) => !entry) || !variantIds || variantIds.some((entry) => !entry)) add(issues, "$", "invalid_targets");
  if (!metadata) add(issues, "metadata", "invalid_json_object");
  if (issues.length || !code || !status || !type || parsedValue === null || minimumSubtotalMinor === null || stackable === null || !productIds || !variantIds || !metadata) return { ok: false, issues };
  return { ok: true, value: { code, status, type, value: parsedValue, currency: parsedCurrency, minimumSubtotalMinor, maximumDiscountMinor, maximumRedemptions, maximumPerCustomer, stackable, startsAt, endsAt, productIds: productIds as string[], variantIds: variantIds as string[], metadata } };
}

function containsSensitiveConfig(value: JsonValue, keyPath = ""): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    const path = keyPath ? `${keyPath}.${key}` : key;
    if (/(?:secret|token|password|private[_-]?key|account[_-]?(?:number|no)|webhook[_-]?key)/i.test(path)) return true;
    return containsSensitiveConfig(child, path);
  });
}

export function validatePaymentProviderConfigInput(value: unknown): ValidationResult<PaymentProviderConfigInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["displayName", "status", "provider", "bankId", "accountRef", "accountNameDisplay", "qrTemplate", "confirmationAdapter", "secretRef", "publicConfig"])) return { ok: false, issues: [{ path: "$", code: "invalid_payment_config" }] };
  const issues: ValidationIssue[] = [];
  const displayName = text(value.displayName, 1, 180);
  const status = value.status === "disabled" || value.status === "active" || value.status === "archived" ? value.status : null;
  const provider = value.provider === "vietqr" ? value.provider : null;
  const bankId = text(value.bankId, 4, 12) ?? null;
  const accountRef = text(value.accountRef, 3, 100)?.toUpperCase() ?? null;
  const accountNameDisplay = optionalText(value.accountNameDisplay, 180);
  const qrTemplate = value.qrTemplate === undefined ? "compact2" : text(value.qrTemplate, 1, 40);
  const confirmationAdapter = value.confirmationAdapter === "payos" ? "payos" : null;
  const secretRef = value.secretRef == null ? null : text(value.secretRef, 3, 100)?.toUpperCase() ?? null;
  const publicConfig = jsonObject(value.publicConfig);
  if (!displayName) add(issues, "displayName", "required");
  if (!status) add(issues, "status", "invalid_status");
  if (!provider) add(issues, "provider", "invalid_provider");
  if (!bankId || !/^\d{4,12}$/.test(bankId)) add(issues, "bankId", "invalid_bank_id");
  if (accountRef !== "VIETQR_BANK_ACCOUNT") add(issues, "accountRef", "vietqr_account_binding_required");
  if (!qrTemplate) add(issues, "qrTemplate", "invalid_template");
  if (!confirmationAdapter) add(issues, "confirmationAdapter", "payos_required");
  if (secretRef !== "PAYOS_CHECKSUM_KEY") add(issues, "secretRef", "payos_checksum_key_required");
  if (!publicConfig || containsSensitiveConfig(publicConfig)) add(issues, "publicConfig", "sensitive_value_not_allowed");
  return issues.length || !displayName || !status || !provider || !bankId || !accountRef || !qrTemplate || !confirmationAdapter || !publicConfig
    ? { ok: false, issues }
    : { ok: true, value: { displayName, status, provider, bankId, accountRef: "VIETQR_BANK_ACCOUNT", ...(accountNameDisplay ? { accountNameDisplay } : {}), qrTemplate, confirmationAdapter, secretRef: "PAYOS_CHECKSUM_KEY", publicConfig } };
}

export function validateCryptoPaymentMethodInput(value: unknown): ValidationResult<ShopCryptoPaymentMethodInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["storefrontScope", "provider", "rail", "asset", "network", "destinationType", "destinationValue", "memoOrTag", "displayName", "status", "minConfirmations", "expiryMinutes", "sortOrder", "publicConfig"])) {
    return { ok: false, issues: [{ path: "$", code: "invalid_crypto_payment_method" }] };
  }
  const issues: ValidationIssue[] = [];
  const storefrontScope = value.storefrontScope === undefined ? "glb" : value.storefrontScope === "legacy" || value.storefrontScope === "glb" ? value.storefrontScope : null;
  const provider = value.provider === "bybit" || value.provider === "binance" ? value.provider : null;
  const rail = value.rail === "internal_uid" || value.rail === "onchain_deposit" || value.rail === "pay_order" ? value.rail : null;
  const asset = value.asset === "USDT" || value.asset === "USDC" ? value.asset : null;
  const rawNetwork = value.network === undefined ? "" : text(value.network, 0, 40)?.toUpperCase() ?? null;
  const network = rawNetwork === null ? null : cryptoNetworkAliases.get(rawNetwork) ?? rawNetwork;
  const destinationType = value.destinationType === "uid" || value.destinationType === "wallet_address" ? value.destinationType : null;
  const destinationValue = text(value.destinationValue, 4, 180);
  const memoOrTag = optionalText(value.memoOrTag, 180) ?? "";
  const displayName = text(value.displayName, 1, 180);
  const status = value.status === "disabled" || value.status === "active" || value.status === "archived" ? value.status : null;
  const minConfirmations = value.minConfirmations === undefined ? 1 : integer(value.minConfirmations, 0, 100000);
  const expiryMinutes = value.expiryMinutes === undefined ? 30 : integer(value.expiryMinutes, 5, 1440);
  const sortOrder = value.sortOrder === undefined ? 0 : integer(value.sortOrder, 0, 100000);
  const publicConfig = value.publicConfig === undefined ? {} : jsonObject(value.publicConfig);
  if (!provider) add(issues, "provider", "invalid_provider");
  if (!storefrontScope) add(issues, "storefrontScope", "invalid_scope");
  if (!rail) add(issues, "rail", "invalid_rail");
  if (!asset) add(issues, "asset", "invalid_asset");
  if (network === null || (rail === "onchain_deposit" && !network)) add(issues, "network", "required_for_onchain");
  if (status === "active" && network && !cryptoNetworkSet.has(network)) add(issues, "network", "manual_network_not_supported");
  if (rail === "internal_uid" && network) add(issues, "network", "network_not_used_for_internal_transfer");
  if (!destinationType) add(issues, "destinationType", "invalid_destination_type");
  if (!destinationValue) add(issues, "destinationValue", "required");
  if (rail === "internal_uid" && destinationType !== "uid") add(issues, "destinationType", "uid_required_for_internal_transfer");
  if (rail === "onchain_deposit" && destinationType !== "wallet_address") add(issues, "destinationType", "wallet_required_for_onchain");
  if (status === "active" && rail === "onchain_deposit" && destinationType !== "wallet_address") add(issues, "destinationType", "manual_wallet_required");
  if (status === "active" && rail === "internal_uid" && destinationType !== "uid") add(issues, "destinationType", "manual_uid_required");
  if (status === "active" && rail !== "onchain_deposit" && rail !== "internal_uid") add(issues, "rail", "manual_transfer_rail_required");
  if (!displayName) add(issues, "displayName", "required");
  if (!status) add(issues, "status", "invalid_status");
  if (minConfirmations === null || expiryMinutes === null || sortOrder === null) add(issues, "$", "invalid_limits");
  if (!publicConfig || containsSensitiveConfig(publicConfig)) add(issues, "publicConfig", "sensitive_value_not_allowed");
  if (issues.length || !storefrontScope || !provider || !rail || !asset || network === null || !destinationType || !destinationValue || !displayName || !status || minConfirmations === null || expiryMinutes === null || sortOrder === null || !publicConfig) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      storefrontScope, provider, rail, asset, network, destinationType, destinationValue, memoOrTag,
      displayName, status, minConfirmations, expiryMinutes, sortOrder, publicConfig,
    },
  };
}

/** USD/VND rate as an integer scaled by 1e6; accepts "26500" or "26500.5". */
export function parseUsdVndRateInput(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,8}(?:\.\d{1,6})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const scaled = Number(`${whole}${fraction.padEnd(6, "0")}`);
  return Number.isSafeInteger(scaled) ? scaled : null;
}

export type AffiliateUpsertInput = {
  code: string;
  displayName: string;
  commissionBps: number;
  notes: string | null;
  status: "active" | "paused" | "archived";
};

export function validateAffiliateUpsertInput(value: unknown): ValidationResult<AffiliateUpsertInput> {
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "invalid_affiliate" }] };
  const issues: ValidationIssue[] = [];
  const code = text(value.code, 1, 64);
  const displayName = text(value.displayName ?? value.name, 1, 180);
  const commissionBps = value.commissionBps === undefined ? 0 : integer(value.commissionBps, 0, 5000);
  const notes = value.notes === undefined || value.notes === null ? null : text(value.notes, 0, 2_000);
  const status = value.status === "paused" || value.status === "archived"
    ? value.status
    : value.status === undefined || value.status === "active" ? "active" : null;
  if (!code) add(issues, "code", "required");
  if (!displayName) add(issues, "displayName", "required");
  if (commissionBps === null) add(issues, "commissionBps", "invalid_integer");
  if (!status) add(issues, "status", "invalid_status");
  if (notes === null) add(issues, "notes", "invalid_text");
  if (issues.length || !code || !displayName || commissionBps === null || !status || notes === null) {
    return { ok: false, issues };
  }
  return { ok: true, value: { code, displayName, commissionBps, notes, status } };
}
