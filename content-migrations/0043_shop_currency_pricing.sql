-- VND is the merchant's single source price. Storefront and crypto checkout
-- derive USD from this rate; the rate history is retained for auditability.
CREATE TABLE IF NOT EXISTS shop_currency_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  base_currency TEXT NOT NULL DEFAULT 'VND' CHECK (base_currency = 'VND'),
  display_currency TEXT NOT NULL DEFAULT 'USD' CHECK (display_currency = 'USD'),
  usd_vnd_rate_scaled INTEGER NOT NULL CHECK (usd_vnd_rate_scaled >= 1000000 AND usd_vnd_rate_scaled <= 100000000000000),
  rate_scale INTEGER NOT NULL DEFAULT 1000000 CHECK (rate_scale = 1000000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by TEXT NOT NULL DEFAULT 'migration',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_currency_rate_history (
  id TEXT PRIMARY KEY,
  settings_id TEXT NOT NULL REFERENCES shop_currency_settings(id) ON DELETE CASCADE,
  usd_vnd_rate_scaled INTEGER NOT NULL CHECK (usd_vnd_rate_scaled >= 1000000 AND usd_vnd_rate_scaled <= 100000000000000),
  rate_scale INTEGER NOT NULL DEFAULT 1000000 CHECK (rate_scale = 1000000),
  version INTEGER NOT NULL CHECK (version >= 1),
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO shop_currency_settings
  (id, base_currency, display_currency, usd_vnd_rate_scaled, rate_scale, version, updated_by, updated_at)
VALUES ('default', 'VND', 'USD', 25500000000, 1000000, 1, 'migration', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO shop_currency_rate_history
  (id, settings_id, usd_vnd_rate_scaled, rate_scale, version, changed_by, created_at)
SELECT 'currency-rate-initial', id, usd_vnd_rate_scaled, rate_scale, version, updated_by, updated_at
FROM shop_currency_settings WHERE id = 'default';

CREATE INDEX IF NOT EXISTS idx_shop_currency_rate_history_created
  ON shop_currency_rate_history (settings_id, created_at DESC, version DESC);

