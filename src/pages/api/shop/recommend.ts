import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listPublicProducts } from "../../../lib/shop/repository";
import type { RecommendProductInput } from "../../../lib/shop/platform/recommend";
import {
  isShopAiRecommendEnabled,
  logAttributionEvent,
  recommendWithOptionalAi,
  SHOP_AI_RECOMMEND_LOCKED,
} from "../../../lib/shop/platform/service";

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=30",
    "x-content-type-options": "nosniff",
  },
});

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim().slice(0, 200);
  const locale = (url.searchParams.get("locale") || "vi").slice(0, 8);
  const limit = Math.max(1, Math.min(8, Number(url.searchParams.get("limit") || 4) || 4));

  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);

  try {
    const products = await listPublicProducts(env.CONTENT_DB, {
      locale: (["vi", "en", "ja", "zh"].includes(locale) ? locale : "vi") as "vi" | "en" | "ja" | "zh",
      limit: 100,
    });
    const catalog: RecommendProductInput[] = products.map((product) => ({
      id: product.id,
      slug: product.slug,
      title: product.title,
      shortDescription: product.shortDescription,
      description: product.description,
      category: product.category,
      categorySlug: product.categorySlug,
      productType: product.productType,
      badges: product.badges,
      featured: product.featured,
      availability: product.availability,
      minPriceMinor: product.minPriceMinor,
      currency: product.currency,
      eyebrow: product.eyebrow,
    }));
    const envExt = env as { XAI_API_KEY?: string; SHOP_AI_RECOMMEND_ENABLED?: string };
    const xaiKey = envExt.XAI_API_KEY ?? null;
    const featureFlag = envExt.SHOP_AI_RECOMMEND_ENABLED ?? null;
    // AI path locked until operator sets SHOP_AI_RECOMMEND_ENABLED=1 + XAI_API_KEY
    // and flips SHOP_AI_RECOMMEND_LOCKED in platform/service.ts.
    const recommendation = await recommendWithOptionalAi(catalog, q, {
      limit,
      locale,
      xaiApiKey: xaiKey,
      featureFlag,
    });
    void logAttributionEvent(env.CONTENT_DB, {
      eventType: "recommend",
      channel: "web",
      productSlug: recommendation.results[0]?.product.slug ?? null,
      payload: {
        query: q.slice(0, 120),
        engine: recommendation.engine,
        count: recommendation.results.length,
        aiLocked: SHOP_AI_RECOMMEND_LOCKED,
      },
    });
    return json({
      ok: true,
      ...recommendation,
      aiEnabled: isShopAiRecommendEnabled({ xaiApiKey: xaiKey, featureFlag }),
      aiLocked: SHOP_AI_RECOMMEND_LOCKED,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "shop_recommend_failed",
      code: error instanceof Error ? error.message : "unknown",
    }));
    return json({ ok: false, code: "recommend_failed" }, 503);
  }
};

export const ALL: APIRoute = ({ request }) => request.method === "GET"
  ? GET({ request } as Parameters<NonNullable<typeof GET>>[0])
  : json({ ok: false, code: "method_not_allowed" }, 405);
