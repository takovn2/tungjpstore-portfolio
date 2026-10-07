-- Persist the Telegram message being edited while a customer types a custom quantity.
ALTER TABLE shop_telegram_carts
  ADD COLUMN pending_quantity_variant_id TEXT
  CHECK (pending_quantity_variant_id IS NULL OR length(pending_quantity_variant_id) BETWEEN 8 AND 80);

ALTER TABLE shop_telegram_carts
  ADD COLUMN pending_quantity_message_id INTEGER
  CHECK (pending_quantity_message_id IS NULL OR pending_quantity_message_id > 0);

ALTER TABLE shop_telegram_carts
  ADD COLUMN pending_quantity_expires_at TEXT;
