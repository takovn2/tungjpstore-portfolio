import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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

async function loadTelegramMiniSession() {
  const types = compile(read("src/lib/shop/types.ts"));
  const cryptoSource = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  const sessionSource = compile(read("src/lib/shop/telegram-mini-session.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(`${types}\n${cryptoSource}\n${sessionSource}`);
}

async function loadTelegramOutbox() {
  const source = compile(read("src/lib/shop/telegram-outbox.ts")).replace(/^import[\s\S]*?;\s*/gm, "");
  return importSource(source);
}

async function loadMiniRouteAuth(runtime) {
  const source = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const verifyStart = source.indexOf("async function verifyMiniAppIdentity");
  const sessionStart = source.indexOf("async function telegramSessionBotValid", verifyStart);
  const authenticateStart = source.indexOf("async function authenticate", sessionStart);
  assert.ok(verifyStart >= 0 && sessionStart > verifyStart && authenticateStart > sessionStart);
  globalThis.__telegramMiniRouteRuntime = runtime;
  const authSource = `
    const env = globalThis.__telegramMiniRouteRuntime.env;
    const listTelegramBotCredentials = globalThis.__telegramMiniRouteRuntime.listTelegramBotCredentials;
    const verifyTelegramMiniAppInitData = globalThis.__telegramMiniRouteRuntime.verifyTelegramMiniAppInitData;
    ${source.slice(verifyStart, authenticateStart)}
    export { verifyMiniAppIdentity, telegramSessionBotValid };
  `;
  return importSource(compile(authSource));
}

function signedInitData(token, userId, authDate = Math.floor(Date.now() / 1_000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: `query-${userId}`,
    user: JSON.stringify({ id: userId, first_name: `User ${userId}` }),
  });
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return params.toString();
}

function createScopedD1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "0001_content_cms.sql",
    "0009_shop_core.sql",
    "0013_shop_idempotency_and_outbox_leases.sql",
    "0016_shop_telegram_recipients.sql",
    "0018_shop_telegram_recipient_identity.sql",
    "0023_shop_customer_auth.sql",
    "0035_shop_telegram_mini_sessions.sql",
    "0037_shop_telegram_bot_registry.sql",
    "0039_shop_telegram_bot_scope.sql",
    "0040_shop_telegram_bot_auth_revision.sql",
  ]) sqlite.exec(read(`content-migrations/${migration}`));
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

function seedTelegramCustomer(sqlite) {
  const now = "2026-07-30T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_customers
    (id, email_normalized, email_masked, display_name, locale, created_at, updated_at)
    VALUES ('shared-telegram-customer', 'tg8685416510@telegram.tungjpstore.local',
      't***@telegram.tungjpstore.local', 'Tung.codes', 'vi', ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_customer_identities
    (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
    VALUES ('shared-telegram-identity', 'shared-telegram-customer', 'telegram', '8685416510',
      '@Tungcodes', '{}', ?, ?, ?)`).run(now, now, now);
  return { customerId: "shared-telegram-customer", now };
}

test("Telegram Mini App sessions keep bot scope while customer identity remains global", async () => {
  const session = await loadTelegramMiniSession();
  const { db, sqlite } = createScopedD1();
  try {
    const { customerId, now } = seedTelegramCustomer(sqlite);
    const bindings = {
      CONTENT_DB: db,
      SHOP_ORDER_TOKEN_SECRET: "s".repeat(48),
      SHOP_PUBLIC_ORIGIN: "https://tung.codes",
    };
    const request = new Request("https://tung.codes/api/shop/telegram-mini/session", {
      headers: { "user-agent": "Telegram WebView" },
    });
    const common = {
      request,
      authDate: 1_900_000_000,
      user: { id: 8685416510, first_name: "Tung.codes", username: "Tungcodes", language_code: "vi" },
      customerId,
      locale: "vi",
    };
    const botA = await session.createTelegramMiniSession(bindings, {
      ...common,
      initData: "auth_date=1900000000&query_id=bot-a&hash=aaa",
      botConfigId: "bot-config-a",
      botVersion: 4,
    }, Date.parse(now));
    const botB = await session.createTelegramMiniSession(bindings, {
      ...common,
      initData: "auth_date=1900000000&query_id=bot-b&hash=bbb",
      botConfigId: "bot-config-b",
      botVersion: 7,
    }, Date.parse(now) + 1_000);
    const revisionOne = await session.createTelegramMiniSession(bindings, {
      ...common,
      initData: "auth_date=1900000000&query_id=revision&hash=ccc",
      botConfigId: "bot-config-revision",
      botVersion: 3,
    }, Date.parse(now) + 1_100);
    await session.revokeTelegramMiniSession(bindings, new Request(request.url, {
      headers: { cookie: revisionOne.cookie.split(";", 1)[0], "user-agent": "Telegram WebView" },
    }));
    const revisionTwo = await session.createTelegramMiniSession(bindings, {
      ...common,
      initData: "auth_date=1900000000&query_id=revision&hash=ccc",
      botConfigId: "bot-config-revision",
      botVersion: 4,
    }, Date.parse(now) + 1_200);

    const restore = (issued) => session.getTelegramMiniSession(bindings, new Request(request.url, {
      headers: { cookie: issued.cookie.split(";", 1)[0], "user-agent": "Telegram WebView" },
    }), Date.parse(now) + 2_000);
    const [restoredA, restoredB] = await Promise.all([restore(botA), restore(botB)]);
    assert.deepEqual(
      { customerId: restoredA?.customerId, userId: restoredA?.telegramUserId, bot: restoredA?.botConfigId, version: restoredA?.botVersion },
      { customerId, userId: 8685416510, bot: "bot-config-a", version: 4 },
    );
    assert.deepEqual(
      { customerId: restoredB?.customerId, userId: restoredB?.telegramUserId, bot: restoredB?.botConfigId, version: restoredB?.botVersion },
      { customerId, userId: 8685416510, bot: "bot-config-b", version: 7 },
    );
    const restoredRevision = await restore(revisionTwo);
    assert.equal(restoredRevision?.botVersion, 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_customers").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_customer_identities WHERE provider = 'telegram'").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("Telegram order notifications stay pinned to the bot that created the order", () => {
  const { sqlite } = createScopedD1();
  try {
    const { customerId, now } = seedTelegramCustomer(sqlite);
    const subjectHash = "s".repeat(43);
    sqlite.prepare(`INSERT INTO shop_orders
      (id, order_number, order_reference, public_token_hash, checkout_subject_hash, customer_id,
       source_channel, locale, status, payment_status, fulfillment_status, currency, subtotal_minor,
       discount_minor, tax_minor, total_minor, customer_name_snapshot, metadata_json,
       telegram_bot_config_id, version, paid_at, created_at, updated_at)
      VALUES ('order-from-a', 'TG-BOT-A', 'BOTAREF', 'public-bot-a', ?, ?, 'telegram', 'vi',
        'processing', 'paid', 'unfulfilled', 'VND', 35000, 0, 0, 35000, 'Tung.codes', '{}',
        'bot-config-a', 1, ?, ?, ?)`).run(subjectHash, customerId, now, now, now);
    const insertRecipient = sqlite.prepare(`INSERT INTO shop_telegram_recipients
      (subject_hash, customer_id, bot_config_id, chat_ciphertext_b64, chat_iv_b64, key_version,
       verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'v1', ?, ?, ?)`);
    insertRecipient.run(subjectHash, customerId, "bot-config-a", "a".repeat(24), "i".repeat(16), now, now, now);
    insertRecipient.run(subjectHash, customerId, "bot-config-b", "b".repeat(24), "j".repeat(16), now, now, now);

    const notification = sqlite.prepare(`SELECT r.bot_config_id, r.chat_ciphertext_b64
      FROM shop_orders o JOIN shop_telegram_recipients r
        ON r.subject_hash = o.checkout_subject_hash AND r.customer_id = o.customer_id
        AND r.bot_config_id = o.telegram_bot_config_id
      WHERE o.id = ? AND o.source_channel = 'telegram' LIMIT 1`).get("order-from-a");
    assert.deepEqual(
      { bot_config_id: notification.bot_config_id, chat_ciphertext_b64: notification.chat_ciphertext_b64 },
      { bot_config_id: "bot-config-a", chat_ciphertext_b64: "a".repeat(24) },
    );
  } finally {
    sqlite.close();
  }
});

test("Telegram recipient persistence defaults legacy callers to the environment bot scope", async () => {
  const outbox = await loadTelegramOutbox();
  const { db, sqlite } = createScopedD1();
  try {
    const { customerId, now } = seedTelegramCustomer(sqlite);
    const subjectHash = "e".repeat(43);
    sqlite.prepare(`INSERT INTO shop_orders
      (id, order_number, order_reference, public_token_hash, checkout_subject_hash, customer_id,
       source_channel, locale, status, payment_status, fulfillment_status, currency, subtotal_minor,
       discount_minor, tax_minor, total_minor, customer_name_snapshot, metadata_json,
       telegram_bot_config_id, version, created_at, updated_at)
      VALUES ('environment-order', 'TG-ENV', 'ENVREF', 'public-env', ?, ?, 'telegram', 'vi',
        'pending_payment', 'pending', 'unfulfilled', 'VND', 1000, 0, 0, 1000, 'Tung.codes', '{}',
        'environment', 1, ?, ?)`).run(subjectHash, customerId, now, now);
    await outbox.persistTelegramOrderRecipient({
      CONTENT_DB: db,
      SHOP_KEY_ENCRYPTION_SECRET: Buffer.alloc(32, 7).toString("base64url"),
      SHOP_KEY_ENCRYPTION_KEY_VERSION: "v1",
    }, { orderId: "environment-order", subjectHash, chatId: 8685416510 });
    const recipient = sqlite.prepare(`SELECT bot_config_id FROM shop_telegram_recipients
      WHERE subject_hash = ? AND customer_id = ?`).get(subjectHash, customerId);
    assert.equal(recipient.bot_config_id, "environment");
  } finally {
    sqlite.close();
  }
});

test("Telegram Mini App accepts active/previous credentials, rejects hint mismatch, and fails closed", async () => {
  const { verifyTelegramMiniAppInitData } = await import("../src/lib/shop/telegram-mini-auth.ts");
  const tokens = {
    active: `111111111:${"A".repeat(32)}`,
    previous: `222222222:${"B".repeat(32)}`,
    legacy: `333333333:${"C".repeat(32)}`,
  };
  let registryCount = 2;
  let registryFails = false;
  let candidatesFail = false;
  const credentials = [
    { configId: "bot-config-active", token: tokens.active, status: "active", version: 8, authRevision: 2, username: "activebot" },
    { configId: "bot-config-previous", token: tokens.previous, status: "previous", version: 11, authRevision: 4, username: "previousbot" },
  ];
  const env = {
    CONTENT_DB: {
      prepare() {
        return {
          async first() {
            if (registryFails) throw new Error("synthetic_d1_failure");
            return { count: registryCount };
          },
        };
      },
    },
    TELEGRAM_TOKEN_ENCRYPTION_SECRET: "configured",
    TELEGRAM_BOT_TOKEN: tokens.legacy,
  };
  const auth = await loadMiniRouteAuth({
    env,
    verifyTelegramMiniAppInitData,
    async listTelegramBotCredentials() {
      if (candidatesFail) throw new Error("synthetic_decrypt_failure");
      return credentials;
    },
  });

  const active = await auth.verifyMiniAppIdentity(signedInitData(tokens.active, 101), new Request("https://tung.codes/session"));
  assert.deepEqual(
    { ok: active.ok, bot: active.botConfigId, revision: active.botVersion },
    { ok: true, bot: "bot-config-active", revision: 2 },
  );
  const previous = await auth.verifyMiniAppIdentity(signedInitData(tokens.previous, 202), new Request("https://tung.codes/session"));
  assert.deepEqual(
    { ok: previous.ok, bot: previous.botConfigId, revision: previous.botVersion },
    { ok: true, bot: "bot-config-previous", revision: 4 },
  );
  const mismatchedHint = await auth.verifyMiniAppIdentity(signedInitData(tokens.previous, 303), new Request("https://tung.codes/session", {
    headers: { "x-telegram-bot-config": "bot-config-active" },
  }));
  assert.deepEqual(mismatchedHint, {
    ok: false,
    code: "telegram_bot_context_invalid",
    nextBotUsername: "activebot",
    nextBotUrl: "https://t.me/activebot",
  });

  candidatesFail = true;
  const unavailable = await auth.verifyMiniAppIdentity(signedInitData(tokens.legacy, 404), new Request("https://tung.codes/session"));
  assert.deepEqual(unavailable, { ok: false, code: "telegram_registry_unavailable" });
  candidatesFail = false;
  registryFails = true;
  const d1Unavailable = await auth.verifyMiniAppIdentity(signedInitData(tokens.legacy, 505), new Request("https://tung.codes/session"));
  assert.deepEqual(d1Unavailable, { ok: false, code: "telegram_registry_unavailable" });
  registryFails = false;
  registryCount = 0;
  credentials.splice(0);
  const legacy = await auth.verifyMiniAppIdentity(signedInitData(tokens.legacy, 606), new Request("https://tung.codes/session"));
  assert.deepEqual(
    { ok: legacy.ok, bot: legacy.botConfigId, revision: legacy.botVersion },
    { ok: true, bot: "environment", revision: 1 },
  );
  let sessionRow = {
    auth_revision: 4,
    status: "previous",
    previous_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  env.CONTENT_DB = {
    prepare() {
      const prepared = {
        bind() { return prepared; },
        async first() { return sessionRow; },
      };
      return prepared;
    },
  };
  assert.equal(await auth.telegramSessionBotValid({ botConfigId: "bot-config-previous", botVersion: 4 }), true);
  sessionRow = { ...sessionRow, previous_expires_at: new Date(Date.now() - 1_000).toISOString() };
  assert.equal(await auth.telegramSessionBotValid({ botConfigId: "bot-config-previous", botVersion: 4 }), false);
  sessionRow = { ...sessionRow, previous_expires_at: new Date(Date.now() + 60_000).toISOString(), auth_revision: 5 };
  assert.equal(await auth.telegramSessionBotValid({ botConfigId: "bot-config-previous", botVersion: 4 }), false);
  delete globalThis.__telegramMiniRouteRuntime;
});

test("Telegram registry routing fails closed and verifies active/previous bot context", () => {
  const webhook = read("src/pages/api/telegram/webhook.ts");
  const miniApi = read("src/pages/api/shop/telegram-mini/[...path].ts");
  const outbox = read("src/lib/shop/telegram-outbox.ts");
  const repository = read("src/lib/shop/repository.ts");
  const service = read("src/lib/shop/service.ts");
  const commerce = read("src/lib/shop/telegram-commerce.ts");

  assert.doesNotMatch(webhook, /registryActive[\s\S]{0,240}\.catch\(\(\) => null\)[\s\S]{0,240}!registryActive/);
  assert.doesNotMatch(miniApi, /shop_telegram_bot_configs[\s\S]{0,220}\.catch\(\(\) => \(\{ count: 0 \}\)\)/);
  assert.doesNotMatch(miniApi, /status = 'active' LIMIT 1[\s\S]{0,180}\.catch\(\(\) => null\)[\s\S]{0,100}return !active/);
  assert.match(miniApi, /const ordered = hint[\s\S]{0,180}\(candidates \|\| \[\]\);/);
  assert.match(miniApi, /filter\(\(candidate\) => candidate\.configId === hint\)/);
  assert.match(miniApi, /row\.auth_revision !== session\.botVersion/);
  assert.match(outbox, /ON CONFLICT\(subject_hash, customer_id, bot_config_id\) DO UPDATE/);
  // Bot scope is part of the checkout transaction itself. A post-commit
  // UPDATE can leave an environment-scoped order if the worker crashes.
  assert.match(repository, /telegram_bot_config_id/);
  assert.doesNotMatch(service, /UPDATE shop_orders SET telegram_bot_config_id/);
  // Never truncate caller-controlled idempotency keys; hash them into a
  // bounded digest so distinct keys cannot collide at the 200-byte boundary.
  assert.match(commerce, /sha256Base64Url\(suppliedIdempotency\)/);
  assert.doesNotMatch(commerce, /suppliedIdempotency\}\`\.slice\(0, 200\)/);
});
