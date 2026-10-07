-- Telegram private chat identifiers are delivery addresses and must not be
-- stored in plaintext. Orders retain only their existing HMAC subject hash;
-- this table binds that hash to an AES-GCM envelope for Worker notifications.
-- `shop_webhook_outbox` predates the native Worker destination and has a
-- restrictive CHECK constraint. Rebuild it once so existing rows and leases
-- survive while `telegram_worker` can be selected for Telegram-origin orders.
PRAGMA foreign_keys = OFF;
ALTER TABLE shop_webhook_outbox RENAME TO shop_webhook_outbox_legacy;

CREATE TABLE shop_webhook_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('telegram_vps', 'telegram_worker', 'notion', 'email', 'generic_webhook')),
  dedupe_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000),
  available_at TEXT NOT NULL,
  locked_by TEXT,
  lock_expires_at TEXT,
  lock_token_hash TEXT,
  last_error_code TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (destination, dedupe_key)
);

INSERT INTO shop_webhook_outbox
  (id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, status,
   attempt_count, available_at, locked_by, lock_expires_at, lock_token_hash, last_error_code,
   delivered_at, created_at, updated_at)
SELECT id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, status,
   attempt_count, available_at, locked_by, lock_expires_at, lock_token_hash, last_error_code,
   delivered_at, created_at, updated_at
FROM shop_webhook_outbox_legacy;

DROP TABLE shop_webhook_outbox_legacy;

CREATE INDEX IF NOT EXISTS idx_shop_webhook_outbox_dispatch
  ON shop_webhook_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_shop_webhook_outbox_processing_lease
  ON shop_webhook_outbox (lock_expires_at, destination, available_at, created_at)
  WHERE status = 'processing';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_telegram_recipients (
  subject_hash TEXT PRIMARY KEY CHECK (length(subject_hash) = 43),
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  chat_ciphertext_b64 TEXT NOT NULL CHECK (length(chat_ciphertext_b64) BETWEEN 20 AND 256),
  chat_iv_b64 TEXT NOT NULL CHECK (length(chat_iv_b64) = 16),
  key_version TEXT NOT NULL CHECK (length(key_version) BETWEEN 1 AND 64),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_customer
  ON shop_telegram_recipients (customer_id, updated_at DESC);
