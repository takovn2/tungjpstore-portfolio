import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(`${projectRoot}/src/pages/api/contact.ts`, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const contactEnv = {};
globalThis.__contactSmokeEnv = contactEnv;
const testableModule = compiled.replace(
  /import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/,
  "const env = globalThis.__contactSmokeEnv;",
);
assert.notEqual(testableModule, compiled, "Cloudflare env import was not replaced for the smoke test");

const moduleUrl = `data:text/javascript;base64,${Buffer.from(testableModule).toString("base64")}`;
const { ALL, GET, POST } = await import(moduleUrl);

const validPayload = {
  name: "Tung Nguyen",
  email: "TUNG@EXAMPLE.COM",
  company: "Tung Labs",
  projectWebsite: "https://tung.codes",
  building: "A multilingual portfolio on Cloudflare.",
  message: "A sufficiently detailed project message.",
  locale: "ko",
};

const jsonRequest = (body, headers = {}) =>
  new Request("https://tung.codes/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const formRequest = (payload = {}) => {
  const form = new URLSearchParams({
    name: validPayload.name,
    email: validPayload.email,
    company: validPayload.company,
    website: validPayload.projectWebsite,
    building: validPayload.building,
    message: validPayload.message,
    website_confirm: "",
    locale: "ja",
    ...payload,
  });
  return new Request("https://tung.codes/api/contact", { method: "POST", body: form });
};

const createDb = (recentCount = 0) => {
  const inserts = [];
  const emailOutbox = [];
  const queries = [];
  let submissionCount = recentCount;
  let lastClaimId = null;
  let batchCalls = 0;

  return {
    inserts,
    emailOutbox,
    queries,
    get batchCalls() { return batchCalls; },
    prepare(sql) {
      queries.push(sql);
      return {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
      };
    },
    async batch(statements) {
      batchCalls += 1;
      assert.equal(statements.length, 4);
      const [, claim, insert, enqueueConfirmation] = statements;
      const canClaim = submissionCount < 3;
      if (canClaim) {
        submissionCount += 1;
        lastClaimId = claim.values[3];
      }
      const canInsert = canClaim && lastClaimId === insert.values[11];
      if (canInsert) inserts.push(insert.values);
      if (canInsert) emailOutbox.push(enqueueConfirmation.values);
      return [
        { success: true, meta: { changes: 0 }, results: [] },
        { success: true, meta: { changes: canClaim ? 1 : 0 }, results: [] },
        { success: true, meta: { changes: canInsert ? 1 : 0 }, results: [] },
        { success: true, meta: { changes: canInsert ? 1 : 0 }, results: [] },
      ];
    },
  };
};

const callPost = (request) => POST({ request, clientAddress: "203.0.113.10" });

test("contact API rejects unsupported content types and malformed JSON", async () => {
  const wrongType = await callPost(new Request("https://tung.codes/api/contact", { method: "POST", body: "name=Tung" }));
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).code, "invalid_content_type");

  const malformed = await callPost(jsonRequest("{"));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "invalid_json");

  const wrongShape = await callPost(jsonRequest("null"));
  assert.equal(wrongShape.status, 400);
  assert.equal((await wrongShape.json()).code, "invalid_payload");
});

test("contact API enforces declared and streamed body limits", async () => {
  const declaredOversized = await callPost(jsonRequest(validPayload, { "content-length": "12001" }));
  assert.equal(declaredOversized.status, 413);
  assert.equal((await declaredOversized.json()).code, "payload_too_large");

  const streamedOversized = await callPost(jsonRequest({ ...validPayload, message: "x".repeat(13_000) }));
  assert.equal(streamedOversized.status, 413);
  assert.equal((await streamedOversized.json()).code, "payload_too_large");
});

test("contact API reports the invalid field without changing its error code contract", async () => {
  const invalidEmail = await callPost(jsonRequest({ ...validPayload, email: "not-an-email" }));
  assert.equal(invalidEmail.status, 400);
  assert.deepEqual(await invalidEmail.json(), { ok: false, code: "validation_failed", field: "email" });

  const missingBuilding = await callPost(jsonRequest({ ...validPayload, building: "short" }));
  assert.equal(missingBuilding.status, 400);
  assert.equal((await missingBuilding.json()).field, "building");

  const unsafeWebsite = await callPost(jsonRequest({ ...validPayload, projectWebsite: "javascript:alert(1)" }));
  assert.equal(unsafeWebsite.status, 400);
  assert.equal((await unsafeWebsite.json()).field, "website");
});

test("contact API stores a normalized valid request through one atomic D1 batch", async () => {
  const db = createDb();
  contactEnv.CONTACT_DB = db;
  delete contactEnv.TURNSTILE_SITE_KEY;
  delete contactEnv.TURNSTILE_SECRET_KEY;
  delete contactEnv.CONTACT_HASH_SECRET;

  const response = await callPost(jsonRequest(validPayload));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(db.batchCalls, 1);
  assert.equal(db.inserts.length, 1);
  assert.equal(db.emailOutbox.length, 1);
  assert.equal(db.emailOutbox[0][5], db.inserts[0][0]);
  assert.equal(db.inserts[0][2], "tung@example.com");
  assert.equal(db.inserts[0][3], "Tung Labs");
  assert.equal(db.inserts[0][4], "https://tung.codes");
  assert.equal(db.inserts[0][5], `${validPayload.building}\n\n${validPayload.message}`);
  assert.equal(db.inserts[0][6], "vi");
  assert.equal(db.inserts[0][8], createHash("sha256").update("203.0.113.10").digest("hex"));
  assert.match(db.queries[1], /ON CONFLICT\(ip_hash\) DO UPDATE/);
  assert.match(db.queries[1], /last_claim_id = excluded\.last_claim_id/);
  assert.match(db.queries[2], /WHERE EXISTS/);
  assert.match(db.queries[2], /last_claim_id = \?/);
  assert.match(db.queries[3], /contact\.submission\.confirmed/);
});

test("contact API requires and verifies Turnstile when the production secret is configured", async () => {
  const originalFetch = globalThis.fetch;
  contactEnv.CONTACT_DB = createDb();

  try {
    contactEnv.TURNSTILE_SITE_KEY = "test-site-key";
    const misconfigured = await callPost(jsonRequest(validPayload));
    assert.equal(misconfigured.status, 503);
    assert.equal((await misconfigured.json()).code, "challenge_not_configured");
    contactEnv.TURNSTILE_SECRET_KEY = "test-secret";

    const missingHashSecret = await callPost(jsonRequest({ ...validPayload, turnstileToken: "unused-token" }));
    assert.equal(missingHashSecret.status, 503);
    assert.equal((await missingHashSecret.json()).code, "contact_hash_not_configured");
    assert.equal(contactEnv.CONTACT_DB.batchCalls, 0);
    contactEnv.CONTACT_HASH_SECRET = "test-contact-hash-secret";

    const missing = await callPost(jsonRequest(validPayload));
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, "challenge_required");

    globalThis.fetch = async () => Response.json({ success: false });
    const rejected = await callPost(jsonRequest({ ...validPayload, turnstileToken: "invalid-token" }));
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, "challenge_failed");

    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("secret"), "test-secret");
      assert.equal(options.body.get("response"), "valid-token");
      return Response.json({ success: true });
    };
    const accepted = await callPost(jsonRequest({ ...validPayload, turnstileToken: "valid-token" }));
    assert.equal(accepted.status, 201);
    assert.equal(
      contactEnv.CONTACT_DB.inserts[0][8],
      createHmac("sha256", "test-contact-hash-secret").update("203.0.113.10").digest("hex"),
    );
    assert.notEqual(
      contactEnv.CONTACT_DB.inserts[0][8],
      createHash("sha256").update("203.0.113.10").digest("hex"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete contactEnv.TURNSTILE_SITE_KEY;
    delete contactEnv.TURNSTILE_SECRET_KEY;
    delete contactEnv.CONTACT_HASH_SECRET;
  }
});

test("the atomic counter rejects the fourth submission in its active window", async () => {
  const db = createDb();
  contactEnv.CONTACT_DB = db;

  for (let index = 0; index < 3; index += 1) {
    const accepted = await callPost(jsonRequest(validPayload));
    assert.equal(accepted.status, 201);
  }
  const limited = await callPost(jsonRequest(validPayload));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "rate_limited");
  assert.equal(db.inserts.length, 3);
});

test("URL-encoded forms get an accessible no-JavaScript result flow", async () => {
  contactEnv.CONTACT_DB = createDb();
  const response = await callPost(formRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/api/contact?result=success&locale=ja");

  const result = await GET({
    request: new Request(new URL(response.headers.get("location"), "https://tung.codes")),
  });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /^text\/html/);
  assert.equal(result.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await result.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<title>メッセージを受け取りました。/);
  assert.match(html, /role="status"/);
  assert.match(html, /href="\/ja\/contact"/);

  const invalid = await callPost(formRequest({ email: "invalid" }));
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get("content-type"), /^text\/html/);
  assert.match(await invalid.text(), /role="alert"/);
});

test("contact API handles honeypot and unsupported methods", async () => {
  contactEnv.CONTACT_DB = createDb();
  const honeypot = await callPost(jsonRequest({ website: "https://spam.example" }));
  assert.equal(honeypot.status, 200);
  assert.deepEqual(await honeypot.json(), { ok: true });

  const unsupported = ALL();
  assert.equal(unsupported.status, 405);
  assert.equal((await unsupported.json()).code, "method_not_allowed");
});

test("the rate-limit schema has bounded counters and cleanup lookup", () => {
  const migration = readFileSync(`${projectRoot}/migrations/0003_contact_rate_limits.sql`, "utf8");
  assert.match(migration, /ip_hash TEXT PRIMARY KEY/);
  assert.match(migration, /CHECK \(submission_count BETWEEN 1 AND 3\)/);
  assert.match(migration, /ON contact_rate_limits \(expires_at\)/);
});

test.after(() => {
  delete globalThis.__contactSmokeEnv;
});
