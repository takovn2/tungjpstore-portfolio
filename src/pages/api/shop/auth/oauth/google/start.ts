import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { jsonNoStore } from "../../../../../../lib/shop/customer-auth";
import { startGoogleOAuth } from "../../../../../../lib/shop/oauth-google";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const requestId = crypto.randomUUID();
  const returnPath = url.searchParams.get("return");
  const result = await startGoogleOAuth(env, { returnPath, requestId });
  if ("error" in result) return jsonNoStore({ ok: false, code: result.error }, result.status);
  return new Response(null, {
    status: 302,
    headers: {
      location: result.redirectUrl,
      "set-cookie": result.setCookie,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
