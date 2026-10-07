-- Telegram webhook update deduplication and fencing state. The update payload
-- is intentionally not stored; only its hash and operational state are kept.
CREATE TABLE IF NOT EXISTS shop_telegram_updates (
  update_id INTEGER PRIMARY KEY,
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_updates_reclaim
  ON shop_telegram_updates (status, lock_expires_at, updated_at)
  WHERE status IN ('processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_shop_telegram_updates_expiry
  ON shop_telegram_updates (expires_at, update_id);
