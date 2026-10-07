-- Price books: per-market pricing that is NOT derived from an FX rate.
--
-- Why this table exists at all: converting one VND price with an FX rate produces
-- prices that no local buyer will accept. A Cursor Pro seat sells for 269,000 VND
-- in Vietnam, which converts to about 10.50 USD, but the same seat realistically
-- sells for 3-5 USD in the Philippines. Purchasing power, not the exchange rate,
-- decides what a market will pay.
--
-- So a price book holds a hand-set price per variant per market. FX is still
-- needed, but only as a margin guard: floor_minor is the cost floor converted to
-- the book's currency, and a price is never allowed below it.
CREATE TABLE IF NOT EXISTS shop_price_books (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  -- How to round a converted price when a variant has no explicit entry:
  -- 'none' leaves it exact, 'nearest_1000' and 'nearest_100' suit zero-decimal
  -- currencies, 'charm_99' ends the price in .99 for two-decimal currencies.
  rounding_rule TEXT NOT NULL DEFAULT 'none' CHECK (rounding_rule IN ('none', 'nearest_100', 'nearest_1000', 'charm_99')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_price_book_items (
  price_book_id TEXT NOT NULL REFERENCES shop_price_books(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  compare_at_minor INTEGER CHECK (compare_at_minor IS NULL OR compare_at_minor >= price_minor),
  -- Cost floor in this book's currency. A price below it is replaced by it, so a
  -- mistyped entry cannot sell below cost.
  floor_minor INTEGER NOT NULL DEFAULT 0 CHECK (floor_minor >= 0),
  updated_by TEXT NOT NULL DEFAULT 'migration',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (price_book_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_price_book_items_variant
  ON shop_price_book_items (variant_id);

-- One default book, in USD, because that is the settlement reference the
-- storefront already uses. Markets are attached to a book via
-- shop_markets.price_book_id; a market with no book falls back to this one.
INSERT OR IGNORE INTO shop_price_books
  (id, code, currency, is_default, rounding_rule, created_at, updated_at)
VALUES
  ('price-book-global', 'GLOBAL', 'USD', 1, 'none',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
