-- Customer store-credit wallets.
--
-- These tables were queried by the wallet endpoints (api/shop/wallet/*),
-- api/shop/payment-methods.ts and the checkout path in lib/shop/service.ts, but
-- no migration ever created them. Every call site swallowed the missing-table
-- error and reported a zero balance, so the wallet silently did nothing.
--
-- Balances are stored per settlement currency as integer minor units. There is
-- deliberately no single "balance" column: collapsing currencies into one number
-- would require an FX rate, and an implicit conversion must never happen here.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_customer_wallets (
  customer_id TEXT PRIMARY KEY REFERENCES shop_customers(id) ON DELETE CASCADE,
  balance_vnd_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_vnd_minor >= 0),
  balance_usd_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_usd_minor >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS shop_wallet_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'refund', 'adjustment', 'bonus')),
  -- Signed: negative for a debit, positive for a credit. Zero is meaningless.
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  -- Any ISO-4217 code, not just VND/USD, so multi-currency pricing does not
  -- require another migration later.
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  balance_after_minor INTEGER NOT NULL CHECK (balance_after_minor >= 0),
  reference_id TEXT,
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_shop_wallet_transactions_customer
  ON shop_wallet_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_wallet_transactions_reference
  ON shop_wallet_transactions (reference_id)
  WHERE reference_id IS NOT NULL;
