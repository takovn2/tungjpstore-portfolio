import { adminError } from "./http";
import type { AdminBindings, AdminUser } from "./types";

const PASSWORD_MIN_LENGTH = 14;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_MIN_ITERATIONS = 600_000;
const PASSWORD_MAX_ITERATIONS = 1_000_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_CREDENTIAL_BYTES = 32;
const PASSWORD_WRAP_IV_BYTES = 12;
const PASSWORD_SCHEME = "pbkdf2-sha256-v3";
const PASSWORD_HASH_PREFIX = "v3$";
const LOGIN_PROOF_SCHEME = "hmac-sha256-login-v1";
const LOGIN_CHALLENGE_ACTION = "login";
const LOGIN_CHALLENGE_BYTES = 32;
const LOGIN_CHALLENGE_TTL_MS = 2 * 60 * 1000;
const LOGIN_CHALLENGE_RETENTION_MS = 15 * 60 * 1000;
const TOKEN_BYTES = 32;
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const SESSION_COOKIE = "__Host-admin_session";

type PasswordRecord = {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  password_set_at: string;
  password_version: number;
  session_epoch: number;
};

type LoginAttempt = {
  failed_count: number;
  window_started_at: string;
  locked_until: string | null;
};

type LoginChallengeRecord = {
  id: string;
  nonce: string;
  access_sub: string;
  access_email: string;
  access_audience: string;
  origin: string;
  action: typeof LOGIN_CHALLENGE_ACTION;
  password_version: number;
  session_epoch: number;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export type PasswordVerifier = {
  scheme: typeof PASSWORD_SCHEME;
  salt: string;
  hash: string;
  iterations: number;
  passwordVersion: number;
};

/** Sensitive password-equivalent credential sent only during setup or password change. */
export type ClientPasswordCredential = {
  scheme: typeof PASSWORD_SCHEME;
  credential: string;
  salt: string;
  iterations: number;
};

export type ClientLoginProof = {
  scheme: typeof LOGIN_PROOF_SCHEME;
  challengeId: string;
  proof: string;
};

export type AdminLoginChallenge = {
  challengeId: string;
  nonce: string;
  action: typeof LOGIN_CHALLENGE_ACTION;
  accessAudience: string;
  origin: string;
  passwordVersion: number;
  sessionEpoch: number;
  issuedAt: string;
  expiresAt: string;
};

export type SessionCookie = {
  token: string;
  cookie: string;
  expiresAt: string;
};

export type AdminSession = {
  tokenHash: string;
  accessSub: string;
  accessEmail: string;
  passwordVersion: number;
  sessionEpoch: number;
  createdAt: string;
  expiresAt: string;
};

export type SecurityResult =
  | { ok: true; session?: SessionCookie; passwordSetAt?: string; challenge?: AdminLoginChallenge }
  | { ok: false; code: string; status: number; retryAfter?: number };

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("invalid_base64url");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) throw new Error("invalid_base64url");
  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(secret: string, purpose: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}\0${value}`));
  return new Uint8Array(result);
}

export function validateAdminPassword(password: unknown): password is string {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return false;
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

function isCanonicalBase64Url(value: unknown, expectedBytes: number) {
  if (typeof value !== "string") return false;
  try {
    return decodeBase64Url(value).byteLength === expectedBytes;
  } catch {
    return false;
  }
}

export function validatePasswordCredential(value: unknown): value is ClientPasswordCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const credential = value as Partial<ClientPasswordCredential>;
  return credential.scheme === PASSWORD_SCHEME
    && isCanonicalBase64Url(credential.credential, PASSWORD_CREDENTIAL_BYTES)
    && isCanonicalBase64Url(credential.salt, PASSWORD_SALT_BYTES)
    && typeof credential.iterations === "number"
    && Number.isInteger(credential.iterations)
    && credential.iterations >= PASSWORD_MIN_ITERATIONS
    && credential.iterations <= PASSWORD_MAX_ITERATIONS;
}

function passwordVerifierAad(salt: string, iterations: number, passwordVersion: number) {
  return new TextEncoder().encode(`${PASSWORD_SCHEME}\0default\0${salt}\0${iterations}\0${passwordVersion}`);
}

async function passwordWrappingKey(secret: string) {
  const keyBytes = await hmac(secret, "admin-password-wrap-key", PASSWORD_SCHEME);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function createPasswordVerifier(credential: ClientPasswordCredential, secret: string, passwordVersion = 1): Promise<PasswordVerifier> {
  if (!validatePasswordCredential(credential)) throw new TypeError("invalid_password_proof");
  if (!Number.isInteger(passwordVersion) || passwordVersion < 1) throw new TypeError("invalid_password_version");
  const iv = crypto.getRandomValues(new Uint8Array(PASSWORD_WRAP_IV_BYTES));
  const key = await passwordWrappingKey(secret);
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: passwordVerifierAad(credential.salt, credential.iterations, passwordVersion), tagLength: 128 },
    key,
    decodeBase64Url(credential.credential),
  );
  return {
    scheme: PASSWORD_SCHEME,
    salt: credential.salt,
    hash: `${PASSWORD_HASH_PREFIX}${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(wrapped))}`,
    iterations: credential.iterations,
    passwordVersion,
  };
}

async function unwrapPasswordCredential(verifier: PasswordVerifier, secret: string) {
  if (verifier?.scheme !== PASSWORD_SCHEME || !isCanonicalBase64Url(verifier?.salt, PASSWORD_SALT_BYTES)
    || !Number.isInteger(verifier?.iterations) || verifier.iterations < PASSWORD_MIN_ITERATIONS || verifier.iterations > PASSWORD_MAX_ITERATIONS
    || !Number.isInteger(verifier?.passwordVersion) || verifier.passwordVersion < 1
    || typeof verifier.hash !== "string" || !verifier.hash.startsWith(PASSWORD_HASH_PREFIX)) return null;
  try {
    const [encodedIv, encodedWrapped, ...rest] = verifier.hash.slice(PASSWORD_HASH_PREFIX.length).split(".");
    if (rest.length > 0) return null;
    const iv = decodeBase64Url(encodedIv);
    const wrapped = decodeBase64Url(encodedWrapped);
    if (iv.byteLength !== PASSWORD_WRAP_IV_BYTES || wrapped.byteLength !== PASSWORD_CREDENTIAL_BYTES + 16) return null;
    const key = await passwordWrappingKey(secret);
    const credential = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: passwordVerifierAad(verifier.salt, verifier.iterations, verifier.passwordVersion), tagLength: 128 },
      key,
      wrapped,
    ));
    return credential.byteLength === PASSWORD_CREDENTIAL_BYTES ? credential : null;
  } catch {
    return null;
  }
}

export async function verifyPassword(credential: unknown, verifier: PasswordVerifier, secret: string) {
  if (!validatePasswordCredential(credential) || verifier?.salt !== credential.salt || verifier?.iterations !== credential.iterations) return false;
  const expected = await unwrapPasswordCredential(verifier, secret);
  return expected ? bytesEqual(decodeBase64Url(credential.credential), expected) : false;
}

function validateLoginProof(value: unknown): value is ClientLoginProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as Partial<ClientLoginProof>;
  return proof.scheme === LOGIN_PROOF_SCHEME
    && isCanonicalBase64Url(proof.challengeId, LOGIN_CHALLENGE_BYTES)
    && isCanonicalBase64Url(proof.proof, PASSWORD_CREDENTIAL_BYTES);
}

function loginChallengeMessage(challenge: LoginChallengeRecord) {
  return `admin-login-challenge-v1\0${challenge.action}\0${challenge.id}\0${challenge.nonce}\0${challenge.access_sub}\0${challenge.access_email}\0${challenge.access_audience}\0${challenge.origin}\0${challenge.password_version}\0${challenge.session_epoch}\0${challenge.created_at}\0${challenge.expires_at}`;
}

async function verifyLoginProof(proof: ClientLoginProof, challenge: LoginChallengeRecord, verifier: PasswordVerifier, secret: string) {
  const credential = await unwrapPasswordCredential(verifier, secret);
  if (!credential) return false;
  try {
    const key = await crypto.subtle.importKey("raw", credential, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(loginChallengeMessage(challenge))));
    return bytesEqual(decodeBase64Url(proof.proof), expected);
  } catch {
    return false;
  }
}

export function issueAdminSessionCookie(now = Date.now()): SessionCookie {
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const expiresAt = new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${new Date(now + SESSION_MAX_AGE_SECONDS * 1_000).toUTCString()}; Secure; HttpOnly; SameSite=Strict`;
  return { token, cookie, expiresAt };
}

export function clearAdminSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict`;
}

export async function hashSessionToken(token: string, secret: string) {
  return encodeBase64Url(await hmac(secret, "admin-session-token", token));
}

export async function hashLoginFingerprint(input: { sub: string; email: string; ip?: string; userAgent?: string }, secret: string) {
  const normalized = `${input.sub}\n${input.email.trim().toLowerCase()}\n${input.ip ?? "unknown"}\n${input.userAgent ?? "unknown"}`;
  return encodeBase64Url(await hmac(secret, "admin-login-fingerprint", normalized));
}

async function hashLoginIdentity(user: AdminUser, secret: string) {
  return encodeBase64Url(await hmac(secret, "admin-login-identity", `${user.sub}\n${user.email.trim().toLowerCase()}`));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function authSecret(bindings: AdminBindings) {
  const secret = bindings.ADMIN_AUTH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

async function getPasswordRecord(db: D1Database) {
  return db.prepare(`SELECT password_hash, password_salt, password_iterations, password_set_at, password_version, session_epoch
    FROM admin_security_state WHERE id = 'default' LIMIT 1`).first<PasswordRecord>();
}

async function writeAudit(db: D1Database, actor: string, action: string, requestId: string, details: Record<string, unknown> = {}) {
  try {
    await db.prepare(`INSERT INTO audit_logs
      (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
      VALUES (?, ?, ?, 'admin_security', 'default', ?, ?, ?)`).bind(
      crypto.randomUUID(), actor, action, requestId, JSON.stringify(details), nowIso(),
    ).run();
  } catch {
    // Security telemetry must never leak credentials or make login fail open.
  }
}

export async function securityStatus(db: D1Database | null, bindings: AdminBindings, user: AdminUser, request: Request) {
  const secretConfigured = Boolean(authSecret(bindings));
  if (!db) return { configured: secretConfigured, passwordConfigured: false, authenticated: false, user };
  const row = await getPasswordRecord(db);
  const session = secretConfigured ? await getAdminSession(db, bindings, request, user) : null;
  return {
    configured: secretConfigured,
    passwordConfigured: Boolean(row),
    authenticated: Boolean(session),
    expiresAt: session?.expiresAt ?? null,
    passwordSetAt: row?.password_set_at ?? null,
    passwordScheme: row?.password_hash.startsWith(PASSWORD_HASH_PREFIX) ? PASSWORD_SCHEME : null,
    passwordSalt: row?.password_hash.startsWith(PASSWORD_HASH_PREFIX) ? row.password_salt : null,
    passwordIterations: row?.password_hash.startsWith(PASSWORD_HASH_PREFIX) ? row.password_iterations : null,
    passwordVersion: row?.password_hash.startsWith(PASSWORD_HASH_PREFIX) ? row.password_version : null,
    user,
  };
}

export async function getAdminSession(db: D1Database, bindings: AdminBindings, request: Request, user: AdminUser, now = Date.now()): Promise<AdminSession | null> {
  const secret = authSecret(bindings);
  if (!secret) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await hashSessionToken(token, secret);
  const row = await db.prepare(`SELECT sessions.token_hash, sessions.access_sub, sessions.access_email,
      sessions.user_agent_hash, sessions.created_at, sessions.password_version, sessions.session_epoch, sessions.expires_at,
      security.password_version AS current_password_version, security.session_epoch AS current_session_epoch
    FROM admin_sessions AS sessions
    JOIN admin_security_state AS security ON security.id = 'default'
    WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL LIMIT 1`).bind(tokenHash).first<{
      token_hash: string; access_sub: string; access_email: string; user_agent_hash: string | null; created_at: string;
      password_version: number; session_epoch: number; expires_at: string;
      current_password_version: number; current_session_epoch: number;
    }>();
  if (!row || row.access_sub !== user.sub || row.access_email !== user.email.toLowerCase()
    || row.password_version !== row.current_password_version || row.session_epoch !== row.current_session_epoch
    || Date.parse(row.expires_at) <= now) return null;
  const userAgent = request.headers.get("user-agent");
  const userAgentHash = userAgent ? encodeBase64Url(await hmac(secret, "admin-user-agent", userAgent)) : null;
  if (row.user_agent_hash && row.user_agent_hash !== userAgentHash) {
    await db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(nowIso(now), tokenHash).run().catch(() => undefined);
    return null;
  }
  return {
    tokenHash: row.token_hash,
    accessSub: row.access_sub,
    accessEmail: row.access_email,
    passwordVersion: row.password_version,
    sessionEpoch: row.session_epoch,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function createSession(db: D1Database, bindings: AdminBindings, request: Request, user: AdminUser, requestId: string, passwordVersion: number, sessionEpoch: number, now = Date.now()) {
  const secret = authSecret(bindings);
  if (!secret) return null;
  const issued = issueAdminSessionCookie(now);
  const tokenHash = await hashSessionToken(issued.token, secret);
  const userAgentHash = request.headers.get("user-agent") ? encodeBase64Url(await hmac(secret, "admin-user-agent", request.headers.get("user-agent")!)) : null;
  const inserted = await db.prepare(`INSERT INTO admin_sessions
    (token_hash, access_sub, access_email, user_agent_hash, created_at, last_seen_at, expires_at, password_version, session_epoch)
    SELECT ?, ?, ?, ?, ?, ?, ?, password_version, session_epoch
    FROM admin_security_state
    WHERE id = 'default' AND password_version = ? AND session_epoch = ?`).bind(
    tokenHash, user.sub, user.email.toLowerCase(), userAgentHash, nowIso(now), nowIso(now), issued.expiresAt,
    passwordVersion, sessionEpoch,
  ).run();
  if (!inserted.success || inserted.meta.changes !== 1) return null;
  await writeAudit(db, user.email, "admin_security.login", requestId);
  return issued;
}

export async function setupAdminPassword(db: D1Database | null, bindings: AdminBindings, user: AdminUser, password: unknown, requestId: string): Promise<SecurityResult> {
  const secret = authSecret(bindings);
  if (!secret) return { ok: false, code: "admin_auth_not_configured", status: 503 };
  if (!db) return { ok: false, code: "content_not_configured", status: 503 };
  if (!validatePasswordCredential(password)) return { ok: false, code: "invalid_password_proof", status: 422 };
  const verifier = await createPasswordVerifier(password, secret, 1);
  const timestamp = nowIso();
  try {
    await db.prepare(`INSERT INTO admin_security_state
      (id, password_hash, password_salt, password_iterations, password_set_at, updated_by, updated_at, password_version, session_epoch)
      VALUES ('default', ?, ?, ?, ?, ?, ?, 1, 1)`).bind(verifier.hash, verifier.salt, verifier.iterations, timestamp, user.email, timestamp).run();
  } catch (error) {
    if (await getPasswordRecord(db)) return { ok: false, code: "password_already_setup", status: 409 };
    throw error;
  }
  await writeAudit(db, user.email, "admin_security.password_setup", requestId);
  return { ok: true, passwordSetAt: timestamp };
}

async function activeLoginAttempt(db: D1Database, identityHash: string, now: number) {
  return db.prepare(`SELECT failed_count, window_started_at, locked_until FROM admin_login_attempts
    WHERE fingerprint_hash = ?
      AND ((locked_until IS NOT NULL AND locked_until > ?) OR window_started_at >= ?)
    LIMIT 1`).bind(
    identityHash, nowIso(now), nowIso(now - LOGIN_WINDOW_MS),
  ).first<LoginAttempt>();
}

async function loginLockResult(db: D1Database, user: AdminUser, secret: string, requestId: string, now: number) {
  const identityHash = await hashLoginIdentity(user, secret);
  const attempt = await activeLoginAttempt(db, identityHash, now);
  if (!attempt?.locked_until || Date.parse(attempt.locked_until) <= now) return null;
  const retryAfter = Math.max(1, Math.ceil((Date.parse(attempt.locked_until) - now) / 1_000));
  await writeAudit(db, user.email, "admin_security.login_locked", requestId, { retryAfter });
  return { ok: false as const, code: "login_locked", status: 429, retryAfter };
}

export async function createAdminLoginChallenge(db: D1Database | null, bindings: AdminBindings, request: Request, user: AdminUser, action: unknown, requestId: string, now = Date.now()): Promise<SecurityResult> {
  const secret = authSecret(bindings);
  if (!secret) return { ok: false, code: "admin_auth_not_configured", status: 503 };
  if (!db) return { ok: false, code: "content_not_configured", status: 503 };
  const record = await getPasswordRecord(db);
  if (!record) return { ok: false, code: "password_setup_required", status: 409 };
  if (!record.password_hash.startsWith(PASSWORD_HASH_PREFIX)) return { ok: false, code: "password_upgrade_required", status: 409 };
  if (action !== LOGIN_CHALLENGE_ACTION) return { ok: false, code: "invalid_login_challenge", status: 422 };
  const origin = new URL(request.url).origin;
  const accessAudience = bindings.CF_ACCESS_AUD?.trim();
  if (!accessAudience) return { ok: false, code: "access_not_configured", status: 503 };
  const locked = await loginLockResult(db, user, secret, requestId, now);
  if (locked) return locked;

  const challengeId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(LOGIN_CHALLENGE_BYTES)));
  const nonce = encodeBase64Url(crypto.getRandomValues(new Uint8Array(LOGIN_CHALLENGE_BYTES)));
  const createdAt = nowIso(now);
  const expiresAt = nowIso(now + LOGIN_CHALLENGE_TTL_MS);
  await db.batch([
    db.prepare(`DELETE FROM admin_login_challenges
      WHERE expires_at <= ? OR (consumed_at IS NOT NULL AND consumed_at <= ?)`)
      .bind(createdAt, nowIso(now - LOGIN_CHALLENGE_RETENTION_MS)),
    db.prepare(`INSERT INTO admin_login_challenges
      (id, nonce, access_sub, access_email, access_audience, origin, action, password_version, session_epoch, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(access_sub, access_email, action) DO UPDATE SET
        id = excluded.id, nonce = excluded.nonce, access_audience = excluded.access_audience,
        origin = excluded.origin, password_version = excluded.password_version, session_epoch = excluded.session_epoch,
        created_at = excluded.created_at, expires_at = excluded.expires_at, consumed_at = NULL`)
      .bind(challengeId, nonce, user.sub, user.email.toLowerCase(), accessAudience, origin, LOGIN_CHALLENGE_ACTION, record.password_version, record.session_epoch, createdAt, expiresAt),
  ]);
  return {
    ok: true,
    challenge: {
      challengeId,
      nonce,
      action: LOGIN_CHALLENGE_ACTION,
      accessAudience,
      origin,
      passwordVersion: record.password_version,
      sessionEpoch: record.session_epoch,
      issuedAt: createdAt,
      expiresAt,
    },
  };
}

async function consumeAdminLoginChallenge(db: D1Database, bindings: AdminBindings, request: Request, user: AdminUser, challengeId: string, now: number) {
  const timestamp = nowIso(now);
  const origin = new URL(request.url).origin;
  const accessAudience = bindings.CF_ACCESS_AUD?.trim();
  if (!accessAudience) return null;
  return db.prepare(`UPDATE admin_login_challenges
    SET consumed_at = ?
    WHERE id = ? AND access_sub = ? AND access_email = ? AND access_audience = ? AND origin = ? AND action = ?
      AND consumed_at IS NULL AND created_at <= ? AND expires_at > ?
      AND password_version = (SELECT password_version FROM admin_security_state WHERE id = 'default')
      AND session_epoch = (SELECT session_epoch FROM admin_security_state WHERE id = 'default')
    RETURNING id, nonce, access_sub, access_email, access_audience, origin, action,
      password_version, session_epoch, created_at, expires_at, consumed_at`).bind(
    timestamp, challengeId, user.sub, user.email.toLowerCase(), accessAudience, origin, LOGIN_CHALLENGE_ACTION, timestamp, timestamp,
  ).first<LoginChallengeRecord>();
}

async function recordLoginFailure(db: D1Database, request: Request, user: AdminUser, secret: string, requestId: string, now: number): Promise<SecurityResult> {
  const identityHash = await hashLoginIdentity(user, secret);
  const sourceHash = await hashLoginFingerprint({ sub: user.sub, email: user.email, ip: request.headers.get("cf-connecting-ip") ?? undefined, userAgent: request.headers.get("user-agent") ?? undefined }, secret);
  const windowStart = nowIso(now - LOGIN_WINDOW_MS);
  const timestamp = nowIso(now);
  const lockUntil = nowIso(now + LOGIN_LOCK_MS);
  await db.prepare(`INSERT INTO admin_login_attempts
    (fingerprint_hash, source_hash, access_sub, access_email, failed_count, window_started_at, locked_until, last_attempt_at)
    VALUES (?, ?, ?, ?, 1, ?, NULL, ?)
    ON CONFLICT(fingerprint_hash) DO UPDATE SET source_hash = excluded.source_hash,
      access_sub = excluded.access_sub, access_email = excluded.access_email,
      failed_count = CASE WHEN admin_login_attempts.window_started_at >= ?
        THEN MIN(admin_login_attempts.failed_count + 1, 100) ELSE 1 END,
      window_started_at = CASE WHEN admin_login_attempts.window_started_at >= ?
        THEN admin_login_attempts.window_started_at ELSE excluded.window_started_at END,
      locked_until = CASE WHEN admin_login_attempts.window_started_at >= ?
        AND admin_login_attempts.failed_count + 1 >= ? THEN ? ELSE NULL END,
      last_attempt_at = excluded.last_attempt_at`).bind(
    identityHash, sourceHash, user.sub, user.email.toLowerCase(), timestamp, timestamp,
    windowStart, windowStart, windowStart, LOGIN_FAILURE_LIMIT, lockUntil,
  ).run();
  const updated = await db.prepare(`SELECT failed_count, window_started_at, locked_until
    FROM admin_login_attempts WHERE fingerprint_hash = ? LIMIT 1`).bind(identityHash).first<LoginAttempt>();
  const failedCount = updated?.failed_count ?? 1;
  const locked = Boolean(updated?.locked_until && Date.parse(updated.locked_until) > now);
  await writeAudit(db, user.email, "admin_security.login_failed", requestId, { failedCount, locked });
  return { ok: false, code: locked ? "login_locked" : "invalid_password", status: locked ? 429 : 401, ...(locked ? { retryAfter: Math.ceil(LOGIN_LOCK_MS / 1_000) } : {}) };
}

export async function loginAdminPassword(db: D1Database | null, bindings: AdminBindings, request: Request, user: AdminUser, proof: unknown, requestId: string, now = Date.now()): Promise<SecurityResult> {
  const secret = authSecret(bindings);
  if (!secret) return { ok: false, code: "admin_auth_not_configured", status: 503 };
  if (!db) return { ok: false, code: "content_not_configured", status: 503 };
  const record = await getPasswordRecord(db);
  if (!record) return { ok: false, code: "password_setup_required", status: 409 };
  if (!record.password_hash.startsWith(PASSWORD_HASH_PREFIX)) return { ok: false, code: "password_upgrade_required", status: 409 };
  const locked = await loginLockResult(db, user, secret, requestId, now);
  if (locked) return locked;

  const challengeId = proof && typeof proof === "object" && !Array.isArray(proof)
    ? (proof as Record<string, unknown>).challengeId : null;
  if (typeof challengeId !== "string" || !isCanonicalBase64Url(challengeId, LOGIN_CHALLENGE_BYTES)) return { ok: false, code: "invalid_login_challenge", status: 401 };
  const challenge = await consumeAdminLoginChallenge(db, bindings, request, user, challengeId, now);
  if (!challenge) return { ok: false, code: "invalid_login_challenge", status: 401 };
  const valid = validateLoginProof(proof) && await verifyLoginProof(
    proof,
    challenge,
    { scheme: PASSWORD_SCHEME, hash: record.password_hash, salt: record.password_salt, iterations: record.password_iterations, passwordVersion: record.password_version },
    secret,
  );
  if (!valid) return recordLoginFailure(db, request, user, secret, requestId, now);
  await db.prepare("DELETE FROM admin_login_attempts WHERE access_sub = ? AND access_email = ?").bind(user.sub, user.email.toLowerCase()).run();
  const session = await createSession(db, bindings, request, user, requestId, record.password_version, record.session_epoch, now);
  if (!session) return { ok: false, code: "invalid_login_challenge", status: 409 };
  return { ok: true, session };
}

export async function logoutAdminSession(db: D1Database | null, session: AdminSession | null, user: AdminUser, requestId: string) {
  if (db && session) {
    await db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").bind(nowIso(), session.tokenHash).run();
    await writeAudit(db, user.email, "admin_security.logout", requestId);
  }
  return { ok: true as const };
}

export async function revokeAdminSessions(db: D1Database | null, user: AdminUser, requestId: string) {
  if (db) {
    const timestamp = nowIso();
    await db.batch([
      db.prepare("UPDATE admin_security_state SET session_epoch = session_epoch + 1 WHERE id = 'default'").bind(),
      db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE revoked_at IS NULL").bind(timestamp),
      db.prepare("UPDATE admin_login_challenges SET consumed_at = ? WHERE consumed_at IS NULL").bind(timestamp),
    ]);
    await writeAudit(db, user.email, "admin_security.sessions_revoked", requestId);
  }
  return { ok: true as const };
}

export async function changeAdminPassword(db: D1Database | null, bindings: AdminBindings, user: AdminUser, currentPassword: unknown, newPassword: unknown, requestId: string): Promise<SecurityResult> {
  const secret = authSecret(bindings);
  if (!secret) return { ok: false, code: "admin_auth_not_configured", status: 503 };
  if (!db) return { ok: false, code: "content_not_configured", status: 503 };
  if (!validatePasswordCredential(newPassword)) return { ok: false, code: "invalid_password_proof", status: 422 };
  const record = await getPasswordRecord(db);
  if (!record || !(await verifyPassword(currentPassword, { scheme: PASSWORD_SCHEME, hash: record.password_hash, salt: record.password_salt, iterations: record.password_iterations, passwordVersion: record.password_version }, secret))) return { ok: false, code: "invalid_password", status: 401 };
  const nextPasswordVersion = record.password_version + 1;
  const verifier = await createPasswordVerifier(newPassword, secret, nextPasswordVersion);
  const timestamp = nowIso();
  const results = await db.batch([
    db.prepare(`UPDATE admin_security_state SET password_hash = ?, password_salt = ?, password_iterations = ?, password_version = ?, session_epoch = session_epoch + 1, password_changed_at = ?, updated_by = ?, updated_at = ? WHERE id = 'default' AND password_version = ? AND session_epoch = ?`).bind(verifier.hash, verifier.salt, verifier.iterations, nextPasswordVersion, timestamp, user.email, timestamp, record.password_version, record.session_epoch),
    db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE revoked_at IS NULL").bind(timestamp),
    db.prepare("UPDATE admin_login_challenges SET consumed_at = ? WHERE consumed_at IS NULL").bind(timestamp),
  ]);
  if (!results[0]?.success || results[0].meta.changes !== 1) {
    return { ok: false, code: "security_state_changed", status: 409 };
  }
  await writeAudit(db, user.email, "admin_security.password_changed", requestId);
  return { ok: true, passwordSetAt: timestamp };
}

export function adminSecurityError(result: { code: string; status: number; retryAfter?: number }) {
  return adminError(result.code, result.status, result.retryAfter ? { retryAfter: result.retryAfter } : undefined);
}

export { SESSION_COOKIE, LOGIN_FAILURE_LIMIT, LOGIN_LOCK_MS };
