import type {
  AdminLocale,
  ContentDetail,
  ContentListItem,
  ContentMeta,
  ContentStatus,
  ContentType,
  LocalizedContent,
  LocalizedMap,
} from "./types";
import { ADMIN_LOCALES } from "./types";
import { encodeMediaCursor, jsonString, validatePublishContent, type MediaCursor, type PublishMediaState } from "./validation";
import { escapeLike, isGuardConflict, safeJsonParse } from "./db-utils";

type ContentRow = {
  id: string;
  type: ContentType;
  slug: string;
  status: ContentStatus;
  sort_order: number;
  cover_media_id: string | null;
  meta_json: string;
  version: number;
  current_published_revision_id: string | null;
  draft_revision_id: string | null;
  updated_at: string;
  deleted_at: string | null;
};

type RevisionRow = {
  id: string;
  version: number;
  slug: string | null;
  sort_order: number | null;
  cover_media_id: string | null;
  data_json: string;
};
type LocalizationRow = { locale: AdminLocale; data_json: string };
type RestoreSourceRow = {
  source_revision_id: string | null;
  slug: string | null;
  sort_order: number | null;
  cover_media_id: string | null;
  data_json: string | null;
  has_draft: number;
};
// Single source of truth for site sections whose slug the editor must not rename.
export const PROTECTED_SITE_SECTION_SLUGS = new Set(["home-hero", "contact-profile"]);

const parseObject = <T extends object>(value: string, fallback: T): T => safeJsonParse(value, fallback);

const itemFromRow = (row: ContentRow): ContentListItem => ({
  id: row.id,
  type: row.type,
  slug: row.slug,
  status: row.status,
  sortOrder: row.sort_order,
  coverMediaId: row.cover_media_id,
  meta: parseObject<ContentMeta>(row.meta_json, {}),
  version: row.version,
  draftRevisionId: row.draft_revision_id,
  publishedRevisionId: row.current_published_revision_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

const contentSelect = `
  SELECT ci.id, ci.type, ci.slug, ci.status, ci.sort_order, ci.cover_media_id,
    ci.meta_json, ci.version, ci.current_published_revision_id, ci.updated_at, ci.deleted_at,
    (SELECT r.id FROM revisions r
      WHERE r.content_item_id = ci.id AND r.status = 'draft'
      ORDER BY r.version DESC LIMIT 1) AS draft_revision_id
  FROM content_items ci`;

function auditStatement(
  db: D1Database,
  actor: string,
  action: string,
  entityType: string,
  entityId: string | null,
  requestId: string,
  details: Record<string, unknown>,
) {
  return db.prepare(`
    INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actor, action, entityType, entityId, requestId, jsonString(details), new Date().toISOString());
}

async function loadRevision(db: D1Database, revisionId: string | null) {
  if (!revisionId) return undefined;
  const revision = await db.prepare(`SELECT id, version, slug, sort_order, cover_media_id, data_json
    FROM revisions WHERE id = ? LIMIT 1`)
    .bind(revisionId).first<RevisionRow>();
  if (!revision) return undefined;
  const result = await db.prepare("SELECT locale, data_json FROM localizations WHERE revision_id = ?")
    .bind(revisionId).all<LocalizationRow>();
  const localizations: LocalizedMap = {};
  for (const row of result.results) {
    localizations[row.locale] = parseObject<LocalizedContent>(row.data_json, {});
  }
  return {
    id: revision.id,
    version: revision.version,
    slug: revision.slug,
    sortOrder: revision.sort_order,
    coverMediaId: revision.cover_media_id,
    meta: parseObject<ContentMeta>(revision.data_json, {}),
    localizations,
  };
}

export async function listContent(
  db: D1Database,
  type: ContentType | null,
  deleted: "active" | "deleted" | "all" = "active",
  options: { limit?: number } = {},
) {
  const conditions: string[] = [];
  const bindingsList: string[] = [];
  if (type) {
    conditions.push("ci.type = ?");
    bindingsList.push(type);
  }
  if (deleted === "active") conditions.push("ci.deleted_at IS NULL");
  if (deleted === "deleted") conditions.push("ci.deleted_at IS NOT NULL");
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(100, Math.max(1, Number.isInteger(options.limit) ? options.limit as number : 50));
  const query = `${contentSelect}${where} ORDER BY ci.type, ci.sort_order, ci.updated_at DESC LIMIT ?`;
  const result = await db.prepare(query).bind(...bindingsList, limit).all<ContentRow>();
  return result.results.map(itemFromRow);
}

type MediaRow = {
  id: string;
  object_key: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  alt: string;
  status: "active" | "deleted";
  created_by: string;
  created_at: string;
};

const mediaFromRow = (row: MediaRow) => ({
  id: row.id,
  objectKey: row.object_key,
  filename: row.filename,
  mimeType: row.mime_type,
  byteSize: row.byte_size,
  alt: row.alt,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export async function listMedia(
  db: D1Database,
  input: { query?: string | null; limit?: number; cursor?: MediaCursor | null } = {},
) {
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 120) : "";
  const limit = Math.min(50, Math.max(1, Number.isInteger(input.limit) ? input.limit as number : 24));
  const cursor = input.cursor && typeof input.cursor === "object" ? input.cursor : null;
  const clauses = ["status = 'active'"];
  const bindings: unknown[] = [];
  if (query) {
    const prefix = `%${escapeLike(query.toLowerCase())}%`;
    clauses.push("(LOWER(filename) LIKE ? ESCAPE '\\' OR LOWER(alt) LIKE ? ESCAPE '\\')");
    bindings.push(prefix, prefix);
  }
  if (cursor) {
    clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  const result = await db.prepare(`SELECT id, object_key, filename, mime_type, byte_size, alt, status, created_by, created_at
    FROM media WHERE ${clauses.join(" AND ")}
    ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...bindings, limit + 1).all<MediaRow>();
  const hasMore = result.results.length > limit;
  const items = result.results.slice(0, limit).map(mediaFromRow);
  const last = items.at(-1);
  return {
    items,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? encodeMediaCursor(last.createdAt, last.id) : null,
    },
  };
}

export async function getDashboardStats(db: D1Database) {
  const [content, media] = await Promise.all([
    db.prepare(`SELECT
      SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS total,
      SUM(CASE WHEN deleted_at IS NULL AND status = 'published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN deleted_at IS NULL AND status = 'draft' THEN 1 ELSE 0 END) AS draft,
      SUM(CASE WHEN deleted_at IS NULL AND status = 'archived' THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
      SUM(CASE WHEN deleted_at IS NULL AND type = 'site_section' THEN 1 ELSE 0 END) AS site_sections,
      SUM(CASE WHEN deleted_at IS NULL AND type = 'project' THEN 1 ELSE 0 END) AS projects,
      SUM(CASE WHEN deleted_at IS NULL AND type = 'post' THEN 1 ELSE 0 END) AS posts
      FROM content_items`).first<{
        total: number | null;
        published: number | null;
        draft: number | null;
        archived: number | null;
        deleted: number | null;
        site_sections: number | null;
        projects: number | null;
        posts: number | null;
      }>(),
    db.prepare(`SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'active' AND trim(alt) = '' THEN 1 ELSE 0 END) AS missing_alt
      FROM media`).first<{ active: number | null; missing_alt: number | null }>(),
  ]);
  const number = (value: number | null) => value ?? 0;
  return {
    content: {
      total: number(content?.total ?? null),
      published: number(content?.published ?? null),
      draft: number(content?.draft ?? null),
      archived: number(content?.archived ?? null),
      deleted: number(content?.deleted ?? null),
      siteSections: number(content?.site_sections ?? null),
      projects: number(content?.projects ?? null),
      posts: number(content?.posts ?? null),
    },
    media: {
      active: number(media?.active ?? null),
      missingAlt: number(media?.missing_alt ?? null),
    },
  };
}

export async function getContent(db: D1Database, id: string): Promise<ContentDetail | null> {
  const row = await db.prepare(`${contentSelect} WHERE ci.id = ? LIMIT 1`).bind(id).first<ContentRow>();
  if (!row) return null;
  const item = itemFromRow(row);
  const [draft, published] = await Promise.all([
    loadRevision(db, item.draftRevisionId),
    loadRevision(db, item.publishedRevisionId),
  ]);
  return { ...item, ...(draft ? { draft } : {}), ...(published ? { published } : {}) };
}

export async function getRevision(db: D1Database, itemId: string, revisionId: string) {
  const belongs = await db.prepare("SELECT id FROM revisions WHERE id = ? AND content_item_id = ? LIMIT 1")
    .bind(revisionId, itemId).first<{ id: string }>();
  return belongs ? loadRevision(db, revisionId) : null;
}

export async function createContent(
  db: D1Database,
  input: {
    type: ContentType;
    slug: string;
    sortOrder: number;
    coverMediaId: string | null;
    meta: ContentMeta;
    localizations: LocalizedMap;
  },
  actor: string,
  requestId: string,
) {
  const id = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO content_items
      (id, type, slug, status, sort_order, cover_media_id, meta_json, version, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, 1, ?, ?)`)
      .bind(id, input.type, input.slug, input.sortOrder, input.coverMediaId, jsonString(input.meta), now, now),
    db.prepare(`INSERT INTO revisions
      (id, content_item_id, version, status, slug, sort_order, cover_media_id, data_json, created_by, created_at)
      VALUES (?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?)`)
      .bind(
        revisionId,
        id,
        input.slug,
        input.sortOrder,
        input.coverMediaId,
        jsonString(input.meta),
        actor,
        now,
      ),
  ];
  for (const locale of ADMIN_LOCALES) {
    statements.push(
      db.prepare("INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, ?, ?)")
        .bind(revisionId, locale, jsonString(input.localizations[locale] ?? {})),
    );
  }
  statements.push(auditStatement(db, actor, "content.created", input.type, id, requestId, { slug: input.slug, revisionId }));
  await db.batch(statements);
  return getContent(db, id);
}

export async function saveDraft(
  db: D1Database,
  input: {
    id: string;
    expectedVersion: number;
    slug: string;
    sortOrder: number;
    coverMediaId: string | null;
    meta: ContentMeta;
    localizations: LocalizedMap;
  },
  actor: string,
  requestId: string,
) {
  const revisionId = crypto.randomUUID();
  const guardToken = crypto.randomUUID();
  const nextVersion = input.expectedVersion + 1;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM content_items WHERE id = ? AND version = ? AND deleted_at IS NULL
      ) THEN 1 ELSE 0 END`)
      .bind(guardToken, input.id, input.expectedVersion),
    db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'draft'")
      .bind(input.id),
    db.prepare(`INSERT INTO revisions
      (id, content_item_id, version, status, slug, sort_order, cover_media_id, data_json, created_by, created_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`)
      .bind(
        revisionId,
        input.id,
        nextVersion,
        input.slug,
        input.sortOrder,
        input.coverMediaId,
        jsonString(input.meta),
        actor,
        now,
      ),
  ];
  for (const locale of ADMIN_LOCALES) {
    statements.push(
      db.prepare("INSERT INTO localizations (revision_id, locale, data_json) VALUES (?, ?, ?)")
        .bind(revisionId, locale, jsonString(input.localizations[locale] ?? {})),
    );
  }
  statements.push(
    db.prepare(`UPDATE content_items
      SET meta_json = ?, version = ?, updated_at = ?
      WHERE id = ? AND version = ? AND deleted_at IS NULL`)
      .bind(
        jsonString(input.meta),
        nextVersion,
        now,
        input.id,
        input.expectedVersion,
      ),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guardToken),
    auditStatement(db, actor, "content.draft_saved", "content", input.id, requestId, { revisionId, version: nextVersion }),
  );
  await db.batch(statements);
  return getContent(db, input.id);
}

export async function publishContentBatch(
  db: D1Database,
  items: Array<{ id: string; revisionId: string; expectedVersion: number }>,
  actor: string,
  requestId: string,
) {
  const seenIds = new Set<string>();
  const seenRevisionIds = new Set<string>();
  for (const item of items) {
    if (seenIds.has(item.id)) {
      throw new PublishValidationError([`batch: duplicate_content_item_id:${item.id}`]);
    }
    if (seenRevisionIds.has(item.revisionId)) {
      throw new PublishValidationError(["batch: duplicate_content_or_revision"]);
    }
    seenIds.add(item.id);
    seenRevisionIds.add(item.revisionId);
  }
  await assertPublishable(db, items);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const guards: string[] = [];
  for (const item of items) {
    const guard = crypto.randomUUID();
    guards.push(guard);
    statements.push(
      db.prepare(`INSERT INTO transaction_guards (token, valid)
        SELECT ?, CASE WHEN EXISTS (
          SELECT 1 FROM content_items ci
          JOIN revisions r ON r.content_item_id = ci.id
          WHERE ci.id = ? AND ci.version = ? AND ci.deleted_at IS NULL
            AND r.id = ? AND r.status = 'draft'
        ) THEN 1 ELSE 0 END`)
        .bind(guard, item.id, item.expectedVersion, item.revisionId),
    );
  }
  for (const item of items) {
    statements.push(
      db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'published' AND id <> ?")
        .bind(item.id, item.revisionId),
      db.prepare("UPDATE revisions SET status = 'published', published_at = ? WHERE id = ? AND content_item_id = ? AND status = 'draft'")
        .bind(now, item.revisionId, item.id),
      db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'draft' AND id <> ?")
        .bind(item.id, item.revisionId),
      db.prepare(`UPDATE content_items
        SET status = 'published',
          slug = COALESCE((SELECT r.slug FROM revisions r WHERE r.id = ? AND r.content_item_id = content_items.id), slug),
          sort_order = COALESCE((SELECT r.sort_order FROM revisions r WHERE r.id = ? AND r.content_item_id = content_items.id), sort_order),
          cover_media_id = (SELECT r.cover_media_id FROM revisions r WHERE r.id = ? AND r.content_item_id = content_items.id),
          current_published_revision_id = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .bind(
          item.revisionId,
          item.revisionId,
          item.revisionId,
          item.revisionId,
          now,
          item.id,
          item.expectedVersion,
        ),
      auditStatement(db, actor, "content.published", "content", item.id, requestId, { revisionId: item.revisionId }),
    );
  }
  for (const guard of guards) statements.push(db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard));
  await db.batch(statements);
  return Promise.all(items.map((item) => getContent(db, item.id)));
}

async function guardedStatusChange(
  db: D1Database,
  input: { id: string; expectedVersion: number; action: "unpublish" | "delete" | "restore" },
  actor: string,
  requestId: string,
) {
  const guard = crypto.randomUUID();
  const now = new Date().toISOString();
  const restoreSource = input.action === "restore"
    ? await db.prepare(`SELECT source.id AS source_revision_id,
        COALESCE(source.slug, ci.slug) AS slug,
        COALESCE(source.sort_order, ci.sort_order) AS sort_order,
        COALESCE(source.cover_media_id, ci.cover_media_id) AS cover_media_id,
        source.data_json,
        EXISTS (
          SELECT 1 FROM revisions draft
          WHERE draft.content_item_id = ci.id AND draft.status = 'draft'
        ) AS has_draft
      FROM content_items ci
      LEFT JOIN revisions source ON source.id = COALESCE(
        ci.current_published_revision_id,
        (SELECT previous.id FROM revisions previous
          WHERE previous.content_item_id = ci.id AND previous.published_at IS NOT NULL
          ORDER BY previous.published_at DESC, previous.version DESC LIMIT 1)
      )
      WHERE ci.id = ? AND ci.version = ? AND ci.deleted_at IS NOT NULL
      LIMIT 1`)
      .bind(input.id, input.expectedVersion).first<RestoreSourceRow>()
    : null;
  const clonedDraftId = restoreSource?.source_revision_id && !restoreSource.has_draft
    ? crypto.randomUUID()
    : null;
  const statePredicate = input.action === "restore"
    ? "deleted_at IS NOT NULL"
    : input.action === "unpublish"
      ? "deleted_at IS NULL AND status = 'published'"
      : "deleted_at IS NULL";
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM content_items WHERE id = ? AND version = ? AND ${statePredicate}
      ) THEN 1 ELSE 0 END`)
      .bind(guard, input.id, input.expectedVersion),
  ];
  if (input.action === "unpublish") {
    statements.push(
      db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'published'").bind(input.id),
      db.prepare(`UPDATE content_items
        SET status = 'draft', current_published_revision_id = NULL, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .bind(now, input.id, input.expectedVersion),
    );
  } else if (input.action === "delete") {
    statements.push(
      db.prepare(`UPDATE content_items
        SET status = 'archived', deleted_at = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .bind(now, now, input.id, input.expectedVersion),
    );
  } else {
    if (restoreSource?.source_revision_id && clonedDraftId) {
      statements.push(
        db.prepare(`INSERT INTO revisions
          (id, content_item_id, version, status, slug, sort_order, cover_media_id, data_json, created_by, created_at)
          VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`)
          .bind(
            clonedDraftId,
            input.id,
            input.expectedVersion + 1,
            restoreSource.slug,
            restoreSource.sort_order,
            restoreSource.cover_media_id,
            restoreSource.data_json ?? "{}",
            actor,
            now,
          ),
        db.prepare(`INSERT INTO localizations (revision_id, locale, data_json)
          SELECT ?, locale, data_json FROM localizations WHERE revision_id = ?`)
          .bind(clonedDraftId, restoreSource.source_revision_id),
      );
    }
    statements.push(
      db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'published'")
        .bind(input.id),
      db.prepare(`UPDATE content_items
        SET status = 'draft', deleted_at = NULL, current_published_revision_id = NULL,
          version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NOT NULL`)
        .bind(now, input.id, input.expectedVersion),
    );
  }
  statements.push(
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    auditStatement(
      db,
      actor,
      input.action === "delete" ? "content.deleted" : input.action === "restore" ? "content.restored" : "content.unpublished",
      "content",
      input.id,
      requestId,
      clonedDraftId && restoreSource?.source_revision_id
        ? { draftRevisionId: clonedDraftId, clonedFromRevisionId: restoreSource.source_revision_id }
        : {},
    ),
  );
  await db.batch(statements);
  return getContent(db, input.id);
}

export const unpublishContent = (
  db: D1Database,
  id: string,
  expectedVersion: number,
  actor: string,
  requestId: string,
) => guardedStatusChange(db, { id, expectedVersion, action: "unpublish" }, actor, requestId);

export const softDeleteContent = (
  db: D1Database,
  id: string,
  expectedVersion: number,
  actor: string,
  requestId: string,
) => guardedStatusChange(db, { id, expectedVersion, action: "delete" }, actor, requestId);

export const restoreContent = (
  db: D1Database,
  id: string,
  expectedVersion: number,
  actor: string,
  requestId: string,
) => guardedStatusChange(db, { id, expectedVersion, action: "restore" }, actor, requestId);

export async function listRevisions(db: D1Database, itemId: string) {
  const result = await db.prepare(`SELECT id, version, status, created_by, created_at, published_at
    FROM revisions WHERE content_item_id = ? ORDER BY version DESC LIMIT 100`)
    .bind(itemId).all<{
      id: string;
      version: number;
      status: ContentStatus;
      created_by: string;
      created_at: string;
      published_at: string | null;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    version: row.version,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  }));
}

/** Clone an immutable historical revision into the current draft lane. */
export async function restoreRevisionAsDraft(
  db: D1Database,
  input: { id: string; revisionId: string; expectedVersion: number },
  actor: string,
  requestId: string,
) {
  const nextRevisionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const guard = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM content_items ci
        JOIN revisions r ON r.content_item_id = ci.id
        WHERE ci.id = ? AND ci.version = ? AND ci.deleted_at IS NULL AND r.id = ?
      ) THEN 1 ELSE 0 END`)
      .bind(guard, input.id, input.expectedVersion, input.revisionId),
    db.prepare("UPDATE revisions SET status = 'archived' WHERE content_item_id = ? AND status = 'draft'")
      .bind(input.id),
    db.prepare(`INSERT INTO revisions
      (id, content_item_id, version, status, slug, sort_order, cover_media_id, data_json, created_by, created_at)
      SELECT ?, content_item_id, ?, 'draft', slug, sort_order, cover_media_id, data_json, ?, ?
      FROM revisions WHERE id = ? AND content_item_id = ?`)
      .bind(nextRevisionId, input.expectedVersion + 1, actor, now, input.revisionId, input.id),
    db.prepare(`INSERT INTO localizations (revision_id, locale, data_json)
      SELECT ?, locale, data_json FROM localizations WHERE revision_id = ?`)
      .bind(nextRevisionId, input.revisionId),
    db.prepare(`UPDATE content_items
      SET meta_json = (SELECT data_json FROM revisions WHERE id = ?),
          version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND deleted_at IS NULL`)
      .bind(input.revisionId, now, input.id, input.expectedVersion),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    auditStatement(db, actor, "content.revision_restored_as_draft", "content", input.id, requestId, {
      sourceRevisionId: input.revisionId,
      draftRevisionId: nextRevisionId,
      version: input.expectedVersion + 1,
    }),
  ]);
  return getContent(db, input.id);
}

export async function getSiteState(db: D1Database) {
  const row = await db.prepare("SELECT config_json, version, updated_by, updated_at FROM site_state WHERE id = 'default'")
    .first<{ config_json: string; version: number; updated_by: string; updated_at: string }>();
  return row ? {
    config: parseObject<ContentMeta>(row.config_json, {}),
    version: row.version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  } : null;
}

export async function saveSiteState(
  db: D1Database,
  config: ContentMeta,
  expectedVersion: number,
  actor: string,
  requestId: string,
) {
  const guard = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM site_state WHERE id = 'default' AND version = ?
      ) THEN 1 ELSE 0 END`).bind(guard, expectedVersion),
    db.prepare(`UPDATE site_state
      SET config_json = ?, version = version + 1, updated_by = ?, updated_at = ?
      WHERE id = 'default' AND version = ?`)
      .bind(jsonString(config), actor, now, expectedVersion),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
    auditStatement(db, actor, "site_state.updated", "site_state", "default", requestId, { version: expectedVersion + 1 }),
  ]);
  return getSiteState(db);
}

export function isOptimisticConflict(error: unknown) {
  return isGuardConflict(error);
}

export class PublishValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Content is not ready to publish");
    this.name = "PublishValidationError";
    this.issues = issues;
  }
}

async function assertPublishable(
  db: D1Database,
  items: Array<{ id: string; revisionId: string }>,
) {
  // Each item needs three independent reads (record, localizations, cover);
  // fetch them concurrently across items instead of sequential round trips.
  const perItemIssues = await Promise.all(items.map(async (item) => {
    const record = await db.prepare(`SELECT ci.type, ci.slug AS item_slug, COALESCE(r.slug, ci.slug) AS slug,
        r.cover_media_id
      FROM content_items ci JOIN revisions r ON r.content_item_id = ci.id
      WHERE ci.id = ? AND r.id = ? LIMIT 1`)
      .bind(item.id, item.revisionId).first<{ type: ContentType; item_slug: string; slug: string; cover_media_id: string | null }>();
    if (!record) {
      return [`${item.id}: revision_not_found`];
    }
    const slugIssues: string[] = [];
    if (record.type === "site_section" && PROTECTED_SITE_SECTION_SLUGS.has(record.item_slug) && record.slug !== record.item_slug) {
      slugIssues.push(`${record.item_slug}: slug_locked`);
    }
    const [localized, cover] = await Promise.all([
      db.prepare("SELECT locale, data_json FROM localizations WHERE revision_id = ?")
        .bind(item.revisionId).all<LocalizationRow>(),
      record.cover_media_id
        ? db.prepare("SELECT id, status, alt FROM media WHERE id = ? LIMIT 1")
          .bind(record.cover_media_id).first<PublishMediaState>()
        : Promise.resolve(null),
    ]);
    const byLocale = new Map(localized.results.map((entry) => [entry.locale, parseObject<LocalizedContent>(entry.data_json, {})]));
    // The explicit locale loop keeps the four-locale contract visible here;
    // validatePublishContent owns the stable issue identifiers (including
    // title_required, seo_title_required and seo_description_required).
    const localizedMap: LocalizedMap = {};
    for (const locale of ADMIN_LOCALES) {
      const value = byLocale.get(locale);
      if (value) localizedMap[locale] = value;
    }
    return [
      ...slugIssues,
      ...validatePublishContent({
        type: record.type,
        slug: record.slug,
        cover: record.cover_media_id && !cover
          ? { id: record.cover_media_id, status: "missing", alt: null }
          : cover,
        localizations: localizedMap,
      }),
    ];
  }));
  const issues = perItemIssues.flat();
  if (issues.length) throw new PublishValidationError(issues);
}

export function isPublishValidationError(error: unknown): error is PublishValidationError {
  return error instanceof PublishValidationError;
}
