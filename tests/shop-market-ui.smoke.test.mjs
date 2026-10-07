import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localeForCountry } from "../src/i18n/locale-preference.ts";

/**
 * Surfacing the market layer: the landing route, the switcher and the cache
 * headers that keep one market's prices out of another market's browser.
 *
 * Mostly source-level assertions. Astro components render on the server and are
 * not executable in these smoke tests, so the assertions pin the wiring that
 * would otherwise silently rot: the cookie names, the route exclusions and the
 * Vary header.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("the market landing route rejects unknown codes instead of guessing", () => {
  const landing = read("src/pages/shop/market/[code].astro");
  assert.match(landing, /findMarketByCode\(pool, requested\)/);
  assert.match(landing, /Astro\.response\.status = 404/, "an unknown code must 404, not resolve to a default");
  assert.doesNotMatch(landing, /defaultMarket\(/, "must not silently fall back to a default market");
  assert.match(landing, /NotFoundPage/);
});

test("the landing route sets the market and the language, and leaves a clean URL", () => {
  const landing = read("src/pages/shop/market/[code].astro");
  // Market cookie.
  assert.match(landing, /Astro\.cookies\.set\(MARKET_COOKIE_NAME, market\.code/);
  // Language too: an ad for the Philippines must not drop a visitor into
  // Vietnamese copy and leave them to hunt for the switcher.
  assert.match(landing, /Astro\.cookies\.set\(LOCALE_COOKIE_NAME, market\.locale/);
  // No ?market= in the redirect: the cookie drives everything and a clean URL is
  // what gets shared and indexed.
  assert.doesNotMatch(landing, /\?market=\$\{/);
  assert.match(landing, /return Astro\.redirect\(localizePath\("\/shop", market\.locale\), 302\)/);
});

test("the landing route works before any market rows exist", () => {
  const landing = read("src/pages/shop/market/[code].astro");
  assert.match(landing, /DEFAULT_MARKETS/, "the built-in markets must be available unmigrated");
  assert.match(landing, /catch \{/, "a missing table must not take the route down");
});

test("the middleware lets the landing route through instead of redirecting it", () => {
  const middleware = read("src/middleware.ts");
  // Without this, /shop/market/ph is redirected to /en/shop/market/ph (most
  // target markets resolve to `en`), which matches no route and 404s.
  assert.match(middleware, /marketLandingPattern/);
  assert.match(middleware, /marketLandingPattern\.test\(url\.pathname\)\) return null/);
  // It is also pointless to resolve a market for the request whose job is to set
  // that market.
  assert.match(middleware, /!marketLandingPattern\.test\(requestPath\)/);
});

test("the middleware resolves the market once and hands it to pages through locals", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /context\.locals\.market = market/);
  assert.match(middleware, /context\.locals\.markets = markets/);
  // Pages must not repeat the work: they read locals and only fall back.
  for (const page of ["src/pages/shop.astro", "src/pages/shop/[slug].astro"]) {
    const source = read(page);
    assert.match(source, /Astro\.locals\.market\?\.market/, `${page} should read the resolved market`);
    assert.doesNotMatch(source, /await listMarkets\(/, `${page} should not query markets again`);
  }
});

test("market-dependent pages vary on Cookie so the CDN cannot serve the wrong prices", () => {
  for (const page of ["src/pages/shop.astro", "src/pages/shop/[slug].astro"]) {
    const source = read(page);
    assert.match(source, /Vary", "Cookie"/, `${page} sets a public cache but must vary on Cookie`);
  }
  // The catalogue is cached at the edge, which is exactly why Vary is needed.
  const cache = read("src/lib/public-content.ts");
  assert.match(cache, /s-maxage=60/);
});

test("the storefront shows a market switcher and prices in the market's currency", () => {
  const header = read("src/components/StoreHeader.astro");
  // Only worth showing when there is something to switch between.
  assert.match(header, /markets\.length > 1 && market/);
  assert.match(header, /data-market-select/);
  assert.match(header, /item\.enabled/, "disabled markets must not be offered");
  // This resolves the old contradiction where the header showed USD for Japanese
  // visitors while the product page showed an indicative "≈¥" conversion.
  assert.match(header, /market\?\.currency \?\? currencyForLocale\(locale\)/);

  const script = header;
  assert.match(script, /storeMarketCookieName = "tung_market"/);
  // Prices are server-rendered, so a change has to come back from the server.
  assert.match(script, /window\.location\.assign/);
  assert.match(script, /searchParams\.delete\("market"\)/);
});

test("country to language is data now, with the old branches only as a fallback", () => {
  // The operator can point a country at any language without a deploy.
  const markets = [
    { code: "VN", countryCodes: ["VN"], locale: "vi", enabled: true },
    { code: "PH", countryCodes: ["PH"], locale: "en", enabled: true },
    { code: "BR", countryCodes: ["BR"], locale: "en", enabled: true },
    // A market an operator has switched off must be ignored, not half-honoured.
    { code: "JP", countryCodes: ["JP"], locale: "ja", enabled: false },
  ];

  assert.equal(localeForCountry("VN", markets), "vi");
  assert.equal(localeForCountry("PH", markets), "en", "a market the old branches never knew about");
  assert.equal(localeForCountry("BR", markets), "en");
  assert.equal(localeForCountry("JP", markets), "ja", "disabled markets still fall through to the fallback map");

  // Unmigrated behaviour is unchanged, which is the whole point of keeping it.
  assert.equal(localeForCountry("VN"), "vi");
  assert.equal(localeForCountry("JP"), "ja");
  assert.equal(localeForCountry("CN"), "zh");
  assert.equal(localeForCountry("DE"), "en");
  assert.equal(localeForCountry("DE", markets), "en", "unknown countries keep resolving to en");
  assert.equal(localeForCountry(null, markets), "en");
  assert.equal(localeForCountry("DE", []), "en", "an empty market list must not break resolution");
});

test("the landing path is reachable through the deployment's worker-first allowlist", () => {
  // The route is deliberately nested under /shop/ because that pattern is
  // already in run_worker_first. A top-level /ph would be answered by the static
  // assets layer before the Worker ever ran.
  const wrangler = read("wrangler.jsonc");
  assert.match(wrangler, /"\/shop\*"/);
  assert.match(wrangler, /not_found_handling/);
});
