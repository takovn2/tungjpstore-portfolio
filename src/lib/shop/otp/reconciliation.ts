import type { OtpBindings } from "./contract";
import { createPendingGrants, LIVE_GRANT_JOIN, LIVE_GRANT_WHERE, type OtpGrant } from "./grant-repository";
import { boundedRpc, signedRpcRequest } from "./rpc-client";

export async function reconcileOtpGrants(bindings: OtpBindings, now = Date.now(), orderId?: string) {
  if (bindings.SHOP_OTP_ENABLED !== "true") return { activated: 0, pending: 0 };
  const db = bindings.CONTENT_DB, at = new Date(now).toISOString();
  await db.prepare(`UPDATE shop_otp_grants SET state = 'expired', version = version + 1, updated_at = ?
    WHERE state IN ('active','pending','suspended') AND expires_at IS NOT NULL AND expires_at <= ?`).bind(at, at).run();
  await db.prepare(`UPDATE shop_otp_lookup_attempts SET outcome = 'abandoned' WHERE outcome = 'pending' AND created_at < ?`)
    .bind(new Date(now - 60000).toISOString()).run();
  await db.prepare(`DELETE FROM shop_otp_lookup_attempts WHERE request_id IN (
    SELECT request_id FROM shop_otp_lookup_attempts WHERE created_at < ? ORDER BY created_at LIMIT 200
  )`).bind(new Date(now - 30 * 86400000).toISOString()).run();
  await createPendingGrants(db, now, orderId);
  const rows = await db.prepare(`SELECT g.* ${LIVE_GRANT_JOIN} WHERE g.state = 'pending' AND g.next_validation_at <= ?
    AND g.validation_attempts < 20 AND ${LIVE_GRANT_WHERE} AND (? IS NULL OR g.order_id = ?)
    ORDER BY g.next_validation_at, g.id LIMIT 10`).bind(at, orderId ?? null, orderId ?? null).all<OtpGrant>();
  let activated = 0, pending = 0;
  for (const grant of rows.results ?? []) {
    // Reserve a bounded retry lease before remote work so cron/page races do not duplicate calls.
    const lease = await db.prepare(`UPDATE shop_otp_grants SET validation_attempts = validation_attempts + 1,
      next_validation_at = ?, updated_at = ? WHERE id = ? AND state = 'pending' AND next_validation_at <= ?`)
      .bind(new Date(now + 60000).toISOString(), at, grant.id, at).run();
    if (lease.meta.changes !== 1) continue;
    try {
      if (!bindings.MAILVAULT_OTP) throw new Error("otp_service_unavailable");
      const request = await signedRpcRequest(bindings, { operation: "validateAlias", aliasId: grant.alias_id,
        providerKey: grant.provider_key, grantId: grant.id, notBefore: at }, now);
      const result = await boundedRpc(bindings.MAILVAULT_OTP.validateAlias(request));
      if (result.state === "active" && result.aliasId === grant.alias_id) {
        const updated = await db.prepare(`UPDATE shop_otp_grants SET state = 'active', activated_at = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND state = 'pending' AND EXISTS (SELECT 1 ${LIVE_GRANT_JOIN}
            WHERE g.id = shop_otp_grants.id AND ${LIVE_GRANT_WHERE})`).bind(at, at, grant.id, grant.version).run();
        activated += updated.meta.changes;
      } else pending += 1;
    } catch { pending += 1; }
  }
  return { activated, pending };
}
