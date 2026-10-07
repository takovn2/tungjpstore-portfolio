import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * bundled rather than imported: market.ts imports ../../i18n/dictionaries
 * without a file extension, which Node's ESM resolver will not resolve for .ts.
 */
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadMarket() {
  const dictionaries = compile(read("src/i18n/dictionaries.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const market = compile(read("src/lib/shop/market.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${dictionaries}\n${market}`);
}

/**
 * Per-market catalogue visibility.
 *
 * Not every product may be sold in every country: subscription seats, aged
 * accounts and region-locked keys carry provider terms and local restrictions.
 * Without this the only options are delisting everywhere or selling everywhere.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

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

// shop_market_catalog_rules ships with 0054; there is no separate migration.
const MIGRATIONS = [
  "0001_content_cms.sql",
  "0009_shop_core.sql",
  "0054_shop_markets.sql",
];

test("an explicit rule decides, regardless of the market's scope", async () => {
  const { isProductVisibleInMarket } = await loadMarket();
  const rules = new Map([["p-locked", false], ["p-shown", true]]);

  // A rule beats the scope in both directions.
  assert.equal(isProductVisibleInMarket("p-locked", "all", rules), false);
  assert.equal(isProductVisibleInMarket("p-locked", "vn_only", rules), false);
  assert.equal(isProductVisibleInMarket("p-shown", "vn_only", rules), true);
  assert.equal(isProductVisibleInMarket("p-shown", "glb", rules), true);

  // No rule: only vn_only changes the default.
  assert.equal(isProductVisibleInMarket("p-other", "all", rules), true);
  assert.equal(isProductVisibleInMarket("p-other", "glb", rules), true);
  assert.equal(isProductVisibleInMarket("p-other", "vn_only", rules), false);
});

test("a market with no rules and scope 'all' behaves exactly as before", async () => {
  const { createCatalogFilter } = await loadMarket();
  const filter = createCatalogFilter("all", new Map());
  for (const id of ["p1", "p2", "p3"]) assert.equal(filter(id), true);
});

test("rules round-trip through D1 for their own market only", async () => {
  const { createCatalogFilter, listCatalogRules, upsertMarket } = await loadMarket();
  const db = createD1(MIGRATIONS);
  await upsertMarket(db, { code: "PH", locale: "en", currency: "USD", countryCodes: ["PH"] });
  await upsertMarket(db, { code: "VN", locale: "vi", currency: "VND", countryCodes: ["VN"] });

  db.sqlite.prepare(`INSERT INTO shop_market_catalog_rules (market_id, product_id, visible)
    VALUES ('market-ph', 'p-locked', 0)`).run();
  db.sqlite.prepare(`INSERT INTO shop_market_catalog_rules (market_id, product_id, visible)
    VALUES ('market-vn', 'p-locked', 1)`).run();

  const phRules = await listCatalogRules(db, "market-ph");
  assert.equal(phRules.get("p-locked"), false);

  // The same product is visible in Vietnam and hidden in the Philippines.
  assert.equal(createCatalogFilter("all", phRules)("p-locked"), false);
  const vnRules = await listCatalogRules(db, "market-vn");
  assert.equal(createCatalogFilter("all", vnRules)("p-locked"), true);

  // Rules are scoped: the Philippines market must not see Vietnam's rules.
  assert.equal(phRules.has("p-locked"), true);
  assert.equal(vnRules.size, 1);
});

test("visibility is stored as a strict boolean, not a free-form flag", () => {
  const db = createD1(MIGRATIONS);
  assert.throws(() => db.sqlite.prepare(`INSERT INTO shop_market_catalog_rules
    (market_id, product_id, visible) VALUES ('market-x', 'p1', 2)`).run(), /CHECK/);
  // Default is visible, so an operator only has to write the exceptions.
  db.sqlite.prepare(`INSERT INTO shop_market_catalog_rules (market_id, product_id, visible)
    VALUES ('market-global', 'p1', 1)`).run();
});

test("an unmigrated database keeps the whole catalogue visible", async () => {
  const { createCatalogFilter, listCatalogRules } = await loadMarket();
  const db = createD1(["0001_content_cms.sql", "0009_shop_core.sql"]);
  const rules = await listCatalogRules(db, "market-anything");
  assert.equal(rules.size, 0, "missing table must read as 'no rules', not as an error");
  assert.equal(createCatalogFilter("all", rules)("p1"), true);
});

test("the catalogue passes the market filter down to the product query", () => {
  for (const page of ["src/pages/shop.astro", "src/pages/shop/[slug].astro"]) {
    const source = read(page);
    assert.match(source, /createCatalogFilter\(/, `${page} must build a catalog filter`);
    assert.match(source, /listCatalogRules\(db, market\.id\)/, `${page} must load rules for the resolved market`);
    assert.match(source, /catalogFilter/, `${page} must pass the filter into the query`);
  }
  const repository = read("src/lib/shop/repository.ts");
  assert.match(repository, /catalogFilter \? catalogFilter\(product\.id\) : true/);
});
