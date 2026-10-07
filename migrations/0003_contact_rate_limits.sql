CREATE TABLE IF NOT EXISTS contact_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  submission_count INTEGER NOT NULL CHECK (submission_count BETWEEN 1 AND 3),
  last_claim_id TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_contact_rate_limits_expires_at
  ON contact_rate_limits (expires_at);
