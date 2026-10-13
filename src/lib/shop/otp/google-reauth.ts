const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("reauth_required");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export async function verifyGoogleReauth(idToken: string | undefined, input: {
  clientId: string; nonce: string; subject: string;
}, now = Date.now(), getCertificates: typeof fetch = fetch): Promise<boolean> {
  try {
    if (!idToken || idToken.length > 16384) return false;
    const parts = idToken.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]!))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1]!))) as Record<string, unknown>;
    const seconds = now / 1000;
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid ||
      !["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) ||
      claims.aud !== input.clientId || claims.sub !== input.subject || claims.nonce !== input.nonce ||
      (claims.azp !== undefined && claims.azp !== input.clientId) ||
      typeof claims.auth_time !== "number" || claims.auth_time > seconds + 5 || seconds - claims.auth_time > 120 ||
      typeof claims.iat !== "number" || claims.iat > seconds + 5 || seconds - claims.iat > 120 ||
      typeof claims.exp !== "number" || claims.exp <= seconds) return false;
    const response = await getCertificates(GOOGLE_CERTS, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    const text = await response.text();
    if (text.length > 65536) return false;
    const payload = JSON.parse(text) as { keys?: Array<JsonWebKey & { kid?: string }> };
    if (!Array.isArray(payload.keys) || payload.keys.length > 10) return false;
    const certificate = payload.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
    if (!certificate) return false;
    const key = await crypto.subtle.importKey("jwk", certificate, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
