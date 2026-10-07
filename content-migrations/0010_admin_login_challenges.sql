-- One-time, short-lived challenges prevent replay of the browser-derived
-- password credential during routine admin login.
PRAGMA foreign_keys = ON;

ALTER TABLE admin_security_state
  ADD COLUMN password_version INTEGER NOT NULL DEFAULT 1 CHECK (password_version >= 1);

ALTER TABLE admin_security_state
  ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 1 CHECK (session_epoch >= 1);

ALTER TABLE admin_sessions
  ADD COLUMN password_version INTEGER NOT NULL DEFAULT 1 CHECK (password_version >= 1);

ALTER TABLE admin_sessions
  ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 1 CHECK (session_epoch >= 1);

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL UNIQUE,
  access_sub TEXT NOT NULL,
  access_email TEXT NOT NULL,
  access_audience TEXT NOT NULL,
  origin TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login')),
  password_version INTEGER NOT NULL CHECK (password_version >= 1),
  session_epoch INTEGER NOT NULL CHECK (session_epoch >= 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_identity
  ON admin_login_challenges (access_sub, access_email, action, expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_login_challenges_identity_action
  ON admin_login_challenges (access_sub, access_email, action);

CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_expiry
  ON admin_login_challenges (expires_at, consumed_at);
