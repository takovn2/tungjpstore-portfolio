import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { jsonNoStore, publicOrigin } from "../../../../../lib/shop/customer-auth";
import { consumeMagicLink } from "../../../../../lib/shop/magic-link";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const token = url.searchParams.get("token");
  const result = await consumeMagicLink(env, { token, request, requestId });
  const origin = publicOrigin(env);

  if ("error" in result) {
    return new Response(null, {
      status: 302,
      headers: {
        location: `${origin}/shop/account/login?error=${encodeURIComponent(result.error)}`,
        "cache-control": "private, no-store",
      },
    });
  }

  const location = `${origin}${result.redirectPath.startsWith("/") ? result.redirectPath : "/shop/account"}`;
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "set-cookie": result.session.cookie,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
