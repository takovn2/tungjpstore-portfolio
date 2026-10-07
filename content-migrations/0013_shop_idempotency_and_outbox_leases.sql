-- Scope newly-issued order tokens to an idempotency generation. Existing
-- records retain an empty salt so their already-issued access tokens remain
-- valid after this additive migration.
ALTER TABLE shop_idempotency_keys ADD COLUMN access_token_salt TEXT NOT NULL DEFAULT '';

-- A worker label is operational metadata, not a fencing token. Hash a random
-- per-claim token so a delayed request from the same VPS identity cannot ACK a
-- lease that has already been reclaimed.
ALTER TABLE shop_webhook_outbox ADD COLUMN lock_token_hash TEXT;

-- The original dispatch index excludes processing rows. Keep it for normal
-- pending/failed delivery and add a narrow recovery index for expired leases.
CREATE INDEX IF NOT EXISTS idx_shop_webhook_outbox_processing_lease
  ON shop_webhook_outbox (lock_expires_at, destination, available_at, created_at)
  WHERE status = 'processing';
