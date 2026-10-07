import {
  consumeAuthChallenge,
  createAuthChallenge,
  createCustomerSession,
  issueOAuthStateCookie,
  publicOrigin,
  recordCustomerSecurityEvent,
  sanitizeReturnPath,
  type IssuedSession,
} from "./customer-auth";
import { upsertVerifiedCustomerIdentity, CustomerAccountError } from "./customer-account";
import { randomOpaqueToken } from "./crypto";
import type { ShopBindings, ShopLocale } from "./types";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

function pkceVerifier() {
  return randomOpaqueToken(32);
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const view = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isGoogleOAuthConfigured(bindings: Pick<ShopBindings, "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET">) {
  return Boolean(bindings.GOOGLE_OAUTH_CLIENT_ID?.trim() && bindings.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export async function startGoogleOAuth(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_PUBLIC_ORIGIN" | "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET">,
  input: { returnPath?: string | null; requestId?: string },
): Promise<{ redirectUrl: string; setCookie: string } | { error: string; status: number }> {
  if (!isGoogleOAuthConfigured(bindings)) {
    return { error: "oauth_not_configured", status: 503 };
  }
  if (!bindings.CONTENT_DB) return { error: "shop_database_not_configured", status: 503 };

  const state = randomOpaqueToken(32);
  const codeVerifier = pkceVerifier();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const redirectPath = sanitizeReturnPath(input.returnPath);
  await createAuthChallenge(bindings, {
    kind: "oauth_state",
    provider: "google",
    publicToken: state,
    redirectPath,
    payload: { codeVerifier },
  });
  await recordCustomerSecurityEvent(bindings, {
    eventType: "oauth_start",
    requestId: input.requestId,
    details: { provider: "google" },
  });

  const origin = publicOrigin(bindings);
  const callback = `${origin}/api/shop/auth/oauth/google/callback`;
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", bindings.GOOGLE_OAUTH_CLIENT_ID!.trim());
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  return {
    redirectUrl: url.toString(),
    setCookie: issueOAuthStateCookie(state),
  };
}

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function completeGoogleOAuth(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_PUBLIC_ORIGIN" | "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET" | "SHOP_CUSTOMER_SESSION_SECRET">,
  input: {
    code: string | null;
    state: string | null;
    cookieState: string | null;
    request: Request;
    requestId?: string;
    locale?: ShopLocale;
  },
): Promise<{ redirectPath: string; session: IssuedSession } | { error: string; status: number }> {
  if (!isGoogleOAuthConfigured(bindings)) return { error: "oauth_not_configured", status: 503 };
  if (!input.code || !input.state || !/^[A-Za-z0-9_-]{20,128}$/.test(input.state)) {
    return { error: "oauth_invalid_state", status: 400 };
  }
  if (!input.cookieState || input.cookieState !== input.state) {
    return { error: "oauth_invalid_state", status: 400 };
  }

  const challenge = await consumeAuthChallenge(bindings, {
    kind: "oauth_state",
    publicToken: input.state,
    provider: "google",
  });
  if (!challenge) return { error: "oauth_invalid_state", status: 400 };

  let payload: { codeVerifier?: string } = {};
  try {
    payload = JSON.parse(challenge.payloadJson) as { codeVerifier?: string };
  } catch {
    return { error: "oauth_invalid_state", status: 400 };
  }
  if (!payload.codeVerifier) return { error: "oauth_invalid_state", status: 400 };

  const origin = publicOrigin(bindings);
  const callback = `${origin}/api/shop/auth/oauth/google/callback`;
  const body = new URLSearchParams({
    code: input.code,
    client_id: bindings.GOOGLE_OAUTH_CLIENT_ID!.trim(),
    client_secret: bindings.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
    redirect_uri: callback,
    grant_type: "authorization_code",
    code_verifier: payload.codeVerifier,
  });

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { error: "oauth_token_exchange_failed", status: 502 };
  }
  if (!tokenResponse.ok) return { error: "oauth_token_exchange_failed", status: 502 };

  const tokenJson = await tokenResponse.json() as { access_token?: string };
  if (!tokenJson.access_token) return { error: "oauth_token_exchange_failed", status: 502 };

  let userInfo: GoogleUserInfo;
  try {
    const userResponse = await fetch(GOOGLE_USERINFO, {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userResponse.ok) return { error: "oauth_profile_failed", status: 502 };
    userInfo = await userResponse.json() as GoogleUserInfo;
  } catch {
    return { error: "oauth_profile_failed", status: 502 };
  }

  if (!userInfo.sub || !userInfo.email || userInfo.email_verified !== true) {
    await recordCustomerSecurityEvent(bindings, {
      eventType: "login_failed",
      requestId: input.requestId,
      details: { provider: "google", reason: "email_not_verified" },
    });
    return { error: "oauth_email_not_verified", status: 403 };
  }

  try {
    const customer = await upsertVerifiedCustomerIdentity(bindings, {
      provider: "google",
      externalSubject: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name,
      displayHandle: userInfo.email,
      locale: input.locale,
      metadata: userInfo.picture ? { picture: userInfo.picture } : {},
    });
    const session = await createCustomerSession(bindings, {
      customerId: customer.id,
      authProvider: "google",
      request: input.request,
      metadata: { provider: "google" },
    });
    if (!session) return { error: "session_not_configured", status: 503 };
    await recordCustomerSecurityEvent(bindings, {
      customerId: customer.id,
      eventType: "login",
      requestId: input.requestId,
      details: { provider: "google" },
    });
    return {
      redirectPath: sanitizeReturnPath(challenge.redirectPath),
      session,
    };
  } catch (error) {
    if (error instanceof CustomerAccountError && error.code === "customer_blocked") {
      await recordCustomerSecurityEvent(bindings, {
        eventType: "blocked",
        requestId: input.requestId,
        details: { provider: "google" },
      });
      return { error: "customer_blocked", status: 403 };
    }
    console.error(JSON.stringify({
      event: "google_oauth_complete_failed",
      requestId: input.requestId,
      code: error instanceof Error ? error.message : "unknown",
    }));
    return { error: "oauth_login_failed", status: 503 };
  }
}
