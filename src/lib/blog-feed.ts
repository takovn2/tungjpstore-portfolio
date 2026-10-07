import type { Locale } from "../i18n/dictionaries";
import { blogFeedPath, blogLanguageTag, type BlogCopy } from "../i18n/blog";
import type { PublicPost } from "./public-content";
import { validIsoDate } from "./blog";

export const xmlEscape = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

interface FeedInput {
  baseUrl: URL;
  locale: Locale;
  copy: BlogCopy;
  posts: PublicPost[];
}

export function buildBlogFeed({ baseUrl, locale, copy, posts }: FeedInput) {
  const feedUrl = new URL(blogFeedPath(locale), baseUrl).href;
  const publicationUrl = new URL(locale === "vi" ? "/blog" : `/${locale}/blog`, baseUrl).href;
  const items = posts
    .filter((post) => post.surface === "blog")
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
    .map((post) => {
      const url = new URL(locale === "vi" ? `/blog/${post.slug}` : `/${locale}/blog/${post.slug}`, baseUrl).href;
      const publishedAt = validIsoDate(post.publishedAt);
      return `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(url)}</link><guid isPermaLink="true">${xmlEscape(url)}</guid><description>${xmlEscape(post.excerpt)}</description>${publishedAt ? `<pubDate>${new Date(publishedAt).toUTCString()}</pubDate>` : ""}</item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xmlEscape(copy.publicationName)}</title><link>${xmlEscape(publicationUrl)}</link><description>${xmlEscape(copy.publicationDescription)}</description><language>${xmlEscape(blogLanguageTag[locale])}</language><atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
}
