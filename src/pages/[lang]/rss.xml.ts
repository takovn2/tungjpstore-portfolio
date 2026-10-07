import type { APIRoute } from "astro";
import { locales, type Locale } from "../../i18n/dictionaries";
import { blogLanguageTag, getBlogCopy } from "../../i18n/blog";
import { buildBlogFeed } from "../../lib/blog-feed";
import { publishedBlogPosts, setPublicCache } from "../../lib/public-content";
import { loadPublicSnapshot } from "../../lib/public-runtime";

export const prerender = false;

export const GET: APIRoute = async ({ params, site }) => {
  const rawLocale = String(params.lang ?? "");
  const locale = (locales as readonly string[]).includes(rawLocale) ? rawLocale as Locale : null;
  const headers = new Headers({ "content-type": "application/rss+xml; charset=utf-8" });
  if (!locale || locale === "vi") {
    setPublicCache(headers, "not-found");
    return new Response("", { status: 404, headers });
  }
  const snapshot = await loadPublicSnapshot(locale);
  const unavailable = snapshot.status === "unavailable";
  setPublicCache(headers, unavailable ? "unavailable" : "ok");
  if (unavailable) return new Response("", { status: 503, headers });
  const baseUrl = site ?? new URL("https://tung.codes");
  const feed = buildBlogFeed({ baseUrl, locale, copy: getBlogCopy(locale), posts: publishedBlogPosts(snapshot) });
  headers.set("content-language", blogLanguageTag[locale]);
  return new Response(feed, { headers });
};
