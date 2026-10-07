import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

test("admin bindings include shop secrets without placing values in Wrangler config", () => {
  const adminTypes = read("src/lib/admin/types.ts");
  const runtimeBindings = read("src/runtime-bindings.d.ts");
  const wrangler = read("wrangler.jsonc");
  assert.match(adminTypes, /AdminBindings\s*=\s*ShopBindings\s*&/);
  for (const binding of [
    "SHOP_KEY_ENCRYPTION_SECRET",
    "VIETQR_BANK_ACCOUNT",
    "PAYOS_CLIENT_ID",
    "PAYOS_API_KEY",
    "PAYOS_CHECKSUM_KEY",
    "NOTION_SHOP_TOKEN",
    "SHOP_TELEGRAM_VPS_SECRET",
  ]) {
    assert.match(runtimeBindings, new RegExp(`\\b${binding}\\b`));
    assert.doesNotMatch(wrangler, new RegExp(`"${binding}"\\s*:`));
  }
  assert.match(wrangler, /"SHOP_KEY_ENCRYPTION_KEY_VERSION"\s*:\s*"v1"/);
});

test("admin inventory import fails closed before reading plaintext keys and uses the shop service", () => {
  const catalog = read("src/lib/admin/router/shop/catalog.ts");
  const inventoryStart = catalog.indexOf('resource !== "inventory"');
  const inventory = catalog.slice(inventoryStart);
  assert.ok(inventoryStart >= 0);
  assert.ok(inventory.indexOf("requireShopCrypto(bindings)") < inventory.indexOf("readJsonObject(request"));
  assert.match(inventory, /importInventoryKeys\(bindings, parsed\.value, actor, requestId\)/);
  assert.doesNotMatch(inventory, /sealInventoryKey|insertEncryptedInventoryUnits|plaintextKey/);
});

test("admin inventory summary exposes only coarse crypto readiness", () => {
  const catalog = read("src/lib/admin/router/shop/catalog.ts");
  const inventoryStart = catalog.indexOf('resource !== "inventory"');
  const inventory = catalog.slice(inventoryStart);
  assert.match(inventory, /cryptoReady/);
  assert.match(inventory, /cryptoStatus:\s*cryptoReady \? "ready" : "not_configured"/);
  assert.match(inventory, /await requireShopCrypto\(bindings\)/);
  assert.doesNotMatch(inventory, /SHOP_KEY_ENCRYPTION_SECRET\s*[,}]/);
});

test("shop categories have a canonical CRUD boundary and product selector", () => {
  const migration = read("content-migrations/0017_shop_categories.sql");
  const catalog = read("src/lib/admin/router/shop/catalog.ts");
  const repository = read("src/lib/shop/repository.ts");
  const admin = read("src/components/admin/shop/CatalogTab.tsx") + read("src/components/admin/shop/ProductDialog.tsx");
  const workspace = read("src/components/admin/shop/CatalogTab.tsx");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS shop_categories/);
  assert.match(migration, /uq_shop_categories_slug_active/);
  assert.match(migration, /shop_category_localizations/);
  assert.match(catalog, /resource !== "categories"/);
  assert.match(catalog, /createShopCategory\(/);
  assert.match(catalog, /updateShopCategory\(/);
  assert.match(catalog, /archiveShopCategory\(/);
  assert.match(repository, /category_slug_in_use/);
  assert.match(repository, /category_in_use/);
  assert.match(repository, /category_not_found/);
  assert.match(repository, /shop_category_localizations/);
  assert.match(workspace, /\+ Danh mục|setDialog\(\{ kind: "category" \}\)/);
  assert.match(read("src/components/admin/shop/useShop.tsx"), /shopApi<\{ categories\?: CategoryRow\[\] \}>\("categories"\)/);
  assert.match(read("src/components/admin/shop/QuickCreateDialog.tsx"), /categories\.filter\(\(category\) => category\.status === "active"\)/);
  assert.match(admin, /đã lưu trữ/);
  // Product type drives variant fulfillment defaults in one place.
  assert.match(admin, /export function productTypeDefaults\(type: string\)/);
  assert.match(admin, /productTypeDefaults\(productType\)/);
  assert.match(admin, /fulfillmentType: "license_key", deliveryMode: "automatic", inventoryPolicy: "tracked"/);
});

test("admin payment configuration is fixed to payOS and exposes no manual reconciliation path", () => {
  const payments = read("src/lib/admin/router/shop/payments.ts");
  const shared = read("src/lib/admin/router/shop/shared.ts");
  const api = [payments, shared].join("\n");
  assert.match(shared, /accountRef\s*!==\s*"VIETQR_BANK_ACCOUNT"/);
  assert.match(shared, /confirmationAdapter\s*!==\s*"payos"/);
  assert.match(shared, /secretRef\s*!==\s*"PAYOS_CHECKSUM_KEY"/);
  assert.match(shared, /PAYOS_CLIENT_ID/);
  assert.match(shared, /PAYOS_API_KEY/);
  assert.match(shared, /PAYOS_CHECKSUM_KEY/);
  assert.match(payments, /validatePaymentProviderConfigInput\s*\(/);
  assert.doesNotMatch(api, /CASSO_WEBHOOK_SECRET|GENERIC_PAYMENT_WEBHOOK_SECRET/);
  assert.doesNotMatch(api, /segments\[2\]\s*===\s*["']attempts["']/);
  assert.doesNotMatch(api, /segments\[2\]\s*===\s*["']reconcile["']/);
  assert.doesNotMatch(api, /reconcilePaymentConfirmation\s*\(|validatePaymentConfirmation\s*\(|signatureVerified:\s*true/);
  assert.doesNotMatch(api, /console\.(?:log|error)\([^)]*(?:payload|signature|secret|ciphertext|plaintextKey)/i);
});

test("admin order detail exposes operational state but never key material or bearer hashes", () => {
  const opsRepository = read("src/lib/shop/ops-repository.ts");
  const detailStart = opsRepository.indexOf("export async function getShopOrderDetail");
  const detailEnd = opsRepository.indexOf("export async function listPaymentWorkbench", detailStart);
  const detail = opsRepository.slice(detailStart, detailEnd);
  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  for (const field of ["shop_order_items", "shop_payment_attempts", "shop_payment_events", "shop_fulfillment_events"]) assert.match(detail, new RegExp(field));
  assert.doesNotMatch(detail, /public_token_hash|ciphertext|wrapped_dek|key_fingerprint|plaintext|license_key/i);
  assert.doesNotMatch(detail, /payload_hash|signature_verified|destination_account|account_number/i);
});

test("admin surfaces durable payment attention without exposing signed payload evidence", () => {
  const opsRepository = read("src/lib/shop/ops-repository.ts");
  const overviewStart = opsRepository.indexOf("export async function getShopOverviewSnapshot");
  const overviewEnd = opsRepository.indexOf("export type AdminOrdersPage", overviewStart);
  const overview = opsRepository.slice(overviewStart, overviewEnd);
  const paymentStart = opsRepository.indexOf("export async function listPaymentWorkbench");
  const paymentEnd = opsRepository.indexOf("export async function getVietQrProviderRow", paymentStart);
  const payment = opsRepository.slice(paymentStart, paymentEnd);
  assert.ok(overviewStart >= 0 && overviewEnd > overviewStart);
  assert.ok(paymentStart >= 0 && paymentEnd > paymentStart);
  assert.match(overview, /event_type = 'payment\.attention'/);
  assert.match(payment, /attentionEvents/);
  assert.match(payment, /event_type AS eventType/);
  assert.match(payment, /error_code AS errorCode/);
  assert.match(payment, /occurred_at AS occurredAt/);
  assert.match(payment, /WHERE event_type = 'payment\.attention' OR processing_state = 'rejected'/);
  assert.doesNotMatch(payment, /payload_hash|signature_verified|destination_account|account_number|provider_event_id/i);

  const useShop = read("src/components/admin/shop/useShop.tsx");
  assert.match(useShop, /paymentAttention: \[\]/);
  assert.match(useShop, /data\.attentionEvents \|\| \[\]/);
  assert.match(read("src/components/admin/shop/PaymentsTab.tsx"), /event\.errorCode/);
});

test("admin maintenance can release expired shop reservations through the authenticated API", () => {
  const ops = read("src/lib/admin/router/shop/ops.ts");
  assert.match(ops, /resource !== "maintenance"/);
  assert.match(ops, /runShopExpirySweep\(\{/);
  assert.match(ops, /PAYOS_CHECKSUM_KEY:\s*bindings\.PAYOS_CHECKSUM_KEY/);
});

test("Cloudflare cron calls a private maintenance hook and never runs without its secret", () => {
  const wrangler = read("wrangler.jsonc");
  const maintenance = read("src/pages/api/shop/maintenance.ts");
  const entry = read("scripts/prepare-worker-entry.mjs");
  // Every 5 minutes is deliberate: the sweep ran 1,440 times a day before and
  // the work it does is on a 15-30 minute business clock.
  assert.match(wrangler, /\"crons\"\s*:\s*\[\s*\"\*\/5 \* \* \* \*\"\s*\]/);
  assert.match(maintenance, /SHOP_CRON_SECRET/);
  assert.match(maintenance, /maintenance_unauthorized/);
  assert.match(maintenance, /runShopExpirySweep/);
  assert.match(maintenance, /PAYOS_CLIENT_ID:\s*env\.PAYOS_CLIENT_ID/);
  assert.match(maintenance, /VIETQR_BANK_ACCOUNT:\s*env\.VIETQR_BANK_ACCOUNT/);
  assert.match(entry, /api\/shop\/maintenance/);
  assert.match(entry, /scheduled\(controller, env, context\)/);
  assert.match(entry, /"content-type": "application\/json"/);
  assert.match(entry, /body: "\{\}"/);
});
