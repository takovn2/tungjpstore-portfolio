-- Canonical merchandising categories. Products retain their metadata category
-- fields for backwards compatibility; the slug is the stable join key used by
-- the storefront and admin catalog.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= -100000 AND sort_order <= 100000),
  default_locale TEXT NOT NULL DEFAULT 'vi' CHECK (default_locale IN ('vi', 'en', 'ja', 'zh')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_categories_slug_active
  ON shop_categories (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_categories_storefront
  ON shop_categories (status, sort_order, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shop_category_localizations (
  category_id TEXT NOT NULL REFERENCES shop_categories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (category_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_shop_category_localizations_locale
  ON shop_category_localizations (locale, category_id);

-- Promote existing validated metadata categories so legacy products remain
-- editable immediately after the taxonomy boundary is deployed.
INSERT OR IGNORE INTO shop_categories
  (id, slug, status, sort_order, default_locale, version, created_by, updated_by, created_at, updated_at)
SELECT
  'category-' || lower(json_extract(metadata_json, '$.categorySlug')),
  lower(json_extract(metadata_json, '$.categorySlug')),
  'active',
  0,
  'vi',
  1,
  'system:category-backfill',
  'system:category-backfill',
  '2026-07-24T00:00:00.000Z',
  '2026-07-24T00:00:00.000Z'
FROM shop_products
WHERE deleted_at IS NULL
  AND json_type(metadata_json, '$.categorySlug') = 'text'
  AND length(json_extract(metadata_json, '$.categorySlug')) BETWEEN 1 AND 80
  AND json_extract(metadata_json, '$.categorySlug') = lower(json_extract(metadata_json, '$.categorySlug'))
  AND json_extract(metadata_json, '$.categorySlug') NOT GLOB '*[^a-z0-9-]*'
  AND substr(json_extract(metadata_json, '$.categorySlug'), 1, 1) GLOB '[a-z0-9]';

INSERT OR IGNORE INTO shop_category_localizations (category_id, locale, title, description)
SELECT
  c.id,
  'vi',
  substr(CASE
    WHEN json_type(p.metadata_json, '$.category') = 'text'
      AND length(trim(json_extract(p.metadata_json, '$.category'))) > 0
      THEN trim(json_extract(p.metadata_json, '$.category'))
    ELSE c.slug
  END, 1, 120),
  ''
FROM shop_categories c
JOIN shop_products p
  ON p.deleted_at IS NULL
  AND lower(json_extract(p.metadata_json, '$.categorySlug')) = c.slug
WHERE c.deleted_at IS NULL;
