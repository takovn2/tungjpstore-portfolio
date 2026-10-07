import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { locales } from "../src/i18n/dictionaries.ts";
import { getPolicyCopy } from "../src/i18n/legal.ts";
import { getPricingCopy } from "../src/i18n/pricing.ts";
import { formatServiceBudgetBand, getServiceCurrencyNote } from "../src/lib/services/currency.ts";
import { formatApproximateMoney, getExchangeRateNote } from "../src/lib/shop/currency.ts";
import { localeCurrency } from "../src/i18n/locale-preference.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("legal pages provide detailed localized content and a shared readable layout", () => {
  for (const locale of locales) {
    for (const kind of ["terms", "privacy", "refund"]) {
      const copy = getPolicyCopy(locale, kind);
      assert.ok(copy.heading.trim());
      assert.ok(copy.intro.length > (locale === "ja" || locale === "zh" ? 35 : 80), `${locale}/${kind} intro is too short`);
      assert.ok(copy.sections.length >= 10, `${locale}/${kind} needs a detailed section structure`);
      assert.equal(new Set(copy.sections.map((section) => section.id)).size, copy.sections.length);
    }
  }

  const layout = read("src/components/pages/LegalPage.astro");
  assert.match(layout, /class="legal-toc"/);
  assert.match(layout, /class="legal-toc-mobile"/);
  assert.match(layout, /scroll-margin-top/);
  assert.match(layout, /getLegalNav/);
});

test("service pricing is independent from the shop catalog and covers the core offer", () => {
  const pricingPage = read("src/components/pages/PricingPage.astro");
  const defaultRoute = read("src/pages/pricing.astro");
  const localizedRoute = read("src/pages/[lang]/[...slug].astro");

  assert.match(defaultRoute, /resolveRequestLocale\(Astro\.request\)/);
  assert.match(defaultRoute, /<PricingPage locale=\{pageLocale\} \/>/);
  assert.doesNotMatch(defaultRoute, /CONTENT_DB|listPublicProducts|cloudflare:workers/);
  assert.match(localizedRoute, /slug === "pricing" \? <PricingPage locale=\{locale\} \/>/);
  assert.doesNotMatch(localizedRoute, /slug === "pricing" \? <PricingPage[^>]*(?:products|unavailable)/);
  assert.match(pricingPage, /getPricingCopy/);
  assert.match(pricingPage, /formatServiceBudgetBand/);
  assert.match(pricingPage, /getServiceCurrencyNote/);
  assert.match(pricingPage, /copy\.services\.map/);
  assert.doesNotMatch(pricingPage, /product\.variants|formatApproximateMoney|listPublicProducts/);

  for (const locale of locales) {
    const copy = getPricingCopy(locale);
    const services = copy.services.map((service) => `${service.title}\n${service.summary}`).join("\n");
    assert.equal(copy.services.length, 3, `${locale} needs three core service tracks`);
    assert.deepEqual(Object.keys(copy.budgetBands), ["focused", "build", "platform"]);
    assert.match(services, /technical|kỹ thuật|技術|技术|backend|バックエンド|后端|SaaS/i, `${locale} must include technical/backend delivery`);
    assert.match(services, /infrastructure|hạ tầng|基盤|基础|backend|バックエンド|后端/i, `${locale} must include infrastructure or backend work`);
    assert.match(services, /landing|ランディング|落地页/i, `${locale} must include landing-page delivery`);
  }

  const vietnameseBand = formatServiceBudgetBand("build", "vi");
  assert.match(vietnameseBand.primary, /₫/);
  assert.equal(vietnameseBand.base, null);

  for (const locale of ["en", "ja", "zh"]) {
    const focused = formatServiceBudgetBand("focused", locale);
    const platform = formatServiceBudgetBand("platform", locale);
    assert.ok(focused.base?.includes("₫"), `${locale} needs the VND planning base`);
    assert.ok(platform.base?.includes("₫"), `${locale} needs the VND planning base`);
    assert.doesNotMatch(focused.primary, /₫/, `${locale} should show the locale currency first`);
    assert.match(getServiceCurrencyNote(locale), /2026/, `${locale} needs an exchange-rate date`);
  }
  assert.match(getServiceCurrencyNote("vi"), /proposal/i);
});

test("shop surfaces keep their own locale-aware indicative conversion", () => {
  const shopPage = read("src/components/pages/ShopPage.astro");
  const productPage = read("src/components/pages/ProductPage.astro");
  assert.match(shopPage, /storefront-rate-note/);
  assert.match(productPage, /product-purchase__rate-note/);

  assert.equal(formatApproximateMoney(100_000, "VND", "vi"), null);
  assert.match(formatApproximateMoney(100_000, "VND", "en") ?? "", /^≈\s*\$/);
  assert.match(formatApproximateMoney(100_000, "VND", "ja") ?? "", /^≈/);
  assert.match(formatApproximateMoney(100_000, "VND", "zh") ?? "", /^≈/);
  for (const locale of locales) assert.match(getExchangeRateNote(locale), /2026/);

  // The indicative conversion must agree with the storefront header and the
  // market layer about which currency a locale maps to. This file used to carry
  // its own map (ja -> JPY, zh -> CNY) while the header said USD, so a Japanese
  // visitor saw both on the same product page.
  for (const locale of locales) {
    const converted = formatApproximateMoney(100_000, "VND", locale);
    if (localeCurrency[locale] === "VND") {
      assert.equal(converted, null, `${locale} needs no conversion`);
    } else {
      assert.match(converted ?? "", /USD|\$/, `${locale} must convert into ${localeCurrency[locale]}, not a private mapping`);
    }
  }
});

test("shop surfaces expose policy links before and after checkout", () => {
  const cart = read("src/components/pages/CartPage.astro");
  const storeFooter = read("src/components/StoreFooter.astro");
  for (const path of ["/terms-of-service", "/privacy", "/refund-policy"]) {
    assert.match(`${cart}\n${storeFooter}`, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(storeFooter, /Pricing reference|Tham khảo giá|価格参考|价格参考/);
  if (storeFooter.includes('localizePath("/pricing"')) {
    assert.match(storeFooter, /getPricingCopy|Services & project investment|Dịch vụ & chi phí|サービス・料金|服务与价格/);
  }
});
