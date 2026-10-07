import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { defaultLocale, locales, localizePath } from "../src/i18n/dictionaries.ts";
import { formatProductPrice, getShopCopy } from "../src/i18n/shop.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { rewriteShopDynamicImports } = await import("./helpers/shop-inline.mjs");

async function loadShopValidation() {
  const types = compile(read("src/lib/shop/types.ts"));
  const validation = compile(read("src/lib/shop/validation.ts")).replace(
    /import\s+\{[\s\S]*?\}\s+from\s+["']\.\/types["'];?/m,
    "",
  );
  return importSource(`${types}\n${validation}`);
}

async function loadShopCrypto() {
  const types = compile(read("src/lib/shop/types.ts"));
  const cryptoSource = compile(read("src/lib/shop/crypto.ts")).replace(
    /import\s+\{[\s\S]*?\}\s+from\s+["']\.\/types["'];?/m,
    "",
  );
  return importSource(`${types}\n${cryptoSource}`);
}

// The money primitives are the canonical implementation; pricing.ts only
// re-exports them, so the tests exercise money.ts directly.
async function loadShopPricing() {
  return importSource(compile(read("src/lib/shop/money.ts")));
}

async function loadShopRepository() {
  const money = compile(read("src/lib/shop/money.ts"));
  const types = compile(read("src/lib/shop/types.ts"));
  const cryptoSource = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const validation = compile(read("src/lib/shop/validation.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const repository = rewriteShopDynamicImports(compile(read("src/lib/shop/repository.ts"))).replace(/^import[\s\S]*?;\s*/gm, "");
  const payOsUrl = `data:text/javascript;base64,${Buffer.from(compile(read("src/lib/shop/payos.ts"))).toString("base64")}`;
  const payOsImports = `const { PAYOS_RECONCILIATION_GRACE_SECONDS, payOsPaymentOccurredWithinRecoveryWindow, payOsTransferDescriptionMatches } = await import(${JSON.stringify(payOsUrl)});`;
  return importSource(`${money}\n${types}\n${cryptoSource}\n${validation}\n${payOsImports}\n${repository}`);
}

function createShopD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  if (existsSync(`${projectRoot}/content-migrations/0011_payos_payment_link_fields.sql`)) {
    sqlite.exec(read("content-migrations/0011_payos_payment_link_fields.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0012_payos_reconciliation_guards.sql`)) {
    sqlite.exec(read("content-migrations/0012_payos_reconciliation_guards.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0013_shop_idempotency_and_outbox_leases.sql`)) {
    sqlite.exec(read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0014_shop_inventory_operations.sql`)) {
    sqlite.exec(read("content-migrations/0014_shop_inventory_operations.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0016_shop_telegram_recipients.sql`)) {
    sqlite.exec(read("content-migrations/0016_shop_telegram_recipients.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0017_shop_categories.sql`)) {
    sqlite.exec(read("content-migrations/0017_shop_categories.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0019_shop_email_outbox.sql`)) {
    sqlite.exec(read("content-migrations/0019_shop_email_outbox.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0018_shop_telegram_recipient_identity.sql`)) {
    sqlite.exec(read("content-migrations/0018_shop_telegram_recipient_identity.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0025_payos_dynamic_accounts.sql`)) {
    sqlite.exec(read("content-migrations/0025_payos_dynamic_accounts.sql"));
  }
  if (existsSync(`${projectRoot}/content-migrations/0043_shop_currency_pricing.sql`)) {
    sqlite.exec(read("content-migrations/0043_shop_currency_pricing.sql"));
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
        async all() { return { results: statement.all(...bindings) }; },
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
        const result = statements.map((statement) => statement.__run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}

function seedShopProduct(sqlite, inventoryCount = 1) {
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('product-1', 'cloud-key', 'active', 'digital_key', 1, 0, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`)
    .run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES ('product-1', 'vi', 'Cloud Key', 'Digital', 'A clear key.', 'A complete digital key.', 'Cloud Key — TUNG', 'A clear digital key.')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
     low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
    VALUES ('variant-1', 'product-1', 'CLOUD-STD', 'active', 'license_key', 'automatic', 'tracked', 120000, 150000, 'VND', 1, 10, '{}', '{}', 1, ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES ('variant-1', 'vi', 'Standard', '')`).run();
  const insertInventory = sqlite.prepare(`INSERT INTO shop_inventory_units
    (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
     key_fingerprint, imported_by, imported_at, updated_at)
    VALUES (?, 'variant-1', 'available', 'aes-256-gcm-envelope-v1', 'v1', ?, ?, ?, ?, ?, 'test', ?, ?)`);
  const fakeCiphertext = Buffer.alloc(24, 1).toString("base64url");
  const iv = Buffer.alloc(12, 2).toString("base64url");
  const wrapped = Buffer.alloc(48, 3).toString("base64url");
  for (let index = 0; index < inventoryCount; index += 1) {
    insertInventory.run(`inventory-${index + 1}`, fakeCiphertext, iv, wrapped, iv, Buffer.alloc(32, index + 10).toString("base64url"), now, now);
  }
}

function shape(value) {
  if (Array.isArray(value)) return [];
  if (!value || typeof value !== "object") return typeof value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
}

test("shop copy is complete in vi, en, ja and zh with Vietnamese as the default", () => {
  assert.equal(defaultLocale, "vi");
  assert.deepEqual(locales, ["vi", "en", "ja", "zh"]);
  const vietnameseShape = shape(getShopCopy("vi"));
  for (const locale of locales) {
    const copy = getShopCopy(locale);
    const proseMinimum = locale === "ja" || locale === "zh" ? 18 : 40;
    assert.deepEqual(shape(copy), vietnameseShape, `${locale} shop copy shape`);
    assert.ok(copy.metaTitle.length > 10, `${locale} shop title is empty`);
    assert.ok(copy.metaDescription.length > proseMinimum, `${locale} shop description is too short`);
    assert.ok(copy.product.buyNow.length > 2, `${locale} buy CTA is empty`);
    assert.ok(copy.checkout.waitingNote.length > proseMinimum, `${locale} payment safety copy is too short`);
  }
  assert.notEqual(getShopCopy("vi").headingEmphasis, getShopCopy("en").headingEmphasis);
  assert.notEqual(getShopCopy("ja").product.buyNow, getShopCopy("zh").product.buyNow);
});

test("shop money and product range formatting use integer minor units", () => {
  const product = {
    id: "product-1",
    slug: "cloud-key",
    status: "active",
    featured: true,
    productType: "digital_key",
    title: "Cloud Key",
    shortDescription: "A tested digital key.",
    description: "A tested digital key with a clear delivery policy.",
    locale: "vi",
    badges: [],
    media: [],
    variants: [],
    minPriceMinor: 120_000,
    maxPriceMinor: 180_000,
    currency: "VND",
    availability: "in_stock",
  };
  const range = formatProductPrice(product, "vi");
  assert.match(range, /120/);
  assert.match(range, /180/);
  assert.doesNotMatch(range, /NaN|undefined/);
});

test("VND source prices convert to rounded USD cents without floating-point drift", async () => {
  const pricing = await loadShopPricing();
  const rate = pricing.DEFAULT_USD_VND_RATE_SCALED;
  assert.equal(pricing.vndToUsdCents(120_000, rate), 471);
  assert.equal(pricing.vndToUsdCents(25_500, rate), 100);
  assert.deepEqual(pricing.convertVndPricePair(120_000, 150_000, rate), {
    priceMinor: 471,
    compareAtMinor: 588,
    currency: "USD",
  });
  assert.throws(() => pricing.vndToUsdCents(-1, rate), /invalid_vnd_amount/);
  assert.throws(() => pricing.vndToUsdCents(1, 0), /invalid_usd_vnd_rate/);
});

test("English catalog and USD checkout derive from VND while preserving pricing snapshots", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  const actor = { id: "owner", channel: "admin" };
  try {
    const initial = await shop.getShopPricingSettings(db);
    assert.equal(initial.baseCurrency, "VND");
    assert.equal(initial.displayCurrency, "USD");
    assert.equal(initial.usdVndRateScaled, 25_500_000_000);

    const initialCatalog = await shop.listPublicProducts(db, { locale: "en" });
    assert.equal(initialCatalog[0].currency, "USD");
    assert.equal(initialCatalog[0].variants[0].priceMinor, 471);
    const englishStock = await shop.getPublicVariantStock(db, ["variant-1"], "en");
    assert.equal(englishStock[0].currency, "USD");
    assert.equal(englishStock[0].priceMinor, 471);
    const sourceStock = await shop.getPublicVariantStock(db, ["variant-1"], "vi");
    assert.equal(sourceStock[0].currency, "VND");
    assert.equal(sourceStock[0].priceMinor, 120_000);

    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "pricing@example.com", displayName: "Pricing Buyer", locale: "en" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "en",
      sourceChannel: "web",
      pricingCurrency: "USD",
    }, "pricing-checkout-1", actor, "pricing-request-1");
    assert.equal(order.currency, "USD");
    assert.equal(order.totalMinor, 471);
    assert.equal(order.lines[0].unitPriceMinor, 471);
    assert.equal(order.lines[0].baseUnitPriceMinor, 120_000);
    assert.equal(order.lines[0].exchangeRateVndPerUsd, 25_500);

    const orderMetadata = JSON.parse(sqlite.prepare("SELECT metadata_json FROM shop_orders WHERE id = ?").get(order.orderId).metadata_json);
    const lineMetadata = JSON.parse(sqlite.prepare("SELECT metadata_json FROM shop_order_items WHERE order_id = ?").get(order.orderId).metadata_json);
    assert.equal(orderMetadata.pricing.usdVndRate, 25_500);
    assert.equal(lineMetadata.pricing.baseUnitPriceMinor, 120_000);

    // Editing the VND source price immediately changes the next public projection.
    sqlite.prepare("UPDATE shop_variants SET price_minor = ?, compare_at_minor = ? WHERE id = 'variant-1'").run(255_000, 300_000);
    const editedCatalog = await shop.listPublicProducts(db, { locale: "en" });
    assert.equal(editedCatalog[0].variants[0].priceMinor, 1_000);
    assert.equal(editedCatalog[0].variants[0].compareAtMinor, 1_176);

    const updated = await shop.updateShopPricingSettings(db, { usdVndRateScaled: 30_000_000_000, expectedVersion: initial.version }, actor, "pricing-request-2");
    assert.equal(updated.usdVndRateScaled, 30_000_000_000);
    await assert.rejects(
      () => shop.updateShopPricingSettings(db, { usdVndRateScaled: 31_000_000_000, expectedVersion: initial.version }, actor, "pricing-request-stale"),
      (error) => error?.code === "currency_rate_conflict",
    );
    const nextQuote = await shop.previewCheckoutQuote(db, {
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "en",
      pricingCurrency: "USD",
    });
    assert.equal(nextQuote.currency, "USD");
    assert.equal(nextQuote.totalMinor, 850);

    // Existing orders retain the rate and base price used at checkout.
    const persistedMetadata = JSON.parse(sqlite.prepare("SELECT metadata_json FROM shop_orders WHERE id = ?").get(order.orderId).metadata_json);
    assert.equal(persistedMetadata.pricing.usdVndRate, 25_500);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_currency_rate_history").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("shop routes remain reachable while the primary header points to services", () => {
  for (const file of ["src/pages/shop.astro", "src/pages/shop/[slug].astro"]) {
    assert.equal(existsSync(`${projectRoot}/${file}`), true, `missing ${file}`);
  }
  for (const locale of locales) {
    assert.equal(localizePath("/shop", locale), locale === "vi" ? "/shop" : `/${locale}/shop`);
    assert.equal(localizePath("/shop/cloud-key", locale), locale === "vi" ? "/shop/cloud-key" : `/${locale}/shop/cloud-key`);
  }

  const dispatcher = read("src/pages/[lang]/[...slug].astro");
  const header = read("src/components/Header.astro");
  const sitemap = read("src/pages/sitemap.xml.ts");
  assert.match(dispatcher, /"shop"/);
  assert.match(dispatcher, /first === "shop"/);
  assert.match(header, /href:\s*"\/pricing"|href=\{localizePath\("\/pricing"/);
  assert.doesNotMatch(header, /href:\s*"\/shop"|href=\{localizePath\("\/shop"/);
  assert.match(sitemap, /\/shop/);
  assert.match(sitemap, /localizePath/);
});

test("product page exposes Product, Offer and breadcrumb metadata without repository links", () => {
  const productPage = read("src/components/pages/ProductPage.astro");
  assert.match(productPage, /"@type":\s*"Product"/);
  assert.match(productPage, /"@type":\s*"Offer"/);
  assert.match(productPage, /"@type":\s*"BreadcrumbList"/);
  assert.match(productPage, /priceCurrency/);
  assert.match(productPage, /availability/);
  assert.match(productPage, /structuredData/);
  assert.doesNotMatch(productPage, /github\.com|GitHub|repoUrl/i);
});

test("admin shop workspace covers catalog, inventory, orders and integrations without displaying secrets", () => {
  const tabs = [
    "OverviewTab", "CatalogTab", "InventoryTab", "OrdersTab", "PaymentsTab",
    "FulfillmentTab", "TelegramTab", "DiscountsTab", "SettingsTab",
  ].map((name) => read(`src/components/admin/shop/${name}.tsx`)).join("\n");
  const admin = read("src/pages/admin/index.astro");
  const settingsTab = read("src/components/admin/shop/SettingsTab.tsx");
  const discountsTab = read("src/components/admin/shop/DiscountsTab.tsx");
  const workspace = read("src/components/admin/shop/ShopWorkspace.tsx");
  for (const panel of ["overview", "catalog", "inventory", "orders", "payments", "fulfillment", "discounts", "settings"]) {
    assert.match(tabs, new RegExp(`data-shop-panel="${panel}"`));
  }
  assert.match(settingsTab, /Notion/);
  assert.match(settingsTab, /Worker webhook/);
  assert.match(settingsTab, /type="password"[^>]*value=\{notionToken\}/);
  assert.match(settingsTab, /value="disabled">Disabled/);
  assert.match(settingsTab, /toggleCryptoMethod/);
  assert.match(read("src/components/admin/lib/labels.ts"), /crypto_provider_not_configured/);
  assert.doesNotMatch(tabs, /value="(?:secret_|ntn_|sk-|ghp_)/i);
  assert.match(readFileSync(new URL("../src/components/admin/AdminApp.tsx", import.meta.url), "utf8"), /ShopWorkspace/);
  assert.match(workspace, /ShopProvider/);
  assert.match(discountsTab, /maxPerCustomer/);
  assert.match(discountsTab, /stackable: false/);
  assert.doesNotMatch(discountsTab, /name="stackable"/);
  assert.doesNotMatch(workspace, /secret_|token_ciphertext/i);
});

test("shop migration runs on the current CMS schema and creates the commerce boundaries", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(read("content-migrations/0001_content_cms.sql"));
    sqlite.exec(read("content-migrations/0009_shop_core.sql"));
    if (existsSync(`${projectRoot}/content-migrations/0011_payos_payment_link_fields.sql`)) {
      sqlite.exec(read("content-migrations/0011_payos_payment_link_fields.sql"));
    }
    if (existsSync(`${projectRoot}/content-migrations/0012_payos_reconciliation_guards.sql`)) {
      sqlite.exec(read("content-migrations/0012_payos_reconciliation_guards.sql"));
    }
    if (existsSync(`${projectRoot}/content-migrations/0013_shop_idempotency_and_outbox_leases.sql`)) {
      sqlite.exec(read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql"));
    }
    if (existsSync(`${projectRoot}/content-migrations/0043_shop_currency_pricing.sql`)) {
      sqlite.exec(read("content-migrations/0043_shop_currency_pricing.sql"));
    }
    const names = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const table of [
      "shop_products",
      "shop_product_localizations",
      "shop_variants",
      "shop_inventory_units",
      "shop_inventory_reservations",
      "shop_inventory_allocations",
      "shop_orders",
      "shop_order_items",
      "shop_checkout_rate_limits",
      "shop_idempotency_keys",
      "shop_payment_attempts",
      "shop_payment_events",
      "shop_fulfillment_events",
      "shop_webhook_outbox",
      "shop_currency_settings",
      "shop_currency_rate_history",
    ]) assert.equal(names.has(table), true, `missing ${table}`);
    const pricing = sqlite.prepare("SELECT base_currency, display_currency, usd_vnd_rate_scaled FROM shop_currency_settings WHERE id = 'default'").get();
    assert.equal(pricing.base_currency, "VND");
    assert.equal(pricing.display_currency, "USD");
    assert.equal(pricing.usd_vnd_rate_scaled, 25_500_000_000);
    const paymentAttemptColumns = new Set(sqlite.prepare("PRAGMA table_info(shop_payment_attempts)").all().map((row) => row.name));
    assert.ok(paymentAttemptColumns.has("reconciliation_attempted_at"));
    assert.ok(paymentAttemptColumns.has("reconciliation_checked_at"));
    const idempotencyColumns = new Set(sqlite.prepare("PRAGMA table_info(shop_idempotency_keys)").all().map((row) => row.name));
    assert.ok(idempotencyColumns.has("access_token_salt"));
    const outboxColumns = new Set(sqlite.prepare("PRAGMA table_info(shop_webhook_outbox)").all().map((row) => row.name));
    assert.ok(outboxColumns.has("lock_token_hash"));
    const outboxIndexes = new Set(sqlite.prepare("PRAGMA index_list(shop_webhook_outbox)").all().map((row) => row.name));
    assert.ok(outboxIndexes.has("idx_shop_webhook_outbox_processing_lease"));
  } finally {
    sqlite.close();
  }
});

test("shop schema protects key inventory, idempotency and live allocations", () => {
  const migration = read("content-migrations/0009_shop_core.sql");
  const payosMigration = read("content-migrations/0011_payos_payment_link_fields.sql");
  const reliabilityMigration = read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql");
  assert.match(migration, /price_minor INTEGER NOT NULL CHECK \(price_minor >= 0\)/);
  assert.doesNotMatch(migration, /price(?:_minor)?\s+REAL/i);
  assert.match(migration, /crypto_version TEXT NOT NULL CHECK \(crypto_version = 'aes-256-gcm-envelope-v1'\)/);
  for (const column of ["ciphertext_b64", "data_iv_b64", "wrapped_dek_b64", "wrap_iv_b64", "key_fingerprint"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  const inventorySchema = migration.match(/CREATE TABLE IF NOT EXISTS shop_inventory_units \(([\s\S]*?)\n\);/)?.[1] ?? "";
  assert.ok(inventorySchema);
  assert.doesNotMatch(inventorySchema, /plaintext|key_preview|secret_value|license_key TEXT/i);
  assert.match(migration, /PRIMARY KEY \(namespace, key_hash\)/);
  assert.match(migration, /uq_shop_inventory_allocation_live[\s\S]*WHERE status IN \('held', 'delivering'\)/);
  assert.match(migration, /uq_shop_inventory_allocation_fulfilled[\s\S]*WHERE status = 'fulfilled'/);
  assert.match(migration, /UNIQUE \(destination, dedupe_key\)/);
  assert.match(migration, /delivery_mode TEXT NOT NULL DEFAULT 'manual'/);
  assert.match(migration, /inventory_policy TEXT NOT NULL DEFAULT 'tracked'/);
  assert.match(migration, /checkout_subject_hash TEXT/);
  assert.match(migration, /shop_checkout_rate_limits/);
  assert.match(migration, /Notion is an editorial\/sync surface only/);
  assert.match(payosMigration, /provider_order_code/);
  assert.match(payosMigration, /checkout_url/);
  assert.match(payosMigration, /uq_shop_payment_attempt_order_code/);
  assert.match(reliabilityMigration, /access_token_salt/);
  assert.match(reliabilityMigration, /lock_token_hash/);
  assert.match(reliabilityMigration, /WHERE status = 'processing'/);
});

test("catalog and checkout validation reject unsafe shapes while normalizing safe input", async () => {
  const validation = await loadShopValidation();
  const localizations = Object.fromEntries(["vi", "en", "ja", "zh"].map((locale) => [locale, {
    title: `Cloud Key ${locale}`,
    shortDescription: "A clear digital product.",
    description: "A longer product description for a reviewed catalog entry.",
    seoTitle: `Cloud Key ${locale} — TUNG`,
    seoDescription: "A concise search description for the product page.",
  }]));
  const variantLocalizations = Object.fromEntries(["vi", "en", "ja", "zh"].map((locale) => [locale, { title: `Standard ${locale}` }]));
  const validProduct = {
    slug: "cloud-key",
    status: "active",
    productType: "digital_key",
    featured: true,
    localizations,
    variants: [{
      sku: "CLOUD-STD",
      status: "active",
      fulfillmentType: "license_key",
      deliveryMode: "automatic",
      inventoryPolicy: "tracked",
      priceMinor: 120_000,
      compareAtMinor: 150_000,
      currency: "vnd",
      localizations: variantLocalizations,
    }],
  };
  const accepted = validation.validateProductUpsertInput(validProduct);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.variants[0].currency, "VND");
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    variants: [{ ...validProduct.variants[0], currency: "USD", localizations: variantLocalizations }],
  }).ok, false, "catalog source prices must be entered in VND");
  const legacyOptionValues = validation.validateProductUpsertInput({
    ...validProduct,
    variants: [{
      ...validProduct.variants[0],
      optionValues: {
        plan: "pro",
        credits: 1000,
        liveStudio: true,
        expiresOn: "2026-08-01",
      },
    }],
  });
  assert.equal(legacyOptionValues.ok, true);
  assert.equal(legacyOptionValues.value.variants[0].optionValues.credits, "1000");
  assert.equal(legacyOptionValues.value.variants[0].optionValues.liveStudio, "true");
  assert.equal(validation.validateProductUpsertInput({ ...validProduct, slug: "../unsafe" }).ok, false);
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    status: "active",
    variants: [{ ...validProduct.variants[0], status: "draft" }],
  }).ok, false, "active products need at least one active variant");
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    productType: "digital_download",
  }).ok, false, "download products cannot reuse license-key inventory semantics");
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    productType: "service",
  }).ok, false, "service products require manual, unlimited fulfillment");
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    productType: "digital_download",
    variants: [{
      ...validProduct.variants[0],
      fulfillmentType: "download",
      deliveryMode: "manual",
      inventoryPolicy: "unlimited",
    }],
  }).ok, true);
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    productType: "service",
    variants: [{
      ...validProduct.variants[0],
      fulfillmentType: "manual",
      deliveryMode: "manual",
      inventoryPolicy: "unlimited",
    }],
  }).ok, true);
  assert.equal(validation.validateProductUpsertInput({
    ...validProduct,
    variants: [validProduct.variants[0], { ...validProduct.variants[0], sku: "CLOUD-OTHER", currency: "USD", localizations: variantLocalizations }],
  }).ok, false);

  const inventory = validation.validateInventoryImportInput({ variantId: "variant-1", keys: ["KEY-ONE", "KEY-TWO"] });
  assert.equal(inventory.ok, true);
  assert.equal(validation.validateInventoryImportInput({ variantId: "variant-1", keys: ["KEY-ONE", "KEY-ONE"] }).ok, false);
  assert.equal(validation.validateInventoryImportInput({ variantId: "variant-1", keys: ["<script>alert(1)</script>"] }).ok, true, "keys are encrypted server-side and may contain provider punctuation");

  const checkout = validation.validateCreateCheckoutInput({
    customer: { email: " BUYER@EXAMPLE.COM ", displayName: "Buyer", locale: "en" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    sourceChannel: "telegram",
    discountCode: " spring-10 ",
  });
  assert.equal(checkout.ok, true);
  assert.equal(checkout.value.customer.email, "buyer@example.com");
  assert.equal(checkout.value.discountCode, "SPRING-10");
  assert.equal(validation.validateCreateCheckoutInput({
    customer: { email: "tg123456@telegram.tungjpstore.local", displayName: "Preclaimer" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    sourceChannel: "web",
  }).ok, false, "public checkout cannot preclaim Telegram synthetic identity emails");
  assert.equal(validation.validateCreateCheckoutInput({
    customer: { email: "tg123456@telegram.tungjpstore.local", displayName: "Tung", telegramSubject: "123456" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    sourceChannel: "telegram",
  }).ok, true, "Telegram-native checkout may use its internally generated mailbox");
  assert.equal(validation.validateCreateCheckoutInput({
    customer: { email: "buyer@example.com", displayName: "Buyer" },
    items: [{ variantId: "variant-1", quantity: 1 }],
    discountCode: "SPRING 10<script>",
  }).ok, false, "checkout rejects non-canonical discount codes before database work");
  assert.equal(validation.validateCheckoutQuoteInput({
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    discountCode: "SPRING 10<script>",
  }).ok, false, "quote uses the same strict discount-code grammar as checkout");
  const activeDiscount = {
    code: "SAFE10",
    status: "active",
    type: "percentage",
    value: 1000,
    currency: null,
    minimumSubtotalMinor: 0,
    maximumDiscountMinor: 50000,
    maximumRedemptions: 100,
    stackable: false,
    startsAt: null,
    endsAt: null,
    productIds: [],
    variantIds: [],
    metadata: {},
  };
  assert.equal(validation.validateDiscountUpsertInput(activeDiscount).ok, false, "active discounts require a per-customer cap");
  assert.equal(validation.validateDiscountUpsertInput({ ...activeDiscount, maximumPerCustomer: 1 }).ok, true);
  assert.equal(validation.validateCreateCheckoutInput({
    customer: { email: "buyer@example.com", displayName: "Buyer" },
    items: [{ variantId: "variant-1", quantity: 1 }, { variantId: "variant-1", quantity: 1 }],
  }).ok, false);
  assert.equal(validation.validatePaymentProviderConfigInput({
    displayName: "VietQR",
    status: "active",
    provider: "vietqr",
    bankId: "VCB",
    accountRef: "VIETQR_BANK_ACCOUNT",
    confirmationAdapter: "generic_signed",
    publicConfig: { webhookToken: "should-not-be-here" },
  }).ok, false);
  const validPaymentProvider = {
    displayName: "VietQR",
    status: "active",
    provider: "vietqr",
    bankId: "970436",
    accountRef: "VIETQR_BANK_ACCOUNT",
    confirmationAdapter: "payos",
    secretRef: "PAYOS_CHECKSUM_KEY",
    publicConfig: {},
  };
  assert.equal(validation.validatePaymentProviderConfigInput(validPaymentProvider).ok, true);
  assert.equal(validation.validatePaymentProviderConfigInput({ ...validPaymentProvider, bankId: "VCB" }).ok, false);
});

test("inventory key crypto fails closed, seals plaintext, and supports authenticated round trips", async () => {
  const shopCrypto = await loadShopCrypto();
  const secret = Buffer.alloc(32, 0x42).toString("base64url");
  await assert.rejects(() => shopCrypto.requireShopCrypto({}), (error) => error?.code === "shop_key_crypto_not_configured");
  const context = await shopCrypto.createShopCryptoContext(secret, "v1");
  const sealed = await shopCrypto.sealInventoryKey(context, {
    inventoryUnitId: "inventory-1",
    variantId: "variant-1",
    plaintextKey: "LICENSE-SECRET-123",
  });
  assert.equal(sealed.cryptoVersion, "aes-256-gcm-envelope-v1");
  assert.match(sealed.keyFingerprint, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(JSON.stringify(sealed), /LICENSE-SECRET-123/);
  assert.equal(await shopCrypto.openInventoryKey(context, { ...sealed, status: "available" }), "LICENSE-SECRET-123");
  const wrongContext = await shopCrypto.createShopCryptoContext(Buffer.alloc(32, 0x43).toString("base64url"), "v1");
  await assert.rejects(
    () => shopCrypto.openInventoryKey(wrongContext, { ...sealed, status: "available" }),
    (error) => error?.code === "shop_key_integrity_check_failed",
  );
  assert.equal(await shopCrypto.hashCanonicalJson({ b: 2, a: 1 }), await shopCrypto.hashCanonicalJson({ a: 1, b: 2 }));
  assert.notEqual(await shopCrypto.hashIdempotencyKey("checkout", "same"), await shopCrypto.hashIdempotencyKey("checkout", "different"));
  const orderToken = await shopCrypto.deriveShopOrderAccessToken(secret, "checkout:web", "checkout-idempotency-key-123");
  assert.equal(orderToken, await shopCrypto.deriveShopOrderAccessToken(secret, "checkout:web", "checkout-idempotency-key-123"));
  assert.notEqual(orderToken, await shopCrypto.deriveShopOrderAccessToken(secret, "checkout:web", "checkout-idempotency-key-456"));
});

test("checkout idempotency reserves inventory once and rejects key reuse with a different payload", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const input = {
    customer: { email: "buyer@example.com", displayName: "Buyer", locale: "vi", marketingConsent: false },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
  };
  try {
    const stableAccessToken = Buffer.alloc(32, 0x61).toString("base64url");
    const first = await shop.createCheckoutOrder(db, input, "checkout-key-1", { id: "buyer", channel: "web" }, "request-1", stableAccessToken);
    const replay = await shop.createCheckoutOrder(db, {
      sourceChannel: "web",
      locale: "vi",
      items: [{ quantity: 1, variantId: "variant-1" }],
      customer: { marketingConsent: false, locale: "vi", displayName: "Buyer", email: "buyer@example.com" },
    }, "checkout-key-1", { id: "buyer", channel: "web" }, "request-2", stableAccessToken);
    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.orderId, first.orderId);
    assert.equal(replay.orderAccessToken, first.orderAccessToken);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_orders").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transactional_email_outbox WHERE topic = 'shop.order.created' AND aggregate_id = ?").get(first.orderId).count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_allocations WHERE status = 'held'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units WHERE status = 'reserved'").get().count, 1);
    await assert.rejects(
      () => shop.createCheckoutOrder(db, { ...input, customer: { ...input.customer, displayName: "Changed" } }, "checkout-key-1", { id: "buyer", channel: "web" }, "request-3"),
      (error) => error?.code === "idempotency_key_reused",
    );
  } finally {
    sqlite.close();
  }
});

test("targeted discounts apply only to eligible lines and never create negative totals", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('product-2', 'small-key', 'active', 'digital_key', 0, 1, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, short_description, description, seo_title, seo_description)
    VALUES ('product-2', 'vi', 'Small Key', 'Small key.', 'Small key description.', 'Small Key', 'Small key description.')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, currency,
     low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
    VALUES ('variant-2', 'product-2', 'SMALL-KEY', 'active', 'license_key', 'automatic', 'tracked', 10000, 'VND', 1, 10, '{}', '{}', 1, ?, ?)`).run(now, now);
  sqlite.prepare("INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES ('variant-2', 'vi', 'Small', '')").run();
  sqlite.prepare(`INSERT INTO shop_inventory_units
    (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
     key_fingerprint, imported_by, imported_at, updated_at)
    VALUES ('inventory-targeted', 'variant-2', 'available', 'aes-256-gcm-envelope-v1', 'v1', ?, ?, ?, ?, ?, 'test', ?, ?)`).run(
      Buffer.alloc(24, 1).toString("base64url"),
      Buffer.alloc(12, 2).toString("base64url"),
      Buffer.alloc(48, 3).toString("base64url"),
      Buffer.alloc(12, 2).toString("base64url"),
      Buffer.alloc(32, 40).toString("base64url"),
      now,
      now,
    );
  sqlite.prepare(`INSERT INTO shop_discounts
    (id, code_normalized, status, discount_type, value, currency, minimum_subtotal_minor, created_by, updated_by, created_at, updated_at)
    VALUES ('discount-targeted', 'TARGETED', 'active', 'fixed_amount', 20000, 'VND', 0, 'owner', 'owner', ?, ?)`).run(now, now);
  sqlite.prepare("INSERT INTO shop_discount_targets (discount_id, target_type, target_id) VALUES ('discount-targeted', 'variant', 'variant-2')").run();
  try {
    const quote = await shop.previewCheckoutQuote(db, {
      items: [{ variantId: "variant-1", quantity: 1 }, { variantId: "variant-2", quantity: 1 }],
      locale: "vi",
      discountCode: "targeted",
      customerEmail: "targeted@example.com",
    });
    assert.equal(quote.subtotalMinor, 130000);
    assert.equal(quote.discountMinor, 10000);
    assert.equal(quote.totalMinor, 120000);
    assert.deepEqual(quote.discount, {
      code: "TARGETED",
      type: "fixed_amount",
      value: 20000,
      scope: "eligible_items",
      eligibleSubtotalMinor: 10000,
      minimumSubtotalMinor: 0,
      maximumDiscountMinor: null,
      amountMinor: 10000,
    });
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "targeted@example.com", displayName: "Targeted Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }, { variantId: "variant-2", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
      discountCode: "TARGETED",
    }, "targeted-discount-checkout", { id: "buyer", channel: "web" }, "targeted-discount-request");
    assert.equal(order.subtotalMinor, 130000);
    assert.equal(order.discountMinor, 10000, "discount is capped by the eligible line subtotal");
    assert.equal(order.totalMinor, 120000);
    assert.equal(order.lines[0].discountMinor, 0, "non-targeted line must not receive the discount");
    assert.equal(order.lines[0].totalMinor, 120000);
    assert.equal(order.lines[1].discountMinor, 10000);
    assert.equal(order.lines[1].totalMinor, 0);
    assert.equal(order.lines.reduce((sum, line) => sum + line.discountMinor, 0), order.discountMinor);
    assert.equal(order.lines.reduce((sum, line) => sum + line.totalMinor, 0), order.totalMinor);
  } finally {
    sqlite.close();
  }
});

test("checkout rejects unsupported automatic downloads and zero-total PayOS orders before reservation", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const now = "2026-07-24T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
     published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('download-product', 'download-product', 'active', 'digital_download', 0, 1, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, short_description, description, seo_title, seo_description)
    VALUES ('download-product', 'vi', 'Download', 'Download.', 'Download description.', 'Download', 'Download description.')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, currency,
     low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
    VALUES ('download-auto', 'download-product', 'DOWNLOAD-AUTO', 'active', 'download', 'automatic', 'unlimited', 10000, 'VND', 0, 10, '{}', '{}', 1, ?, ?)`).run(now, now);
  sqlite.prepare("INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES ('download-auto', 'vi', 'Automatic download', '')").run();
  const customer = { email: "guard@example.com", displayName: "Guard Buyer", locale: "vi" };
  try {
    await assert.rejects(
      () => shop.createCheckoutOrder(db, { customer, items: [{ variantId: "download-auto", quantity: 1 }], locale: "vi", sourceChannel: "web" }, "auto-download-checkout", { id: "buyer", channel: "web" }, "auto-download-request"),
      (error) => error?.code === "automatic_download_unsupported",
    );
    sqlite.prepare(`INSERT INTO shop_discounts
      (id, code_normalized, status, discount_type, value, currency, minimum_subtotal_minor, created_by, updated_by, created_at, updated_at)
      VALUES ('discount-free', 'FREEORDER', 'active', 'fixed_amount', 120000, 'VND', 0, 'owner', 'owner', ?, ?)`).run(now, now);
    await assert.rejects(
      () => shop.createCheckoutOrder(db, { customer, items: [{ variantId: "variant-1", quantity: 1 }], locale: "vi", sourceChannel: "web", discountCode: "FREEORDER" }, "zero-total-checkout", { id: "buyer", channel: "web" }, "zero-total-request"),
      (error) => error?.code === "zero_total_checkout_not_supported",
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_orders").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_reservations").get().count, 0);
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_units WHERE id = 'inventory-1'").get().status, "available");
  } finally {
    sqlite.close();
  }
});

test("expired checkout idempotency keys are replaced with a fresh token generation", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  const input = {
    customer: { email: "expiry@example.com", displayName: "Expiry Buyer", locale: "vi", marketingConsent: false },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
  };
  const stableAccessToken = Buffer.alloc(32, 0x62).toString("base64url");
  try {
    const first = await shop.createCheckoutOrder(db, input, "expired-checkout-key", { id: "buyer", channel: "web" }, "expiry-request-1", stableAccessToken);
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    sqlite.prepare("UPDATE shop_idempotency_keys SET expires_at = ? WHERE namespace = 'checkout:web'").run(expiredAt);

    const second = await shop.createCheckoutOrder(db, {
      ...input,
      customer: { ...input.customer, displayName: "Expiry Buyer - New Attempt" },
    }, "expired-checkout-key", { id: "buyer", channel: "web" }, "expiry-request-2", stableAccessToken);

    assert.notEqual(second.orderId, first.orderId);
    assert.notEqual(second.orderAccessToken, first.orderAccessToken);
    assert.equal((await shop.getOrderByAccessToken(db, first.orderAccessToken)).id, first.orderId);
    assert.equal((await shop.getOrderByAccessToken(db, second.orderAccessToken)).id, second.orderId);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_idempotency_keys WHERE namespace = 'checkout:web'").get().count, 1);
    assert.match(sqlite.prepare("SELECT access_token_salt FROM shop_idempotency_keys WHERE namespace = 'checkout:web'").get().access_token_salt, /^[0-9a-f-]{36}$/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_orders").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("expired checkout idempotency cleanup is bounded and preserves active rows", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  const expired = new Date(Date.now() - 60_000).toISOString();
  const active = new Date(Date.now() + 60_000).toISOString();
  const created = new Date(Date.now() - 120_000).toISOString();
  const insert = sqlite.prepare(`INSERT INTO shop_idempotency_keys
    (namespace, key_hash, request_hash, state, created_at, updated_at, expires_at)
    VALUES ('checkout:web', ?, ?, 'completed', ?, ?, ?)`);
  for (let index = 0; index < 125; index += 1) insert.run(`expired-${index}`, `request-${index}`, created, created, expired);
  insert.run("active", "request-active", created, created, active);
  try {
    const originalPrepare = db.prepare.bind(db);
    let cleanupQueries = 0;
    db.prepare = (...args) => {
      cleanupQueries += 1;
      return originalPrepare(...args);
    };
    assert.equal(await shop.cleanupExpiredIdempotencyKeys(db, 40), 40);
    assert.equal(cleanupQueries, 1, "cleanup must remain one bounded D1 statement");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_idempotency_keys WHERE expires_at <= ?").get(new Date().toISOString()).count, 85);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_idempotency_keys WHERE key_hash = 'active'").get().count, 1);
    assert.equal(await shop.cleanupExpiredIdempotencyKeys(db, 500), 85);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_idempotency_keys").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("unpaid orders cannot claim keys and expired checkouts release discount quota", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO shop_discounts
    (id, code_normalized, status, discount_type, value, currency, minimum_subtotal_minor, maximum_redemptions,
     maximum_per_customer, created_by, updated_by, created_at, updated_at)
    VALUES ('discount-1', 'ONEUSE', 'active', 'fixed_amount', 1000, 'VND', 0, 1, 1, 'owner', 'owner', ?, ?)`).run(now, now);
  const checkoutInput = {
    customer: { email: "discount@example.com", displayName: "Discount Buyer", locale: "vi", marketingConsent: false },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
    discountCode: "ONEUSE",
  };
  try {
    const first = await shop.createCheckoutOrder(db, checkoutInput, "discount-checkout-1", { id: "buyer", channel: "web" }, "discount-request-1");
    assert.equal(await shop.claimFulfillmentAllocation(db, first.lines[0].orderItemId, "lease-hash", 90), null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_movements WHERE reservation_id = (SELECT id FROM shop_inventory_reservations WHERE order_id = ?)").get(first.orderId).count, 1);
    assert.equal(sqlite.prepare("SELECT status FROM shop_discount_redemptions WHERE order_id = ?").get(first.orderId).status, "reserved");
    assert.equal(sqlite.prepare("SELECT redeemed_count FROM shop_discounts WHERE id = 'discount-1'").get().redeemed_count, 0);

    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    sqlite.prepare("UPDATE shop_inventory_reservations SET expires_at = ? WHERE order_id = ?").run(expiredAt, first.orderId);
    await shop.releaseExpiredReservations(db);
    assert.equal(sqlite.prepare("SELECT status FROM shop_discount_redemptions WHERE order_id = ?").get(first.orderId).status, "released");
    const releaseMovements = sqlite.prepare("SELECT event_type, from_status, to_status FROM shop_inventory_movements WHERE reservation_id = (SELECT id FROM shop_inventory_reservations WHERE order_id = ?) ORDER BY created_at, id").all(first.orderId);
    assert.equal(releaseMovements.at(-1).event_type, "released");

    const second = await shop.createCheckoutOrder(db, checkoutInput, "discount-checkout-2", { id: "buyer", channel: "web" }, "discount-request-2");
    assert.equal(second.discountMinor, 1000);
  } finally {
    sqlite.close();
  }
});

test("per-customer discount limits do not merge distinct customers behind one checkout subject", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 3);
  const now = new Date().toISOString();
  const sharedSubject = Buffer.alloc(32, 0x31).toString("base64url");
  const otherSubject = Buffer.alloc(32, 0x32).toString("base64url");
  sqlite.prepare(`INSERT INTO shop_discounts
    (id, code_normalized, status, discount_type, value, currency, minimum_subtotal_minor,
     maximum_per_customer, created_by, updated_by, created_at, updated_at)
    VALUES ('discount-subject', 'ONEDEVICE', 'active', 'fixed_amount', 1000, 'VND', 0, 1, 'owner', 'owner', ?, ?)`).run(now, now);
  const input = (email) => ({
    customer: { email, displayName: "Discount Buyer", locale: "vi", marketingConsent: false },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
    discountCode: "ONEDEVICE",
  });
  try {
    await shop.createCheckoutOrder(db, input("first@example.com"), "subject-limit-1", { id: "buyer", channel: "web" }, "subject-limit-request-1", undefined, sharedSubject);
    const sameNetwork = await shop.createCheckoutOrder(db, input("second@example.com"), "subject-limit-2", { id: "buyer", channel: "web" }, "subject-limit-request-2", undefined, sharedSubject);
    assert.equal(sameNetwork.discountMinor, 1000);
    await assert.rejects(
      () => shop.createCheckoutOrder(db, input("first@example.com"), "subject-limit-repeat", { id: "buyer", channel: "web" }, "subject-limit-request-repeat", undefined, otherSubject),
      (error) => error?.code === "discount_customer_limit_reached",
    );
    const allowed = await shop.createCheckoutOrder(db, input("third@example.com"), "subject-limit-3", { id: "buyer", channel: "web" }, "subject-limit-request-3", undefined, otherSubject);
    assert.equal(allowed.discountMinor, 1000);
  } finally {
    sqlite.close();
  }
});

test("expired reservation sweep loses the race cleanly when payment converts the reservation", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const checkoutInput = {
    customer: { email: "race@example.com", displayName: "Race Buyer", locale: "vi", marketingConsent: false },
    items: [{ variantId: "variant-1", quantity: 1 }],
    locale: "vi",
    sourceChannel: "web",
  };
  try {
    const order = await shop.createCheckoutOrder(db, checkoutInput, "race-checkout", { id: "buyer", channel: "web" }, "race-request");
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    sqlite.prepare("UPDATE shop_inventory_reservations SET expires_at = ? WHERE order_id = ?").run(expiredAt, order.orderId);

    // Simulate payment confirmation winning after the sweep's initial SELECT,
    // but before its compare-and-swap guard is inserted.
    const originalBatch = db.batch.bind(db);
    let paymentWon = false;
    db.batch = async (statements) => {
      if (!paymentWon && statements.length > 0) {
        paymentWon = true;
        const now = new Date().toISOString();
        sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?").run(now, now, order.orderId);
        sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted', updated_at = ? WHERE order_id = ? AND status = 'active'").run(now, order.orderId);
      }
      return originalBatch(statements);
    };

    assert.equal(await shop.releaseExpiredReservations(db), 0);
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_reservations WHERE order_id = ?").get(order.orderId).status, "converted");
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_allocations WHERE order_item_id = ?").get(order.lines[0].orderItemId).status, "held");
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_units WHERE id = 'inventory-1'").get().status, "reserved");
    assert.equal(sqlite.prepare("SELECT payment_status FROM shop_orders WHERE id = ?").get(order.orderId).payment_status, "paid");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transaction_guards").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("multi-quantity checkout atomically holds one distinct inventory unit per item quantity", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  try {
    const result = await shop.createCheckoutOrder(db, {
      customer: { email: "bulk@example.com", displayName: "Bulk Buyer", locale: "vi", marketingConsent: false },
      items: [{ variantId: "variant-1", quantity: 2 }],
      locale: "vi",
      sourceChannel: "web",
    }, "checkout-key-quantity-2", { id: "bulk", channel: "web" }, "request-bulk");
    assert.equal(result.lines[0].quantity, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_allocations WHERE status = 'held'").get().count, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT inventory_unit_id) AS count FROM shop_inventory_allocations WHERE status = 'held'").get().count, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units WHERE status = 'reserved'").get().count, 2);
    await assert.rejects(
      () => shop.createCheckoutOrder(db, {
        customer: { email: "oversell@example.com", displayName: "Oversell Buyer", locale: "vi" },
        items: [{ variantId: "variant-1", quantity: 1 }],
        locale: "vi",
        sourceChannel: "web",
      }, "checkout-key-oversell", { id: "oversell", channel: "web" }, "request-oversell"),
      (error) => error?.code === "insufficient_inventory",
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_orders").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("multi-key fulfillment reports partial after one key and fulfilled only after all keys", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "partial@example.com", displayName: "Partial Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 2 }],
      locale: "vi",
      sourceChannel: "web",
    }, "partial-checkout", { id: "buyer", channel: "web" }, "partial-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);

    const first = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "partial-lease-1", 90, "web");
    await shop.markFulfillmentDelivered(db, first.allocationId, "partial-lease-1", actor, "partial-delivery-1", "web");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(order.lines[0].orderItemId).fulfillment_status, "processing");
    assert.deepEqual({ ...sqlite.prepare("SELECT status, fulfillment_status FROM shop_orders WHERE id = ?").get(order.orderId) }, { status: "processing", fulfillment_status: "partial" });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transactional_email_outbox WHERE topic = 'shop.order.fulfilled' AND aggregate_id = ?").get(order.orderId).count, 0);

    const second = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "partial-lease-2", 90, "web");
    await shop.markFulfillmentDelivered(db, second.allocationId, "partial-lease-2", actor, "partial-delivery-2", "web");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(order.lines[0].orderItemId).fulfillment_status, "fulfilled");
    assert.deepEqual({ ...sqlite.prepare("SELECT status, fulfillment_status FROM shop_orders WHERE id = ?").get(order.orderId) }, { status: "fulfilled", fulfillment_status: "fulfilled" });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transactional_email_outbox WHERE topic = 'shop.order.fulfilled' AND aggregate_id = ?").get(order.orderId).count, 1);
  } finally {
    sqlite.close();
  }
});

test("mixed automatic and manual fulfillment keeps the order partial after key delivery", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  const now = new Date().toISOString();
  try {
    sqlite.prepare(`INSERT INTO shop_variants
      (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor, compare_at_minor, currency,
       low_stock_threshold, max_per_order, option_values_json, metadata_json, version, created_at, updated_at)
      VALUES ('variant-manual', 'product-1', 'CLOUD-MANUAL', 'active', 'manual', 'manual', 'unlimited', 80000, NULL, 'VND', 0, 10, '{}', '{}', 1, ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary)
      VALUES ('variant-manual', 'vi', 'Cai dat thu cong', '')`).run();

    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "mixed@example.com", displayName: "Mixed Buyer", locale: "vi" },
      items: [
        { variantId: "variant-1", quantity: 1 },
        { variantId: "variant-manual", quantity: 1 },
      ],
      locale: "vi",
      sourceChannel: "web",
    }, "mixed-checkout", { id: "buyer", channel: "web" }, "mixed-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(now, order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);

    const automaticLine = order.lines.find((line) => line.variantId === "variant-1");
    const manualLine = order.lines.find((line) => line.variantId === "variant-manual");
    assert.ok(automaticLine);
    assert.ok(manualLine);
    const claimed = await shop.claimFulfillmentAllocation(db, automaticLine.orderItemId, "mixed-lease", 90, "web");
    assert.ok(claimed);
    await shop.markFulfillmentDelivered(db, claimed.allocationId, "mixed-lease", actor, "mixed-delivery", "web");

    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(automaticLine.orderItemId).fulfillment_status, "fulfilled");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(manualLine.orderItemId).fulfillment_status, "unfulfilled");
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status, fulfillment_status, fulfilled_at FROM shop_orders WHERE id = ?").get(order.orderId) },
      { status: "processing", fulfillment_status: "partial", fulfilled_at: null },
    );
  } finally {
    sqlite.close();
  }
});

test("retryable fulfillment failure returns the key to processing and permits a later delivery", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "retry@example.com", displayName: "Retry Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "retry-checkout", { id: "buyer", channel: "web" }, "retry-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);

    const first = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "retry-lease-1", 90, "web");
    await shop.markFulfillmentFailed(db, first.allocationId, "retry-lease-1", "transient_delivery_error", actor, "retry-failed", "web");
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_allocations WHERE id = ?").get(first.allocationId).status, "held");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(order.lines[0].orderItemId).fulfillment_status, "processing");

    const retry = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "retry-lease-2", 90, "web");
    assert.equal(retry?.allocationId, first.allocationId);
    await shop.markFulfillmentDelivered(db, retry.allocationId, "retry-lease-2", actor, "retry-delivered", "web");
    assert.equal(sqlite.prepare("SELECT status FROM shop_orders WHERE id = ?").get(order.orderId).status, "fulfilled");
  } finally {
    sqlite.close();
  }
});

test("checkout rate limits and active reservation caps are atomic per pseudonymous subject", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 4);
  try {
    const subject = Buffer.alloc(32, 0x31).toString("base64url");
    for (let count = 0; count < 8; count += 1) {
      assert.equal((await shop.consumeCheckoutRateLimit(db, subject)).allowed, true);
    }
    const limited = await shop.consumeCheckoutRateLimit(db, subject);
    assert.equal(limited.allowed, false);
    assert.ok(limited.retryAfterSeconds >= 1 && limited.retryAfterSeconds <= 60);

    const input = {
      customer: { email: "subject@example.com", displayName: "Subject", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    };
    for (let count = 0; count < 3; count += 1) {
      await shop.createCheckoutOrder(db, input, `subject-checkout-${count}`, { id: "buyer", channel: "web" }, `subject-request-${count}`, undefined, subject);
    }
    await assert.rejects(
      () => shop.createCheckoutOrder(db, input, "subject-checkout-4", { id: "buyer", channel: "web" }, "subject-request-4", undefined, subject),
      (error) => error?.code === "checkout_active_order_limit",
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_orders WHERE checkout_subject_hash = ?").get(subject).count, 3);
  } finally {
    sqlite.close();
  }
});

test("fulfillment leases can be reclaimed after expiry, snapshot the web channel, and hide state-drifted keys", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "lease@example.com", displayName: "Lease Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "lease-checkout-key", { id: "buyer", channel: "web" }, "lease-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);
    const first = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "lease-first", 90, "web");
    assert.ok(first);
    sqlite.prepare("UPDATE shop_inventory_allocations SET lease_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), first.allocationId);
    const reclaimed = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "lease-second", 90, "web");
    assert.equal(reclaimed?.allocationId, first.allocationId);
    await assert.rejects(
      () => shop.markFulfillmentDelivered(db, first.allocationId, "lease-first", actor, "old-lease", "web"),
      (error) => error?.code === "fulfillment_lease_invalid",
    );
    await shop.markFulfillmentDelivered(db, reclaimed.allocationId, "lease-second", actor, "new-lease", "web");
    const events = sqlite.prepare("SELECT channel FROM shop_fulfillment_events WHERE order_item_id = ? ORDER BY created_at, id").all(order.lines[0].orderItemId);
    assert.equal(events.at(-1).channel, "web");
    const movements = sqlite.prepare("SELECT event_type, from_status, to_status FROM shop_inventory_movements WHERE inventory_unit_id = ? ORDER BY created_at, id").all(reclaimed.id);
    assert.deepEqual(movements.map((entry) => entry.event_type), ["reserved", "fulfilled"]);
    assert.equal(movements.at(-1).from_status, "reserved");
    assert.equal(movements.at(-1).to_status, "fulfilled");
    assert.equal(sqlite.prepare("SELECT delivery_mode, inventory_policy FROM shop_order_items WHERE id = ?").get(order.lines[0].orderItemId).delivery_mode, "automatic");
    assert.equal((await shop.listFulfilledFulfillmentAllocations(db, order.orderId)).length, 1);
    sqlite.prepare("UPDATE shop_inventory_units SET status = 'quarantined' WHERE id = ?").run(reclaimed.id);
    assert.equal((await shop.listFulfilledFulfillmentAllocations(db, order.orderId)).length, 0);
  } finally {
    sqlite.close();
  }
});

test("expired Telegram outbox processing leases are reclaimed and stale workers cannot ack", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  const now = new Date();
  const expired = new Date(now.getTime() - 1_000).toISOString();
  const created = new Date(now.getTime() - 10_000).toISOString();
  const staleLeaseToken = Buffer.alloc(32, 0x63).toString("base64url");
  const staleLeaseTokenHash = await shop.sha256Base64Url(staleLeaseToken);
  sqlite.prepare(`INSERT INTO shop_webhook_outbox
    (id, topic, aggregate_type, aggregate_id, destination, dedupe_key, payload_json, status, attempt_count, available_at, locked_by, lock_token_hash, lock_expires_at, created_at, updated_at)
    VALUES ('outbox-crashed-vps', 'shop.order.paid', 'shop_order', 'order-1', 'telegram_vps', 'dedupe-crashed-vps', '{}', 'processing', 1, ?, 'telegram-vps', ?, ?, ?, ?)`)
    .run(expired, staleLeaseTokenHash, expired, created, created);
  try {
    const claimed = await shop.claimWebhookOutbox(db, { destination: "telegram_vps", workerId: "telegram-vps", limit: 10, leaseSeconds: 60 });
    assert.equal(claimed.messages.length, 1);
    assert.equal(claimed.messages[0].id, "outbox-crashed-vps");
    assert.equal(claimed.messages[0].attemptCount, 2);
    assert.match(claimed.leaseToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(sqlite.prepare("SELECT locked_by, status FROM shop_webhook_outbox WHERE id = 'outbox-crashed-vps'").get().locked_by, "telegram-vps");
    assert.equal(await shop.markWebhookDelivered(db, "outbox-crashed-vps", "telegram-vps", staleLeaseToken), false);
    assert.equal(await shop.markWebhookDelivered(db, "outbox-crashed-vps", "telegram-vps", claimed.leaseToken), true);
    assert.equal(sqlite.prepare("SELECT status FROM shop_webhook_outbox WHERE id = 'outbox-crashed-vps'").get().status, "delivered");
  } finally {
    sqlite.close();
  }
});

test("corrupt fulfillment inventory is quarantined and replaced without reusing the bad unit", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "quarantine@example.com", displayName: "Quarantine Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "quarantine-checkout-key", { id: "buyer", channel: "web" }, "quarantine-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    const first = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "quarantine-lease", 90, "web");
    const result = await shop.quarantineFulfillmentAllocation(db, first.allocationId, "quarantine-lease", "system:test", "quarantine-event", "web");
    assert.equal(result.replaced, true);
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_units WHERE id = ?").get(first.id).status, "quarantined");
    const replacement = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "replacement-lease", 90, "web");
    assert.ok(replacement);
    assert.notEqual(replacement.id, first.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_allocations WHERE order_item_id = ? AND status = 'released'").get(order.lines[0].orderItemId).count, 1);
    assert.equal(sqlite.prepare("SELECT event_type FROM shop_inventory_movements WHERE inventory_unit_id = ? ORDER BY created_at, id").all(first.id).at(-1).event_type, "quarantined");
    assert.equal(sqlite.prepare("SELECT event_type FROM shop_inventory_movements WHERE inventory_unit_id = ? ORDER BY created_at, id").all(replacement.id).at(-1).event_type, "reserved");
  } finally {
    sqlite.close();
  }
});

test("fulfillment refuses allocation and unit state drift instead of leasing an available key", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "drift@example.com", displayName: "Drift Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "drift-checkout", { id: "buyer", channel: "web" }, "drift-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);
    sqlite.prepare("UPDATE shop_inventory_units SET status = 'available' WHERE id = 'inventory-1'").run();

    assert.equal(await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "drift-lease", 90, "web"), null);
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_allocations WHERE order_item_id = ?").get(order.lines[0].orderItemId).status, "held");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_fulfillment_events WHERE order_item_id = ? AND event_type = 'claimed'").get(order.lines[0].orderItemId).count, 0);
  } finally {
    sqlite.close();
  }
});

test("quarantine without replacement marks fulfillment failed and leaves no claimable key", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "no-replacement@example.com", displayName: "No Replacement Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "no-replacement-checkout", { id: "buyer", channel: "web" }, "no-replacement-request");
    sqlite.prepare("UPDATE shop_orders SET status = 'processing', payment_status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.orderId);
    sqlite.prepare("UPDATE shop_inventory_reservations SET status = 'converted' WHERE order_id = ?").run(order.orderId);
    const claimed = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "no-replacement-lease", 90, "web");
    const result = await shop.quarantineFulfillmentAllocation(db, claimed.allocationId, "no-replacement-lease", "system:test", "no-replacement-quarantine", "web");

    assert.equal(result.replaced, false);
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ?").get(order.lines[0].orderItemId).fulfillment_status, "failed");
    assert.equal(sqlite.prepare("SELECT fulfillment_status FROM shop_orders WHERE id = ?").get(order.orderId).fulfillment_status, "failed");
    assert.equal(await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "no-replacement-retry", 90, "web"), null);
  } finally {
    sqlite.close();
  }
});

test("payOS attempt never marks an order paid before verified reconciliation and duplicate events stay idempotent", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "payment@example.com", displayName: "Payment Buyer", locale: "vi", marketingConsent: false },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "checkout-payment-flow", { id: "buyer", channel: "web" }, "payment-order");
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "payment-provider");
    const providerOrderCode = 202607240001;
    const providerDescription = "TPAYFLOW01";
    const providerReference = "paylink-flow-1";
    const expectedAccount = "0123456789";
    const attempt = await shop.createPaymentAttempt(db, {
      orderId: order.orderId,
      providerConfigId: provider.id,
      providerOrderCode,
      providerDescription,
      providerReference,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }, actor, "payment-attempt");
    assert.equal(attempt.status, "awaiting_payment");
    const pendingOrder = sqlite.prepare("SELECT status, payment_status FROM shop_orders WHERE id = ?").get(order.orderId);
    assert.equal(pendingOrder.status, "pending_payment");
    assert.equal(pendingOrder.payment_status, "pending");

    const payloadHash = Buffer.alloc(32, 0x51).toString("base64url");
    const wrongAdapter = await shop.reconcilePaymentConfirmation(db, {
      provider: "generic_signed",
      providerEventId: "generic-wrong-adapter-1",
      orderReference: order.orderReference,
      amountMinor: order.totalMinor,
      currency: order.currency,
      payloadHash,
      signatureVerified: true,
      occurredAt: new Date().toISOString(),
    }, actor, "payment-wrong-adapter");
    assert.equal(wrongAdapter.outcome, "rejected");
    assert.equal(wrongAdapter.code, "provider_not_supported");

    const mismatch = await shop.reconcilePaymentConfirmation(db, {
      provider: "payos",
      providerEventId: "payos-mismatch-1",
      providerReference,
      providerOrderCode,
      destinationAccountNumber: expectedAccount,
      orderReference: providerDescription,
      amountMinor: order.totalMinor + 1,
      currency: order.currency,
      payloadHash,
      signatureVerified: true,
      occurredAt: new Date().toISOString(),
    }, actor, "payment-mismatch", { payOsAccountNumber: expectedAccount });
    assert.equal(mismatch.outcome, "rejected");
    assert.equal(mismatch.code, "amount_mismatch");
    assert.equal(sqlite.prepare("SELECT payment_status FROM shop_orders WHERE id = ?").get(order.orderId).payment_status, "pending");

    const confirmation = {
      provider: "payos",
      providerEventId: "payos-paid-1",
      providerReference,
      providerOrderCode,
      destinationAccountNumber: expectedAccount,
      orderReference: providerDescription,
      amountMinor: order.totalMinor,
      currency: order.currency,
      payloadHash,
      signatureVerified: true,
      occurredAt: new Date().toISOString(),
    };
    const paid = await shop.reconcilePaymentConfirmation(db, confirmation, actor, "payment-paid", { payOsAccountNumber: expectedAccount });
    const replay = await shop.reconcilePaymentConfirmation(db, confirmation, actor, "payment-paid-replay", { payOsAccountNumber: expectedAccount });
    assert.equal(paid.outcome, "paid");
    assert.equal(replay.outcome, "already_processed");
    await assert.rejects(
      () => shop.reconcilePaymentConfirmation(db, {
        ...confirmation,
        payloadHash: Buffer.alloc(32, 0x52).toString("base64url"),
      }, actor, "payment-collision", { payOsAccountNumber: expectedAccount }),
      (error) => error?.code === "payment_event_payload_mismatch",
    );
    const paidOrder = sqlite.prepare("SELECT status, payment_status FROM shop_orders WHERE id = ?").get(order.orderId);
    assert.equal(paidOrder.status, "processing");
    assert.equal(paidOrder.payment_status, "paid");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transactional_email_outbox WHERE topic = 'shop.order.payment_confirmed' AND aggregate_id = ?").get(order.orderId).count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_webhook_outbox WHERE aggregate_id = ?").get(order.orderId).count, 0, "web orders must not enqueue an unreachable Telegram event");
    const claimed = await shop.claimFulfillmentAllocation(db, order.lines[0].orderItemId, "lease-hash-paid", 90);
    assert.equal(claimed?.orderId, order.orderId);
    const delivered = await shop.markFulfillmentDelivered(db, claimed.allocationId, "lease-hash-paid", actor, "fulfillment-delivered");
    assert.equal(delivered.orderId, order.orderId);
    assert.equal(sqlite.prepare("SELECT status FROM shop_orders WHERE id = ?").get(order.orderId).status, "fulfilled");
  } finally {
    sqlite.close();
  }
});

test("payOS reconciliation binds account number and description to the expected payment attempt", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  const expectedAccount = "0123456789";
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "payos-identity@example.com", displayName: "PayOS Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "payos-identity-checkout", { id: "buyer", channel: "web" }, "payos-order");
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "payos-provider");
    const providerOrderCode = 202607240002;
    const providerDescription = "TABC12345";
    const providerReference = "paylink-identity-1";
    await shop.createPaymentAttempt(db, {
      orderId: order.orderId,
      providerConfigId: provider.id,
      providerOrderCode,
      providerDescription,
      providerReference,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }, actor, "payos-attempt");
    const confirmation = {
      provider: "payos",
      providerEventId: "payos-identity-event-1",
      providerReference,
      providerOrderCode,
      destinationAccountNumber: expectedAccount,
      transactionReference: "payos-identity-event-1",
      orderReference: providerDescription,
      amountMinor: order.totalMinor,
      currency: order.currency,
      payloadHash: Buffer.alloc(32, 0x61).toString("base64url"),
      signatureVerified: true,
      occurredAt: new Date().toISOString(),
    };

    const wrongAccount = await shop.reconcilePaymentConfirmation(db, {
      ...confirmation,
      providerEventId: "payos-wrong-account",
      destinationAccountNumber: "9999999999",
      payloadHash: Buffer.alloc(32, 0x62).toString("base64url"),
    }, actor, "payos-wrong-account", { payOsAccountNumber: expectedAccount });
    assert.equal(wrongAccount.outcome, "rejected");
    assert.equal(wrongAccount.code, "payment_identity_mismatch");
    const wrongAccountReplay = await shop.reconcilePaymentConfirmation(db, {
      ...confirmation,
      providerEventId: "payos-wrong-account",
      destinationAccountNumber: "9999999999",
      payloadHash: Buffer.alloc(32, 0x62).toString("base64url"),
    }, actor, "payos-wrong-account-replay", { payOsAccountNumber: expectedAccount });
    assert.equal(wrongAccountReplay.outcome, "rejected");
    assert.equal(wrongAccountReplay.code, "payment_identity_mismatch");

    const wrongDescription = await shop.reconcilePaymentConfirmation(db, {
      ...confirmation,
      providerEventId: "payos-wrong-description",
      orderReference: "TWRONG123",
      payloadHash: Buffer.alloc(32, 0x63).toString("base64url"),
    }, actor, "payos-wrong-description", { payOsAccountNumber: expectedAccount });
    assert.equal(wrongDescription.outcome, "rejected");
    assert.equal(wrongDescription.code, "payment_identity_mismatch");
    assert.equal(sqlite.prepare("SELECT payment_status FROM shop_orders WHERE id = ?").get(order.orderId).payment_status, "pending");

    const paid = await shop.reconcilePaymentConfirmation(
      db,
      confirmation,
      actor,
      "payos-valid",
      { payOsAccountNumber: expectedAccount },
    );
    assert.equal(paid.outcome, "paid");
    const persistedEvents = JSON.stringify(sqlite.prepare("SELECT * FROM shop_payment_events WHERE order_id = ?").all(order.orderId));
    assert.equal(persistedEvents.includes(expectedAccount), false, "destination account must remain ephemeral");
  } finally {
    sqlite.close();
  }
});

test("abnormal payOS payment attention is durable and idempotent without expiring the order", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "payment-attention@example.com", displayName: "Attention Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "payment-attention-checkout", { id: "buyer", channel: "web" }, "payment-attention-order");
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "payment-attention-provider");
    const attempt = await shop.createPaymentAttempt(db, {
      orderId: order.orderId,
      providerConfigId: provider.id,
      providerOrderCode: 202607240007,
      providerDescription: "TATTN001",
      providerReference: "paylink-attention-1",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }, actor, "payment-attention-attempt");
    const input = {
      paymentAttemptId: attempt.id,
      providerEventId: "attention:stable-payload-hash",
      transactionReference: "FT-LATE-001",
      amountMinor: order.totalMinor,
      currency: "VND",
      orderReference: attempt.providerDescription,
      payloadHash: Buffer.alloc(32, 0x73).toString("base64url"),
      matchState: "matched",
      errorCode: "payos_late",
      occurredAt: new Date().toISOString(),
    };
    assert.equal(await shop.recordPayOsPaymentAttention(db, input), true);
    assert.equal(await shop.recordPayOsPaymentAttention(db, input), false, "repeated sweeps must not duplicate attention");
    const events = sqlite.prepare("SELECT event_type, processing_state, error_code FROM shop_payment_events WHERE provider = 'payos' AND provider_event_id = ?").all(input.providerEventId);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "payment.attention");
    assert.equal(events[0].processing_state, "accepted");
    assert.equal(events[0].error_code, "payos_late");
    assert.equal(sqlite.prepare("SELECT status FROM shop_payment_attempts WHERE id = ?").get(attempt.id).status, "awaiting_payment");
    assert.equal(sqlite.prepare("SELECT status, payment_status FROM shop_orders WHERE id = ?").get(order.orderId).payment_status, "pending");
  } finally {
    sqlite.close();
  }
});

test("PayOS can settle a pre-expiry transfer detected after the attempt window, but a swept order cannot reopen", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 2);
  const actor = { id: "owner", channel: "admin" };
  const expectedAccount = "0123456789";
  try {
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "payos-late-provider");
    const createPendingPayOsOrder = async (checkoutKey, orderCode, description, expiredMsAgo = 60_000) => {
      const order = await shop.createCheckoutOrder(db, {
        customer: { email: `${checkoutKey}@example.com`, displayName: "PayOS Buyer", locale: "vi" },
        items: [{ variantId: "variant-1", quantity: 1 }],
        locale: "vi",
        sourceChannel: "web",
      }, checkoutKey, { id: "buyer", channel: "web" }, `${checkoutKey}-request`);
      const attempt = await shop.createPaymentAttempt(db, {
        orderId: order.orderId,
        providerConfigId: provider.id,
        providerOrderCode: orderCode,
        providerDescription: description,
        providerReference: `paylink-${orderCode}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }, actor, `${checkoutKey}-attempt`);
      const expiresAt = new Date(Date.now() - expiredMsAgo).toISOString();
      const occurredAt = new Date(Date.parse(expiresAt) - 60_000).toISOString();
      sqlite.prepare("UPDATE shop_payment_attempts SET expires_at = ? WHERE id = ?").run(expiresAt, attempt.id);
      return { order, attempt, occurredAt };
    };

    const recoverable = await createPendingPayOsOrder("payos-recoverable", 202607240003, "TRECOVER001");
    const recoverableConfirmation = {
      provider: "payos",
      providerEventId: "payos-recoverable-event",
      providerReference: recoverable.attempt.providerReference,
      providerOrderCode: recoverable.attempt.providerOrderCode,
      destinationAccountNumber: expectedAccount,
      transactionReference: "payos-recoverable-event",
      orderReference: recoverable.attempt.providerDescription,
      amountMinor: recoverable.order.totalMinor,
      currency: recoverable.order.currency,
      payloadHash: Buffer.alloc(32, 0x71).toString("base64url"),
      signatureVerified: true,
      occurredAt: recoverable.occurredAt,
    };
    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_attempted_at = ? WHERE id = ?")
      .run(new Date().toISOString(), recoverable.attempt.id);
    assert.equal(await shop.expirePaymentAttempts(db), 0, "PROCESSING or late transfer evidence must remain recoverable");
    const recovered = await shop.reconcilePaymentConfirmation(db, recoverableConfirmation, actor, "payos-recoverable-request", { payOsAccountNumber: expectedAccount });
    assert.equal(recovered.outcome, "paid");
    assert.equal(sqlite.prepare("SELECT payment_status FROM shop_orders WHERE id = ?").get(recoverable.order.orderId).payment_status, "paid");

    const swept = await createPendingPayOsOrder("payos-swept", 202607240004, "TSWEPT001", 61 * 60_000);
    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_checked_at = ? WHERE id = ?").run(new Date().toISOString(), swept.attempt.id);
    await shop.expirePaymentAttempts(db);
    const sweptResult = await shop.reconcilePaymentConfirmation(db, {
      ...recoverableConfirmation,
      providerEventId: "payos-swept-event",
      providerReference: swept.attempt.providerReference,
      providerOrderCode: swept.attempt.providerOrderCode,
      orderReference: swept.attempt.providerDescription,
      occurredAt: swept.occurredAt,
      payloadHash: Buffer.alloc(32, 0x72).toString("base64url"),
    }, actor, "payos-swept-request", { payOsAccountNumber: expectedAccount });
    assert.equal(sweptResult.outcome, "rejected");
    assert.equal(sweptResult.code, "payment_attempt_not_found");
    assert.equal(sqlite.prepare("SELECT payment_status, status FROM shop_orders WHERE id = ?").get(swept.order.orderId).payment_status, "failed");
  } finally {
    sqlite.close();
  }
});

test("payOS expiry waits for a successful post-deadline check and protects reserved inventory", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 1);
  const actor = { id: "owner", channel: "admin" };
  try {
    const order = await shop.createCheckoutOrder(db, {
      customer: { email: "reconciliation-guard@example.com", displayName: "Guard Buyer", locale: "vi" },
      items: [{ variantId: "variant-1", quantity: 1 }],
      locale: "vi",
      sourceChannel: "web",
    }, "reconciliation-guard-checkout", { id: "buyer", channel: "web" }, "reconciliation-guard-order");
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "reconciliation-guard-provider");
    const attempt = await shop.createPaymentAttempt(db, {
      orderId: order.orderId,
      providerConfigId: provider.id,
      providerOrderCode: 202607240005,
      providerDescription: "TGUARD001",
      providerReference: "paylink-reconciliation-guard",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }, actor, "reconciliation-guard-attempt");
    const expiredAt = new Date(Date.now() - 61 * 60_000).toISOString();
    sqlite.prepare("UPDATE shop_payment_attempts SET expires_at = ? WHERE id = ?").run(expiredAt, attempt.id);
    sqlite.prepare("UPDATE shop_inventory_reservations SET expires_at = ? WHERE order_id = ?").run(expiredAt, order.orderId);

    assert.equal(await shop.expirePaymentAttempts(db), 0, "unchecked backlog entries must remain payable");
    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_attempted_at = ? WHERE id = ?").run(new Date().toISOString(), attempt.id);
    assert.equal(await shop.expirePaymentAttempts(db), 0, "a failed payOS GET must not authorize expiry");
    assert.equal(await shop.releaseExpiredReservations(db), 0, "inventory must stay reserved while the payment attempt is protected");
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_units WHERE id = 'inventory-1'").get().status, "reserved");

    const beforeDeadline = new Date(Date.parse(expiredAt) - 1_000).toISOString();
    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_checked_at = ? WHERE id = ?").run(beforeDeadline, attempt.id);
    assert.equal(await shop.expirePaymentAttempts(db), 0, "a pre-deadline status check cannot prove the final state");

    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_checked_at = ? WHERE id = ?").run(new Date().toISOString(), attempt.id);
    assert.equal(await shop.expirePaymentAttempts(db), 1);
    assert.equal(await shop.releaseExpiredReservations(db), 1);
    assert.equal(sqlite.prepare("SELECT status FROM shop_payment_attempts WHERE id = ?").get(attempt.id).status, "expired");
    assert.equal(sqlite.prepare("SELECT payment_status, status FROM shop_orders WHERE id = ?").get(order.orderId).payment_status, "failed");
    assert.equal(sqlite.prepare("SELECT status FROM shop_inventory_units WHERE id = 'inventory-1'").get().status, "available");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_inventory_movements WHERE event_type = 'released' AND inventory_unit_id = 'inventory-1'").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("the seventh payOS attempt beyond a bounded reconciliation page cannot expire unchecked", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  seedShopProduct(sqlite, 7);
  const actor = { id: "owner", channel: "admin" };
  try {
    const provider = await shop.createPaymentProviderConfig(db, {
      displayName: "VietQR via payOS",
      status: "active",
      provider: "vietqr",
      bankId: "970436",
      accountRef: "VIETQR_BANK_ACCOUNT",
      confirmationAdapter: "payos",
      secretRef: "PAYOS_CHECKSUM_KEY",
      publicConfig: {},
    }, actor, "bounded-page-provider");
    const attempts = [];
    const expiredAt = new Date(Date.now() - 61 * 60_000).toISOString();
    for (let index = 0; index < 7; index += 1) {
      const order = await shop.createCheckoutOrder(db, {
        customer: { email: `bounded-${index}@example.com`, displayName: `Bounded Buyer ${index}`, locale: "vi" },
        items: [{ variantId: "variant-1", quantity: 1 }],
        locale: "vi",
        sourceChannel: "web",
      }, `bounded-page-checkout-${index}`, { id: `buyer-${index}`, channel: "web" }, `bounded-page-order-${index}`);
      const attempt = await shop.createPaymentAttempt(db, {
        orderId: order.orderId,
        providerConfigId: provider.id,
        providerOrderCode: 202607240100 + index,
        providerDescription: `TBOUND0${index}`,
        providerReference: `paylink-bounded-${index}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }, actor, `bounded-page-attempt-${index}`);
      sqlite.prepare("UPDATE shop_payment_attempts SET expires_at = ? WHERE id = ?").run(expiredAt, attempt.id);
      sqlite.prepare("UPDATE shop_inventory_reservations SET expires_at = ? WHERE order_id = ?").run(expiredAt, order.orderId);
      attempts.push({ attemptId: attempt.id, orderId: order.orderId });
    }

    const checkedAt = new Date().toISOString();
    for (const item of attempts.slice(0, 6)) {
      sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_attempted_at = ?, reconciliation_checked_at = ? WHERE id = ?")
        .run(checkedAt, checkedAt, item.attemptId);
    }
    assert.equal(await shop.expirePaymentAttempts(db), 6);
    assert.equal(await shop.releaseExpiredReservations(db), 6);
    const unchecked = sqlite.prepare(`SELECT pa.status AS attempt_status, o.status AS order_status, r.status AS reservation_status
      FROM shop_payment_attempts pa
      JOIN shop_orders o ON o.id = pa.order_id
      JOIN shop_inventory_reservations r ON r.order_id = o.id
      WHERE pa.id = ?`).get(attempts[6].attemptId);
    assert.equal(unchecked.attempt_status, "awaiting_payment");
    assert.equal(unchecked.order_status, "pending_payment");
    assert.equal(unchecked.reservation_status, "active");

    sqlite.prepare("UPDATE shop_payment_attempts SET reconciliation_attempted_at = ?, reconciliation_checked_at = ? WHERE id = ?")
      .run(checkedAt, checkedAt, attempts[6].attemptId);
    assert.equal(await shop.expirePaymentAttempts(db), 1);
    assert.equal(await shop.releaseExpiredReservations(db), 1);
  } finally {
    sqlite.close();
  }
});

test("category migration backfills existing product metadata", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(read("content-migrations/0001_content_cms.sql"));
    sqlite.exec(read("content-migrations/0009_shop_core.sql"));
    const now = "2026-07-24T00:00:00.000Z";
    sqlite.prepare(`INSERT INTO shop_products
      (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
       published_at, created_by, updated_by, created_at, updated_at)
      VALUES ('legacy-category-product', 'legacy-category-product', 'draft', 'digital_key', 0, 0, 'vi', ?, 1, NULL, 'test', 'test', ?, ?)`)
      .run(JSON.stringify({ category: "Microsoft 365", categorySlug: "microsoft-365" }), now, now);
    sqlite.exec(read("content-migrations/0017_shop_categories.sql"));
    const category = sqlite.prepare(`SELECT c.slug, l.title FROM shop_categories c
      JOIN shop_category_localizations l ON l.category_id = c.id AND l.locale = 'vi'`).get();
    assert.equal(category.slug, "microsoft-365");
    assert.equal(category.title, "Microsoft 365");
  } finally {
    sqlite.close();
  }
});

test("catalog CRUD keeps optimistic versions and does not duplicate variants during update", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  const actor = { id: "owner", channel: "admin" };
  const input = {
    slug: "first-product",
    status: "draft",
    productType: "digital_key",
    featured: false,
    defaultLocale: "vi",
    localizations: {
      vi: {
        title: "First product",
        shortDescription: "A first product.",
        description: "A first product description.",
        seoTitle: "First product — TUNG",
        seoDescription: "A first product for testing.",
      },
    },
    variants: [{
      sku: "FIRST-STD",
      status: "draft",
      fulfillmentType: "license_key",
      deliveryMode: "automatic",
      inventoryPolicy: "tracked",
      priceMinor: 99_000,
      compareAtMinor: null,
      currency: "VND",
      localizations: { vi: { title: "Standard" } },
    }],
    media: [],
  };
  try {
    const created = await shop.createShopProduct(db, input, actor, "crud-create");
    assert.equal(created.slug, "first-product");
    assert.equal(created.version, 1);
    assert.equal(created.variants.length, 1);
    const variantId = created.variants[0].id;
    const updated = await shop.updateShopProduct(db, created.id, {
      ...input,
      slug: "first-product-updated",
      variants: [{ ...input.variants[0], id: variantId, sku: "FIRST-UPDATED" }],
    }, 1, actor, "crud-update");
    assert.equal(updated.slug, "first-product-updated");
    assert.equal(updated.version, 2);
    assert.equal(updated.variants[0].sku, "FIRST-UPDATED");
    await assert.rejects(
      () => shop.updateShopProduct(db, created.id, input, 1, actor, "crud-stale"),
      (error) => error?.code === "product_update_conflict",
    );
    const inventoryTimestamp = new Date().toISOString();
    sqlite.prepare(`INSERT INTO shop_inventory_units
      (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64, wrap_iv_b64,
       key_fingerprint, imported_by, imported_at, updated_at)
      VALUES (?, ?, 'available', 'aes-256-gcm-envelope-v1', 'test-v1', ?, ?, ?, ?, ?, 'owner', ?, ?)`).run(
      "archive-blocking-inventory",
      variantId,
      "A".repeat(24),
      "B".repeat(16),
      "C".repeat(64),
      "D".repeat(16),
      "E".repeat(43),
      inventoryTimestamp,
      inventoryTimestamp,
    );
    await assert.rejects(
      () => shop.archiveShopProduct(db, created.id, 2, actor, "crud-archive-blocked"),
      (error) => error?.code === "variant_archive_inventory_conflict",
    );
    sqlite.prepare("UPDATE shop_inventory_units SET status = 'revoked' WHERE id = ?").run("archive-blocking-inventory");
    const archived = await shop.archiveShopProduct(db, created.id, 2, actor, "crud-archive");
    assert.equal(archived.status, "archived");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transaction_guards").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("canonical categories gate product assignment and protect in-use categories", async () => {
  const shop = await loadShopRepository();
  const { db, sqlite } = createShopD1();
  const actor = { id: "owner", channel: "admin" };
  const categoryInput = {
    slug: "productivity",
    status: "active",
    defaultLocale: "vi",
    localizations: {
      vi: { title: "Năng suất", description: "Ứng dụng năng suất." },
      en: { title: "Productivity", description: "Productivity apps." },
    },
  };
  const productInput = {
    slug: "categorized-product",
    status: "draft",
    productType: "digital_key",
    featured: false,
    defaultLocale: "vi",
    metadata: { category: "Legacy label", categorySlug: "productivity" },
    localizations: { vi: { title: "Categorized", shortDescription: "A categorized product.", description: "Description.", seoTitle: "Categorized", seoDescription: "Description." } },
    variants: [{ sku: "CAT-STD", status: "draft", fulfillmentType: "license_key", deliveryMode: "automatic", inventoryPolicy: "tracked", priceMinor: 1000, currency: "VND", localizations: { vi: { title: "Standard" } } }],
    media: [],
  };
  try {
    const category = await shop.createShopCategory(db, categoryInput, actor, "category-create");
    const product = await shop.createShopProduct(db, productInput, actor, "category-product-create");
    assert.equal(product.metadata.categorySlug, "productivity");
    assert.equal((await shop.listShopCategories(db))[0].usageCount, 1);
    await assert.rejects(
      () => shop.archiveShopCategory(db, category.id, category.version, actor, "category-archive-in-use"),
      (error) => error?.code === "category_in_use",
    );
    await assert.rejects(
      () => shop.createShopProduct(db, { ...productInput, slug: "unknown-category-product", metadata: { categorySlug: "does-not-exist" } }, actor, "category-product-invalid"),
      (error) => error?.code === "category_not_found",
    );
  } finally {
    sqlite.close();
  }
});

test("admin shop API keeps Access, CSRF and second-factor gates ahead of shop data access", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const accessIndex = entry.indexOf("verifyCloudflareAccess");
  const csrfIndex = entry.indexOf("verifyMutationRequest(request)");
  const shopIndex = entry.indexOf('segments[0] === "shop"');
  const sessionIndex = entry.indexOf("if (!adminSession)");
  assert.ok(accessIndex >= 0, "Cloudflare Access verification is missing");
  assert.ok(csrfIndex > accessIndex, "CSRF must run after Access verification");
  assert.ok(shopIndex > sessionIndex, "shop data must be behind the second-factor session");
  assert.match(entry, /segments\[0\]\s*===\s*["']shop["']/);
  const shopApi = [
    "src/lib/admin/router/shop-routes.ts",
    "src/lib/admin/router/shop/catalog.ts",
    "src/lib/admin/router/shop/ops.ts",
    "src/lib/admin/router/shop/payments.ts",
    "src/lib/admin/router/shop/integrations.ts",
  ].map((path) => read(path)).join("\n");
  for (const area of ["product", "inventory", "order", "payment", "fulfillment"]) {
    assert.match(shopApi, new RegExp(area, "i"), `shop API is missing ${area} handling`);
  }
  assert.doesNotMatch([entry, shopApi].join("\n"), /console\.log\([^)]*(?:plaintext|ciphertext|token|secret|key)/i);
});

test("public shop surfaces never expose repository references or integration secrets", () => {
  const publicFiles = [
    "src/i18n/shop.ts",
    "src/components/shop/ProductCard.astro",
    "src/components/pages/ShopPage.astro",
    "src/components/pages/ProductPage.astro",
    "src/pages/shop.astro",
    "src/pages/shop/[slug].astro",
  ];
  for (const file of publicFiles) {
    if (!existsSync(`${projectRoot}/${file}`)) continue;
    const source = read(file);
    assert.doesNotMatch(source, /github\.com|GitHub|repoUrl|repositoryUrl/i, file);
    assert.doesNotMatch(source, /(?:SHOP_KEY_ENCRYPTION_SECRET|NOTION_SHOP_TOKEN|PAYOS_WEBHOOK_SECRET|CASSO_WEBHOOK_SECRET)/, file);
  }
});
