import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCustomerSession, jsonNoStore, sanitizeReturnPath } from "../../../../lib/shop/customer-auth";
import { OTP_ID, readBoundedJson } from "../../../../lib/shop/otp/contract";
import { otpReauthContext } from "../../../../lib/shop/otp/reauth";
import { startGoogleOAuth } from "../../../../lib/shop/oauth-google";
import { requestMagicLink } from "../../../../lib/shop/magic-link";
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (env.SHOP_OTP_ENABLED !== "true") return jsonNoStore({ ok: false, code: "otp_not_available" }, 404);
  if (request.headers.get("origin") !== (env.SHOP_PUBLIC_ORIGIN ?? "https://tung.codes") || new URL(request.url).origin !== (env.SHOP_PUBLIC_ORIGIN ?? "https://tung.codes") ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return jsonNoStore({ ok: false, code: "otp_not_available" }, 403);
  const payload = await readBoundedJson(request);
  if (!payload || Object.keys(payload).some((key) => !["orderId","allocationId","locale","provider"].includes(key)) ||
    typeof payload.orderId !== "string" || !OTP_ID.test(payload.orderId) ||
    typeof payload.allocationId !== "string" || !OTP_ID.test(payload.allocationId) ||
    !["google","email"].includes(String(payload.provider)) || !["vi","en","ja","zh"].includes(String(payload.locale))) return jsonNoStore({ ok: false, code: "otp_not_available" }, 400);
  const session = await getCustomerSession(env, request);
  if (!session) return jsonNoStore({ ok: false, code: "customer_auth_required" }, 401);
  const owned = await env.CONTENT_DB.prepare("SELECT id FROM shop_orders WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(payload.orderId, session.customerId).first();
  if (!owned) return jsonNoStore({ ok: false, code: "otp_not_available" }, 404);
  const prefix = payload.locale === "vi" ? "" : `/${payload.locale}`;
  const returnPath = sanitizeReturnPath(`${prefix}/shop/account/orders/${payload.orderId}?allocation=${payload.allocationId}`);
  try {
    if (payload.provider === "google") {
      const result = await startGoogleOAuth(env, { returnPath, reauth: otpReauthContext(session) });
      if ("error" in result) return jsonNoStore({ ok: false, code: "otp_service_unavailable" }, 503);
      return jsonNoStore({ ok: true, redirectUrl: result.redirectUrl }, 200, { "set-cookie": result.setCookie });
    }
    if (!session.emailNormalized) return jsonNoStore({ ok: false, code: "otp_not_available" }, 404);
    const result = await requestMagicLink(env, { email: session.emailNormalized, locale: payload.locale as "vi" | "en" | "ja" | "zh",
      returnPath, remoteIp: request.headers.get("cf-connecting-ip"), reauth: otpReauthContext(session) });
    return result.ok ? jsonNoStore({ ok: true, state: "email_sent" }) : jsonNoStore({ ok: false, code: "otp_service_unavailable" }, 503);
  } catch { return jsonNoStore({ ok: false, code: "otp_service_unavailable" }, 503); }
};
export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "otp_not_available" }, 405);
