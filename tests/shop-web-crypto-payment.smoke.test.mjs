import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  currencyForLocale,
  getCountryCode,
  localeForCountry,
  localeCurrency,
} from "../src/i18n/locale-preference.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("international locales zh, ja, en map to USD currency, while vi maps to VND", () => {
  assert.equal(localeCurrency.vi, "VND");
  assert.equal(localeCurrency.en, "USD");
  assert.equal(localeCurrency.ja, "USD");
  assert.equal(localeCurrency.zh, "USD");
  assert.equal(currencyForLocale("zh"), "USD");
  assert.equal(currencyForLocale("ja"), "USD");
  assert.equal(currencyForLocale("en"), "USD");
  assert.equal(currencyForLocale("vi"), "VND");
});

test("web payment methods API supports dynamic crypto and VietQR rails", () => {
  const paymentMethodsRoute = read("src/pages/api/shop/payment-methods.ts");
  assert.match(paymentMethodsRoute, /listCryptoPaymentMethods/);
  assert.match(paymentMethodsRoute, /isInternational/);
  assert.match(paymentMethodsRoute, /vietQrMethod/);
  assert.match(paymentMethodsRoute, /payos/);
});

test("web checkout service supports crypto payments alongside VietQR", () => {
  const service = read("src/lib/shop/service.ts");
  assert.match(service, /createPublicShopCheckout/);
  assert.match(service, /listCryptoPaymentMethods/);
  assert.match(service, /createCryptoPayment/);
  assert.match(service, /createVietQrPayment/);
  assert.match(service, /pricingCurrency:\s*"USD"/);
});

test("CartPage wires payment methods with locale and sets USD default for international", () => {
  const cart = read("src/components/pages/CartPage.astro");
  assert.match(cart, /\/api\/shop\/payment-methods\?locale=/);
  assert.match(cart, /defaultCurrency:\s*locale === "vi" \? "VND" : "USD"/);
  assert.match(cart, /paymentMethodSelect\.value = paymentMethods\[0\]\.id/);
});
