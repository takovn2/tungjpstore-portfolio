import type { AdminLocale, ContentMeta, ContentType, LocalizedContent } from "./admin/types";

export type PublishedContent = {
  id: string;
  type: ContentType;
  slug: string;
  sortOrder: number;
  version: number;
  meta: ContentMeta;
  locale: AdminLocale;
  content: LocalizedContent;
  coverMediaId: string | null;
  coverObjectKey: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  publishedAt: string | null;
  updatedAt?: string | null;
};

export type PublicSiteState = {
  config: ContentMeta;
  version: number;
  updatedAt: string;
};

export type PublicContentSnapshot = {
  status: "unavailable" | "empty" | "ready";
  locale: AdminLocale;
  items: PublishedContent[];
  managedSlugs: Record<ContentType, string[]>;
  siteState: PublicSiteState | null;
};

type PublishedRow = {
  id: string;
  type: ContentType;
  slug: string;
  item_status: string;
  deleted_at: string | null;
  sort_order: number;
  version: number | null;
  meta_json: string | null;
  localized_json: string | null;
  cover_media_id: string | null;
  cover_object_key: string | null;
  cover_alt: string | null;
  published_at: string | null;
  updated_at?: string | null;
};

type SiteStateRow = {
  config_json: string;
  version: number;
  updated_at: string;
};

type ManagedSlugRow = {
  type: ContentType;
  slug: string;
};

const emptyManagedSlugs = (): Record<ContentType, string[]> => ({
  site_section: [],
  project: [],
  post: [],
});

function parseObject<T extends object>(value: string | null): T | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function parseLocalized(value: string | null): LocalizedContent | null {
  const parsed = parseObject<Record<string, unknown>>(value);
  if (!parsed) return null;
  for (const key of ["title", "eyebrow", "excerpt", "seoTitle", "seoDescription"] as const) {
    if (parsed[key] !== undefined && typeof parsed[key] !== "string") return null;
  }
  if (parsed.body !== undefined) {
    if (!Array.isArray(parsed.body)) return null;
    for (const candidate of parsed.body) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const block = candidate as Record<string, unknown>;
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        if (typeof block.text !== "string") return null;
      } else if (block.type === "list") {
        if (!Array.isArray(block.items) || !block.items.every((item) => typeof item === "string")) return null;
      } else if (block.type === "image") {
        if (typeof block.src !== "string" || typeof block.alt !== "string") return null;
      } else if (block.type === "cta") {
        if (typeof block.label !== "string" || typeof block.href !== "string") return null;
      } else if (block.type === "metric") {
        if (typeof block.label !== "string" || typeof block.value !== "string") return null;
      } else {
        return null;
      }
    }
  }
  return parsed as LocalizedContent;
}

function mediaUrl(objectKey: string | null, mediaPublicBaseUrl?: string) {
  if (!objectKey) return null;
  // Blog seed covers ship as static assets under public/images/blog so the
  // public site never depends on a missing R2 object for editorial media.
  if (/^blog\/[a-z0-9-]+\.webp$/.test(objectKey)) {
    return `/images/${objectKey}`;
  }
  const publicBase = mediaPublicBaseUrl?.trim().replace(/\/+$/, "") ?? "";
  return /^https:\/\//.test(publicBase) ? `${publicBase}/${objectKey}` : null;
}

function publishedFromRow(
  row: PublishedRow,
  locale: AdminLocale,
  mediaPublicBaseUrl?: string,
): PublishedContent | null {
  if (
    row.item_status !== "published" ||
    row.deleted_at !== null ||
    row.version === null ||
    !row.meta_json ||
    !row.localized_json
  ) return null;

  const meta = parseObject<ContentMeta>(row.meta_json);
  const content = parseLocalized(row.localized_json);
  if (!meta || !content) return null;

  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    sortOrder: row.sort_order,
    version: row.version,
    meta,
    locale,
    content,
    coverMediaId: row.cover_media_id,
    coverObjectKey: row.cover_object_key,
    coverUrl: mediaUrl(row.cover_object_key, mediaPublicBaseUrl),
    coverAlt: row.cover_alt,
    publishedAt: row.published_at,
    updatedAt: row.updated_at ?? row.published_at,
  };
}

/**
 * Loads every CMS-managed slug and only exposes the exact-locale published
 * revision. Managed-but-unpublished, deleted, invalid, or untranslated items
 * stay absent so callers never resurrect source content for an administered row.
 */
export async function getPublicContentSnapshot(
  db: D1Database | undefined,
  input: { locale: AdminLocale; mediaPublicBaseUrl?: string },
): Promise<PublicContentSnapshot> {
  const unavailable: PublicContentSnapshot = {
    status: "unavailable",
    locale: input.locale,
    items: [],
    managedSlugs: emptyManagedSlugs(),
    siteState: null,
  };
  if (!db) return unavailable;

  try {
    const [contentResult, managedResult, stateRow] = await Promise.all([
      db.prepare(`
        SELECT ci.id, ci.type, COALESCE(r.slug, ci.slug) AS slug,
          ci.status AS item_status, ci.deleted_at,
          r.published_at AS updated_at,
          COALESCE(r.sort_order, ci.sort_order) AS sort_order,
          r.version, r.data_json AS meta_json,
          l.data_json AS localized_json,
          COALESCE(r.cover_media_id, ci.cover_media_id) AS cover_media_id,
          m.object_key AS cover_object_key, m.alt AS cover_alt,
          (SELECT MIN(history.published_at) FROM revisions history
            WHERE history.content_item_id = ci.id AND history.published_at IS NOT NULL) AS published_at
        FROM content_items ci
        LEFT JOIN revisions r ON r.id = ci.current_published_revision_id
          AND r.content_item_id = ci.id AND r.status = 'published'
        LEFT JOIN localizations l ON l.revision_id = r.id AND l.locale = ?
        LEFT JOIN media m ON m.id = COALESCE(r.cover_media_id, ci.cover_media_id)
          AND m.status = 'active'
        ORDER BY ci.type, COALESCE(r.sort_order, ci.sort_order), r.published_at DESC, ci.id`)
        .bind(input.locale).all<PublishedRow>(),
      db.prepare(`
        SELECT DISTINCT ci.type, COALESCE(r.slug, ci.slug) AS slug
        FROM content_items ci
        LEFT JOIN revisions r ON r.content_item_id = ci.id
        ORDER BY ci.type, slug`)
        .all<ManagedSlugRow>(),
      db.prepare("SELECT config_json, version, updated_at FROM site_state WHERE id = 'default' LIMIT 1")
        .first<SiteStateRow>(),
    ]);

    const managedSlugs = emptyManagedSlugs();
    const items: PublishedContent[] = [];
    for (const row of managedResult.results) {
      if (!managedSlugs[row.type].includes(row.slug)) managedSlugs[row.type].push(row.slug);
    }
    for (const row of contentResult.results) {
      const published = publishedFromRow(row, input.locale, input.mediaPublicBaseUrl);
      if (published) items.push(published);
    }

    const siteConfig = parseObject<ContentMeta>(stateRow?.config_json ?? null);
    return {
      status: contentResult.results.length === 0 ? "empty" : "ready",
      locale: input.locale,
      items,
      managedSlugs,
      siteState: stateRow && siteConfig ? {
        config: siteConfig,
        version: stateRow.version,
        updatedAt: stateRow.updated_at,
      } : null,
    };
  } catch {
    return unavailable;
  }
}

/** Read only one exact-locale published revision. Missing or invalid data returns null. */
export async function getPublishedContent(
  db: D1Database | undefined,
  input: { type: ContentType; slug: string; locale: AdminLocale; mediaPublicBaseUrl?: string },
): Promise<PublishedContent | null> {
  const result = await getPublicContentItem(db, input);
  return result.status === "ready" ? result.item : null;
}

export type PublicContentItemResult =
  | { status: "unavailable"; item: null; locales: AdminLocale[] }
  | { status: "not-found"; item: null; locales: AdminLocale[] }
  | { status: "ready"; item: PublishedContent; locales: AdminLocale[] };

/** Read one exact-locale item without loading the entire archive. */
export async function getPublicContentItem(
  db: D1Database | undefined,
  input: { type: ContentType; slug: string; locale: AdminLocale; mediaPublicBaseUrl?: string },
): Promise<PublicContentItemResult> {
  if (!db) return { status: "unavailable", item: null, locales: [] };
  try {
    const rowStatement = db.prepare(`
      SELECT ci.id, ci.type, COALESCE(r.slug, ci.slug) AS slug,
        ci.status AS item_status, ci.deleted_at,
        r.published_at AS updated_at,
        COALESCE(r.sort_order, ci.sort_order) AS sort_order,
        r.version, r.data_json AS meta_json,
        l.data_json AS localized_json,
        COALESCE(r.cover_media_id, ci.cover_media_id) AS cover_media_id,
        m.object_key AS cover_object_key, m.alt AS cover_alt,
        (SELECT MIN(history.published_at) FROM revisions history
          WHERE history.content_item_id = ci.id AND history.published_at IS NOT NULL) AS published_at
      FROM content_items ci
      JOIN revisions r ON r.id = ci.current_published_revision_id
        AND r.content_item_id = ci.id AND r.status = 'published'
      JOIN localizations l ON l.revision_id = r.id AND l.locale = ?
      LEFT JOIN media m ON m.id = COALESCE(r.cover_media_id, ci.cover_media_id)
        AND m.status = 'active'
      WHERE ci.type = ? AND COALESCE(r.slug, ci.slug) = ?
        AND ci.status = 'published' AND ci.deleted_at IS NULL
      LIMIT 1`).bind(input.locale, input.type, input.slug);
    const row = await rowStatement.first<PublishedRow>();
    const localesResult = typeof rowStatement.all === "function"
      ? await db.prepare(`
        SELECT DISTINCT l.locale
        FROM content_items ci
        JOIN revisions r ON r.id = ci.current_published_revision_id
          AND r.content_item_id = ci.id AND r.status = 'published'
        JOIN localizations l ON l.revision_id = r.id
        WHERE ci.type = ? AND COALESCE(r.slug, ci.slug) = ?
          AND ci.status = 'published' AND ci.deleted_at IS NULL`)
        .bind(input.type, input.slug).all<{ locale: AdminLocale }>()
      : null;
    const availableLocales = localesResult?.results.map((entry) => entry.locale).filter((entry): entry is AdminLocale => ["vi", "en", "ja", "zh"].includes(entry)) ?? [input.locale];
    const item = row ? publishedFromRow(row, input.locale, input.mediaPublicBaseUrl) : null;
    return item ? { status: "ready", item, locales: availableLocales } : { status: "not-found", item: null, locales: availableLocales };
  } catch {
    return { status: "unavailable", item: null, locales: [] };
  }
}
