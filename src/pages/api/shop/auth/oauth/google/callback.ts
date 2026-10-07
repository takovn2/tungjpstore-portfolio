import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  clearOAuthStateCookie,
  cookieValue,
  jsonNoStore,
  publicOrigin,
} from "../../../../../../lib/shop/customer-auth";
import { completeGoogleOAuth } from "../../../../../../lib/shop/oauth-google";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = cookieValue(request, "__Host-shop_oauth_state");
  const result = await completeGoogleOAuth(env, {
    code,
    state,
    cookieState,
    request,
    requestId,
  });

  if ("error" in result) {
    const origin = publicOrigin(env);
    const location = `${origin}/shop/account/login?error=${encodeURIComponent(result.error)}`;
    return new Response(null, {
      status: 302,
      headers: {
        location,
        "set-cookie": clearOAuthStateCookie(),
        "cache-control": "private, no-store",
      },
    });
  }

  const origin = publicOrigin(env);
  const location = `${origin}${result.redirectPath.startsWith("/") ? result.redirectPath : "/shop/account"}`;
  const headers = new Headers({
    location,
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  });
  headers.append("set-cookie", result.session.cookie);
  headers.append("set-cookie", clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
