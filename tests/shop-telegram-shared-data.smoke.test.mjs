import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stripImports = (source) => source.replace(/^import[\s\S]*?;\s*/gm, "");
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { rewriteShopDynamicImports } = await import("./helpers/shop-inline.mjs");

async function loadRepository() {
  const money = compile(read("src/lib/shop/money.ts"));
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = stripImports(compile(read("src/lib/shop/crypto.ts")));
  const validation = stripImports(compile(read("src/lib/shop/validation.ts")));
  const repository = stripImports(rewriteShopDynamicImports(compile(read("src/lib/shop/repository.ts"))));
  const payosStubs = `
    const PAYOS_RECONCILIATION_GRACE_SECONDS = 900;
    const payOsPaymentOccurredWithinRecoveryWindow = () => false;
    const payOsTransferDescriptionMatches = () => false;
  `;
  return importSource(`${money}\n${types}\n${crypto}\n${validation}\n${payosStubs}\n${repository}`);
}

async function loadTelegramCommerce() {
  const types = compile(read("src/lib/shop/types.ts"));
  const validation = stripImports(compile(read("src/lib/shop/validation.ts")));
  const commerce = stripImports(compile(read("src/lib/shop/telegram-commerce.ts")));
  return importSource(`${types}\n${validation}\n${commerce}`);
}

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  sqlite.exec(read("content-migrations/0023_shop_customer_auth.sql"));
  sqlite.exec("ALTER TABLE shop_orders ADD COLUMN telegram_bot_config_id TEXT NOT NULL DEFAULT 'environment'");
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
      };
      return prepared;
    },
  };
  return { db, sqlite };
}

function seedCatalog(sqlite) {
  const now = "2026-07-30T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_products
    (id, slug, status, product_type, featured, sort_order, default_locale, metadata_json, version,
      published_at, created_by, updated_by, created_at, updated_at)
    VALUES ('shared-product', 'shared-license', 'active', 'digital_key', 1, 1, 'vi', '{}', 1, ?, 'test', 'test', ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_product_localizations
    (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
    VALUES ('shared-product', 'vi', 'Shared License', 'TUNG', 'One catalog record', '', 'Shared License', '')`).run();
  sqlite.prepare(`INSERT INTO shop_variants
    (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy, price_minor,
      compare_at_minor, currency, low_stock_threshold, max_per_order, option_values_json, metadata_json,
      version, created_at, updated_at)
    VALUES ('shared-variant', 'shared-product', 'SHARED-001', 'active', 'license_key', 'automatic', 'unlimited',
      25000, NULL, 'VND', 3, 10, '{}', '{}', 1, ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_variant_localizations (variant_id, locale, title, option_summary)
    VALUES ('shared-variant', 'vi', 'Shared License · 1 tháng', '')`).run();
}

function seedTelegramCustomerOrder(sqlite) {
  const now = "2026-07-30T00:01:00.000Z";
  const customerId = "shared-customer";
  sqlite.prepare(`INSERT INTO shop_customers
    (id, email_normalized, email_masked, display_name, locale, account_activated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'vi', ?, ?, ?)`).run(
      customerId,
      "tg8685416510@telegram.tungjpstore.local",
      "t***@telegram.tungjpstore.local",
      "Tung.codes",
      now,
      now,
      now,
    );
  sqlite.prepare(`INSERT INTO shop_customer_identities
    (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
    VALUES (?, ?, 'telegram', ?, ?, '{}', ?, ?, ?)`).run(
      "shared-identity",
      customerId,
      "8685416510",
      "@Tungcodes",
      now,
      now,
      now,
    );
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, customer_id, source_channel, locale, status, payment_status,
      fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor, total_minor,
      customer_name_snapshot, metadata_json, version, paid_at, created_at, updated_at)
    VALUES (?, 'TG-SHARED-1', 'TG-SHARED-REF', 'shared-public-token-hash', ?, 'telegram', 'vi', 'processing', 'paid',
      'unfulfilled', 'VND', 25000, 0, 0, 25000, 'Tung.codes', '{}', 1, ?, ?, ?)`).run(
        "shared-order",
        customerId,
        now,
        now,
        now,
      );
  sqlite.prepare(`INSERT INTO shop_order_items
    (id, order_id, line_number, product_id, variant_id, product_slug_snapshot, sku_snapshot,
      product_title_snapshot, variant_title_snapshot, fulfillment_type, delivery_mode, inventory_policy,
      quantity, unit_price_minor, subtotal_minor, discount_minor, total_minor, fulfillment_status,
      metadata_json, created_at, updated_at)
    VALUES (?, 'shared-order', 1, 'shared-product', 'shared-variant', 'shared-license', 'SHARED-001',
      'Shared License', 'Shared License · 1 tháng', 'license_key', 'automatic', 'unlimited',
      1, 25000, 25000, 0, 25000, 'unfulfilled', '{}', ?, ?)`).run("shared-item", now, now);
  return customerId;
}

test("Telegram bot and Mini App read the same catalog and customer/order source of truth", async () => {
  const [repository, commerce] = await Promise.all([loadRepository(), loadTelegramCommerce()]);
  const { db, sqlite } = createD1();
  try {
    seedCatalog(sqlite);

    // The bot uses summaries/details while the Mini App receives full products;
    // both must resolve the same published product and variant from D1.
    const botCatalog = await repository.listPublicProductSummaries(db, { locale: "vi", limit: 20 });
    const miniCatalog = await repository.listPublicProducts(db, { locale: "vi", limit: 20 });
    assert.deepEqual(
      { id: botCatalog[0].id, slug: botCatalog[0].slug, title: botCatalog[0].title, minPriceMinor: botCatalog[0].minPriceMinor },
      { id: miniCatalog[0].id, slug: miniCatalog[0].slug, title: miniCatalog[0].title, minPriceMinor: miniCatalog[0].minPriceMinor },
    );
    assert.equal(miniCatalog[0].variants[0].id, "shared-variant");

    const customerId = seedTelegramCustomerOrder(sqlite);
    const user = { id: 8685416510, first_name: "Tung.codes", username: "Tungcodes", language_code: "vi" };
    const resolved = await commerce.ensureTelegramCustomer({ CONTENT_DB: db }, user, "vi");
    assert.equal(resolved.customerId, customerId);
    assert.equal(resolved.email, "tg8685416510@telegram.tungjpstore.local");

    const orders = await commerce.listTelegramCustomerOrders({ CONTENT_DB: db }, customerId, 20);
    assert.equal(orders.length, 1);
    assert.deepEqual(
      { id: orders[0].id, number: orders[0].number, totalMinor: orders[0].totalMinor, paymentStatus: orders[0].paymentStatus },
      { id: "shared-order", number: "TG-SHARED-1", totalMinor: 25000, paymentStatus: "paid" },
    );
    const lines = await commerce.listTelegramOrderLines({ CONTENT_DB: db }, customerId, "shared-order");
    assert.deepEqual(lines.map((line) => ({ sku: line.sku, quantity: line.quantity })), [{ sku: "SHARED-001", quantity: 1 }]);
    assert.deepEqual(await commerce.listTelegramOrderLines({ CONTENT_DB: db }, "other-customer", "shared-order"), []);
  } finally {
    sqlite.close();
  }
});

test("The Telegram bot remains a Mini App launcher while both surfaces stay on the same origin", () => {
  const webhook = read("src/pages/api/telegram/webhook.ts");
  const miniPage = read("src/pages/telegram/shop.astro");
  const miniApi = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const telegram = read("src/lib/shop/telegram.ts");

  assert.match(webhook, /buildMainMenuReply/);
  assert.match(webhook, /miniAppButton/);
  assert.match(webhook, /ensureTelegramCustomer\(commerceBindings\(\), user/);
  assert.match(webhook, /listTelegramCustomerOrders\(commerceBindings\(\), customer\.customerId/);
  assert.match(miniPage, /listPublicProducts\(env\.CONTENT_DB/);
  assert.match(miniPage, /\/api\/shop\/telegram-mini\/session/);
  assert.match(miniApi, /listTelegramCustomerOrders\(env, session\.customerId/);
  assert.match(miniApi, /checkoutTelegramItems\(env/);
  assert.match(miniApi, /revealKeysForTelegramOrder\(env, session\.customerId/);
  assert.match(telegram, /telegramMiniAppUrl\(originValue/);
  assert.match(telegram, /new URL\("\/telegram\/shop", origin\)/);
  assert.doesNotMatch(webhook, /TELEGRAM_BOT_TOKEN\s*[:=]\s*["'][^"']+/);
});
