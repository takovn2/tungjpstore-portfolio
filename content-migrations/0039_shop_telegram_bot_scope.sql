-- Bind Mini App sessions, orders, and encrypted delivery recipients to the
-- bot that authenticated the interaction. Existing records stay on the
-- environment fallback until their next verified bootstrap/order.
ALTER TABLE shop_telegram_mini_sessions ADD COLUMN auth_bot_config_id TEXT NOT NULL DEFAULT 'environment';
ALTER TABLE shop_telegram_mini_sessions ADD COLUMN auth_bot_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_bot_version > 0);
CREATE INDEX IF NOT EXISTS idx_shop_telegram_mini_sessions_bot
  ON shop_telegram_mini_sessions (auth_bot_config_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE shop_orders ADD COLUMN telegram_bot_config_id TEXT NOT NULL DEFAULT 'environment';
CREATE INDEX IF NOT EXISTS idx_shop_orders_telegram_bot
  ON shop_orders (telegram_bot_config_id, created_at DESC)
  WHERE source_channel = 'telegram';

PRAGMA foreign_keys = OFF;
ALTER TABLE shop_telegram_recipients RENAME TO shop_telegram_recipients_legacy_scope;
CREATE TABLE shop_telegram_recipients (
  subject_hash TEXT NOT NULL CHECK (length(subject_hash) = 43),
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  bot_config_id TEXT NOT NULL DEFAULT 'environment',
  chat_ciphertext_b64 TEXT NOT NULL CHECK (length(chat_ciphertext_b64) BETWEEN 20 AND 256),
  chat_iv_b64 TEXT NOT NULL CHECK (length(chat_iv_b64) = 16),
  key_version TEXT NOT NULL CHECK (length(key_version) BETWEEN 1 AND 64),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_hash, customer_id, bot_config_id)
);
INSERT INTO shop_telegram_recipients
  (subject_hash, customer_id, bot_config_id, chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at)
SELECT subject_hash, customer_id, 'environment', chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at
FROM shop_telegram_recipients_legacy_scope;
DROP TABLE shop_telegram_recipients_legacy_scope;
CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_customer
  ON shop_telegram_recipients (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_subject
  ON shop_telegram_recipients (subject_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_telegram_recipients_bot
  ON shop_telegram_recipients (bot_config_id, updated_at DESC);
PRAGMA foreign_keys = ON;
