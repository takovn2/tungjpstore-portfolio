import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultLocale, locales, localizePath, translations } from "../src/i18n/dictionaries.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pageSlugs = [
  "",
  "work",
  "work/logivn",
  "work/payment-infrastructure",
  "work/fball",
  "about",
  "blog",
  "lab",
  "contact",
  "privacy",
  "terms-of-service",
  "refund-policy",
  "pricing",
];

const routePath = (slug) => (slug ? `/${slug}` : "/");

test("Vietnamese is the unprefixed default locale", () => {
  assert.equal(defaultLocale, "vi");
  assert.deepEqual(locales, ["vi", "en", "ja", "zh"]);

  for (const slug of pageSlugs) {
    assert.equal(localizePath(routePath(slug), "vi"), routePath(slug));
  }
});

test("localized route matrix is stable and preserves suffixes", () => {
  for (const locale of locales) {
    for (const slug of pageSlugs) {
      const basePath = routePath(slug);
      const expected = locale === "vi" ? basePath : `/${locale}${basePath === "/" ? "" : basePath}`;
      assert.equal(localizePath(basePath, locale), expected);
    }
  }

  assert.equal(localizePath("/en/work?from=nav#cases", "ja"), "/ja/work?from=nav#cases");
  assert.equal(localizePath("/zh", "vi"), "/");
});

test("every locale exposes the same translation shape", () => {
  const shape = (value) => {
    if (Array.isArray(value)) return [];
    if (!value || typeof value !== "object") return typeof value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  };

  const viShape = shape(translations.vi);
  for (const locale of locales) assert.deepEqual(shape(translations[locale]), viShape);

  for (const locale of locales) {
    const copy = translations[locale];
    assert.ok(copy.home.metaTitle.trim(), `${locale} home meta title is empty`);
    assert.ok(copy.home.metaDescription.trim(), `${locale} home meta description is empty`);
    assert.ok(copy.home.primaryCta.trim(), `${locale} primary CTA is empty`);
    assert.ok(copy.home.contactCta.cta.trim(), `${locale} contact CTA is empty`);
    assert.ok(copy.projects.logivn.summary.trim(), `${locale} LogiVN summary is empty`);
    assert.ok(copy.projects.fball.summary.trim(), `${locale} Fball summary is empty`);
  }

  assert.notEqual(translations.vi.home.primaryCta, translations.en.home.primaryCta);
  assert.notEqual(translations.ja.home.contactCta.cta, translations.zh.home.contactCta.cta);
});

test("Fball copy describes the public product without internal rollout notes", () => {
  const expectations = {
    vi: {
      live: /tìm đội[\s\S]*ghép trận[\s\S]*sân bóng/i,
      internal: /cờ tính năng|gated|không công bố|chưa có nguồn|in-progress/i,
    },
    en: {
      live: /finding teams[\s\S]*arranging matches[\s\S]*browsing venues/i,
      internal: /feature flags|gated|no public claims|without verifiable|in-progress/i,
    },
    ja: {
      live: /チーム探し[\s\S]*対戦調整[\s\S]*会場探し/,
      internal: /フィーチャーフラグ|公開しない|検証できない|in-progress/i,
    },
    zh: {
      live: /找球队[\s\S]*约比赛[\s\S]*查找球场/,
      internal: /功能开关|不公开|没有可验证|in-progress/i,
    },
  };

  for (const locale of locales) {
    const fball = translations[locale].projects.fball;
    const publicCopy = [fball.summary, ...fball.context, ...fball.outcomes, fball.currentState, ...fball.evidence].join("\n");
    assert.ok(fball.evidence.length >= 3, `${locale} Fball project story should stay complete`);
    assert.match(publicCopy, expectations[locale].live, `${locale} must describe live Fball discovery`);
    assert.doesNotMatch(publicCopy, expectations[locale].internal, `${locale} must not expose internal rollout notes`);
  }

  assert.doesNotMatch(translations.en.projects.fball.context.join(" "), /controlled expansion paths/i);
});

test("language UI and Vietnamese redirects preserve URL suffixes", () => {
  const header = readFileSync(`${projectRoot}/src/components/Header.astro`, "utf8");
  assert.match(header, /Astro\.url\.pathname\}\$\{Astro\.url\.search/);
  assert.match(header, /data-language-link/);
  assert.match(header, /target\.search = window\.location\.search/);
  assert.match(header, /target\.hash = window\.location\.hash/);

  const localizedRoute = readFileSync(`${projectRoot}/src/pages/[lang]/[...slug].astro`, "utf8");
  const localizedIndex = readFileSync(`${projectRoot}/src/pages/[lang]/index.astro`, "utf8");
  assert.match(localizedRoute, /\$\{Astro\.url\.search\}/);
  assert.match(localizedIndex, /\$\{Astro\.url\.search\}/);
  assert.match(localizedRoute, /if \(rawLang === "vi"\) return Astro\.redirect\([\s\S]*, 308\)/);
  assert.match(localizedIndex, /if \(rawLang === "vi"\) return Astro\.redirect\([\s\S]*, 308\)/);
  assert.match(localizedRoute, /export const prerender = false/);
  assert.match(localizedIndex, /export const prerender = false/);
  assert.doesNotMatch(localizedRoute, /function getStaticPaths/);
  assert.doesNotMatch(localizedIndex, /function getStaticPaths/);
  assert.match(localizedRoute, /setPublicCache\(Astro\.response\.headers\)/);
  assert.match(localizedIndex, /setPublicCache\(Astro\.response\.headers\)/);
});

test("default pages, localized dispatcher and sitemap cover the route matrix", () => {
  const defaultPageFiles = {
    "": "src/pages/index.astro",
    work: "src/pages/work/index.astro",
    "work/logivn": "src/pages/work/logivn.astro",
    "work/payment-infrastructure": "src/pages/work/payment-infrastructure.astro",
    "work/fball": "src/pages/work/fball.astro",
    about: "src/pages/about.astro",
    blog: "src/pages/blog.astro",
    lab: "src/pages/lab.astro",
    contact: "src/pages/contact.astro",
    privacy: "src/pages/privacy.astro",
    "terms-of-service": "src/pages/terms-of-service.astro",
    "refund-policy": "src/pages/refund-policy.astro",
    pricing: "src/pages/pricing.astro",
  };

  for (const file of Object.values(defaultPageFiles)) {
    assert.equal(existsSync(`${projectRoot}/${file}`), true, `missing ${file}`);
  }

  const localizedDispatcher = readFileSync(`${projectRoot}/src/pages/[lang]/[...slug].astro`, "utf8");
  for (const slug of ["work", "about", "lab", "blog", "contact", "privacy", "terms-of-service", "refund-policy", "pricing"]) {
    assert.equal(localizedDispatcher.includes(`"${slug}"`), true, `localized dispatcher missing ${slug}`);
  }
  assert.match(localizedDispatcher, /first === "work"/);
  assert.match(localizedDispatcher, /projectManaged/);
  assert.match(localizedDispatcher, /first === "lab"/);
  assert.match(localizedDispatcher, /first === "blog"/);
  assert.match(localizedDispatcher, /postItem/);

  const sitemap = readFileSync(`${projectRoot}/src/pages/sitemap.xml.ts`, "utf8");
  assert.match(sitemap, /export const prerender = false/);
  assert.match(sitemap, /loadPublicSnapshot/);
  assert.match(sitemap, /publishedProjects/);
  assert.match(sitemap, /publishedPosts/);
  assert.match(sitemap, /setPublicCache/);
  assert.match(sitemap, /localizePath/);
  assert.doesNotMatch(sitemap, /const paths = \[/);
});
