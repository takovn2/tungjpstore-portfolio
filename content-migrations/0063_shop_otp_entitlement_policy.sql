-- Explicit, operator-reviewed terms. Existing catalog prose/termMonths/checkout
-- deadlines are not sufficiently authoritative to backfill a sold OTP lifetime.
PRAGMA foreign_keys = ON;
CREATE TABLE shop_otp_variant_policies (
  variant_id TEXT PRIMARY KEY REFERENCES shop_variants(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('perpetual','duration','until')),
  duration_seconds INTEGER,
  expires_at TEXT,
  policy_version INTEGER NOT NULL CHECK (policy_version >= 1),
  configured_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  configured_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'duration' AND typeof(duration_seconds) = 'integer' AND duration_seconds BETWEEN 60 AND 315360000 AND expires_at IS NULL)
    OR (kind = 'until' AND duration_seconds IS NULL AND expires_at IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ',expires_at) IS NOT NULL AND expires_at = strftime('%Y-%m-%dT%H:%M:%fZ',expires_at))
    OR (kind = 'perpetual' AND duration_seconds IS NULL AND expires_at IS NULL))
);
CREATE TABLE shop_otp_variant_policy_history (
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  duration_seconds INTEGER,
  expires_at TEXT,
  configured_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  configured_at TEXT NOT NULL,
  PRIMARY KEY(variant_id,policy_version)
);
CREATE TRIGGER shop_otp_policy_audit_insert AFTER INSERT ON shop_otp_variant_policies
BEGIN
  INSERT INTO shop_otp_variant_policy_history VALUES
    (NEW.variant_id,NEW.policy_version,NEW.kind,NEW.duration_seconds,NEW.expires_at,NEW.configured_by,NEW.reason,NEW.configured_at);
END;
CREATE TRIGGER shop_otp_policy_audit_update AFTER UPDATE ON shop_otp_variant_policies
BEGIN
  INSERT INTO shop_otp_variant_policy_history VALUES
    (NEW.variant_id,NEW.policy_version,NEW.kind,NEW.duration_seconds,NEW.expires_at,NEW.configured_by,NEW.reason,NEW.configured_at);
END;
CREATE TRIGGER shop_otp_policy_identity BEFORE UPDATE ON shop_otp_variant_policies
WHEN NEW.variant_id <> OLD.variant_id OR NEW.policy_version <> OLD.policy_version + 1
BEGIN
  SELECT RAISE(ABORT,'otp_policy_revision_required');
END;
CREATE TRIGGER shop_otp_policy_no_delete BEFORE DELETE ON shop_otp_variant_policies
BEGIN
  SELECT RAISE(ABORT,'otp_policy_history_required');
END;
CREATE TRIGGER shop_otp_policy_history_no_update BEFORE UPDATE ON shop_otp_variant_policy_history
BEGIN
  SELECT RAISE(ABORT,'otp_policy_history_immutable');
END;
CREATE TRIGGER shop_otp_policy_history_no_delete BEFORE DELETE ON shop_otp_variant_policy_history
BEGIN
  SELECT RAISE(ABORT,'otp_policy_history_required');
END;
-- Freeze the sold variant policy in the existing checkout transaction.
ALTER TABLE shop_order_items ADD COLUMN otp_entitlement_kind TEXT;
ALTER TABLE shop_order_items ADD COLUMN otp_duration_seconds INTEGER;
ALTER TABLE shop_order_items ADD COLUMN otp_until_at TEXT;
ALTER TABLE shop_order_items ADD COLUMN otp_policy_version INTEGER;
ALTER TABLE shop_order_items ADD COLUMN otp_policy_actor TEXT;
ALTER TABLE shop_order_items ADD COLUMN otp_policy_reason TEXT;
ALTER TABLE shop_order_items ADD COLUMN otp_policy_snapshotted INTEGER NOT NULL DEFAULT 0 CHECK (otp_policy_snapshotted IN (0,1));
-- Historical sold items are already final even though no trustworthy policy was recorded.
UPDATE shop_order_items SET otp_policy_snapshotted = 1;
ALTER TABLE shop_orders ADD COLUMN otp_owner_linked_at TEXT;
UPDATE shop_orders SET otp_owner_linked_at = strftime('%Y-%m-%dT%H:%M:%fZ',max(created_at,updated_at)) WHERE customer_id IS NOT NULL;
CREATE TRIGGER shop_otp_order_owner_insert AFTER INSERT ON shop_orders WHEN NEW.customer_id IS NOT NULL
BEGIN
  UPDATE shop_orders SET otp_owner_linked_at = strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at) WHERE id = NEW.id;
END;
CREATE TRIGGER shop_otp_order_owner_update AFTER UPDATE OF customer_id ON shop_orders WHEN NEW.customer_id IS NOT OLD.customer_id
BEGIN
  UPDATE shop_orders SET otp_owner_linked_at = CASE WHEN NEW.customer_id IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at) END WHERE id = NEW.id;
END;
CREATE TRIGGER shop_otp_order_item_policy_insert AFTER INSERT ON shop_order_items
BEGIN
  UPDATE shop_order_items SET
    otp_entitlement_kind = (SELECT kind FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_duration_seconds = (SELECT duration_seconds FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_until_at = (SELECT expires_at FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_policy_version = (SELECT policy_version FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_policy_actor = (SELECT configured_by FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_policy_reason = (SELECT reason FROM shop_otp_variant_policies WHERE variant_id = NEW.variant_id),
    otp_policy_snapshotted = 1
  WHERE id = NEW.id;
END;
CREATE TRIGGER shop_otp_order_item_policy_immutable BEFORE UPDATE OF otp_entitlement_kind,otp_duration_seconds,otp_until_at,otp_policy_version,otp_policy_actor,otp_policy_reason,otp_policy_snapshotted ON shop_order_items
WHEN OLD.otp_policy_snapshotted = 1 AND
  (NEW.otp_entitlement_kind IS NOT OLD.otp_entitlement_kind OR NEW.otp_duration_seconds IS NOT OLD.otp_duration_seconds
    OR NEW.otp_until_at IS NOT OLD.otp_until_at OR NEW.otp_policy_version IS NOT OLD.otp_policy_version
    OR NEW.otp_policy_actor IS NOT OLD.otp_policy_actor OR NEW.otp_policy_reason IS NOT OLD.otp_policy_reason
    OR NEW.otp_policy_snapshotted IS NOT OLD.otp_policy_snapshotted)
BEGIN
  SELECT RAISE(ABORT,'otp_sold_policy_immutable');
END;
ALTER TABLE shop_otp_grants ADD COLUMN entitlement_kind TEXT;
ALTER TABLE shop_otp_grants ADD COLUMN entitlement_term_start_at TEXT;
ALTER TABLE shop_otp_grants ADD COLUMN entitlement_start_at TEXT;
ALTER TABLE shop_otp_grants ADD COLUMN entitlement_expires_at TEXT;
ALTER TABLE shop_otp_grants ADD COLUMN entitlement_policy_version INTEGER;
-- No implicit perpetual conversion for grants issued without explicit sold terms.
UPDATE shop_otp_grants SET state = 'suspended', version = version + 1,
  revoked_reason = 'entitlement_policy_missing' WHERE state IN ('active','pending','suspended');

CREATE VIEW shop_otp_entitlement_candidates AS
SELECT allocation_id,customer_id,order_id,order_item_id,inventory_unit_id,alias_id,provider_key,
  entitlement_kind,entitlement_policy_version,entitlement_term_start_at,entitlement_start_at,
  CASE entitlement_kind WHEN 'perpetual' THEN NULL WHEN 'until' THEN otp_until_at
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ',entitlement_term_start_at,'+' || otp_duration_seconds || ' seconds') END AS entitlement_expires_at,
  allocated_at
FROM (
  SELECT a.id AS allocation_id,o.customer_id,o.id AS order_id,i.id AS order_item_id,u.id AS inventory_unit_id,b.alias_id,b.provider_key,
    i.otp_entitlement_kind AS entitlement_kind,i.otp_policy_version AS entitlement_policy_version,i.otp_duration_seconds,i.otp_until_at,
    max(strftime('%Y-%m-%dT%H:%M:%fZ',o.paid_at),strftime('%Y-%m-%dT%H:%M:%fZ',a.fulfilled_at)) AS entitlement_term_start_at,
    max(strftime('%Y-%m-%dT%H:%M:%fZ',o.paid_at),strftime('%Y-%m-%dT%H:%M:%fZ',a.fulfilled_at),
      strftime('%Y-%m-%dT%H:%M:%fZ',c.account_activated_at),strftime('%Y-%m-%dT%H:%M:%fZ',identity.verified_at),o.otp_owner_linked_at) AS entitlement_start_at,
    a.updated_at AS allocated_at
  FROM shop_inventory_allocations a JOIN shop_order_items i ON i.id = a.order_item_id
    JOIN shop_orders o ON o.id = i.order_id
    JOIN shop_inventory_units u ON u.id = a.inventory_unit_id AND u.variant_id = i.variant_id
    JOIN shop_otp_inventory_aliases b ON b.inventory_unit_id = u.id AND b.state = 'ready'
    JOIN shop_customers c ON c.id = o.customer_id
    JOIN shop_customer_identities identity ON identity.customer_id = c.id AND identity.provider = 'email'
      AND identity.external_subject = o.customer_email_snapshot AND identity.verified_at IS NOT NULL
  WHERE a.status = 'fulfilled' AND a.fulfilled_at IS NOT NULL AND o.payment_status = 'paid' AND o.paid_at IS NOT NULL
    AND o.status IN ('processing','fulfilled') AND c.status = 'active' AND c.deleted_at IS NULL AND c.account_activated_at IS NOT NULL
    AND o.otp_owner_linked_at IS NOT NULL AND i.fulfillment_type = 'license_key'
    AND ((i.otp_entitlement_kind = 'perpetual' AND i.otp_duration_seconds IS NULL AND i.otp_until_at IS NULL)
      OR (i.otp_entitlement_kind = 'duration' AND typeof(i.otp_duration_seconds) = 'integer' AND i.otp_duration_seconds BETWEEN 60 AND 315360000 AND i.otp_until_at IS NULL)
      OR (i.otp_entitlement_kind = 'until' AND i.otp_duration_seconds IS NULL AND i.otp_until_at IS NOT NULL))
    AND i.otp_policy_version >= 1
);

DROP TRIGGER shop_otp_fulfilled_pending;
CREATE TRIGGER shop_otp_fulfilled_pending AFTER UPDATE OF status ON shop_inventory_allocations
WHEN NEW.status = 'fulfilled' AND OLD.status <> 'fulfilled'
BEGIN
  INSERT OR IGNORE INTO shop_otp_grants
    (id,customer_id,order_id,order_item_id,allocation_id,inventory_unit_id,alias_id,provider_key,state,
      entitlement_kind,entitlement_term_start_at,entitlement_start_at,entitlement_expires_at,entitlement_policy_version,
      expires_at,next_validation_at,created_at,updated_at)
  SELECT 'otp_' || allocation_id,customer_id,order_id,order_item_id,allocation_id,inventory_unit_id,alias_id,provider_key,'pending',
    entitlement_kind,entitlement_term_start_at,entitlement_start_at,entitlement_expires_at,entitlement_policy_version,
    entitlement_expires_at,allocated_at,allocated_at,allocated_at
  FROM shop_otp_entitlement_candidates WHERE allocation_id = NEW.id
    AND entitlement_start_at IS NOT NULL AND entitlement_term_start_at IS NOT NULL;
END;
CREATE TRIGGER shop_otp_grant_entitlement_insert BEFORE INSERT ON shop_otp_grants
WHEN NOT EXISTS (SELECT 1 FROM shop_otp_entitlement_candidates candidate
  WHERE candidate.allocation_id = NEW.allocation_id AND candidate.inventory_unit_id = NEW.inventory_unit_id
    AND candidate.customer_id = NEW.customer_id AND candidate.order_id = NEW.order_id AND candidate.order_item_id = NEW.order_item_id
    AND candidate.alias_id = NEW.alias_id AND candidate.provider_key = NEW.provider_key
    AND candidate.entitlement_kind IS NEW.entitlement_kind AND candidate.entitlement_policy_version IS NEW.entitlement_policy_version
    AND candidate.entitlement_start_at IS NEW.entitlement_start_at AND candidate.entitlement_start_at IS NOT NULL
    AND candidate.entitlement_term_start_at IS NEW.entitlement_term_start_at AND candidate.entitlement_term_start_at IS NOT NULL
    AND candidate.entitlement_expires_at IS NEW.entitlement_expires_at AND NEW.expires_at IS NEW.entitlement_expires_at
    AND (NEW.state = 'pending' OR (NEW.state = 'active' AND NEW.activated_at = NEW.entitlement_start_at)))
BEGIN
  SELECT RAISE(ABORT,'otp_entitlement_snapshot_required');
END;
CREATE TRIGGER shop_otp_grant_entitlement_immutable BEFORE UPDATE OF entitlement_kind,entitlement_term_start_at,entitlement_start_at,entitlement_expires_at,entitlement_policy_version ON shop_otp_grants
WHEN NEW.entitlement_kind IS NOT OLD.entitlement_kind OR NEW.entitlement_term_start_at IS NOT OLD.entitlement_term_start_at
  OR NEW.entitlement_start_at IS NOT OLD.entitlement_start_at OR NEW.entitlement_expires_at IS NOT OLD.entitlement_expires_at
  OR NEW.entitlement_policy_version IS NOT OLD.entitlement_policy_version
BEGIN
  SELECT RAISE(ABORT,'otp_entitlement_snapshot_immutable');
END;
CREATE TRIGGER shop_otp_grant_active_entitlement BEFORE UPDATE OF state,activated_at ON shop_otp_grants
WHEN NEW.state = 'active' AND (NEW.entitlement_kind IS NULL OR NEW.entitlement_start_at IS NULL OR NEW.activated_at IS NOT NEW.entitlement_start_at
  OR (NEW.entitlement_kind <> 'perpetual' AND NEW.expires_at IS NULL) OR (NEW.entitlement_kind = 'perpetual' AND NEW.expires_at IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT,'otp_entitlement_activation_invalid');
END;
CREATE TABLE shop_otp_grant_extensions (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES shop_otp_grants(id) ON DELETE RESTRICT,
  grant_version INTEGER NOT NULL,
  previous_expires_at TEXT NOT NULL,
  new_expires_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(grant_id,grant_version)
);
CREATE TRIGGER shop_otp_extension_valid BEFORE INSERT ON shop_otp_grant_extensions
WHEN NOT EXISTS (SELECT 1 FROM shop_otp_grants WHERE id = NEW.grant_id AND version = NEW.grant_version
  AND state IN ('active','pending') AND entitlement_kind IN ('duration','until')
  AND expires_at = NEW.previous_expires_at AND expires_at > NEW.created_at
  AND NEW.new_expires_at > expires_at AND NEW.new_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ',NEW.new_expires_at))
BEGIN
  SELECT RAISE(ABORT,'otp_entitlement_extension_conflict');
END;
CREATE TRIGGER shop_otp_extension_apply AFTER INSERT ON shop_otp_grant_extensions
BEGIN
  UPDATE shop_otp_grants SET expires_at = NEW.new_expires_at,version = version + 1,updated_at = NEW.created_at
  WHERE id = NEW.grant_id AND version = NEW.grant_version AND expires_at = NEW.previous_expires_at AND state IN ('active','pending');
END;
CREATE TRIGGER shop_otp_grant_expiry_guard BEFORE UPDATE OF expires_at ON shop_otp_grants
WHEN NEW.expires_at IS NOT OLD.expires_at AND NOT EXISTS (SELECT 1 FROM shop_otp_grant_extensions
  WHERE grant_id = OLD.id AND grant_version = OLD.version AND previous_expires_at = OLD.expires_at
    AND new_expires_at = NEW.expires_at AND created_at = NEW.updated_at)
BEGIN
  SELECT RAISE(ABORT,'otp_entitlement_extension_required');
END;
CREATE TRIGGER shop_otp_extension_no_update BEFORE UPDATE ON shop_otp_grant_extensions
BEGIN
  SELECT RAISE(ABORT,'otp_extension_history_immutable');
END;
CREATE TRIGGER shop_otp_extension_no_delete BEFORE DELETE ON shop_otp_grant_extensions
BEGIN
  SELECT RAISE(ABORT,'otp_extension_history_required');
END;
