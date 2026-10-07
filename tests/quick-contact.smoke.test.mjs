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

async function loadQuickContact() {
  return importSource(compile(read("src/lib/quick-contact.ts")));
}

async function loadAdminValidation() {
  const sources = ["src/lib/admin/types.ts", "src/lib/admin/validation.ts"]
    .map((path) => compile(read(path)).replace(/^import\s+.*;\s*$/gm, ""));
  return importSource(sources.join("\n"));
}

test("quick-contact URL validation only permits channel-owned HTTPS origins", async () => {
  const quickContact = await loadQuickContact();
  assert.equal(quickContact.safeQuickContactUrl("messenger", "https://m.me/tung"), "https://m.me/tung");
  assert.equal(quickContact.safeQuickContactUrl("zalo", "https://zalo.me/0123456789"), "https://zalo.me/0123456789");
  assert.equal(quickContact.safeQuickContactUrl("telegram", "https://t.me/tung"), "https://t.me/tung");
  assert.equal(quickContact.safeQuickContactUrl("messenger", "tung"), "https://m.me/tung");
  assert.equal(quickContact.safeQuickContactUrl("zalo", "0123456789"), "https://zalo.me/0123456789");
  assert.equal(quickContact.safeQuickContactUrl("telegram", "@tung"), "https://t.me/tung");
  for (const value of ["https://evil.example/tung", "http://m.me/tung", "https://user:pass@m.me/tung", "https://m.me/tung\\x"]) {
    assert.equal(quickContact.safeQuickContactUrl("messenger", value), null, value);
  }
});

test("quick-contact menu is hidden until a valid enabled channel is configured", async () => {
  const quickContact = await loadQuickContact();
  assert.equal(quickContact.getQuickContactMenu({}, "vi"), null);
  assert.equal(quickContact.getQuickContactMenu({ quickContactEnabled: false, quickContactMessengerUrl: "https://m.me/tung" }, "vi"), null);
  const menu = quickContact.getQuickContactMenu({
    quickContactMessengerUrl: "https://m.me/tung",
    quickContactZaloUrl: "https://zalo.me/0123456789",
    quickContactTelegramUrl: "https://evil.example/tung",
    quickContactZaloEnabled: false,
    quickContactMessengerLabelVi: "Gửi tin nhắn cho TUNG",
    quickContactTitleVi: "Bắt đầu trao đổi",
  }, "vi");
  assert.deepEqual(menu, {
    buttonLabel: "Mở liên hệ nhanh",
    heading: "Bắt đầu trao đổi",
    closeLabel: "Đóng liên hệ nhanh",
    channels: [{ id: "messenger", href: "https://m.me/tung", label: "Gửi tin nhắn cho TUNG" }],
  });
  const localized = quickContact.getQuickContactMenu({ quickContactTelegramUrl: "https://t.me/tung" }, "ja");
  assert.equal(localized.channels[0].label, "Telegramで連絡");
});

test("admin metadata validation enforces the same quick-contact host allowlists", async () => {
  const validation = await loadAdminValidation();
  assert.deepEqual(validation.parseContentMeta({
    quickContactMessengerUrl: "https://m.me/tung",
    quickContactZaloUrl: "https://zalo.me/0123456789",
    quickContactTelegramUrl: "https://t.me/tung",
  }), {
    quickContactMessengerUrl: "https://m.me/tung",
    quickContactZaloUrl: "https://zalo.me/0123456789",
    quickContactTelegramUrl: "https://t.me/tung",
  });
  assert.deepEqual(validation.parseContentMeta({ quickContactTelegramUrl: "@tung" }), { quickContactTelegramUrl: "https://t.me/tung" });
  assert.equal(validation.parseContentMeta({ quickContactMessengerUrl: "https://evil.example/tung" }), null);
  assert.equal(validation.parseContentMeta({ quickContactZaloUrl: "https://m.me/not-zalo" }), null);
});

test("quick-contact settings are wired to admin and portfolio surfaces", () => {
  const admin = read("src/components/admin/views/SettingsView.tsx");
  const adminSettingsKeys = read("src/components/admin/views/SettingsView.tsx");
  const baseLayout = read("src/layouts/BaseLayout.astro");
  const fab = read("src/components/QuickContactFab.astro");
  for (const key of [
    "quickContactEnabled", "quickContactMessengerUrl", "quickContactZaloUrl", "quickContactTelegramUrl",
    "quickContactMessengerEnabled", "quickContactZaloEnabled", "quickContactTelegramEnabled",
    "quickContactMessengerLabelVi", "quickContactMessengerLabelEn", "quickContactMessengerLabelJa", "quickContactMessengerLabelZh",
    "quickContactZaloLabelVi", "quickContactZaloLabelEn", "quickContactZaloLabelJa", "quickContactZaloLabelZh",
    "quickContactTelegramLabelVi", "quickContactTelegramLabelEn", "quickContactTelegramLabelJa", "quickContactTelegramLabelZh",
    "quickContactTitleVi", "quickContactTitleEn", "quickContactTitleJa", "quickContactTitleZh",
  ]) assert.match(admin + adminSettingsKeys, new RegExp(`["']${key}["']`), key);
  assert.match(baseLayout, /chrome === "portfolio" && env\.CONTENT_DB/);
  assert.match(baseLayout, /chrome === "portfolio" && quickContactMenu/);
  assert.match(fab, /aria-expanded/);
  assert.match(fab, /aria-controls/);
  assert.match(fab, /nofollow noopener noreferrer/);
  assert.match(fab, /menu\.channels/);
});
