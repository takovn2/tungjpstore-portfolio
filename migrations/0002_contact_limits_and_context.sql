ALTER TABLE contact_submissions ADD COLUMN company TEXT;
ALTER TABLE contact_submissions ADD COLUMN project_website TEXT;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_ip_created_at
  ON contact_submissions (ip_hash, created_at DESC);
