export interface OtpRpcRequestV1 {
  v: 1;
  operation: "validateAlias" | "lookupLoginOtp";
  aliasId: string;
  providerKey: string;
  grantId: string;
  notBefore: string;
  issuedAt: string;
  requestId: string;
  mac: string;
}
export type AliasValidation = { state: "active" | "inactive" | "not_found" | "routing_unknown"; aliasId: string };
export type LoginOtpResult = { state: "found"; code: string; receivedAt: string; messageRef: string }
  | { state: "pending" | "ambiguous" | "untrusted" | "unavailable" };
export function checkedLoginResult(value: unknown): LoginOtpResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("otp_service_unavailable");
  const row = value as Record<string, unknown>;
  if (row.state === "found" && Object.keys(row).length === 4 && typeof row.code === "string" &&
    /^[0-9]{4,8}$/.test(row.code) && typeof row.receivedAt === "string" && typeof row.messageRef === "string" && OTP_ID.test(row.messageRef)) {
    return row as LoginOtpResult;
  }
  if (Object.keys(row).length === 1 && ["pending", "ambiguous", "untrusted", "unavailable"].includes(String(row.state))) return row as LoginOtpResult;
  throw new Error("otp_service_unavailable");
}
export interface MailvaultOtpClient {
  validateAlias(request: OtpRpcRequestV1): Promise<AliasValidation>;
  lookupLoginOtp(request: OtpRpcRequestV1): Promise<LoginOtpResult>;
}
export type OtpBindings = { CONTENT_DB: D1Database; SHOP_OTP_ENABLED?: string; OTP_BRIDGE_RPC_HMAC_KEY?: string;
  MAILVAULT_OTP?: MailvaultOtpClient; SHOP_PUBLIC_ORIGIN?: string; SHOP_CUSTOMER_SESSION_SECRET?: string };
export type CustomerOtpError = "customer_auth_required" | "reauth_required" | "otp_not_available" | "otp_setup_pending"
  | "otp_ambiguous" | "otp_untrusted" | "otp_rate_limited" | "otp_service_unavailable";
export const OTP_ID = /^[A-Za-z0-9_-]{1,64}$/;
export function canonicalRequest(input: Omit<OtpRpcRequestV1, "mac">): string {
  return JSON.stringify(["TUNG-OTP-BRIDGE", input.v, input.operation, input.aliasId,
    input.providerKey, input.grantId, input.notBefore, input.issuedAt, input.requestId]);
}
export async function readBoundedJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 1024)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
