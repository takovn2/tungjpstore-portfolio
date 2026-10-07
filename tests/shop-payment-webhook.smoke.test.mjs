import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
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

async function loadWebhookAuth() {
  const sources = [
    "src/lib/shop/types.ts",
    "src/lib/shop/crypto.ts",
    "src/lib/shop/validation.ts",
    "src/lib/shop/webhook-auth.ts",
  ].map((path) => compile(read(path)).replace(/^import[\s\S]*?;\s*/gm, ""));
  return importSource(sources.join("\n"));
}

async function loadVerificationProbeRoute() {
  const route = compile(read("src/pages/api/shop/payment-webhooks/[provider].ts"))
    .replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`
    const env = { CONTENT_DB: {}, PAYOS_CHECKSUM_KEY: "payos-checksum-key-at-least-32-bytes-long" };
    const routeState = { reconciliationCalls: 0 };
    const authenticatePayOsPaymentWebhook = async () => ({ kind: "verification" });
    class ShopWebhookRequestError extends Error {}
    const reconcilePaymentConfirmation = async () => {
      routeState.reconciliationCalls += 1;
      throw new Error("verification probe must not reconcile");
    };
    ${route}
    export { routeState };
  `);
}

async function loadRejectedWebhookRoute() {
  const route = compile(read("src/pages/api/shop/payment-webhooks/[provider].ts"))
    .replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`
    const routeState = { eventKeys: new Set() };
    const env = {
      CONTENT_DB: {
        prepare() {
          return {
            bind(...args) {
              return {
                async run() { routeState.eventKeys.add(args[1]); return { meta: { changes: 1 } }; }
              };
            }
          };
        }
      },
      PAYOS_CHECKSUM_KEY: "payos-checksum-key-at-least-32-bytes-long"
    };
    class ShopWebhookRequestError extends Error {
      constructor(code, status) { super(code); this.code = code; this.status = status; }
    }
    const authenticatePayOsPaymentWebhook = async () => { throw new ShopWebhookRequestError("payos_signature_invalid", 401); };
    const reconcilePaymentConfirmation = async () => { throw new Error("must not reconcile"); };
    const dispatchTelegramPaidOrderNotifications = async () => {};
    const waitUntil = () => {};
    ${route}
    export { routeState };
  `);
}

async function loadPayOs() {
  return importSource(compile(read("src/lib/shop/payos.ts")));
}

const secret = "generic-webhook-secret-32-bytes-minimum-value";
const timestamp = "1784880000";
const nowMs = Number(timestamp) * 1_000;
const pathname = "/api/shop/payment-webhooks/generic_signed";
const eventId = "bank.transfer:evt_0001";

const bodyFor = (extra = {}) => JSON.stringify({
  orderReference: "TUNGORDER0001",
  amountMinor: 120000,
  currency: "VND",
  occurredAt: "2026-07-24T08:00:00.000Z",
  transactionReference: "BANK-TXN-1",
  ...extra,
});

function sign(body, options = {}) {
  const signedTimestamp = options.timestamp ?? timestamp;
  const signedEventId = options.eventId ?? eventId;
  const signedPathname = options.pathname ?? pathname;
  const context = `tung-shop-webhook-v1\n${signedTimestamp}\n${signedEventId}\ngeneric_signed\n${signedPathname}\n`;
  return `v1=${createHmac("sha256", secret).update(context).update(body).digest("hex")}`;
}

function requestFor(body, options = {}) {
  return new Request(`https://tung.codes${options.pathname ?? pathname}`, {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      "x-tung-timestamp": options.timestamp ?? timestamp,
      "x-tung-event-id": options.eventId ?? eventId,
      "x-tung-signature": options.signature ?? sign(body, options),
    },
    body,
  });
}

function payOsWebhook(dataOverrides = {}, envelopeOverrides = {}) {
  const data = {
    orderCode: 202607240001,
    amount: 120000,
    description: "TUNGORDER0001",
    accountNumber: "0123456789",
    reference: "FT2620500001",
    transactionDateTime: "2026-07-24 08:00:00",
    currency: "VND",
    paymentLinkId: "paylink-0001",
    code: "00",
    desc: "success",
    counterAccountBankId: "970436",
    ...dataOverrides,
  };
  const canonical = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join("&");
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");
  return JSON.stringify({ code: "00", desc: "success", success: true, data, signature, ...envelopeOverrides });
}

function payOsVerificationProbe(dataOverrides = {}, envelopeOverrides = {}) {
  return payOsWebhook({
    orderCode: 123,
    amount: 3000,
    description: "VQRIO123",
    accountNumber: "12345678",
    reference: "TF230204212323",
    transactionDateTime: "2023-02-04 18:25:00",
    currency: "VND",
    paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
    ...dataOverrides,
  }, { code: "01", desc: "webhook verification", success: undefined, ...envelopeOverrides });
}

test("generic payment webhook authenticates the exact raw body and derives trusted fields server-side", async () => {
  const webhook = await loadWebhookAuth();
  const body = bodyFor();
  const confirmation = await webhook.authenticateGenericPaymentWebhook(requestFor(body), secret, nowMs);
  assert.deepEqual(confirmation, {
    provider: "generic_signed",
    providerEventId: eventId,
    providerReference: null,
    providerOrderCode: null,
    transactionReference: "BANK-TXN-1",
    orderReference: "TUNGORDER0001",
    amountMinor: 120000,
    currency: "VND",
    payloadHash: createHash("sha256").update(body).digest("base64url"),
    signatureVerified: true,
    occurredAt: "2026-07-24T08:00:00.000Z",
  });
});

test("generic payment webhook fails closed when raw body, event ID, path, or timestamp is changed", async () => {
  const webhook = await loadWebhookAuth();
  const original = bodyFor();
  const cases = [
    requestFor(bodyFor({ amountMinor: 1 }), { signature: sign(original) }),
    requestFor(original, { eventId: "bank.transfer:evt_0002", signature: sign(original) }),
    requestFor(original, { pathname: "/api/shop/payment-webhooks/copied", signature: sign(original) }),
    requestFor(original, { timestamp: String(Number(timestamp) - 301), signature: sign(original, { timestamp: String(Number(timestamp) - 301) }) }),
  ];
  for (const request of cases) {
    await assert.rejects(
      webhook.authenticateGenericPaymentWebhook(request, secret, nowMs),
      (error) => error instanceof webhook.ShopWebhookRequestError && error.status === 401,
    );
  }
});

test("generic payment webhook never trusts providerEventId or signatureVerified from JSON", async () => {
  const webhook = await loadWebhookAuth();
  for (const extra of [
    { providerEventId: "attacker-event" },
    { signatureVerified: true },
    { provider: "manual" },
  ]) {
    const body = bodyFor(extra);
    await assert.rejects(
      webhook.authenticateGenericPaymentWebhook(requestFor(body), secret, nowMs),
      (error) => error instanceof webhook.ShopWebhookRequestError
        && error.code === "invalid_payment_webhook"
        && error.status === 422,
    );
  }
});

test("generic payment webhook rejects missing secrets before consuming the request body", async () => {
  const webhook = await loadWebhookAuth();
  const body = bodyFor();
  const request = requestFor(body);
  await assert.rejects(
    webhook.authenticateGenericPaymentWebhook(request, undefined, nowMs),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "provider_not_configured"
      && error.status === 503,
  );
  assert.equal(await request.text(), body);

  const unsignedRequest = requestFor(body, { signature: "missing" });
  await assert.rejects(
    webhook.authenticateGenericPaymentWebhook(unsignedRequest, secret, nowMs),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "webhook_signature_invalid"
      && error.status === 401,
  );
  assert.equal(await unsignedRequest.text(), body);
});

test("payOS webhook follows the SDK checksum contract and normalizes a successful transfer", async () => {
  const webhook = await loadWebhookAuth();
  const body = payOsWebhook();
  const authenticated = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body },
  ), secret);
  assert.deepEqual(authenticated, {
    kind: "payment",
    confirmation: {
      provider: "payos",
      providerEventId: "FT2620500001",
      providerReference: "paylink-0001",
      providerOrderCode: 202607240001,
      destinationAccountNumber: "0123456789",
      transactionReference: "FT2620500001",
      orderReference: "TUNGORDER0001",
      amountMinor: 120000,
      currency: "VND",
      payloadHash: createHash("sha256").update(body).digest("base64url"),
      signatureVerified: true,
      occurredAt: "2026-07-24T01:00:00.000Z",
    },
  });
});

test("payOS accepts a signed payment when the optional envelope success field is omitted", async () => {
  const webhook = await loadWebhookAuth();
  const body = payOsWebhook({}, { success: undefined });
  const authenticated = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body },
  ), secret);
  assert.equal(authenticated.kind, "payment");
  assert.equal(authenticated.confirmation.amountMinor, 120000);
});

test("payOS accepts only the HMAC-valid official verification probe as a no-op", async () => {
  const webhook = await loadWebhookAuth();
  const body = payOsVerificationProbe();
  const authenticated = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body },
  ), secret);
  assert.deepEqual(authenticated, { kind: "verification" });

  const tampered = body.replace('"amount":3000', '"amount":3001');
  await assert.rejects(
    webhook.authenticatePayOsPaymentWebhook(new Request(
      "https://tung.codes/api/shop/payment-webhooks/payos",
      { method: "POST", headers: { "content-type": "application/json" }, body: tampered },
    ), secret),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "webhook_signature_invalid"
      && error.status === 401,
  );

  const unrelatedNonSuccess = payOsWebhook({}, { code: "01", success: false });
  await assert.rejects(
    webhook.authenticatePayOsPaymentWebhook(new Request(
      "https://tung.codes/api/shop/payment-webhooks/payos",
      { method: "POST", headers: { "content-type": "application/json" }, body: unrelatedNonSuccess },
    ), secret),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "payment_event_not_successful"
      && error.status === 422,
  );
});

test("payOS response signatures preserve the flat SDK checksum contract", async () => {
  const payOs = await loadPayOs();
  const data = {
    zeta: "last",
    omitted: undefined,
    literalUndefined: "undefined",
    literalNull: "null",
    missing: null,
    amount: 120000,
    active: true,
  };
  const canonical = "active=true&amount=120000&literalNull=&literalUndefined=&missing=&zeta=last";
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");

  assert.equal(await payOs.verifyPayOsResponseSignature(data, signature, secret), true);
  assert.equal(await payOs.verifyPayOsResponseSignature({ ...data, amount: 1 }, signature, secret), false);
});

test("payOS response signatures shallow-sort array objects without reordering arrays", async () => {
  const payOs = await loadPayOs();
  const data = {
    records: [
      { z: { y: 1, x: 2 }, a: "one" },
      { b: { z: 3, a: 4 }, a: [{ d: 4, c: 5 }] },
    ],
    amount: 120000,
  };
  const signature = "d648985eb7d0e8ff7d31705644837f09157fca8440a1149cfdff72571ee06641";

  assert.equal(await payOs.verifyPayOsResponseSignature(data, signature, "payos-response-secret-32-bytes-minimum"), true);
  assert.equal(await payOs.verifyPayOsResponseSignature({ ...data, records: [...data.records].reverse() }, signature, "payos-response-secret-32-bytes-minimum"), false);
});

test("payOS webhook rejects checksum tampering and non-success events", async () => {
  const webhook = await loadWebhookAuth();
  const validBody = payOsWebhook();
  const tampered = validBody.replace('"amount":120000', '"amount":1');
  await assert.rejects(
    webhook.authenticatePayOsPaymentWebhook(new Request(
      "https://tung.codes/api/shop/payment-webhooks/payos",
      { method: "POST", headers: { "content-type": "application/json" }, body: tampered },
    ), secret),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "webhook_signature_invalid"
      && error.status === 401,
  );

  // Extra fields from payOS must not hard-fail (signature still covers them).
  const withExtra = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body: payOsWebhook({ channelExtra: "ok" }) },
  ), secret);
  assert.equal(withExtra.kind, "payment");

  await assert.rejects(
    webhook.authenticatePayOsPaymentWebhook(new Request(
      "https://tung.codes/api/shop/payment-webhooks/payos",
      { method: "POST", headers: { "content-type": "application/json" }, body: payOsWebhook({ code: "01" }) },
    ), secret),
    (error) => error instanceof webhook.ShopWebhookRequestError
      && error.code === "payment_event_not_successful"
      && error.status === 422,
  );
});

test("public payment webhook route exposes only authenticated payOS reconciliation", () => {
  const route = read("src/pages/api/shop/payment-webhooks/[provider].ts");
  assert.match(route, /authenticatePayOsPaymentWebhook\s*\(/);
  assert.match(route, /const bucket = Math\.floor\(Date\.now\(\) \/ 60_000\)/);
  assert.match(route, /INSERT OR IGNORE INTO shop_payment_events/);
  assert.match(route, /const eventKey = `webhook:\$\{errorCode\}:\$\{orderReference\.slice\(0, 64\)\}:\$\{bucket\}`/);
  assert.match(route, /authenticated\.kind\s*===\s*["']verification["']/);
  assert.ok(
    route.indexOf('authenticated.kind === "verification"') < route.indexOf("reconcilePaymentConfirmation("),
    "payOS verification probes must return before D1 reconciliation",
  );
  assert.match(route, /reconcilePaymentConfirmation\s*\(/);
  assert.match(route, /waitUntil\(dispatchTelegramPaidOrderNotifications\(/);
  assert.match(route, /telegram_paid_notification_deferred_failed/);
  assert.match(route, /PAYOS_CHECKSUM_KEY/);
  assert.match(route, /provider\s*!==\s*["']payos["']/);
  assert.match(route, /provider_not_supported/);
  assert.doesNotMatch(route, /authenticateGenericPaymentWebhook|GENERIC_PAYMENT_WEBHOOK_SECRET|CASSO_WEBHOOK_SECRET/);
  assert.doesNotMatch(route, /request\.json\s*\(/);
  assert.doesNotMatch(route, /signatureVerified\s*[:=]/);
  assert.match(read("content-migrations/0009_shop_core.sql"), /UNIQUE\s*\(provider,\s*provider_event_id\)/i);
});

test("public payOS verification probe returns 200 without touching D1", async () => {
  const route = await loadVerificationProbeRoute();
  const response = await route.POST({
    params: { provider: "payos" },
    request: new Request("https://tung.codes/api/shop/payment-webhooks/payos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, received: true, verified: true });
  assert.equal(route.routeState.reconciliationCalls, 0);
});

test("rejected payOS webhooks share a bounded minute-bucketed D1 trail key", async () => {
  const route = await loadRejectedWebhookRoute();
  const originalError = console.error;
  console.error = () => {};
  try {
    for (let index = 0; index < 3; index += 1) {
      const response = await route.POST({
        request: new Request("https://tung.codes/api/shop/payment-webhooks/payos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attempt: index }),
        }),
        params: { provider: "payos" },
      });
      assert.equal(response.status, 401);
    }
    assert.equal(route.routeState.eventKeys.size, 1);
  } finally {
    console.error = originalError;
  }
});
