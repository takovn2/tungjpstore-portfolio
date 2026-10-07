import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");
const adminPage = read("src/pages/admin/index.astro");
const adminCss = read("src/styles/admin.css");

// The admin app is a React island; every behavior assertion below targets the
// actual implementation files instead of a monolithic inline script.
const app = read("src/components/admin/AdminApp.tsx");
const apiClient = read("src/components/admin/api/client.ts");
const crypto = read("src/components/admin/lib/crypto.ts");
const labels = read("src/components/admin/lib/labels.ts");
const contentView = read("src/components/admin/views/ContentView.tsx");
const contactsView = read("src/components/admin/views/ContactsView.tsx");
const mediaView = read("src/components/admin/views/MediaView.tsx");
const settingsView = read("src/components/admin/views/SettingsView.tsx");
const securityView = read("src/components/admin/views/SecurityView.tsx");
const catalogTab = read("src/components/admin/shop/CatalogTab.tsx");
const productDialog = read("src/components/admin/shop/ProductDialog.tsx");
const importDialog = read("src/components/admin/shop/InventoryImportDialog.tsx");
const telegramTab = read("src/components/admin/shop/TelegramTab.tsx");
const paymentsTab = read("src/components/admin/shop/PaymentsTab.tsx");
const orderDialog = read("src/components/admin/shop/OrderDialog.tsx");
const overviewView = read("src/components/admin/views/OverviewView.tsx");
const primitives = read("src/components/admin/ui/primitives.tsx");
const coverPicker = read("src/components/admin/ui/CoverPicker.tsx");
const useShop = read("src/components/admin/shop/useShop.tsx");
const shopWorkspace = read("src/components/admin/shop/ShopWorkspace.tsx");
const adminSources = [app, apiClient, crypto, labels, contentView, contactsView, mediaView, settingsView, securityView, overviewView, catalogTab, productDialog, importDialog, telegramTab, paymentsTab, orderDialog, shopWorkspace].join("\n");

test("admin React island mounts with a noscript fallback and no inline logic", () => {
  for (const file of ["src/components/admin/AdminApp.tsx", "src/components/admin/ui/Dialog.tsx", "src/components/admin/ui/Toast.tsx", "src/styles/admin.css"]) {
    assert.equal(existsSync(`${projectRoot}/${file}`), true, `${file} is missing`);
  }
  assert.match(adminPage, /AdminApp client:only="react"/);
  assert.match(adminPage, /import "\.\.\/\.\.\/styles\/admin\.css"/);
  assert.match(adminPage, /<noscript>/);
  assert.match(adminPage, /export const prerender = false/);
  assert.match(adminPage, /private, no-store/);
  assert.match(adminPage, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(adminPage, /<script is:inline>/);
});

test("admin shell exposes distinct content, CRM, media, shop and settings workspaces", () => {
  for (const id of ["overview-view", "content-view", "contacts-view", "media-view", "shop-view", "settings-view", "security-view"]) {
    assert.match(adminSources, new RegExp(`id="${id}"`));
  }
  assert.match(adminPage, /Editorial Control Desk/);
  assert.match(app, /aria-current=\{active \? "page" : undefined\}/);
  for (const view of ["contacts", "media", "shop", "settings", "security"]) {
    assert.match(app, new RegExp(`view: "${view}"`));
  }
});

test("admin content workflow protects dirty edits and destructive actions", () => {
  assert.match(app, /const \[dirty, setDirty\] = useState<Set<string>>/);
  assert.match(app, /beforeunload/);
  assert.match(app, /guardUnsaved/);
  assert.match(app, /Bỏ thay đổi chưa lưu\?/);
  assert.match(contentView, /Chuyển vào thùng rác\?/);
  assert.match(contentView, /Gỡ nội dung khỏi website\?/);
  assert.match(contentView, /content\?type=\$\{contentType\}&deleted=\$\{scope\}/);
  assert.match(contentView, /option value="deleted">Thùng rác/);
  assert.match(primitives, /aria-busy/);
  // Draft autosave is the one sanctioned localStorage use; the CRM keeps no local copies.
  assert.match(contentView, /localStorage\.setItem\(draftKey/);
  assert.doesNotMatch(contactsView, /localStorage|sessionStorage/);
});

test("shop editor keeps complex product/category/key workflows progressive and visible", () => {
  assert.match(productDialog, /shop-advanced-disclosure/);
  assert.match(productDialog, /readiness/);
  assert.match(coverPicker, /shop-cover-picker/);
  assert.match(importDialog, /data-import-stat|shop-import-stats/);
  assert.match(importDialog, /role="alert"/);
  assert.match(labels, /shop_key_crypto_not_configured: "Kho key chưa sẵn sàng:/);
  assert.match(catalogTab, /status === "archived"/);
  assert.match(adminCss, /\.shop-advanced-disclosure/);
});

test("admin Telegram bot fleet keeps onboarding, activation and rollback explicit", () => {
  assert.match(telegramTab, /data-shop-telegram-form/);
  assert.match(telegramTab, /name="token"/);
  assert.match(telegramTab, /type="password"/);
  assert.match(telegramTab, /telegram\/bots\/validate/);
  assert.match(telegramTab, /telegram\/bots\/\$\{encodeURIComponent\(botId\)\}\/test/);
  assert.match(telegramTab, /mode === "rollback"/);
  assert.match(telegramTab, /telegram\/bots\/\$\{encodeURIComponent\(botId\)\}\/\$\{mode\}/);
  assert.match(telegramTab, /expectedVersion/);
  assert.match(telegramTab, /status === "active" && hasPrevious/);
  assert.match(telegramTab, /!\["activating", "retiring", "revoked"\]\.includes\(status\)/);
  assert.match(labels, /telegram_bot_operation_in_progress/);
  assert.match(telegramTab, /Xác minh lại mật khẩu quản trị/);
  assert.match(telegramTab, /Nhập lại username để xác nhận/);
  assert.match(telegramTab, /data-shop-list="telegram-events"/);
  assert.match(telegramTab, /Token bị xoá khỏi input ngay khi tạo yêu cầu/);
});

test("admin Telegram registry refresh fails closed and reconciles runtime state", () => {
  assert.match(labels, /retiring: "Đang dọn webhook cũ"/);
  for (const event of ["activation_started", "activation_failed", "previous_retired", "credentials_rewrapped", "token_rotated"]) {
    assert.match(labels, new RegExp(`${event}:`));
  }
  assert.match(useShop, /telegramEncryptionConfigured: false/);
  assert.match(useShop, /encryptionConfigured === true/);
  assert.match(telegramTab, /const disabled = !telegramEncryptionConfigured;/);
  assert.match(telegramTab, /Thiếu TELEGRAM_TOKEN_ENCRYPTION_SECRET/);
  assert.doesNotMatch(telegramTab, /token_ciphertext|webhook_secret_ciphertext/);
  assert.doesNotMatch(telegramTab, /console\.(log|error)\([^)]*token/i);
});

test("admin Telegram mutations refresh failed activations and redirect legacy configuration", () => {
  assert.match(telegramTab, /await loadTelegramBots\(\)\.catch\(\(\) => undefined\);/);
  assert.match(telegramTab, /throw error;/);
  assert.match(labels, /telegram_legacy_config_disabled/);
});

test("admin CRM follows the CONTACT_DB list, detail, update and note contract", () => {
  assert.match(contactsView, /contacts\/search", \{ method: "POST"/);
  assert.match(contactsView, /requestPage/);
  assert.match(labels, /reviewing.*Đang xem xét.*Đã trả lời|new: "Mới", reviewing: "Đang xem xét", replied: "Đã trả lời"/);
  assert.match(contactsView, /value="new">Mới</);
  assert.match(contactsView, /type="date"/);
  assert.match(contactsView, /new Date\(year, month - 1, day/);
  assert.match(contactsView, /method: "PATCH"/);
  assert.match(contactsView, /expectedUpdatedAt: contact\.updatedAt/);
  assert.match(contactsView, /\/notes`, \{ method: "POST"/);
  assert.match(contactsView, /mailto:/);
  assert.match(contactsView, /encodeURIComponent\(contact\.email\)/);
  assert.match(labels, /contact_conflict/);
});

test("admin media upload keeps visible labels and bounded raster guidance", () => {
  assert.match(mediaView, /File ảnh/);
  assert.match(mediaView, /Alt text/);
  assert.match(mediaView, /image\/jpeg,image\/png,image\/gif,image\/webp,image\/avif/);
  assert.match(adminCss, /prefers-reduced-motion/);
});

test("admin shell exposes overview, editorial navigation and a second password gate", () => {
  for (const label of ["Tổng quan", "Nội dung", "Dự án", "Bài viết", "Contacts", "Media", "Shop", "Thiết lập", "Bảo mật"]) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /security\/status/);
  assert.match(app, /passwordConfigured/);
  assert.match(app, /security\/setup/);
  assert.match(app, /security\/login/);
  assert.match(app, /security\/challenge/);
  assert.match(securityView, /security\/logout/);
  assert.match(securityView, /security\/change/);
  assert.match(app, /data\.security \|\| data/);
  assert.match(app, /sessionExpiresAt|expiresAt/);
  assert.match(securityView, /mọi phiên bị thu hồi|mọi phiên quản trị đã bị thu hồi/);
  assert.match(app, /name="adminPassword"/);
  assert.match(app, /minLength=\{14\}/);
});

test("admin password flow derives credentials locally and uses a one-time HMAC challenge for login", () => {
  assert.match(crypto, /deriveAdminCredential/);
  assert.match(crypto, /crypto\.subtle\.deriveBits/);
  assert.match(app, /security\/challenge/);
  assert.match(crypto, /crypto\.subtle\.sign/);
  assert.match(crypto, /hmac-sha256-login-v1/);
  assert.match(crypto, /challengeId/);
  assert.match(app, /passwordSalt/);
  assert.match(crypto, /salt/);
  assert.match(crypto, /PBKDF2/);
  assert.doesNotMatch(crypto, /JSON\.stringify\(\{\s*password:/);
});

test("admin editor has persistent validation summary, locale readiness and keyboard flows", () => {
  assert.match(contentView, /id="publish-errors"/);
  assert.match(contentView, /role="alert"/);
  assert.match(read("src/components/admin/ui/primitives.tsx"), /role="tablist"/);
  assert.match(read("src/components/admin/ui/primitives.tsx"), /aria-selected/);
  assert.match(contentView, /localeReadiness/);
  assert.match(contentView, /formatPublishIssue/);
  assert.match(contentView, /tabIndex=\{-1\}/);
  assert.match(contentView, /event\.key\.toLowerCase\(\) === "s"/);
});

test("admin CRM provides non-live list status and a two-pane detail surface", () => {
  assert.match(contactsView, /id="contact-list-status"/);
  assert.doesNotMatch(contactsView, /aria-live/);
  assert.match(contactsView, /contact-detail-title/);
  assert.match(contactsView, /contact-identity/);
});

test("admin payment attention never treats an event id as an order id", () => {
  assert.match(paymentsTab, /Chưa ghép đơn/);
  assert.match(paymentsTab, /typeof event\.orderId === "string" \? event\.orderId\.trim\(\) : ""/);
  assert.doesNotMatch(paymentsTab, /event\.orderId \|\| event\.id/);
  assert.match(paymentsTab, /disabled aria-disabled="true"/);
});

test("admin order detail renders a safe payment event timeline", () => {
  assert.match(orderDialog, /order\.paymentEvents/);
  assert.match(orderDialog, /className="timeline"/);
  for (const field of ["transactionReference", "orderReference", "amountMinor", "matchState", "processingState", "occurredAt"]) {
    assert.match(orderDialog, new RegExp(`event\\.${field}`));
  }
  assert.doesNotMatch(orderDialog, /payloadHash|signatureVerified|destinationAccount|accountNumber|checksumKey|secret/i);
});
