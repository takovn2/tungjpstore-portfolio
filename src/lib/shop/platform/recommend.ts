/**
 * F2 AI Sales Concierge — catalog-aware recommender.
 * Heuristic always available; optional SpaceXAI (xAI) when XAI_API_KEY is set.
 */

export type RecommendProductInput = {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string;
  description?: string;
  category?: string;
  categorySlug?: string;
  productType?: string;
  badges?: string[];
  featured?: boolean;
  availability?: string;
  minPriceMinor?: number;
  currency?: string;
  eyebrow?: string;
};

export type RecommendResult = {
  product: RecommendProductInput;
  score: number;
  reasons: string[];
};

export type RecommendResponse = {
  engine: "heuristic" | "hybrid";
  query: string;
  results: RecommendResult[];
  assistantMessage: string;
};

const stopwords = new Set([
  "the", "a", "an", "and", "or", "for", "with", "to", "of", "in", "on", "mua", "giá", "rẻ",
  "plus", "pro", "gói", "thang", "tháng", "account", "tool", "tools", "ai",
]);

function tokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopwords.has(t));
}

function productBlob(product: RecommendProductInput): string {
  return [
    product.title,
    product.slug,
    product.shortDescription,
    product.description,
    product.category,
    product.categorySlug,
    product.eyebrow,
    ...(product.badges || []),
  ].filter(Boolean).join(" ");
}

/** Score a product against a free-text need (Vietnamese/English). */
export function scoreProductForQuery(product: RecommendProductInput, query: string): RecommendResult {
  const qTokens = tokens(query);
  const blob = productBlob(product);
  const blobTokens = new Set(tokens(blob));
  const reasons: string[] = [];
  let score = 0;

  for (const token of qTokens) {
    if (blobTokens.has(token)) {
      score += 3;
      if (reasons.length < 3) reasons.push(`Khớp “${token}”`);
    } else if (blob.includes(token)) {
      score += 1.5;
    }
  }

  // Intent boosts
  const q = query.toLowerCase();
  if (/(code|coding|lập trình|cursor|kiro|dev)/i.test(q) && /cursor|kiro|code|dev/i.test(blob)) {
    score += 4;
    reasons.push("Phù hợp lập trình");
  }
  if (/(design|thiết kế|canva|capcut|adobe|video)/i.test(q) && /canva|capcut|adobe|creative|design/i.test(blob)) {
    score += 4;
    reasons.push("Phù hợp sáng tạo");
  }
  if (/(chatgpt|gpt|claude|gemini|grok|ai)/i.test(q) && /chatgpt|gpt|claude|gemini|grok|ai/i.test(blob)) {
    score += 4;
    reasons.push("Phù hợp trợ lý AI");
  }
  if (/(rẻ|cheap|afford|tiết kiệm)/i.test(q) && (product.minPriceMinor ?? Infinity) < 50_000) {
    score += 2;
    reasons.push("Giá tiếp cận");
  }
  if (product.featured) score += 1.5;
  if (product.availability === "out_of_stock") score -= 8;
  else if (product.availability === "in_stock" || product.availability === "unlimited") score += 1;

  if (!reasons.length && score > 0) reasons.push("Liên quan danh mục");
  if (score <= 0) reasons.push("Gợi ý phổ biến");

  return { product, score, reasons: reasons.slice(0, 3) };
}

export function recommendProducts(
  catalog: readonly RecommendProductInput[],
  query: string,
  options: { limit?: number; locale?: string } = {},
): RecommendResponse {
  const limit = Math.max(1, Math.min(8, options.limit ?? 4));
  const locale = options.locale ?? "vi";
  const cleaned = String(query || "").trim();

  let ranked: RecommendResult[];
  if (!cleaned) {
    ranked = catalog
      .filter((p) => p.availability !== "out_of_stock")
      .map((product) => ({
        product,
        score: (product.featured ? 5 : 0) + (product.availability === "in_stock" ? 1 : 0),
        reasons: [locale === "vi" ? "Đang nổi bật" : "Featured pick"],
      }))
      .sort((a, b) => b.score - a.score);
  } else {
    ranked = catalog
      .map((product) => scoreProductForQuery(product, cleaned))
      .sort((a, b) => b.score - a.score || (a.product.minPriceMinor ?? 0) - (b.product.minPriceMinor ?? 0));
  }

  const results = ranked.filter((r) => r.score > 0 || !cleaned).slice(0, limit);
  // fallback: top featured if nothing matched
  const finalResults = results.length
    ? results
    : catalog.filter((p) => p.featured).slice(0, limit).map((product) => ({
        product,
        score: 1,
        reasons: [locale === "vi" ? "Gợi ý thay thế" : "Alternative pick"],
      }));

  const titles = finalResults.map((r) => r.product.title).slice(0, 3).join(", ");
  const assistantMessage = locale === "vi"
    ? (cleaned
      ? `Dựa trên “${cleaned.slice(0, 80)}”, gợi ý: ${titles || "các gói đang có sẵn"}. Kiểm tra thời hạn, tồn kho và hình thức giao trước khi mua.`
      : `Gợi ý sản phẩm nổi bật: ${titles}. Bạn có thể mô tả nhu cầu (AI, thiết kế, code…) để mình lọc chính xác hơn.`)
    : (cleaned
      ? `Based on “${cleaned.slice(0, 80)}”, try: ${titles || "available plans"}. Check duration, stock, and delivery before checkout.`
      : `Featured picks: ${titles}. Describe your need (AI, design, coding…) for a tighter match.`);

  return {
    engine: "heuristic",
    query: cleaned,
    results: finalResults,
    assistantMessage,
  };
}
