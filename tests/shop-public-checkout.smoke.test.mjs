import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("public checkout API is JSON-only, challenge-aware and never logs bearer material", () => {
  const source = read("src/pages/api/shop/checkout.ts");
  assert.match(source, /getCustomerSession/);
  assert.match(source, /customer_auth_required/);
  assert.match(source, /session\.emailNormalized/);
  assert.match(source, /session\.displayName/);
  assert.ok(source.indexOf("getCustomerSession") < source.indexOf("readJson(request)"));
  assert.doesNotMatch(source, /customer:\s*payload\.customer/);
  assert.match(source, /validateCreateCheckoutInput/);
  assert.match(source, /TURNSTILE_SECRET_KEY/);
  assert.match(source, /challenge_required/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /public_checkout_failed/);
  assert.doesNotMatch(source, /console\.error\([^\n]*(?:orderAccessToken|turnstileToken|authorization|email|phone)/i);
  assert.doesNotMatch(source, /SHOP_KEY_ENCRYPTION_SECRET|NOTION_SHOP_TOKEN|PAYOS_WEBHOOK_SECRET|CASSO_WEBHOOK_SECRET/);
});

test("public checkout reserves Telegram synthetic identity mailboxes", () => {
  const service = read("src/lib/shop/service.ts");
  const validation = read("src/lib/shop/validation.ts");
  assert.match(validation, /isTelegramSyntheticEmail/);
  assert.match(validation, /sourceChannel === "web" && email && isTelegramSyntheticEmail\(email\)/);
  assert.match(service, /\(input\.sourceChannel \?\? "web"\) !== "web" \|\| isTelegramSyntheticEmail\(input\.customer\.email\)/);
  assert.match(service, /checkout_identity_reserved/);
});

test("public order status uses bearer access, no-store and excludes customer/key data", () => {
  const source = read("src/pages/api/shop/order.ts");
  assert.match(source, /authorization/);
  assert.match(source, /Bearer/);
  assert.match(source, /no-store/);
  assert.match(source, /getPublicShopOrderStatus/);
  assert.doesNotMatch(source, /customer_email|customer_name|ciphertext|plaintext|SHOP_KEY_ENCRYPTION_SECRET/i);
});

test("authenticated order QR proxy safely serves only validated VietQR images", () => {
  const source = read("src/pages/api/shop/order-qr.ts");
  assert.match(source, /authorization/);
  assert.match(source, /getPublicShopOrderStatus/);
  assert.match(source, /img\.vietqr\.io/);
  assert.match(source, /MAX_QR_BYTES/);
  assert.match(source, /isSupportedQrImage/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /SHOP_KEY_ENCRYPTION_SECRET|customer_email|plaintext/i);
  const orderPage = read("src/components/pages/OrderPage.astro");
  assert.match(orderPage, /\/api\/shop\/order-qr/);
  assert.match(orderPage, /URL\.createObjectURL/);
  assert.match(orderPage, /qrPreparing/);
  assert.match(orderPage, /\.pay-card__qr-empty\[hidden\]/);
  assert.match(orderPage, /display:\s*none\s*!important/);
});

test("public delivery requires the order bearer and never persists or logs plaintext keys", () => {
  const source = read("src/pages/api/shop/delivery.ts");
  const service = read("src/lib/shop/service.ts");
  assert.match(source, /Bearer \(\[A-Za-z0-9_\-\]\{43\}\)/);
  assert.match(source, /no-store/);
  assert.match(source, /deliverPublicShopOrder/);
  assert.match(service, /order_delivery_in_progress/);
  assert.match(service, /openInventoryKey/);
  assert.match(service, /confirmFulfillmentDelivery/);
  assert.match(service, /SELECT status, fulfillment_status, fulfilled_at/);
  assert.match(service, /state: orderFulfilled \? "fulfilled" : "paid"/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:plaintext|key|token|authorization)/i);
});

test("storefront routes checkout through cart stages and private order views", () => {
  const product = read("src/components/pages/ProductPage.astro");
  const cart = read("src/components/pages/CartPage.astro");
  const order = read("src/components/pages/OrderPage.astro");
  // Product is add-to-cart / buy-now only — no duplicate checkout form.
  assert.match(product, /data-product-add-to-cart/);
  assert.match(product, /data-product-buy-now/);
  assert.doesNotMatch(product, /data-shop-checkout-form/);
  assert.doesNotMatch(product, /\/api\/shop\/checkout/);
  // Cart owns checkout POST + Turnstile.
  assert.match(cart, /data-cart-checkout-form/);
  assert.match(cart, /\/api\/shop\/checkout/);
  assert.match(cart, /idempotencyKey/);
  assert.match(cart, /turnstile/);
  assert.match(cart, /data-stage="1"/);
  assert.match(cart, /data-stage="2"/);
  assert.match(cart, /authenticated/);
  assert.match(cart, /customerDisplayName/);
  assert.match(cart, /customerEmail/);
  assert.match(cart, /customer_auth_required/);
  assert.match(cart, /window\.location\.assign\(loginHref\)/);
  // Discount apply UX: explicit apply button + live summary update via quote API.
  assert.match(cart, /data-cart-discount-apply/);
  assert.match(cart, /data-cart-discount-clear/);
  assert.match(cart, /data-cart-summary-discount/);
  assert.match(cart, /data-cart-summary-subtotal/);
  assert.match(cart, /\/api\/shop\/quote/);
  assert.match(cart, /applyDiscountCode/);
  assert.match(cart, /data-cart-discount-benefit/);
  assert.match(cart, /discountRequestController/);
  assert.match(cart, /discount_quote_rate_limited/);
  assert.ok(existsSync(`${root}src/pages/api/shop/quote.ts`));
  const quote = read("src/pages/api/shop/quote.ts");
  assert.match(quote, /previewPublicCheckoutQuote/);
  assert.match(quote, /validateCheckoutQuoteInput/);
  assert.match(quote, /customer_auth_required/);
  assert.match(quote, /retry-after/);
  assert.match(quote, /discount:\s*result\.discount/);
  assert.match(quote, /discount_invalid/);
  assert.doesNotMatch(quote, /createPublicShopCheckout|createCheckoutOrder/);
  const service = read("src/lib/shop/service.ts");
  assert.match(service, /discount-quote:/);
  assert.match(service, /consumeCheckoutRateLimit/);
  assert.match(service, /discount_quote_rate_limited/);
  // Order page exclusive pay / verify / deliver views.
  assert.match(order, /\/api\/shop\/order/);
  assert.match(order, /Bearer/);
  assert.match(order, /sessionStorage/);
  assert.match(order, /data-view-panel="pay"/);
  assert.match(order, /data-view-panel="verify"/);
  assert.match(order, /data-view-panel="deliver"/);
  assert.doesNotMatch(order, /localStorage/);
  for (const locale of ["vi", "en", "ja", "zh"]) {
    assert.match(read("src/i18n/shop.ts"), new RegExp(`${locale}:`));
    assert.match(read("src/i18n/shop.ts"), /flow:\s*\{/);
    assert.match(read("src/i18n/shop.ts"), /discountApply:/);
    assert.match(read("src/i18n/shop.ts"), /discountInvalid:/);
  }
});

test("default and localized order routes exist and are not indexable", () => {
  assert.ok(existsSync(`${root}src/pages/shop/order.astro`));
  const dispatcher = read("src/pages/[lang]/[...slug].astro");
  assert.match(dispatcher, /isOrderStatus/);
  assert.match(dispatcher, /<OrderPage/);
  assert.match(read("src/components/pages/OrderPage.astro"), /noindex=\{true\}/);
});

test("payment image CSP allows only the VietQR image host used by the service", () => {
  const middleware = read("src/middleware.ts");
  const headers = read("public/_headers");
  assert.match(middleware, /img\.vietqr\.io/);
  assert.match(middleware, /api\.qrserver\.com/);
  assert.doesNotMatch(middleware, /img-src[^;]*\*/);
  // Static asset headers must stay aligned so QR images are not blocked if
  // middleware and _headers are both applied on a path.
  assert.match(headers, /img\.vietqr\.io/);
  assert.match(headers, /api\.qrserver\.com/);
});
