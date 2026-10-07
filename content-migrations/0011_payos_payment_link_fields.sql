-- PayOS payment-link identity is kept alongside the VietQR attempt.  The
-- account number and provider secrets remain Worker bindings; these columns
-- only persist the provider identifiers needed for idempotent reconciliation.
ALTER TABLE shop_payment_attempts ADD COLUMN provider_order_code INTEGER;
ALTER TABLE shop_payment_attempts ADD COLUMN provider_description TEXT;
ALTER TABLE shop_payment_attempts ADD COLUMN checkout_url TEXT;
ALTER TABLE shop_payment_attempts ADD COLUMN qr_image_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_order_code
  ON shop_payment_attempts (confirmation_provider, provider_order_code)
  WHERE provider_order_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_description
  ON shop_payment_attempts (confirmation_provider, provider_description)
  WHERE provider_description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_provider_lookup
  ON shop_payment_attempts (confirmation_provider, provider_order_code, provider_reference);
