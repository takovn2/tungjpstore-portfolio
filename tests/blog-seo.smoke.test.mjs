import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { blogCopy, blogFeedPath, blogLanguageTag } from "../src/i18n/blog.ts";
import { estimateReadingMinutes, validIsoDate } from "../src/lib/blog.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function loadFeedBuilder() {
  globalThis.__blogFeedTestStubs = { blogFeedPath, blogLanguageTag, validIsoDate };
  const source = compile(read("src/lib/blog-feed.ts")).replace(/^import\s+.*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(`const { blogFeedPath, blogLanguageTag, validIsoDate } = globalThis.__blogFeedTestStubs;\n${source}`).toString("base64")}`);
}

test("publication copy has a complete, localized shape with Vietnamese as the default", () => {
  const keys = Object.keys(blogCopy.vi).sort();
  for (const locale of ["vi", "en", "ja", "zh"]) {
    assert.deepEqual(Object.keys(blogCopy[locale]).sort(), keys, `${locale} blog copy shape`);
    assert.ok(blogCopy[locale].heading.length > 8);
    assert.ok(blogCopy[locale].metaDescription.length > 40);
    assert.ok(blogCopy[locale].readArticle.length > 2);
  }
  assert.equal(blogFeedPath("vi"), "/rss.xml");
  assert.equal(blogFeedPath("en"), "/en/rss.xml");
  assert.notEqual(blogCopy.vi.heading, blogCopy.en.heading);
  assert.notEqual(blogCopy.ja.readArticle, blogCopy.zh.readArticle);
});

test("reading time handles Latin and CJK article bodies without adding CMS fields", () => {
  assert.equal(estimateReadingMinutes([]), 1);
  assert.equal(estimateReadingMinutes([{ type: "paragraph", text: "A short note." }]), 1);
  assert.ok(estimateReadingMinutes([{ type: "paragraph", text: "x ".repeat(450) }]) >= 3);
  assert.ok(estimateReadingMinutes([{ type: "paragraph", text: "設計と運用".repeat(300) }]) >= 2);
});

test("RSS is valid, escaped, locale-isolated and excludes repository references", async () => {
  const { buildBlogFeed } = await loadFeedBuilder();
  const feed = buildBlogFeed({
    baseUrl: new URL("https://tung.codes"),
    locale: "vi",
    copy: blogCopy.vi,
    posts: [{
      slug: "safe-note",
      title: "A & <safe> note",
      category: "Hạ tầng",
      excerpt: "A useful <summary> & a clear decision.",
      seoTitle: "Safe note",
      seoDescription: "Safe note",
      status: "Nghiên cứu",
      image: null,
      imageAlt: "Safe note",
      body: [],
      surface: "blog",
      publishedAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    }, {
      slug: "lab-only",
      title: "Internal research note",
      category: "Research",
      excerpt: "This belongs to the lab surface.",
      seoTitle: "Internal research note",
      seoDescription: "Internal research note",
      status: "Research",
      image: null,
      imageAlt: "Research note",
      body: [],
      surface: "lab",
      publishedAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    }],
  });
  assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(feed, /A &amp; &lt;safe&gt; note/);
  assert.match(feed, /<language>vi-VN<\/language>/);
  assert.match(feed, /<link>https:\/\/tung.codes\/blog\/safe-note<\/link>/);
  assert.match(feed, /<pubDate>/);
  assert.doesNotMatch(feed, /lab-only|Internal research note/);
  assert.doesNotMatch(feed, /github\.com|GitHub/i);

  const empty = buildBlogFeed({ baseUrl: new URL("https://tung.codes"), locale: "ja", copy: blogCopy.ja, posts: [] });
  assert.match(empty, /<language>ja-JP<\/language>/);
  assert.doesNotMatch(empty, /<item>/);
  assert.doesNotMatch(empty, /\/vi\//);
});

test("public article surfaces expose Article metadata, breadcrumbs, RSS discovery and empty state", () => {
  const layout = read("src/layouts/BaseLayout.astro");
  const lab = read("src/components/pages/LabPage.astro");
  const post = read("src/components/pages/PostPage.astro");
  const sitemap = read("src/pages/sitemap.xml.ts");
  const detail = read("src/pages/lab/[slug].astro");
  const localizedDetail = read("src/pages/[lang]/[...slug].astro");
  const blog = read("src/components/pages/BlogPage.astro");
  const contentStore = read("src/lib/content-store.ts");
  assert.match(layout, /ogType\?: "website" \| "article"/);
  assert.match(layout, /article:published_time/);
  assert.match(layout, /application\/rss\+xml/);
  assert.match(lab, /publication-card/);
  assert.match(lab, /publication-empty/);
  assert.match(lab, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(post, /"@type": "Article"/);
  assert.match(post, /"@type": "BreadcrumbList"/);
  assert.match(post, /structuredData=\{\[articleSchema, breadcrumbSchema\]\}/);
  assert.match(post, /articleImage = new URL\(post\.image \?\? "\/og\/default\.png"/);
  assert.match(post, /"@id": "https:\/\/tung.codes\/#person"/);
  assert.match(post, /estimateReadingMinutes/);
  assert.match(post, /<div class="cms-prose">/);
  assert.doesNotMatch(post, /class="cms-prose reveal"/);
  assert.match(sitemap, /lastmod/);
  assert.match(detail, /loadPublicContentItem/);
  assert.match(localizedDetail, /loadPublicContentItem/);
  assert.match(blog, /localizePath\(`\/blog\/\$\{post\.slug\}`/);
  assert.match(blog, /meta\.surface|surface/);
  assert.match(contentStore, /SELECT DISTINCT l\.locale/);
  assert.match(contentStore, /MIN\(history\.published_at\)/);
  assert.doesNotMatch(post, /github\.com|GitHub/i);
  assert.doesNotMatch(lab, /github\.com|GitHub/i);
});

test("SEO identity and feeds stay canonical across the public editorial surfaces", () => {
  const layout = read("src/layouts/BaseLayout.astro");
  const post = read("src/components/pages/PostPage.astro");
  const feed = read("src/lib/blog-feed.ts");
  assert.match(layout, /"@id": "https:\/\/tung\.codes\/#person"/);
  assert.match(layout, /description: t\.about\.metaDescription/);
  assert.match(layout, /hreflang="x-default"/);
  assert.match(layout, /canonicalPath = Astro\.url\.pathname/);
  assert.match(post, /author: \{ "@id": "https:\/\/tung\.codes\/#person"/);
  assert.match(post, /publisher: \{ "@id": "https:\/\/tung\.codes\/#person"/);
  assert.match(feed, /\.filter\(\(post\) => post\.surface === "blog"\)/);
});

test("x-default points at the global fallback, not at the Vietnamese page", () => {
  const layout = read("src/layouts/BaseLayout.astro");
  const middleware = read("src/middleware.ts");
  // x-default is the page served to a visitor whose language matches none of the
  // announced alternates. Pinning it to `vi` told search engines that Vietnamese
  // was the catch-all for a site expanding beyond Vietnam, and contradicted the
  // geo router, which sends every unrecognised country to `en`.
  assert.doesNotMatch(
    layout,
    /hreflang="x-default"[^>]*localizePath\(canonicalPath, "vi"\)/,
    "x-default must not be pinned to vi",
  );
  assert.match(layout, /xDefaultLocale/, "x-default must be resolved through a named binding");
  assert.match(layout, /alternateLocales\.includes\("en"\) \? "en"/);

  // The fallback must agree with where the geo router actually sends people.
  // The router now resolves a market rather than a bare locale, so check the
  // market layer: an unrecognised country must land on the default market, and
  // that market's locale must be the one x-default points at.
  assert.match(middleware, /resolveMarket\(/, "the geo router must resolve a market");
  assert.doesNotMatch(middleware, /localeForCountry\(/, "the router must not fall back to the bare country map");
  const market = read("src/lib/shop/market.ts");
  assert.match(market, /DEFAULT_MARKET_CODE = "GLOBAL"/);
  assert.match(market, /locale: "en"/, "the default market's locale must match x-default");
  // localeForCountry is still the fallback for resolveRequestLocale (pages and
  // API routes that have no market context), and it must agree on `en`.
  const preference = read("src/i18n/locale-preference.ts");
  assert.match(preference, /return "en"/, "unmatched countries must still resolve to en");
});

test("blog is canonical while lab remains the research-notes surface", () => {
  const routes = [
    "src/pages/blog.astro",
    "src/pages/blog/[slug].astro",
    "src/pages/[lang]/[...slug].astro",
    "src/components/pages/PostPage.astro",
  ].map(read).join("\n");
  assert.match(routes, /\/blog/);
  assert.match(routes, /surface === "blog"/);
  assert.match(routes, /\/lab/);
  assert.doesNotMatch(read("src/pages/blog.astro"), /LabPage/);
});

test("RSS routes keep default and localized feeds separate and fail closed", () => {
  const defaultFeed = read("src/pages/rss.xml.ts");
  const localizedFeed = read("src/pages/[lang]/rss.xml.ts");
  assert.match(defaultFeed, /defaultLocale/);
  assert.match(defaultFeed, /status: 503/);
  assert.match(localizedFeed, /locale === "vi"/);
  assert.match(localizedFeed, /status: 404/);
  assert.match(localizedFeed, /status: 503/);
  assert.match(localizedFeed, /publishedBlogPosts\(snapshot\)/);
});
