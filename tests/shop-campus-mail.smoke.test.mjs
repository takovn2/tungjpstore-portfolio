import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("campus mail seed creates three fictional .edu variants", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  sqlite.exec(read("content-migrations/0051_shop_campus_mail.sql"));

  const product = sqlite.prepare("SELECT slug, featured, sort_order, status FROM shop_products WHERE id = ?").get("catalog-product-campus-mail");
  assert.equal(product.slug, "campus-mail");
  assert.equal(product.status, "active");
  assert.equal(product.featured, 1);

  const variants = sqlite.prepare("SELECT sku, price_minor, option_values_json FROM shop_variants WHERE product_id = ? ORDER BY price_minor").all("catalog-product-campus-mail");
  assert.equal(variants.length, 3);
  assert.deepEqual(variants.map((row) => row.sku), ["CAMPUS-QUILLMERE", "CAMPUS-LANTERNWICK", "CAMPUS-MOSSGLEN"]);
  assert.deepEqual(variants.map((row) => row.price_minor), [99_000, 125_000, 350_000]);

  const domains = variants.map((row) => JSON.parse(row.option_values_json).domain);
  assert.deepEqual(domains, ["quillmere.edu", "lanternwick.edu", "mossglen.edu"]);
  assert.ok(!domains.some((domain) => /mit\.edu|maricopa\.edu|sfcollege\.edu/i.test(domain)));

  const vi = sqlite.prepare("SELECT description FROM shop_product_localizations WHERE product_id = ? AND locale = 'vi'").get("catalog-product-campus-mail");
  assert.match(vi.description, /giả định/);
  assert.match(vi.description, /email\|password\|2fa/);
  assert.doesNotMatch(vi.description, /ưu đãi sinh viên|spotify|apple education/i);

  const media = sqlite.prepare("SELECT COUNT(*) AS count FROM shop_product_media WHERE product_id = ?").get("catalog-product-campus-mail");
  assert.equal(media.count, 4);
});
