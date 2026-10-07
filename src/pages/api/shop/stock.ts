import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { locales, type Locale } from "../../../i18n/dictionaries";
import { listPublicVariantStock } from "../../../lib/shop/service";

export const prerender = false;

const MAX_IDS = 30;
const localeSet = new Set<string>(locales);

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  },
});

function parseIds(request: Request): string[] {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("ids") || url.searchParams.get("variantIds") || "";
  if (fromQuery) {
    return fromQuery.split(",").map((value) => value.trim()).filter(Boolean).slice(0, MAX_IDS);
  }
  return [];
}

function parseLocale(value: unknown): Locale {
  return localeSet.has(value as string) ? value as Locale : "en";
}

export const GET: APIRoute = async ({ request }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  const ids = parseIds(request);
  if (!ids.length) return json({ ok: false, code: "variant_ids_required" }, 400);
  try {
    const variants = await listPublicVariantStock(env, ids, parseLocale(new URL(request.url).searchParams.get("locale")));
    return json({ ok: true, variants });
  } catch (error) {
    console.error(JSON.stringify({
      event: "public_stock_lookup_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }));
    return json({ ok: false, code: "stock_unavailable" }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!env.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, code: "invalid_json" }, 400);
  }
  const ids = Array.isArray((payload as { variantIds?: unknown })?.variantIds)
    ? (payload as { variantIds: unknown[] }).variantIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS)
    : parseIds(request);
  if (!ids.length) return json({ ok: false, code: "variant_ids_required" }, 400);
  try {
    const variants = await listPublicVariantStock(env, ids, parseLocale((payload as { locale?: unknown })?.locale));
    return json({ ok: true, variants });
  } catch (error) {
    console.error(JSON.stringify({
      event: "public_stock_lookup_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }));
    return json({ ok: false, code: "stock_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
