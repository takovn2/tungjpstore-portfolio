import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Pure platform modules (TypeScript stripped by node --experimental-strip-types when run via npm)
const require = createRequire(import.meta.url);

async function loadPlatform() {
  return import("../src/lib/shop/platform/index.ts");
}

describe("platform wave F1–F10 pure modules", () => {
  test("F1+F8 attribution capture, encode, parse, cart merge", async () => {
    const {
      captureAttributionFromSearch,
      encodeAttributionReference,
      parseAttributionReference,
      mergeCartItems,
      encodeCartBridge,
      decodeCartBridge,
    } = await loadPlatform();

    const attr = captureAttributionFromSearch("?ref=kol_alpha&discount=SAVE10&utm_source=tg&utm_campaign=spring", {
      channel: "web",
      landingPath: "/shop",
    });
    assert.equal(attr.ref, "KOL_ALPHA");
    assert.equal(attr.discountCode, "SAVE10");
    assert.equal(attr.utmSource, "tg");
    assert.equal(attr.channel, "web");

    const encoded = encodeAttributionReference(attr);
    assert.ok(encoded?.includes("ref=KOL_ALPHA"));
    assert.ok(encoded?.includes("promo=SAVE10"));
    const parsed = parseAttributionReference(encoded);
    assert.equal(parsed.ref, "KOL_ALPHA");
    assert.equal(parsed.discountCode, "SAVE10");

    const { encodeOrderExternalReference, ensureUniqueExternalReference } = await loadPlatform();
    const orderRef1 = encodeOrderExternalReference(attr, "abc123nonce");
    const orderRef2 = encodeOrderExternalReference(attr, "xyz789nonce");
    assert.notEqual(orderRef1, orderRef2);
    assert.ok(orderRef1?.includes("n=abc123nonce"));
    const uniq = ensureUniqueExternalReference("ref=TUNG|ch=web");
    assert.ok(uniq?.includes("n="));
    const already = ensureUniqueExternalReference("ref=TUNG|n=already12");
    assert.equal(already, "ref=TUNG|n=already12");

    const merged = mergeCartItems(
      [{ variantId: "a", quantity: 1, maxQuantity: 5 }],
      [{ variantId: "a", quantity: 2, maxQuantity: 5 }, { variantId: "b", quantity: 1 }],
    );
    assert.equal(merged.find((i) => i.variantId === "a")?.quantity, 3);
    assert.equal(merged.length, 2);

    const bridge = encodeCartBridge({
      v: 1,
      items: [{ variantId: "x", quantity: 2, maxQuantity: 10, title: "Test" }],
      createdAt: new Date().toISOString(),
    });
    const decoded = decodeCartBridge(bridge);
    assert.ok(decoded);
    assert.equal(decoded.items[0].variantId, "x");
  });

  test("F2 recommend scores coding/AI/creative intents", async () => {
    const { recommendProducts } = await loadPlatform();
    const catalog = [
      { id: "1", slug: "chatgpt-plus", title: "ChatGPT Plus", categorySlug: "ai-tools", availability: "in_stock", minPriceMinor: 40000, featured: true },
      { id: "2", slug: "cursor-pro", title: "Cursor Pro", categorySlug: "productivity", availability: "in_stock", minPriceMinor: 269000 },
      { id: "3", slug: "canva", title: "Canva Pro", categorySlug: "creative-tools", availability: "in_stock", minPriceMinor: 30000 },
      { id: "4", slug: "netflix", title: "Netflix", categorySlug: "entertainment", availability: "out_of_stock", minPriceMinor: 40000 },
    ];
    const coding = recommendProducts(catalog, "cần tool code cursor", { locale: "vi", limit: 3 });
    assert.equal(coding.engine, "heuristic");
    assert.ok(coding.results[0].product.slug === "cursor-pro" || coding.assistantMessage.includes("Cursor"));
    const ai = recommendProducts(catalog, "chatgpt ai chat", { locale: "en", limit: 2 });
    assert.equal(ai.results[0].product.slug, "chatgpt-plus");
    const empty = recommendProducts(catalog, "", { locale: "vi" });
    assert.ok(empty.results.length >= 1);
  });

  test("F3 merchandising rails produce non-empty rails", async () => {
    const { buildMerchandisingRails, isDealProduct } = await loadPlatform();
    const products = [
      { id: "1", slug: "chatgpt-plus", title: "ChatGPT Plus", categorySlug: "ai-tools", featured: true, availability: "in_stock", minPriceMinor: 40000, badges: ["hot"] },
      { id: "2", slug: "canva", title: "Canva", categorySlug: "creative-tools", availability: "in_stock", minPriceMinor: 30000 },
      { id: "3", slug: "cursor-pro", title: "Cursor", categorySlug: "productivity", availability: "in_stock", minPriceMinor: 100000 },
    ];
    const rails = buildMerchandisingRails(products, "vi");
    assert.ok(rails.length >= 2);
    assert.ok(rails.every((rail) => rail.productSlugs.length > 0));
    assert.equal(isDealProduct(products[0]), true);
  });

  test("F4 trust timeline states", async () => {
    const { buildOrderTrustTimeline, trustCopyForDelivery } = await loadPlatform();
    const pay = buildOrderTrustTimeline("awaiting_payment", "vi");
    assert.equal(pay.length, 4);
    assert.equal(pay[1].status, "active");
    const done = buildOrderTrustTimeline("fulfilled", "en");
    assert.ok(done.every((s) => s.status === "done"));
    const failed = buildOrderTrustTimeline("expired", "vi");
    assert.ok(failed.some((s) => s.status === "error"));
    assert.ok(trustCopyForDelivery("automatic", "vi").length > 10);
  });

  test("F5 checkout mesh filters rails", async () => {
    const { recommendRails, listPaymentRails } = await loadPlatform();
    assert.ok(listPaymentRails("vi").length >= 1);
    const vn = recommendRails({ locale: "vi", currency: "VND", channel: "web" });
    assert.ok(vn.some((r) => r.id === "vietqr"));
    const glb = recommendRails({ locale: "en", currency: "USD", channel: "telegram_glb" });
    assert.ok(glb.some((r) => r.id === "crypto"));
  });

  test("F6 inventory intel classifies stock", async () => {
    const { buildInventoryIntel, classifyInventoryRow } = await loadPlatform();
    const rows = [
      { variantId: "1", sku: "A", availableCount: 0, lowStockThreshold: 3 },
      { variantId: "2", sku: "B", availableCount: 2, lowStockThreshold: 3 },
      { variantId: "3", sku: "C", availableCount: 50, lowStockThreshold: 3 },
      { variantId: "4", sku: "D", availableCount: 0, inventoryPolicy: "unlimited" },
    ];
    const intel = buildInventoryIntel(rows, "vi");
    assert.equal(intel.criticalCount, 1);
    assert.equal(intel.lowCount, 1);
    assert.equal(classifyInventoryRow(rows[3]).severity, "unlimited");
  });

  test("F9 ops snapshot health score", async () => {
    const { buildOpsSnapshot } = await loadPlatform();
    const healthy = buildOpsSnapshot({
      products: 30,
      openOrders: 2,
      availableKeys: 500,
      paymentAttention: 0,
      fulfillmentQueue: 0,
      lowStockVariants: 0,
      criticalStockVariants: 0,
    });
    assert.equal(healthy.health, "healthy");
    assert.ok(healthy.score >= 80);

    const critical = buildOpsSnapshot({
      products: 30,
      openOrders: 25,
      availableKeys: 5,
      paymentAttention: 5,
      fulfillmentQueue: 10,
      lowStockVariants: 4,
      criticalStockVariants: 6,
    });
    assert.ok(critical.health === "critical" || critical.health === "attention");
    assert.ok(critical.signals.length >= 2);
  });

  test("F10 flywheel CTAs cover portfolio and shop", async () => {
    const { getFlywheelCtas } = await loadPlatform();
    const ctas = getFlywheelCtas("vi", (path) => path);
    assert.ok(ctas.some((c) => c.from === "portfolio" && c.href.includes("/shop")));
    assert.ok(ctas.some((c) => c.from === "shop" && c.href.includes("/contact")));
  });
});

describe("platform wave surface wiring", () => {
  test("shop page and API surfaces exist", () => {
    const shopPage = readFileSync(new URL("../src/components/pages/ShopPage.astro", import.meta.url), "utf8");
    assert.match(shopPage, /ConciergePanel/);
    assert.match(shopPage, /MerchRail/);
    assert.match(shopPage, /FlywheelBand/);
    assert.match(shopPage, /buildMerchandisingRails/);

    const recommendApi = readFileSync(new URL("../src/pages/api/shop/recommend.ts", import.meta.url), "utf8");
    assert.match(recommendApi, /recommendWithOptionalAi/);
    assert.match(recommendApi, /listPublicProducts/);

    const adminOps = readFileSync(new URL("../src/lib/shop/ops-repository.ts", import.meta.url), "utf8");
    assert.match(adminOps, /buildOpsSnapshot/);
    assert.match(adminOps, /lowStockVariants/);

    const layout = readFileSync(new URL("../src/layouts/BaseLayout.astro", import.meta.url), "utf8");
    assert.match(layout, /tung:shop:attribution:v1/);
    assert.match(layout, /__tungShopEncodeRef/);

    const cart = readFileSync(new URL("../src/components/pages/CartPage.astro", import.meta.url), "utf8");
    assert.match(cart, /externalReference/);
    assert.match(cart, /__tungShopEncodeRef/);

    const marketCss = readFileSync(new URL("../src/styles/shop-market.css", import.meta.url), "utf8");
    // The concierge chat widget moved out of shop-market.css into its self-contained component.
    const concierge = readFileSync(new URL("../src/components/shop/ConciergePanel.astro", import.meta.url), "utf8");
    assert.match(concierge, /\.concierge__panel/);
    assert.match(concierge, /\/api\/shop\/recommend/);
    assert.match(marketCss, /\.market-rail/);
    assert.match(marketCss, /\.ops-cockpit/);

    const globals = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");
    assert.match(globals, /shop-market\.css/);

    const orderPage = readFileSync(new URL("../src/components/pages/OrderPage.astro", import.meta.url), "utf8");
    assert.match(orderPage, /OrderTrustTimeline/);
    assert.match(orderPage, /trustCopyForDelivery/);

    const home = readFileSync(new URL("../src/components/pages/HomePage.astro", import.meta.url), "utf8");
    assert.match(home, /FlywheelBand/);
  });
});

describe("platform deep wave surfaces", () => {
  test("bridge API and affiliates admin wiring exist", () => {
    const bridge = readFileSync(new URL("../src/pages/api/shop/bridge.ts", import.meta.url), "utf8");
    assert.match(bridge, /createCartBridge/);
    assert.match(bridge, /consumeCartBridge/);

    const serviceSrc = readFileSync(new URL("../src/lib/shop/platform/service.ts", import.meta.url), "utf8");
    assert.match(serviceSrc, /recommendWithOptionalAi/);
    assert.match(serviceSrc, /upsertAffiliatePartner/);
    assert.match(serviceSrc, /logAttributionEvent/);
    assert.match(serviceSrc, /SHOP_AI_RECOMMEND_LOCKED = true/);
    assert.match(serviceSrc, /isShopAiRecommendEnabled/);

    const migration = readFileSync(new URL("../content-migrations/0049_shop_platform_wave.sql", import.meta.url), "utf8");
    assert.match(migration, /shop_cart_bridges/);
    assert.match(migration, /shop_affiliate_partners/);
    assert.match(migration, /shop_attribution_events/);

    const admin = readFileSync(new URL("../src/lib/admin/router/shop/catalog.ts", import.meta.url), "utf8");
    assert.match(admin, /resource !== "affiliates"/);
    assert.match(admin, /listAffiliatePartners/);

    const overviewTab = readFileSync(new URL("../src/components/admin/shop/OverviewTab.tsx", import.meta.url), "utf8");
    assert.match(overviewTab, /data-shop-ops-cockpit/);

    const cart = readFileSync(new URL("../src/components/pages/CartPage.astro", import.meta.url), "utf8");
    assert.match(cart, /data-payment-rails/);
    assert.match(cart, /data-cart-share-bridge/);
    assert.match(cart, /\/api\/shop\/bridge/);

    const card = readFileSync(new URL("../src/components/shop/ProductCard.astro", import.meta.url), "utf8");
    assert.match(card, /badge--deal/);

    const casePage = readFileSync(new URL("../src/components/pages/CaseStudyPage.astro", import.meta.url), "utf8");
    assert.match(casePage, /FlywheelBand/);
    assert.match(casePage, /surface="case"/);

    const recommend = readFileSync(new URL("../src/pages/api/shop/recommend.ts", import.meta.url), "utf8");
    assert.match(recommend, /recommendWithOptionalAi/);
    assert.match(recommend, /SHOP_AI_RECOMMEND_LOCKED/);
    assert.match(recommend, /aiLocked/);
  });

  test("AI recommend is locked off by default", async () => {
    const { isShopAiRecommendEnabled, SHOP_AI_RECOMMEND_LOCKED, recommendWithOptionalAi } = await import("../src/lib/shop/platform/service.ts");
    assert.equal(SHOP_AI_RECOMMEND_LOCKED, true);
    assert.equal(isShopAiRecommendEnabled({ xaiApiKey: "fake", featureFlag: "1" }), false);
    const result = await recommendWithOptionalAi(
      [{ id: "1", slug: "chatgpt-plus", title: "ChatGPT Plus", availability: "in_stock", featured: true, minPriceMinor: 40000 }],
      "chatgpt",
      { xaiApiKey: "should-not-be-used", featureFlag: "1", locale: "vi" },
    );
    assert.equal(result.engine, "heuristic");
  });
});
