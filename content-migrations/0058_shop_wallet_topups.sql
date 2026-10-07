-- Wallet top-up intents and provider settlement records.
-- A QR/instruction is not a credit: balance changes only after a verified
-- provider event is matched to one pending intent.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_wallet_topups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'payos'),
  provider_order_code INTEGER NOT NULL UNIQUE,
  provider_description TEXT NOT NULL UNIQUE,
  provider_reference TEXT UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'VND'),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('created', 'awaiting_payment', 'confirmed', 'failed', 'expired', 'cancelled')),
  qr_image_url TEXT,
  checkout_url TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_wallet_topups_customer
  ON shop_wallet_topups (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_wallet_topups_pending
  ON shop_wallet_topups (status, expires_at)
  WHERE status IN ('created', 'awaiting_payment');
