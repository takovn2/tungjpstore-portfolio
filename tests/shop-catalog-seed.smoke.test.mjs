import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const migration = read("content-migrations/0020_shop_catalog_seed.sql");

const expectedPrices = new Map([
  ["chatgpt-plus", 40_000],
  ["gemini-pro", 80_000],
  ["canva", 30_000],
  ["capcut-pro", 10_000],
  ["super-grok", 19_000],
  ["netflix", 40_000],
  ["cursor-pro", 269_000],
  ["microsoft", 80_000],
  ["elevenlab", 180_000],
  ["ytb-premium", 25_000],
  ["veo3-anti", 380_000],
  ["xbox", 39_000],
  ["adobe", 49_000],
]);

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  sqlite.exec(read("content-migrations/0014_shop_inventory_operations.sql"));
  sqlite.exec(read("content-migrations/0017_shop_categories.sql"));
  return sqlite;
}

function seedOriginalChatGptDraft(sqlite, { title = "chatgpt Plut" } = {}) {
  const now = "2026-07-24T14:10:34.057Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
     metadata_json, version, published_at, created_by, updated_by, created_at, updated_at, deleted_at)
    VALUES (?, 'chatgpt-plus', 'draft', 'digital_key', 0, 0, 'vi', NULL,
      '{}', 1, NULL, 'owner', 'owner', ?, ?, NULL)`)
    .run("a7747d12-66c2-4a18-b1cd-54c2f57bbf97", now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES (?, 'vi', ?, '', ?, ?, ?, ?)`)
    .run("a7747d12-66c2-4a18-b1cd-54c2f57bbf97", title, title, title, title, title);
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
     price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
     option_values_json, metadata_json, version, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'TUNG-KEY-001', 'draft', 'license_key', 'automatic', 'tracked',
      35000, NULL, 'VND', 3000, 1000, '{}', '{}', 1, ?, ?, NULL)`)
    .run(
      "0fae287b-a044-490d-9ed4-1bd35bce2e8c",
      "a7747d12-66c2-4a18-b1cd-54c2f57bbf97",
      now,
      now,
    );
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary)
    VALUES (?, 'vi', ?, '')`)
    .run("0fae287b-a044-490d-9ed4-1bd35bce2e8c", title);
}

function assertCatalog(sqlite) {
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_categories WHERE status = 'active' AND deleted_at IS NULL").get().count, 4);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_category_localizations").get().count, 16);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_products WHERE status = 'active' AND deleted_at IS NULL").get().count, 13);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_variants WHERE status = 'active' AND deleted_at IS NULL").get().count, 13);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_product_localizations").get().count, 52);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_variant_localizations").get().count, 52);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transaction_guards").get().count, 0);

  const products = sqlite.prepare(`SELECT p.slug, p.status, p.product_type, p.metadata_json,
      v.status AS variant_status, v.fulfillment_type, v.delivery_mode, v.inventory_policy,
      v.price_minor, v.currency, v.max_per_order, v.option_values_json
    FROM shop_products p JOIN shop_variants v ON v.product_id = p.id
    WHERE p.deleted_at IS NULL AND v.deleted_at IS NULL
    ORDER BY p.sort_order`).all();
  assert.equal(products.length, expectedPrices.size);
  for (const product of products) {
    assert.equal(product.status, "active");
    assert.equal(product.product_type, "digital_key");
    assert.equal(product.variant_status, "active");
    assert.equal(product.fulfillment_type, "license_key");
    assert.equal(product.delivery_mode, "automatic");
    assert.equal(product.inventory_policy, "tracked");
    assert.equal(product.currency, "VND");
    assert.equal(product.max_per_order, 1);
    assert.equal(product.price_minor, expectedPrices.get(product.slug));
    assert.equal(JSON.parse(product.metadata_json).termMonths, 1);
    assert.equal(JSON.parse(product.option_values_json).duration, "1-month");
  }

  const localeCoverage = sqlite.prepare(`SELECT p.slug, COUNT(DISTINCT l.locale) AS locale_count,
      SUM(CASE WHEN instr(l.description, 'Tính năng nổi bật:') > 0 THEN 1 ELSE 0 END) AS vi_feature_copy
    FROM shop_products p JOIN shop_product_localizations l ON l.product_id = p.id
    WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.sort_order`).all();
  for (const row of localeCoverage) {
    assert.equal(row.locale_count, 4, `${row.slug} locale coverage`);
    assert.equal(row.vi_feature_copy, 1, `${row.slug} Vietnamese feature copy`);
  }
}

test("catalog migration seeds 13 one-month products with exact VND prices and no fake keys", () => {
  const sqlite = createDatabase();
  try {
    sqlite.exec(migration);
    assertCatalog(sqlite);

    const versionsBefore = sqlite.prepare("SELECT id, version FROM shop_products ORDER BY id").all();
    sqlite.exec(migration);
    assertCatalog(sqlite);
    assert.deepEqual(sqlite.prepare("SELECT id, version FROM shop_products ORDER BY id").all(), versionsBefore);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'shop.catalog.seeded'").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("catalog migration safely adopts the exact existing ChatGPT draft", () => {
  const sqlite = createDatabase();
  try {
    seedOriginalChatGptDraft(sqlite);
    sqlite.exec(migration);
    assertCatalog(sqlite);

    const product = sqlite.prepare("SELECT id, version, status FROM shop_products WHERE slug = 'chatgpt-plus'").get();
    const variant = sqlite.prepare("SELECT id, version, sku, price_minor FROM shop_variants WHERE product_id = ?").get(product.id);
    assert.deepEqual({ ...product }, {
      id: "a7747d12-66c2-4a18-b1cd-54c2f57bbf97",
      version: 2,
      status: "active",
    });
    assert.deepEqual({ ...variant }, {
      id: "0fae287b-a044-490d-9ed4-1bd35bce2e8c",
      version: 2,
      sku: "CHATGPT-PLUS-1M",
      price_minor: 40_000,
    });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'shop.product.seed_adopted'").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("catalog migration refuses to overwrite a modified ChatGPT draft", () => {
  const sqlite = createDatabase();
  try {
    seedOriginalChatGptDraft(sqlite, { title: "Owner edited title" });
    assert.throws(() => sqlite.exec(migration), /CHECK constraint failed/);
    assert.equal(sqlite.prepare("SELECT title FROM shop_product_localizations WHERE locale = 'vi'").get().title, "Owner edited title");
    assert.equal(sqlite.prepare("SELECT price_minor FROM shop_variants").get().price_minor, 35_000);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_products").get().count, 1);
  } finally {
    sqlite.close();
  }
});
