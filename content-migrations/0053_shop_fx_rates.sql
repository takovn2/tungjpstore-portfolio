-- Generic FX rates.
--
-- Migration 0043 stores one hand-maintained VND/USD scalar and its schema is
-- locked with CHECK (base_currency = 'VND') / CHECK (display_currency = 'USD').
-- That cannot express any other pair, and a hand-edited number is how the rate
-- went a year stale.
--
-- This table stores any pair, with the direction, the source and the timestamp
-- attached, so a rate can be audited after the fact and refreshed by a provider.
--
-- Direction matches money.ts convertMinor(): rate_scaled / rate_scale is how many
-- units of from_currency one unit of to_currency costs, and conversion DIVIDES by
-- it. "25,500 VND per USD" is therefore stored as from=VND, to=USD.
CREATE TABLE IF NOT EXISTS shop_fx_rates (
  from_currency TEXT NOT NULL CHECK (length(from_currency) = 3 AND from_currency = upper(from_currency)),
  to_currency TEXT NOT NULL CHECK (length(to_currency) = 3 AND to_currency = upper(to_currency)),
  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
  rate_scale INTEGER NOT NULL DEFAULT 1000000 CHECK (rate_scale > 0),
  -- Who produced the number: an FX provider name, or 'manual' for operator edits.
  provider TEXT NOT NULL DEFAULT 'manual',
  -- When the rate was observed by the provider, which is what makes it stale,
  -- as opposed to fetched_at which is only when we stored it.
  as_of TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'migration',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_currency, to_currency),
  CHECK (from_currency <> to_currency)
);

CREATE TABLE IF NOT EXISTS shop_fx_rate_history (
  id TEXT PRIMARY KEY,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
  rate_scale INTEGER NOT NULL DEFAULT 1000000 CHECK (rate_scale > 0),
  provider TEXT NOT NULL,
  as_of TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_fx_rate_history_pair
  ON shop_fx_rate_history (from_currency, to_currency, created_at DESC);

-- Snapshot the rate currently in shop_currency_settings so the new table is
-- populated from day one. Both tables may hold a VND/USD rate; getShopPricingSettings
-- prefers this one and falls back to 0043, so the old admin control keeps working
-- until a provider takes over.
INSERT OR IGNORE INTO shop_fx_rates
  (from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, fetched_at, updated_by, created_at, updated_at)
SELECT 'VND', 'USD', usd_vnd_rate_scaled, rate_scale, 'manual', updated_at, updated_at, updated_by,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM shop_currency_settings
WHERE id = 'default';
