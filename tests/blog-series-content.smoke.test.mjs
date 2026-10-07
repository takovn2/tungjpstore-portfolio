import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const migrationPath = "content-migrations/0007_seed_blog_series.sql";
const slugs = [
  "ai-starts-with-the-workflow",
  "rag-on-cloudflare-free",
  "multilingual-products-without-translation-debt",
  "safe-agentic-ai-authority-boundaries",
];
const imageFiles = [
  "ai-workflow-system.webp",
  "cloudflare-rag-edge.webp",
  "multilingual-product-system.webp",
  "agentic-ai-security-gates.webp",
];

function articleText(body) {
  return body.flatMap((block) => {
    if (["heading", "paragraph", "quote"].includes(block.type)) return [block.text];
    if (block.type === "list") return block.items;
    return [];
  }).join(" ");
}

test("the blog series migration seeds four publishable articles in every locale", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const migration = read(migrationPath);
  sqlite.exec(migration);
  sqlite.exec(migration);

  const posts = sqlite.prepare(`SELECT ci.slug, ci.meta_json, ci.status, ci.cover_media_id,
      r.id AS revision_id, r.status AS revision_status, r.published_at, m.object_key,
      m.mime_type, m.width, m.height, m.alt
    FROM content_items ci
    JOIN revisions r ON r.id = ci.current_published_revision_id
    JOIN media m ON m.id = ci.cover_media_id
    WHERE ci.type = 'post' AND ci.slug IN (${slugs.map(() => "?").join(",")})
    ORDER BY ci.sort_order`).all(...slugs);

  assert.equal(posts.length, 4);
  assert.deepEqual(posts.map((post) => post.slug), slugs);
  for (const post of posts) {
    const meta = JSON.parse(post.meta_json);
    assert.equal(post.status, "published");
    assert.equal(post.revision_status, "published");
    assert.match(post.published_at, /^2026-07-24T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.equal(meta.surface, "blog");
    assert.equal(meta.status, "live");
    assert.equal(meta.series, "digital-systems");
    assert.equal(post.mime_type, "image/webp");
    assert.equal(post.width, 1600);
    assert.equal(post.height, 900);
    assert.match(post.object_key, /^blog\/[a-z0-9-]+\.webp$/);
    assert.ok(post.alt.length >= 10);

    const localizations = sqlite.prepare(
      "SELECT locale, data_json FROM localizations WHERE revision_id = ? ORDER BY locale",
    ).all(post.revision_id);
    assert.equal(localizations.length, 4);
    assert.deepEqual(localizations.map((row) => row.locale), ["en", "ja", "vi", "zh"]);
    for (const row of localizations) {
      const content = JSON.parse(row.data_json);
      assert.ok(content.title.length >= 12, `${post.slug}/${row.locale} title`);
      assert.ok(content.eyebrow.length >= 2, `${post.slug}/${row.locale} category`);
      const excerptMinimum = ["ja", "zh"].includes(row.locale) ? 35 : 55;
      assert.ok(content.excerpt.length >= excerptMinimum, `${post.slug}/${row.locale} excerpt`);
      const seoTitleLimit = ["ja", "zh"].includes(row.locale) ? 45 : 70;
      const seoDescriptionLimit = ["ja", "zh"].includes(row.locale) ? 30 : 70;
      const seoDescriptionMax = ["ja", "zh"].includes(row.locale) ? 120 : 180;
      assert.ok(content.seoTitle.length >= 12 && content.seoTitle.length <= seoTitleLimit, `${post.slug}/${row.locale} SEO title`);
      assert.ok(content.seoDescription.length >= seoDescriptionLimit && content.seoDescription.length <= seoDescriptionMax, `${post.slug}/${row.locale} SEO description`);
      assert.ok(Array.isArray(content.body) && content.body.length >= 14, `${post.slug}/${row.locale} body depth`);
      assert.ok(content.body.filter((block) => block.type === "heading").length >= 4);
      assert.ok(content.body.filter((block) => block.type === "paragraph").length >= 5);
      assert.ok(content.body.some((block) => block.type === "list" && block.items.length >= 3));
      assert.ok(content.body.some((block) => block.type === "quote"));
      const editorialMinimum = ["ja", "zh"].includes(row.locale) ? 700 : 900;
      assert.ok(articleText(content.body).length >= editorialMinimum, `${post.slug}/${row.locale} editorial depth`);
      assert.doesNotMatch(JSON.stringify(content), /github|repository|repo\b/i);
    }
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM media WHERE object_key LIKE 'blog/%'").get().count, 4);
  sqlite.close();
});

test("blog cover assets are production-sized WebP files within the performance budget", async () => {
  for (const filename of imageFiles) {
    const path = `${projectRoot}/public/images/blog/${filename}`;
    const stat = statSync(path);
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 900);
    assert.ok(stat.size <= 180 * 1024, `${filename} is ${stat.size} bytes`);
  }
});

test("blog seed generation and media publishing stay deterministic and explicit", () => {
  const seedScript = read("scripts/seed-blog-series.mjs");
  const uploadScript = read("scripts/publish-blog-media.mjs");
  assert.match(seedScript, /0007_seed_blog_series\.sql/);
  assert.match(seedScript, /INSERT OR IGNORE INTO media/);
  assert.match(seedScript, /INSERT OR IGNORE INTO content_items/);
  assert.match(seedScript, /seed:blog-series:v1/);
  assert.match(uploadScript, /Refusing to upload without --remote or --local/);
  assert.match(uploadScript, /tung-profile-media/);
  assert.doesNotMatch(seedScript, /github\.com|repository|repoUrl/i);
});
