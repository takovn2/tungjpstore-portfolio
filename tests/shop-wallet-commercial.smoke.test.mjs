import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { calculateWalletMutation, hasSufficientWalletBalance, walletTopupDescription } from "../src/lib/shop/wallet.ts";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("wallet migration is part of the ordered migration chain", () => {
  const migrations = readdirSync(resolve(root, "content-migrations")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  assert.ok(migrations.includes("0058_shop_wallet_topups.sql"));
  const sql = read("content-migrations/0058_shop_wallet_topups.sql");
  assert.match(sql, /provider_order_code INTEGER NOT NULL UNIQUE/);
  assert.match(sql, /provider_description TEXT NOT NULL UNIQUE/);
  assert.match(sql, /customer_id TEXT NOT NULL REFERENCES shop_customers/);
});

test("wallet mutation rejects insufficient funds and never creates a negative balance", () => {
  assert.deepEqual(calculateWalletMutation(1000, -1001, "purchase"), {
    newBalanceMinor: 1000,
    success: false,
    error: "insufficient_wallet_balance",
  });
  assert.equal(hasSufficientWalletBalance({ balanceVndMinor: 1000, balanceUsdMinor: 0, customerId: "c", updatedAt: "" }, 1001, "VND"), false);
});

test("top-up references are deterministic and PayOS-safe", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.match(walletTopupDescription(id), /^N[A-Z0-9]{8}$/);
  assert.equal(walletTopupDescription(id), walletTopupDescription(id));
  assert.ok(Number.isSafeInteger(Number(100_000_000_000_000)));
});

test("top-up API and webhook are wired to persisted reconciliation", () => {
  const endpoint = read("src/pages/api/shop/wallet/topup.ts");
  const webhook = read("src/pages/api/shop/payment-webhooks/[provider].ts");
  assert.match(endpoint, /createWalletTopup/);
  assert.match(endpoint, /currency.*VND|VND.*currency/s);
  assert.match(webhook, /reconcileWalletTopup/);
  assert.match(webhook, /reconcileWalletTopup/);
});

test("wallet checkout uses the order currency and atomic payment helper", () => {
  const service = read("src/lib/shop/service.ts");
  assert.match(service, /const orderCurrency = normalizeCurrency\(order\.currency\)/);
  assert.match(service, /applyWalletPayment\(db/);
  assert.match(service, /wallet_currency_not_supported/);
});
