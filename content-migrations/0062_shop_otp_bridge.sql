-- Additive V1 entitlement metadata only. No credentials, OTPs, or feature activation.
PRAGMA foreign_keys = ON;
CREATE TABLE shop_otp_inventory_aliases (
  id TEXT PRIMARY KEY,
  inventory_unit_id TEXT NOT NULL UNIQUE REFERENCES shop_inventory_units(id) ON DELETE RESTRICT,
  alias_id TEXT NOT NULL UNIQUE,
  provider_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready', 'disabled', 'quarantined')),
  validated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE TABLE shop_otp_grants (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES shop_order_items(id) ON DELETE RESTRICT,
  allocation_id TEXT NOT NULL UNIQUE REFERENCES shop_inventory_allocations(id) ON DELETE RESTRICT,
  inventory_unit_id TEXT NOT NULL UNIQUE REFERENCES shop_inventory_units(id) ON DELETE RESTRICT,
  alias_id TEXT NOT NULL UNIQUE,
  provider_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'suspended', 'revoked', 'expired')),
  activated_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  next_validation_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state <> 'active' OR activated_at IS NOT NULL)
);
CREATE INDEX idx_shop_otp_grants_customer ON shop_otp_grants(customer_id, order_id, state);
CREATE INDEX idx_shop_otp_grants_pending ON shop_otp_grants(state, next_validation_at);
CREATE TABLE shop_otp_lookup_attempts (
  request_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES shop_otp_grants(id) ON DELETE RESTRICT,
  identity_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','found','no_code','denied','unavailable','abandoned')),
  latency_ms INTEGER CHECK (latency_ms >= 0 AND latency_ms <= 60000)
);
CREATE INDEX idx_shop_otp_attempts_grant ON shop_otp_lookup_attempts(grant_id, created_at);
CREATE INDEX idx_shop_otp_attempts_customer ON shop_otp_lookup_attempts(customer_id, created_at);
CREATE INDEX idx_shop_otp_attempts_identity ON shop_otp_lookup_attempts(identity_hash, created_at);
CREATE TABLE shop_otp_session_proofs (
  session_hash TEXT PRIMARY KEY REFERENCES shop_customer_sessions(token_hash) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE RESTRICT,
  authenticated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'email'))
);
CREATE TRIGGER shop_otp_binding_no_rebind BEFORE UPDATE OF inventory_unit_id, alias_id, provider_key ON shop_otp_inventory_aliases
WHEN NEW.inventory_unit_id <> OLD.inventory_unit_id OR NEW.alias_id <> OLD.alias_id OR NEW.provider_key <> OLD.provider_key
BEGIN
  SELECT RAISE(ABORT, 'otp_binding_immutable');
END;
CREATE TRIGGER shop_otp_binding_no_delete BEFORE DELETE ON shop_otp_inventory_aliases
BEGIN
  SELECT RAISE(ABORT, 'otp_binding_history_required');
END;
CREATE TRIGGER shop_otp_grant_no_rebind BEFORE UPDATE OF customer_id, order_id, order_item_id, allocation_id, inventory_unit_id, alias_id, provider_key ON shop_otp_grants
WHEN NEW.customer_id <> OLD.customer_id OR NEW.order_id <> OLD.order_id OR NEW.order_item_id <> OLD.order_item_id
 OR NEW.allocation_id <> OLD.allocation_id OR NEW.inventory_unit_id <> OLD.inventory_unit_id
 OR NEW.alias_id <> OLD.alias_id OR NEW.provider_key <> OLD.provider_key
BEGIN
  SELECT RAISE(ABORT, 'otp_grant_immutable');
END;
CREATE TRIGGER shop_otp_grant_no_delete BEFORE DELETE ON shop_otp_grants
BEGIN
  SELECT RAISE(ABORT, 'otp_grant_history_required');
END;
CREATE TRIGGER shop_otp_grant_terminal BEFORE UPDATE OF state ON shop_otp_grants
WHEN (OLD.state IN ('revoked','expired') AND NEW.state <> OLD.state)
 OR (OLD.state = 'active' AND NEW.state = 'pending')
BEGIN
  SELECT RAISE(ABORT, 'otp_grant_terminal');
END;
-- Capture the actual fulfilled allocation atomically; remote validation happens later.
CREATE TRIGGER shop_otp_fulfilled_pending AFTER UPDATE OF status ON shop_inventory_allocations
WHEN NEW.status = 'fulfilled' AND OLD.status <> 'fulfilled'
BEGIN
  INSERT OR IGNORE INTO shop_otp_grants
    (id, customer_id, order_id, order_item_id, allocation_id, inventory_unit_id, alias_id, provider_key,
     state, next_validation_at, created_at, updated_at)
  SELECT 'otp_' || NEW.id, o.customer_id, o.id, i.id, NEW.id, NEW.inventory_unit_id, b.alias_id, b.provider_key,
    'pending', NEW.updated_at, NEW.updated_at, NEW.updated_at
  FROM shop_order_items i JOIN shop_orders o ON o.id = i.order_id
  JOIN shop_customers c ON c.id = o.customer_id
  JOIN shop_otp_inventory_aliases b ON b.inventory_unit_id = NEW.inventory_unit_id AND b.state = 'ready'
  WHERE i.id = NEW.order_item_id AND o.payment_status = 'paid' AND o.status IN ('processing','fulfilled')
    AND c.status = 'active' AND c.deleted_at IS NULL AND c.account_activated_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM shop_customer_identities identity WHERE identity.customer_id = c.id
      AND identity.provider = 'email' AND identity.external_subject = o.customer_email_snapshot AND identity.verified_at IS NOT NULL);
END;
CREATE TRIGGER shop_otp_order_revoked AFTER UPDATE OF payment_status, status, customer_id ON shop_orders
WHEN NEW.payment_status <> 'paid' OR NEW.status NOT IN ('processing','fulfilled') OR NEW.customer_id IS NOT OLD.customer_id
BEGIN
  UPDATE shop_otp_grants SET state = 'revoked', revoked_at = NEW.updated_at,
    revoked_reason = 'order_invalidated', version = version + 1, updated_at = NEW.updated_at
  WHERE order_id = NEW.id AND state NOT IN ('revoked','expired');
END;
CREATE TRIGGER shop_otp_unit_revoked AFTER UPDATE OF status ON shop_inventory_units
WHEN NEW.status IN ('quarantined','revoked')
BEGIN
  UPDATE shop_otp_grants SET state = 'revoked', revoked_at = NEW.updated_at,
    revoked_reason = 'inventory_invalidated', version = version + 1, updated_at = NEW.updated_at
  WHERE inventory_unit_id = NEW.id AND state NOT IN ('revoked','expired');
END;
CREATE TRIGGER shop_otp_binding_revoked AFTER UPDATE OF state ON shop_otp_inventory_aliases
WHEN NEW.state <> 'ready'
BEGIN
  UPDATE shop_otp_grants SET state = 'revoked', revoked_at = NEW.updated_at,
    revoked_reason = 'binding_invalidated', version = version + 1, updated_at = NEW.updated_at
  WHERE inventory_unit_id = NEW.inventory_unit_id AND state NOT IN ('revoked','expired');
END;
CREATE TRIGGER shop_otp_customer_revoked AFTER UPDATE OF status, deleted_at ON shop_customers
WHEN NEW.status <> 'active' OR NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE shop_otp_grants SET state = 'revoked', revoked_at = NEW.updated_at,
    revoked_reason = 'customer_invalidated', version = version + 1, updated_at = NEW.updated_at
  WHERE customer_id = NEW.id AND state NOT IN ('revoked','expired');
END;
