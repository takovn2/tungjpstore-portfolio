-- Crypto checkout belongs to the independent GLB Store surface. Keep the
-- field explicit so legacy PayOS checkout can never consume GLB methods by
-- accident when both storefronts share this catalog database.
ALTER TABLE shop_crypto_payment_methods
  ADD COLUMN storefront_scope TEXT NOT NULL DEFAULT 'glb'
  CHECK (storefront_scope IN ('legacy', 'glb'));

CREATE INDEX IF NOT EXISTS idx_shop_crypto_method_scope_public
  ON shop_crypto_payment_methods (storefront_scope, status, sort_order, provider, asset, network);
