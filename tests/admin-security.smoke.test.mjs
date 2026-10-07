import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadSecurity() {
  const http = compile(read("src/lib/admin/http.ts"));
  const source = compile(read("src/lib/admin/security.ts"))
    .replace(/import\s*\{\s*adminError\s*\}\s*from\s*["']\.\/http["'];?/, "")
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s*["']\.\/types["'];?/, "");
  return importSource(`${http}\n${source}`);
}

test("admin password policy rejects weak and oversized credentials", async () => {
  const security = await loadSecurity();
  assert.equal(security.validateAdminPassword("short"), false);
  assert.equal(security.validateAdminPassword("correct horse battery staple"), true);
  assert.equal(security.validateAdminPassword("a".repeat(129)), false);
  assert.equal(security.validateAdminPassword("passwordpassword"), false);
  assert.equal(security.validateAdminPassword("correct horse battery staple!"), true);
});

function clientCredential(fill = 0x63, saltFill = 0x73, iterations = 600_000) {
  return {
    scheme: "pbkdf2-sha256-v3",
    credential: Buffer.alloc(32, fill).toString("base64url"),
    salt: Buffer.alloc(16, saltFill).toString("base64url"),
    iterations,
  };
}

async function challengeProof(credential, challenge, user) {
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(credential.credential, "base64url"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = `admin-login-challenge-v1\0${challenge.action}\0${challenge.challengeId}\0${challenge.nonce}\0${user.sub}\0${user.email.toLowerCase()}\0${challenge.accessAudience}\0${challenge.origin}\0${challenge.passwordVersion}\0${challenge.sessionEpoch}\0${challenge.issuedAt}\0${challenge.expiresAt}`;
  const proof = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return {
    scheme: "hmac-sha256-login-v1",
    challengeId: challenge.challengeId,
    proof: Buffer.from(proof).toString("base64url"),
  };
}

test("password verifier v3 wraps the client-derived credential with authenticated encryption", async () => {
  const security = await loadSecurity();
  const credential = clientCredential();
  const secret = "test-secret-0123456789-0123456789";
  const verifier = await security.createPasswordVerifier(credential, secret);
  const second = await security.createPasswordVerifier(credential, secret);
  assert.equal(verifier.scheme, "pbkdf2-sha256-v3");
  assert.equal(verifier.salt, credential.salt);
  assert.equal(verifier.iterations, credential.iterations);
  assert.equal(verifier.passwordVersion, 1);
  assert.match(verifier.hash, /^v3\$[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{64}$/);
  assert.notEqual(verifier.hash, second.hash);
  assert.doesNotMatch(verifier.hash, new RegExp(credential.credential));
  assert.equal(await security.verifyPassword(credential, verifier, secret), true);
  assert.equal(await security.verifyPassword(clientCredential(0x64), verifier, secret), false);
  assert.equal(await security.verifyPassword(credential, verifier, "different-secret"), false);
  assert.equal(await security.verifyPassword({ ...credential, iterations: 599_999 }, verifier, secret), false);
  assert.equal(await security.verifyPassword({ ...credential, credential: `${credential.credential}=` }, verifier, secret), false);
});

test("password verifier v3 rejects malformed wrapped credentials without throwing", async () => {
  const security = await loadSecurity();
  const credential = clientCredential();
  assert.equal(await security.verifyPassword({ ...credential, salt: "not base64url" }, { scheme: credential.scheme, hash: "v3$invalid", salt: credential.salt, iterations: credential.iterations }, "test-secret"), false);
  assert.equal(await security.verifyPassword({ ...credential, credential: Buffer.alloc(31, 1).toString("base64url") }, { scheme: credential.scheme, hash: "v3$invalid", salt: credential.salt, iterations: credential.iterations }, "test-secret"), false);
  assert.equal(await security.verifyPassword(credential, { scheme: credential.scheme, hash: "legacy-hash", salt: credential.salt, iterations: credential.iterations }, "test-secret"), false);
});

test("session cookies are opaque host-only cookies and token hashes are deterministic", async () => {
  const security = await loadSecurity();
  const issued = security.issueAdminSessionCookie();
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(issued.cookie, /^__Host-admin_session=/);
  assert.match(issued.cookie, /; Path=\//);
  assert.match(issued.cookie, /; Secure/);
  assert.match(issued.cookie, /; HttpOnly/);
  assert.match(issued.cookie, /; SameSite=Strict/);
  assert.doesNotMatch(issued.cookie, /Domain=/i);
  assert.equal(await security.hashSessionToken(issued.token, "test-secret"), await security.hashSessionToken(issued.token, "test-secret"));
  assert.notEqual(await security.hashSessionToken(issued.token, "test-secret"), await security.hashSessionToken(issued.token + "x", "test-secret"));
});

test("request fingerprints are keyed and do not expose raw IP or user agent", async () => {
  const security = await loadSecurity();
  const fingerprint = await security.hashLoginFingerprint({ sub: "sub-1", email: "owner@example.com", ip: "203.0.113.4", userAgent: "secret browser" }, "test-secret");
  assert.match(fingerprint, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(fingerprint, /203\.0\.113\.4|secret browser|owner@example\.com/);
});

test("security migration stores only password/session digests and bounded lockout state", () => {
  const migration = read("content-migrations/0006_admin_security.sql");
  const challengeMigration = read("content-migrations/0010_admin_login_challenges.sql");
  for (const table of ["admin_security_state", "admin_sessions", "admin_login_attempts"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /password_hash TEXT NOT NULL/);
  assert.match(migration, /token_hash TEXT PRIMARY KEY/);
  assert.match(migration, /failed_count INTEGER NOT NULL CHECK \(failed_count >= 0 AND failed_count <= 100\)/);
  assert.doesNotMatch(migration, /password TEXT|token TEXT/);
  assert.match(challengeMigration, /CREATE TABLE IF NOT EXISTS admin_login_challenges\b/);
  assert.match(challengeMigration, /action TEXT NOT NULL CHECK \(action IN \('login'\)\)/);
  assert.match(challengeMigration, /consumed_at TEXT/);
  assert.match(challengeMigration, /password_version INTEGER NOT NULL DEFAULT 1/);
  assert.match(challengeMigration, /session_epoch INTEGER NOT NULL DEFAULT 1/);
  assert.match(challengeMigration, /access_audience TEXT NOT NULL/);
  assert.match(challengeMigration, /origin TEXT NOT NULL/);
  assert.match(challengeMigration, /idx_admin_login_challenges_expiry/);
  assert.match(challengeMigration, /uq_admin_login_challenges_identity_action/);
  assert.doesNotMatch(challengeMigration, /ADMIN_AUTH_SECRET|owner@example\.com|BODY_DO_NOT_LOG/);
});

test("admin API exposes security actions and gates CMS data behind the second factor", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const security = read("src/lib/admin/router/security-routes.ts");
  assert.match(entry, /segments\[0\] === "security"/);
  for (const action of ["status", "setup", "challenge", "login", "logout", "change", "revoke"]) assert.match(security, new RegExp(`action === "${action}"`));
  assert.match(security, /createAdminLoginChallenge/);
  assert.match(security, /body\.challenge/);
  assert.match(entry, /getAdminSession\(/);
  assert.match(entry, /password_required/);
  assert.ok(entry.indexOf('if (segments[0] === "security")') < entry.indexOf('segments[0] === "media"'));
});

test("Cloudflare Access verification caches and constrains trusted JWKS keys", () => {
  const auth = read("src/lib/admin/auth.ts");
  assert.match(auth, /JWKS_CACHE_TTL_MS/);
  assert.match(auth, /jwksCache/);
  assert.match(auth, /isTrustedTeamDomain/);
  assert.match(auth, /key\.alg === "RS256"/);
  assert.match(auth, /key\.use === "sig"/);
  assert.match(auth, /payload\.iat/);
  assert.match(auth, /\.cloudflareaccess\.com/);
  assert.match(auth, /__Host-admin_csrf/);
});

class FakeD1 {
  constructor() { this.state = null; this.attempts = new Map(); this.sessions = new Map(); this.challenges = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      first: async () => db.first(sql, []),
      run: async () => db.run(sql, []),
      bind(...args) {
        return {
          sql,
          args,
          first: async () => db.first(sql, args),
          run: async () => db.run(sql, args),
        };
      },
    };
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await this.run(statement.sql, statement.args));
    return results;
  }
  async first(sql, args) {
    if (sql.includes("FROM admin_security_state") && !sql.includes("UPDATE")) return this.state;
    if (sql.includes("UPDATE admin_login_challenges") && sql.includes("RETURNING")) {
      const row = this.challenges.get(args[1]) ?? null;
      if (!row || row.access_sub !== args[2] || row.access_email !== args[3] || row.access_audience !== args[4] || row.origin !== args[5] || row.action !== args[6]
        || row.consumed_at || row.created_at > args[7] || row.expires_at <= args[8]
        || row.password_version !== this.state.password_version || row.session_epoch !== this.state.session_epoch) return null;
      row.consumed_at = args[0];
      return { ...row };
    }
    if (sql.includes("FROM admin_login_attempts")) {
      const row = this.attempts.get(args[0]) ?? null;
      if (!row || args.length === 1) return row;
      return (row.locked_until && row.locked_until > args[1]) || row.window_started_at >= args[2] ? row : null;
    }
    if (sql.includes("FROM admin_sessions")) {
      const row = this.sessions.get(args[0]) ?? null;
      return row ? { ...row, current_password_version: this.state?.password_version, current_session_epoch: this.state?.session_epoch } : null;
    }
    return null;
  }
  async run(sql, args) {
    let changes = 1;
    if (sql.includes("INSERT INTO admin_security_state")) {
      if (this.state) throw new Error("UNIQUE");
      this.state = { password_hash: args[0], password_salt: args[1], password_iterations: args[2], password_set_at: args[3], password_version: 1, session_epoch: 1 };
    } else if (sql.includes("UPDATE admin_security_state SET session_epoch = session_epoch + 1")) {
      this.state = { ...this.state, session_epoch: this.state.session_epoch + 1 };
    } else if (sql.includes("UPDATE admin_security_state")) {
      if (this.state.password_version !== args[7] || this.state.session_epoch !== args[8]) changes = 0;
      else this.state = { ...this.state, password_hash: args[0], password_salt: args[1], password_iterations: args[2], password_version: args[3], session_epoch: this.state.session_epoch + 1 };
    } else if (sql.includes("INSERT INTO admin_login_challenges")) {
      for (const [key, row] of this.challenges) {
        if (row.access_sub === args[2] && row.access_email === args[3] && row.action === args[6]) this.challenges.delete(key);
      }
      this.challenges.set(args[0], { id: args[0], nonce: args[1], access_sub: args[2], access_email: args[3], access_audience: args[4], origin: args[5], action: args[6], password_version: args[7], session_epoch: args[8], created_at: args[9], expires_at: args[10], consumed_at: null });
    } else if (sql.includes("DELETE FROM admin_login_challenges")) {
      for (const [key, row] of this.challenges) if (row.expires_at <= args[0] || (row.consumed_at && row.consumed_at <= args[1])) this.challenges.delete(key);
    } else if (sql.includes("UPDATE admin_login_challenges")) {
      for (const row of this.challenges.values()) if (!row.consumed_at) row.consumed_at = args[0];
    } else if (sql.includes("INSERT INTO admin_login_attempts")) {
      const existing = this.attempts.get(args[0]);
      const inWindow = existing && existing.window_started_at >= args[6];
      const failedCount = inWindow ? Math.min(existing.failed_count + 1, 100) : 1;
      this.attempts.set(args[0], { fingerprint_hash: args[0], source_hash: args[1], access_sub: args[2], access_email: args[3], failed_count: failedCount, window_started_at: inWindow ? existing.window_started_at : args[4], locked_until: inWindow && failedCount >= args[9] ? args[10] : null, last_attempt_at: args[5] });
    } else if (sql.includes("DELETE FROM admin_login_attempts")) {
      for (const [key, row] of this.attempts) if (row.access_sub === args[0] && row.access_email === args[1]) this.attempts.delete(key);
    } else if (sql.includes("INSERT INTO admin_sessions")) {
      if (this.state.password_version !== args[7] || this.state.session_epoch !== args[8]) changes = 0;
      else this.sessions.set(args[0], { token_hash: args[0], access_sub: args[1], access_email: args[2], expires_at: args[6], password_version: args[7], session_epoch: args[8], revoked_at: null });
    } else if (sql.includes("UPDATE admin_sessions SET revoked_at")) {
      for (const row of this.sessions.values()) {
        if (sql.includes("token_hash = ?") ? row.token_hash === args[1] : !row.revoked_at) row.revoked_at = args[0];
      }
    } else if (sql.includes("INSERT INTO audit_logs")) {
      // Deliberately ignore audit rows in this deterministic unit double.
    }
    return { success: true, meta: { changes } };
  }
}

test("password setup does not misclassify non-unique D1 failures as already configured", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const run = db.run.bind(db);
  db.run = async (sql, args) => {
    if (sql.includes("INSERT INTO admin_security_state")) throw new Error("schema mismatch PASSWORD_DO_NOT_LOG");
    return run(sql, args);
  };
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  await assert.rejects(
    () => security.setupAdminPassword(db, bindings, user, clientCredential(), "req-setup-failure"),
    /schema mismatch/,
  );
});

test("one-time login challenges prevent replay while preserving identity-wide lockout", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789", CF_ACCESS_AUD: "aud-1" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  const credential = clientCredential();
  const setup = await security.setupAdminPassword(db, bindings, user, credential, "req-setup");
  assert.equal(setup.ok, true);
  const request = (ip, cookie = "") => new Request("https://tung.codes/admin/api/security/login", { headers: { "cf-connecting-ip": ip, "user-agent": "test", cookie } });

  const issued = await security.createAdminLoginChallenge(db, bindings, request("203.0.113.1"), user, "login", "req-challenge", 1_700_000_000_000);
  assert.equal(issued.ok, true);
  const validProof = await challengeProof(credential, issued.challenge, user);
  const login = await security.loginAdminPassword(db, bindings, request("203.0.113.1"), user, validProof, "req-login", 1_700_000_001_000);
  assert.equal(login.ok, true);
  const replay = await security.loginAdminPassword(db, bindings, request("203.0.113.1"), user, validProof, "req-replay", 1_700_000_001_001);
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "invalid_login_challenge");

  for (let index = 0; index < 5; index += 1) {
    const now = 1_700_000_010_000 + index;
    const challenge = await security.createAdminLoginChallenge(db, bindings, request(`203.0.113.${index}`), user, "login", `req-challenge-${index}`, now);
    assert.equal(challenge.ok, true);
    const wrongProof = await challengeProof(clientCredential(0x64), challenge.challenge, user);
    const failed = await security.loginAdminPassword(db, bindings, request(`203.0.113.${index}`), user, wrongProof, `req-${index}`, now + 1);
    assert.equal(failed.ok, false);
    if (index === 0) {
      const replayedFailure = await security.loginAdminPassword(db, bindings, request("203.0.113.200"), user, wrongProof, "req-replayed-failure", now + 2);
      assert.equal(replayedFailure.code, "invalid_login_challenge");
      assert.equal([...db.attempts.values()][0].failed_count, 1);
    }
  }
  const locked = await security.createAdminLoginChallenge(db, bindings, request("203.0.113.99"), user, "login", "req-locked", 1_700_000_020_000);
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "login_locked");
});

test("new challenges replace older ones and are bound to Access identity and expiry", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789", CF_ACCESS_AUD: "aud-1" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  const otherUser = { sub: "sub-2", email: "editor@example.com" };
  const credential = clientCredential();
  await security.setupAdminPassword(db, bindings, user, credential, "req-setup");
  const request = new Request("https://tung.codes/admin/api/security/login", { headers: { "user-agent": "test" } });

  const first = await security.createAdminLoginChallenge(db, bindings, request, user, "login", "req-first", 1_700_000_000_000);
  const second = await security.createAdminLoginChallenge(db, bindings, request, user, "login", "req-second", 1_700_000_001_000);
  const oldProof = await challengeProof(credential, first.challenge, user);
  assert.equal((await security.loginAdminPassword(db, bindings, request, user, oldProof, "req-old", 1_700_000_002_000)).code, "invalid_login_challenge");

  const currentProof = await challengeProof(credential, second.challenge, user);
  assert.equal((await security.loginAdminPassword(db, bindings, request, otherUser, currentProof, "req-other", 1_700_000_002_000)).code, "invalid_login_challenge");
  assert.equal((await security.loginAdminPassword(db, bindings, request, user, currentProof, "req-current", 1_700_000_002_000)).ok, true);

  const expiring = await security.createAdminLoginChallenge(db, bindings, request, user, "login", "req-expiring", 1_700_000_010_000);
  const expiredProof = await challengeProof(credential, expiring.challenge, user);
  assert.equal((await security.loginAdminPassword(db, bindings, request, user, expiredProof, "req-expired", 1_700_000_130_000)).code, "invalid_login_challenge");
  assert.equal((await security.createAdminLoginChallenge(db, bindings, request, user, "change", "req-wrong-action", 1_700_000_140_000)).code, "invalid_login_challenge");
});

test("password changes and revoke-all invalidate sessions for every Access identity", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  const original = clientCredential();
  assert.equal((await security.setupAdminPassword(db, bindings, user, original, "req-setup")).ok, true);
  db.sessions.set("session-a", { token_hash: "session-a", access_sub: "sub-1", access_email: "owner@example.com", revoked_at: null });
  db.sessions.set("session-b", { token_hash: "session-b", access_sub: "sub-2", access_email: "editor@example.com", revoked_at: null });
  const changed = await security.changeAdminPassword(db, bindings, user, original, clientCredential(0x65, 0x74), "req-change");
  assert.equal(changed.ok, true);
  assert.equal(db.state.password_version, 2);
  assert.equal(db.state.session_epoch, 2);
  assert.ok([...db.sessions.values()].every((row) => row.revoked_at));

  db.sessions.set("session-c", { token_hash: "session-c", access_sub: "sub-3", access_email: "ops@example.com", revoked_at: null });
  await security.revokeAdminSessions(db, user, "req-revoke");
  assert.equal(db.state.session_epoch, 3);
  assert.ok([...db.sessions.values()].every((row) => row.revoked_at));
});

test("a login cannot publish a session after the security epoch changes", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789", CF_ACCESS_AUD: "aud-1" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  const credential = clientCredential();
  await security.setupAdminPassword(db, bindings, user, credential, "req-setup");
  const request = new Request("https://tung.codes/admin/api/security/login", { headers: { "user-agent": "test" } });
  const issued = await security.createAdminLoginChallenge(db, bindings, request, user, "login", "req-challenge", 1_700_000_000_000);
  const proof = await challengeProof(credential, issued.challenge, user);

  const run = db.run.bind(db);
  let epochChanged = false;
  db.run = async (sql, args) => {
    if (!epochChanged && sql.includes("INSERT INTO admin_sessions")) {
      epochChanged = true;
      db.state = { ...db.state, session_epoch: db.state.session_epoch + 1 };
    }
    return run(sql, args);
  };

  const login = await security.loginAdminPassword(db, bindings, request, user, proof, "req-login", 1_700_000_001_000);
  assert.equal(login.ok, false);
  assert.equal(login.code, "invalid_login_challenge");
  assert.equal(login.status, 409);
  assert.equal(db.sessions.size, 0);
});

test("concurrent password changes fail closed when the security state is stale", async () => {
  const security = await loadSecurity();
  const db = new FakeD1();
  const bindings = { CONTENT_DB: db, ADMIN_AUTH_SECRET: "test-secret-0123456789-0123456789" };
  const user = { sub: "sub-1", email: "owner@example.com" };
  const original = clientCredential();
  await security.setupAdminPassword(db, bindings, user, original, "req-setup");

  const batch = db.batch.bind(db);
  let stateChanged = false;
  db.batch = async (statements) => {
    if (!stateChanged && statements[0]?.sql.includes("UPDATE admin_security_state SET password_hash")) {
      stateChanged = true;
      db.state = { ...db.state, password_version: db.state.password_version + 1, session_epoch: db.state.session_epoch + 1 };
    }
    return batch(statements);
  };

  const changed = await security.changeAdminPassword(db, bindings, user, original, clientCredential(0x65, 0x74), "req-change");
  assert.equal(changed.ok, false);
  assert.equal(changed.code, "security_state_changed");
  assert.equal(changed.status, 409);
  assert.equal(db.state.password_version, 2);
  assert.equal(db.state.session_epoch, 2);
});

test("login challenge consumption is a single conditional UPDATE RETURNING statement", () => {
  const source = read("src/lib/admin/security.ts");
  assert.match(source, /UPDATE admin_login_challenges[\s\S]*consumed_at IS NULL[\s\S]*RETURNING/);
  assert.match(source, /access_sub = \?[\s\S]*access_email = \?[\s\S]*action = \?/);
  assert.doesNotMatch(source, /loginAdminPassword[\s\S]{0,1800}credential\.credential/);
});

test("failed-login counters increment atomically per Access identity", () => {
  const source = read("src/lib/admin/security.ts");
  const migration = read("content-migrations/0008_atomic_admin_lockout.sql");
  assert.match(source, /admin-login-identity/);
  assert.match(source, /admin_login_attempts\.failed_count \+ 1/);
  assert.match(migration, /source_hash TEXT NOT NULL/);
});
