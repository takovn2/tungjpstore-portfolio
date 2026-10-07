/**
 * Client-side admin credential derivation. The raw password never leaves the
 * browser: setup/login sends a PBKDF2-derived credential or an HMAC proof of
 * a server-issued challenge bound to the Cloudflare Access identity.
 */

const PASSWORD_KDF_ITERATIONS = 600000;
const PASSWORD_SALT_BYTES = 16;

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createPasswordSalt() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES)));
}

async function deriveAdminCredential(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeBase64Url(salt), iterations, hash: "SHA-256" }, key, 256);
  return encodeBase64Url(new Uint8Array(bits));
}

export function validateClientAdminPassword(password: string) {
  if (typeof password !== "string" || password.length < 14 || password.length > 128) return false;
  const normalized = password.trim().toLowerCase();
  if (!normalized || /^(.)\1+$/.test(normalized)) return false;
  if (/(password|qwerty|letmein|admin|tungjpstore|tungcodes|123456|12345678)/i.test(normalized)) return false;
  let categories = 0;
  if (/[a-z]/.test(password)) categories += 1;
  if (/[A-Z]/.test(password)) categories += 1;
  if (/[0-9]/.test(password)) categories += 1;
  if (/[^A-Za-z0-9]/.test(password)) categories += 1;
  return categories >= 2;
}

export async function passwordCredential(password: string, salt: string, iterations = PASSWORD_KDF_ITERATIONS) {
  const credential = await deriveAdminCredential(password, salt, iterations);
  return { credential, salt, iterations, scheme: "pbkdf2-sha256-v3" };
}

export type LoginChallenge = {
  action?: string;
  origin?: string;
  accessAudience?: unknown;
  passwordVersion?: unknown;
  sessionEpoch?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
  challengeId?: string;
  nonce?: string;
};

export async function loginChallengeProof(
  credential: { credential: string; iterations: number; scheme: string; salt: string },
  challenge: LoginChallenge,
  identity: { accessSub: string; accessEmail: string },
) {
  if (
    !identity.accessSub || !identity.accessEmail || challenge?.action !== "login"
    || challenge.origin !== window.location.origin
    || typeof challenge.accessAudience !== "string"
    || !Number.isInteger(challenge.passwordVersion) || !Number.isInteger(challenge.sessionEpoch)
    || typeof challenge.issuedAt !== "string" || typeof challenge.expiresAt !== "string"
  ) {
    throw new Error("Không thể liên kết yêu cầu đăng nhập với danh tính Cloudflare Access.");
  }
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(credential.credential), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = `admin-login-challenge-v1\0${challenge.action}\0${challenge.challengeId}\0${challenge.nonce}\0${identity.accessSub}\0${identity.accessEmail}\0${challenge.accessAudience}\0${challenge.origin}\0${challenge.passwordVersion}\0${challenge.sessionEpoch}\0${challenge.issuedAt}\0${challenge.expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return { scheme: "hmac-sha256-login-v1", challengeId: challenge.challengeId, proof: encodeBase64Url(new Uint8Array(signature)) };
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}
