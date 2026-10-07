import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("storefront filters combine search and category while keeping hidden UI out of layout", () => {
  const shop = read("src/components/pages/ShopPage.astro");
  const card = read("src/components/shop/ProductCard.astro");

  assert.match(shop, /data-shop-result-count/);
  assert.match(shop, /const applyCatalogFilters/);
  assert.match(shop, /matchesCategory && matchesQuery/);
  assert.match(shop, /\.shop-cart-overlay\[hidden\], \.shop-cart-drawer\[hidden\]/);
  assert.match(card, /:global\(\.shop-product-card\[hidden\]\)/);
});

test("client-rendered cart rows use global selectors inside Astro scoped components", () => {
  const shop = read("src/components/pages/ShopPage.astro");
  const cart = read("src/components/pages/CartPage.astro");

  assert.match(shop, /:global\(\.shop-cart-item__thumb img\)/);
  assert.match(shop, /:global\(\.shop-cart-item__controls button\)/);
  assert.match(cart, /:global\(\.flow-line__thumb img\)/);
  assert.match(cart, /:global\(\.flow-line__remove\)/);
  assert.match(cart, /data-stage="1"/);
  assert.match(cart, /data-stage="2"/);
  assert.match(cart, /data-cart-continue/);
  assert.match(cart, /data-cart-checkout-form/);
  assert.match(cart, /shop\/account\/login/);
  assert.match(cart, /encodeURIComponent\(checkoutReturnPath\)/);
  assert.match(cart, /if \(!authenticated\)/);
  assert.match(cart, /window\.location\.assign\(loginHref\)/);
  assert.ok(cart.indexOf("if (!authenticated)") < cart.indexOf("setStep(2)"));
  assert.match(cart, /stepParam === "checkout" && authenticated/);
  assert.match(cart, /readonly/);
});

test("product cards localize option counts for every storefront locale", () => {
  const card = read("src/components/shop/ProductCard.astro");
  assert.match(card, /lựa chọn/);
  assert.match(card, /種類/);
  assert.match(card, /个选项/);
  assert.match(card, /optionCountLabel/);
});
