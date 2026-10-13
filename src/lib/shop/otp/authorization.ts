import type { CustomerSession } from "../customer-auth";

export async function hasRecentOtpProof(db: D1Database, session: CustomerSession, now = Date.now()): Promise<boolean> {
  const row = await db.prepare(`SELECT p.authenticated_at, p.expires_at FROM shop_otp_session_proofs p
    JOIN shop_customer_sessions s ON s.token_hash = p.session_hash
    JOIN shop_customers c ON c.id = s.customer_id
    WHERE p.session_hash = ? AND p.customer_id = ? AND s.customer_id = p.customer_id
      AND s.revoked_at IS NULL AND s.expires_at > ? AND c.status = 'active' AND c.deleted_at IS NULL
    LIMIT 1`).bind(session.tokenHash, session.customerId, new Date(now).toISOString())
    .first<{ authenticated_at: string; expires_at: string }>();
  if (!row) return false;
  const at = Date.parse(row.authenticated_at), until = Date.parse(row.expires_at);
  return Number.isFinite(at) && Number.isFinite(until) && at <= now && now - at < 600000 && until > now;
}
export async function recordOtpProof(db: D1Database, sessionHash: string, customerId: string, provider: "google" | "email", now = Date.now()) {
  await db.prepare(`INSERT INTO shop_otp_session_proofs (session_hash, customer_id, authenticated_at, expires_at, provider)
    SELECT token_hash, customer_id, ?, ?, ? FROM shop_customer_sessions
    WHERE token_hash = ? AND customer_id = ? AND revoked_at IS NULL AND expires_at > ?
    ON CONFLICT(session_hash) DO UPDATE SET authenticated_at = excluded.authenticated_at,
      expires_at = excluded.expires_at, provider = excluded.provider
      WHERE shop_otp_session_proofs.customer_id = excluded.customer_id`).bind(new Date(now).toISOString(),
    new Date(now + 600000).toISOString(), provider, sessionHash, customerId, new Date(now).toISOString()).run();
}
