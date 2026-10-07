import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("GLB Store has an independent English/USD Telegram Mini App surface", () => {
  const page = read("src/pages/telegram/glb.astro");
  const route = read("src/pages/api/shop/glb-mini/[...path].ts");
  const webhook = read("src/pages/api/telegram/glb-webhook.ts");
  assert.match(page, /<html lang="en" data-currency="USD">/);
  assert.match(page, /GLB STORE/);
  assert.match(page, /\/api\/shop\/glb-mini\//);
  assert.match(page, /USDT/);
  assert.match(page, /USDC/);
  assert.match(page, /Bybit/);
  assert.match(page, /Binance/);
  assert.match(page, /ERC20/);
  assert.match(page, /BEP20/);
  assert.match(page, /SOLANA/);
  assert.match(page, /POLYGON/);
  assert.match(page, /payment-proof-form/);
  assert.match(page, /Confirm payment/);
  assert.match(page, /manual review/);
  assert.match(page, /Payment approved/);
  assert.match(page, /deliveryReadiness/);
  assert.match(page, /data-keys/);
  assert.match(page, /await loadOrders\(\)/);
  assert.match(page, /orders\/\$\{encodeURIComponent\(state\.payment\.orderId\)\}\/payment-proof/);
  assert.match(page, /orders\/\$\{encodeURIComponent\(state\.payment\.orderId\)\}\/status/);
  assert.match(page, /Still awaiting manual review/);
  assert.match(route, /readPaymentProofMultipart/);
  assert.match(route, /submitPaymentProof/);
  assert.match(route, /statusSummaryForGlbTelegramOrder/);
  assert.doesNotMatch(page, /VietQR|PayOS|Thanh toán/);
  assert.doesNotMatch(page, /Verification runs against the selected provider|Detected · verifying|Crypto verification is not configured/);
  assert.match(route, /const GLB_SCOPE = "glb"/);
  assert.match(route, /const hinted = hint[\s\S]*const ordered = hinted\.length \? hinted : credentials/);
  assert.match(route, /locale: "en"/);
  assert.match(route, /pricingCurrency: "USD"/);
  assert.match(route, /listPublicCryptoPaymentMethods/);
  assert.match(webhook, /resolveTelegramBotByWebhookSecret\([^\n]*"glb"\)/);
  assert.match(webhook, /\/telegram\/glb/);
});

test("GLB storefront scope is explicit in the payment schema", () => {
  const migration = read("content-migrations/0045_shop_crypto_storefront_scope.sql");
  const config = read("src/lib/shop/telegram-bot-config.ts");
  assert.match(migration, /storefront_scope TEXT NOT NULL DEFAULT 'glb'/);
  assert.match(config, /scope === "glb" \? "/);
  assert.match(config, /\/api\/telegram\/glb-webhook/);
});

test("legacy Telegram webhook keeps registry-managed orders isolated by bot", () => {
  const webhook = read("src/pages/api/telegram/webhook.ts");
  assert.match(webhook, /handleUpdate\(parsed\.update, locale, runtime\.configId/);
  assert.match(webhook, /listTelegramCustomerOrders\(commerceBindings\(\), customer\.customerId, 10, botConfigId\)/);
  assert.match(webhook, /statusForTelegramOrder\(commerceBindings\(\), customer\.customerId, orderId, botConfigId\)/);
  assert.match(webhook, /checkoutTelegramCart\(commerceBindings\(\), \{[\s\S]*botConfigId/);
  assert.match(webhook, /buyVariantFromTelegram\(commerceBindings\(\), \{[\s\S]*botConfigId/);
});
