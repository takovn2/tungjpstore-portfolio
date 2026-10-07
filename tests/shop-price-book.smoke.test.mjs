import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Per-market pricing.
 *
 * The reason this exists: converting one VND catalog price with an FX rate
 * produces prices no local buyer accepts. A Cursor Pro seat is 269,000 VND in
 * Vietnam (~10.50 USD) but realistically sells for 3-5 USD in the Philippines.
 * Purchasing power, not the exchange rate, sets the price.
 *
 * Two regressions are guarded here because both are silent:
 *   - pricing the Vietnamese market through the default USD book
 *   - deriving the margin floor from the catalog price, which would make it
 *     impossible to ever price a market below the Vietnamese price
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stripImports = (source) => source.replace(/^import[\s\S]*?;\s*/gm, "");
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadPriceBook() {
  const money = compile(read("src/lib/shop/money.ts"));
  const fx = stripImports(compile(read("src/lib/shop/fx.ts")));
  const priceBook = stripImports(compile(read("src/lib/shop/price-book.ts")));
  return importSource(`${money}\n${fx}\n${priceBook}`);
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
      };
      return prepared;
    },
    sqlite,
  };
}

const MIGRATIONS = [
  "0001_content_cms.sql",
  "0009_shop_core.sql",
  "0043_shop_currency_pricing.sql",
  "0053_shop_fx_rates.sql",
  "0055_shop_price_books.sql",
];

const USD_BOOK = { id: "price-book-global", code: "GLOBAL", currency: "USD", isDefault: true, roundingRule: "none" };
const VND_CURSOR = 269_000; // Cursor Pro, the worked example in the migration
const RATE = { rateScaled: 25_500 * 1_000_000, rateScale: 1_000_000 };

test("rounding rules shape a converted price into something buyable", async () => {
  const { applyRounding } = await loadPriceBook();
  assert.equal(applyRounding(12_347, "none", "VND"), 12_347);
  assert.equal(applyRounding(12_347, "nearest_100", "VND"), 12_300);
  assert.equal(applyRounding(12_347, "nearest_1000", "VND"), 12_000);
  // Charm pricing is meaningless for zero-decimal currencies.
  assert.equal(applyRounding(12_347, "charm_99", "VND"), 12_347);
  assert.equal(applyRounding(470, "charm_99", "USD"), 499);
  assert.equal(applyRounding(1_054, "charm_99", "USD"), 1_099);
});

test("a hand-set book entry wins over the converted catalog price", async () => {
  const { resolvePrice } = await loadPriceBook();
  const converted = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: null,
    catalogCurrency: "VND",
    book: USD_BOOK,
    item: null,
    rate: RATE,
  });
  // 269,000 VND at 25,500 VND/USD = $10.55, the price no one in SEA will pay.
  assert.equal(converted.priceMinor, 1_055);
  assert.equal(converted.currency, "USD");
  assert.equal(converted.source, "converted");

  const handset = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: null,
    catalogCurrency: "VND",
    book: USD_BOOK,
    item: { priceMinor: 399, compareAtMinor: null, floorMinor: 0 },
    rate: RATE,
  });
  assert.equal(handset.priceMinor, 399, "the Philippines price must not be the VN price converted");
  assert.equal(handset.source, "book");
});

test("the margin floor is hand-set, never derived from the catalog price", async () => {
  const { resolvePrice } = await loadPriceBook();
  // A market legitimately priced BELOW the Vietnamese price must be allowed.
  // Deriving the floor from the catalog price would forbid exactly this.
  const belowVietnam = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: null,
    catalogCurrency: "VND",
    book: USD_BOOK,
    item: { priceMinor: 399, compareAtMinor: null, floorMinor: 0 },
    rate: RATE,
  });
  assert.equal(belowVietnam.belowFloor, false);
  assert.equal(belowVietnam.priceMinor, 399);

  // A floor, once set, is enforced and reported.
  const floored = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: null,
    catalogCurrency: "VND",
    book: USD_BOOK,
    item: { priceMinor: 100, compareAtMinor: null, floorMinor: 350 },
    rate: RATE,
  });
  assert.equal(floored.belowFloor, true, "a price under the floor is a margin incident");
  assert.equal(floored.priceMinor, 350);
});

test("without a rate the catalog price is kept, never guessed", async () => {
  const { resolvePrice } = await loadPriceBook();
  const result = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: null,
    catalogCurrency: "VND",
    book: USD_BOOK,
    item: null,
    rate: null,
  });
  assert.equal(result.currency, "VND", "must not claim the amount is USD");
  assert.equal(result.priceMinor, VND_CURSOR);
  assert.equal(result.source, "catalog");
});

test("a book in the catalog's own currency leaves the price alone", async () => {
  const { resolvePrice } = await loadPriceBook();
  const result = resolvePrice({
    variantId: "v1",
    catalogPriceMinor: VND_CURSOR,
    catalogCompareAtMinor: 300_000,
    catalogCurrency: "VND",
    book: { ...USD_BOOK, currency: "VND" },
    item: { priceMinor: 199_000, compareAtMinor: null, floorMinor: 0 },
    rate: RATE,
  });
  assert.equal(result.priceMinor, VND_CURSOR);
  assert.equal(result.currency, "VND");
  assert.equal(result.source, "catalog");
});

test("the Vietnamese market must not be re-priced through the default USD book", async () => {
  const { resolvePriceBook, loadPriceBookContext, createPriceResolver } = await loadPriceBook();
  const db = createD1(MIGRATIONS);

  // Only a USD book is seeded. Asking for VND must yield nothing rather than
  // falling through to the default book, which would silently re-price the
  // entire Vietnamese catalogue in dollars.
  assert.equal(await resolvePriceBook(db, null, "VND"), null);
  const vndBook = await resolvePriceBook(db, null, "USD");
  assert.equal(vndBook.currency, "USD");

  const context = await loadPriceBookContext(db, null, "VND");
  assert.equal(context.book, null);
  assert.equal(createPriceResolver(context)({ variantId: "v1", priceMinor: VND_CURSOR, compareAtMinor: null, currency: "VND" }), null);
});

test("the global market converts into the seeded USD book", async () => {
  const { loadPriceBookContext, createPriceResolver } = await loadPriceBook();
  const db = createD1(MIGRATIONS);

  const context = await loadPriceBookContext(db, null, "USD");
  assert.equal(context.book.currency, "USD");
  const resolver = createPriceResolver(context);
  const resolved = resolver({ variantId: "v1", priceMinor: VND_CURSOR, compareAtMinor: null, currency: "VND" });
  assert.equal(resolved.currency, "USD");
  assert.equal(resolved.priceMinor, 1_055);
});

test("an explicit book entry is used, and an unmigrated database is inert", async () => {
  const { loadPriceBookContext, createPriceResolver } = await loadPriceBook();
  const db = createD1(MIGRATIONS);
  const now = new Date().toISOString();

  db.sqlite.prepare(`INSERT INTO shop_price_books (id, code, currency, is_default, rounding_rule, created_at, updated_at)
    VALUES ('price-book-ph', 'PH', 'USD', 0, 'charm_99', ?, ?)`).run(now, now);
  db.sqlite.prepare(`INSERT INTO shop_price_book_items
    (price_book_id, variant_id, price_minor, compare_at_minor, floor_minor, updated_by, created_at, updated_at)
    VALUES ('price-book-ph', 'variant-cursor', 399, NULL, 350, 'test', ?, ?)`).run(now, now);

  const context = await loadPriceBookContext(db, "price-book-ph", "USD");
  assert.equal(context.book.code, "PH");
  const resolver = createPriceResolver(context);

  // The hand-set Philippines price, charm-rounded.
  assert.equal(resolver({ variantId: "variant-cursor", priceMinor: VND_CURSOR, compareAtMinor: null, currency: "VND" }).priceMinor, 399);
  // A variant with no entry falls back to conversion, not to zero.
  assert.equal(resolver({ variantId: "variant-other", priceMinor: VND_CURSOR, compareAtMinor: null, currency: "VND" }).priceMinor, 1_099);

  // Without migration 0055 nothing is resolved and catalog pricing stands.
  const bare = createD1(["0001_content_cms.sql", "0009_shop_core.sql"]);
  assert.equal((await loadPriceBookContext(bare, null, "USD")).book, null);
});
