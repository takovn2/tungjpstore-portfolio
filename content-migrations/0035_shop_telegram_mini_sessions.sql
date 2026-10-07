-- Server-side Telegram Mini App sessions.
-- The signed Telegram initData is a short-lived bootstrap credential; the
-- browser receives only an opaque, HttpOnly token after it is verified.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_telegram_mini_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 43),
  telegram_user_id TEXT NOT NULL CHECK (telegram_user_id NOT GLOB '*[^0-9]*' AND length(telegram_user_id) BETWEEN 1 AND 20),
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  init_data_hash TEXT NOT NULL UNIQUE CHECK (length(init_data_hash) = 43),
  auth_date INTEGER NOT NULL CHECK (auth_date > 0),
  user_agent_hash TEXT CHECK (user_agent_hash IS NULL OR length(user_agent_hash) = 43),
  created_at TEXT NOT NULL,
  recovered_at TEXT,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_mini_sessions_user
  ON shop_telegram_mini_sessions (telegram_user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_telegram_mini_sessions_customer
  ON shop_telegram_mini_sessions (customer_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_telegram_mini_sessions_expiry
  ON shop_telegram_mini_sessions (expires_at)
  WHERE revoked_at IS NULL;
