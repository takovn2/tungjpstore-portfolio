import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

async function bundleModule(entryPoint) {
  const result = await build({
    entryPoints: [`${projectRoot}/${entryPoint}`],
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

function method(overrides = {}) {
  return {
    id: "crypto-method-1",
    provider: "bybit",
    rail: "onchain_deposit",
    asset: "USDT",
    network: "TRC20",
    destinationType: "wallet_address",
    destinationValue: "TMerchantWallet0000000000000000001",
    memoOrTag: "",
    displayName: "USDT TRC20",
    status: "active",
    minConfirmations: 1,
    expiryMinutes: 30,
    sortOrder: 0,
    version: 1,
    ...overrides,
  };
}

test("crypto migration is additive and idempotent", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  const migration = read("content-migrations/0042_shop_crypto_payments.sql");
  sqlite.exec(migration);
  sqlite.exec(migration);
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'shop_crypto_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, ["shop_crypto_payment_attempts", "shop_crypto_payment_events", "shop_crypto_payment_methods"]);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_live_order/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_shop_crypto_attempt_provider_reference/);
  sqlite.close();
});

test("crypto amount and network normalization fail closed on precision loss", async () => {
  const crypto = await bundleModule("src/lib/shop/providers/crypto.ts");
  assert.equal(crypto.normalizeAtomic("12.340000"), "12340000");
  assert.equal(crypto.normalizeAtomic("12.3400001"), null);
  assert.equal(crypto.normalizeNetwork("BEP-20"), "BSC");
  assert.equal(crypto.normalizeNetwork("TRC20"), "TRON");
  assert.equal(crypto.parseConfirmations("2/15"), 2);
});

test("crypto provider readiness checks the matching secret pair only", async () => {
  const crypto = await bundleModule("src/lib/shop/providers/crypto.ts");
  const bindings = {
    BYBIT_API_KEY: "bybit-key",
    BYBIT_API_SECRET: "bybit-secret-long-enough",
    BINANCE_API_KEY: "",
    BINANCE_API_SECRET: "",
  };
  assert.equal(crypto.isCryptoProviderConfigured(bindings, "bybit"), true);
  assert.equal(crypto.isCryptoProviderConfigured(bindings, "binance"), false);
  assert.equal(crypto.isCryptoProviderConfigured({ ...bindings, BYBIT_API_SECRET: "short" }, "bybit"), false);
});

test("Bybit evidence uses signed queries and exact destination data", async () => {
  const bybit = await bundleModule("src/lib/shop/providers/bybit.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/v5/asset/deposit/query-record");
    assert.equal(parsed.searchParams.get("txID"), null, "Bybit query-record does not accept txID; filter locally");
    assert.equal(init.headers["X-BAPI-API-KEY"], "bybit-key");
    return new Response(JSON.stringify({
      retCode: 0,
      result: { rows: [{ amount: "12.34", chain: "TRX", status: "2", txID: "tx-1", toAddress: "TMerchantWallet0000000000000000001", successAt: "1760000000000" }] },
    }), { status: 200 });
  };
  try {
    const evidence = await bybit.listBybitCryptoEvidence({ BYBIT_API_KEY: "bybit-key", BYBIT_API_SECRET: "bybit-secret-long-enough" }, {
      method: method(),
      transactionReference: "tx-1",
      startTimeMs: 1759990000000,
      endTimeMs: 1760010000000,
    });
    assert.equal(evidence[0].amountAtomic, "12340000");
    assert.equal(evidence[0].network, "TRX");
    assert.equal(evidence[0].destination, "TMerchantWallet0000000000000000001");
    assert.equal(evidence[0].status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bybit internal deposits use the configured recipient UID when the API omits it", async () => {
  const bybit = await bundleModule("src/lib/shop/providers/bybit.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/v5/asset/deposit/query-internal-record");
    return new Response(JSON.stringify({
      retCode: 0,
      result: { rows: [{ amount: "12.34", status: 2, txID: "internal-1", fromMemberId: "sender-uid", createdTime: "1760000000000" }] },
    }), { status: 200 });
  };
  try {
    const evidence = await bybit.listBybitCryptoEvidence({ BYBIT_API_KEY: "bybit-key", BYBIT_API_SECRET: "bybit-secret-long-enough" }, {
      method: method({ rail: "internal_uid", destinationType: "uid", destinationValue: "merchant-uid" }),
      startTimeMs: 1759990000000,
      endTimeMs: 1760010000000,
    });
    assert.equal(evidence[0].destination, "merchant-uid");
    assert.equal(evidence[0].sender, "sender-uid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Binance deposit evidence parses confirmation ratios and network aliases", async () => {
  const binance = await bundleModule("src/lib/shop/providers/binance.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/sapi/v1/capital/deposit/hisrec");
    assert.equal(parsed.searchParams.get("txId"), "tx-2");
    assert.equal(init.headers["X-MBX-APIKEY"], "binance-key");
    return new Response(JSON.stringify([{ amount: "10", network: "BSC", status: 1, txId: "tx-2", address: "0xMerchant00000000000000000000000000000001", confirmTimes: "1/15", insertTime: 1760000000000 }]), { status: 200 });
  };
  try {
    const evidence = await binance.listBinanceCryptoEvidence({ BINANCE_API_KEY: "binance-key", BINANCE_API_SECRET: "binance-secret-long-enough" }, {
      method: method({ provider: "binance", network: "BEP20", destinationValue: "0xMerchant00000000000000000000000000000001" }),
      transactionReference: "tx-2",
      startTimeMs: 1759990000000,
      endTimeMs: 1760010000000,
    });
    assert.equal(evidence[0].amountAtomic, "10000000");
    assert.equal(evidence[0].network, "BSC");
    assert.equal(evidence[0].confirmations, 1);
    assert.equal(evidence[0].status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
