import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { assertSameOriginMutation, jsonNoStore } from "../../../../../lib/shop/customer-auth";
import { requestMagicLink } from "../../../../../lib/shop/magic-link";
import type { ShopLocale } from "../../../../../lib/shop/types";

export const prerender = false;

async function verifyTurnstile(token: string, secret: string, remoteIp: string | null) {
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    return ((await response.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!assertSameOriginMutation(request, env)) {
    return jsonNoStore({ ok: false, code: "origin_mismatch" }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonNoStore({ ok: false, code: "invalid_payload" }, 400);
    }
    payload = body as Record<string, unknown>;
  } catch {
    return jsonNoStore({ ok: false, code: "invalid_json" }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email : "";
  const returnPath = typeof payload.returnPath === "string" ? payload.returnPath : null;
  const localeRaw = typeof payload.locale === "string" ? payload.locale : "vi";
  const locale: ShopLocale = localeRaw === "en" || localeRaw === "ja" || localeRaw === "zh" ? localeRaw : "vi";
  const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken.trim() : "";

  const hasSiteKey = Boolean(env.TURNSTILE_SITE_KEY?.trim());
  const hasSecret = Boolean(env.TURNSTILE_SECRET_KEY?.trim());
  if (hasSiteKey !== hasSecret) return jsonNoStore({ ok: false, code: "challenge_not_configured" }, 503);
  if (hasSecret) {
    if (!turnstileToken) return jsonNoStore({ ok: false, code: "challenge_required" }, 400);
    const remoteIp = clientAddress ?? request.headers.get("CF-Connecting-IP");
    if (!await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY!, remoteIp)) {
      return jsonNoStore({ ok: false, code: "challenge_failed" }, 400);
    }
  }

  const requestId = crypto.randomUUID();
  const result = await requestMagicLink(env, {
    email,
    locale,
    returnPath,
    requestId,
    remoteIp: clientAddress ?? request.headers.get("CF-Connecting-IP"),
  });
  if (!result.ok) return jsonNoStore({ ok: false, code: result.code }, result.status);
  return jsonNoStore({ ok: true });
};

export const ALL: APIRoute = () => jsonNoStore({ ok: false, code: "method_not_allowed" }, 405);
