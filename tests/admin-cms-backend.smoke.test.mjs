import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadAdminCms() {
  const sources = [
    "src/lib/admin/types.ts",
    "src/lib/admin/db-utils.ts",
    "src/lib/admin/validation.ts",
    "src/lib/admin/repository.ts",
  ].map((path) => compile(read(path)).replace(/^import\s+.*;\s*$/gm, ""));
  return importSource(sources.join("\n"));
}

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));

  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) {
          bindings = values;
          return prepared;
        },
        async first() {
          return statement.get(...bindings) ?? null;
        },
        async all() {
          return { results: statement.all(...bindings) };
        },
        __run() {
          return statement.run(...bindings);
        },
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.__run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}

function insertContent(sqlite, {
  id,
  type = "post",
  slug = id,
  status = "draft",
  version = 1,
  publishedRevisionId = null,
  deletedAt = null,
}) {
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO content_items
    (id, type, slug, status, sort_order, cover_media_id, meta_json, version,
      current_published_revision_id, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, 0, NULL, '{}', ?, ?, ?, ?, ?)`)
    .run(id, type, slug, status, version, publishedRevisionId, now, now, deletedAt);
}

function localized(overrides = {}) {
  return {
    title: "A useful title",
    excerpt: "A concise editorial summary.",
    seoTitle: "A useful search title",
    seoDescription: "A focused search description that explains the article without filler.",
    body: [{ type: "paragraph", text: "Useful body copy." }],
    ...overrides,
  };
}

test("publish validation applies locale-aware SEO limits and media alt integrity", async () => {
  const cms = await loadAdminCms();
  const validLocales = Object.fromEntries(cms.ADMIN_LOCALES.map((locale) => [locale, localized()]));
  assert.deepEqual(cms.validatePublishContent({
    type: "post",
    slug: "safe-agent-workflows",
    cover: null,
    localizations: validLocales,
  }), ["safe-agent-workflows: cover_required"]);

  const issues = cms.validatePublishContent({
    type: "post",
    slug: "safe-agent-workflows",
    cover: { id: "media-1", status: "active", alt: "" },
    localizations: {
      ...validLocales,
      en: localized({
        seoTitle: "x".repeat(71),
        seoDescription: "x".repeat(181),
        body: [{ type: "image", src: "/images/agent.webp", alt: "" }],
      }),
      ja: localized({ seoTitle: "界".repeat(46), seoDescription: "界".repeat(121) }),
    },
  });
  assert.deepEqual(issues, [
    "safe-agent-workflows: cover_alt_required",
    "safe-agent-workflows.en: seo_title_too_long",
    "safe-agent-workflows.en: seo_description_too_long",
    "safe-agent-workflows.en.body.0: image_alt_required",
    "safe-agent-workflows.ja: seo_title_too_long",
    "safe-agent-workflows.ja: seo_description_too_long",
  ]);
});

test("media library supports bounded search and stable cursor pagination", async () => {
  const cms = await loadAdminCms();
  const { db, sqlite } = createD1();
  const insert = sqlite.prepare(`INSERT INTO media
    (id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at)
    VALUES (?, ?, ?, 'image/webp', 100, ?, ?, 'owner@example.com', ?)`);
  insert.run("media-c", "cms/c.webp", "AI Workflow.webp", "Agent workflow cover", "active", "2026-07-24T03:00:00.000Z");
  insert.run("media-b", "cms/b.webp", "edge-rag.webp", "Knowledge retrieval", "active", "2026-07-24T02:00:00.000Z");
  insert.run("media-a", "cms/a.webp", "old.webp", "Old deleted image", "deleted", "2026-07-24T01:00:00.000Z");

  const searched = await cms.listMedia(db, { query: "workflow", limit: 20, cursor: null });
  assert.deepEqual(searched.items.map((item) => item.id), ["media-c"]);
  assert.equal(searched.items[0].objectKey, "cms/c.webp");
  assert.equal(searched.pagination.hasMore, false);

  const first = await cms.listMedia(db, { query: null, limit: 1, cursor: null });
  assert.deepEqual(first.items.map((item) => item.id), ["media-c"]);
  assert.equal(first.pagination.hasMore, true);
  assert.match(first.pagination.nextCursor, /^[A-Za-z0-9_-]+$/);
  const secondCursor = cms.parseMediaCursor(first.pagination.nextCursor);
  const second = await cms.listMedia(db, { query: null, limit: 1, cursor: secondCursor });
  assert.deepEqual(second.items.map((item) => item.id), ["media-b"]);
  sqlite.close();
});

test("dashboard counts active editorial work without counting trashed records", async () => {
  const cms = await loadAdminCms();
  const { db, sqlite } = createD1();
  insertContent(sqlite, { id: "page-1", type: "site_section", status: "published" });
  insertContent(sqlite, { id: "project-1", type: "project", status: "published" });
  insertContent(sqlite, { id: "post-1", status: "draft" });
  insertContent(sqlite, { id: "post-2", status: "archived", deletedAt: "2026-07-24T01:00:00.000Z" });
  sqlite.prepare(`INSERT INTO media
    (id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at)
    VALUES ('media-1', 'cms/1.webp', 'one.webp', 'image/webp', 100, 'One', 'active', 'owner@example.com', '2026-07-24T00:00:00.000Z')`).run();

  const stats = await cms.getDashboardStats(db);
  assert.deepEqual(stats, {
    content: {
      total: 3,
      published: 2,
      draft: 1,
      archived: 0,
      deleted: 1,
      siteSections: 1,
      projects: 1,
      posts: 1,
    },
    media: { active: 1, missingAlt: 0 },
  });
  sqlite.close();
});

test("an older immutable revision can be restored as a new draft", async () => {
  const cms = await loadAdminCms();
  const { db, sqlite } = createD1();
  insertContent(sqlite, {
    id: "post-1",
    status: "published",
    version: 3,
    publishedRevisionId: "revision-2",
  });
  const insertRevision = sqlite.prepare(`INSERT INTO revisions
    (id, content_item_id, version, status, slug, sort_order, cover_media_id, data_json, created_by, created_at, published_at)
    VALUES (?, 'post-1', ?, ?, ?, 0, NULL, ?, 'owner@example.com', ?, ?)`);
  insertRevision.run("revision-1", 1, "archived", "old-title", JSON.stringify({ topic: "old" }), "2026-07-22T00:00:00.000Z", "2026-07-22T00:00:00.000Z");
  insertRevision.run("revision-2", 2, "published", "current-title", JSON.stringify({ topic: "current" }), "2026-07-23T00:00:00.000Z", "2026-07-23T00:00:00.000Z");
  insertRevision.run("revision-3", 3, "draft", "new-draft", JSON.stringify({ topic: "draft" }), "2026-07-24T00:00:00.000Z", null);
  const insertLocale = sqlite.prepare("INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, ?, ?)");
  for (const locale of cms.ADMIN_LOCALES) {
    insertLocale.run("revision-1", locale, JSON.stringify(localized({ title: `Old ${locale}` })));
    insertLocale.run("revision-2", locale, JSON.stringify(localized({ title: `Current ${locale}` })));
    insertLocale.run("revision-3", locale, JSON.stringify(localized({ title: `Draft ${locale}` })));
  }

  const restored = await cms.restoreRevisionAsDraft(
    db,
    { id: "post-1", revisionId: "revision-1", expectedVersion: 3 },
    "owner@example.com",
    "request-restore",
  );
  assert.equal(restored.status, "published");
  assert.equal(restored.version, 4);
  assert.equal(restored.published.id, "revision-2");
  assert.equal(restored.draft.version, 4);
  assert.equal(restored.draft.slug, "old-title");
  assert.equal(restored.draft.localizations.vi.title, "Old vi");
  assert.equal(sqlite.prepare("SELECT status FROM revisions WHERE id = 'revision-3'").get().status, "archived");
  const audit = sqlite.prepare("SELECT action, details_json FROM audit_logs ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(audit.action, "content.revision_restored_as_draft");
  assert.equal(JSON.parse(audit.details_json).sourceRevisionId, "revision-1");
  sqlite.close();
});

test("admin API exposes dashboard, reusable media and restore-to-draft routes", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const content = read("src/lib/admin/router/content-routes.ts");
  const media = read("src/lib/admin/router/media-routes.ts");
  assert.match(entry, /segments\[0\] === "dashboard"|handleContentRoutes/);
  assert.match(content, /segments\[0\] === "dashboard"/);
  assert.match(media, /listMedia\(/);
  assert.match(media, /parseMediaCursor/);
  assert.match(media, /getMediaIntegrity/);
  assert.match(media, /sizeMatches/);
  assert.match(content, /restoreRevisionAsDraft/);
  assert.match(content, /action === "revision".*segments\.length === 6/s);
});
