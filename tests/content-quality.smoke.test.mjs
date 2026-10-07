import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { locales, translations } from "../src/i18n/dictionaries.ts";
import { projects } from "../src/content/projects.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("public content helper can only expose a published, locale-specific revision", async () => {
  const source = compile(read("src/lib/content-store.ts"));
  const { getPublishedContent } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...values) {
          assert.deepEqual(values, ["ja", "project", "logivn"]);
          return {
            first: async () => ({
              id: "project-1",
              type: "project",
              slug: "logivn",
              item_status: "published",
              deleted_at: null,
              sort_order: 0,
              version: 3,
              meta_json: '{"liveUrl":"https://logivn.com"}',
              localized_json: '{"title":"LogiVN","excerpt":"A product.","body":[]}',
              cover_media_id: null,
              cover_object_key: null,
              cover_alt: null,
              published_at: "2026-07-23T00:00:00.000Z",
            }),
          };
        },
      };
    },
  };
  const result = await getPublishedContent(db, { type: "project", slug: "logivn", locale: "ja" });
  assert.equal(result?.locale, "ja");
  assert.equal(result?.version, 3);
  assert.equal(result?.content.title, "LogiVN");
  assert.match(queries[0], /r\.status = 'published'/);
  assert.match(queries[0], /ci\.deleted_at IS NULL/);
  assert.match(queries[0], /l\.locale = \?/);

  const missing = await getPublishedContent(undefined, { type: "project", slug: "logivn", locale: "vi" });
  assert.equal(missing, null);
});

test("verified project facts and action links remain visible in the public story", () => {
  const logivn = projects.find((project) => project.slug === "logivn");
  const fball = projects.find((project) => project.slug === "fball");
  assert.ok(logivn && fball);
  assert.equal(logivn.links.find((link) => link.label === "Open LogiVN")?.href, "https://logivn.com");
  assert.equal(fball.links.find((link) => link.label === "Open Fball.vn")?.href, "https://fball.vn");
  assert.equal(logivn.links.some((link) => /github\.com/i.test(link.href)), false);
  assert.equal(fball.links.some((link) => /github\.com/i.test(link.href)), false);
  assert.doesNotMatch(fball.currentState, /sports content platform/i);
  assert.match(fball.currentState, /publicly accessible/i);
  assert.match(logivn.currentState, /logivn\.com/i);
  for (const project of [logivn, fball]) {
    assert.ok(project.summary.length > 80);
    assert.ok(project.outcomes.length >= 2);
    assert.ok(project.reflection.length > 40);
    for (const link of project.links) assert.match(link.href, /^https:\/\//);
  }
});

test("public project status labels stay localized when CMS metadata is incomplete", async () => {
  const source = compile(read("src/lib/public-content.ts"));
  const { projectFromPublished } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const expected = { vi: "Đang mở rộng", en: "Expanding", ja: "拡張中", zh: "扩展中" };
  for (const locale of Object.keys(expected)) {
    const project = projectFromPublished({
      id: `status-${locale}`,
      type: "project",
      slug: "fball",
      sortOrder: 1,
      version: 1,
      meta: { status: "expanding", statusLabel: "Đang mở rộng" },
      locale,
      content: { title: "Fball.vn", eyebrow: "Club", excerpt: "Public club product", body: [] },
      coverMediaId: null,
      coverObjectKey: null,
      coverUrl: null,
      coverAlt: null,
      publishedAt: null,
    });
    assert.equal(project.status, expected[locale]);
  }

  const legacyVietnamese = projectFromPublished({
    id: "status-legacy-vi",
    type: "project",
    slug: "legacy-project",
    sortOrder: 1,
    version: 1,
    meta: { status: "custom", statusLabel: "Đang vận hành thử" },
    locale: "vi",
    content: { title: "Legacy", eyebrow: "Project", excerpt: "Legacy project", body: [] },
    coverMediaId: null,
    coverObjectKey: null,
    coverUrl: null,
    coverAlt: null,
    publishedAt: null,
  });
  assert.equal(legacyVietnamese.status, "Đang vận hành thử");
});

test("public mapper ignores malformed CMS body shapes instead of throwing", async () => {
  const source = compile(read("src/lib/public-content.ts"));
  const { projectFromPublished } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const malformed = projectFromPublished({
    id: "malformed-body",
    type: "project",
    slug: "malformed-body",
    sortOrder: 1,
    version: 1,
    meta: { status: "active" },
    locale: "en",
    content: { title: "Malformed", eyebrow: "Project", excerpt: "Safe", body: "not-an-array" },
    coverMediaId: null,
    coverObjectKey: null,
    coverUrl: null,
    coverAlt: null,
    publishedAt: null,
  });
  assert.equal(malformed.thesis, "Safe");
  assert.equal(malformed.body, null);
});

test("public mapper strips repository references from CMS text fields and body blocks", async () => {
  const source = compile(read("src/lib/public-content.ts"));
  const { projectFromPublished } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const project = projectFromPublished({
    id: "repository-reference",
    type: "project",
    slug: "repository-reference",
    sortOrder: 1,
    version: 1,
    meta: { status: "active", statusLabel: "github.com/example/private" },
    locale: "vi",
    content: {
      title: "github.com/example/private",
      eyebrow: "Dự án",
      excerpt: "Chi tiết tại https://github.com/example/private",
      seoTitle: "github.com/example/private",
      seoDescription: "Không công khai github.com/example/private",
      body: [
        { type: "paragraph", text: "Mã nguồn tại github.com/example/private" },
        { type: "list", items: ["Thông tin an toàn", "github.com/example/private"] },
        { type: "paragraph", text: "Thông tin sản phẩm công khai" },
      ],
    },
    coverMediaId: null,
    coverObjectKey: null,
    coverUrl: null,
    coverAlt: "github.com/example/private",
    publishedAt: null,
  });

  assert.equal(project.name, "repository-reference");
  assert.equal(project.summary, "");
  assert.equal(project.seoTitle, "repository-reference");
  assert.equal(project.imageAlt, "repository-reference");
  assert.deepEqual(project.body, [{ type: "paragraph", text: "Thông tin sản phẩm công khai" }]);
});

test("public URL guards reject repository host variants and credential-bearing links", async () => {
  const source = compile(read("src/lib/public-content.ts"));
  const { projectFromPublished } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const base = {
    id: "unsafe-url",
    type: "project",
    slug: "unsafe-url",
    sortOrder: 1,
    version: 1,
    meta: { status: "active" },
    locale: "vi",
    content: { title: "Unsafe URL", eyebrow: "Project", excerpt: "Safe", body: [] },
    coverMediaId: null,
    coverObjectKey: null,
    coverUrl: null,
    coverAlt: "Unsafe URL",
    publishedAt: null,
  };
  assert.equal(projectFromPublished({ ...base, meta: { liveUrl: "https://github.com./owner/private" } }).liveUrl, null);
  assert.equal(projectFromPublished({ ...base, meta: { liveUrl: "https://gist.github.com/owner/private" } }).liveUrl, null);
  assert.equal(projectFromPublished({ ...base, meta: { liveUrl: "https://user:password@example.com/live" } }).liveUrl, null);
  assert.equal(projectFromPublished({ ...base, meta: { liveUrl: "https://example.com/live" } }).liveUrl, "https://example.com/live");
});

test("each locale keeps a visible primary CTA and project proof links", () => {
  const home = read("src/components/pages/HomePage.astro");
  const work = read("src/components/pages/WorkPage.astro");
  const caseStudy = read("src/components/pages/CaseStudyPage.astro");
  assert.match(home, /class="button-link primary"/);
  assert.match(home, /localizePath\("\/work", locale\)/);
  assert.match(home, /localizePath\("\/contact", locale\)/);
  assert.match(work, /https:\/\/logivn\.com/);
  assert.match(work, /https:\/\/fball\.vn/);
  assert.doesNotMatch(home, /github\.com|repoUrl|GitHub/i);
  assert.doesNotMatch(work, /github\.com|repoUrl|GitHub/i);
  assert.match(caseStudy, /class="button-link primary"/);
  assert.match(caseStudy, /localizePath\("\/contact", locale\)/);
  assert.match(caseStudy, /target="_blank" rel="noreferrer"/);
  for (const locale of locales) {
    assert.ok(translations[locale].home.primaryCta.trim());
    assert.ok(translations[locale].home.contactCta.cta.trim());
    assert.ok(translations[locale].work.openProject.trim());
  }
});

test("public project surfaces do not expose internal status or review labels", () => {
  for (const file of [
    "src/components/pages/HomePage.astro",
    "src/components/pages/WorkPage.astro",
    "src/components/HomeProjectShowcase.astro",
    "src/components/SkillMatrix.astro",
    "src/components/CaseEvidence.astro",
  ]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      new RegExp("Chỉ dấu kiểm chứng|Verifiable signals|ADR /|Builder's field note|Đang vận hành /|Operating /|Researching /", "i"),
    );
  }
});

test("bundled content and editorial docs do not expose project repositories", () => {
  const dictionaries = read("src/i18n/dictionaries.ts");
  const contentGuide = read("CONTENT.md");
  const readme = read("README.md");
  const projectRepository = /github\.com\/Tungjpstore\/(?:sassoder|fball\.vn)/i;

  assert.doesNotMatch(dictionaries, projectRepository);
  assert.doesNotMatch(contentGuide, projectRepository);
  assert.doesNotMatch(readme, projectRepository);
});

test("the default Hero portrait stays fast, localized and replaceable from CMS", () => {
  const home = read("src/components/pages/HomePage.astro");
  const visual = read("src/components/ProjectVisual.astro");
  const css = read("src/styles/globals.css");
  const heroAsset = statSync(`${projectRoot}/public/images/tung-hero-v2.webp`);

  assert.match(home, /heroContent\?\.image \|\| "\/images\/tung-hero-v2\.webp"/);
  assert.match(home, /heroImageAltByLocale: Record<Locale, string>/);
  assert.match(home, /data-hero-media=\{heroContent\?\.image \? "cms" : "portrait"\}/);
  assert.match(home, /loading="eager"/);
  assert.match(visual, /fetchpriority=\{loading === "eager" \? "high" : undefined\}/);
  assert.match(css, /hero-proof\[data-hero-media="portrait"\]/);
  assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.hero--editorial \.display[\s\S]*max-width: 15ch/);
  assert.match(css, /\.hero--editorial \.hero-proof \{ align-self: start; margin-top: 2rem; \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.display \{[\s\S]*13\.5vw/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.hero--editorial \.display[\s\S]*12\.5vw/);
  assert.ok(heroAsset.size < 100 * 1024, "Hero WebP should stay below 100 KiB");
});

test("About uses the dedicated portrait, localized alt text, icons and reduced-motion-ready reveals", () => {
  const about = read("src/components/pages/AboutPage.astro");
  const icon = read("src/components/Icon.astro");
  const css = read("src/styles/globals.css");
  const portrait = statSync(`${projectRoot}/public/images/tung-about-portrait.webp`);
  assert.match(about, /tung-about-portrait\.webp/);
  assert.match(about, /portraitAlt: Record<Locale, string>/);
  assert.match(about, /<Icon name=/);
  assert.match(icon, /aria-hidden=\{labelled \? undefined : "true"\}/);
  assert.match(css, /\.about-hero__/);
  assert.match(css, /\.about-modules/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.ok(portrait.size < 100 * 1024, "About portrait should remain below 100 KiB");
});

test("case studies keep product order, stable labels and a clear CTA hierarchy", () => {
  const caseStudy = read("src/components/pages/CaseStudyPage.astro");
  const logivn = projects.find((project) => project.slug === "logivn");
  const fball = projects.find((project) => project.slug === "fball");
  const payment = projects.find((project) => project.slug === "payment-infrastructure");

  assert.match(caseStudy, /const order = \["logivn", "fball"\]/);
  assert.match(caseStudy, /logivn: "01"/);
  assert.match(caseStudy, /fball: "02"/);
  assert.match(caseStudy, /"payment-infrastructure": "LAB"/);
  assert.match(caseStudy, /const contactClass = website \? "button-link" : "button-link primary"/);

  const openProjectIndex = caseStudy.indexOf('website && <a class="button-link primary"');
  const contactIndex = caseStudy.indexOf('<a class={contactClass}');
  assert.ok(openProjectIndex >= 0 && openProjectIndex < contactIndex);
  assert.doesNotMatch(caseStudy, /https:\/\/github\.com|repoUrl|>GitHub/i);

  assert.equal(logivn?.nextSlug, "fball");
  assert.equal(fball?.nextSlug, "logivn");
  assert.equal(payment?.nextSlug, "logivn");
});

test("SEO, security and motion contracts cover public and private surfaces", () => {
  const layout = read("src/layouts/BaseLayout.astro");
  const sitemap = read("src/pages/sitemap.xml.ts");
  const robots = read("src/pages/robots.txt.ts");
  const middleware = read("src/middleware.ts");
  const headers = read("public/_headers");
  const css = read("src/styles/globals.css");
  const admin = read("src/pages/admin/index.astro");

  assert.match(layout, /rel="canonical"/);
  assert.match(layout, /hreflang="x-default"/);
  assert.match(layout, /hreflang=\{item === "zh" \? "zh-Hans" : item\}/);
  assert.doesNotMatch(sitemap, /admin/);
  assert.match(robots, /new URL\("https:\/\/tung.codes"\)/);
  assert.match(robots, /new URL\("\/sitemap\.xml", base\)\.href/);
  assert.match(middleware, /X-Frame-Options/);
  assert.match(middleware, /frame-ancestors 'none'/);
  assert.match(middleware, /Referrer-Policy/);
  assert.match(middleware, /img-src[^;]*https:\/\/media\.tung.codes/);
  assert.match(headers, /img-src[^\n]*https:\/\/media\.tung.codes/);
  assert.match(admin, /X-Robots-Tag/);
  assert.match(admin, /Cache-Control/);

  assert.match(css, /\.reveal \{[\s\S]*opacity: 1/);
  assert.match(css, /\.js\[data-enhanced="true"\] \.reveal/);
  assert.match(css, /@keyframes page-reveal/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.js\[data-enhanced="true"\] \.reveal \{[\s\S]*opacity: 1/);
  assert.match(css, /body\.menu-open \{[\s\S]*overflow: hidden/);
  assert.match(css, /:focus-visible/);
});
