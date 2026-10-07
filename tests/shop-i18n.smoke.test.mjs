import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatShopDate,
  formatShopDateTime,
  formatShopFulfillmentStatus,
  formatShopOrderStatus,
  formatShopPaymentStatus,
  getShopCopy,
} from "../src/i18n/shop.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(`${projectRoot}/${file}`, "utf8");
const locales = ["vi", "en", "ja", "zh"];

test("shop checkout copy is complete for every supported locale", () => {
  for (const locale of locales) {
    const copy = getShopCopy(locale);
    assert.ok(copy.checkout.legal.before);
    assert.ok(copy.checkout.legal.terms);
    assert.ok(copy.checkout.form.paymentMethodAccount);
    assert.ok(copy.flow.details.paymentMethodAccount);
    assert.ok(copy.account.status.fulfillment.processing);
    assert.ok(copy.account.status.fulfillment.cancelled);
    assert.ok(copy.checkout.crypto.transactionReference);
    assert.ok(copy.checkout.crypto.referenceError);
  }
});

test("account status and date helpers never expose raw backend enums", () => {
  for (const locale of locales) {
    assert.notEqual(formatShopOrderStatus("pending_payment", locale), "pending_payment");
    assert.notEqual(formatShopPaymentStatus("partially_refunded", locale), "partially_refunded");
    assert.notEqual(formatShopFulfillmentStatus("processing", locale), "processing");
    assert.notEqual(formatShopFulfillmentStatus("cancelled", locale), "cancelled");
    assert.notEqual(formatShopOrderStatus("unexpected_backend_value", locale), "unexpected_backend_value");
    assert.notEqual(formatShopDate("2026-01-02T03:04:05.000Z", locale), "2026-01-02T03:04:05.000Z");
    assert.notEqual(formatShopDateTime("2026-01-02T03:04:05.000Z", locale), "2026-01-02T03:04:05.000Z");
  }
});

test("cart, order and account surfaces keep customer copy in locale dictionaries", () => {
  const cart = read("src/components/pages/CartPage.astro");
  const order = read("src/components/pages/OrderPage.astro");
  const accountPages = [
    read("src/components/pages/AccountDashboardPage.astro"),
    read("src/components/pages/AccountOrdersPage.astro"),
    read("src/components/pages/AccountOrderDetailPage.astro"),
    read("src/components/pages/AccountLoginPage.astro"),
  ].join("\n");

  assert.match(cart, /getShopCopy\(locale\)/);
  assert.match(cart, /flow\.details\.paymentMethodAccount/);
  assert.match(cart, /localeTag: shopLanguageTag\[locale\]/);
  assert.match(cart, /defaultCurrency: locale === "vi" \? "VND" : "USD"/);
  assert.doesNotMatch(cart, /paymentMethod\.(network|provider)\s*\|\|\s*["']account["']/);
  assert.doesNotMatch(cart, /const legalNote = \(\{/);

  assert.match(order, /checkoutCopy\.status\[order\.state\] \|\| checkoutCopy\.status\.unknown/);
  assert.match(order, /cryptoCopy\.(referenceError|copyFailed|copied)/);
  assert.doesNotMatch(order, /Payment method|Loading Bybit \/ Binance methods|Transaction ID or hash/);

  assert.match(accountPages, /formatShopOrderStatus/);
  assert.match(accountPages, /formatShopPaymentStatus/);
  assert.match(accountPages, /formatShopFulfillmentStatus/);
  assert.match(accountPages, /formatShopDate(Time)?/);
  assert.doesNotMatch(accountPages, /toLocaleDateString\(|toLocaleString\(/);
  assert.doesNotMatch(accountPages, /paymentStatus\}\s*<|fulfillmentStatus\}\s*</);
});

test("localized account routes preserve locale-aware links and request resolution", () => {
  for (const file of [
    "src/pages/shop/cart.astro",
    "src/pages/shop/order.astro",
    "src/pages/shop/account/index.astro",
    "src/pages/shop/account/login.astro",
    "src/pages/shop/account/orders/index.astro",
    "src/pages/shop/account/orders/[id].astro",
  ]) {
    const source = read(file);
    assert.match(source, /resolveRequestLocale\(Astro\.request\)/, `${file} should resolve the request locale`);
  }
  for (const file of [
    "src/components/pages/AccountDashboardPage.astro",
    "src/components/pages/AccountOrdersPage.astro",
    "src/components/pages/AccountOrderDetailPage.astro",
  ]) {
    assert.match(read(file), /localizePath\(/, `${file} should localize account links`);
  }
});
