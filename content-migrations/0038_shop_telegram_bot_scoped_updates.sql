-- Telegram update_id values are scoped per bot. Preserve the existing rows
-- under the environment fallback while allowing active/previous bots to share
-- one webhook endpoint without cross-bot duplicate suppression.
PRAGMA foreign_keys = OFF;
ALTER TABLE shop_telegram_updates RENAME TO shop_telegram_updates_legacy;

CREATE TABLE shop_telegram_updates (
  bot_config_id TEXT NOT NULL DEFAULT 'environment',
  update_id INTEGER NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 43),
  update_type TEXT NOT NULL CHECK (length(update_type) BETWEEN 1 AND 40),
  status TEXT NOT NULL DEFAULT 'failed' CHECK (status IN ('processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000),
  lock_token_hash TEXT,
  lock_expires_at TEXT,
  last_error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bot_config_id, update_id)
);

INSERT INTO shop_telegram_updates
  (bot_config_id, update_id, payload_hash, update_type, status, attempt_count, lock_token_hash,
   lock_expires_at, last_error_code, received_at, processed_at, expires_at, updated_at)
SELECT 'environment', update_id, payload_hash, update_type, status, attempt_count, lock_token_hash,
   lock_expires_at, last_error_code, received_at, processed_at, expires_at, updated_at
FROM shop_telegram_updates_legacy;

DROP TABLE shop_telegram_updates_legacy;
CREATE INDEX IF NOT EXISTS idx_shop_telegram_updates_reclaim
  ON shop_telegram_updates (status, lock_expires_at, updated_at)
  WHERE status IN ('processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_shop_telegram_updates_expiry
  ON shop_telegram_updates (expires_at, bot_config_id, update_id);
PRAGMA foreign_keys = ON;
