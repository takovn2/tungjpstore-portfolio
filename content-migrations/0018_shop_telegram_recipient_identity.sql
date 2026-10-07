-- A Telegram chat may place orders for more than one customer identity (for
-- example, different checkout emails). Keep the chat binding encrypted while
-- preserving one recipient row per (chat subject, customer) pair.
PRAGMA foreign_keys = OFF;
ALTER TABLE shop_telegram_recipients RENAME TO shop_telegram_recipients_legacy;

CREATE TABLE shop_telegram_recipients (
  subject_hash TEXT NOT NULL CHECK (length(subject_hash) = 43),
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  chat_ciphertext_b64 TEXT NOT NULL CHECK (length(chat_ciphertext_b64) BETWEEN 20 AND 256),
  chat_iv_b64 TEXT NOT NULL CHECK (length(chat_iv_b64) = 16),
  key_version TEXT NOT NULL CHECK (length(key_version) BETWEEN 1 AND 64),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_hash, customer_id)
);

INSERT INTO shop_telegram_recipients
  (subject_hash, customer_id, chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at)
SELECT subject_hash, customer_id, chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at
FROM shop_telegram_recipients_legacy;

DROP TABLE shop_telegram_recipients_legacy;

CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_customer
  ON shop_telegram_recipients (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_subject
  ON shop_telegram_recipients (subject_hash, updated_at DESC);
PRAGMA foreign_keys = ON;
