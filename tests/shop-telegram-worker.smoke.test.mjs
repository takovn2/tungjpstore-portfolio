import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { rewriteShopDynamicImports, commerceMenuModule } = await import("./helpers/shop-inline.mjs");

async function loadTelegram() {
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const telegram = compile(read("src/lib/shop/telegram.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  // Re-attach the commerce menu layer after stripping (the data URL contains a
  // ";" so it can never survive the import-strip regex inline).
  const menuHoist = `const { menuKeyboard } = await import(${JSON.stringify(commerceMenuModule)});`;
  return importSource(`${types}\n${crypto}\n${menuHoist}\n${telegram}`);
}

async function loadTelegramOutbox() {
  const outbox = compile(read("src/lib/shop/telegram-outbox.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(outbox);
}

async function loadShopRepository() {
  const money = compile(read("src/lib/shop/money.ts"));
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const validation = compile(read("src/lib/shop/validation.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const repository = rewriteShopDynamicImports(compile(read("src/lib/shop/repository.ts"))).replace(/^import[\s\S]*?;\s*/gm, "");
  const payosStubs = `
    const PAYOS_RECONCILIATION_GRACE_SECONDS = 900;
    const payOsPaymentOccurredWithinRecoveryWindow = () => false;
    const payOsTransferDescriptionMatches = () => false;
  `;
  return importSource(`${money}\n${types}\n${crypto}\n${validation}\n${payosStubs}\n${repository}`);
}

async function loadTelegramCommerce() {
  const types = compile(read("src/lib/shop/types.ts"));
  const commerce = compile(read("src/lib/shop/telegram-commerce.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${types}\n${commerce}`);
}

function createCatalogD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  // Keep the fixture aligned with the scoped Telegram order projection used
  // by the legacy/global split. The production migration is additive, so a
  // minimal equivalent column is enough for this catalog-only fixture.
  sqlite.exec("ALTER TABLE shop_orders ADD COLUMN telegram_bot_config_id TEXT NOT NULL DEFAULT 'environment'");
  const metrics = { batches: 0, statements: 0 };
  const db = {
    prepare(sql) {
      metrics.statements += 1;
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
        __batch() { return { results: statement.all(...bindings), meta: { changes: 0 } }; },
      };
      return prepared;
    },
    async batch(statements) {
      metrics.batches += 1;
      return statements.map((statement) => statement.__batch());
    },
  };
  return { db, sqlite, metrics };
}

function seedCatalogProduct(sqlite) {
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
      published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('product-telegram', 'chatgpt-plus', 'active', 'digital_key', 0, 10, 'vi',
      '{"category":"AI","badges":["Hot"]}', 1, ?, 'test', 'test', ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES ('product-telegram', 'vi', 'ChatGPT Plus', '', 'Tài khoản AI', '', 'ChatGPT Plus', 'Tài khoản AI')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor,
      compare_at_minor, currency, low_stock_threshold, max_per_order, option_values_json, metadata_json,
      version, created_at, updated_at)
    VALUES ('variant-telegram', 'product-telegram', 'GPT-PLUS-1M', 'active', 'license_key', 'automatic',
      'tracked', 2000, NULL, 'VND', 3, 10, '{"duration":"1-month","tier":"plus"}', '{}', 1, ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary)
    VALUES ('variant-telegram', 'vi', 'Plus 1 tháng', '')`).run();
  sqlite.prepare(`INSERT INTO shop_inventory_units
    (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64, wrapped_dek_b64,
      wrap_iv_b64, key_fingerprint, imported_by, imported_at, updated_at)
    VALUES ('inventory-telegram', 'variant-telegram', 'available', 'aes-256-gcm-envelope-v1', 'v1',
      ?, ?, ?, ?, ?, 'test', ?, ?)`).run(
        "c".repeat(23),
        "i".repeat(16),
        "w".repeat(64),
        "r".repeat(16),
        "f".repeat(43),
        now,
        now,
      );
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, source_channel, locale, status, payment_status,
      fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, customer_name_snapshot,
      metadata_json, version, paid_at, created_at, updated_at)
    VALUES ('order-telegram', 'TG-TEST-HOT', 'TESTHOT', 'public-token-hot', 'telegram', 'vi', 'processing',
      'paid', 'unfulfilled', 'VND', 6000, 0, 0, 6000, '', '{}', 1, ?, ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_order_items
    (id, order_id, line_number, product_id, variant_id, product_slug_snapshot, sku_snapshot,
      product_title_snapshot, variant_title_snapshot, fulfillment_type, delivery_mode, inventory_policy,
      quantity, unit_price_minor, subtotal_minor, discount_minor, total_minor, fulfillment_status,
      metadata_json, created_at, updated_at)
    VALUES ('item-telegram', 'order-telegram', 1, 'product-telegram', 'variant-telegram', 'chatgpt-plus',
      'GPT-PLUS-1M', 'ChatGPT Plus', 'Plus 1 tháng', 'license_key', 'automatic', 'tracked', 3, 2000,
      6000, 0, 6000, 'unfulfilled', '{}', ?, ?)`).run(now, now);
}

function createTelegramD1(scoped = false) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0015_shop_telegram_updates.sql"));
  if (scoped) sqlite.exec(read("content-migrations/0038_shop_telegram_bot_scoped_updates.sql"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
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

test("Telegram Worker verifies the secret before parsing and exposes only the webhook route", () => {
  const route = read("src/pages/api/telegram/webhook.ts");
  const miniApi = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const helper = read("src/lib/shop/telegram.ts");
  const commerce = read("src/lib/shop/telegram-commerce.ts");
  assert.match(route, /resolveTelegramBotByWebhookSecret/);
  assert.match(route, /registryState/);
  assert.match(route, /!botHint && await verifyTelegramWebhookSecret/);
  assert.match(route, /existing bot remains Vietnam-only/);
  assert.match(miniApi, /environment-token bot is the independent Vietnam surface/);
  assert.ok(route.indexOf("resolveTelegramBotByWebhookSecret(") < route.indexOf("readTelegramUpdate(request)"));
  assert.match(route, /x-telegram-bot-api-secret-token/i);
  assert.match(route, /claimTelegramUpdate/);
  assert.match(route, /completeTelegramUpdate/);
  assert.match(route, /failTelegramUpdate/);
  assert.match(route, /const snapshot = result\.payment\s*\?\s*null/);
  assert.match(route, /singlePhotoReply/);
  assert.match(helper, /directUrlEligible/);
  assert.match(commerce, /reconcilePendingPayOsPayments\(bindings, \{ orderId \}\)/);
  assert.match(commerce, /owned\.payment_status !== "paid"/);
  assert.match(commerce, /shop_customer_security_events/);
  assert.match(commerce, /event_type = 'key_reveal'/);
  assert.match(commerce, /key_reveal_rate_limited/);
  assert.match(commerce, /INSERT INTO shop_customer_security_events[\s\S]*SELECT \?, \?, 'key_reveal'/);
  assert.match(miniApi, /key_reveal_rate_limited/);
  assert.match(miniApi, /retry-after/);
  assert.match(commerce, /tg\$\{subject\}-\$\{crypto\.randomUUID/);
  assert.match(route, /buildQuantitySelectorReply/);
  assert.match(route, /buildMainMenuReply/);
  assert.match(route, /buildCategoryMenuReply/);
  assert.match(route, /catalogGroups/);
  assert.match(route, /variantDisplayName/);
  assert.match(route, /prioritizeTelegramProducts/);
  assert.match(route, /getPublicProductById/);
  assert.match(route, /getPublicVariantContext/);
  assert.match(route, /getPublicVariantLabels/);
  assert.doesNotMatch(route, /productPhotoUrl/);
  assert.doesNotMatch(route, /cleanupExpiredTelegramUpdates\(env\.CONTENT_DB/);
  assert.doesNotMatch(route, /purgeExpiredTelegramCarts\(env\.CONTENT_DB/);
  assert.match(route, /await answerTelegramCallback\(/);
  assert.doesNotMatch(route, /showPaymentPending|paymentPendingText/);
  assert.match(route, /const legacySupportCallbackKinds = new Set\(\["os", "rf", "ko"\]\)/);
  assert.match(route, /if \(miniAppEnabled && !legacySupportCallbackKinds\.has\(parsed\.kind\)\)/);
  assert.match(route, /async function buildLegacyKeyOpenReply/);
  assert.match(route, /statusForTelegramOrder\(commerceBindings\(\), customer\.customerId, orderId, botConfigId\)/);
  assert.match(route, /buildTelegramStaticReply\("keys", env\.SHOP_PUBLIC_ORIGIN, locale, "TUNG Shop", miniAppEnabled\)/);
  assert.match(route, /protectContent: true/);
  assert.doesNotMatch(route, /revealKeysForTelegramOrder|buildKeyRevealMessages|chunkTelegramText/);
  assert.doesNotMatch(route, /group\.keys|blocks\.push\(key\)/);
  // The native (Mini App off) flow keeps `ko:` buttons wired to buildLegacyKeyOpenReply.
  assert.match(route, /photoKind === "payment"/);
  assert.match(route, /waitUntil\(\(async \(\) =>/);
  assert.match(route, /sendTelegramChatAction/);
  assert.doesNotMatch(route, /tg-update-\$\{user\.id\}-\$\{updateId\}/);
  assert.match(route, /telegramDescription/);
  assert.match(route, /typeof value === "number" \|\| typeof value === "boolean"/);
  assert.match(route, /\^cg:/);
  assert.match(route, /\^\(bq\|aq\)/);
  assert.match(route, /\^qs:/);
  assert.match(route, /\^qi:/);
  assert.match(route, /Math\.min\(1000, Number\(qtyRaw\)/);
  assert.match(route, /editMessageId: message\.message_id/);
  assert.match(route, /editTelegramMessage/);
  assert.match(route, /editTelegramCaption/);
  // Native quantity input (migration 0028) handles awaiting carts in the webhook.
  assert.doesNotMatch(route, /quantity < 6 \|\| quantity > selector\.maximum/);
  assert.match(route, /Array\.from\(\{ length: Math\.min\(5, maximum\) \}/);
  assert.match(commerce, /const CART_MAX_QTY = 1000/);
  assert.match(commerce, /action: .*"await_quantity"/);
  assert.match(commerce, /pending_quantity_message_id/);
  assert.match(commerce, /pending_quantity_uses_caption/);
  assert.match(commerce, /getPublicVariantStock\(requireDb\(bindings\), \[variantId\]\)/);
  assert.doesNotMatch(route, /telegramPublicUrl/);
  assert.doesNotMatch(commerce, /Open website|Mở website|サイトを開く|打开网站/);
  assert.doesNotMatch(route, /SHOP_TELEGRAM_VPS_SECRET|Authorization:\s*Bearer/);
  assert.doesNotMatch(helper, /console\.(?:log|error)/);
  assert.doesNotMatch(helper, /TELEGRAM_BOT_TOKEN\s*[:=]\s*["'][^"']+/);
});

test("Telegram catalog hot paths use bounded product and variant lookups", async () => {
  const repository = await loadShopRepository();
  const { db, sqlite, metrics } = createCatalogD1();
  try {
    seedCatalogProduct(sqlite);
    const summaries = await repository.listPublicProductSummaries(db, { locale: "vi", limit: 100 });
    assert.equal(summaries[0].soldQuantity30d, 3);
    assert.equal(summaries[0].availability, "low_stock");

    const product = await repository.getPublicProductById(db, "product-telegram", "vi");
    assert.equal(product.title, "ChatGPT Plus");
    assert.equal(product.variants.length, 1);
    assert.equal(product.variants[0].availableQuantity, 1);
    assert.equal(metrics.batches, 1);

    const beforeVariant = metrics.statements;
    const context = await repository.getPublicVariantContext(db, "variant-telegram", "vi");
    assert.equal(context.productTitle, "ChatGPT Plus");
    // Tracked inventory: max buyable equals available stock (1 unit seeded).
    assert.equal(context.variant.maxPerOrder, 1);
    assert.equal(metrics.statements - beforeVariant, 1);

    const beforeLabels = metrics.statements;
    const labels = await repository.getPublicVariantLabels(db, ["variant-telegram"], "vi");
    assert.deepEqual(labels[0].optionValues, { duration: "1-month", tier: "plus" });
    assert.equal(metrics.statements - beforeLabels, 1);
  } finally {
    sqlite.close();
  }
});

test("Telegram order history returns paid financials and line details only for the owning customer", async () => {
  const commerce = await loadTelegramCommerce();
  const { db, sqlite } = createCatalogD1();
  try {
    seedCatalogProduct(sqlite);
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO shop_customers
      (id, email_normalized, email_masked, display_name, locale, created_at, updated_at)
      VALUES ('customer-history', 'tg123@telegram.tungjpstore.local', 't***@telegram.tungjpstore.local', 'Tung', 'vi', ?, ?)`)
      .run(now, now);
    sqlite.prepare("UPDATE shop_orders SET customer_id = ?, subtotal_minor = 6000, discount_minor = 1000, discount_code_snapshot = 'WELCOME', total_minor = 5000 WHERE id = 'order-telegram'")
      .run("customer-history");

    const orders = await commerce.listTelegramCustomerOrders({ CONTENT_DB: db }, "customer-history", 20);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].paymentStatus, "paid");
    assert.equal(orders[0].subtotalMinor, 6000);
    assert.equal(orders[0].discountMinor, 1000);
    assert.equal(orders[0].discountCode, "WELCOME");
    assert.equal(orders[0].lineCount, 1);
    assert.equal(orders[0].itemCount, 3);
    assert.equal(orders[0].deliveryReadiness, "ready");

    const lines = await commerce.listTelegramOrderLines({ CONTENT_DB: db }, "customer-history", "order-telegram");
    assert.deepEqual(lines.map((line) => ({ sku: line.sku, quantity: line.quantity, totalMinor: line.totalMinor })), [
      { sku: "GPT-PLUS-1M", quantity: 3, totalMinor: 6000 },
    ]);
    assert.deepEqual(await commerce.listTelegramOrderLines({ CONTENT_DB: db }, "another-customer", "order-telegram"), []);
  } finally {
    sqlite.close();
  }
});

test("legacy Telegram cart normalizes stale multilingual rows back to Vietnamese", async () => {
  const commerce = await loadTelegramCommerce();
  const { db, sqlite } = createCatalogD1();
  try {
    sqlite.exec(read("content-migrations/0024_shop_telegram_carts.sql"));
    sqlite.exec(read("content-migrations/0028_shop_telegram_quantity_input.sql"));
    sqlite.exec(read("content-migrations/0029_shop_telegram_quantity_caption.sql"));
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 60_000).toISOString();
    sqlite.prepare(`INSERT INTO shop_telegram_carts
      (telegram_user_id, locale, discount_code, awaiting, items_json, updated_at, expires_at)
      VALUES ('123', 'en', NULL, NULL, '[]', ?, ?)`).run(now, expiry);

    const bindings = { CONTENT_DB: db };
    const cart = await commerce.getTelegramCart(bindings, 123, "en");
    assert.equal(cart.locale, "vi");
    const saved = await commerce.mutateTelegramCart(bindings, { telegramUserId: 123, locale: "en", action: "clear" });
    assert.equal(saved.locale, "vi");
    assert.equal(sqlite.prepare("SELECT locale FROM shop_telegram_carts WHERE telegram_user_id = '123'").get().locale, "vi");
  } finally {
    sqlite.close();
  }
});

test("legacy Telegram source contracts stay pinned to Vietnamese VND and PayOS", () => {
  const page = read("src/pages/telegram/shop.astro");
  const miniApi = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const service = read("src/lib/shop/service.ts");
  const commerce = read("src/lib/shop/telegram-commerce.ts");
  assert.match(page, /const miniLocale = "vi"/);
  assert.match(page, /const miniCurrency = "VND"/);
  assert.match(page, /const locale = "vi"/);
  assert.match(page, /const displayCurrency = "VND"/);
  assert.match(miniApi, /const requestLocale = "vi"/);
  assert.match(miniApi, /environment-token bot is the independent Vietnam surface/);
  assert.match(service, /locale: "vi",\s*pricingCurrency: "VND"/);
  assert.match(service, /confirmation_provider = 'payos'/);
  assert.match(commerce, /const LEGACY_TELEGRAM_LOCALE: ShopLocale = "vi"/);
  assert.match(commerce, /locale: telegramLocale/);
});

test("Telegram admin status and configuration stay behind the authenticated mutation boundary", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const integrations = read("src/lib/admin/router/shop/integrations.ts");
  const shared = read("src/lib/admin/router/shop/shared.ts");
  const admin = read("src/pages/admin/index.astro");
  const view = shared.match(/function telegramAdminView[\s\S]*?\n}/)?.[0] ?? "";

  assert.ok(entry.indexOf("verifyMutationRequest(request)") < integrations.indexOf('resource === "telegram"'));
  assert.match(integrations, /getTelegramConfigurationStatus\(bindings\)/);
  assert.match(integrations, /configureTelegramBot\(bindings\)/);
  assert.match(integrations, /action === "configure" && method === "POST"/);
  assert.match(view, /allowedUpdatesConfigured/);
  assert.match(view, /identityMatchesExpected/);
  assert.doesNotMatch(view, /TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET/);
  assert.match(read("src/components/admin/shop/TelegramTab.tsx") + read("src/components/admin/shop/SettingsTab.tsx"), /telegram\/configure/);
  assert.doesNotMatch(admin, /TELEGRAM_BOT_TOKEN\s*[:=]|TELEGRAM_WEBHOOK_SECRET\s*[:=]/);
});

test("Telegram menu copy, command parsing and checkout links stay localized and same-origin", async () => {
  const telegram = await loadTelegram();
  assert.equal(telegram.telegramLocale("ja-JP"), "ja");
  assert.equal(telegram.telegramLocale("fr-FR"), "vi");
  assert.deepEqual(telegram.parseTelegramCommand("/products@vietnamwin_bot 2", "vietnamwin_bot"), { command: "products", argument: "2" });
  assert.equal(telegram.parseTelegramCommand("/products@other_bot", "vietnamwin_bot"), null);
  assert.deepEqual(telegram.parseTelegramCommand("/products@VietnamWin_Bot", "vietnamwin_bot"), { command: "products", argument: "" });
  assert.equal(telegram.parseTelegramCommand("hello"), null);
  assert.equal(telegram.parseTelegramCommand("/unsafe").command, "unknown");

  const url = new URL(telegram.telegramPublicUrl("https://tung.codes", "en", "/shop", { slug: "cloud-key", variantId: "variant-1" }));
  assert.equal(url.origin, "https://tung.codes");
  assert.equal(url.pathname, "/en/shop/cloud-key");
  assert.equal(url.searchParams.get("variant"), "variant-1");
  assert.equal(url.searchParams.get("utm_source"), "telegram");
  assert.equal(url.hash, "#purchase");
  assert.throws(() => telegram.telegramPublicUrl("https://evil.example/path", "vi", "/shop"), /shop_public_origin_invalid/);

  for (const locale of ["vi", "en", "ja", "zh"]) {
    assert.deepEqual(
      telegram.TELEGRAM_COMMANDS[locale].map((item) => item.command),
      ["start", "shop", "orders", "help"],
    );
    const start = telegram.buildTelegramStartReply("https://tung.codes", locale, "TUNG Shop", true);
    const buttons = start.replyMarkup.inline_keyboard.flat();
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].web_app.url, "https://tung.codes/telegram/shop");
    assert.equal(buttons.every((button) => !button.url && !button.callback_data), true);
    const keys = telegram.buildTelegramStaticReply("keys", "https://tung.codes", locale, "TUNG Shop", true);
    const keysButtons = keys.replyMarkup.inline_keyboard.flat();
    assert.match(keys.text, /Mini App/);
    assert.equal(keysButtons.length, 1);
    assert.equal(keysButtons[0].web_app.url, "https://tung.codes/telegram/shop");
    assert.equal(keysButtons.every((button) => !button.url && !button.callback_data), true);
    const emptyCatalog = telegram.buildTelegramProductsReply([], "https://tung.codes", locale);
    assert.equal(emptyCatalog.replyMarkup.inline_keyboard.flat().every((button) => !button.url), true);
    const catalog = telegram.buildTelegramProductsReply([{
      id: "product-1",
      slug: "product-1",
      title: "Product 1",
      minPriceMinor: 2000,
      currency: "VND",
    }], "https://tung.codes", locale);
    assert.equal(catalog.replyMarkup.inline_keyboard.flat().every((button) => !button.url), true);
  }
  assert.deepEqual(telegram.parseTelegramCommand("/orders", "vietnamwin_bot"), { command: "orders", argument: "" });
  assert.deepEqual(telegram.parseTelegramCommand("/keys", "vietnamwin_bot"), { command: "keys", argument: "" });
  assert.deepEqual(telegram.parseTelegramCommand("/cart", "vietnamwin_bot"), { command: "cart", argument: "" });
  assert.deepEqual(telegram.parseTelegramCommand("/discount SALE10", "vietnamwin_bot"), { command: "discount", argument: "SALE10" });
  assert.equal(telegram.telegramLocale("zh-Hans"), "zh");
  assert.equal(telegram.telegramLocale("en-US"), "en");
  assert.equal(telegram.telegramLocale("ja_JP"), "ja");
  assert.equal(telegram.telegramLocale("vi-VN"), "vi");
});

test("Telegram edits quantity messages in place and ignores an unchanged edit", async () => {
  const telegram = await loadTelegram();
  const token = `12345:${"A".repeat(24)}`;
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), payload: JSON.parse(String(init?.body || "{}")) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await telegram.editTelegramMessage(token, 9, 77, {
      text: "Quantity: 5",
      replyMarkup: { inline_keyboard: [[{ text: "5", callback_data: "qs:variant-123:5" }]] },
    });
    assert.match(calls[0].input, /\/editMessageText$/);
    assert.equal(calls[0].payload.message_id, 77);
    assert.equal(calls[0].payload.link_preview_options.is_disabled, true);

    await telegram.editTelegramCaption(token, 9, 78, {
      text: "Premium · 1 year",
      replyMarkup: { inline_keyboard: [[{ text: "Choose", callback_data: "qs:variant-123:1" }]] },
    });
    assert.match(calls[1].input, /\/editMessageCaption$/);
    assert.equal(calls[1].payload.message_id, 78);
    assert.equal(calls[1].payload.caption, "Premium · 1 year");

    await telegram.sendTelegramChatAction(token, 9, "typing");
    assert.match(calls[2].input, /\/sendChatAction$/);
    assert.equal(calls[2].payload.action, "typing");

    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: false,
      error_code: 400,
      description: "Bad Request: message is not modified",
    }), { status: 400, headers: { "content-type": "application/json" } });
    assert.equal(await telegram.editTelegramMessage(token, 9, 77, { text: "Quantity: 5" }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram custom quantity migration stores only bounded pending edit state", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(read("content-migrations/0024_shop_telegram_carts.sql"));
    sqlite.exec(read("content-migrations/0028_shop_telegram_quantity_input.sql"));
    sqlite.exec(read("content-migrations/0029_shop_telegram_quantity_caption.sql"));
    const columns = sqlite.prepare("PRAGMA table_info(shop_telegram_carts)").all().map((row) => row.name);
    assert.ok(columns.includes("pending_quantity_variant_id"));
    assert.ok(columns.includes("pending_quantity_message_id"));
    assert.ok(columns.includes("pending_quantity_expires_at"));
    assert.ok(columns.includes("pending_quantity_uses_caption"));
  } finally {
    sqlite.close();
  }
});

test("Telegram configuration binds the token identity and activates the webhook last", async () => {
  const telegram = await loadTelegram();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const method = new URL(String(input)).pathname.split("/").at(-1);
    const payload = JSON.parse(String(init?.body || "{}"));
    calls.push({ method, payload });
    const result = method === "getMe"
      ? { id: 42, first_name: "Shop Key AI", username: "vietnamwin_bot" }
      : method === "getWebhookInfo"
        ? { url: "https://tung.codes/api/telegram/webhook", allowed_updates: ["message", "callback_query"], pending_update_count: 2 }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const bindings = {
    TELEGRAM_BOT_TOKEN: `12345:${"A".repeat(24)}`,
    TELEGRAM_WEBHOOK_SECRET: "B".repeat(32),
    TELEGRAM_BOT_USERNAME: "vietnamwin_bot",
    SHOP_PUBLIC_ORIGIN: "https://tung.codes",
    // Vietnam Mini App is enabled via the site_state switch.
    CONTENT_DB: {
      prepare: () => ({ async first() { return { config_json: JSON.stringify({ telegramMiniAppEnabled: true }) }; } }),
    },
  };
  try {
    assert.equal(telegram.telegramReadiness(bindings).ready, true);
    const configured = await telegram.configureTelegramBot(bindings);
    assert.equal(configured.identity.username, "vietnamwin_bot");
    assert.equal(calls.at(-1).method, "setWebhook");
    const commandCalls = calls.filter((call) => call.method === "setMyCommands");
    assert.equal(commandCalls.length, 1);
    assert.deepEqual(commandCalls[0].payload.commands, telegram.TELEGRAM_COMMANDS.vi);
    assert.equal(commandCalls.every((call) => call.payload.scope?.type === "all_private_chats"), true);
    const menuCall = calls.find((call) => call.method === "setChatMenuButton");
    assert.deepEqual(menuCall?.payload, {
      menu_button: {
        type: "web_app",
        text: "Mở Shop Key AI",
        web_app: { url: "https://tung.codes/telegram/shop" },
      },
    });
    const status = await telegram.getTelegramConfigurationStatus(bindings);
    assert.equal(status.identityMatchesExpected, true);
    assert.equal(status.allowedUpdatesConfigured, true);
    assert.equal(status.pendingUpdateCount, 2);

    calls.length = 0;
    await assert.rejects(
      () => telegram.configureTelegramBot({ ...bindings, TELEGRAM_BOT_USERNAME: "another_store_bot" }),
      (error) => error?.code === "telegram_identity_mismatch",
    );
    assert.equal(calls.some((call) => call.method === "setWebhook"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram sends short VietQR URLs directly and uploads bytes only after a remote-fetch rejection", async () => {
  const telegram = await loadTelegram();
  const token = `12345:${"A".repeat(24)}`;
  const qrUrl = "https://img.vietqr.io/image/970452-10142607258539241-vietqr_pro.jpg?addInfo=FASTQR001&amount=3000";
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await telegram.sendTelegramPhoto(token, 9, qrUrl, { caption: "Pay now" });
    assert.equal(calls.length, 1);
    assert.match(calls[0].input, /\/sendPhoto$/);
    assert.equal(JSON.parse(String(calls[0].init.body)).photo, qrUrl);

    calls.length = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ input: url, init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ ok: false, error_code: 400, description: "failed to get HTTP URL content" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === qrUrl) {
        return new Response(new Uint8Array(64).fill(1), {
          status: 200,
          headers: { "content-type": "image/png", "content-length": "64" },
        });
      }
      assert.ok(init.body instanceof FormData);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await telegram.sendTelegramPhoto(token, 9, qrUrl, { caption: "Pay now" });
    assert.equal(calls.length, 3);
    assert.equal(calls[1].input, qrUrl);
    assert.match(calls[2].input, /\/sendPhoto$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram product links select the requested storefront variant", () => {
  const defaultRoute = read("src/pages/shop/[slug].astro");
  const localizedRoute = read("src/pages/[lang]/[...slug].astro");
  for (const route of [defaultRoute, localizedRoute]) {
    assert.match(route, /Astro\.url\.searchParams\.get\("variant"\)/);
    assert.match(route, /selectedVariantId=\{selectedVariantId\}/);
  }
});

test("Telegram update parsing is bounded and webhook secret comparison fails closed", async () => {
  const telegram = await loadTelegram();
  const secret = "A".repeat(32);
  assert.equal(await telegram.verifyTelegramWebhookSecret(secret, secret), true);
  assert.equal(await telegram.verifyTelegramWebhookSecret(`${secret}B`, secret), false);
  assert.equal(await telegram.verifyTelegramWebhookSecret(null, secret), false);

  const body = JSON.stringify({ update_id: 42, message: { message_id: 7, from: { id: 9, first_name: "Buyer", language_code: "vi" }, chat: { id: 9, type: "private" }, text: "/start" } });
  const parsed = await telegram.readTelegramUpdate(new Request("https://tung.codes/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.update.update_id, 42);
  assert.match(parsed.payloadHash, /^[A-Za-z0-9_-]{43}$/);

  const photoUpdate = await telegram.readTelegramUpdate(new Request("https://tung.codes/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 43,
      callback_query: {
        id: "callback-photo",
        from: { id: 9, first_name: "Buyer", language_code: "vi" },
        data: "qs:variant-123:1",
        message: {
          message_id: 8,
          chat: { id: 9, type: "private" },
          caption: "Product",
          photo: [{ file_id: "photo-1", file_unique_id: "unique-1", width: 100, height: 100 }],
        },
      },
    }),
  }));
  assert.equal(photoUpdate.ok, true);
  assert.equal(photoUpdate.update.callback_query.message.hasPhoto, true);

  const tooLarge = await telegram.readTelegramUpdate(new Request("https://tung.codes/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "70000" },
    body: "{}",
  }));
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.response.status, 413);
});

test("Telegram update leases deduplicate retries and fence stale completion", async () => {
  const telegram = await loadTelegram();
  const { db, sqlite } = createTelegramD1();
  try {
    const first = await telegram.claimTelegramUpdate(db, 100, "a".repeat(43), "message");
    assert.equal(first.state, "claimed");
    assert.equal(await telegram.completeTelegramUpdate(db, 100, first.leaseToken), true);

    const duplicate = await telegram.claimTelegramUpdate(db, 100, "a".repeat(43), "message");
    assert.equal(duplicate.state, "completed");
    const conflict = await telegram.claimTelegramUpdate(db, 100, "b".repeat(43), "message");
    assert.equal(conflict.state, "conflict");

    const failed = await telegram.claimTelegramUpdate(db, 101, "c".repeat(43), "callback_query");
    assert.equal(await telegram.failTelegramUpdate(db, 101, failed.leaseToken, "telegram_api_503"), true);
    const retry = await telegram.claimTelegramUpdate(db, 101, "c".repeat(43), "callback_query");
    assert.equal(retry.state, "claimed");
    assert.equal(await telegram.completeTelegramUpdate(db, 101, failed.leaseToken), false);
    assert.equal(await telegram.completeTelegramUpdate(db, 101, retry.leaseToken), true);
    assert.equal(sqlite.prepare("SELECT attempt_count FROM shop_telegram_updates WHERE update_id = 101").get().attempt_count, 2);
  } finally {
    sqlite.close();
  }
});

test("Telegram update leases are isolated per configured bot", async () => {
  const telegram = await loadTelegram();
  const { db, sqlite } = createTelegramD1(true);
  try {
    const botA = await telegram.claimTelegramUpdate(db, 500, "a".repeat(43), "message", "bot-config-a");
    const botB = await telegram.claimTelegramUpdate(db, 500, "b".repeat(43), "message", "bot-config-b");
    assert.equal(botA.state, "claimed");
    assert.equal(botB.state, "claimed");
    assert.equal(await telegram.completeTelegramUpdate(db, 500, botA.leaseToken, "bot-config-a"), true);
    assert.equal(await telegram.completeTelegramUpdate(db, 500, botA.leaseToken, "bot-config-b"), false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_telegram_updates WHERE update_id = 500").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("Telegram migration stores hashes and state, never raw updates or bot credentials", () => {
  const migration = read("content-migrations/0015_shop_telegram_updates.sql");
  assert.match(migration, /update_id INTEGER PRIMARY KEY/);
  assert.match(migration, /payload_hash TEXT NOT NULL/);
  assert.match(migration, /lock_token_hash TEXT/);
  assert.match(migration, /idx_shop_telegram_updates_reclaim/);
  assert.doesNotMatch(migration, /payload_json|message_text|bot_token|webhook_secret/i);
});

test("Telegram recipient identity migration supports multiple customer identities per private chat", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(read("content-migrations/0001_content_cms.sql"));
    sqlite.exec(read("content-migrations/0009_shop_core.sql"));
    sqlite.exec(read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql"));
    sqlite.exec(read("content-migrations/0016_shop_telegram_recipients.sql"));
    sqlite.exec(read("content-migrations/0018_shop_telegram_recipient_identity.sql"));
    const now = "2026-07-25T00:00:00.000Z";
    sqlite.prepare(`INSERT INTO shop_customers (id, email_normalized, email_masked, display_name, locale, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'vi', ?, ?), (?, ?, ?, ?, 'vi', ?, ?)`).run(
      "customer-a", "a@example.invalid", "a@…", "Buyer A", now, now,
      "customer-b", "b@example.invalid", "b@…", "Buyer B", now, now,
    );
    const insert = sqlite.prepare(`INSERT INTO shop_telegram_recipients
      (subject_hash, customer_id, chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'v1', ?, ?, ?)`);
    insert.run("s".repeat(43), "customer-a", "c".repeat(24), "d".repeat(16), now, now, now);
    insert.run("s".repeat(43), "customer-b", "e".repeat(24), "f".repeat(16), now, now, now);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_telegram_recipients WHERE subject_hash = ?").get("s".repeat(43)).count, 2);
    const outbox = read("src/lib/shop/telegram-outbox.ts");
    const persist = outbox.match(/export async function persistTelegramOrderRecipient[\s\S]*?\n}/)?.[0] ?? "";
    assert.match(persist, /ON CONFLICT\(subject_hash, customer_id, bot_config_id\)/);
    assert.doesNotMatch(persist, /SELECT customer_id FROM shop_telegram_recipients/);
    assert.match(persist, /if \(result\.meta\.changes !== 1\) throw new Error\("telegram_recipient_persist_failed"\)/);
  } finally {
    sqlite.close();
  }
});

test("Telegram recipient persistence uses one atomic upsert and fails closed when D1 writes nothing", async () => {
  const telegramOutbox = await loadTelegramOutbox();
  const cryptoSecret = Buffer.alloc(32, 7).toString("base64url");
  const createDb = (changes) => {
    const queries = [];
    return {
      queries,
      prepare(sql) {
        queries.push(sql);
        if (/SELECT customer_id FROM shop_telegram_recipients/.test(sql)) throw new Error("recipient_pre_read_detected");
        const prepared = {
          bind() { return prepared; },
          async first() { return { customer_id: "customer-a" }; },
          async run() { return { meta: { changes } }; },
        };
        return prepared;
      },
    };
  };
  const input = { orderId: "order-a", subjectHash: "s".repeat(43), chatId: 123456789 };
  const bindings = { SHOP_KEY_ENCRYPTION_SECRET: cryptoSecret, SHOP_KEY_ENCRYPTION_KEY_VERSION: "v1" };

  const successDb = createDb(1);
  await telegramOutbox.persistTelegramOrderRecipient({ ...bindings, CONTENT_DB: successDb }, input);
  assert.equal(successDb.queries.length, 2);
  assert.match(successDb.queries[1], /ON CONFLICT\(subject_hash, customer_id, bot_config_id\) DO UPDATE/);

  const failedDb = createDb(0);
  await assert.rejects(
    () => telegramOutbox.persistTelegramOrderRecipient({ ...bindings, CONTENT_DB: failedDb }, input),
    /telegram_recipient_persist_failed/,
  );
  assert.equal(failedDb.queries.length, 2);
});
