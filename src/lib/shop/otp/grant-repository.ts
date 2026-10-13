export interface OtpGrant {
  id: string; customer_id: string; order_id: string; order_item_id: string; allocation_id: string;
  inventory_unit_id: string; alias_id: string; provider_key: string; state: string;
  activated_at: string | null; expires_at: string | null; version: number;
}
export const LIVE_GRANT_JOIN = `FROM shop_otp_grants g
  JOIN shop_orders o ON o.id = g.order_id AND o.customer_id = g.customer_id
  JOIN shop_order_items i ON i.id = g.order_item_id AND i.order_id = o.id
  JOIN shop_inventory_allocations a ON a.id = g.allocation_id AND a.order_item_id = i.id AND a.inventory_unit_id = g.inventory_unit_id
  JOIN shop_inventory_units u ON u.id = g.inventory_unit_id AND u.variant_id = i.variant_id
  JOIN shop_otp_inventory_aliases b ON b.inventory_unit_id = u.id AND b.alias_id = g.alias_id AND b.provider_key = g.provider_key
  JOIN shop_customers c ON c.id = g.customer_id`;
export const LIVE_GRANT_WHERE = `o.payment_status = 'paid' AND o.paid_at IS NOT NULL
  AND o.status IN ('processing','fulfilled') AND o.fulfillment_status IN ('partial','fulfilled')
  AND i.fulfillment_status IN ('processing','fulfilled') AND i.fulfillment_type = 'license_key'
  AND a.status = 'fulfilled' AND a.fulfilled_at IS NOT NULL AND u.status = 'fulfilled'
  AND b.state = 'ready' AND c.status = 'active' AND c.deleted_at IS NULL AND c.account_activated_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM shop_customer_identities identity WHERE identity.customer_id = c.id
    AND identity.provider = 'email' AND identity.external_subject = o.customer_email_snapshot AND identity.verified_at IS NOT NULL)`;

export async function loadEligibleGrant(db: D1Database, customerId: string, orderId: string, allocationId: string, now = Date.now(), sessionHash?: string): Promise<OtpGrant | null> {
  // Ownership resolves before any grant or remote alias lookup.
  const order = await db.prepare("SELECT id FROM shop_orders WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(orderId, customerId).first();
  if (!order) return null;
  return db.prepare(`SELECT g.* ${LIVE_GRANT_JOIN} WHERE g.customer_id = ? AND g.order_id = ? AND g.allocation_id = ?
    AND ${LIVE_GRANT_WHERE} AND (g.expires_at IS NULL OR g.expires_at > ?)
    AND (? IS NULL OR EXISTS (SELECT 1 FROM shop_otp_session_proofs proof
      JOIN shop_customer_sessions session ON session.token_hash = proof.session_hash
      WHERE proof.session_hash = ? AND proof.customer_id = g.customer_id AND session.customer_id = g.customer_id
        AND session.revoked_at IS NULL AND session.expires_at > ? AND proof.expires_at > ?
        AND proof.authenticated_at <= ? AND proof.authenticated_at > ?)) LIMIT 1`)
    .bind(customerId, orderId, allocationId, new Date(now).toISOString(), sessionHash ?? null, sessionHash ?? null,
      new Date(now).toISOString(), new Date(now).toISOString(), new Date(now).toISOString(), new Date(now - 600000).toISOString()).first<OtpGrant>();
}
export async function createPendingGrants(db: D1Database, now = Date.now(), orderId?: string) {
  const at = new Date(now).toISOString();
  return db.prepare(`INSERT OR IGNORE INTO shop_otp_grants
    (id, customer_id, order_id, order_item_id, allocation_id, inventory_unit_id, alias_id, provider_key,
     state, next_validation_at, created_at, updated_at)
    SELECT 'otp_' || a.id, o.customer_id, o.id, i.id, a.id, u.id, b.alias_id, b.provider_key, 'pending', ?, ?, ?
    FROM shop_inventory_allocations a JOIN shop_order_items i ON i.id = a.order_item_id
    JOIN shop_orders o ON o.id = i.order_id JOIN shop_inventory_units u ON u.id = a.inventory_unit_id AND u.variant_id = i.variant_id
    JOIN shop_otp_inventory_aliases b ON b.inventory_unit_id = u.id AND b.state = 'ready'
    JOIN shop_customers c ON c.id = o.customer_id
    WHERE a.status = 'fulfilled' AND u.status = 'fulfilled' AND o.payment_status = 'paid' AND o.paid_at IS NOT NULL
      AND o.status IN ('processing','fulfilled') AND c.status = 'active' AND c.deleted_at IS NULL AND c.account_activated_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM shop_customer_identities identity WHERE identity.customer_id = c.id
        AND identity.provider = 'email' AND identity.external_subject = o.customer_email_snapshot AND identity.verified_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM shop_otp_grants old WHERE old.allocation_id = a.id OR old.inventory_unit_id = u.id OR old.alias_id = b.alias_id)
      AND (? IS NULL OR o.id = ?) LIMIT 100`).bind(at, at, at, orderId ?? null, orderId ?? null).run();
}
export async function listOrderOtpCards(db: D1Database, customerId: string, orderId: string) {
  const rows = await db.prepare(`SELECT g.allocation_id, g.order_item_id, g.state ${LIVE_GRANT_JOIN}
    WHERE g.customer_id = ? AND g.order_id = ? AND ${LIVE_GRANT_WHERE}
    ORDER BY i.line_number, a.created_at, a.id LIMIT 100`).bind(customerId, orderId)
    .all<{ allocation_id: string; order_item_id: string; state: string }>();
  return rows.results ?? [];
}
