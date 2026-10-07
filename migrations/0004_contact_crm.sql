-- Additive CRM layer for contact_submissions. Existing rows remain readable
-- and keep their original status/created_at values.
PRAGMA foreign_keys = ON;

ALTER TABLE contact_submissions ADD COLUMN stage TEXT NOT NULL DEFAULT 'inbox';
ALTER TABLE contact_submissions ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE contact_submissions ADD COLUMN assignee TEXT;
ALTER TABLE contact_submissions ADD COLUMN follow_up_at TEXT;
ALTER TABLE contact_submissions ADD COLUMN follow_up_note TEXT;
ALTER TABLE contact_submissions ADD COLUMN updated_at TEXT;

UPDATE contact_submissions
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS contact_tags (
  submission_id TEXT NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (length(tag) BETWEEN 1 AND 40),
  created_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_submission
  ON contact_tags (tag, submission_id);

CREATE INDEX IF NOT EXISTS idx_contact_tags_submission
  ON contact_tags (submission_id, tag);

CREATE TABLE IF NOT EXISTS contact_notes (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_submission_created
  ON contact_notes (submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_activities (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_activities_submission_created
  ON contact_activities (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_activities_action_created
  ON contact_activities (action, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_crm_guards (
  token TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_updated_at
  ON contact_submissions (updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_updated
  ON contact_submissions (status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_stage_updated
  ON contact_submissions (stage, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_priority_updated
  ON contact_submissions (priority, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_assignee_updated
  ON contact_submissions (assignee, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_follow_up
  ON contact_submissions (follow_up_at, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_name_prefix
  ON contact_submissions (name COLLATE NOCASE, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_email_prefix
  ON contact_submissions (email COLLATE NOCASE, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_company_prefix
  ON contact_submissions (company COLLATE NOCASE, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_project_website_prefix
  ON contact_submissions (project_website COLLATE NOCASE, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_locale_updated
  ON contact_submissions (locale, updated_at DESC, id DESC);

-- Public contact inserts predate the CRM columns. These triggers backfill the
-- timestamp without changing the public API payload or its prepared binds.
CREATE TRIGGER IF NOT EXISTS trg_contact_submissions_set_updated_after_insert
AFTER INSERT ON contact_submissions
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE contact_submissions SET updated_at = NEW.created_at WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_contact_submissions_set_updated_after_update
AFTER UPDATE OF name, email, company, project_website, message, locale, user_agent, status, stage, priority, assignee, follow_up_at, follow_up_note
ON contact_submissions
WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE contact_submissions
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;
