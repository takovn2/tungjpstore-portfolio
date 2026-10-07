import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("Legacy Telegram channel contract remains bearer-gated while its VPS outbox is retired", () => {
  const route = read("src/pages/api/shop/telegram/[...path].ts");
  const auth = read("src/lib/shop/integration-auth.ts");
  const repository = read("src/lib/shop/repository.ts");
  assert.match(route, /SHOP_TELEGRAM_VPS_SECRET/);
  assert.match(route, /verifyShopIntegrationBearer/);
  for (const path of ["catalog", "checkout", "order", "delivery", "outbox"]) assert.match(route, new RegExp(`resource === ["']${path}["']`));
  assert.match(route, /sourceChannel:\s*["']telegram["']/);
  assert.match(route, /X-Order-Access-Token|x-order-access-token/);
  assert.match(route, /legacy_outbox_retired/);
  assert.doesNotMatch(route, /claimWebhookOutbox|markWebhookDelivered|markWebhookFailed|X-Shop-Lease-Token|x-shop-lease-token|destination:\s*["']telegram_vps["']/);
  assert.match(auth, /constantTimeEqual/);
  assert.doesNotMatch(route, /ADMIN_AUTH_SECRET|SHOP_KEY_ENCRYPTION_SECRET|NOTION_SHOP_TOKEN/);
  assert.doesNotMatch(route, /console\.(?:log|error)\([^\n]*(?:plaintext|key|token|authorization)/i);
  assert.match(repository, /'telegram_worker'[\s\S]{0,320}source_channel = 'telegram'/);
  assert.doesNotMatch(repository, /CASE WHEN source_channel = 'telegram' THEN 'telegram_worker' ELSE 'telegram_vps'/);
});

test("Notion integration is editorial preview-only and does not write shop state", () => {
  const notion = read("src/lib/shop/notion.ts");
  const integrations = read("src/lib/admin/router/shop/integrations.ts");
  const docs = read("docs/shop-integrations.md");
  assert.match(notion, /previewNotionEditorialSync/);
  assert.match(notion, /productPlanning/);
  assert.match(notion, /writeMode:\s*["']preview_only["']/);
  assert.match(notion, /MAX_RESPONSE_BYTES/);
  assert.match(integrations, /previewNotionEditorialSync/);
  assert.match(integrations, /segments\[2\] !== ["']notion["']/);
  assert.match(docs, /D1.*source of truth/i);
  assert.match(docs, /NOTION_SHOP_TOKEN/);
  assert.match(docs, /SHOP_TELEGRAM_VPS_SECRET/);
  assert.doesNotMatch(notion, /db\.prepare|INSERT\s+INTO|UPDATE\s+shop_|DELETE\s+FROM/);
});

test("Telegram fulfillment is explicitly tagged as telegram while storefront keeps web default", () => {
  const service = read("src/lib/shop/service.ts");
  assert.match(service, /channel:\s*["']web["'] \| ["']telegram["'] \| ["']account["'] = ["']web["']/);
  assert.match(service, /const fulfillmentChannel = channel === ["']account["'] \? ["']web["'] : channel/);
  assert.match(service, /claimFulfillmentDelivery\(bindings, item\.id, 90, fulfillmentChannel\)/);
  assert.match(service, /channel === ["']telegram["'] \? ["']telegram-vps["']/);
});
