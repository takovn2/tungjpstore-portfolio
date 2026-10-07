-- Remember whether the quantity selector is attached to a product photo caption.
ALTER TABLE shop_telegram_carts
  ADD COLUMN pending_quantity_uses_caption INTEGER NOT NULL DEFAULT 0
  CHECK (pending_quantity_uses_caption IN (0, 1));
