-- Customer account auth: expand identity providers, sessions, OAuth/magic challenges,
-- security events, and account activation timestamp on shop_customers.
PRAGMA foreign_keys = OFF;

-- Guest checkout already creates shop_customers by email. Activation marks the first
-- verified login (Google / magic link) so account features can distinguish shadow rows.
ALTER TABLE shop_customers ADD COLUMN account_activated_at TEXT;

-- Expand identity providers for OAuth (google/github) while preserving existing rows.
ALTER TABLE shop_customer_identities RENAME TO shop_customer_identities_legacy;

CREATE TABLE shop_customer_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('email', 'telegram', 'notion', 'external', 'google', 'github')),
  external_subject TEXT NOT NULL,
  display_handle TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, external_subject)
);

INSERT INTO shop_customer_identities
  (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
SELECT id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at
FROM shop_customer_identities_legacy;

DROP TABLE shop_customer_identities_legacy;

CREATE INDEX IF NOT EXISTS idx_shop_customer_identities_customer
  ON shop_customer_identities (customer_id, provider);

CREATE TABLE IF NOT EXISTS shop_customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'github', 'email')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_hash TEXT,
  ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_sessions_customer
  ON shop_customer_sessions (customer_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_customer_sessions_expiry
  ON shop_customer_sessions (expires_at)
  WHERE revoked_at IS NULL;

-- Short-lived OAuth state (PKCE) and magic-link tokens. Store only hashes of public tokens.
-- code_verifier for PKCE lives in payload_json (private DB, TTL minutes).
CREATE TABLE IF NOT EXISTS shop_auth_challenges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('oauth_state', 'magic_link')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('google', 'github', 'email')),
  token_hash TEXT NOT NULL UNIQUE,
  redirect_path TEXT,
  email_normalized TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_shop_auth_challenges_expiry
  ON shop_auth_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_auth_challenges_email
  ON shop_auth_challenges (email_normalized, created_at DESC)
  WHERE kind = 'magic_link' AND email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS shop_customer_security_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES shop_customers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login', 'logout', 'login_failed', 'magic_request', 'key_reveal',
    'claim_order', 'blocked', 'oauth_start', 'session_purged'
  )),
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_security_events_customer
  ON shop_customer_security_events (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_customer_security_events_type
  ON shop_customer_security_events (event_type, created_at DESC);

PRAGMA foreign_keys = ON;
