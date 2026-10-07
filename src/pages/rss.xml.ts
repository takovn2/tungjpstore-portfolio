import type { APIRoute } from "astro";
import { defaultLocale } from "../i18n/dictionaries";
import { getBlogCopy } from "../i18n/blog";
import { buildBlogFeed } from "../lib/blog-feed";
import { publishedBlogPosts, setPublicCache } from "../lib/public-content";
import { loadPublicSnapshot } from "../lib/public-runtime";

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const snapshot = await loadPublicSnapshot(defaultLocale);
  const unavailable = snapshot.status === "unavailable";
  const headers = new Headers({ "content-type": "application/rss+xml; charset=utf-8" });
  setPublicCache(headers, unavailable ? "unavailable" : "ok");
  if (unavailable) {
    return new Response("", { status: 503, headers });
  }
  headers.set("content-language", "vi-VN");
  return new Response(buildBlogFeed({ baseUrl: site ?? new URL("https://tung.codes"), locale: defaultLocale, copy: getBlogCopy(defaultLocale), posts: publishedBlogPosts(snapshot) }), { headers });
};
