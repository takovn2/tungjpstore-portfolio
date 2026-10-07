-- Platform wave tables: cart bridges, affiliates, attribution events.
-- Additive only; safe to apply on production without downtime.

CREATE TABLE IF NOT EXISTS shop_cart_bridges (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'telegram', 'telegram_glb', 'api')),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0 AND item_count <= 50),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shop_cart_bridges_expires
  ON shop_cart_bridges (expires_at);

CREATE TABLE IF NOT EXISTS shop_affiliate_partners (
  id TEXT PRIMARY KEY,
  code_normalized TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  commission_bps INTEGER NOT NULL DEFAULT 0
    CHECK (commission_bps >= 0 AND commission_bps <= 5000),
  notes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_affiliate_code_active
  ON shop_affiliate_partners (code_normalized)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shop_attribution_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('capture', 'checkout', 'bridge_create', 'bridge_consume', 'recommend')),
  channel TEXT,
  ref_code TEXT,
  discount_code TEXT,
  product_slug TEXT,
  order_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_attribution_events_created
  ON shop_attribution_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_attribution_events_ref
  ON shop_attribution_events (ref_code, created_at DESC)
  WHERE ref_code IS NOT NULL;
