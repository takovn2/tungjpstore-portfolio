import { getCustomerSession, type CustomerSession } from "../customer-auth";
import { recordOtpProof } from "./authorization";
import type { ShopBindings } from "../types";

export interface OtpReauthContext { otpReauth: true; customerId: string; sessionHash: string }
export function parseOtpReauth(value: unknown): OtpReauthContext | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  return payload.otpReauth === true && typeof payload.customerId === "string" && typeof payload.sessionHash === "string"
    ? { otpReauth: true, customerId: payload.customerId, sessionHash: payload.sessionHash } : null;
}
export function otpReauthContext(session: CustomerSession): OtpReauthContext {
  return { otpReauth: true, customerId: session.customerId, sessionHash: session.tokenHash };
}
export async function completeOtpReauth(bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_CUSTOMER_SESSION_SECRET">,
  request: Request, context: OtpReauthContext, provider: "google" | "email", identity: { subject: string; email: string }) {
  const session = await getCustomerSession(bindings, request);
  if (!bindings.CONTENT_DB || !session || session.tokenHash !== context.sessionHash || session.customerId !== context.customerId) return null;
  const verified = await bindings.CONTENT_DB.prepare(`SELECT i.customer_id FROM shop_customer_identities i
    JOIN shop_customers c ON c.id = i.customer_id WHERE i.provider = ? AND i.external_subject = ?
      AND i.customer_id = ? AND i.verified_at IS NOT NULL AND c.email_normalized = ?
      AND c.status = 'active' AND c.deleted_at IS NULL LIMIT 1`)
    .bind(provider, identity.subject, session.customerId, identity.email.trim().toLowerCase()).first();
  if (!verified) return null;
  await recordOtpProof(bindings.CONTENT_DB, session.tokenHash, session.customerId, provider);
  return { token: "", cookie: "", expiresAt: session.expiresAt, tokenHash: session.tokenHash };
}
