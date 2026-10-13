import type { OtpBindings } from "./contract";
import { createPendingGrants, LIVE_GRANT_JOIN, LIVE_GRANT_WHERE, type OtpGrant } from "./grant-repository";
import { boundedRpc, signedRpcRequest } from "./rpc-client";
import { VALIDATION_CYCLE_LIMIT, validationBackoffMs } from "./validation-recovery";

type ValidationGrant = OtpGrant & { validation_attempts: number; validation_cycle: number };
type Failure = "routing_unknown" | "inactive" | "not_found" | "service_unavailable" | "invalid_response";
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
    AND g.validation_attempts < ? AND (g.expires_at IS NULL OR g.expires_at > ?) AND ${LIVE_GRANT_WHERE}
    AND (? IS NULL OR g.order_id = ?) ORDER BY g.next_validation_at, g.id LIMIT 10`)
    .bind(at, VALIDATION_CYCLE_LIMIT, at, orderId ?? null, orderId ?? null).all<ValidationGrant>();
  let activated = 0, pending = 0;
  for (const grant of rows.results ?? []) {
    // Versioned lease fences parallel cron, revalidation, extension and remote completion.
    const lease = await db.prepare(`UPDATE shop_otp_grants SET validation_attempts = validation_attempts + 1,
      validation_total_attempts = validation_total_attempts + 1, version = version + 1,
      validation_last_failure = 'service_unavailable', validation_failed_at = ?, next_validation_at = ?, updated_at = ? WHERE id = ? AND version = ? AND state = 'pending'
      AND next_validation_at <= ? AND validation_attempts < ?`)
      .bind(at, new Date(now + (grant.validation_attempts + 1 >= VALIDATION_CYCLE_LIMIT ? validationBackoffMs(VALIDATION_CYCLE_LIMIT) : 60000)).toISOString(), at, grant.id, grant.version, at, VALIDATION_CYCLE_LIMIT).run();
    if (lease.meta.changes !== 1) continue;
    let failure: Failure = "service_unavailable";
    try {
      if (!bindings.MAILVAULT_OTP) throw new Error("otp_service_unavailable");
      const request = await signedRpcRequest(bindings, { operation: "validateAlias", aliasId: grant.alias_id,
        providerKey: grant.provider_key, grantId: grant.id, notBefore: grant.entitlement_start_at! }, now);
      const result = await boundedRpc(bindings.MAILVAULT_OTP.validateAlias(request));
      if (result?.state === "active" && result.aliasId === grant.alias_id && Object.keys(result).length === 2) {
        const finishedAt = new Date(Math.max(now, Date.now())).toISOString();
        const updated = await db.prepare(`UPDATE shop_otp_grants SET state = 'active', activated_at = entitlement_start_at,
          validation_last_failure = NULL, validation_failed_at = NULL, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND state = 'pending' AND entitlement_start_at <= ?
            AND (expires_at IS NULL OR expires_at > ?) AND EXISTS (SELECT 1 ${LIVE_GRANT_JOIN}
            WHERE g.id = shop_otp_grants.id AND ${LIVE_GRANT_WHERE})`)
          .bind(finishedAt, grant.id, grant.version + 1, finishedAt, finishedAt).run();
        activated += updated.meta.changes;
        if (updated.meta.changes === 1) continue;
      } else if (result?.aliasId === grant.alias_id && Object.keys(result).length === 2 && ["routing_unknown","inactive","not_found"].includes(result.state)) {
        failure = result.state as Failure;
      } else failure = "invalid_response";
    } catch { /* Persist only a bounded reason code, never exception text or RPC payload. */ }
    pending += 1;
    await db.prepare(`UPDATE shop_otp_grants SET validation_last_failure = ?, validation_failed_at = ?, next_validation_at = ?, updated_at = ?
      WHERE id = ? AND version = ? AND state = 'pending'`)
      .bind(failure, at, new Date(now + validationBackoffMs(grant.validation_attempts + 1)).toISOString(), at, grant.id, grant.version + 1).run();
  }
  return { activated, pending };
}
