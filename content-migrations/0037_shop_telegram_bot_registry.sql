-- Dynamic Telegram bot registry.
-- Bot tokens and webhook secrets are encrypted before they reach D1. The
-- registry stores only ciphertext, keyed fingerprints and operational state.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_telegram_bot_configs (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 20 AND 64),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  telegram_bot_id TEXT NOT NULL UNIQUE
    CHECK (telegram_bot_id NOT GLOB '*[^0-9]*' AND length(telegram_bot_id) BETWEEN 5 AND 24),
  username TEXT NOT NULL UNIQUE
    CHECK (length(username) BETWEEN 5 AND 32 AND username = lower(username)),
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 128),
  status TEXT NOT NULL DEFAULT 'standby'
    CHECK (status IN ('standby', 'activating', 'active', 'previous', 'retiring', 'error', 'revoked')),
  crypto_version TEXT NOT NULL DEFAULT 'telegram-bot-secret-v1',
  key_version TEXT NOT NULL CHECK (length(key_version) BETWEEN 1 AND 64),
  token_ciphertext_b64 TEXT,
  token_iv_b64 TEXT,
  token_fingerprint TEXT NOT NULL CHECK (length(token_fingerprint) = 43),
  webhook_secret_ciphertext_b64 TEXT,
  webhook_secret_iv_b64 TEXT,
  webhook_secret_fingerprint TEXT NOT NULL UNIQUE CHECK (length(webhook_secret_fingerprint) = 43),
  webhook_url TEXT,
  mini_app_url TEXT,
  previous_expires_at TEXT,
  last_validated_at TEXT NOT NULL,
  last_configured_at TEXT,
  last_error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'revoked' AND token_ciphertext_b64 IS NULL AND token_iv_b64 IS NULL
      AND webhook_secret_ciphertext_b64 IS NULL AND webhook_secret_iv_b64 IS NULL)
    OR
    (status <> 'revoked' AND token_ciphertext_b64 IS NOT NULL AND token_iv_b64 IS NOT NULL
      AND webhook_secret_ciphertext_b64 IS NOT NULL AND webhook_secret_iv_b64 IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_active
  ON shop_telegram_bot_configs (status) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_previous
  ON shop_telegram_bot_configs (status) WHERE status = 'previous';

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_activating
  ON shop_telegram_bot_configs (status) WHERE status = 'activating';

CREATE INDEX IF NOT EXISTS idx_shop_telegram_bot_status
  ON shop_telegram_bot_configs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_bot_previous_expiry
  ON shop_telegram_bot_configs (previous_expires_at)
  WHERE status = 'previous';

CREATE TABLE IF NOT EXISTS shop_telegram_bot_events (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 20 AND 64),
  bot_config_id TEXT REFERENCES shop_telegram_bot_configs(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'validated', 'activation_started', 'activated', 'activation_failed',
    'rolled_back', 'previous_retired', 'credentials_rewrapped', 'token_rotated', 'revoked'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  error_code TEXT,
  actor TEXT NOT NULL,
  request_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_bot_events_config
  ON shop_telegram_bot_events (bot_config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_bot_events_created
  ON shop_telegram_bot_events (created_at DESC);
