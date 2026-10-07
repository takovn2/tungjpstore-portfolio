import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Market layer.
 *
 * "Which market is this visitor in" used to be one boolean in
 * api/shop/payment-methods.ts: `locale !== "vi" || country !== "VN"`. Everything
 * downstream derived from it, so the shop could only ever be Vietnam or
 * not-Vietnam. This module replaces that with data.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stripImports = (source) => source.replace(/^import[\s\S]*?;\s*/gm, "");
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// Named `loadMarketModule`, not `loadMarket`: the module exports a function of
// that name and destructuring it would shadow the loader.
async function loadMarketModule() {
  const dictionaries = compile(read("src/i18n/dictionaries.ts"));
  const marketSource = stripImports(compile(read("src/lib/shop/market.ts")));
  return importSource(`${dictionaries}\n${marketSource}`);
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

test("Accept-Language is parsed, ranked and filtered to supported locales", async () => {
  const { localesFromAcceptLanguage } = await loadMarketModule();
  assert.deepEqual(localesFromAcceptLanguage("ja,en-US;q=0.9,en;q=0.8"), ["ja", "en"]);
  assert.deepEqual(localesFromAcceptLanguage("zh-CN,zh;q=0.9"), ["zh"]);
  // Quality wins over document order.
  assert.deepEqual(localesFromAcceptLanguage("en;q=0.3,vi;q=0.9"), ["vi", "en"]);
  // Unsupported languages are dropped, not defaulted to the first entry.
  assert.deepEqual(localesFromAcceptLanguage("de-DE,de;q=0.9"), []);
  assert.deepEqual(localesFromAcceptLanguage(null), []);
  assert.deepEqual(localesFromAcceptLanguage(""), []);
  // Malformed q values degrade to 0 rather than being treated as 1.
  assert.deepEqual(localesFromAcceptLanguage("en;q=abc"), []);
});

test("explicit choice beats the visitor's country", async () => {
  const { resolveMarket } = await loadMarketModule();
  // A Vietnamese IP must not override someone who chose the global market.
  const chosen = resolveMarket({ explicit: "GLOBAL", country: "VN" });
  assert.equal(chosen.market.code, "GLOBAL");
  assert.equal(chosen.source, "explicit");

  // And a foreign IP must not override an explicit VN choice.
  const vn = resolveMarket({ explicit: "vn", country: "DE" });
  assert.equal(vn.market.code, "VN", "market codes are case-insensitive");
  assert.equal(vn.source, "explicit");
});

test("country resolves the market, and unknown countries fall through to Accept-Language", async () => {
  const { resolveMarket, createMarket, DEFAULT_MARKETS } = await loadMarketModule();
  assert.equal(resolveMarket({ country: "VN" }).market.code, "VN");
  assert.equal(resolveMarket({ country: "VN" }).source, "country");

  // Unknown country + a Japanese browser: the language narrows it before the
  // default is used. This needs a catch-all Japanese market, which the built-in
  // defaults do not carry — they only have VN and GLOBAL(en).
  const withJapanese = [createMarket({ id: "m-jp", code: "JP", locale: "ja", currency: "JPY" }), ...DEFAULT_MARKETS];
  const japanese = resolveMarket({ country: "XX", acceptLanguage: "ja,en;q=0.8", markets: withJapanese });
  assert.equal(japanese.market.locale, "ja");
  assert.equal(japanese.source, "accept-language");

  // "ja,en" still lands on accept-language, because GLOBAL matches the second
  // preference. A header with no match at all is what falls through.
  assert.equal(resolveMarket({ country: "XX", acceptLanguage: "ja,en;q=0.8" }).source, "accept-language");
  assert.equal(resolveMarket({ country: "XX", acceptLanguage: "ja" }).source, "default");
  assert.equal(resolveMarket({ country: "XX", acceptLanguage: "de-DE" }).source, "default");

  // A market tied to specific countries must never be chosen by language alone,
  // or language would silently override country routing.
  const countryTied = resolveMarket({
    country: "XX",
    acceptLanguage: "vi",
    markets: [createMarket({ id: "m-vn", code: "VN", locale: "vi", currency: "VND", countryCodes: ["VN"] }), ...DEFAULT_MARKETS],
  });
  assert.equal(countryTied.market.code, "GLOBAL", "a country-scoped market is not language-selectable");

  // Unknown country, no usable language header: the configured default.
  const fallback = resolveMarket({ country: "XX" });
  assert.equal(fallback.market.code, "GLOBAL");
  assert.equal(fallback.source, "default");
});

test("the built-in defaults reproduce today's behaviour exactly", async () => {
  const { resolveMarket, orderedRails, DEFAULT_MARKETS } = await loadMarketModule();

  const vn = resolveMarket({ country: "VN" }).market;
  assert.equal(vn.currency, "VND");
  assert.equal(vn.locale, "vi");
  assert.deepEqual(orderedRails(vn).map((rail) => rail.railId), ["payos", "crypto"], "Vietnam keeps VietQR first");

  const global = resolveMarket({ country: "PH" }).market;
  assert.equal(global.currency, "USD");
  assert.equal(global.locale, "en");
  assert.deepEqual(orderedRails(global).map((rail) => rail.railId), ["crypto"], "elsewhere offers crypto only");

  // The disabled VietQR row still exists, because the endpoint falls back to it
  // when no crypto method is configured.
  assert.equal(global.rails.length, 2);
  assert.equal(global.rails.find((rail) => rail.railId === "payos").enabled, false);

  assert.ok(DEFAULT_MARKETS.some((item) => item.isDefault), "exactly one default must exist");

  // Regression guard: localeForCountry() already routed JP to ja and
  // CN/TW/HK/MO to zh. If the defaults omit those markets, adopting this module
  // would silently send Japanese and Chinese visitors to English.
  const expectedByCountry = { VN: "vi", JP: "ja", CN: "zh", TW: "zh", HK: "zh", MO: "zh", DE: "en", PH: "en" };
  for (const [country, locale] of Object.entries(expectedByCountry)) {
    assert.equal(resolveMarket({ country }).market.locale, locale, `${country} must resolve to ${locale}`);
  }
});

test("disabled markets are never resolved", async () => {
  const { resolveMarket, createMarket, DEFAULT_MARKETS } = await loadMarketModule();
  const markets = [
    createMarket({ id: "m-sea", code: "SEA", locale: "en", currency: "USD", countryCodes: ["PH"], enabled: false }),
    ...DEFAULT_MARKETS,
  ];
  const resolved = resolveMarket({ country: "PH", markets });
  assert.equal(resolved.market.code, "GLOBAL", "a disabled market must not swallow its countries");
});

test("market cookie helpers round-trip and reject junk", async () => {
  const { getMarketCookie, setMarketCookieValue, MARKET_COOKIE_NAME, parseCookieValue } = await loadMarketModule();
  const request = new Request("https://tung.codes/shop", { headers: { cookie: setMarketCookieValue("sea") } });
  assert.equal(getMarketCookie(request), "SEA");

  const other = new Request("https://tung.codes/shop", { headers: { cookie: "a=1; tung_market=VN; b=2" } });
  assert.equal(getMarketCookie(other), "VN");

  assert.equal(getMarketCookie(new Request("https://tung.codes/shop")), null);
  // A value that is not a market code must not be trusted.
  const junk = new Request("https://tung.codes/shop", { headers: { cookie: `${MARKET_COOKIE_NAME}=<script>` } });
  assert.equal(getMarketCookie(junk), null);
  assert.equal(parseCookieValue(null, MARKET_COOKIE_NAME), null);
});

test("migration seeds two markets and lets a country belong to only one", () => {
  const db = createD1(["0054_shop_markets.sql"]);
  const markets = db.sqlite.prepare("SELECT code, currency, locale, is_default FROM shop_markets ORDER BY sort_order").all();
  assert.deepEqual(markets.map((row) => row.code), ["VN", "GLOBAL"]);
  assert.equal(markets[0].currency, "VND");
  assert.equal(markets[1].currency, "USD");
  assert.equal(markets[1].is_default, 1);

  // Two markets claiming the same country would silently pick one at random.
  assert.throws(
    () => db.sqlite.prepare("INSERT INTO shop_market_countries (country_code, market_id, created_at) VALUES ('VN','market-global','now')").run(),
    /UNIQUE/,
  );
});

test("the market table holds currencies the legacy schema cannot express", () => {
  const db = createD1(["0054_shop_markets.sql"]);
  const now = new Date().toISOString();
  db.sqlite.prepare(`INSERT INTO shop_markets (id, code, locale, currency, created_at, updated_at)
    VALUES ('market-ph','PH','en','PHP',?,?)`).run(now, now);
  const row = db.sqlite.prepare("SELECT currency FROM shop_markets WHERE code = 'PH'").get();
  assert.equal(row.currency, "PHP");
  // shop_currency_settings would reject this outright.
  assert.throws(
    () => db.sqlite.prepare("INSERT INTO shop_currency_settings (id, usd_vnd_rate_scaled, rate_scale, updated_by, updated_at) VALUES ('x', 1, 1000000, 't', 'now')").run(),
    /no such table/i,
  );
});

test("markets round-trip through D1 with their countries and rails", async () => {
  const { listMarkets, loadMarket, upsertMarket, orderedRails } = await loadMarketModule();
  const db = createD1(["0054_shop_markets.sql"]);

  const seeded = await listMarkets(db);
  assert.equal(seeded.length, 2);
  const vn = seeded.find((item) => item.code === "VN");
  assert.deepEqual(vn.countryCodes, ["VN"]);
  assert.deepEqual(orderedRails(vn).map((rail) => rail.railId), ["payos", "crypto"]);

  assert.equal((await loadMarket(db, "global")).code, "GLOBAL");
  assert.equal(await loadMarket(db, "NOPE"), null);

  const created = await upsertMarket(db, {
    code: "PH",
    locale: "en",
    currency: "PHP",
    countryCodes: ["ph", "PH", "!!"],
    rails: [
      { railId: "crypto", priority: 1, enabled: true },
      { railId: "gcash", priority: 0, enabled: true },
    ],
  });
  assert.deepEqual(created.countryCodes, ["PH"], "countries are normalised and de-duplicated");
  assert.deepEqual(orderedRails(created).map((rail) => rail.railId), ["gcash", "crypto"], "rails sort by priority");

  // Re-upserting replaces rather than appending.
  const updated = await upsertMarket(db, { code: "PH", locale: "en", currency: "PHP", countryCodes: ["PH"], rails: [{ railId: "crypto", priority: 0, enabled: true }] });
  assert.equal(updated.rails.length, 1);
  assert.equal((await listMarkets(db)).length, 3);
});

test("an unmigrated database falls back to the built-in defaults instead of failing", async () => {
  const { listMarkets, resolveMarket } = await loadMarketModule();
  const empty = createD1(["0001_content_cms.sql"]);
  assert.deepEqual(await listMarkets(empty), [], "no table means no rows, and callers use the defaults");
  assert.equal(resolveMarket({ country: "PH" }).market.code, "GLOBAL", "resolution still works without D1");
});

test("upsertMarket rejects malformed codes and currencies", async () => {
  const { upsertMarket } = await loadMarketModule();
  const db = createD1(["0054_shop_markets.sql"]);
  await assert.rejects(() => upsertMarket(db, { code: "X", locale: "en", currency: "USD" }), /invalid_market_code/);
  await assert.rejects(() => upsertMarket(db, { code: "PH", locale: "en", currency: "peso" }), /invalid_market_currency/);
});
