-- Crypto payment methods and evidence are deliberately separate from the
-- legacy VietQR/payOS tables. This lets the shop migrate without rewriting
-- historical payment records.
CREATE TABLE IF NOT EXISTS shop_crypto_payment_methods (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('bybit', 'binance')),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  asset TEXT NOT NULL CHECK (asset IN ('USDT', 'USDC')),
  network TEXT NOT NULL DEFAULT '',
  destination_type TEXT NOT NULL CHECK (destination_type IN ('uid', 'wallet_address')),
  destination_value TEXT NOT NULL,
  memo_or_tag TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'archived')),
  min_confirmations INTEGER NOT NULL DEFAULT 1 CHECK (min_confirmations >= 0 AND min_confirmations <= 100000),
  expiry_minutes INTEGER NOT NULL DEFAULT 30 CHECK (expiry_minutes >= 5 AND expiry_minutes <= 1440),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 100000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  public_config_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_crypto_method_public
  ON shop_crypto_payment_methods (status, sort_order, provider, asset, network, updated_at DESC);

CREATE TABLE IF NOT EXISTS shop_crypto_payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  payment_method_id TEXT NOT NULL REFERENCES shop_crypto_payment_methods(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('bybit', 'binance')),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  asset TEXT NOT NULL CHECK (asset IN ('USDT', 'USDC')),
  network TEXT NOT NULL DEFAULT '',
  expected_amount_atomic TEXT NOT NULL CHECK (length(expected_amount_atomic) BETWEEN 1 AND 80),
  expected_amount_minor INTEGER NOT NULL CHECK (expected_amount_minor >= 0),
  destination_snapshot TEXT NOT NULL,
  memo_or_tag_snapshot TEXT NOT NULL DEFAULT '',
  customer_reference TEXT,
  provider_reference TEXT,
  transaction_reference TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'awaiting_payment', 'detected', 'needs_review', 'confirmed', 'failed', 'expired', 'cancelled')),
  evidence_json TEXT,
  evidence_hash TEXT,
  failure_code TEXT,
  checked_at TEXT,
  confirmed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_live_order
  ON shop_crypto_payment_attempts (order_id)
  WHERE status IN ('created', 'awaiting_payment', 'detected', 'needs_review');

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_provider_reference
  ON shop_crypto_payment_attempts (provider, rail, transaction_reference)
  WHERE transaction_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_crypto_attempt_reconcile
  ON shop_crypto_payment_attempts (status, expires_at, checked_at, provider, rail);

CREATE TABLE IF NOT EXISTS shop_crypto_payment_events (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT REFERENCES shop_crypto_payment_attempts(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES shop_orders(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('bybit', 'binance')),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  provider_event_id TEXT NOT NULL,
  transaction_reference TEXT,
  asset TEXT NOT NULL CHECK (asset IN ('USDT', 'USDC')),
  network TEXT NOT NULL DEFAULT '',
  amount_atomic TEXT,
  destination TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  match_state TEXT NOT NULL CHECK (match_state IN ('detected', 'matched', 'needs_review', 'unmatched', 'duplicate')),
  evidence_json TEXT,
  evidence_hash TEXT NOT NULL,
  error_code TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider, rail, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_crypto_events_order
  ON shop_crypto_payment_events (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_crypto_events_review
  ON shop_crypto_payment_events (match_state, created_at DESC);
