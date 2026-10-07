import type { APIRoute } from "astro";
import { locales, localizePath, type Locale } from "../i18n/dictionaries";
import { loadPublicSnapshot } from "../lib/public-runtime";
import { publishedPosts, publishedProjects, setPublicCache } from "../lib/public-content";

export const prerender = false;

const alwaysPublicSlugs = ["about", "privacy", "terms-of-service", "refund-policy", "pricing"] as const;
const fallbackProjectSlugs = ["logivn", "fball"] as const;

const xmlEscape = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const hreflangTag = (locale: string) => (locale === "zh" ? "zh-Hans" : locale);

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL("https://tung.codes");
  // Keyed by the UNLOCALIZED path, then per locale, so each URL can carry the
  // full hreflang cluster of its siblings. Alternates are only emitted for
  // locales where the path actually exists: pointing at an unpublished locale
  // would advertise URLs that 404.
  const paths = new Map<string, Map<Locale, string | null>>();
  const addPath = (path: string, locale: Locale, lastmod?: string | null) => {
    let perLocale = paths.get(path);
    if (!perLocale) {
      perLocale = new Map<Locale, string | null>();
      paths.set(path, perLocale);
    }
    const current = perLocale.get(locale);
    if (!current || (lastmod && lastmod > current)) perLocale.set(locale, lastmod ?? current ?? null);
  };
  let contentAvailable = true;
  for (const locale of locales) {
    for (const slug of alwaysPublicSlugs) addPath(`/${slug}`, locale as Locale);
    addPath("/shop", locale as Locale);

    const snapshot = await loadPublicSnapshot(locale as Locale, { includeShop: true });
    if (snapshot.status === "unavailable") {
      contentAvailable = false;
      continue;
    }

    const publishedSections = new Set(
      (snapshot.items ?? [])
        .filter((item: { type: string; slug: string }) => item.type === "site_section")
        .map((item: { slug: string }) => item.slug),
    );
    const homeManaged = snapshot.managedSlugs.site_section.includes("home-hero");
    const contactManaged = snapshot.managedSlugs.site_section.includes("contact-profile");
    if (!homeManaged || publishedSections.has("home-hero")) addPath("/", locale as Locale);
    if (!contactManaged || publishedSections.has("contact-profile")) addPath("/contact", locale as Locale);
    addPath("/work", locale as Locale);
    addPath("/lab", locale as Locale);
    addPath("/blog", locale as Locale);

    for (const product of snapshot.shopProducts ?? []) addPath(`/shop/${product.slug}`, locale as Locale);

    const projects = snapshot.managedSlugs.project.length > 0
      ? publishedProjects(snapshot).filter((project) => !project.research)
      : fallbackProjectSlugs.map((slug) => ({ slug }));
    for (const project of projects) addPath(`/work/${project.slug}`, locale as Locale, "updatedAt" in project ? project.updatedAt : "publishedAt" in project ? project.publishedAt : null);
    if (snapshot.managedSlugs.post.length > 0) {
      for (const post of publishedPosts(snapshot)) {
        const surface = post.surface === "blog" ? "blog" : "lab";
        addPath(`/${surface}/${post.slug}`, locale as Locale, post.updatedAt ?? post.publishedAt);
      }
    }
  }

  const urls = [...paths.entries()].flatMap(([path, perLocale]) => {
    const available = locales.filter((item) => perLocale.has(item as Locale)) as Locale[];
    if (!available.length) return [];
    // Prefer English as the global fallback. If this path was never published in
    // English, fall back to any locale that does exist rather than emitting an
    // x-default that resolves to a 404.
    const defaultForPath = available.includes("en" as Locale) ? ("en" as Locale) : available[0];
    const absolute = (locale: Locale) => xmlEscape(new URL(localizePath(path, locale), base).href);
    return available.map((locale) => {
      const lastmod = perLocale.get(locale);
      const alternates = available
        .map((item) => `<xhtml:link rel="alternate" hreflang="${hreflangTag(item)}" href="${absolute(item)}"/>`)
        .join("");
      const xDefault = `<xhtml:link rel="alternate" hreflang="x-default" href="${absolute(defaultForPath)}"/>`;
      const lastmodTag = lastmod && !Number.isNaN(Date.parse(lastmod))
        ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`
        : "";
      return `<url><loc>${absolute(locale)}</loc>${lastmodTag}${alternates}${xDefault}</url>`;
    });
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`
    + `${urls.join("")}</urlset>`;
  const headers = new Headers({ "content-type": "application/xml; charset=utf-8" });
  setPublicCache(headers, contentAvailable ? "ok" : "unavailable");
  return new Response(body, { status: contentAvailable ? 200 : 503, headers });
};
