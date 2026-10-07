import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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

async function loadPayOs() {
  return importSource(compile(read("src/lib/shop/payos.ts")));
}

function canonicalPayOsData(data) {
  return Object.keys(data).sort().filter((key) => data[key] !== undefined).map((key) => {
    let value = data[key];
    if (Array.isArray(value)) value = JSON.stringify(value.map((item) => Object.fromEntries(Object.keys(item).sort().map((itemKey) => [itemKey, item[itemKey]]))));
    if (value === null || value === undefined || value === "undefined" || value === "null") value = "";
    return `${key}=${String(value)}`;
  }).join("&");
}

function paymentStatus(overrides = {}) {
  return {
    id: "paylink-status-0001",
    orderCode: 202607240001,
    amount: 120000,
    amountPaid: 120000,
    amountRemaining: 0,
    status: "PAID",
    transactions: [
      { reference: "FT-0001", amount: 70000, accountNumber: "0123456789", description: "TORDER001", occurredAt: "2026-07-24T01:00:00.000Z" },
      { reference: "FT-0002", amount: 50000, accountNumber: "0123456789", description: "TORDER001", occurredAt: "2026-07-24T01:01:00.000Z" },
    ],
    ...overrides,
  };
}

function classify(shop, payment, overrides = {}) {
  return shop.classifyPayOsSettlement({
    payment,
    providerReference: "paylink-status-0001",
    providerOrderCode: 202607240001,
    expectedAmount: 120000,
    expectedAccountNumber: "0123456789",
    expectedDescription: "TORDER001",
    expiresAt: "2026-07-24T01:30:00.000Z",
    ...overrides,
  });
}

test("signed PayOS GET status parses bounded transaction evidence", async () => {
  const shop = await loadPayOs();
  const checksumKey = "payos-checksum-key-at-least-32-bytes-long";
  const transactions = [
    {
      transactionDateTime: "2026-07-24 08:00:00",
      description: "TORDER001",
      accountNumber: "0123456789",
      amount: 120000,
      reference: "FT-GET-0001",
      counterAccountName: "Buyer",
    },
  ];
  const data = {
    status: "PAID",
    transactions,
    amountRemaining: 0,
    id: "paylink-status-0001",
    orderCode: 202607240001,
    amountPaid: 120000,
    amount: 120000,
  };
  const signature = createHmac("sha256", checksumKey).update(canonicalPayOsData(data)).digest("hex");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api-merchant.payos.vn/v2/payment-requests/202607240001");
    assert.equal(init.method, "GET");
    return new Response(JSON.stringify({ code: "00", data, signature }), { status: 200 });
  };
  try {
    const result = await shop.getPayOsPaymentLink({
      clientId: "payos-client-id-long-enough",
      apiKey: "payos-api-key-long-enough",
      checksumKey,
    }, 202607240001);
    assert.equal(result.transactions.length, 1);
    assert.deepEqual(result.transactions[0], {
      reference: "FT-GET-0001",
      amount: 120000,
      accountNumber: "0123456789",
      description: "TORDER001",
      occurredAt: "2026-07-24T01:00:00.000Z",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PayOS GET status fails closed when the response signature is invalid", async () => {
  const shop = await loadPayOs();
  const checksumKey = "payos-checksum-key-at-least-32-bytes-long";
  const data = {
    id: "paylink-status-0001",
    orderCode: 202607240001,
    amount: 120000,
    amountPaid: 120000,
    amountRemaining: 0,
    status: "PAID",
    transactions: [],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "00",
    data,
    signature: "0".repeat(64),
  }), { status: 200 });
  try {
    await assert.rejects(
      () => shop.getPayOsPaymentLink({
        clientId: "payos-client-id-long-enough",
        apiKey: "payos-api-key-long-enough",
        checksumKey,
      }, 202607240001),
      (error) => error?.message === "payos_response_signature_invalid" && error?.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PayOS settlement classifier accepts only exact, on-time, destination-matched payment", async () => {
  const shop = await loadPayOs();
  const exact = classify(shop, paymentStatus());
  assert.deepEqual(exact, {
    kind: "paid_exact",
    occurredAt: "2026-07-24T01:01:00.000Z",
    transactionReferences: ["FT-0001", "FT-0002"],
  });
  assert.equal(classify(shop, paymentStatus({ status: "PROCESSING" })).kind, "pending");
  assert.equal(classify(shop, paymentStatus({
    status: "CANCELLED",
    amountPaid: 0,
    amountRemaining: 120000,
    transactions: [],
  })).kind, "terminal_unpaid");
  assert.equal(classify(shop, paymentStatus({
    status: "CANCELLED",
    amountPaid: 50000,
    amountRemaining: 70000,
  })).kind, "inconsistent", "terminal status with transaction evidence requires manual review");
  assert.equal(classify(shop, paymentStatus({ amountPaid: 50000, amountRemaining: 70000 })).kind, "partial");
  assert.equal(classify(shop, paymentStatus({ amountPaid: 120001, amountRemaining: 0 })).kind, "overpaid");
  // Late bank postings still settle when payOS reports PAID (countdown is UX, not a hard gate).
  assert.equal(classify(shop, paymentStatus({
    transactions: paymentStatus().transactions.map((transaction) => ({ ...transaction, occurredAt: "2026-07-24T01:31:00.000Z" })),
  })).kind, "paid_exact");
  assert.equal(classify(shop, paymentStatus({
    transactions: paymentStatus().transactions.map((transaction, index) => ({ ...transaction, occurredAt: `2026-07-24T00:5${index + 8}:00.000Z` })),
  }), { expiresAt: "2026-07-24T01:00:00.000Z" }).kind, "paid_exact");
  // Counterparty/merchant account fields vary by bank — no longer hard identity failures.
  assert.equal(classify(shop, paymentStatus({
    transactions: [{ ...paymentStatus().transactions[0], amount: 120000, accountNumber: "9999999999" }],
  })).kind, "paid_exact");
  // Wrong transfer content still rejects.
  assert.equal(classify(shop, paymentStatus({
    transactions: [{ ...paymentStatus().transactions[0], amount: 120000, description: "WRONGCODE1" }],
  })).kind, "identity_mismatch");
  // Bank statement noise must not hide the exact high-entropy transfer code.
  assert.equal(classify(shop, paymentStatus({
    transactions: [{ ...paymentStatus().transactions[0], amount: 120000, description: "FT 123456 TORDER001 KLB" }],
  })).kind, "paid_exact");
  // PAID with empty transactions is accepted (some channels omit the array).
  assert.equal(classify(shop, paymentStatus({ transactions: [] })).kind, "paid_exact");
  const expiredAt = "2026-07-24T01:00:00.000Z";
  assert.equal(shop.payOsPaymentOccurredWithinRecoveryWindow("2026-07-24T01:59:59.000Z", expiredAt), true);
  assert.equal(shop.payOsPaymentOccurredWithinRecoveryWindow("2026-07-24T02:00:00.000Z", expiredAt), false);
});

test("maintenance fallback is bounded and runs signed reconciliation before expiry", () => {
  const service = read("src/lib/shop/service.ts");
  const repository = read("src/lib/shop/repository.ts");
  const migration = read("content-migrations/0012_payos_reconciliation_guards.sql");
  assert.match(service, /PAYOS_RECONCILIATION_LIMIT = 24/);
  assert.match(service, /PAYOS_INTERACTIVE_RETRY_SECONDS = 15/);
  assert.match(service, /targetOrderId \? 1 : PAYOS_RECONCILIATION_LIMIT/);
  assert.match(service, /PAYOS_RECONCILIATION_CONCURRENCY = 4/);
  assert.match(service, /PAYOS_ORPHAN_RECOVERY_LIMIT = 4/);
  assert.match(service, /PAYMENT_EXPIRY_SWEEP_LIMIT = 100/);
  assert.match(service, /RESERVATION_EXPIRY_SWEEP_LIMIT = 50/);
  assert.match(service, /SHOP_MAINTENANCE_D1_QUERY_LIMIT = 1_000/);
  const reconciliationLimit = Number(service.match(/PAYOS_RECONCILIATION_LIMIT = (\d+)/)?.[1]);
  const orphanRecoveryLimit = Number(service.match(/PAYOS_ORPHAN_RECOVERY_LIMIT = (\d+)/)?.[1]);
  const paymentExpiryLimit = Number(service.match(/PAYMENT_EXPIRY_SWEEP_LIMIT = (\d+)/)?.[1]);
  const reservationExpiryLimit = Number(service.match(/RESERVATION_EXPIRY_SWEEP_LIMIT = (\d+)/)?.[1]);
  const worstCaseStatements = 1 + reconciliationLimit * 14 + orphanRecoveryLimit * 5 + 1 + paymentExpiryLimit * 2 + 1 + reservationExpiryLimit * 7 + 1 + 1;
  assert.equal(worstCaseStatements, 911);
  assert.ok(worstCaseStatements <= 1_000, `maintenance budget is ${worstCaseStatements} D1 statements`);
  assert.match(service, /getPayOsPaymentLink\(/);
  assert.match(service, /createVietQrPayment\(bindings,[\s\S]*system:payos-link-recovery/);
  assert.doesNotMatch(service, /AND pa\.provider_reference IS NOT NULL/);
  assert.match(service, /candidate\.provider_reference \?\? payment\.id/);
  assert.match(service, /classifyPayOsSettlement\(/);
  assert.match(service, /providerEventId: `status:\$\{payloadHash\}`/);
  assert.match(service, /destinationAccountNumber: expectedAccountNumber/);
  assert.match(service, /COALESCE\(pa\.reconciliation_attempted_at, pa\.created_at\)/);
  assert.match(service, /async function claimPayOsReconciliationCheck\(/);
  assert.match(service, /UPDATE shop_payment_attempts[\s\S]*SET reconciliation_attempted_at = \?[\s\S]*reconciliation_attempted_at IS NULL[\s\S]*PAYOS_INTERACTIVE_RETRY_SECONDS/);
  assert.match(service, /if \(!await claimPayOsReconciliationCheck\(db, candidate\.id, checkedAt\)\)[\s\S]*getPayOsPaymentLink\(credentials, orderCode\)/);
  assert.match(service, /if \(result\.skipped\) continue/);
  assert.match(service, /recordPayOsReconciliationCheck\(db, result\.candidate\.id, checkedAt/);
  assert.match(service, /expiryAuthorized = decision\.kind === "terminal_unpaid"[\s\S]*checkedAt >= reconciliationDeadline/);
  assert.doesNotMatch(service, /expiryAuthorized\s*=.*decision\.kind === "late"/);
  assert.match(service, /recordPayOsPaymentAttention\(db/);
  assert.match(service, /snapshot:\$\{result\.candidate\.id\}/);
  assert.doesNotMatch(read("src/lib/shop/payos.ts"), /payos_get_signature_mismatch_bypassed/);
  assert.match(read("src/lib/shop/payos.ts"), /payos_response_signature_invalid[\s\S]*throw new PayOsRequestError/);
  assert.match(service, /sortedTransactions\[0\]\?\.occurredAt \?\? checkedAt/);
  assert.match(service, /recordPayOsReconciliationCheck\(db, result\.candidate\.id, checkedAt, expiryAuthorized\)/);
  assert.match(service, /Date\.parse\(attempt\.expires_at\) <= Date\.now\(\)\) return "confirming"/);
  assert.match(service, /expiresAt: state === "confirming"[\s\S]*reconciliationDeadline/);
  assert.match(repository, /INSERT OR IGNORE INTO shop_payment_events[\s\S]*'payment\.attention'/);
  assert.match(service, /const idempotencyKeys = await cleanupExpiredIdempotencyKeys\(db\)/);
  assert.match(service, /return \{ payOs, payments, reservations, idempotencyKeys, rateLimits:/);
  assert.match(repository, /Math\.max\(1, Math\.min\(500, Math\.floor\(limit\)\)\)/);
  assert.doesNotMatch(service, /PAYOS_LATE_LOOKBACK|recentExpiryCutoff|pa\.expires_at > \?/);
  assert.match(repository, /PAYOS_RECONCILIATION_GRACE_SECONDS/);
  assert.match(repository, /unixepoch\(reconciliation_checked_at\) >= unixepoch\(expires_at\) \+ \?/);
  assert.match(repository, /NOT EXISTS \([\s\S]*confirmation_provider = 'payos'[\s\S]*status IN \('created', 'awaiting_payment'\)/);
  assert.match(migration, /reconciliation_attempted_at/);
  assert.match(migration, /reconciliation_checked_at/);
  assert.ok(service.indexOf("reconcilePendingPayOsPayments(bindings)") < service.indexOf("expirePaymentAttempts(db, PAYMENT_EXPIRY_SWEEP_LIMIT)"));
});
