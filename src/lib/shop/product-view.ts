/**
 * Market product view — normalizes PublicProduct for web + Telegram mini UIs.
 * Keeps one IA: tile, sheet, plan cards, delivery facts.
 */
import type {
  ProductMedia,
  PublicProduct,
  PublicVariant,
  ShopAvailability,
  ShopDeliveryMode,
  ShopFulfillmentType,
  ShopLocale,
  ShopProductType,
} from "./types";

const DESCRIPTION_MAX = 4000;

export type MarketPlanView = {
  id: string;
  sku: string;
  title: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  availability: ShopAvailability;
  availableQuantity: number | null;
  maxPerOrder: number;
  fulfillmentType: ShopFulfillmentType;
  deliveryMode: ShopDeliveryMode;
  optionValues: Record<string, string>;
  /** One-line “what you get” from option values or title */
  benefitLine: string;
};

export type MarketProductView = {
  id: string;
  slug: string;
  title: string;
  eyebrow: string;
  shortDescription: string;
  description: string;
  productType: ShopProductType;
  category: string;
  categorySlug: string;
  featured: boolean;
  badges: string[];
  locale: ShopLocale;
  currency: string;
  minPriceMinor: number;
  maxPriceMinor: number;
  availability: ShopAvailability;
  coverUrl: string;
  media: Array<{ url: string; alt: string }>;
  plans: MarketPlanView[];
  /** Dominant delivery mode across purchasable plans */
  deliveryMode: ShopDeliveryMode;
  fulfillmentType: ShopFulfillmentType;
  deliveryLabel: string;
  stockLabel: string;
};

export type MiniMarketProduct = {
  id: string;
  slug: string;
  productType: ShopProductType;
  featured: boolean;
  title: string;
  eyebrow: string;
  shortDescription: string;
  description: string;
  category: string;
  categorySlug: string;
  badges: string[];
  media: Array<{ url: string; alt: string; type?: string }>;
  coverUrl: string;
  minPriceMinor: number;
  currency: string;
  availability: ShopAvailability;
  deliveryMode: ShopDeliveryMode;
  fulfillmentType: ShopFulfillmentType;
  variants: Array<{
    id: string;
    sku: string;
    title: string;
    priceMinor: number;
    compareAtMinor: number | null;
    currency: string;
    availability: ShopAvailability;
    availableQuantity: number | null;
    maxPerOrder: number;
    fulfillmentType: ShopFulfillmentType;
    deliveryMode: ShopDeliveryMode;
    benefitLine: string;
  }>;
};

function clampText(value: string, max: number) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function benefitFromVariant(variant: PublicVariant): string {
  const options = Object.entries(variant.optionValues || {})
    .map(([key, val]) => `${key}: ${val}`)
    .join(" · ");
  if (options) return options;
  return variant.title || variant.sku;
}

function deliveryCopy(mode: ShopDeliveryMode, locale: ShopLocale): string {
  if (mode === "automatic") {
    if (locale === "vi") return "Giao key tự động sau khi thanh toán được xác minh";
    if (locale === "ja") return "支払い確認後にキーを自動配信";
    if (locale === "zh") return "付款确认后自动交付密钥";
    return "Automatic key delivery after payment is verified";
  }
  if (locale === "vi") return "Xử lý thủ công — admin xác nhận trước khi giao";
  if (locale === "ja") return "手動処理 — 確認後に配信";
  if (locale === "zh") return "人工处理 — 确认后交付";
  return "Manual fulfillment after payment review";
}

function stockCopy(availability: ShopAvailability, locale: ShopLocale): string {
  const map: Record<ShopAvailability, Record<ShopLocale, string>> = {
    in_stock: { vi: "Còn hàng", en: "In stock", ja: "在庫あり", zh: "有货" },
    low_stock: { vi: "Sắp hết", en: "Low stock", ja: "残りわずか", zh: "库存紧张" },
    out_of_stock: { vi: "Hết hàng", en: "Out of stock", ja: "在庫切れ", zh: "缺货" },
    unlimited: { vi: "Luôn sẵn sàng", en: "Always available", ja: "常時提供", zh: "长期供应" },
  };
  return map[availability]?.[locale] ?? availability;
}

export function pickCover(media: ProductMedia[] | undefined, fallback = ""): string {
  const images = [...(media || [])]
    .filter((item) => item.type === "image")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return images[0]?.url || fallback;
}

export function toMarketPlan(variant: PublicVariant): MarketPlanView {
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
    priceMinor: variant.priceMinor,
    compareAtMinor: variant.compareAtMinor,
    currency: variant.currency,
    availability: variant.availability,
    availableQuantity: variant.availableQuantity,
    maxPerOrder: variant.maxPerOrder,
    fulfillmentType: variant.fulfillmentType,
    deliveryMode: variant.deliveryMode,
    optionValues: variant.optionValues || {},
    benefitLine: benefitFromVariant(variant),
  };
}

export function toMarketProduct(product: PublicProduct): MarketProductView {
  const plans = product.variants.map(toMarketPlan);
  const purchasable = plans.find((plan) => plan.availability !== "out_of_stock") ?? plans[0];
  const deliveryMode = purchasable?.deliveryMode ?? "automatic";
  const fulfillmentType = purchasable?.fulfillmentType ?? "license_key";
  const media = [...product.media]
    .filter((item) => item.type === "image")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 4)
    .map((item) => ({ url: item.url, alt: item.alt || product.title }));

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    eyebrow: product.eyebrow || product.category || product.productType,
    shortDescription: product.shortDescription,
    description: clampText(product.description || product.shortDescription, DESCRIPTION_MAX),
    productType: product.productType,
    category: product.category || "",
    categorySlug: product.categorySlug || product.productType,
    featured: product.featured,
    badges: product.badges || [],
    locale: product.locale,
    currency: product.currency,
    minPriceMinor: product.minPriceMinor,
    maxPriceMinor: product.maxPriceMinor,
    availability: product.availability,
    coverUrl: pickCover(product.media),
    media,
    plans,
    deliveryMode,
    fulfillmentType,
    deliveryLabel: deliveryCopy(deliveryMode, product.locale),
    stockLabel: stockCopy(product.availability, product.locale),
  };
}

/** Compact JSON for Telegram mini bootstrap (SSR → client). */
export function toMiniMarketProduct(product: PublicProduct): MiniMarketProduct {
  const market = toMarketProduct(product);
  return {
    id: market.id,
    slug: market.slug,
    productType: market.productType,
    featured: market.featured,
    title: market.title,
    eyebrow: market.eyebrow,
    shortDescription: market.shortDescription,
    description: market.description,
    category: market.category,
    categorySlug: market.categorySlug,
    badges: market.badges,
    media: market.media.map((item) => ({ url: item.url, alt: item.alt, type: "image" })),
    coverUrl: market.coverUrl,
    minPriceMinor: market.minPriceMinor,
    currency: market.currency,
    availability: market.availability,
    deliveryMode: market.deliveryMode,
    fulfillmentType: market.fulfillmentType,
    variants: market.plans.map((plan) => ({
      id: plan.id,
      sku: plan.sku,
      title: plan.title,
      priceMinor: plan.priceMinor,
      compareAtMinor: plan.compareAtMinor,
      currency: plan.currency,
      availability: plan.availability,
      availableQuantity: plan.availableQuantity,
      maxPerOrder: plan.maxPerOrder,
      fulfillmentType: plan.fulfillmentType,
      deliveryMode: plan.deliveryMode,
      benefitLine: plan.benefitLine,
    })),
  };
}

export function serializeMiniCatalog(products: readonly PublicProduct[]): string {
  const payload = products.map(toMiniMarketProduct);
  return JSON.stringify(payload).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
