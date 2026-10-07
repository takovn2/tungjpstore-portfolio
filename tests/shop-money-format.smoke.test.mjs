import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function adminShopMoney() {
  const source = read("src/components/admin/lib/format.ts");
  const match = source.match(/export function shopMoney\(minor: unknown, currency = "VND"\) \{[\s\S]*?\n\}/);
  assert.ok(match, "admin shopMoney helper must remain present");
  const compiled = compile(match[0]).replace(/^export\s+/, "");
  return Function(`${compiled}; return shopMoney;`)();
}

async function loadTelegram() {
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const telegram = compile(read("src/lib/shop/telegram.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${types}\n${crypto}\n${telegram}`);
}

async function loadTelegramOutbox() {
  const outbox = compile(read("src/lib/shop/telegram-outbox.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(outbox);
}

async function loadEmailTemplates() {
  const provider = compile(read("src/lib/email/provider.ts"));
  const delivery = compile(read("src/lib/email/delivery.ts")).replace(/^import[^\n]*\n/gm, "");
  const templates = compile(read("src/lib/email/templates.ts")).replace(/^import[^\n]*\n/gm, "");
  return importSource(`${provider}\n${delivery}\n${templates}`);
}

function createEmailDb(rows) {
  const order = rows.order;
  const items = rows.items;
  return {
    prepare(sql) {
      const prepared = {
        bind() { return prepared; },
        async first() {
          return /FROM shop_orders/.test(sql) ? order : null;
        },
        async all() {
          return { results: /FROM shop_order_items/.test(sql) ? items : [] };
        },
      };
      return prepared;
    },
  };
}

test("admin shop money keeps VND in whole dong and USD in cents", () => {
  const format = adminShopMoney();
  const vnd = format(120_000, "VND");
  const usd = format(1_299, "USD");
  assert.match(vnd, /120[.]000/);
  assert.doesNotMatch(vnd, /1[.]200/);
  const normalizedUsd = usd.replace(",", ".");
  assert.match(normalizedUsd, /12[.]99/);
  assert.doesNotMatch(normalizedUsd, /1[.]299/);
});

test("Telegram product listing formats VND whole dong and USD cents", async () => {
  const telegram = await loadTelegram();
  const product = (currency, minPriceMinor) => ({
    id: `product-${currency}`,
    slug: `cloud-${currency.toLowerCase()}`,
    status: "active",
    featured: false,
    productType: "digital_key",
    title: `Cloud ${currency}`,
    shortDescription: "Digital key",
    description: "Digital key",
    locale: "vi",
    badges: [],
    media: [],
    variants: [{ id: `variant-${currency}`, sku: `SKU-${currency}`, title: "Standard", priceMinor: minPriceMinor, compareAtMinor: null, currency, fulfillmentType: "license_key", deliveryMode: "automatic", availability: "in_stock", availableQuantity: 2, optionValues: {} }],
    minPriceMinor,
    maxPriceMinor: minPriceMinor,
    currency,
    availability: "in_stock",
  });
  const vndReply = telegram.buildTelegramProductsReply([product("VND", 120_000)], "https://shop.example", "vi");
  const usdReply = telegram.buildTelegramProductsReply([product("USD", 1_299)], "https://shop.example", "en");
  assert.match(vndReply.text, /120[.]000/);
  assert.doesNotMatch(vndReply.text, /1[.]200/);
  assert.match(usdReply.text, /12[.]99/);
  assert.doesNotMatch(usdReply.text, /1[.]299/);
});

test("Telegram paid notification formatter uses currency-aware minor units", async () => {
  const telegramOutbox = await loadTelegramOutbox();
  const vnd = telegramOutbox.formatAmount(120_000, "VND", "vi");
  const usd = telegramOutbox.formatAmount(1_299, "USD", "en");
  assert.match(vnd, /120[.]000/);
  assert.doesNotMatch(vnd, /1[.]200/);
  assert.match(usd, /12[.]99/);
  assert.doesNotMatch(usd, /1[.]299/);
});

test("transactional order emails format VND whole dong and USD cents", async () => {
  const email = await loadEmailTemplates();
  const item = {
    product_title_snapshot: "Cloud Key",
    variant_title_snapshot: "Standard",
    sku_snapshot: "CLOUD-STD",
    quantity: 1,
    total_minor: 120_000,
  };
  const vnd = await email.buildShopOrderEmail(createEmailDb({
    order: {
      order_number: "DS-VND",
      locale: "vi",
      status: "pending_payment",
      payment_status: "unpaid",
      fulfillment_status: "unfulfilled",
      currency: "VND",
      subtotal_minor: 120_000,
      discount_minor: 0,
      total_minor: 120_000,
      customer_email_snapshot: "buyer@example.invalid",
      customer_name_snapshot: "Buyer",
      expires_at: null,
      paid_at: null,
      fulfilled_at: null,
    },
    items: [item],
  }), "shop.order.created", "order-vnd", { origin: "https://shop.example", from: { email: "orders@shop.example" } });
  const usd = await email.buildShopOrderEmail(createEmailDb({
    order: {
      order_number: "DS-USD",
      locale: "en",
      status: "paid",
      payment_status: "paid",
      fulfillment_status: "unfulfilled",
      currency: "USD",
      subtotal_minor: 1_299,
      discount_minor: 0,
      total_minor: 1_299,
      customer_email_snapshot: "buyer@example.invalid",
      customer_name_snapshot: "Buyer",
      expires_at: null,
      paid_at: new Date().toISOString(),
      fulfilled_at: null,
    },
    items: [{ ...item, total_minor: 1_299 }],
  }), "shop.order.payment_confirmed", "order-usd", { origin: "https://shop.example", from: { email: "orders@shop.example" } });
  assert.match(vnd.text, /120[.]000/);
  assert.doesNotMatch(vnd.text, /1[.]200/);
  assert.match(usd.text, /12[.]99/);
  assert.doesNotMatch(usd.text, /1[.]299/);
});
