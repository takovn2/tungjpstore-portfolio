import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Telegram Mini App discounts use a session-bound quote and never create an order", () => {
  const route = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const commerce = read("src/lib/shop/telegram-commerce.ts");
  const page = read("src/pages/telegram/shop.astro");
  assert.match(route, /segments\[0\] === "quote"/);
  assert.match(route, /previewTelegramItems/);
  assert.match(route, /validateCheckoutQuoteInput/);
  assert.match(route, /error\.code === "discount_quote_rate_limited"/);
  assert.match(route, /response\.headers\.set\("retry-after", "60"\)/);
  assert.match(commerce, /previewCheckoutQuote/);
  assert.match(commerce, /telegram-discount-quote:/);
  assert.match(commerce, /i\.provider = 'telegram'/);
  assert.match(commerce, /i\.customer_id = \?/);
  assert.doesNotMatch(route.slice(route.indexOf('segments[0] === "quote"'), route.indexOf('segments[0] === "orders"')), /checkoutTelegramItems/);
  assert.match(page, /id="discount-code"/);
  assert.match(page, /requestDiscountQuote/);
  assert.match(page, /api\("quote"/);
  assert.match(page, /discountCode \? \{ discountCode \}/);
  assert.match(page, /cartFingerprint/);
  assert.match(page, /discount_quote_rate_limited/);
});

test("Telegram Mini App checkout validates discount codes before order creation", () => {
  const route = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const checkoutStart = route.indexOf('segments[0] === "checkout"');
  const checkoutTail = route.slice(checkoutStart);
  assert.ok(checkoutStart >= 0);
  assert.match(checkoutTail, /validateCheckoutQuoteInput/);
  assert.match(checkoutTail, /invalid_payload/);
  assert.match(checkoutTail, /checkoutTelegramItems/);
  assert.ok(checkoutTail.indexOf("validateCheckoutQuoteInput") < checkoutTail.indexOf("checkoutTelegramItems"));
});

test("Telegram Mini App Vietnam checkout accepts platform externalReference for order + VietQR", () => {
  const route = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const commerce = read("src/lib/shop/telegram-commerce.ts");
  const page = read("src/pages/telegram/shop.astro");
  const checkoutStart = route.indexOf('segments[0] === "checkout"');
  assert.ok(checkoutStart >= 0);
  const checkoutTail = route.slice(checkoutStart, checkoutStart + 2_800);
  // Platform-wave Mini App always posts externalReference; rejecting it
  // blocked order creation, QR generation, payment confirmation and keys.
  assert.match(checkoutTail, /allowedCheckoutKeys/);
  assert.match(checkoutTail, /"externalReference"/);
  assert.match(checkoutTail, /externalReference \? \{ externalReference \}/);
  assert.match(commerce, /externalReference\?: string \| null/);
  assert.match(commerce, /\.\.\.\(externalReference \? \{ externalReference \} : \{\}\)/);
  assert.match(page, /externalReference/);
  assert.match(page, /api\("checkout"/);
});
