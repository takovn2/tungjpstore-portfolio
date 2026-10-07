import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHmac } from "node:crypto";
import ts from "typescript";
import { verifyTelegramMiniAppInitData } from "../src/lib/shop/telegram-mini-auth.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("Telegram Mini App verifies signed initData and rejects tampering", async () => {
  const token = "123456789:abcdefghijklmnopqrstuvwxyzABCDE123456789";
  const authDate = 1_900_000_000;
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAE-test-query",
    user: JSON.stringify({ id: 123456, first_name: "Tung", username: "tung" }),
  });
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));

  const verified = await verifyTelegramMiniAppInitData(params.toString(), token, authDate + 30);
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.user.id, 123456);
  params.set("query_id", "tampered");
  assert.equal((await verifyTelegramMiniAppInitData(params.toString(), token, authDate + 30)).ok, false);
  const duplicate = `${params.toString()}&query_id=duplicate`;
  assert.equal((await verifyTelegramMiniAppInitData(duplicate, token, authDate + 30)).ok, false);
  assert.equal((await verifyTelegramMiniAppInitData(`${params.toString()}&hash=${params.get("hash")}`, token, authDate + 30)).ok, false);
  assert.equal((await verifyTelegramMiniAppInitData(`${params.toString()}&auth_date=${authDate}`, token, authDate + 30)).ok, false);
});

test("Telegram Mini App bootstrap sessions are opaque, identity-bound, and replay-fenced", async () => {
  const types = compile(read("src/lib/shop/types.ts"));
  const crypto = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const session = compile(read("src/lib/shop/telegram-mini-session.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const sessionModule = await importSource(`${types}\n${crypto}\n${session}`);
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0001_content_cms.sql"));
  sqlite.exec(read("content-migrations/0009_shop_core.sql"));
  sqlite.exec(read("content-migrations/0013_shop_idempotency_and_outbox_leases.sql"));
  sqlite.exec(read("content-migrations/0016_shop_telegram_recipients.sql"));
  sqlite.exec(read("content-migrations/0018_shop_telegram_recipient_identity.sql"));
  sqlite.exec(read("content-migrations/0035_shop_telegram_mini_sessions.sql"));
  sqlite.exec(read("content-migrations/0039_shop_telegram_bot_scope.sql"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
        async run() { const result = statement.run(...bindings); return { meta: { changes: Number(result.changes) } }; },
      };
      return prepared;
    },
  };
  const customerId = "customer-telegram-session";
  const now = "2026-07-29T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_customers (id, email_normalized, email_masked, display_name, locale, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'vi', ?, ?)`).run(customerId, "tg123@telegram.tungjpstore.local", "t***@telegram.tungjpstore.local", "Tung", now, now);
  sqlite.prepare(`INSERT INTO shop_customer_identities
    (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
    VALUES (?, ?, 'telegram', '123', '@tung', '{}', ?, ?, ?)`).run("identity-telegram-session", customerId, now, now, now);
  const bindings = { CONTENT_DB: db, SHOP_ORDER_TOKEN_SECRET: "s".repeat(48), SHOP_PUBLIC_ORIGIN: "https://tung.codes" };
  const request = new Request("https://tung.codes/api/shop/telegram-mini/session", { headers: { "user-agent": "Telegram WebView Test" } });
  const initData = "auth_date=1900000000&query_id=one&user=%7B%22id%22%3A123%2C%22first_name%22%3A%22Tung%22%7D&hash=abc";
  const reorderedInitData = "hash=abc&user=%7B%22id%22%3A123%2C%22first_name%22%3A%22Tung%22%7D&query_id=one&auth_date=1900000000";
  const issued = await sessionModule.createTelegramMiniSession(bindings, {
    request,
    initData,
    authDate: 1_900_000_000,
    user: { id: 123, first_name: "Tung", username: "tung", language_code: "vi" },
    customerId,
    locale: "vi",
  }, Date.parse(now));
  assert.match(issued.cookie, /HttpOnly/);
  assert.match(issued.cookie, /SameSite=Strict/);
  assert.match(issued.cookie, /__Host-tg_mini_session=/);
  assert.equal(issued.cookie.includes(issued.tokenHash), false);
  const restored = await sessionModule.getTelegramMiniSession(bindings, new Request(request.url, {
    headers: { cookie: issued.cookie.split(";", 1)[0], "user-agent": "Telegram WebView Test" },
  }), Date.parse(now) + 1_000);
  assert.equal(restored?.telegramUserId, 123);
  const wrongUserAgent = await sessionModule.getTelegramMiniSession(bindings, new Request(request.url, {
    headers: { cookie: issued.cookie.split(";", 1)[0], "user-agent": "Other WebView" },
  }), Date.parse(now) + 1_500);
  assert.equal(wrongUserAgent, null);
  const revokedSession = await sessionModule.getTelegramMiniSession(bindings, new Request(request.url, {
    headers: { cookie: issued.cookie.split(";", 1)[0], "user-agent": "Telegram WebView Test" },
  }), Date.parse(now) + 1_600);
  assert.equal(revokedSession, null);
  const recovered = await sessionModule.createTelegramMiniSession(bindings, {
      request,
      initData: reorderedInitData,
      authDate: 1_900_000_000,
      user: { id: 123, first_name: "Tung" },
      customerId,
      locale: "vi",
    }, Date.parse(now) + 2_000);
  assert.match(recovered.cookie, /__Host-tg_mini_session=/);
  await assert.rejects(
    sessionModule.createTelegramMiniSession(bindings, {
      request,
      initData: reorderedInitData,
      authDate: 1_900_000_000,
      user: { id: 123, first_name: "Tung" },
      customerId,
      locale: "vi",
    }, Date.parse(now) + 3_000),
    (error) => error instanceof sessionModule.TelegramMiniSessionError && error.code === "telegram_auth_replayed",
  );
  assert.equal(sessionModule.assertTelegramMiniMutationOrigin(new Request("https://tung.codes/api/shop/telegram-mini/checkout", {
    method: "POST", headers: { origin: "https://tung.codes" },
  }), bindings), true);
  assert.equal(sessionModule.assertTelegramMiniMutationOrigin(new Request("https://tung.codes/api/shop/telegram-mini/checkout", {
    method: "POST", headers: { origin: "https://evil.example" },
  }), bindings), false);
  sqlite.close();
});

test("Telegram Mini App branding follows bot identity and accepts welcome overrides", async () => {
  const brandingSource = compile(read("src/lib/shop/telegram-mini-branding.ts")).replace(
    /^import[\s\S]*?from "\.\/telegram";\s*/m,
    `export async function getTelegramBotIdentity() {
      return { id: 42, firstName: "Vietnam Win Shop", username: "vietnamwin_bot" };
    }
    `,
  );
  const branding = await importSource(brandingSource);
  const fallback = branding.vietnamMiniShopBrandingFallback({ TELEGRAM_BOT_USERNAME: "vietnamwin_bot" });
  assert.equal(fallback.shopName, "Vietnamwin");
  assert.equal(fallback.username, "vietnamwin_bot");
  assert.equal(fallback.welcomeCustomized, false);
  assert.match(fallback.welcomeKicker, /Vietnamwin/);
  const custom = branding.vietnamMiniShopBrandingFallback({
    TELEGRAM_BOT_USERNAME: "vietnamwin_bot",
    TELEGRAM_MINI_SHOP_NAME: "Cửa hàng số VN",
    TELEGRAM_MINI_WELCOME_KICKER: "Chào mừng bạn",
    TELEGRAM_MINI_WELCOME_HEADING: "Mua nhanh.",
    TELEGRAM_MINI_WELCOME_EMPHASIS: "Giao key ngay.",
  });
  assert.equal(custom.shopName, "Cửa hàng số VN");
  assert.equal(custom.welcomeCustomized, true);
  assert.equal(custom.welcomeKicker, "Chào mừng bạn");
  const live = await branding.resolveVietnamMiniShopBranding({
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_BOT_USERNAME: "vietnamwin_bot",
  });
  assert.equal(live.shopName, "Vietnam Win Shop");
  assert.equal(live.username, "vietnamwin_bot");
  const page = read("src/pages/telegram/shop.astro");
  const api = read("src/pages/api/shop/telegram-mini/[...path].ts");
  assert.match(page, /id="shop-brand-name"/);
  assert.match(page, /applyShopBranding\(result\.shop/);
  assert.match(page, /resolveVietnamMiniShopBranding/);
  assert.doesNotMatch(page, />TUNG STORE</);
  assert.match(api, /resolveVietnamMiniShopBranding\(env, session\.botConfigId\)/);
  assert.match(api, /shop,/);
});

test("Telegram Mini App keeps bot secrets server-side and exposes a web_app entry", () => {
  const page = read("src/pages/telegram/shop.astro");
  const api = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const telegram = read("src/lib/shop/telegram.ts");
  assert.match(page, /x-telegram-init-data/);
  assert.doesNotMatch(page, /TELEGRAM_BOT_TOKEN|SHOP_TELEGRAM_VPS_SECRET/);
  assert.match(page, /const canReveal = paymentStatus === "paid"/);
  assert.match(page, /data-variant-add/);
  assert.match(page, /addVariantToCart\(variantButton\.dataset\.variantAdd\)/);
  assert.match(page, /telegram-mini-cart:v2:\$\{telegramIdentity\}/);
  assert.match(page, /new URLSearchParams\(location\.hash\.replace\(\/\^#\//);
  assert.match(page, /getTelegramInitData\(\)/);
  assert.match(page, /let checkoutBusy = false/);
  assert.match(page, /saved\?\.fingerprint === fingerprint/);
  assert.match(page, /void pollPayment\(result\.order\.id/);
  assert.match(page, /async function bootstrapSession\(\)/);
  assert.match(page, /\/api\/shop\/telegram-mini\/session/);
  assert.match(page, /credentials: "include"/);
  assert.match(page, /const telegramSessionError = \(code, details = \{\}\) => Object\.assign/);
  assert.match(page, /async function waitForTelegramInitData\(maxWaitMs = 2_800\)/);
  assert.match(page, /async function fetchWithRetry\(url, options = \{\}, timeoutMs = 12_000, retries = 0\)/);
  assert.match(page, /if \(!raw\) throw telegramSessionError\("telegram_auth_unavailable"\)/);
  assert.doesNotMatch(page, /"x-telegram-init-data":getTelegramInitData\(\)/);
  assert.match(api, /verifyTelegramMiniAppInitData/);
  assert.match(api, /size > 16_000/);
  assert.match(api, /cache-control": "private, no-store/);
  assert.match(api, /createTelegramMiniSession/);
  assert.match(api, /getTelegramMiniSession/);
  assert.match(api, /assertTelegramMiniMutationOrigin/);
  assert.match(api, /telegram_auth_replayed/);
  assert.match(api, /clearTelegramMiniSessionCookie/);
  assert.match(api, /telegram_session_required/);
  assert.match(api, /legacyAuth = await verifyMiniAppIdentity/);
  assert.match(api, /const migrationHint = "nextBotUrl" in legacyAuth/);
  assert.match(api, /telegram_bot_context_invalid/);
  assert.match(api, /nextBotUsername/);
  assert.match(api, /nextBotUrl/);
  assert.match(api, /legacyAuth\.user\.id !== existing\.telegramUserId/);
  assert.match(api, /error\.code === "key_reveal_rate_limited"/);
  assert.match(api, /retry-after/);
  assert.match(api, /deliveries: delivery\.deliveries/);
  assert.doesNotMatch(api, /json\(\{ ok: true, deliveries \}\)/);
  assert.match(api, /request\.method === "GET" && segments\[0\] === "session"/);
  assert.match(telegram, /web_app: \{ url: miniAppUrl \}/);
  assert.match(read("src/lib/shop/telegram-mini-session.ts"), /__Host-tg_mini_session/);
  assert.match(read("content-migrations/0035_shop_telegram_mini_sessions.sql"), /init_data_hash TEXT NOT NULL UNIQUE/);
  // The bridge must execute before the inline app boot; otherwise Telegram's initData is still empty.
  assert.match(page, /<script is:inline src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/);
});

test("Telegram Mini App bootstrap never falls back to a stale session cookie", () => {
  const api = read("src/pages/api/shop/telegram-mini/[...path].ts");
  assert.match(api, /if \(!rawInitData && existing\) \{[\s\S]*if \(allowInitDataBootstrap\) return authFailure\(json\(\{ ok: false, code: "telegram_auth_required" \}, 401\)\)/);
});

test("Telegram Mini App keeps dynamic views and navigation controls wired after Astro rendering", () => {
  const page = read("src/pages/telegram/shop.astro");
  const astroConfig = read("astro.config.mjs");

  // HTML inserted through innerHTML needs global selectors; scoped Astro CSS cannot match it.
  assert.match(page, /<style is:global>/);
  for (const view of ["home", "cart", "orders"]) {
    assert.match(page, new RegExp(`data-view=\\"${view}\\"`));
    assert.match(page, new RegExp(`data-nav=\\"${view}\\"`));
  }
  assert.match(page, /function showView\(view\)/);
  assert.match(page, /node\.classList\.toggle\("is-active", node\.dataset\.view === view\)/);
  assert.match(page, /target\.dataset\.nav\) showView\(target\.dataset\.nav\)/);
  assert.match(page, /state\.view === "cart" && count > 0/);
  assert.match(page, /\.grid \{ display:grid; grid-template-columns:1fr;/);
  // v7 Porcelain White: product CTAs live in the unified kit selector list.
  assert.match(page, /\.product-action[^{]*\{[^}]*min-height:44px;/);
  assert.match(page, /\.nav-button \{[^}]*min-height:54px;/);
  assert.match(page, /\.discount-clear[^{]*\{[^}]*min-height:44px;/);
  assert.match(page, /\.order-filter \{[^}]*min-height:36px;/);
  assert.match(page, /\.order-number-copy \{[^}]*width:34px;[^}]*height:34px;/);
  assert.match(page, /--danger-text:\s*#b03830/);
  assert.match(page, /"telegram\/thumbs"/);
  assert.match(page, /const mediaSrcset = \(product\) =>/);
  assert.match(page, /id="pending-payment-banner"/);
  assert.match(page, /const prefersReducedMotion = window\.matchMedia/);
  assert.match(page, /typeof element\.animate !== "function"/);
  assert.match(page, /class="payment-steps"/);
  assert.match(page, /function setCheckoutBusy\(busy\)/);
  assert.match(page, /@media \(max-width:359px\)/);
  assert.match(page, /class="order-skeleton"/);
  assert.match(page, /data-refresh-orders/);
  assert.match(page, /void openOrderDetail\(target\.dataset\.order\)/);
  assert.match(page, /void revealOrderKeys\(target\.dataset\.keys\)/);
  assert.match(page, /await revealOrderKeys\(orderId, \{ automatic:true, detail:result, orderNumber \}\)/);
  assert.match(page, /data-copy-key-index/);
  assert.match(page, /data-copy-all-keys/);
  assert.match(page, /navigator\.clipboard\?\.writeText/);
  assert.match(page, /Reflect\.get\(document, "execCommand"\)/);
  assert.match(page, /visibleKeyMaterial\.splice\(0, visibleKeyMaterial\.length\)/);
  assert.match(page, /clearVisibleKeys\(\); const backdrop = \$\("#modal-backdrop"\)/);
  assert.match(page, /function setModalBackgroundInert\(blocked\)/);
  assert.match(page, /node\.setAttribute\("inert", ""\)/);
  assert.match(page, /backdrop\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(page, /if \(activePaymentPoll\) \{ activePaymentPoll\.cancelled = true; activePaymentPoll\.controller\?\.abort\(\); activePaymentPoll = null; \}/);
  assert.match(page, /function markTelegramSessionFailure\(code, details = \{\}\)/);
  assert.match(page, /id="session-error-banner"/);
  assert.match(page, /data-session-retry/);
  assert.match(page, /async function retryTelegramSession\(\)/);
  assert.match(page, /function openActiveBot\(\)/);
  assert.match(page, /tg\?\.openTelegramLink/);
  assert.match(page, /document\.body\.dataset\.sessionState = "error"/);
  assert.match(page, /body\[data-session-state="error"\] \.hero-signal:before/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^\n]*(?:keyMaterial|deliveries)/i);
  assert.match(page, /order_delivery_in_progress/);
  assert.doesNotMatch(page, /const retryDelays =/);
  assert.match(page, /ready:"Sẵn sàng phát hành"/);
  assert.match(page, /delivered:"Đã giao đầy đủ"/);
  assert.match(page, /const authRetryable = new Set\(\["telegram_session_required"/);
  assert.match(page, /response\.status === 401 \|\| \(response\.status === 403 && authRetryable\.has\(result\.code\)\)/);
  assert.match(page, /const fetchWithTimeout = async/);
  assert.match(page, /window\.addEventListener\("online", syncOnlineState\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange"/);
  assert.match(page, /signal:job\.controller\.signal/);
  assert.match(page, /if \(job\.cancelled\) return null;/);
  assert.match(page, /safeStorageRead\(localStorage, cartKey, CART_STORAGE_MAX_BYTES\)/);
  assert.match(page, /ordersLoadedAt > 0 && Date\.now\(\) - ordersLoadedAt < ORDERS_CACHE_TTL_MS/);
  assert.match(page, /data-reorder-order/);
  assert.match(page, /function reorderOrder\(orderId\)/);
  assert.match(page, /const orderDetailCache = new Map\(\)/);
  assert.match(page, /\.nav-button \{[^}]*flex-direction:column;/);

  // The in-app toolbar can cover fixed mobile controls during visual/E2E checks.
  assert.match(astroConfig, /devToolbar:\s*\{\s*enabled:\s*false,?\s*\}/);
});
