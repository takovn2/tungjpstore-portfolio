import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadRepository() {
  const sources = [
    "src/lib/admin/types.ts",
    "src/lib/admin/db-utils.ts",
    "src/lib/admin/validation.ts",
    "src/lib/admin/repository.ts",
  ].map((path) => compile(read(path)).replace(/^import\s+.*;\s*$/gm, ""));
  return importSource(sources.join("\n"));
}

async function loadContentStore() {
  return importSource(compile(read("src/lib/content-store.ts")));
}

function createD1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const prepared = {
        bindings: [],
        bind(...values) {
          prepared.bindings = values;
          return prepared;
        },
        async first() {
          return statement.get(...prepared.bindings) ?? null;
        },
        async all() {
          return { results: statement.all(...prepared.bindings) };
        },
        run() {
          return statement.run(...prepared.bindings);
        },
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const localized = Object.fromEntries(["vi", "en", "ja", "zh"].map((locale) => [locale, {
  title: `Title ${locale}`,
  excerpt: `Excerpt ${locale}`,
  body: [{ type: "paragraph", text: `Body ${locale}` }],
  seoTitle: `SEO ${locale}`,
  seoDescription: `SEO description ${locale}`,
}]));

test("projection migration backfills existing revisions without making columns required", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  const now = "2026-07-23T11:00:00.000Z";
  sqlite.prepare(`INSERT INTO content_items
    (id, type, slug, status, sort_order, cover_media_id, meta_json, version, created_at, updated_at)
    VALUES ('legacy-item', 'project', 'legacy-slug', 'draft', 44, 'legacy-cover', '{}', 1, ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO revisions
    (id, content_item_id, version, status, data_json, created_by, created_at)
    VALUES ('legacy-revision', 'legacy-item', 1, 'draft', '{}', 'owner@example.com', ?)`)
    .run(now);

  try {
    sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
    const columns = sqlite.prepare("PRAGMA table_info(revisions)").all();
    for (const name of ["slug", "sort_order", "cover_media_id"]) {
      const column = columns.find((entry) => entry.name === name);
      assert.ok(column);
      assert.equal(column.notnull, 0);
    }
    const revision = sqlite.prepare(
      "SELECT slug, sort_order, cover_media_id FROM revisions WHERE id = 'legacy-revision'",
    ).get();
    assert.equal(revision.slug, "legacy-slug");
    assert.equal(revision.sort_order, 44);
    assert.equal(revision.cover_media_id, "legacy-cover");
  } finally {
    sqlite.close();
  }
});

test("draft projection stays private until publish atomically promotes it", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createContent, publishContentBatch, saveDraft } = await loadRepository();
  const { getPublicContentSnapshot, getPublishedContent } = await loadContentStore();
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const d1 = createD1(sqlite);
  const now = "2026-07-23T12:00:00.000Z";
  const insertMedia = sqlite.prepare(`INSERT INTO media
    (id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at)
    VALUES (?, ?, ?, 'image/webp', 16, ?, 'active', 'owner@example.com', ?)`);
  insertMedia.run("media-old", "cms/old.webp", "old.webp", "Old cover", now);
  insertMedia.run("media-new", "cms/new.webp", "new.webp", "New cover", now);

  try {
    const created = await createContent(d1, {
      type: "project",
      slug: "old-slug",
      sortOrder: 10,
      coverMediaId: "media-old",
      meta: { stage: "old" },
      localizations: localized,
    }, "owner@example.com", "request-create");
    const [initiallyPublished] = await publishContentBatch(d1, [{
      id: created.id,
      revisionId: created.draftRevisionId,
      expectedVersion: created.version,
    }], "owner@example.com", "request-publish-old");

    const drafted = await saveDraft(d1, {
      id: created.id,
      expectedVersion: initiallyPublished.version,
      slug: "new-slug",
      sortOrder: 90,
      coverMediaId: "media-new",
      meta: { stage: "new" },
      localizations: localized,
    }, "owner@example.com", "request-save-new");

    const publicItemBeforePublish = sqlite.prepare(
      "SELECT slug, sort_order, cover_media_id FROM content_items WHERE id = ?",
    ).get(created.id);
    assert.equal(publicItemBeforePublish.slug, "old-slug");
    assert.equal(publicItemBeforePublish.sort_order, 10);
    assert.equal(publicItemBeforePublish.cover_media_id, "media-old");
    assert.equal(drafted.draft.slug, "new-slug");
    assert.equal(drafted.draft.sortOrder, 90);
    assert.equal(drafted.draft.coverMediaId, "media-new");

    const oldPublic = await getPublishedContent(d1, {
      type: "project",
      slug: "old-slug",
      locale: "en",
      mediaPublicBaseUrl: "https://media.tung.codes",
    });
    assert.equal(oldPublic?.slug, "old-slug");
    assert.equal(oldPublic?.sortOrder, 10);
    assert.equal(oldPublic?.coverMediaId, "media-old");
    assert.equal(oldPublic?.coverUrl, "https://media.tung.codes/cms/old.webp");
    assert.equal(await getPublishedContent(d1, {
      type: "project",
      slug: "new-slug",
      locale: "en",
    }), null);
    const draftSnapshot = await getPublicContentSnapshot(d1, { locale: "en" });
    assert.deepEqual(draftSnapshot.managedSlugs.project, ["new-slug", "old-slug"]);

    const [renamedPublished] = await publishContentBatch(d1, [{
      id: created.id,
      revisionId: drafted.draftRevisionId,
      expectedVersion: drafted.version,
    }], "owner@example.com", "request-publish-new");

    const publicItemAfterPublish = sqlite.prepare(
      "SELECT slug, sort_order, cover_media_id FROM content_items WHERE id = ?",
    ).get(created.id);
    assert.equal(publicItemAfterPublish.slug, "new-slug");
    assert.equal(publicItemAfterPublish.sort_order, 90);
    assert.equal(publicItemAfterPublish.cover_media_id, "media-new");
    const newPublic = await getPublishedContent(d1, {
      type: "project",
      slug: "new-slug",
      locale: "en",
      mediaPublicBaseUrl: "https://media.tung.codes",
    });
    assert.equal(newPublic?.sortOrder, 90);
    assert.equal(newPublic?.coverMediaId, "media-new");
    assert.equal(newPublic?.coverUrl, "https://media.tung.codes/cms/new.webp");
    const renamedSnapshot = await getPublicContentSnapshot(d1, { locale: "en" });
    assert.deepEqual(renamedSnapshot.managedSlugs.project, ["new-slug", "old-slug"]);

    const clearedCoverDraft = await saveDraft(d1, {
      id: created.id,
      expectedVersion: renamedPublished.version,
      slug: "new-slug",
      sortOrder: 90,
      coverMediaId: null,
      meta: { stage: "cover-cleared" },
      localizations: localized,
    }, "owner@example.com", "request-clear-cover");
    assert.equal(sqlite.prepare(
      "SELECT cover_media_id FROM content_items WHERE id = ?",
    ).get(created.id).cover_media_id, "media-new");
    assert.equal(clearedCoverDraft.draft.coverMediaId, null);

    await publishContentBatch(d1, [{
      id: created.id,
      revisionId: clearedCoverDraft.draftRevisionId,
      expectedVersion: clearedCoverDraft.version,
    }], "owner@example.com", "request-publish-clear-cover");
    assert.equal(sqlite.prepare(
      "SELECT cover_media_id FROM content_items WHERE id = ?",
    ).get(created.id).cover_media_id, null);
    const withoutCover = await getPublishedContent(d1, {
      type: "project",
      slug: "new-slug",
      locale: "en",
      mediaPublicBaseUrl: "https://media.tung.codes",
    });
    assert.equal(withoutCover?.coverMediaId, null);
    assert.equal(withoutCover?.coverUrl, null);
  } finally {
    sqlite.close();
  }
});

test("restoring a deleted published item without a draft creates a private editable clone", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createContent, publishContentBatch, restoreContent, softDeleteContent } = await loadRepository();
  const { getPublishedContent } = await loadContentStore();
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const d1 = createD1(sqlite);
  try {
    sqlite.prepare(`INSERT INTO media
      (id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at)
      VALUES ('restore-cover', 'cms/restore-cover.webp', 'restore-cover.webp', 'image/webp', 16, 'Restore cover', 'active', 'owner@example.com', '2026-07-23T12:00:00.000Z')`).run();
    const created = await createContent(d1, {
      type: "project",
      slug: "restore-me",
      sortOrder: 1,
      coverMediaId: "restore-cover",
      meta: { status: "active", source: "published" },
      localizations: localized,
    }, "owner@example.com", "request-create-restore");
    const [published] = await publishContentBatch(d1, [{
      id: created.id,
      revisionId: created.draftRevisionId,
      expectedVersion: created.version,
    }], "owner@example.com", "request-publish-restore");
    const deleted = await softDeleteContent(
      d1,
      created.id,
      published.version,
      "owner@example.com",
      "request-delete-restore",
    );
    const restored = await restoreContent(
      d1,
      created.id,
      deleted.version,
      "owner@example.com",
      "request-restore-content",
    );
    assert.equal(restored.status, "draft");
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.publishedRevisionId, null);
    assert.equal(restored.draft?.slug, "restore-me");
    assert.equal(restored.draft?.sortOrder, 1);
    assert.equal(restored.draft?.coverMediaId, "restore-cover");
    assert.deepEqual(restored.draft?.meta, { status: "active", source: "published" });
    assert.equal(restored.draft?.localizations.en?.title, "Title en");
    assert.equal(await getPublishedContent(d1, {
      type: "project",
      slug: "restore-me",
      locale: "en",
    }), null);
    const revisions = sqlite.prepare(
      "SELECT status FROM revisions WHERE content_item_id = ? ORDER BY version",
    ).all(created.id);
    assert.deepEqual(revisions.map((row) => row.status), ["archived", "draft"]);
  } finally {
    sqlite.close();
  }
});

test("publish rejects duplicate content ids before any batch mutation", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createContent, publishContentBatch } = await loadRepository();
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0002_revision_public_projection.sql"));
  const d1 = createD1(sqlite);
  try {
    const created = await createContent(d1, {
      type: "project",
      slug: "duplicate-id",
      sortOrder: 1,
      coverMediaId: null,
      meta: {},
      localizations: localized,
    }, "owner@example.com", "request-create-duplicate");

    await assert.rejects(
      publishContentBatch(d1, [
        { id: created.id, revisionId: created.draftRevisionId, expectedVersion: created.version },
        { id: created.id, revisionId: "another-revision", expectedVersion: created.version },
      ], "owner@example.com", "request-publish-duplicate"),
      (error) => {
        assert.deepEqual(error.issues, [`batch: duplicate_content_item_id:${created.id}`]);
        return true;
      },
    );
    const item = sqlite.prepare(
      "SELECT status, version, current_published_revision_id FROM content_items WHERE id = ?",
    ).get(created.id);
    assert.equal(item.status, "draft");
    assert.equal(item.version, created.version);
    assert.equal(item.current_published_revision_id, null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = ?").get(created.id).count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transaction_guards").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("admin editor treats an explicit null draft cover as a deliberate clear", () => {
  const admin = read("src/components/admin/views/ContentView.tsx");
  assert.match(admin, /Object\.prototype\.hasOwnProperty\.call\(draft, "coverMediaId"\)/);
  assert.match(admin, /draft\?\.slug\s*\?\?\s*next\.slug/);
  assert.match(admin, /draft\?\.sortOrder\s*\?\?\s*next\.sortOrder/);
});
