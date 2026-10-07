import { adminError } from "./http";
import type { AdminBindings, AdminUser } from "./types";

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtPayload = {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  name?: unknown;
  nbf?: unknown;
  sub?: unknown;
};
type JwkWithKid = JsonWebKey & { kid?: string };
type Jwks = { keys?: JwkWithKid[] };
type CachedJwks = { expiresAt: number; keys: JwkWithKid[] };

const JWKS_CACHE_TTL_MS = 5 * 60 * 1_000;
const JWKS_MAX_BYTES = 128_000;
const jwksCache = new Map<string, CachedJwks>();

export type AuthResult =
  | { ok: true; user: AdminUser }
  | { ok: false; response: Response };

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseSegment<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

function normalizeTeamDomain(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function isTrustedTeamDomain(value: string) {
  return value.length <= 253
    && value.toLowerCase().endsWith(".cloudflareaccess.com")
    && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function audienceMatches(aud: unknown, expected: string) {
  return aud === expected || (Array.isArray(aud) && aud.some((entry) => entry === expected));
}

function validJwk(key: JwkWithKid): key is JwkWithKid & { kid: string; kty: "RSA"; n: string; e: string } {
  return key.kty === "RSA" && typeof key.kid === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(key.kid)
    && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig")
    && typeof key.n === "string" && key.n.length >= 128 && key.n.length <= 4096
    && typeof key.e === "string" && key.e.length >= 2 && key.e.length <= 16;
}

async function fetchJwks(teamDomain: string, force = false): Promise<JwkWithKid[]> {
  const cached = jwksCache.get(teamDomain);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.keys;
  try {
    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > JWKS_MAX_BYTES) return [];
    if (!response.body) return [];
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > JWKS_MAX_BYTES) {
          await reader.cancel("jwks_too_large");
          return [];
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as Jwks;
    if (!Array.isArray(body.keys) || body.keys.length > 32) return [];
    const keys = body.keys.filter(validJwk);
    jwksCache.set(teamDomain, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
    return keys;
  } catch {
    return [];
  }
}

async function getJwk(teamDomain: string, kid: string): Promise<JsonWebKey | null> {
  let keys = await fetchJwks(teamDomain);
  let match = keys.find((key) => key.kid === kid) ?? null;
  if (!match) {
    keys = await fetchJwks(teamDomain, true);
    match = keys.find((key) => key.kid === kid) ?? null;
  }
  return match;
}

export async function verifyCloudflareAccess(request: Request, bindings: AdminBindings): Promise<AuthResult> {
  const configuredDomain = bindings.CF_ACCESS_TEAM_DOMAIN;
  const expectedAudience = bindings.CF_ACCESS_AUD;
  const allowedEmails = (bindings.CF_ACCESS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!configuredDomain || !expectedAudience || allowedEmails.length === 0) {
    return { ok: false, response: adminError("access_not_configured", 503) };
  }
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) return { ok: false, response: adminError("access_required", 401) };
  if (assertion.length > 16_384) return { ok: false, response: adminError("invalid_access_token", 401) };
  const segments = assertion.split(".");
  if (segments.length !== 3) return { ok: false, response: adminError("invalid_access_token", 401) };
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseSegment<JwtHeader>(encodedHeader);
  const payload = parseSegment<JwtPayload>(encodedPayload);
  if (!header || !payload || header.alg !== "RS256" || (header.typ !== undefined && header.typ !== "JWT") || typeof header.kid !== "string") {
    return { ok: false, response: adminError("invalid_access_token", 401) };
  }

  const teamDomain = normalizeTeamDomain(configuredDomain);
  if (!isTrustedTeamDomain(teamDomain)) return { ok: false, response: adminError("access_not_configured", 503) };
  const now = Math.floor(Date.now() / 1_000);
  const issuer = `https://${teamDomain}`;
  if (
    payload.iss !== issuer ||
    !audienceMatches(payload.aud, expectedAudience) ||
    typeof payload.exp !== "number" || payload.exp <= now ||
    (typeof payload.iat === "number" && payload.iat > now + 30) ||
    (typeof payload.nbf === "number" && payload.nbf > now + 30) ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string"
  ) {
    return { ok: false, response: adminError("invalid_access_claims", 401) };
  }

  const jwk = await getJwk(teamDomain, header.kid);
  if (!jwk) return { ok: false, response: adminError("access_key_unavailable", 503) };
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = decodeBase64Url(encodedSignature);
    const signature = new Uint8Array(signatureBytes.byteLength);
    signature.set(signatureBytes);
    const signedBytes = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signedData = new Uint8Array(signedBytes.byteLength);
    signedData.set(signedBytes);
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature.buffer,
      signedData.buffer,
    );
    if (!verified) return { ok: false, response: adminError("invalid_access_signature", 401) };
  } catch {
    return { ok: false, response: adminError("invalid_access_signature", 401) };
  }

  if (!allowedEmails.includes(payload.email.toLowerCase())) {
    return { ok: false, response: adminError("access_forbidden", 403) };
  }

  return {
    ok: true,
    user: {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    },
  };
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  let found: string | null = null;
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    if (found !== null) return null;
    try {
      found = decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return found;
}

function secureEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.byteLength; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function createCsrfSession() {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const cookie = `__Host-admin_csrf=${encodeURIComponent(token)}; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict`;
  return { token, cookie };
}

export function verifyMutationRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return adminError("invalid_origin", 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return adminError("cross_site_request", 403);
  const cookie = cookieValue(request, "__Host-admin_csrf");
  const header = request.headers.get("x-csrf-token");
  if (!cookie || !header || !secureEqual(cookie, header)) return adminError("invalid_csrf", 403);
  return null;
}
