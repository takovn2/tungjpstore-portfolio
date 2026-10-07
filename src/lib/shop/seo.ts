import type { Locale } from "../../i18n/dictionaries";
import type { ProductViewModel } from "../../i18n/shop";

/**
 * Repairs naming drift captured from the original Vietnamese bulk import, e.g. a
 * product titled "ChatGPT Plus 1 tháng trial 30 ngày".
 *
 * These are Vietnamese strings. Applying them on an English, Japanese or Chinese
 * page would leak Vietnamese into the visible title and into the `name` field of
 * Product structured data, so they are gated to `vi` only. Other locales use the
 * localized title straight from `shop_product_localizations`.
 */
const VIETNAMESE_KNOWN_TITLES: Record<string, string> = {
  "chatgpt-plus": "ChatGPT Plus hàng GPAY đuổi gmail Siêu trâu BH5H thẻ riêng",
  "gemini-pro": "Gemini Pro 1 tháng",
  canva: "Canva Pro 1 tháng",
  "capcut-pro": "CapCut Pro",
  "super-grok": "Super Grok",
  elevenlab: "ElevenLabs",
  "ytb-premium": "YouTube Premium",
  kiro: "Kiro Pro IDE",
  "campus-mail": "Mail Edu US",
  "mail-edu": "Mail Edu US",
  netflix: "Netflix Ultra 4K",
  "cursor-pro": "Cursor Pro AI",
  "claude-api": "Claude API",
  "claude-x20": "Claude 3.5 Sonnet X20",
  "hma-vpn": "HMA VPN",
  adobe: "Adobe Creative Cloud",
  microsoft: "Microsoft 365",
};

/** Remove internal inventory notes and repair known catalog naming drift before rendering SEO text. */
export function getShopProductDisplayTitle(
  product: Pick<ProductViewModel, "slug" | "title">,
  locale: Locale = "vi",
): string {
  const raw = product.title.trim();
  if (locale === "vi" && VIETNAMESE_KNOWN_TITLES[product.slug]) return VIETNAMESE_KNOWN_TITLES[product.slug];
  return raw
    .replace(/\btrial\s*!?\s*\d+\s*tháng\b/gi, "")
    .replace(/\btrial\s*\d+\s*days?\b/gi, "")
    .replace(/\s+KBH\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Boilerplate intros produced by the bulk catalog import. A title ending in
 * "| TUNG Shop" paired with one of these is not real editorial copy and is
 * rewritten from the template below.
 */
const GENERIC_DESCRIPTION_PATTERNS: Record<Locale, RegExp[]> = {
  vi: [/^(Mua gói|Gói |Mua .+ tại TUNG Shop)/i],
  en: [/^(Buy .+ at TUNG Shop|Get .+ at TUNG Shop)/i],
  ja: [/^(TUNG Shop で.+を購入|.+を TUNG Shop で購入)/i],
  zh: [/^(在 TUNG Shop 购买|购买 .+ — TUNG Shop)/i],
};

/**
 * Per-locale meta templates, used whenever the product has no editorial SEO copy.
 *
 * The Vietnamese variant names VietQR because that is the rail actually offered
 * in Vietnam. The others stay rail-neutral: which payment methods are available
 * depends on the visitor's market and belongs on the product page, not in a meta
 * description that gets cached by search engines.
 */
const PRODUCT_SEO_TEMPLATES: Record<Locale, (title: string) => { title: string; description: string }> = {
  vi: (title) => ({
    title: `Mua ${title} giá rẻ, giao nhanh | TUNG Shop`,
    description: `Mua ${title} giá tốt tại TUNG Shop. Xem giá, phiên bản, thời hạn, tồn kho, cách bàn giao và thanh toán VietQR trước khi đặt hàng.`,
  }),
  en: (title) => ({
    title: `Buy ${title} — instant delivery | TUNG Shop`,
    description: `Buy ${title} at TUNG Shop. Check price, plan, duration, stock, delivery method and payment options before ordering.`,
  }),
  ja: (title) => ({
    title: `${title} を購入 — 即時納品 | TUNG Shop`,
    description: `TUNG Shop で${title}を購入。価格、プラン、期間、在庫、納品方法、支払い方法を注文前にご確認ください。`,
  }),
  zh: (title) => ({
    title: `购买 ${title} — 即时交付 | TUNG Shop`,
    description: `在 TUNG Shop 购买 ${title}。下单前查看价格、套餐、有效期、库存、交付方式和付款方式。`,
  }),
};

export function getShopProductSeo(product: ProductViewModel, locale: Locale) {
  const displayTitle = getShopProductDisplayTitle(product, locale);
  const title = displayTitle || product.slug;
  const storedTitle = product.seo?.title?.trim() || "";
  const storedDescription = product.seo?.description?.trim() || "";
  const legacyBrand = /digistore|digi\s*store/i.test(`${storedTitle} ${storedDescription}`);
  const genericCatalogSeo = /\|\s*TUNG Shop$/i.test(storedTitle)
    && (GENERIC_DESCRIPTION_PATTERNS[locale] ?? []).some((pattern) => pattern.test(storedDescription));
  // Editorial copy wins in every locale. Previously this branch was gated to
  // `vi`, so an English product page with no stored SEO silently fell back to a
  // bare display title and short description with no brand and no call to action.
  if (storedTitle && storedDescription && !legacyBrand && !genericCatalogSeo) {
    return { title: storedTitle, description: storedDescription, displayTitle };
  }
  const template = PRODUCT_SEO_TEMPLATES[locale] ?? PRODUCT_SEO_TEMPLATES.en;
  return { ...template(title), displayTitle };
}
