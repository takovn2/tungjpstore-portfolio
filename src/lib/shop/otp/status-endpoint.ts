import { getCustomerSession, jsonNoStore } from "../customer-auth";
import { OTP_ID, readBoundedJson, type OtpBindings } from "./contract";
import { loadEligibleGrant } from "./grant-repository";
import { reconcileOtpGrants } from "./reconciliation";

// Status refresh is ownership-scoped and may advance one leased validation cycle;
// it never reads mail or returns a secret.
export async function handleCustomerOtpStatus(request: Request, orderId: string, bindings: OtpBindings, now = Date.now()): Promise<Response> {
  const deny = (code: string, status: number) => jsonNoStore({ ok: false, code }, status);
  if (bindings.SHOP_OTP_ENABLED !== "true") return deny("otp_not_available", 404);
  if (request.method !== "POST") return deny("otp_not_available", 405);
  const expected = bindings.SHOP_PUBLIC_ORIGIN ?? "https://tung.codes";
  if (request.headers.get("origin") !== expected || new URL(request.url).origin !== expected ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return deny("otp_not_available", 403);
  const body = await readBoundedJson(request);
  if (!body || Object.keys(body).length !== 1 || typeof body.allocationId !== "string" || !OTP_ID.test(body.allocationId) || !OTP_ID.test(orderId)) return deny("otp_not_available", 400);
  try {
    const session = await getCustomerSession(bindings, request, now);
    if (!session) return deny("customer_auth_required", 401);
    let grant = await loadEligibleGrant(bindings.CONTENT_DB, session.customerId, orderId, body.allocationId, now);
    if (grant?.state === "pending") {
      await reconcileOtpGrants(bindings, now, orderId);
      grant = await loadEligibleGrant(bindings.CONTENT_DB, session.customerId, orderId, body.allocationId, Math.max(now, Date.now()));
    }
    if (!grant || !["active", "pending"].includes(grant.state)) return deny("otp_not_available", 404);
    const response = jsonNoStore({ ok: true, state: grant.state });
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch { return deny("otp_service_unavailable", 503); }
}
