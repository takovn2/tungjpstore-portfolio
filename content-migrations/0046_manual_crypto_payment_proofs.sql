-- GLB crypto checkout is intentionally manual-review only. Keep the provider
-- label for the receiving account (Bybit/Binance), but remove any dependency
-- on provider API credentials from the payment lifecycle.
ALTER TABLE shop_crypto_payment_methods
  ADD COLUMN verification_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (verification_mode = 'manual');

CREATE TABLE IF NOT EXISTS shop_payment_proofs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  payment_attempt_id TEXT REFERENCES shop_crypto_payment_attempts(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  sha256 TEXT NOT NULL,
  transaction_reference TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'rejected')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_payment_proofs_order
  ON shop_payment_proofs (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_payment_proofs_status
  ON shop_payment_proofs (status, created_at DESC);
