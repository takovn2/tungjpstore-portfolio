/**
 * F3 Offer Engine — pure merchandising rails from live catalog.
 */

export type MerchProduct = {
  id: string;
  slug: string;
  title: string;
  categorySlug?: string | null;
  category?: string | null;
  featured?: boolean;
  availability?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  currency?: string;
  badges?: readonly string[];
  compareAtHint?: number | null;
};

export type MerchRail = {
  id: string;
  title: string;
  subtitle?: string;
  productSlugs: string[];
};

export function buildMerchandisingRails(
  products: readonly MerchProduct[],
  locale = "vi",
): MerchRail[] {
  const active = products.filter((p) => p.availability !== "out_of_stock");
  const bySlug = new Map(active.map((p) => [p.slug, p]));

  const featured = active.filter((p) => p.featured).map((p) => p.slug);
  const deals = active
    .filter((p) => {
      if (p.compareAtHint && p.minPriceMinor != null && p.compareAtHint > p.minPriceMinor) return true;
      if ((p.badges || []).some((b) => /deal|sale|hot|giảm|sale/i.test(b))) return true;
      // Value picks: featured + bottom half of price distribution when no compare-at data
      return Boolean(p.featured);
    })
    .map((p) => p.slug);

  const lowPrice = [...active]
    .sort((a, b) => (a.minPriceMinor ?? 0) - (b.minPriceMinor ?? 0))
    .slice(0, 8)
    .map((p) => p.slug);

  const ai = active.filter((p) => /ai|gpt|claude|gemini|grok|llm/i.test(`${p.slug} ${p.categorySlug} ${p.category}`)).map((p) => p.slug);
  const creative = active.filter((p) => /creative|canva|capcut|adobe|design|video/i.test(`${p.slug} ${p.categorySlug} ${p.category}`)).map((p) => p.slug);
  const coding = active.filter((p) => /cursor|kiro|code|dev|productiv/i.test(`${p.slug} ${p.categorySlug} ${p.category}`)).map((p) => p.slug);

  const t = (vi: string, en: string) => (locale === "vi" ? vi : en);

  const rails: MerchRail[] = [
    {
      id: "featured",
      title: t("Nổi bật", "Featured"),
      subtitle: t("Được chọn bán chạy / editorial", "Curated bestsellers"),
      productSlugs: unique(featured.length ? featured : lowPrice).slice(0, 8),
    },
    {
      id: "deals",
      title: t("Ưu đãi & giá tốt", "Deals & value"),
      subtitle: t("Giá dễ tiếp cận hoặc có so sánh", "Approachable prices"),
      productSlugs: unique(deals.length ? deals : lowPrice).slice(0, 8),
    },
    {
      id: "ai-tools",
      title: t("Công cụ AI", "AI tools"),
      productSlugs: unique(ai).slice(0, 8),
    },
    {
      id: "creative",
      title: t("Sáng tạo", "Creative"),
      productSlugs: unique(creative).slice(0, 8),
    },
    {
      id: "coding",
      title: t("Lập trình & năng suất", "Coding & productivity"),
      productSlugs: unique(coding).slice(0, 8),
    },
  ].filter((rail) => rail.productSlugs.length > 0 && rail.productSlugs.some((s) => bySlug.has(s)));

  return rails;
}

function unique(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)));
}

export function isDealProduct(product: MerchProduct): boolean {
  if (product.compareAtHint && product.minPriceMinor != null && product.compareAtHint > product.minPriceMinor) return true;
  return (product.badges || []).some((b) => /deal|sale|hot|giảm/i.test(b));
}
