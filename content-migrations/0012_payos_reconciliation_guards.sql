-- A payment attempt may expire only after payOS has answered a status check
-- at or after the payment deadline. Failed checks are tracked separately so
-- the bounded maintenance sweep can rotate through a backlog without treating
-- a transport failure as evidence that no payment exists.
ALTER TABLE shop_payment_attempts ADD COLUMN reconciliation_attempted_at TEXT;
ALTER TABLE shop_payment_attempts ADD COLUMN reconciliation_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_reconciliation
  ON shop_payment_attempts (
    confirmation_provider,
    status,
    expires_at,
    reconciliation_attempted_at
  );
