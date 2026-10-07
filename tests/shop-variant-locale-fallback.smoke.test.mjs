import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Storefront variant titles must fall back to the product's own `default_locale`,
 * never to a hardcoded 'vi'.
 *
 * The variant fallback joins used to be pinned to 'vi'. That was invisible while
 * every product was authored in Vietnamese, and it breaks the moment a product
 * is authored in another language: a Japanese visitor would see Vietnamese copy
 * even though an English source-of-truth row exists. Going global requires the
 * fallback to follow the product, so these queries are asserted here.
 *
 * The admin inventory view is the one deliberate exception: it pins 'vi' on
 * purpose so a Vietnamese operator sees one language per table.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

const now = new Date().toISOString();
const productId = "prd-fallback-en-0001";
const variantId = "var-fallback-en-0001";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of ["0001_content_cms.sql", "0009_shop_core.sql", "0017_shop_categories.sql"]) {
    sqlite.exec(read(`content-migrations/${migration}`));
  }

  // Product authored in English, with Vietnamese copy also present. Requesting
  // 'ja' must resolve to 'en' (the product's default), never to 'vi'.
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'variant-fallback-fixture', 'active', 'digital_key', 1, 1, 'en', '{}', 1, ?, 'test', 'test', ?, ?)`
  ).run(productId, now, now, now);
  for (const [locale, title] of [["en", "English title"], ["vi", "Tiêu đề tiếng Việt"]]) {
    sqlite.prepare(`INSERT INTO shop_product_localizations
      (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
      VALUES (?, ?, ?, 'eyebrow', 'short', 'description', 'seo', 'seo')`).run(productId, locale, title);
  }
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
     price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
     option_values_json, metadata_json, version, created_at, updated_at)
    VALUES (?, ?, 'FALLBACK-EN-1', 'active', 'license_key', 'automatic', 'unlimited',
     100000, NULL, 'VND', 0, 1, '{}', '{}', 1, ?, ?)`
  ).run(variantId, productId, now, now);
  for (const [locale, title] of [["en", "English variant"], ["vi", "Biến thể tiếng Việt"]]) {
    sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title)
      VALUES (?, ?, ?)`).run(variantId, locale, title);
  }
  return sqlite;
}

/** Pulls a real query out of repository.ts so the test exercises production SQL. */
function extractQuery(source, marker, idReplacement) {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `query marker missing from repository.ts: ${marker}`);
  // Delimit by the surrounding backticks, not by "SELECT": these queries contain
  // nested `SELECT COUNT(*)` subqueries that would be found first.
  const open = source.lastIndexOf("`", at);
  assert.notEqual(open, -1, `no opening backtick before marker: ${marker}`);
  const end = source.indexOf("`", at);
  assert.notEqual(end, -1, `unterminated template literal at marker: ${marker}`);
  assert.ok(open < at && at < end, `marker must sit inside one template literal: ${marker}`);
  return source.slice(open + 1, end).replace(/\$\{[^}]*\}/g, `'${idReplacement}'`);
}

test("storefront variant fallback follows product default_locale, not a hardcoded vi", () => {
  const source = read("src/lib/shop/repository.ts");
  const sqlite = createDb();
  const locale = "ja";

  const cases = [
    {
      name: "catalog list",
      marker: "WHERE v.product_id IN (${idList(productIds)})",
      id: productId,
      bindings: [locale],
      expectVariant: "English variant",
    },
    {
      name: "single product",
      marker: "WHERE v.product_id = ? AND v.status = 'active' AND v.deleted_at IS NULL",
      id: productId,
      bindings: [locale, productId],
      expectVariant: "English variant",
    },
    {
      name: "variant context",
      marker: "WHERE v.id = ? AND v.status = 'active' AND v.deleted_at IS NULL",
      id: variantId,
      bindings: [locale, locale, variantId],
      expectVariant: "English variant",
      expectProduct: "English title",
    },
    {
      name: "checkout variants",
      marker: "WHERE v.id IN (${idList(ids)})",
      id: variantId,
      bindings: [locale, locale],
      expectVariant: "English variant",
      expectProduct: "English title",
    },
  ];

  for (const item of cases) {
    const sql = extractQuery(source, item.marker, item.id);
    const fallbackAlias = sql.match(/(\w+)\.title AS fallback_variant_title/)?.[1];
    assert.ok(fallbackAlias, `${item.name}: could not resolve the variant fallback alias`);
    const fallbackJoin = sql
      .split("\n")
      .map((line) => line.trim())
      .find((line) => new RegExp(`shop_variant_localizations\\s+${fallbackAlias}\\s+ON`).test(line));
    assert.ok(fallbackJoin, `${item.name}: could not locate the variant fallback join`);
    assert.doesNotMatch(fallbackJoin, /locale = 'vi'/, `${item.name}: variant fallback must not be pinned to 'vi'`);
    assert.match(fallbackJoin, /locale = p\.default_locale/, `${item.name}: variant fallback must use p.default_locale`);
    const row = sqlite.prepare(sql).get(...item.bindings);
    assert.ok(row, `${item.name}: expected a row`);
    assert.equal(row.variant_title, null, `${item.name}: no ja variant copy should exist`);
    assert.equal(row.fallback_variant_title, item.expectVariant, `${item.name}: wrong variant fallback`);
    assert.notEqual(row.fallback_variant_title, "Biến thể tiếng Việt", `${item.name}: fell back to vi`);
    if (item.expectProduct) {
      assert.equal(row.product_title, null, `${item.name}: no ja product copy should exist`);
      assert.equal(row.fallback_product_title, item.expectProduct, `${item.name}: wrong product fallback`);
    }
  }
});

test("admin inventory view is the only deliberate vi pin and is documented as such", () => {
  const source = read("src/lib/shop/repository.ts");
  const pinned = [...source.matchAll(/locale = 'vi'/g)];
  assert.equal(pinned.length, 2, "only the two admin inventory joins may pin 'vi'");
  const adminBlock = extractQuery(source, "GROUP BY v.id, v.product_id, v.sku, v.status", productId);
  assert.match(adminBlock, /pl\.product_id = p\.id AND pl\.locale = 'vi'/);
  assert.match(adminBlock, /vl\.variant_id = v\.id AND vl\.locale = 'vi'/);
  assert.match(
    source,
    /Admin-only inventory view\. Pinned to 'vi' deliberately/,
    "the admin exception must stay documented in place",
  );
});
