import { OTP_ID } from "./contract";
import { LIVE_GRANT_JOIN, LIVE_GRANT_WHERE } from "./grant-repository";

export const VALIDATION_CYCLE_LIMIT = 20;
export const VALIDATION_RECOVERY_COOLDOWN_MS = 15 * 60_000;
export function validationBackoffMs(attempt: number) {
  return attempt >= VALIDATION_CYCLE_LIMIT ? VALIDATION_RECOVERY_COOLDOWN_MS : Math.min(3_600_000, 60_000 * 2 ** Math.min(attempt - 1, 6));
}

// Called only by the existing Access + recent password + CSRF admin route.
export async function requeueOtpValidation(db: D1Database, input: { inventoryUnitId: string; actor: string; reason: string }, now = Date.now()) {
  if (!OTP_ID.test(input.inventoryUnitId) || !input.actor || input.actor.length > 256 || !/^[a-z][a-z0-9_]{2,63}$/.test(input.reason)) throw new Error("otp_binding_invalid");
  const at = new Date(now).toISOString(), id = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT INTO shop_otp_validation_requeues (id, grant_id, cycle, actor, reason, created_at)
      SELECT ?, g.id, g.validation_cycle + 1, ?, ?, ? ${LIVE_GRANT_JOIN}
      WHERE g.inventory_unit_id = ? AND g.state = 'pending' AND g.validation_attempts >= ?
        AND g.next_validation_at <= ? AND (g.expires_at IS NULL OR g.expires_at > ?) AND ${LIVE_GRANT_WHERE}`)
      .bind(id, input.actor, input.reason, at, input.inventoryUnitId, VALIDATION_CYCLE_LIMIT, at, at),
    db.prepare(`UPDATE shop_otp_grants SET validation_attempts = 0, validation_cycle = validation_cycle + 1,
      validation_requeued_at = ?, next_validation_at = ?, version = version + 1, updated_at = ?
      WHERE id = (SELECT grant_id FROM shop_otp_validation_requeues WHERE id = ?)
        AND state = 'pending' AND validation_attempts >= ?`)
      .bind(at, at, at, id, VALIDATION_CYCLE_LIMIT),
  ]);
  if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw new Error("otp_revalidation_not_due");
  return { requeued: true };
}
