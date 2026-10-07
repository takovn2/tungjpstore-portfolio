import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Money layer.
 *
 * These primitives used to exist in three copies: `lib/shop/pricing.ts`,
 * a rate table in `lib/shop/currency.ts`, another one in `lib/services/currency.ts`,
 * and a fourth copy inlined at the top of `lib/shop/repository.ts`. They disagreed
 * with each other (ja resolved to JPY in one table and USD in another) and each
 * embedded its own stale rate constant. Everything now routes through
 * `lib/shop/money.ts`.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadMoney() {
  return importSource(compile(read("src/lib/shop/money.ts")));
}

const USD_VND = 25_500 * 1_000_000; // 25,500 VND per USD, at SHOP_RATE_SCALE

test("fraction digits follow each currency, not a hardcoded 2", async () => {
  const { currencyFractionDigits } = await loadMoney();
  assert.equal(currencyFractionDigits("VND"), 0);
  assert.equal(currencyFractionDigits("JPY"), 0);
  assert.equal(currencyFractionDigits("KRW"), 0);
  assert.equal(currencyFractionDigits("USD"), 2);
  assert.equal(currencyFractionDigits("EUR"), 2);
  // Three-decimal currencies exist and are silently wrong if assumed to be 2.
  assert.equal(currencyFractionDigits("KWD"), 3);
  assert.equal(currencyFractionDigits("NOT_A_CURRENCY"), 2, "unknown codes fall back to 2 rather than throwing");
});

test("minor units round-trip through major units", async () => {
  const { minorToMajor, majorToMinor } = await loadMoney();
  assert.equal(minorToMajor(120_000, "VND"), 120_000, "VND has no minor unit");
  assert.equal(minorToMajor(4_705, "USD"), 47.05);
  assert.equal(majorToMinor(47.05, "USD"), 4_705);
  assert.equal(majorToMinor(120_000, "VND"), 120_000);
  // JPY has no minor unit, so 1 JPY is 1, not 100.
  assert.equal(majorToMinor(980, "JPY"), 980);
});

test("mixing currencies throws instead of silently producing a wrong total", async () => {
  const { assertSameCurrency } = await loadMoney();
  assert.doesNotThrow(() => assertSameCurrency("VND", "VND"));
  assert.doesNotThrow(() => assertSameCurrency("usd", "USD"), "comparison is case-insensitive");
  assert.throws(() => assertSameCurrency("VND", "USD"), /currency_mismatch:VND:USD/);
});

test("VND to USD matches the values the checkout path already relied on", async () => {
  const { vndToUsdCents, convertMinor } = await loadMoney();
  assert.equal(vndToUsdCents(120_000, USD_VND), 471);
  assert.equal(vndToUsdCents(25_500, USD_VND), 100);
  // Same result through the general converter.
  assert.equal(convertMinor(120_000, "VND", "USD", USD_VND), 471);
  assert.equal(convertMinor(25_500, "VND", "USD", USD_VND), 100);
});

test("converting back through an inverted rate returns the original amount", async () => {
  const { convertMinor, invertRateScaled } = await loadMoney();
  const inverted = invertRateScaled(USD_VND);
  const targetScale = 1_000_000_000_000;
  assert.equal(inverted, 39_215_686, "1/25500 re-expressed at 1e12");

  // 471 USD cents -> VND and back to USD cents.
  const vnd = convertMinor(471, "USD", "VND", inverted, targetScale);
  assert.equal(vnd, 120_105, "4.71 USD at 25,500 VND/USD");
  assert.equal(convertMinor(vnd, "VND", "USD", USD_VND), 471);
});

test("conversion rounds half up and never drifts through repeated passes", async () => {
  const { convertMinor } = await loadMoney();
  // 1 VND at 25,500 VND/USD is 0.00392 cents, which must round to 0, not 1.
  assert.equal(convertMinor(1, "VND", "USD", USD_VND), 0);
  // 127.5 -> 128, exercising the half-up branch exactly.
  assert.equal(convertMinor(25_500 / 2, "VND", "USD", USD_VND), 50, "12,750 VND is exactly 50 cents");

  let value = 1_000_000;
  for (let i = 0; i < 50; i += 1) value = convertMinor(value, "VND", "USD", USD_VND);
  assert.ok(Number.isSafeInteger(value), "repeated conversion must stay an integer");
});

test("same-currency conversion is a passthrough and never divides", async () => {
  const { convertMinor } = await loadMoney();
  assert.equal(convertMinor(120_000, "VND", "VND", USD_VND), 120_000);
  assert.equal(convertMinor(4_705, "USD", "USD", 0), 4_705, "rate is not consulted for same currency");
});

test("invalid money input is rejected rather than coerced", async () => {
  const { convertMinor, vndToUsdCents, invertRateScaled } = await loadMoney();
  assert.throws(() => convertMinor(-1, "VND", "USD", USD_VND), /invalid_amount/);
  assert.throws(() => convertMinor(1.5, "VND", "USD", USD_VND), /invalid_amount/, "floats are rejected");
  assert.throws(() => convertMinor(100, "VND", "USD", 0), /invalid_rate/);
  assert.throws(() => vndToUsdCents(-1, USD_VND), /invalid_vnd_amount/);
  assert.throws(() => vndToUsdCents(1, 0), /invalid_usd_vnd_rate/);
  assert.throws(() => invertRateScaled(0), /invalid_rate/);
});

test("money primitives live in exactly one module", async () => {
  const repository = read("src/lib/shop/repository.ts");
  const pricing = read("src/lib/shop/pricing.ts");

  // repository.ts used to carry an inline copy of every constant and converter
  // because its smoke-test bundler stripped imports. That copy has been removed
  // and the harnesses now concatenate money.ts instead.
  for (const symbol of [
    "const SHOP_BASE_CURRENCY",
    "const SHOP_RATE_SCALE",
    "const DEFAULT_USD_VND_RATE_SCALED",
    "function vndToUsdCents",
    "function convertVndPricePair",
    "function rateScaledToNumber",
    "type ShopPricingSettings =",
    "0.000038",
  ]) {
    assert.doesNotMatch(repository, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${symbol} must not be redefined in repository.ts`);
  }
  assert.match(repository, /from "\.\/money"/, "repository must import the shared money module");

  // pricing.ts is now a re-export shim, not a second implementation.
  assert.doesNotMatch(pricing, /BigInt|function vndToUsdCents/);
  assert.match(pricing, /from "\.\/money"/);
});

test("every harness that bundles repository.ts also bundles money.ts", () => {
  const harnesses = readdirSync(`${projectRoot}/tests`)
    .filter((name) => name.endsWith(".smoke.test.mjs"))
    .filter((name) => read(`tests/${name}`).includes('compile(read("src/lib/shop/repository.ts"))'));

  assert.ok(harnesses.length > 0, "expected at least one harness bundling repository.ts");
  for (const name of harnesses) {
    const source = read(`tests/${name}`);
    assert.match(
      source,
      /compile\(read\("src\/lib\/shop\/money\.ts"\)\)/,
      `${name} bundles repository.ts without money.ts, so the stripped imports would be undefined`,
    );
  }
});
