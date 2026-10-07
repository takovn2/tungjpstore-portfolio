import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * FX rates and pricing-settings wiring.
 *
 * The rate used to be three hardcoded tables in three modules, each stamped
 * "updated 2026-07-25" and disagreeing with each other (ja resolved to JPY in
 * one and USD in another). Rates now live in `shop_fx_rates` with a provider and
 * an `as_of`, and `getShopPricingSettings` prefers them over the legacy scalar
 * while still falling back to it.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stripImports = (source) => source.replace(/^import[\s\S]*?;\s*/gm, "");
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { rewriteShopDynamicImports } = await import("./helpers/shop-inline.mjs");

async function loadFx() {
  const money = compile(read("src/lib/shop/money.ts"));
  const fx = stripImports(compile(read("src/lib/shop/fx.ts")));
  return importSource(`${money}\n${fx}`);
}

async function loadRepository() {
  const money = compile(read("src/lib/shop/money.ts"));
  const types = compile(read("src/lib/shop/types.ts"));
  const cryptoSource = stripImports(compile(read("src/lib/shop/crypto.ts")));
  const validation = stripImports(compile(read("src/lib/shop/validation.ts")));
  const repository = stripImports(rewriteShopDynamicImports(compile(read("src/lib/shop/repository.ts"))));
  const payosStubs = `
    const PAYOS_RECONCILIATION_GRACE_SECONDS = 900;
    const payOsPaymentOccurredWithinRecoveryWindow = () => false;
    const payOsTransferDescriptionMatches = () => false;
  `;
  return importSource(`${money}\n${types}\n${cryptoSource}\n${validation}\n${payosStubs}\n${repository}`);
}

function createD1(migrations) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) sqlite.exec(read(`content-migrations/${migration}`));

  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
        async all() { return { results: statement.all(...bindings) }; },
        async run() {
          const result = statement.run(...bindings);
          return { ...result, meta: { changes: Number(result.changes) } };
        },
        __run() {
          const result = statement.run(...bindings);
          return { ...result, meta: { changes: Number(result.changes) } };
        },
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.__run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    sqlite,
  };
}

const BASE_MIGRATIONS = ["0001_content_cms.sql", "0009_shop_core.sql", "0043_shop_currency_pricing.sql"];
const WITH_FX = [...BASE_MIGRATIONS, "0053_shop_fx_rates.sql"];
// Everything createCheckoutOrder touches: idempotency keys, payment attempts,
// inventory operations, outbox leases.
const CHECKOUT_MIGRATIONS = [
  "0001_content_cms.sql", "0009_shop_core.sql", "0011_payos_payment_link_fields.sql",
  "0012_payos_reconciliation_guards.sql", "0013_shop_idempotency_and_outbox_leases.sql",
  "0014_shop_inventory_operations.sql", "0016_shop_telegram_recipients.sql",
  "0017_shop_categories.sql", "0018_shop_telegram_recipient_identity.sql",
  "0019_shop_email_outbox.sql", "0025_payos_dynamic_accounts.sql",
  "0043_shop_currency_pricing.sql", "0053_shop_fx_rates.sql",
];

test("migration 0053 seeds the VND/USD rate from the legacy settings row", () => {
  const { sqlite } = createD1(WITH_FX);
  const row = sqlite.prepare("SELECT rate_scaled, rate_scale, provider FROM shop_fx_rates WHERE from_currency = 'VND' AND to_currency = 'USD'").get();
  assert.ok(row, "the FX table must be populated from day one");
  assert.equal(row.rate_scaled, 25_500 * 1_000_000);
  assert.equal(row.provider, "manual");
});

test("the FX table accepts any currency pair, unlike the legacy schema", () => {
  const { sqlite } = createD1(WITH_FX);
  const now = new Date().toISOString();
  for (const [from, to, rate] of [["USD", "PHP", 56], ["USD", "JPY", 150], ["VND", "USD", 25_500]]) {
    // OR REPLACE because 0053 already seeds VND/USD from the legacy settings row.
    sqlite.prepare(`INSERT OR REPLACE INTO shop_fx_rates
      (from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, fetched_at, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, 1000000, 'manual', ?, ?, 'test', ?, ?)`)
      .run(from, to, rate * 1_000_000, now, now, now, now);
  }
  const pairs = sqlite.prepare("SELECT from_currency || '/' || to_currency AS pair FROM shop_fx_rates ORDER BY pair").all();
  assert.deepEqual(pairs.map((row) => row.pair), ["USD/JPY", "USD/PHP", "VND/USD"]);
  // The legacy schema cannot express any of this.
  assert.throws(() => sqlite.prepare("UPDATE shop_currency_settings SET base_currency = 'USD' WHERE id = 'default'").run(), /CHECK/);
});

test("freshness is classified from as_of, not from fetch time", async () => {
  const { fxFreshness, isStale, FX_STALE_AFTER_MS, FX_EXPIRED_AFTER_MS } = await loadFx();
  const now = Date.parse("2026-08-29T00:00:00.000Z");
  const at = (ms) => new Date(now - ms).toISOString();

  assert.equal(fxFreshness({ asOf: at(0) }, now), "fresh");
  assert.equal(fxFreshness({ asOf: at(FX_STALE_AFTER_MS + 1) }, now), "stale");
  assert.equal(fxFreshness({ asOf: at(FX_EXPIRED_AFTER_MS + 1) }, now), "expired");
  assert.equal(fxFreshness(null, now), "unknown");
  assert.equal(fxFreshness({ asOf: "not-a-date" }, now), "unknown");
  // A provider clock slightly ahead of ours is not treated as expired.
  assert.equal(fxFreshness({ asOf: at(-30_000) }, now), "fresh");

  assert.equal(isStale({ asOf: at(0) }, now), false);
  assert.equal(isStale({ asOf: at(FX_STALE_AFTER_MS + 1) }, now), true);
  assert.equal(isStale(null, now), true, "an absent rate must be reported, not assumed fresh");
});

test("spread widens a rate in the merchant's favour", async () => {
  const { applySpread } = await loadFx();
  assert.equal(applySpread(1_000_000, 0), 1_000_000);
  assert.equal(applySpread(1_000_000, 250), 1_025_000, "250 bps is 2.5%");
  assert.equal(applySpread(25_500 * 1_000_000, 200), 26_010_000_000);
  assert.throws(() => applySpread(0, 100), /invalid_rate/);
  assert.throws(() => applySpread(1_000_000, -1), /invalid_spread/);
  assert.throws(() => applySpread(1_000_000, 20_000), /invalid_spread/);
});

test("rates round-trip through D1 and keep their provider and timestamp", async () => {
  const fx = await loadFx();
  const db = createD1(WITH_FX);
  const asOf = "2026-08-29T00:00:00.000Z";

  assert.equal(await fx.getFxRate(db, "USD", "PHP"), null, "no rate seeded for this pair yet");

  const stored = await fx.putFxRate(db, {
    fromCurrency: "USD", toCurrency: "PHP", rateScaled: 56_000_000, provider: "open-er-api", asOf, changedBy: "test",
  });
  assert.equal(stored.provider, "open-er-api");
  assert.equal(stored.asOf, asOf);

  const fetched = await fx.getFxRate(db, "usd", "php");
  assert.equal(fetched.rateScaled, 56_000_000, "lookup is case-insensitive");

  const all = await fx.listFxRates(db);
  assert.ok(all.some((rate) => rate.fromCurrency === "USD" && rate.toCurrency === "PHP"));

  // History is appended, so a rate change stays auditable.
  await fx.putFxRate(db, { fromCurrency: "USD", toCurrency: "PHP", rateScaled: 57_000_000, provider: "open-er-api", asOf, changedBy: "test" });
  const history = db.sqlite.prepare("SELECT COUNT(*) AS n FROM shop_fx_rate_history WHERE from_currency = 'USD' AND to_currency = 'PHP'").get();
  assert.equal(history.n, 2);

  // putFxRate is async, so these are rejections rather than synchronous throws.
  await assert.rejects(() => fx.putFxRate(db, { fromCurrency: "USD", toCurrency: "USD", rateScaled: 1, provider: "manual", asOf, changedBy: "test" }), /fx_same_currency/);
  await assert.rejects(() => fx.putFxRate(db, { fromCurrency: "USD", toCurrency: "PHP", rateScaled: 1, provider: "manual", asOf: "not-a-date", changedBy: "test" }), /invalid_as_of/);
  await assert.rejects(() => fx.putFxRate(db, { fromCurrency: "USD", toCurrency: "PHP", rateScaled: 0, provider: "manual", asOf, changedBy: "test" }), /invalid_rate/);
});

test("pricing settings prefer the FX table and fall back cleanly", async () => {
  const repo = await loadRepository();

  // With 0053 applied: the FX rate wins over the legacy scalar.
  const modern = createD1(WITH_FX);
  const now = new Date().toISOString();
  modern.sqlite.prepare(`INSERT INTO shop_fx_rates
    (from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, fetched_at, updated_by, created_at, updated_at)
    VALUES ('VND','USD', ?, 1000000, 'open-er-api', ?, ?, 'test', ?, ?)
    ON CONFLICT (from_currency, to_currency) DO UPDATE SET rate_scaled = excluded.rate_scaled`)
    .run(27_000 * 1_000_000, now, now, now, now);
  const settings = await repo.getShopPricingSettings(modern);
  assert.equal(settings.usdVndRateScaled, 27_000 * 1_000_000, "a provider rate must override the legacy scalar");
  assert.equal(settings.baseCurrency, "VND", "the legacy row still supplies the rest of the shape");

  // Without 0053: the legacy table must still drive pricing.
  const legacyOnly = createD1(BASE_MIGRATIONS);
  const legacySettings = await repo.getShopPricingSettings(legacyOnly);
  assert.equal(legacySettings.usdVndRateScaled, 25_500 * 1_000_000);

  // With neither: documented default, never a crash.
  const bare = createD1(["0001_content_cms.sql", "0009_shop_core.sql"]);
  const bareSettings = await repo.getShopPricingSettings(bare);
  assert.equal(bareSettings.usdVndRateScaled, 25_500 * 1_000_000);
  assert.equal(bareSettings.updatedBy, "fallback");
});

test("an admin rate edit reaches both tables so the two cannot diverge", async () => {
  const repo = await loadRepository();
  const db = createD1(WITH_FX);

  const updated = await repo.updateShopPricingSettings(db, { usdVndRateScaled: 26_000 * 1_000_000 }, "test", "req-1");
  assert.equal(updated.usdVndRateScaled, 26_000 * 1_000_000);

  const fxRow = db.sqlite.prepare("SELECT rate_scaled FROM shop_fx_rates WHERE from_currency = 'VND' AND to_currency = 'USD'").get();
  assert.equal(fxRow.rate_scaled, 26_000 * 1_000_000, "the mirror must land, or the edit is silently ignored");

  const legacyRow = db.sqlite.prepare("SELECT usd_vnd_rate_scaled FROM shop_currency_settings WHERE id = 'default'").get();
  assert.equal(legacyRow.usd_vnd_rate_scaled, 26_000 * 1_000_000);
});

test("an admin rate edit still works on a database without migration 0053", async () => {
  const repo = await loadRepository();
  const db = createD1(BASE_MIGRATIONS);

  const updated = await repo.updateShopPricingSettings(db, { usdVndRateScaled: 26_500 * 1_000_000 }, "test", "req-2");
  assert.equal(updated.usdVndRateScaled, 26_500 * 1_000_000, "a missing FX table must not break the admin control");
});

function seedSnapshotProduct(sqlite) {
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('product-1', 'cloud-key', 'active', 'digital_key', 1, 0, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`)
    .run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES ('product-1', 'vi', 'Cloud Key', 'Digital', 'A clear key.', 'A complete digital key.', 'Cloud Key — TUNG', 'A clear digital key.')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
     low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
    VALUES ('variant-1', 'product-1', 'CLOUD-STD', 'active', 'license_key', 'automatic', 'tracked', 120000, 150000, 'VND', 1, 10, '{}', '{}', 1, ?, ?)`)
    .run(now, now);
  sqlite.prepare("INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES ('variant-1', 'vi', 'Standard', '')").run();
  const fakeCiphertext = Buffer.alloc(24, 1).toString("base64url");
  const iv = Buffer.alloc(12, 2).toString("base64url");
  const wrapped = Buffer.alloc(48, 3).toString("base64url");
  sqlite.prepare(`INSERT INTO shop_inventory_units
    (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
     key_fingerprint, imported_by, imported_at, updated_at)
    VALUES ('inventory-1', 'variant-1', 'available', 'aes-256-gcm-envelope-v1', 'v1', ?, ?, ?, ?, ?, 'test', ?, ?)`)
    .run(fakeCiphertext, iv, wrapped, iv, Buffer.alloc(32, 10).toString("base64url"), now, now);
}

test("an order snapshots the market and the provenance of the rate it used", async () => {
  const repo = await loadRepository();
  const db = createD1(CHECKOUT_MIGRATIONS);
  seedSnapshotProduct(db.sqlite);
  const asOf = "2026-08-28T00:00:00.000Z";
  db.sqlite.prepare(`UPDATE shop_fx_rates SET provider = 'open-er-api', as_of = ? WHERE from_currency = 'VND' AND to_currency = 'USD'`).run(asOf);

  const order = await repo.createCheckoutOrder(db, {
    customer: { email: "audit@example.com", displayName: "Audit Buyer", locale: "en" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "en",
    sourceChannel: "web",
    pricingCurrency: "USD",
    marketCode: "GLOBAL",
  }, "audit-checkout-1", { id: "buyer", channel: "web" }, "audit-request-1");

  const metadata = JSON.parse(db.sqlite.prepare("SELECT metadata_json FROM shop_orders WHERE id = ?").get(order.orderId).metadata_json);
  assert.equal(metadata.pricing.marketCode, "GLOBAL", "the market that produced the price must be recorded");
  assert.equal(metadata.pricing.fxProvider, "open-er-api", "which source produced the rate");
  assert.equal(metadata.pricing.fxAsOf, asOf, "when that rate was observed, not when the order was placed");
  assert.equal(metadata.pricing.usdVndRate, 25_500);
});

test("an order without a market, or on an unmigrated database, records nulls rather than failing", async () => {
  const repo = await loadRepository();
  const withFx = createD1(CHECKOUT_MIGRATIONS);
  seedSnapshotProduct(withFx.sqlite);
  const legacy = await repo.createCheckoutOrder(withFx, {
    customer: { email: "legacy@example.com", displayName: "Legacy Buyer", locale: "en" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "en",
    sourceChannel: "web",
    pricingCurrency: "USD",
  }, "legacy-checkout-1", { id: "buyer", channel: "web" }, "legacy-request-1");
  const metadata = JSON.parse(withFx.sqlite.prepare("SELECT metadata_json FROM shop_orders WHERE id = ?").get(legacy.orderId).metadata_json);
  assert.equal(metadata.pricing.marketCode, null);

  const noFx = createD1(CHECKOUT_MIGRATIONS.filter((name) => name !== "0053_shop_fx_rates.sql"));
  seedSnapshotProduct(noFx.sqlite);
  const bare = await repo.createCheckoutOrder(noFx, {
    customer: { email: "bare@example.com", displayName: "Bare Buyer", locale: "en" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "en",
    sourceChannel: "web",
    pricingCurrency: "USD",
    marketCode: "GLOBAL",
  }, "bare-checkout-1", { id: "buyer", channel: "web" }, "bare-request-1");
  const bareMetadata = JSON.parse(noFx.sqlite.prepare("SELECT metadata_json FROM shop_orders WHERE id = ?").get(bare.orderId).metadata_json);
  assert.equal(bareMetadata.pricing.marketCode, "GLOBAL");
  assert.equal(bareMetadata.pricing.fxProvider, null, "missing FX table records nulls, it does not fail the checkout");
});
