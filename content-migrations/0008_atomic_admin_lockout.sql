-- Upgrade the already-deployed login-attempt table for identity-wide atomic
-- counters while retaining a keyed source fingerprint for incident review.
ALTER TABLE admin_login_attempts
  ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';

-- Existing rows used a per-IP key and cannot safely participate in the new
-- identity-wide counter semantics. They are short-lived throttle state only.
DELETE FROM admin_login_attempts;
