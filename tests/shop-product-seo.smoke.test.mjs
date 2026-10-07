import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Product SEO must follow the requested locale.
 *
 * `getShopProductDisplayTitle` used to apply a table of Vietnamese title
 * overrides unconditionally, so an English product page rendered "ChatGPT Plus
 * 1 tháng" in both the visible title and the `name` field of Product structured
 * data. `getShopProductSeo` separately gated its meta-template to `vi`, so every
 * non-Vietnamese product page with no stored SEO shipped a bare title and short
 * description with no brand and no call to action.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function loadSeo() {
  return importSource(compile(read("src/lib/shop/seo.ts")));
}

const product = (overrides = {}) => ({
  slug: "chatgpt-plus",
  title: "ChatGPT Plus 1 month",
  shortDescription: "Shared plan slot",
  seo: {},
  ...overrides,
});

test("Vietnamese title overrides stay on Vietnamese pages only", async () => {
  const { getShopProductDisplayTitle } = await loadSeo();

  const vi = getShopProductDisplayTitle({ slug: "chatgpt-plus", title: "ChatGPT Plus 1 tháng trial 30 ngày" }, "vi");
  assert.equal(vi, "ChatGPT Plus hàng GPAY đuổi gmail Siêu trâu BH5H thẻ riêng", "vi keeps the repaired catalog title");

  for (const locale of ["en", "ja", "zh"]) {
    const localized = getShopProductDisplayTitle({ slug: "chatgpt-plus", title: "ChatGPT Plus 1 month" }, locale);
    assert.equal(localized, "ChatGPT Plus 1 month", `${locale} must not receive the Vietnamese override`);
    assert.doesNotMatch(localized, /tháng/i, `${locale} must not leak Vietnamese into the title`);
  }
});

test("product meta is generated per locale instead of only in Vietnamese", async () => {
  const { getShopProductSeo } = await loadSeo();

  const vi = getShopProductSeo(product({ title: "ChatGPT Plus 1 tháng" }), "vi");
  assert.match(vi.title, /^Mua .+ \| TUNG Shop$/);
  assert.match(vi.description, /^Mua .+ tại TUNG Shop/);

  const en = getShopProductSeo(product(), "en");
  assert.equal(en.title, "Buy ChatGPT Plus 1 month — instant delivery | TUNG Shop");
  assert.match(en.description, /^Buy ChatGPT Plus 1 month at TUNG Shop\./);

  const ja = getShopProductSeo(product(), "ja");
  assert.match(ja.title, /を購入/);
  assert.match(ja.description, /TUNG Shop で/);

  const zh = getShopProductSeo(product(), "zh");
  assert.match(zh.title, /购买/);
  assert.match(zh.description, /在 TUNG Shop 购买/);
});

test("non-Vietnamese meta never names the Vietnam-only payment rail", async () => {
  const { getShopProductSeo } = await loadSeo();
  for (const locale of ["en", "ja", "zh"]) {
    const seo = getShopProductSeo(product(), locale);
    assert.doesNotMatch(seo.description, /VietQR/i, `${locale} must not advertise VietQR`);
    assert.doesNotMatch(seo.title, /VietQR/i, `${locale} must not advertise VietQR`);
  }
  // Vietnam keeps it: VietQR is the rail actually offered there.
  assert.match(getShopProductSeo(product({ title: "CapCut Pro" }), "vi").description, /VietQR/);
});

test("editorial SEO copy wins in every locale", async () => {
  const { getShopProductSeo } = await loadSeo();
  const stored = product({
    seo: { title: "Cursor Pro — annual seat", description: "A real hand-written description for this plan." },
  });
  for (const locale of ["vi", "en", "ja", "zh"]) {
    const seo = getShopProductSeo(stored, locale);
    assert.equal(seo.title, "Cursor Pro — annual seat", `${locale} must keep editorial copy`);
    assert.equal(seo.description, "A real hand-written description for this plan.");
  }
});

test("bulk-import boilerplate is rewritten in every locale, not just Vietnamese", async () => {
  const { getShopProductSeo } = await loadSeo();
  const boilerplate = {
    en: { title: "Canva Pro | TUNG Shop", description: "Buy Canva Pro at TUNG Shop. Cheap and fast." },
    ja: { title: "Canva Pro | TUNG Shop", description: "TUNG Shop でCanva Proを購入。安くて速い。" },
    zh: { title: "Canva Pro | TUNG Shop", description: "在 TUNG Shop 购买 Canva Pro。便宜又快速。" },
  };
  for (const [locale, seo] of Object.entries(boilerplate)) {
    const result = getShopProductSeo(product({ seo }), locale);
    assert.notEqual(result.description, seo.description, `${locale} boilerplate must be rewritten`);
    assert.match(result.title, /TUNG Shop$/);
  }
});

test("legacy brand references are discarded regardless of locale", async () => {
  const { getShopProductSeo } = await loadSeo();
  const legacy = product({ seo: { title: "Digistore key", description: "Bought from digi store." } });
  for (const locale of ["vi", "en", "ja", "zh"]) {
    const result = getShopProductSeo(legacy, locale);
    assert.doesNotMatch(result.title, /digistore/i, `${locale} must drop the legacy brand`);
  }
});

test("every caller passes the locale so the override table cannot be applied blindly", () => {
  const shopPage = read("src/components/pages/ShopPage.astro");
  const productCard = read("src/components/shop/ProductCard.astro");
  // `.map(getShopProductDisplayTitle)` would pass the array index as `locale`,
  // silently turning the second element into locale `1`.
  assert.doesNotMatch(shopPage, /\.map\(getShopProductDisplayTitle\)/);
  assert.doesNotMatch(productCard, /getShopProductDisplayTitle\(product\)/);
  for (const source of [shopPage, productCard]) {
    const calls = [...source.matchAll(/getShopProductDisplayTitle\(([^)]*)\)/g)].map((match) => match[1]);
    assert.ok(calls.length > 0, "expected display title calls");
    for (const args of calls) assert.match(args, /locale/, `missing locale argument: getShopProductDisplayTitle(${args})`);
  }
});
