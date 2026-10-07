-- Payment rails v2: make a payment rail data, not code.
--
-- The payment layer was built around one rail. `shop_payment_provider_configs`
-- and `shop_payment_attempts` both carry CHECK (provider IN ('vietqr')) and the
-- attempts table also pins method = 'bank_transfer_qr', so no second rail can be
-- stored, let alone routed to. There is no way to add GCash, USDT or a card
-- without editing code, which is exactly why the shop has zero international
-- rails today.
--
-- SQLite cannot drop or alter a CHECK constraint, so each table is rebuilt.
-- Column names and types are preserved so every existing query keeps working;
-- only the enumerators widen and new optional columns are appended.
--
-- FK note: both pragmas are set, on purpose, because it is not knowable from here
-- whether the runner wraps this file in a transaction.
--   - Not in a transaction: `foreign_keys = OFF` takes effect and the drops below
--     are simply not enforced.
--   - Inside a transaction: `foreign_keys` is a no-op (SQLite forbids changing it
--     there), so `defer_foreign_keys = ON` carries it, delaying enforcement to
--     COMMIT -- by which point the RENAME has restored the referenced table name
--     and every row still has a valid parent.
-- Setting only one of them would fail in one of the two cases.

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. Provider configs: any rail, not just VietQR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_payment_provider_configs_v2 (
  id TEXT PRIMARY KEY,
  -- Widened from CHECK (provider IN ('vietqr')). A rail is identified by its
  -- provider id; the set is now open so adding one is a row, not a migration.
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  -- What kind of rail this is, so routing can reason about capabilities.
  rail_type TEXT NOT NULL DEFAULT 'bank_qr'
    CHECK (rail_type IN ('bank_qr', 'crypto', 'ewallet', 'card', 'manual')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'archived')),
  -- Bank fields default to '' so a crypto or e-wallet rail can exist without
  -- inventing a bank account for it.
  bank_id TEXT NOT NULL DEFAULT '',
  account_ref TEXT NOT NULL DEFAULT '',
  account_name_display TEXT NOT NULL DEFAULT '',
  qr_template TEXT NOT NULL DEFAULT 'compact2',
  -- Widened to include on-chain confirmation; previously fixed at four values.
  confirmation_adapter TEXT NOT NULL DEFAULT 'manual'
    CHECK (confirmation_adapter IN ('payos', 'casso', 'generic_signed', 'manual', 'onchain', 'provider_webhook')),
  secret_ref TEXT,
  public_config_json TEXT NOT NULL DEFAULT '{}',
  -- Which currencies and countries this rail serves, and what it can do. Empty
  -- arrays mean "unrestricted", so an existing row needs no backfill.
  currencies_json TEXT NOT NULL DEFAULT '[]',
  countries_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  -- Lower sorts first when several rails serve the same market.
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0 AND priority <= 100000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO shop_payment_provider_configs_v2 (
  id, provider, rail_type, display_name, status, bank_id, account_ref, account_name_display,
  qr_template, confirmation_adapter, secret_ref, public_config_json, currencies_json, countries_json,
  capabilities_json, priority, version, created_by, updated_by, created_at, updated_at
)
SELECT
  id, provider, 'bank_qr', display_name, status, bank_id, account_ref, account_name_display,
  qr_template, confirmation_adapter, secret_ref, public_config_json, '[]', '[]',
  '{}', 100, version, created_by, updated_by, created_at, updated_at
FROM shop_payment_provider_configs;

DROP TABLE shop_payment_provider_configs;
ALTER TABLE shop_payment_provider_configs_v2 RENAME TO shop_payment_provider_configs;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_provider_active
  ON shop_payment_provider_configs (provider)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_shop_payment_provider_rail
  ON shop_payment_provider_configs (rail_type, status, priority, provider);

-- ---------------------------------------------------------------------------
-- 2. Payment attempts: any rail, any method
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_payment_attempts_v2 (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  provider_config_id TEXT NOT NULL REFERENCES shop_payment_provider_configs(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40 AND provider = lower(provider)),
  confirmation_provider TEXT NOT NULL
    CHECK (confirmation_provider IN ('payos', 'casso', 'generic_signed', 'manual', 'onchain', 'provider_webhook')),
  -- Widened from CHECK (method = 'bank_transfer_qr').
  method TEXT NOT NULL DEFAULT 'bank_transfer_qr'
    CHECK (method IN ('bank_transfer_qr', 'crypto_transfer', 'ewallet_redirect', 'card_redirect', 'manual')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'awaiting_payment', 'confirmed', 'failed', 'expired', 'cancelled')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  order_reference TEXT NOT NULL COLLATE NOCASE,
  provider_reference TEXT,
  qr_payload_hash TEXT,
  failure_code TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Columns added by later migrations, carried across verbatim.
  provider_order_code INTEGER,
  provider_description TEXT,
  checkout_url TEXT,
  qr_image_url TEXT,
  reconciliation_attempted_at TEXT,
  reconciliation_checked_at TEXT,
  provider_bank_bin TEXT,
  provider_account_number TEXT,
  payment_recovery_claimed_at TEXT
);

INSERT INTO shop_payment_attempts_v2 (
  id, order_id, provider_config_id, provider, confirmation_provider, method, status,
  amount_minor, currency, order_reference, provider_reference, qr_payload_hash, failure_code,
  expires_at, confirmed_at, created_at, updated_at, provider_order_code, provider_description,
  checkout_url, qr_image_url, reconciliation_attempted_at, reconciliation_checked_at,
  provider_bank_bin, provider_account_number, payment_recovery_claimed_at
)
SELECT
  id, order_id, provider_config_id, provider, confirmation_provider, method, status,
  amount_minor, currency, order_reference, provider_reference, qr_payload_hash, failure_code,
  expires_at, confirmed_at, created_at, updated_at, provider_order_code, provider_description,
  checkout_url, qr_image_url, reconciliation_attempted_at, reconciliation_checked_at,
  provider_bank_bin, provider_account_number, payment_recovery_claimed_at
FROM shop_payment_attempts;

DROP TABLE shop_payment_attempts;
ALTER TABLE shop_payment_attempts_v2 RENAME TO shop_payment_attempts;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_provider_reference
  ON shop_payment_attempts (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_order
  ON shop_payment_attempts (order_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_live_order
  ON shop_payment_attempts (order_id)
  WHERE status IN ('created', 'awaiting_payment');

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_expiry
  ON shop_payment_attempts (status, expires_at)
  WHERE status IN ('created', 'awaiting_payment');

-- ---------------------------------------------------------------------------
-- 3. Crypto methods: allow automatic settlement
-- ---------------------------------------------------------------------------
-- Migration 0046 pinned verification_mode to 'manual' while on-chain
-- verification did not exist. Rebuild so a method can opt into automatic
-- settlement once a verifier is configured. Existing rows keep 'manual', so
-- nothing starts auto-settling because of this migration.
CREATE TABLE IF NOT EXISTS shop_crypto_payment_methods_v2 (
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
  storefront_scope TEXT NOT NULL DEFAULT 'glb' CHECK (storefront_scope IN ('legacy', 'glb')),
  -- 'manual' keeps today's review queue. 'auto' settles when a verifier confirms
  -- the transfer; 'hybrid' settles automatically and still queues a review.
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
-- 4. Refunds
-- ---------------------------------------------------------------------------
-- No refund table existed: a refund was an admin editing an order's status. That
-- leaves no record of what was returned, on which rail, or against which
-- capture, which is not defensible once money moves through several providers.
CREATE TABLE IF NOT EXISTS shop_payment_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  payment_attempt_id TEXT REFERENCES shop_payment_attempts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  rail_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (rail_type IN ('bank_qr', 'crypto', 'ewallet', 'card', 'manual')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'pending', 'succeeded', 'failed', 'cancelled')),
  provider_reference TEXT,
  failure_code TEXT,
  requested_by TEXT NOT NULL,
  processed_by TEXT,
  requested_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_payment_refund_order
  ON shop_payment_refunds (order_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_refund_provider_reference
  ON shop_payment_refunds (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Restore enforcement. `foreign_keys = OFF` above is connection-scoped, so a
-- runner that reuses its connection for later migrations or queries would
-- otherwise run with every foreign key silently unenforced from here on.
PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = OFF;
