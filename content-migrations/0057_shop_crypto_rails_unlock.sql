-- Finish unlocking the payment rails.
--
-- Migration 0056 opened `shop_payment_provider_configs` and
-- `shop_payment_attempts`, but the crypto path was left pinned:
--
--   shop_crypto_payment_methods.provider   CHECK (provider IN ('bybit','binance'))
--   shop_crypto_payment_attempts.provider  CHECK (provider IN ('bybit','binance'))
--   shop_crypto_payment_events.provider    CHECK (provider IN ('bybit','binance'))
--   shop_payment_events.provider           CHECK (provider IN ('vietqr','payos','casso','generic_signed','manual'))
--
-- That matters because crypto is the number one rail for this expansion: a
-- customer outside Vietnam has no local bank rail, and USDT is the one method
-- that works everywhere without a local acquiring licence. Yet registering any
-- crypto provider other than Bybit or Binance is still rejected by the schema,
-- so the verifier that would settle those payments automatically cannot be
-- attached. The asset list is pinned to USDT/USDC for the same reason.
--
-- Same rebuild pattern as 0056. Existing rows are preserved verbatim and keep
-- their values; only the enumerators widen.

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. Crypto payment methods: any provider, any asset
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_crypto_payment_methods_v2 (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  -- Widened from CHECK (asset IN ('USDT','USDC')). A rail may settle in any
  -- asset its verifier can read.
  asset TEXT NOT NULL CHECK (length(asset) BETWEEN 2 AND 12),
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
  storefront_scope TEXT NOT NULL DEFAULT 'glb' CHECK (storefront_scope IN ('legacy', 'glb')),
  verification_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (verification_mode IN ('manual', 'auto', 'hybrid')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO shop_crypto_payment_methods_v2 (
  id, provider, rail, asset, network, destination_type, destination_value, memo_or_tag,
  display_name, status, min_confirmations, expiry_minutes, sort_order, version,
  public_config_json, storefront_scope, verification_mode, created_by, updated_by,
  created_at, updated_at
)
SELECT
  id, provider, rail, asset, network, destination_type, destination_value, memo_or_tag,
  display_name, status, min_confirmations, expiry_minutes, sort_order, version,
  public_config_json, storefront_scope, verification_mode, created_by, updated_by,
  created_at, updated_at
FROM shop_crypto_payment_methods;

DROP TABLE shop_crypto_payment_methods;
ALTER TABLE shop_crypto_payment_methods_v2 RENAME TO shop_crypto_payment_methods;

CREATE INDEX IF NOT EXISTS idx_shop_crypto_method_public
  ON shop_crypto_payment_methods (status, sort_order, provider, asset, network, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_crypto_method_scope_public
  ON shop_crypto_payment_methods (storefront_scope, status, sort_order, provider, asset, network);

-- ---------------------------------------------------------------------------
-- 2. Crypto payment attempts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_crypto_payment_attempts_v2 (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  payment_method_id TEXT NOT NULL REFERENCES shop_crypto_payment_methods(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  asset TEXT NOT NULL CHECK (length(asset) BETWEEN 2 AND 12),
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

INSERT INTO shop_crypto_payment_attempts_v2 (
  id, order_id, payment_method_id, provider, rail, asset, network,
  expected_amount_atomic, expected_amount_minor, destination_snapshot, memo_or_tag_snapshot,
  customer_reference, provider_reference, transaction_reference, status, evidence_json,
  evidence_hash, failure_code, checked_at, confirmed_at, expires_at, created_at, updated_at
)
SELECT
  id, order_id, payment_method_id, provider, rail, asset, network,
  expected_amount_atomic, expected_amount_minor, destination_snapshot, memo_or_tag_snapshot,
  customer_reference, provider_reference, transaction_reference, status, evidence_json,
  evidence_hash, failure_code, checked_at, confirmed_at, expires_at, created_at, updated_at
FROM shop_crypto_payment_attempts;

DROP TABLE shop_crypto_payment_attempts;
ALTER TABLE shop_crypto_payment_attempts_v2 RENAME TO shop_crypto_payment_attempts;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_live_order
  ON shop_crypto_payment_attempts (order_id)
  WHERE status IN ('created', 'awaiting_payment', 'detected', 'needs_review');
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_provider_reference
  ON shop_crypto_payment_attempts (provider, rail, transaction_reference)
  WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shop_crypto_attempt_reconcile
  ON shop_crypto_payment_attempts (status, expires_at, checked_at, provider, rail);

-- ---------------------------------------------------------------------------
-- 3. Crypto payment events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_crypto_payment_events_v2 (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT REFERENCES shop_crypto_payment_attempts(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES shop_orders(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  rail TEXT NOT NULL CHECK (rail IN ('internal_uid', 'onchain_deposit', 'pay_order')),
  provider_event_id TEXT NOT NULL,
  transaction_reference TEXT,
  asset TEXT NOT NULL CHECK (length(asset) BETWEEN 2 AND 12),
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

INSERT INTO shop_crypto_payment_events_v2 (
  id, payment_attempt_id, order_id, provider, rail, provider_event_id,
  transaction_reference, asset, network, amount_atomic, destination, status,
  match_state, evidence_json, evidence_hash, error_code, occurred_at, created_at
)
SELECT
  id, payment_attempt_id, order_id, provider, rail, provider_event_id,
  transaction_reference, asset, network, amount_atomic, destination, status,
  match_state, evidence_json, evidence_hash, error_code, occurred_at, created_at
FROM shop_crypto_payment_events;

DROP TABLE shop_crypto_payment_events;
ALTER TABLE shop_crypto_payment_events_v2 RENAME TO shop_crypto_payment_events;

CREATE INDEX IF NOT EXISTS idx_shop_crypto_events_order
  ON shop_crypto_payment_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_crypto_events_review
  ON shop_crypto_payment_events (match_state, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Payment events: any provider
-- ---------------------------------------------------------------------------
-- Every rail's webhook lands here, so a locked provider list means a new rail
-- can take money but cannot record what happened to it.
CREATE TABLE IF NOT EXISTS shop_payment_events_v2 (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  provider_event_id TEXT NOT NULL,
  payment_attempt_id TEXT REFERENCES shop_payment_attempts(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES shop_orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  transaction_reference TEXT,
  amount_minor INTEGER,
  currency TEXT,
  order_reference TEXT,
  payload_hash TEXT NOT NULL,
  signature_verified INTEGER NOT NULL CHECK (signature_verified IN (0, 1)),
  match_state TEXT NOT NULL CHECK (match_state IN ('matched', 'unmatched', 'amount_mismatch', 'currency_mismatch', 'invalid_signature')),
  processing_state TEXT NOT NULL CHECK (processing_state IN ('accepted', 'ignored', 'rejected', 'processed')),
  error_code TEXT,
  occurred_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_event_id)
);

INSERT INTO shop_payment_events_v2 (
  id, provider, provider_event_id, payment_attempt_id, order_id, event_type,
  transaction_reference, amount_minor, currency, order_reference, payload_hash,
  signature_verified, match_state, processing_state, error_code, occurred_at,
  processed_at, created_at
)
SELECT
  id, provider, provider_event_id, payment_attempt_id, order_id, event_type,
  transaction_reference, amount_minor, currency, order_reference, payload_hash,
  signature_verified, match_state, processing_state, error_code, occurred_at,
  processed_at, created_at
FROM shop_payment_events;

DROP TABLE shop_payment_events;
ALTER TABLE shop_payment_events_v2 RENAME TO shop_payment_events;

CREATE INDEX IF NOT EXISTS idx_shop_payment_events_order
  ON shop_payment_events (order_id, created_at DESC);

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = OFF;
