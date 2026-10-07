-- Structured, revisioned CMS storage. This migration belongs to CONTENT_DB,
-- which is intentionally separate from the public contact-rate-limit database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('site_section', 'project', 'post')),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  cover_media_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  current_published_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_items_type_slug_active
  ON content_items (type, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_type_status_order
  ON content_items (type, status, sort_order, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_updated_at
  ON content_items (updated_at DESC);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  data_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revisions_item_version
  ON revisions (content_item_id, version);

CREATE INDEX IF NOT EXISTS idx_revisions_item_status
  ON revisions (content_item_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS localizations (
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (revision_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_localizations_locale
  ON localizations (locale, revision_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_status_created
  ON media (status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS site_state (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  config_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO site_state (id, config_json, version, updated_by, updated_at)
VALUES ('default', '{}', 1, 'system', '1970-01-01T00:00:00.000Z');

-- Ephemeral rows let D1 batch operations fail atomically when an optimistic
-- lock predicate is false. Successful batches delete their guard rows.
CREATE TABLE IF NOT EXISTS transaction_guards (
  token TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);
