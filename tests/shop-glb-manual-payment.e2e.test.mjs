import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

async function bundleShop() {
  const result = await build({
    entryPoints: [`${projectRoot}/src/lib/shop/index.ts`],
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

async function bundlePaymentProofs() {
  const result = await build({
    entryPoints: [`${projectRoot}/src/lib/shop/payment-proofs.ts`],
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  const stats = { queries: 0 };
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of [
    "0001_content_cms.sql",
    "0009_shop_core.sql",
    "0013_shop_idempotency_and_outbox_leases.sql",
    "0014_shop_inventory_operations.sql",
    "0016_shop_telegram_recipients.sql",
    "0018_shop_telegram_recipient_identity.sql",
    "0019_shop_email_outbox.sql",
    "0023_shop_customer_auth.sql",
    "0035_shop_telegram_mini_sessions.sql",
    "0039_shop_telegram_bot_scope.sql",
    "0042_shop_crypto_payments.sql",
    "0043_shop_currency_pricing.sql",
    "0045_shop_crypto_storefront_scope.sql",
    "0046_manual_crypto_payment_proofs.sql",
    "0062_shop_otp_bridge.sql",
    "0063_shop_otp_entitlement_policy.sql",
    "0064_shop_otp_validation_recovery.sql",
  ]) sqlite.exec(read(`content-migrations/${migration}`));

  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { stats.queries += 1; return statement.get(...bindings) ?? null; },
        async all() { stats.queries += 1; return { results: statement.all(...bindings) }; },
        async run() {
          stats.queries += 1;
          const result = statement.run(...bindings);
          return { ...result, meta: { changes: Number(result.changes) } };
        },
        __run() {
          stats.queries += 1;
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
  return { db, sqlite, stats };
}

function createMedia() {
  const objects = new Map();
  return {
    async put(key, value) {
      objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value));
    },
    async delete(key) { objects.delete(key); },
    async get(key) {
      const value = objects.get(key);
      return value ? { body: value } : null;
    },
    objects,
  };
}

test("GLB checkout supports manual proof review and encrypted key delivery", async () => {
  const [shop, proofs] = await Promise.all([bundleShop(), bundlePaymentProofs()]);
  const { db, sqlite, stats } = createD1();
  const media = createMedia();
  const now = new Date().toISOString();
  const productId = "glb-e2e-product-0001";
  const variantId = "glb-e2e-variant-0001";
  const methodId = "glb-e2e-method-0001";
  const botConfigId = "glb-bot-e2e-01";
  const bindings = {
    CONTENT_DB: db,
    MEDIA: media,
    SHOP_KEY_ENCRYPTION_KEY_VERSION: "v1",
    SHOP_KEY_ENCRYPTION_SECRET: Buffer.alloc(32, 0x5a).toString("base64url"),
    SHOP_ORDER_TOKEN_SECRET: Buffer.alloc(32, 0x6b).toString("base64url"),
    SHOP_PUBLIC_ORIGIN: "https://tung.codes",
  };

  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
      published_at, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'glb-manual-e2e', 'active', 'digital_key', 1, 1, 'en', '{}', 1, ?, 'test', 'test', ?, ?)`).run(productId, now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES (?, 'en', 'GLB E2E License', 'GLB', 'Manual crypto review', 'Test product', 'GLB E2E License', 'Test product')`).run(productId);
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor,
      compare_at_minor, currency, low_stock_threshold, max_per_order, option_values_json, metadata_json,
      version, created_at, updated_at)
    VALUES (?, ?, 'GLB-E2E-001', 'active', 'license_key', 'automatic', 'tracked', 255000,
      NULL, 'VND', 1, 1, '{}', '{}', 1, ?, ?)`).run(variantId, productId, now, now);
  // Explicit terms are approved before checkout; the sold snapshot stays fixed.
  sqlite.prepare(`INSERT INTO shop_otp_variant_policies
    (variant_id,kind,duration_seconds,expires_at,policy_version,configured_by,reason,configured_at,updated_at)
    VALUES (?,'duration',31536000,NULL,1,'test','synthetic_twelve_months',?,?)`).run(variantId,now,now);
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary)
    VALUES (?, 'en', '12 months', '1 device')`).run(variantId);
  sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, network, destination_type, destination_value, memo_or_tag, display_name,
      status, min_confirmations, expiry_minutes, sort_order, version, public_config_json, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'bybit', 'onchain_deposit', 'USDT', 'TRC20', 'wallet_address',
      'TMerchantWallet0000000000000000001', '', 'Bybit USDT TRC20', 'active', 1, 30, 1, 1, '{}', 'test', 'test', ?, ?)`).run(methodId, now, now);

  try {
    const cryptoContext = await shop.requireShopCrypto(bindings);
    const sealed = await shop.sealInventoryKey(cryptoContext, {
      inventoryUnitId: "glb-e2e-inventory-0001",
      variantId,
      plaintextKey: "GLB-E2E-LICENSE-0001",
    });
    sqlite.prepare(`INSERT INTO shop_inventory_units
      (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64,
       wrapped_dek_b64, wrap_iv_b64, key_fingerprint, imported_by, imported_at, updated_at)
      VALUES (?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, 'test', ?, ?)`).run(
      sealed.id, sealed.variantId, sealed.cryptoVersion, sealed.keyVersion, sealed.ciphertextB64,
      sealed.dataIvB64, sealed.wrappedDekB64, sealed.wrapIvB64, sealed.keyFingerprint, now, now,
    );

    sqlite.prepare(`INSERT INTO shop_otp_inventory_aliases (id, inventory_unit_id, alias_id, provider_key, state, validated_at, created_at, updated_at)
      VALUES ('glb-otp-binding', 'glb-e2e-inventory-0001', 'glb-synthetic-alias', 'synthetic', 'ready', ?, ?, ?)` ).run(now,now,now);
    const checkout = await shop.checkoutGlbTelegramItems(bindings, {
      user: { id: 8685416501, first_name: "GLB Buyer", username: "glb_buyer" },
      botConfigId,
      items: [{ variantId, quantity: 1 }],
      paymentMethodId: methodId,
      idempotencyKey: "glb-manual-e2e-checkout-0001",
    });
    assert.equal(checkout.order.currency, "USD");
    assert.equal(checkout.order.totalMinor, 1000);
    assert.equal(sqlite.prepare("SELECT locale FROM shop_orders WHERE id = ?").get(checkout.order.orderId).locale, "en");
    assert.equal(checkout.payment?.asset, "USDT");
    assert.equal(checkout.payment?.provider, "bybit");
    const customerId = sqlite.prepare("SELECT customer_id AS customerId FROM shop_orders WHERE id = ?").get(checkout.order.orderId).customerId;

    // Verify the guest email before entitling the actual delivered allocation.
    sqlite.prepare("UPDATE shop_customers SET email_normalized='glb-buyer@example.test', account_activated_at=? WHERE id=?").run(now,customerId);
    sqlite.prepare("UPDATE shop_orders SET customer_email_snapshot='glb-buyer@example.test' WHERE id=?").run(checkout.order.orderId);
    sqlite.prepare(`INSERT INTO shop_customer_identities (id,customer_id,provider,external_subject,verified_at,created_at,updated_at)
      VALUES ('glb-otp-email',?,'email','glb-buyer@example.test',?,?,?)`).run(customerId,now,now,now);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grants").get().n,0);
    stats.queries = 0;
    const initial = await shop.statusSummaryForGlbTelegramOrder(bindings, customerId, checkout.order.orderId, botConfigId);
    assert.equal(initial?.payment?.state, "awaiting_payment");
    assert.ok(stats.queries <= 3, `status summary used ${stats.queries} queries`);

    const proof = await proofs.submitPaymentProof({ CONTENT_DB: db, MEDIA: media }, {
      orderId: checkout.order.orderId,
      actor: `telegram:${botConfigId}`,
      upload: { transactionReference: "tx-glb-e2e-0001", bytes: null, mimeType: "", filename: "" },
    });
    assert.equal(proof.status, "submitted");
    assert.equal(sqlite.prepare("SELECT status FROM shop_crypto_payment_attempts WHERE order_id = ?").get(checkout.order.orderId).status, "needs_review");

    const confirmation = await shop.manuallyConfirmOrderPayment(
      db,
      checkout.order.orderId,
      { reason: "Verified Bybit transfer in merchant account" },
      { id: "admin-e2e", channel: "admin" },
      "glb-manual-e2e-confirm-0001",
    );
    assert.equal(confirmation.outcome, "paid");
    assert.equal(sqlite.prepare("SELECT payment_status FROM shop_orders WHERE id = ?").get(checkout.order.orderId).payment_status, "paid");
    assert.equal(sqlite.prepare("SELECT status FROM shop_crypto_payment_attempts WHERE order_id = ?").get(checkout.order.orderId).status, "confirmed");

    stats.queries = 0;
    const paid = await shop.statusSummaryForGlbTelegramOrder(bindings, customerId, checkout.order.orderId, botConfigId);
    assert.equal(paid?.payment?.state, "paid");
    assert.equal(paid?.delivery?.readiness, "ready");
    assert.ok(stats.queries <= 3, `paid status summary used ${stats.queries} queries`);

    const delivery = await shop.revealKeysForTelegramOrder(bindings, customerId, checkout.order.orderId, botConfigId);
    assert.equal(delivery.deliveries[0].keys[0], "GLB-E2E-LICENSE-0001");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_orders WHERE id = ?").get(checkout.order.orderId).fulfillment_status, "fulfilled");
    const grant=sqlite.prepare("SELECT * FROM shop_otp_grants").get();
    assert.equal(grant.customer_id,customerId);assert.equal(grant.order_id,checkout.order.orderId);
    assert.equal(grant.inventory_unit_id,"glb-e2e-inventory-0001");assert.equal(grant.state,"pending");
    const bundled=await build({entryPoints:[`${projectRoot}/src/lib/shop/otp/reconciliation.ts`],bundle:true,format:"esm",platform:"node",write:false,logLevel:"silent"});
    const otp=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
    const otpBindings={...bindings,SHOP_OTP_ENABLED:"true",OTP_BRIDGE_RPC_HMAC_KEY:"synthetic-32-character-key-for-test-only",MAILVAULT_OTP:{validateAlias:async request=>({state:"active",aliasId:request.aliasId})}};
    await Promise.all([otp.reconcileOtpGrants(otpBindings),otp.reconcileOtpGrants(otpBindings)]);
    assert.equal(sqlite.prepare("SELECT state FROM shop_otp_grants").get().state,"active");
    await shop.revealKeysForTelegramOrder(bindings,customerId,checkout.order.orderId,botConfigId);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shop_otp_grants").get().n,1);
  } finally {
    sqlite.close();
  }
});
