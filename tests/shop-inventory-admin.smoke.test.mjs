import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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

const { rewriteShopDynamicImports } = await import("./helpers/shop-inline.mjs");

async function loadShopModules() {
  const money = compile(read("src/lib/shop/money.ts"));
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const validation = compile(read("src/lib/shop/validation.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const repository = rewriteShopDynamicImports(compile(read("src/lib/shop/repository.ts"))).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${money}\n${types}\n${crypto}\n${validation}\n${repository}`);
}

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  sqlite.exec(read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql"));
  sqlite.exec(read("content-migrations/0014_shop_inventory_operations.sql"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
        async all() { return { results: statement.all(...bindings) }; },
        async run() { const result = statement.run(...bindings); return { ...result, meta: { changes: Number(result.changes) } }; },
        __run() { const result = statement.run(...bindings); return { ...result, meta: { changes: Number(result.changes) } }; },
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const result = statements.map((statement) => statement.__run()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, sqlite };
}

function seedVariant(sqlite, { fulfillmentType = "license_key", inventoryPolicy = "tracked", status = "active" } = {}) {
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('product-1', 'cloud-key', 'active', 'digital_key', 0, 0, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES ('product-1', 'vi', 'Cloud Key', '', 'Key', 'Key', 'Cloud Key', 'Key')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
     low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
    VALUES ('variant-1', 'product-1', 'CLOUD-STD', ?, ?, 'automatic', ?, 100, NULL, 'VND', 1, 10, '{}', '{}', 1, ?, ?)`).run(status, fulfillmentType, inventoryPolicy, now, now);
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES ('variant-1', 'vi', 'Standard', '')`).run();
}

test("admin inventory intake uses the preview -> chunk commit contract", () => {
  const intake = read("src/components/admin/shop/InventoryImportDialog.tsx");
  assert.match(intake, /rows: pending\.map\(\(row\) => row\.key\)/);
  assert.match(intake, /idempotencyKey: `inventory-preview:/);
  assert.match(intake, /sourceHash/);
  assert.match(intake, /preview\.batchId/);
  assert.match(intake, /shopApi<[^>]*>\("inventory\/commit"/);
  assert.match(intake, /batchId: preview\.batchId/);
  assert.match(intake, /chunkIndex/);
  assert.doesNotMatch(intake, /shopApi\("inventory\/import"/);
  assert.doesNotMatch(intake, /keys: pending\.map/);
});

test("inventory source changes invalidate a stale preview batch before commit", () => {
  const intake = read("src/components/admin/shop/InventoryImportDialog.tsx");
  // Any variant/source/text/file change must reset the preview before commit.
  assert.match(intake, /onChange=\{\(event\) => \{ setVariant\(event\.target\.value\); setPreview\(null\); \}\}/);
  assert.match(intake, /setSource\(key as "paste" \| "file"\); setPreview\(null\);/);
  assert.match(intake, /setText\(event\.target\.value\); setPreview\(null\);/);
  assert.match(intake, /setPreview\(null\);[\s\S]{0,600}const file = event\.target\.files/);

});

test("inventory importer exposes inline state, counters and commit locking", () => {
  const intake = read("src/components/admin/shop/InventoryImportDialog.tsx");
  const productDialog = read("src/components/admin/shop/ProductDialog.tsx");
  assert.match(intake, /role="alert"/);
  assert.match(intake, /shop-import-stats/);
  assert.match(intake, /\{readyCount\}<\/b><small>Hợp lệ<\/small>/);
  assert.match(intake, /readyCount \? `Nhập \$\{readyCount\} key` : "Đóng"/);
  assert.match(intake, /progress/);
  assert.match(productDialog, /role="tabpanel"/);
});

test("inventory importer blocks sensitive input until crypto readiness is confirmed", () => {
  const intake = read("src/components/admin/shop/InventoryImportDialog.tsx");
  const useShop = read("src/components/admin/shop/useShop.tsx");
  assert.match(useShop, /inventoryCryptoReady: false/);
  assert.match(useShop, /data\.cryptoReady === true/);
  assert.match(intake, /shop-crypto-readiness/);
  assert.match(intake, /if \(!cryptoReady\) throw new Error\("Chưa cấu hình khóa mã hóa Worker/);
  assert.match(intake, /disabled=\{!cryptoReady\}/);
  assert.match(intake, /Hãy cấu hình lại trước khi dán hoặc tải file chứa key/);
});

test("admin metric renders preserve prior counters across partial shop refreshes", () => {
  const useShop = read("src/components/admin/shop/useShop.tsx");
  const overviewTab = read("src/components/admin/shop/OverviewTab.tsx");
  // The overview keeps every counter in one snapshot state so a partial
  // refresh never wipes unrelated metrics.
  assert.match(useShop, /overview: Record<string, any> \| null/);
  assert.match(overviewTab, /const counts = overview\?\.counts \|\| \{\};/);
  assert.match(overviewTab, /counts\.availableKeys/);
  
});

test("inventory summary includes operator-facing labels and import eligibility", () => {
  const repository = read("src/lib/shop/repository.ts");
  const start = repository.indexOf("export async function getInventorySummary");
  const end = repository.indexOf("async function loadCheckoutVariants", start);
  assert.ok(start >= 0 && end > start);
  const summary = repository.slice(start, end);
  assert.match(summary, /product_title/);
  assert.match(summary, /variant_title/);
  assert.match(summary, /last_import_count/);
  assert.match(summary, /inventoryImportEligible/);
  assert.match(summary, /fulfillment_type === "license_key"/);
});

test("inventory migration keeps plaintext out of import metadata and records movements", () => {
  const migration = read("content-migrations/0014_shop_inventory_operations.sql");
  assert.match(migration, /shop_inventory_import_batches/);
  assert.match(migration, /shop_inventory_import_rows/);
  assert.match(migration, /shop_inventory_movements/);
  assert.doesNotMatch(migration, /^\s*(?:plaintext|license_key|raw_key)\s+TEXT/im);
  assert.match(migration, /key_fingerprint/);
});

test("inventory preview and chunk commit preserve encrypted keys and replay safely", async () => {
  const shop = await loadShopModules();
  const { db, sqlite } = createD1();
  seedVariant(sqlite);
  const context = await shop.createShopCryptoContext(Buffer.alloc(32, 0x42).toString("base64url"), "v1");
  const actor = { id: "admin-1", channel: "admin" };
  try {
    const preview = await shop.createInventoryImportPreview(db, context, {
      variantId: "variant-1",
      rows: [" KEY-A ", "KEY-B", "KEY-A"],
      sourceFormat: "txt",
      idempotencyKey: "inventory-preview-test-0001",
    }, actor, "request-preview");
    assert.equal(preview.totalRows, 3);
    assert.equal(preview.validRows, 2);
    assert.equal(preview.duplicateInFileCount, 1);
    assert.deepEqual(preview.rows.map((row) => row.status), ["valid", "valid", "duplicate_in_file"]);
    const units = await Promise.all(["KEY-A", "KEY-B"].map(async (key, index) => ({
      lineNumber: index + 1,
      unit: await shop.sealInventoryKey(context, { inventoryUnitId: `unit-${index + 1}`, variantId: "variant-1", plaintextKey: key }),
    })));
    const committed = await shop.commitInventoryImportChunk(db, { batchId: preview.batchId, chunkIndex: 0, rows: units.map(({ lineNumber }) => ({ lineNumber, key: "ignored" })) }, units, actor, "request-commit");
    assert.equal(committed.importedCount, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units").get().count, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units WHERE ciphertext_b64 LIKE '%KEY-%'").get().count, 0);
    const replay = await shop.commitInventoryImportChunk(db, { batchId: preview.batchId, chunkIndex: 0, rows: units.toReversed().map(({ lineNumber }) => ({ lineNumber, key: "ignored" })) }, units.toReversed(), actor, "request-commit-retry");
    assert.equal(replay.idempotentReplay, true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_movements").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("inventory preview rejects non-license tracked variants before creating a batch", async () => {
  const shop = await loadShopModules();
  const { db, sqlite } = createD1();
  seedVariant(sqlite, { fulfillmentType: "download", inventoryPolicy: "tracked" });
  const context = await shop.createShopCryptoContext(Buffer.alloc(32, 0x43).toString("base64url"), "v1");
  try {
    await assert.rejects(
      () => shop.createInventoryImportPreview(db, context, {
        variantId: "variant-1",
        rows: ["KEY-A"],
        sourceFormat: "txt",
        idempotencyKey: "inventory-preview-test-0002",
      }, "admin-1", "request-preview"),
      (error) => error?.code === "inventory_variant_not_eligible",
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_import_batches").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("legacy encrypted inventory inserts enforce one eligible variant and record movements", async () => {
  const shop = await loadShopModules();
  const { db, sqlite } = createD1();
  seedVariant(sqlite);
  const context = await shop.createShopCryptoContext(Buffer.alloc(32, 0x45).toString("base64url"), "v1");
  const actor = { id: "admin-legacy", channel: "admin" };
  try {
    const unit = await shop.sealInventoryKey(context, { inventoryUnitId: "legacy-unit-1", variantId: "variant-1", plaintextKey: "LEGACY-KEY-1" });
    const result = await shop.insertEncryptedInventoryUnits(db, [unit], actor, "legacy-import-1");
    assert.equal(result.variantId, "variant-1");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_movements WHERE inventory_unit_id = 'legacy-unit-1' AND event_type = 'imported'").get().count, 1);

    const mixedA = await shop.sealInventoryKey(context, { inventoryUnitId: "legacy-mixed-a", variantId: "variant-1", plaintextKey: "LEGACY-MIXED-A" });
    const mixedB = await shop.sealInventoryKey(context, { inventoryUnitId: "legacy-mixed-b", variantId: "variant-2", plaintextKey: "LEGACY-MIXED-B" });
    await assert.rejects(
      () => shop.insertEncryptedInventoryUnits(db, [mixedA, mixedB], actor, "legacy-import-mixed"),
      (error) => error?.code === "inventory_import_mixed_variant",
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("concurrent previews do not create duplicate fingerprint rows", async () => {
  const shop = await loadShopModules();
  const { db, sqlite } = createD1();
  seedVariant(sqlite);
  const context = await shop.createShopCryptoContext(Buffer.alloc(32, 0x44).toString("base64url"), "v1");
  const actor = { id: "admin-1", channel: "admin" };
  try {
    const first = await shop.createInventoryImportPreview(db, context, {
      variantId: "variant-1", rows: ["KEY-RACE"], sourceFormat: "txt", idempotencyKey: "inventory-preview-race-0001",
    }, actor, "request-1");
    const second = await shop.createInventoryImportPreview(db, context, {
      variantId: "variant-1", rows: ["KEY-RACE"], sourceFormat: "txt", idempotencyKey: "inventory-preview-race-0002",
    }, actor, "request-2");
    const makeUnits = async (id) => [{ lineNumber: 1, unit: await shop.sealInventoryKey(context, { inventoryUnitId: id, variantId: "variant-1", plaintextKey: "KEY-RACE" }) }];
    const firstResult = await shop.commitInventoryImportChunk(db, { batchId: first.batchId, chunkIndex: 0, rows: [{ lineNumber: 1, key: "KEY-RACE" }] }, await makeUnits("race-1"), actor, "commit-1");
    const secondResult = await shop.commitInventoryImportChunk(db, { batchId: second.batchId, chunkIndex: 0, rows: [{ lineNumber: 1, key: "KEY-RACE" }] }, await makeUnits("race-2"), actor, "commit-2");
    assert.equal(firstResult.importedCount, 1);
    assert.equal(secondResult.importedCount, 0);
    assert.equal(secondResult.duplicateCount, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units").get().count, 1);
  } finally {
    sqlite.close();
  }
});
