import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatProjectCount, locales, translations } from "../src/i18n/dictionaries.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("project counts use locale-aware singular and plural copy", () => {
  assert.equal(formatProjectCount("en", 1), "1 project");
  assert.equal(formatProjectCount("en", 2), "2 projects");
  assert.equal(formatProjectCount("vi", 1), "1 dự án");
  assert.equal(formatProjectCount("ja", 1), "1件");
  assert.equal(formatProjectCount("zh", 1), "1 个项目");
  for (const locale of locales) {
    assert.ok(translations[locale].work.projectCount.one.includes("{count}"));
    assert.ok(translations[locale].work.projectCount.other.includes("{count}"));
  }
});

test("built-in case studies keep the curated public narrative", () => {
  const page = read("src/components/pages/CaseStudyPage.astro");
  assert.match(page, /const projectKeyBySlug: Partial<Record<string, ProjectKey>>/);
  assert.match(page, /const showLegacyDetail = Boolean\(legacyProject\)/);
  assert.match(page, /: showLegacyDetail && legacyProject \?/);
  assert.match(page, /cmsProject\?\.body\?\.length/);
  assert.match(page, /cmsProject\?\.body\?\.length && !legacyProject/);
  assert.doesNotMatch(page, /detailsPendingHeading|detailsPendingBody|details-pending/);
  assert.doesNotMatch(page, /: "logivn";\s*const legacyProject/);
  for (const locale of locales) assert.ok(translations[locale].caseStudy.caseStudyLabel.trim());
});

test("content migrations keep ISO UTC timestamps and preserve safe list siblings", async () => {
  const migration0004 = read("content-migrations/0004_remove_public_repository_links.sql");
  const migration0005 = read("content-migrations/0005_remove_repository_text_references.sql");
  assert.match(migration0004, /strftime\('%Y-%m-%dT%H:%M:%fZ', 'now'\)/);
  assert.doesNotMatch(migration0004, /updated_at\s*=\s*CURRENT_TIMESTAMP/i);
  assert.match(migration0005, /json_extract\(block\.value, '\$\.type'\) = 'list'/);
  assert.match(migration0005, /json_group_array\(item\.value\)/);

  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  sqlite.prepare(`INSERT INTO content_items
    (id, type, slug, status, sort_order, meta_json, version, created_at, updated_at)
    VALUES (?, 'project', ?, 'published', 1, ?, 1, ?, ?)`)
    .run("migration-item", "migration-item", JSON.stringify({ repoUrl: "https://github.com/private" }), "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  sqlite.prepare(`INSERT INTO revisions
    (id, content_item_id, version, status, data_json, created_by, created_at)
    VALUES (?, ?, 1, 'published', '{}', 'test', ?)`)
    .run("migration-revision", "migration-item", "2026-01-01T00:00:00.000Z");
  sqlite.prepare(`INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, 'vi', ?)`)
    .run("migration-revision", JSON.stringify({ body: [
      { type: "list", items: ["Giữ lại", "github.com/private", "Giữ tiếp"] },
      { type: "paragraph", text: "github.com/only" },
      { type: "paragraph", text: "An toàn" },
    ] }));

  sqlite.exec(migration0004);
  sqlite.exec(migration0005);
  const row = sqlite.prepare("SELECT meta_json, updated_at FROM content_items WHERE id = ?").get("migration-item");
  assert.equal(row.meta_json, "{}");
  assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const body = JSON.parse(sqlite.prepare("SELECT data_json FROM localizations WHERE revision_id = ?").get("migration-revision").data_json).body;
  assert.deepEqual(body, [
    { type: "list", items: ["Giữ lại", "Giữ tiếp"] },
    { type: "paragraph", text: "An toàn" },
  ]);
  sqlite.close();
});
