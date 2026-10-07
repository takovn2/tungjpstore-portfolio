-- Keep production aligned when CRM search filters are added after 0004 was
-- already applied. IF NOT EXISTS also keeps fresh databases idempotent.
CREATE INDEX IF NOT EXISTS idx_contact_submissions_project_website_prefix
  ON contact_submissions (project_website COLLATE NOCASE, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_locale_updated
  ON contact_submissions (locale, updated_at DESC, id DESC);
