-- Interactive Telegram order refreshes may concurrently recover a missing
-- payOS checkout QR/link. Keep a short-lived CAS timestamp on the payment
-- attempt so only one request contacts the provider at a time.
ALTER TABLE shop_payment_attempts ADD COLUMN payment_recovery_claimed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_recovery_claim
  ON shop_payment_attempts (payment_recovery_claimed_at)
  WHERE status IN ('created', 'awaiting_payment');
