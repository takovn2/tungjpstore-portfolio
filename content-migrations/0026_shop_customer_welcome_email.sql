-- Extend the durable shop email outbox with a one-time account welcome event.
-- Recipient details are resolved from shop_customers only when the message is sent.
PRAGMA foreign_keys = OFF;

ALTER TABLE transactional_email_outbox RENAME TO transactional_email_outbox_legacy;

CREATE TABLE transactional_email_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK (topic IN (
    'shop.order.created', 'shop.order.payment_confirmed', 'shop.order.fulfilled',
    'shop.customer.welcome'
  )),
  aggregate_type TEXT NOT NULL CHECK (aggregate_type IN ('shop_order', 'shop_customer')),
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
  updated_at TEXT NOT NULL,
  CHECK (
    (topic = 'shop.customer.welcome' AND aggregate_type = 'shop_customer') OR
    (topic IN ('shop.order.created', 'shop.order.payment_confirmed', 'shop.order.fulfilled') AND aggregate_type = 'shop_order')
  )
);

INSERT INTO transactional_email_outbox
  (id, topic, aggregate_type, aggregate_id, dedupe_key, status, attempt_count,
   available_at, locked_by, lock_expires_at, lock_token_hash, provider_message_id,
   last_error_code, sent_at, created_at, updated_at)
SELECT id, topic, aggregate_type, aggregate_id, dedupe_key, status, attempt_count,
   available_at, locked_by, lock_expires_at, lock_token_hash, provider_message_id,
   last_error_code, sent_at, created_at, updated_at
FROM transactional_email_outbox_legacy;

DROP TABLE transactional_email_outbox_legacy;

CREATE INDEX idx_transactional_email_outbox_dispatch
  ON transactional_email_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_transactional_email_outbox_processing_lease
  ON transactional_email_outbox (lock_expires_at, available_at, created_at)
  WHERE status = 'processing';

CREATE INDEX idx_transactional_email_outbox_aggregate
  ON transactional_email_outbox (aggregate_type, aggregate_id, topic);

PRAGMA foreign_keys = ON;
