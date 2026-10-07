import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

async function bundleModule(entryPoint) {
  const result = await build({
    entryPoints: [`${projectRoot}/${entryPoint}`],
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const shopModulePromise = bundleModule("src/lib/shop/index.ts");
const webhookModulePromise = bundleModule("src/lib/shop/webhook-auth.ts");

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of [
    "0001_content_cms.sql",
    "0009_shop_core.sql",
    "0011_payos_payment_link_fields.sql",
    "0012_payos_reconciliation_guards.sql",
    "0013_shop_idempotency_and_outbox_leases.sql",
    "0014_shop_inventory_operations.sql",
    "0015_shop_telegram_updates.sql",
    "0016_shop_telegram_recipients.sql",
    "0017_shop_categories.sql",
    "0018_shop_telegram_recipient_identity.sql",
    "0019_shop_email_outbox.sql",
    "0025_payos_dynamic_accounts.sql",
    "0036_payos_telegram_recovery_leases.sql",
  ]) {
    if (existsSync(`${projectRoot}/content-migrations/${migration}`)) {
      sqlite.exec(read(`content-migrations/${migration}`));
    }
  }

  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) {
          bindings = values;
          return prepared;
        },
        async first() {
          return statement.get(...bindings) ?? null;
        },
        async all() {
          return { results: statement.all(...bindings) };
        },
        async run() {
          const result = statement.run(...bindings);
          return { ...result, meta: { changes: Number(result.changes) } };
        },
        __run() {
          const result = statement.run(...bindings);
          return { ...result, meta: { changes: Number(result.changes) } };
        },
      };
      return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.__run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}

function canonicalPayOsData(data) {
  return Object.keys(data).sort().map((key) => {
    const value = data[key];
    return `${key}=${value === null || value === undefined ? "" : String(value)}`;
  }).join("&");
}

function signedPayOsEnvelope(data, checksumKey) {
  return JSON.stringify({
    code: "00",
    desc: "success",
    success: true,
    data,
    signature: createHmac("sha256", checksumKey).update(canonicalPayOsData(data)).digest("hex"),
  });
}

function localizedProduct(title) {
  return Object.fromEntries(["vi", "en", "ja", "zh"].map((locale) => [locale, {
    title: `${title} ${locale}`,
    eyebrow: "DigiStore",
    shortDescription: "Bản quyền số giao tự động ngay sau khi thanh toán được xác minh.",
    description: "Sản phẩm số chính hãng với kiểm kho theo từng key và giao hàng tự động an toàn.",
    seoTitle: `${title} ${locale} - DigiStore`,
    seoDescription: "Mua bản quyền số chính hãng, thanh toán bảo mật và nhận key tự động.",
  }]));
}

function localizedVariant(title) {
  return Object.fromEntries(["vi", "en", "ja", "zh"].map((locale) => [locale, {
    title: `${title} ${locale}`,
    optionSummary: "1 thiết bị / 12 tháng",
  }]));
}

test("commerce lifecycle creates, publishes, sells, confirms and delivers one encrypted key exactly once", async () => {
  const [shop, webhook] = await Promise.all([shopModulePromise, webhookModulePromise]);
  const { db, sqlite } = createD1();
  const actor = { id: "commerce-e2e", channel: "admin" };
  const plaintextKey = "DIGISTORE-E2E-KEY-0001";
  const checksumKey = "local-payos-checksum-key-at-least-32-bytes";
  const accountNumber = "0123456789";
  const payOsVirtualAccount = "10142607258539241";
  const encryptionSecret = Buffer.alloc(32, 0x5a).toString("base64url");
  const bindings = {
    CONTENT_DB: db,
    PAYOS_API_KEY: "local-payos-api-key",
    PAYOS_CHECKSUM_KEY: checksumKey,
    PAYOS_CLIENT_ID: "local-payos-client-id",
    SHOP_KEY_ENCRYPTION_KEY_VERSION: "v1",
    SHOP_KEY_ENCRYPTION_SECRET: encryptionSecret,
    SHOP_ORDER_TOKEN_SECRET: Buffer.alloc(32, 0x6b).toString("base64url"),
    SHOP_PUBLIC_ORIGIN: "https://tung.codes",
    VIETQR_BANK_ACCOUNT: accountNumber,
  };

  const categoryCandidate = shop.validateShopCategoryInput({
    slug: "software",
    status: "active",
    sortOrder: 10,
    defaultLocale: "vi",
    localizations: {
      vi: { title: "Phần mềm", description: "Bản quyền phần mềm giao tự động." },
      en: { title: "Software", description: "Automatically delivered software licenses." },
      ja: { title: "ソフトウェア", description: "自動配信されるソフトウェアライセンス。" },
      zh: { title: "软件", description: "自动交付的软件许可证。" },
    },
  });
  assert.equal(categoryCandidate.ok, true, JSON.stringify(categoryCandidate));
  const category = await shop.createShopCategory(db, categoryCandidate.value, actor, "e2e-category-create");
  assert.equal(category.slug, "software");

  const productCandidate = shop.validateProductUpsertInput({
    slug: "cloud-pro-license",
    status: "active",
    productType: "digital_key",
    featured: true,
    sortOrder: 1,
    defaultLocale: "vi",
    metadata: { badges: ["Giao ngay", "Chính hãng"], categorySlug: "software" },
    localizations: localizedProduct("Cloud Pro License"),
    variants: [{
      id: "variant-cloud-pro-yearly",
      sku: "CLOUD-PRO-YEARLY",
      status: "active",
      fulfillmentType: "license_key",
      deliveryMode: "automatic",
      inventoryPolicy: "tracked",
      priceMinor: 120_000,
      compareAtMinor: 150_000,
      currency: "VND",
      lowStockThreshold: 1,
      maxPerOrder: 3,
      optionValues: { duration: "12-months", devices: "1" },
      metadata: {},
      localizations: localizedVariant("Cloud Pro 12 tháng"),
    }],
    media: [{
      id: "media-cloud-pro-cover",
      variantId: null,
      mediaId: null,
      type: "image",
      url: "https://media.tung.codes/shop/cloud-pro-license.webp",
      alt: "Cloud Pro License",
      sortOrder: 0,
    }],
  });
  assert.equal(productCandidate.ok, true, JSON.stringify(productCandidate));
  const product = await shop.createShopProduct(db, productCandidate.value, actor, "e2e-product-create");
  assert.equal(product.status, "active");
  const variantId = product.variants[0].id;

  const previewCandidate = shop.validateInventoryImportPreviewInput({
    variantId,
    rows: [plaintextKey],
    sourceFormat: "txt",
    sourceName: "local-e2e-keys.txt",
    idempotencyKey: "local-e2e-import-preview-0001",
  });
  assert.equal(previewCandidate.ok, true, JSON.stringify(previewCandidate));
  const preview = await shop.previewInventoryImport(bindings, previewCandidate.value, actor, "e2e-key-preview");
  assert.deepEqual({ validRows: preview.validRows, invalidCount: preview.invalidCount, chunkCount: preview.chunkCount }, {
    validRows: 1,
    invalidCount: 0,
    chunkCount: 1,
  });
  const commitCandidate = shop.validateInventoryImportChunkInput({
    batchId: preview.batchId,
    chunkIndex: 0,
    rows: [{ lineNumber: 1, key: plaintextKey }],
  });
  assert.equal(commitCandidate.ok, true, JSON.stringify(commitCandidate));
  const imported = await shop.commitInventoryImport(bindings, commitCandidate.value, actor, "e2e-key-commit");
  assert.equal(imported.importedCount, 1);

  const storefront = await shop.listPublicProducts(db, { locale: "vi", limit: 24 });
  assert.equal(storefront.length, 1);
  assert.deepEqual({
    slug: storefront[0].slug,
    category: storefront[0].category,
    categorySlug: storefront[0].categorySlug,
    availability: storefront[0].availability,
    availableQuantity: storefront[0].variants[0].availableQuantity,
    mediaUrl: storefront[0].media[0].url,
  }, {
    slug: "cloud-pro-license",
    category: "Phần mềm",
    categorySlug: "software",
    availability: "low_stock",
    availableQuantity: 1,
    mediaUrl: "https://media.tung.codes/shop/cloud-pro-license.webp",
  });

  const providerCandidate = shop.validatePaymentProviderConfigInput({
    displayName: "PayOS VietQR local",
    status: "active",
    provider: "vietqr",
    bankId: "970436",
    accountRef: "VIETQR_BANK_ACCOUNT",
    accountNameDisplay: "DIGISTORE LOCAL",
    qrTemplate: "compact2",
    confirmationAdapter: "payos",
    secretRef: "PAYOS_CHECKSUM_KEY",
    publicConfig: {},
  });
  assert.equal(providerCandidate.ok, true, JSON.stringify(providerCandidate));
  await shop.createPaymentProviderConfig(db, providerCandidate.value, actor, "e2e-provider-create");

  const cartCandidate = shop.validateCreateCheckoutInput({
    customer: {
      email: "buyer@example.invalid",
      displayName: "Local Buyer",
      locale: "vi",
      marketingConsent: false,
    },
    items: [{ variantId: storefront[0].variants[0].id, quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
  });
  assert.equal(cartCandidate.ok, true, JSON.stringify(cartCandidate));

  const originalFetch = globalThis.fetch;
  let createPaymentRequests = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api-merchant.payos.vn/v2/payment-requests");
    assert.equal(init?.method, "POST");
    createPaymentRequests += 1;
    const requestBody = JSON.parse(String(init?.body));
    assert.equal(requestBody.amount, 120_000);
    assert.equal(requestBody.cancelUrl, "https://tung.codes/shop/order?payment=cancelled");
    assert.equal(requestBody.returnUrl, "https://tung.codes/shop/order?payment=success");
    const data = {
      bin: "970436",
      accountNumber: payOsVirtualAccount,
      accountName: "DIGISTORE LOCAL",
      amount: requestBody.amount,
      description: requestBody.description,
      orderCode: requestBody.orderCode,
      currency: "VND",
      paymentLinkId: "paylink-local-e2e-0001",
      status: "PENDING",
      checkoutUrl: "https://pay.payos.vn/web/paylink-local-e2e-0001",
      qrCode: "00020101021238570010A0000007270127000697043601130123456789",
    };
    const signature = createHmac("sha256", checksumKey).update(canonicalPayOsData(data)).digest("hex");
    return new Response(JSON.stringify({ code: "00", desc: "success", data, signature }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  let checkout;
  try {
    checkout = await shop.createPublicShopCheckout(
      bindings,
      cartCandidate.value,
      "local-e2e-checkout-0001",
      "e2e-checkout",
      "203.0.113.10",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(createPaymentRequests, 1);
  assert.equal(checkout.paymentConfiguration, "ready");
  assert.equal(checkout.order.totalMinor, 120_000);
  assert.equal(checkout.order.lines.length, 1);
  assert.match(checkout.order.orderAccessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(checkout.payment.state, "awaiting_payment");
  assert.equal(checkout.payment.checkoutUrl, "https://pay.payos.vn/web/paylink-local-e2e-0001");
  assert.match(checkout.payment.paymentDescription, /^[A-Z0-9]{4,9}$/);

  sqlite.prepare(`UPDATE shop_payment_attempts SET qr_image_url = NULL,
      provider_bank_bin = NULL, provider_account_number = NULL WHERE order_id = ?`)
    .run(checkout.order.orderId);
  const recoveryAttempt = sqlite.prepare(`SELECT provider_description FROM shop_payment_attempts
    WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`).get(checkout.order.orderId);
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://pay.payos.vn/web/paylink-local-e2e-0001");
    const response = new Response(`<script>\\"quicklink\\":\\"https://img.vietqr.io/image/970436-${payOsVirtualAccount}-vietqr_pro.jpg?addInfo=${recoveryAttempt.provider_description}\\u0026amount=120000\\",\\"qrCode\\":\\"\\",\\"bankShortName\\":\\"VCB\\"</script>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  };
  let fallbackQrStatus;
  try {
    fallbackQrStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fallbackQrStatus.state, "awaiting_payment");
  const fallbackQrUrl = new URL(fallbackQrStatus.qrUrl);
  assert.equal(fallbackQrUrl.hostname, "img.vietqr.io");
  assert.equal(fallbackQrUrl.searchParams.get("amount"), "120000");
  assert.equal(fallbackQrUrl.searchParams.get("addInfo"), fallbackQrStatus.paymentDescription);
  assert.match(fallbackQrUrl.pathname, new RegExp(payOsVirtualAccount));
  assert.equal(fallbackQrStatus.statusDetailCode, null);

  // Merchant config BIN may drift; a stored payOS virtual destination must still render.
  sqlite.prepare("UPDATE shop_payment_provider_configs SET bank_id = 'invalid' WHERE provider = 'vietqr'").run();
  const configDriftStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  assert.ok(configDriftStatus.qrUrl);
  assert.match(configDriftStatus.qrUrl, new RegExp(payOsVirtualAccount));
  assert.equal(configDriftStatus.statusDetailCode, null);
  sqlite.prepare("UPDATE shop_payment_provider_configs SET bank_id = '970436' WHERE provider = 'vietqr'").run();

  // An existing payOS virtual destination is authoritative and must render
  // even if the merchant base-account secret is temporarily unavailable.
  const configuredMerchantAccount = bindings.VIETQR_BANK_ACCOUNT;
  bindings.VIETQR_BANK_ACCOUNT = "";
  const missingMerchantEnvStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  assert.ok(missingMerchantEnvStatus.qrUrl);
  assert.match(missingMerchantEnvStatus.qrUrl, new RegExp(payOsVirtualAccount));
  assert.equal(missingMerchantEnvStatus.statusDetailCode, null);
  bindings.VIETQR_BANK_ACCOUNT = configuredMerchantAccount;

  // Corrupt the stored image URL amount — local rebuild from the virtual
  // destination must still produce a correct VietQR for the order total.
  sqlite.prepare(`UPDATE shop_payment_attempts SET qr_image_url = ? WHERE order_id = ?`).run(
    `https://img.vietqr.io/image/970436-${payOsVirtualAccount}-compact2.jpg?amount=1&addInfo=${recoveryAttempt.provider_description}`,
    checkout.order.orderId,
  );
  const rebuiltQrStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  assert.ok(rebuiltQrStatus.qrUrl);
  assert.equal(new URL(rebuiltQrStatus.qrUrl).searchParams.get("amount"), "120000");
  assert.equal(new URL(rebuiltQrStatus.qrUrl).searchParams.get("addInfo"), rebuiltQrStatus.paymentDescription);
  assert.match(rebuiltQrStatus.qrUrl, new RegExp(payOsVirtualAccount));
  assert.equal(rebuiltQrStatus.statusDetailCode, null);

  // Without any destination identity and without a recoverable payOS link, do
  // not invent a base-account QR from VIETQR_BANK_ACCOUNT alone.
  sqlite.prepare(`UPDATE shop_payment_attempts SET qr_image_url = NULL, provider_reference = NULL,
      checkout_url = NULL, provider_bank_bin = NULL, provider_account_number = NULL WHERE order_id = ?`)
    .run(checkout.order.orderId);
  globalThis.fetch = async () => {
    throw new Error("network_unavailable_for_invalid_qr_case");
  };
  let invalidQrStatus;
  try {
    invalidQrStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(invalidQrStatus.qrUrl, null);
  assert.equal(invalidQrStatus.statusDetailCode, "payment_configuration_unavailable");
  // Restore a valid attempt row for the rest of the lifecycle (webhook / delivery).
  sqlite.prepare(`UPDATE shop_payment_attempts SET qr_image_url = ?, provider_reference = ?,
      checkout_url = ?, provider_bank_bin = '970436', provider_account_number = ? WHERE order_id = ?`).run(
    fallbackQrStatus.qrUrl,
    "paylink-local-e2e-0001",
    "https://pay.payos.vn/web/paylink-local-e2e-0001",
    payOsVirtualAccount,
    checkout.order.orderId,
  );

  const paymentAttempt = sqlite.prepare(`SELECT provider_order_code, provider_description, provider_reference
    FROM shop_payment_attempts WHERE order_id = ?`).get(checkout.order.orderId);
  const occurredAt = new Date(Date.now() - 1_000).toISOString();
  const webhookData = {
    orderCode: paymentAttempt.provider_order_code,
    amount: checkout.order.totalMinor,
    description: paymentAttempt.provider_description,
    accountNumber: payOsVirtualAccount,
    reference: "FT-LOCAL-E2E-0001",
    transactionDateTime: occurredAt,
    currency: "VND",
    paymentLinkId: paymentAttempt.provider_reference,
    code: "00",
    desc: "success",
    counterAccountBankId: "970436",
  };
  const webhookBody = signedPayOsEnvelope(webhookData, checksumKey);
  const authenticated = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body: webhookBody },
  ), checksumKey);
  assert.equal(authenticated.kind, "payment");
  const paid = await shop.reconcilePaymentConfirmation(
    db,
    authenticated.confirmation,
    { id: "payos-webhook", channel: "system" },
    "e2e-payment-confirmed",
    { payOsAccountNumber: accountNumber },
  );
  assert.equal(paid.outcome, "paid");

  const replayAuthenticated = await webhook.authenticatePayOsPaymentWebhook(new Request(
    "https://tung.codes/api/shop/payment-webhooks/payos",
    { method: "POST", headers: { "content-type": "application/json" }, body: webhookBody },
  ), checksumKey);
  const replay = await shop.reconcilePaymentConfirmation(
    db,
    replayAuthenticated.confirmation,
    { id: "payos-webhook", channel: "system" },
    "e2e-payment-replay",
    { payOsAccountNumber: accountNumber },
  );
  assert.equal(replay.outcome, "already_processed");

  const paidStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  assert.equal(paidStatus.state, "paid");
  const firstDelivery = await shop.deliverPublicShopOrder(bindings, checkout.order.orderAccessToken, "web");
  assert.equal(firstDelivery.state, "fulfilled");
  assert.deepEqual(firstDelivery.deliveries.flatMap((item) => item.keys), [plaintextKey]);
  const retryDelivery = await shop.deliverPublicShopOrder(bindings, checkout.order.orderAccessToken, "web");
  assert.equal(retryDelivery.state, "fulfilled");
  assert.deepEqual(retryDelivery.deliveries.flatMap((item) => item.keys), [plaintextKey]);
  const fulfilledStatus = await shop.getPublicShopOrderStatus(bindings, checkout.order.orderAccessToken);
  assert.equal(fulfilledStatus.state, "fulfilled");

  assert.deepEqual(
    { ...sqlite.prepare("SELECT status, payment_status, fulfillment_status FROM shop_orders WHERE id = ?").get(checkout.order.orderId) },
    { status: "fulfilled", payment_status: "paid", fulfillment_status: "fulfilled" },
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_payment_events WHERE provider = 'payos'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units WHERE status = 'fulfilled'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_allocations WHERE status = 'fulfilled'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_movements WHERE event_type = 'fulfilled'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_webhook_outbox").get().count, 0, "web orders must not enqueue retired Telegram VPS delivery");
  assert.deepEqual(
    sqlite.prepare("SELECT topic, COUNT(*) AS count FROM transactional_email_outbox GROUP BY topic ORDER BY topic").all()
      .map((row) => ({ ...row })),
    [
      { topic: "shop.order.created", count: 1 },
      { topic: "shop.order.fulfilled", count: 1 },
      { topic: "shop.order.payment_confirmed", count: 1 },
    ],
  );

  const storedInventory = sqlite.prepare(`SELECT ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64, key_fingerprint
    FROM shop_inventory_units LIMIT 1`).get();
  assert.doesNotMatch(JSON.stringify(storedInventory), new RegExp(plaintextKey));
  const persistedOperationalData = sqlite.prepare(`SELECT
    COALESCE((SELECT group_concat(details_json, '\n') FROM audit_logs), '') || '\n' ||
    COALESCE((SELECT group_concat(details_json, '\n') FROM shop_fulfillment_events), '') || '\n' ||
    COALESCE((SELECT group_concat(payload_json, '\n') FROM shop_webhook_outbox), '') AS value`).get().value;
  assert.doesNotMatch(persistedOperationalData, new RegExp(plaintextKey));

  const soldOutStorefront = await shop.listPublicProducts(db, { locale: "vi", limit: 24 });
  assert.equal(soldOutStorefront[0].availability, "out_of_stock");
  assert.equal(soldOutStorefront[0].variants[0].availableQuantity, 0);
  sqlite.close();
});
