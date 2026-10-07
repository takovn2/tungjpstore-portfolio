-- Affiliate commission accruals (ledger only — payouts are manual/out of band).
CREATE TABLE IF NOT EXISTS shop_commission_accruals (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_code TEXT NOT NULL,
  order_total_minor INTEGER NOT NULL CHECK (order_total_minor >= 0),
  currency TEXT NOT NULL,
  commission_bps INTEGER NOT NULL CHECK (commission_bps >= 0 AND commission_bps <= 5000),
  commission_minor INTEGER NOT NULL CHECK (commission_minor >= 0),
  status TEXT NOT NULL DEFAULT 'accrued'
    CHECK (status IN ('accrued', 'void', 'paid')),
  source_channel TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_commission_order
  ON shop_commission_accruals (order_id);

CREATE INDEX IF NOT EXISTS idx_shop_commission_partner
  ON shop_commission_accruals (partner_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_commission_status
  ON shop_commission_accruals (status, created_at DESC);
