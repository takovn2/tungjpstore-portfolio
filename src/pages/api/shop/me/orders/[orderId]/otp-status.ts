import { otpBindings } from "../../../../../../lib/shop/otp/bindings";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleCustomerOtpStatus } from "../../../../../../lib/shop/otp/status-endpoint";
export const prerender = false;
export const POST: APIRoute = ({ request, params }) => handleCustomerOtpStatus(request, params.orderId ?? "", otpBindings(env));
export const ALL: APIRoute = ({ request, params }) => handleCustomerOtpStatus(request, params.orderId ?? "", otpBindings(env));
