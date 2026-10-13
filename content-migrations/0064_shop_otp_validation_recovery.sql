-- Bounded validation cycles with owner-authorized recovery. Never store RPC errors or mail data.
ALTER TABLE shop_otp_grants ADD COLUMN validation_total_attempts INTEGER NOT NULL DEFAULT 0 CHECK (validation_total_attempts >= 0);
ALTER TABLE shop_otp_grants ADD COLUMN validation_cycle INTEGER NOT NULL DEFAULT 1 CHECK (validation_cycle >= 1);
ALTER TABLE shop_otp_grants ADD COLUMN validation_last_failure TEXT CHECK (validation_last_failure IN ('routing_unknown','inactive','not_found','service_unavailable','invalid_response'));
ALTER TABLE shop_otp_grants ADD COLUMN validation_failed_at TEXT;
ALTER TABLE shop_otp_grants ADD COLUMN validation_requeued_at TEXT;
UPDATE shop_otp_grants SET validation_total_attempts = validation_attempts;
CREATE TABLE shop_otp_validation_requeues (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES shop_otp_grants(id) ON DELETE RESTRICT,
  cycle INTEGER NOT NULL CHECK (cycle >= 2),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(grant_id, cycle)
);
CREATE TRIGGER shop_otp_requeue_no_update BEFORE UPDATE ON shop_otp_validation_requeues
BEGIN
  SELECT RAISE(ABORT,'otp_requeue_history_immutable');
END;
CREATE TRIGGER shop_otp_requeue_no_delete BEFORE DELETE ON shop_otp_validation_requeues
BEGIN
  SELECT RAISE(ABORT,'otp_requeue_history_required');
END;
