-- Markets: the layer the storefront never had.
--
-- Until now "which market is this visitor in" was a single boolean in
-- api/shop/payment-methods.ts:
--   isInternational = locale !== "vi" || country !== "VN"
-- Everything else in the codebase derived from that one line, which is why the
-- shop could only ever be "Vietnam" or "not Vietnam".
--
-- A market is a real record: which countries belong to it, which locale and
-- presentment currency it uses, which payment rails it offers and in what order,
-- and which catalogue it may see.
--
-- Note the currency column has NO CHECK pinning it to VND or USD. That is the
-- whole point: migration 0043 locks base_currency = 'VND' at the schema level,
-- and this table is what lets pricing escape that.
CREATE TABLE IF NOT EXISTS shop_markets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  -- Filled in by the price-book migration; nullable until then so this migration
  -- can land first.
  price_book_id TEXT,
  tax_profile_id TEXT,
  catalog_scope TEXT NOT NULL DEFAULT 'all' CHECK (catalog_scope IN ('all', 'glb', 'vn_only')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A country belongs to exactly one market. The primary key is the country, not
-- (market, country), so two markets can never both claim PH.
CREATE TABLE IF NOT EXISTS shop_market_countries (
  country_code TEXT NOT NULL PRIMARY KEY CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  market_id TEXT NOT NULL REFERENCES shop_markets(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_market_countries_market
  ON shop_market_countries (market_id);

-- Payment rails per market, in priority order. This replaces the hardcoded
-- `isInternational ? crypto : vietqr` branch with data an operator can edit.
CREATE TABLE IF NOT EXISTS shop_market_payment_methods (
  market_id TEXT NOT NULL REFERENCES shop_markets(id) ON DELETE CASCADE,
  rail_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (market_id, rail_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_market_payment_methods_lookup
  ON shop_market_payment_methods (market_id, enabled, priority);

-- Per-market catalogue visibility. Needed because some SKUs cannot legally or
-- contractually be sold in every country, and because the grey-market catalogue
-- should not be advertised where the resale terms are riskiest.
CREATE TABLE IF NOT EXISTS shop_market_catalog_rules (
  market_id TEXT NOT NULL REFERENCES shop_markets(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  PRIMARY KEY (market_id, product_id)
);

-- Two seed markets. GLOBAL is the fallback for every unrecognised country, which
-- is what localeForCountry() already does, just without a name or any data.
-- VN reproduces today's behaviour exactly: VietQR first, crypto second.
INSERT OR IGNORE INTO shop_markets
  (id, code, locale, currency, catalog_scope, is_default, enabled, sort_order, created_at, updated_at)
VALUES
  ('market-vn', 'VN', 'vi', 'VND', 'all', 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('market-global', 'GLOBAL', 'en', 'USD', 'all', 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO shop_market_countries (country_code, market_id, created_at)
VALUES ('VN', 'market-vn', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Vietnam: bank QR first, crypto as the alternative.
INSERT OR IGNORE INTO shop_market_payment_methods (market_id, rail_id, priority, enabled)
VALUES
  ('market-vn', 'payos', 0, 1),
  ('market-vn', 'crypto', 1, 1);

-- Everywhere else: crypto first. VietQR is listed but disabled, because the
-- endpoint falls back to it when no crypto method is configured and the row has
-- to exist for that fallback to keep working.
INSERT OR IGNORE INTO shop_market_payment_methods (market_id, rail_id, priority, enabled)
VALUES
  ('market-global', 'crypto', 0, 1),
  ('market-global', 'payos', 1, 0);
