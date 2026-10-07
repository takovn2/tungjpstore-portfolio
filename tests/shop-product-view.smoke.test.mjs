import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  serializeMiniCatalog,
  toMarketProduct,
  toMiniMarketProduct,
} from "../src/lib/shop/product-view.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

const sample = {
  id: "p1",
  slug: "chatgpt-plus",
  status: "active",
  featured: true,
  productType: "digital_key",
  category: "AI tools",
  categorySlug: "ai-tools",
  title: "ChatGPT Plus",
  eyebrow: "AI",
  shortDescription: "Gói Plus 1 tháng.",
  description: "Tài khoản ChatGPT Plus.\n\nThời hạn 30 ngày.\nGiao key sau thanh toán.",
  locale: "vi",
  badges: ["auto"],
  media: [{ id: "m1", type: "image", url: "/images/shop/chatgpt-plus.webp", alt: "ChatGPT", sortOrder: 0 }],
  variants: [
    {
      id: "v1",
      sku: "GPT-1M",
      title: "1 tháng",
      priceMinor: 199000,
      compareAtMinor: 250000,
      currency: "VND",
      fulfillmentType: "license_key",
      deliveryMode: "automatic",
      availability: "in_stock",
      availableQuantity: 5,
      maxPerOrder: 2,
      optionValues: { duration: "30d" },
    },
  ],
  minPriceMinor: 199000,
  maxPriceMinor: 199000,
  currency: "VND",
  availability: "in_stock",
  seo: { title: "ChatGPT Plus", description: "Plus" },
};

test("market product view exposes description, plans and delivery facts", () => {
  const view = toMarketProduct(sample);
  assert.equal(view.slug, "chatgpt-plus");
  assert.match(view.description, /Thời hạn 30 ngày/);
  assert.equal(view.plans.length, 1);
  assert.equal(view.plans[0].benefitLine, "duration: 30d");
  assert.equal(view.deliveryMode, "automatic");
  assert.match(view.deliveryLabel, /tự động|Automatic/i);
  assert.equal(view.coverUrl, "/images/shop/chatgpt-plus.webp");
});

test("mini catalog payload includes rich fields for ProductSheet", () => {
  const mini = toMiniMarketProduct(sample);
  assert.ok(mini.description.includes("Thời hạn"));
  assert.equal(mini.variants[0].fulfillmentType, "license_key");
  assert.equal(mini.variants[0].deliveryMode, "automatic");
  assert.ok(Array.isArray(mini.badges));
  assert.equal(mini.categorySlug, "ai-tools");

  const json = serializeMiniCatalog([sample]);
  assert.doesNotMatch(json, /</);
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].slug, "chatgpt-plus");
  assert.ok(parsed[0].description.length > 10);
  assert.ok(parsed[0].variants[0].benefitLine);
});

test("telegram mini pages bootstrap via serializeMiniCatalog", () => {
  const shop = read("src/pages/telegram/shop.astro");
  const glb = read("src/pages/telegram/glb.astro");
  assert.match(shop, /serializeMiniCatalog/);
  assert.match(glb, /serializeMiniCatalog/);
  assert.match(shop, /product-view/);
  assert.match(glb, /product-view/);
});
