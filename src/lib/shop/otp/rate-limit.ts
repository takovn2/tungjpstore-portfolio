
export async function reserveOtpAttempt(db: D1Database, input: { requestId: string; customerId: string; grantId: string; identityHash: string }, now = Date.now()) {
  const at = new Date(now).toISOString();
  const result = await db.prepare(`INSERT INTO shop_otp_lookup_attempts
    (request_id, customer_id, grant_id, identity_hash, created_at, outcome)
    SELECT ?, ?, ?, ?, ?, 'pending'
    WHERE NOT EXISTS (SELECT 1 FROM shop_otp_lookup_attempts WHERE grant_id = ? AND created_at > ?)
      AND (SELECT COUNT(*) FROM shop_otp_lookup_attempts WHERE grant_id = ? AND created_at > ?) < 30
      AND (SELECT COUNT(*) FROM shop_otp_lookup_attempts WHERE customer_id = ? AND created_at > ?) < 150
      AND (SELECT COUNT(*) FROM shop_otp_lookup_attempts WHERE identity_hash = ? AND created_at > ?) < 150`)
    .bind(input.requestId, input.customerId, input.grantId, input.identityHash, at,
      input.grantId, new Date(now - 5000).toISOString(), input.grantId, new Date(now - 300000).toISOString(),
      input.customerId, new Date(now - 86400000).toISOString(), input.identityHash, new Date(now - 86400000).toISOString()).run();
  return result.meta.changes === 1;
}
export async function finalizeOtpAttempt(db: D1Database, requestId: string, outcome: "found" | "no_code" | "denied" | "unavailable", latencyMs: number) {
  await db.prepare(`UPDATE shop_otp_lookup_attempts SET outcome = ?, latency_ms = ? WHERE request_id = ? AND outcome = 'pending'`)
    .bind(outcome, Math.max(0, Math.min(60000, Math.floor(latencyMs))), requestId).run();
}
export async function otpIdentityHash(secret: string, ip: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`otp-identity-v1\0${ip.slice(0, 100)}`));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
