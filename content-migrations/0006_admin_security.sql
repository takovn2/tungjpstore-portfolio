-- Password/session gate layered behind Cloudflare Access. Secrets are never
-- stored here: password_hash and token_hash are derived values only.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_security_state (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 200000 AND password_iterations <= 1000000),
  password_set_at TEXT NOT NULL,
  password_changed_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL,
  access_email TEXT NOT NULL,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_subject
  ON admin_sessions (access_sub, access_email, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
  ON admin_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  fingerprint_hash TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL,
  access_email TEXT NOT NULL,
  failed_count INTEGER NOT NULL CHECK (failed_count >= 0 AND failed_count <= 100),
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  last_attempt_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_locked
  ON admin_login_attempts (locked_until);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_identity
  ON admin_login_attempts (access_sub, access_email, failed_count DESC, last_attempt_at DESC);
