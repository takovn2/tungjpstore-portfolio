import type { OtpBindings, MailvaultOtpClient } from "./contract";

// Wrangler cannot resolve the named entrypoint's source across independent repositories.
// This boundary supplies the versioned consumer contract; runtime output is checked by the endpoint.
export function otpBindings(env: Cloudflare.Env): OtpBindings {
  return { CONTENT_DB: env.CONTENT_DB, SHOP_OTP_ENABLED: env.SHOP_OTP_ENABLED,
    OTP_BRIDGE_RPC_HMAC_KEY: env.OTP_BRIDGE_RPC_HMAC_KEY, SHOP_PUBLIC_ORIGIN: env.SHOP_PUBLIC_ORIGIN,
    SHOP_CUSTOMER_SESSION_SECRET: env.SHOP_CUSTOMER_SESSION_SECRET,
    MAILVAULT_OTP: env.MAILVAULT_OTP as unknown as MailvaultOtpClient };
}
