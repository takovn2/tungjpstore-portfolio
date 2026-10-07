-- Durable confirmation queue for public contact submissions. The message body
-- remains in contact_submissions; the queue stores only an aggregate id.
CREATE TABLE IF NOT EXISTS transactional_email_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK (topic = 'contact.submission.confirmed'),
  aggregate_type TEXT NOT NULL CHECK (aggregate_type = 'contact_submission'),
  aggregate_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000),
  available_at TEXT NOT NULL,
  locked_by TEXT,
  lock_expires_at TEXT,
  lock_token_hash TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactional_email_outbox_dispatch
  ON transactional_email_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_transactional_email_outbox_processing_lease
  ON transactional_email_outbox (lock_expires_at, available_at, created_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_transactional_email_outbox_aggregate
  ON transactional_email_outbox (aggregate_type, aggregate_id, topic);
