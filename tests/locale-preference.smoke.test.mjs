import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  currencyForLocale,
  getCountryCode,
  getLocaleCookie,
  localeForCountry,
  resolveRequestLocale,
} from "../src/i18n/locale-preference.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const request = (headers = {}) => new Request("https://tung.codes/", { headers });

test("geo defaults map Vietnam to Vietnamese/VND and other countries to respective locales and USD", () => {
  assert.equal(localeForCountry("VN"), "vi");
  assert.equal(currencyForLocale(localeForCountry("VN")), "VND");
  assert.equal(localeForCountry("JP"), "ja");
  assert.equal(currencyForLocale(localeForCountry("JP")), "USD");
  assert.equal(localeForCountry("CN"), "zh");
  assert.equal(currencyForLocale(localeForCountry("CN")), "USD");
  for (const country of ["US", "GB", null]) {
    assert.equal(localeForCountry(country), "en");
    assert.equal(currencyForLocale(localeForCountry(country)), "USD");
  }
});

test("request locale prefers an explicit cookie over geo", () => {
  assert.equal(resolveRequestLocale(request({ "CF-Connecting-Country": "VN" })), "vi");
  assert.equal(resolveRequestLocale(request({ "CF-Connecting-Country": "US", cookie: "tung_locale=vi" })), "vi");
  assert.equal(resolveRequestLocale(request({ "CF-Connecting-Country": "VN", cookie: "tung_locale=en" })), "en");
  assert.equal(resolveRequestLocale(request()), "en");
  assert.equal(getLocaleCookie(request({ cookie: "foo=bar; tung_locale=ja" })), "ja");
  assert.equal(getCountryCode(request({ "CF-Connecting-Country": "us" })), "US");
});

test("middleware redirects only HTML page navigation and keeps redirects uncached", () => {
  const middleware = readFileSync(`${projectRoot}/src/middleware.ts`, "utf8");
  assert.match(readFileSync(`${projectRoot}/src/i18n/locale-preference.ts`, "utf8"), /CF-IPCountry/);
  assert.match(middleware, /Cache-Control.*no-store/);
  assert.match(middleware, /accept.*text\/html/);
  assert.match(middleware, /localePrefixPattern/);
  assert.match(middleware, /(?:admin\|api\|telegram)/, "Telegram Mini App routes must stay unprefixed");
  for (const file of [
    "src/pages/shop.astro",
    "src/pages/shop/[slug].astro",
    "src/pages/shop/cart.astro",
  ]) {
    assert.match(readFileSync(`${projectRoot}/${file}`, "utf8"), /resolveRequestLocale\(Astro\.request(?:, Astro\.locals\.markets)?\)/, `${file} should follow request locale`);
  }
});

test("all public standalone pages follow the request locale", () => {
  const publicPages = [
    "src/pages/index.astro",
    "src/pages/about.astro",
    "src/pages/pricing.astro",
    "src/pages/blog.astro",
    "src/pages/blog/[slug].astro",
    "src/pages/lab.astro",
    "src/pages/lab/[slug].astro",
    "src/pages/contact.astro",
    "src/pages/privacy.astro",
    "src/pages/terms-of-service.astro",
    "src/pages/refund-policy.astro",
    "src/pages/work/index.astro",
    "src/pages/work/[slug].astro",
    "src/pages/work/logivn.astro",
    "src/pages/work/payment-infrastructure.astro",
    "src/pages/work/fball.astro",
    "src/pages/shop.astro",
    "src/pages/shop/[slug].astro",
    "src/pages/shop/cart.astro",
    "src/pages/shop/order.astro",
    "src/pages/shop/account/index.astro",
    "src/pages/shop/account/login.astro",
    "src/pages/shop/account/orders/index.astro",
    "src/pages/shop/account/orders/[id].astro",
  ];
  for (const file of publicPages) {
    assert.match(readFileSync(`${projectRoot}/${file}`, "utf8"), /resolveRequestLocale\(Astro\.request(?:, Astro\.locals\.markets)?\)/, `${file} should follow request locale`);
  }
});
