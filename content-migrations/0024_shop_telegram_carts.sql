-- In-chat Telegram cart state: multi-qty lines + optional discount code draft.
-- Bound to Telegram private user id (not website session cookies).
CREATE TABLE IF NOT EXISTS shop_telegram_carts (
  telegram_user_id TEXT PRIMARY KEY CHECK (length(telegram_user_id) BETWEEN 1 AND 20),
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  discount_code TEXT CHECK (discount_code IS NULL OR (length(discount_code) BETWEEN 1 AND 64)),
  awaiting TEXT CHECK (awaiting IS NULL OR awaiting IN ('discount')),
  items_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_telegram_carts_expiry
  ON shop_telegram_carts (expires_at);
