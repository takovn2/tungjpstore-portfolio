import { otpBindings } from "../../../../../../lib/shop/otp/bindings";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleCustomerOtp } from "../../../../../../lib/shop/otp/endpoint";
export const prerender = false;
export const POST: APIRoute = ({ request, params }) => handleCustomerOtp(request, params.orderId ?? "", otpBindings(env));
export const ALL: APIRoute = ({ request, params }) => handleCustomerOtp(request, params.orderId ?? "", otpBindings(env));
