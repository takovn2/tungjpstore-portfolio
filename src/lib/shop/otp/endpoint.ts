import { getCustomerSession, jsonNoStore } from "../customer-auth";
import { hasRecentOtpProof } from "./authorization";
import { OTP_ID, readBoundedJson, checkedLoginResult, type OtpBindings, type CustomerOtpError } from "./contract";
import { loadEligibleGrant } from "./grant-repository";
import { finalizeOtpAttempt, otpIdentityHash, reserveOtpAttempt } from "./rate-limit";
import { boundedRpc, signedRpcRequest } from "./rpc-client";

function deny(code: CustomerOtpError, status: number, retryAfterSeconds?: number) {
  const response = jsonNoStore({ ok: false, code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }, status);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (retryAfterSeconds) response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}
export async function handleCustomerOtp(request: Request, orderId: string, bindings: OtpBindings, now = Date.now()): Promise<Response> {
  if (bindings.SHOP_OTP_ENABLED !== "true") return deny("otp_not_available", 404);
  if (request.method !== "POST") return deny("otp_not_available", 405);
  const expected = bindings.SHOP_PUBLIC_ORIGIN ?? "https://tung.codes";
  if (request.headers.get("origin") !== expected || new URL(request.url).origin !== expected ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return deny("otp_not_available", 403);
  const body = await readBoundedJson(request);
  if (!body || Object.keys(body).length !== 1 || typeof body.allocationId !== "string" ||
    !OTP_ID.test(body.allocationId) || !OTP_ID.test(orderId)) return deny("otp_not_available", 400);
  let requestId: string | undefined;
  const started = Date.now();
  try {
    const session = await getCustomerSession(bindings, request, now);
    if (!session) return deny("customer_auth_required", 401);
    if (!(await hasRecentOtpProof(bindings.CONTENT_DB, session, now))) return deny("reauth_required", 403);
    const grant = await loadEligibleGrant(bindings.CONTENT_DB, session.customerId, orderId, body.allocationId, now);
    if (!grant) return deny("otp_not_available", 404);
    if (grant.state === "pending") return deny("otp_setup_pending", 409);
    if (grant.state !== "active" || !grant.activated_at || !Number.isFinite(Date.parse(grant.activated_at)) || Date.parse(grant.activated_at) > now) return deny("otp_not_available", 404);
    if (!bindings.MAILVAULT_OTP || !bindings.OTP_BRIDGE_RPC_HMAC_KEY) return deny("otp_service_unavailable", 503);
    requestId = crypto.randomUUID();
    const identityHash = await otpIdentityHash(bindings.OTP_BRIDGE_RPC_HMAC_KEY, request.headers.get("cf-connecting-ip") ?? "unknown");
    if (!(await reserveOtpAttempt(bindings.CONTENT_DB, { requestId, customerId: session.customerId, grantId: grant.id, identityHash }, now))) {
      requestId = undefined; return deny("otp_rate_limited", 429, 5);
    }
    const notBefore = new Date(Math.max(Date.parse(grant.activated_at), now - 120000)).toISOString();
    const signed = await signedRpcRequest(bindings, { operation: "lookupLoginOtp", aliasId: grant.alias_id,
      providerKey: grant.provider_key, grantId: grant.id, notBefore }, now);
    const result = checkedLoginResult(await boundedRpc(bindings.MAILVAULT_OTP.lookupLoginOtp(signed)));
    // Finalization precedes the last authorization check: no awaited audit write after it.
    await finalizeOtpAttempt(bindings.CONTENT_DB, requestId, result.state === "found" ? "found" : "no_code", Date.now() - started);
    if (!(await hasRecentOtpProof(bindings.CONTENT_DB, session))) return deny("otp_not_available", 404);
    const live = await loadEligibleGrant(bindings.CONTENT_DB, session.customerId, orderId, body.allocationId, Date.now(), session.tokenHash);
    if (!live || live.state !== "active" || live.version !== grant.version) return deny("otp_not_available", 404);
    if (result.state === "found") {
      const received = Date.parse(result.receivedAt);
      if (!/^[0-9]{4,8}$/.test(result.code) || !Number.isFinite(received) || received < Date.parse(notBefore) ||
        received > Date.now() || Date.now() - received > 120000) return deny("otp_service_unavailable", 503);
      const response = jsonNoStore({ ok: true, state: "found", code: result.code, receivedAt: result.receivedAt });
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }
    if (result.state === "pending") return jsonNoStore({ ok: true, state: "pending", pollAfterMs: 5000 });
    if (result.state === "ambiguous") return deny("otp_ambiguous", 409);
    if (result.state === "untrusted") return deny("otp_untrusted", 409);
    return deny("otp_service_unavailable", 503);
  } catch {
    if (requestId) await finalizeOtpAttempt(bindings.CONTENT_DB, requestId, "unavailable", Date.now() - started).catch(() => undefined);
    return deny("otp_service_unavailable", 503);
  }
}
