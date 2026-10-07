import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

async function loadTelegramBotRegistry() {
  const cryptoModule = dataModule(`
    export const randomOpaqueToken = (bytes = 32) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
    export const sha256Base64Url = async (value) => Buffer.from(await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value)).toString("base64url");
  `);
  // Registry flows never render commerce menus — stub the one symbol telegram.ts imports.
  const commerceStubModule = dataModule(`export const menuKeyboard = () => ({ inline_keyboard: [] });`);
  const telegramSource = compile(read("src/lib/shop/telegram.ts"))
    .replace(/from\s+["']\.\/crypto["']/, `from ${JSON.stringify(cryptoModule)}`)
    .replace(/from\s+["']\.\/telegram-commerce["']/, `from ${JSON.stringify(commerceStubModule)}`);
  const telegramModule = dataModule(telegramSource);
  const registrySource = compile(read("src/lib/shop/telegram-bot-config.ts"))
    .replace(/from\s+["']\.\/crypto["']/, `from ${JSON.stringify(cryptoModule)}`)
    .replace(/from\s+["']\.\/telegram["']/, `from ${JSON.stringify(telegramModule)}`);
  return import(dataModule(registrySource));
}

function createRegistryD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("content-migrations/0037_shop_telegram_bot_registry.sql"));
  sqlite.exec(read("content-migrations/0044_shop_telegram_bot_scopes.sql"));
  sqlite.exec(read("content-migrations/0040_shop_telegram_bot_auth_revision.sql"));
  // The activation flow reads the Vietnam Mini App switch from site_state.
  sqlite.exec("CREATE TABLE IF NOT EXISTS site_state (id TEXT PRIMARY KEY, config_json TEXT NOT NULL)");
  sqlite.prepare("INSERT OR REPLACE INTO site_state (id, config_json) VALUES ('default', ?)")
    .run(JSON.stringify({ telegramMiniAppEnabled: true }));
  let firstInterceptor = null;
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() {
          const row = statement.get(...bindings) ?? null;
          if (firstInterceptor) await firstInterceptor({ sql, bindings, row, sqlite });
          return row;
        },
        async all() { return { results: statement.all(...bindings) }; },
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
  currentRegistryDb = db;
  return { db, sqlite, setFirstInterceptor: (interceptor) => { firstInterceptor = interceptor; } };
}

const botFixtures = {
  alpha: {
    id: 111111111,
    token: `111111111:${"A".repeat(32)}`,
    username: "alpha_store_bot",
    firstName: "Alpha Store",
  },
  beta: {
    id: 222222222,
    token: `222222222:${"B".repeat(32)}`,
    username: "beta_store_bot",
    firstName: "Beta Store",
  },
  gamma: {
    id: 333333333,
    token: `333333333:${"C".repeat(32)}`,
    username: "gamma_store_bot",
    firstName: "Gamma Store",
  },
};

function installTelegramApiMock({ fail } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const match = new URL(String(input)).pathname.match(/^\/bot(.+)\/([^/]+)$/);
    assert.ok(match, `unexpected Telegram URL: ${input}`);
    const [, token, method] = match;
    const payload = JSON.parse(String(init?.body ?? "{}"));
    const fixture = Object.values(botFixtures).find((candidate) => candidate.token === token);
    assert.ok(fixture, "unknown test token");
    calls.push({ token, method, payload });
    if (fail?.({ token, method, payload, calls })) {
      return new Response(JSON.stringify({ ok: false, error_code: 502, description: "synthetic failure" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
    const result = method === "getMe"
      ? { id: fixture.id, first_name: fixture.firstName, username: fixture.username }
      : method === "getWebhookInfo"
        ? { url: "", pending_update_count: 0 }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

const registryBindings = {
  SHOP_PUBLIC_ORIGIN: "https://tung.codes",
  TELEGRAM_TOKEN_ENCRYPTION_SECRET: Buffer.alloc(32, 0x5a).toString("base64url"),
  TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
  // Filled per-test with the fake D1 so activation sees the Mini App switch.
  get CONTENT_DB() { return currentRegistryDb; },
};
let currentRegistryDb = undefined;

const legacyRegistryBindings = {
  ...registryBindings,
  TELEGRAM_BOT_TOKEN: botFixtures.alpha.token,
};

async function registerBot(registry, db, fixture, label) {
  return registry.createTelegramBotConfig(db, registryBindings, { token: fixture.token, label }, "owner@example.com", crypto.randomUUID());
}

test("Telegram registry persists encrypted credentials and a bounded rollback state", () => {
  const migration = read("content-migrations/0037_shop_telegram_bot_registry.sql");
  assert.match(migration, /token_ciphertext_b64 TEXT/);
  assert.match(migration, /webhook_secret_ciphertext_b64 TEXT/);
  assert.match(migration, /token_fingerprint TEXT NOT NULL/);
  assert.match(migration, /status IN \('standby', 'activating', 'active', 'previous', 'retiring', 'error', 'revoked'\)/);
  assert.match(migration, /uq_shop_telegram_bot_active/);
  assert.match(migration, /uq_shop_telegram_bot_previous/);
  assert.doesNotMatch(migration, /token_plaintext|webhook_secret_plaintext/);
});

test("Telegram bot auth revisions are added by a forward migration", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(read("content-migrations/0037_shop_telegram_bot_registry.sql"));
    const before = new Set(sqlite.prepare("PRAGMA table_info(shop_telegram_bot_configs)").all().map((column) => column.name));
    assert.equal(before.has("auth_revision"), false);

    sqlite.exec(read("content-migrations/0040_shop_telegram_bot_auth_revision.sql"));
    const after = sqlite.prepare("PRAGMA table_info(shop_telegram_bot_configs)").all();
    const authRevision = after.find((column) => column.name === "auth_revision");
    assert.equal(authRevision?.notnull, 1);
    assert.equal(authRevision?.dflt_value, "1");
  } finally {
    sqlite.close();
  }
});

test("Telegram token encryption root is a Worker secret, not a Wrangler variable", () => {
  const bindings = read("src/cloudflare.d.ts");
  const wrangler = read("wrangler.jsonc");
  assert.match(bindings, /TELEGRAM_TOKEN_ENCRYPTION_SECRET\?: string/);
  assert.match(wrangler, /"TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION"\s*:\s*"v1"/);
  assert.doesNotMatch(wrangler, /"TELEGRAM_TOKEN_ENCRYPTION_SECRET"\s*:/);
});

test("admin bot registry never returns credentials and uses optimistic activation", () => {
  const integrations = read("src/lib/admin/router/shop/integrations.ts");
  const registry = read("src/lib/shop/telegram-bot-config.ts");
  assert.match(integrations, /segments\[2\] === "bots"/);
  assert.match(integrations, /segments\[4\] === "activate"/);
  assert.match(integrations, /segments\[4\] === "rollback"/);
  assert.match(integrations, /segments\[4\] === "rewrap"/);
  assert.match(integrations, /segments\[4\] === "revoke"/);
  assert.match(integrations, /parseExpectedVersion/);
  assert.match(registry, /status = 'activating'.*version = version \+ 1/s);
  assert.match(registry, /status = 'previous'.*previous_expires_at = \?/s);
  assert.match(registry, /rollbackTelegramBotConfig/);
  const summaryStart = registry.indexOf("function summary(");
  const summaryEnd = registry.indexOf("function encryptionConfigured", summaryStart);
  const summary = registry.slice(summaryStart, summaryEnd);
  assert.doesNotMatch(summary, /token_ciphertext_b64|webhook_secret_ciphertext_b64|webhookSecret|token:/);
});

test("webhook routing enforces previous expiry and activation compensates remotely", () => {
  const registry = read("src/lib/shop/telegram-bot-config.ts");
  assert.match(registry, /status = 'previous' AND previous_expires_at > \?/);
  assert.match(registry, /"deleteWebhook"/);
  assert.match(registry, /drop_pending_updates: false/);
  assert.match(registry, /crypto\.subtle\.digest\("SHA-256"/);
});

test("admin audit correlation id cannot be injected by the caller", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  assert.match(entry, /const id = crypto\.randomUUID\(\)/);
  assert.match(entry, /handleAdminRequest\(context, id\)/);
  assert.doesNotMatch(entry, /request\.headers\.get\("x-request-id"\)/);
  assert.doesNotMatch(entry, /new Request\(context\.request, \{ headers \}\)/);
});

test("Telegram registry encrypts credentials, round-trips them, and rejects ciphertext or AAD tampering", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const created = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const row = sqlite.prepare("SELECT * FROM shop_telegram_bot_configs WHERE id = ?").get(created.id);
    const events = sqlite.prepare("SELECT * FROM shop_telegram_bot_events WHERE bot_config_id = ?").all(created.id);
    const stored = JSON.stringify({ row, events });
    assert.equal(stored.includes(botFixtures.alpha.token), false);
    assert.notEqual(row.token_ciphertext_b64, botFixtures.alpha.token);
    assert.equal(row.token_iv_b64.length, 16);
    assert.equal(row.webhook_secret_iv_b64.length, 16);

    const credential = await registry.getTelegramBotCredential(db, registryBindings, created.id);
    assert.equal(credential?.token, botFixtures.alpha.token);
    assert.match(credential?.webhookSecret ?? "", /^[A-Za-z0-9_-]{43}$/);

    const publicView = await registry.listTelegramBotConfigs(db, registryBindings);
    const publicJson = JSON.stringify(publicView);
    for (const secret of [botFixtures.alpha.token, credential.webhookSecret, row.token_ciphertext_b64, row.token_iv_b64, row.webhook_secret_ciphertext_b64, row.webhook_secret_iv_b64]) {
      assert.equal(publicJson.includes(secret), false);
    }

    const tamperedCiphertext = `${row.token_ciphertext_b64.startsWith("A") ? "B" : "A"}${row.token_ciphertext_b64.slice(1)}`;
    sqlite.prepare("UPDATE shop_telegram_bot_configs SET token_ciphertext_b64 = ? WHERE id = ?").run(tamperedCiphertext, created.id);
    assert.equal(await registry.getTelegramBotCredential(db, registryBindings, created.id), null);

    sqlite.prepare("UPDATE shop_telegram_bot_configs SET token_ciphertext_b64 = ?, telegram_bot_id = ? WHERE id = ?")
      .run(row.token_ciphertext_b64, "111111112", created.id);
    assert.equal(await registry.getTelegramBotCredential(db, registryBindings, created.id), null);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("Telegram registry dual-reads an old root and rewraps credentials to the current key", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const created = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const before = sqlite.prepare(`SELECT key_version, token_ciphertext_b64,
        webhook_secret_ciphertext_b64, version
      FROM shop_telegram_bot_configs WHERE id = ?`).get(created.id);
    const v2Bindings = {
      ...registryBindings,
      TELEGRAM_TOKEN_ENCRYPTION_SECRET: Buffer.alloc(32, 0x6b).toString("base64url"),
      TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: "v2",
      TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
        v1: registryBindings.TELEGRAM_TOKEN_ENCRYPTION_SECRET,
      }),
    };

    const oldCredential = await registry.getTelegramBotCredential(db, v2Bindings, created.id);
    assert.equal(oldCredential?.token, botFixtures.alpha.token);
    const rewrapped = await registry.rewrapTelegramBotConfigSecrets(
      db,
      v2Bindings,
      created.id,
      created.version,
      "owner@example.com",
      crypto.randomUUID(),
    );
    assert.equal(rewrapped.version, created.version + 1);

    const after = sqlite.prepare(`SELECT key_version, token_ciphertext_b64,
        webhook_secret_ciphertext_b64, version
      FROM shop_telegram_bot_configs WHERE id = ?`).get(created.id);
    assert.equal(after.key_version, "v2");
    assert.notEqual(after.token_ciphertext_b64, before.token_ciphertext_b64);
    assert.notEqual(after.webhook_secret_ciphertext_b64, before.webhook_secret_ciphertext_b64);
    assert.equal(after.version, before.version + 1);
    assert.equal((await registry.getTelegramBotCredential(db, {
      ...v2Bindings,
      TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: undefined,
    }, created.id))?.token, botFixtures.alpha.token);
    assert.equal(await registry.getTelegramBotCredential(db, registryBindings, created.id), null);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM shop_telegram_bot_events
      WHERE bot_config_id = ? AND action = 'credentials_rewrapped' AND outcome = 'success'`).get(created.id).count, 1);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("Telegram registry activates A then B and rolls back to the retained previous bot", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");

    const activeAlpha = await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());
    assert.equal(activeAlpha.status, "active");

    // Stored URLs are display metadata only and must not control Bot API mutations.
    sqlite.prepare("UPDATE shop_telegram_bot_configs SET webhook_url = 'https://evil.example/hook', mini_app_url = 'https://evil.example/app' WHERE id = ?").run(beta.id);
    const activeBeta = await registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(activeBeta.status, "active");
    const alphaPrevious = sqlite.prepare("SELECT status, previous_expires_at FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id);
    assert.equal(alphaPrevious.status, "previous");
    assert.ok(Date.parse(alphaPrevious.previous_expires_at) > Date.now());

    const betaWebhook = telegramApi.calls.findLast((call) => call.token === botFixtures.beta.token && call.method === "setWebhook");
    const betaMenu = telegramApi.calls.findLast((call) => call.token === botFixtures.beta.token && call.method === "setChatMenuButton");
    assert.equal(betaWebhook.payload.url, `https://tung.codes/api/telegram/webhook?bot=${beta.id}`);
    assert.equal(betaMenu.payload.menu_button.web_app.url, `https://tung.codes/telegram/shop?bot=${beta.id}`);

    const rolledBack = await registry.rollbackTelegramBotConfig(db, registryBindings, beta.id, activeBeta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(rolledBack.id, alpha.id);
    assert.equal(rolledBack.status, "active");
    assert.deepEqual(
      sqlite.prepare("SELECT id, status FROM shop_telegram_bot_configs ORDER BY status, id").all().map((row) => ({ ...row })),
      [{ id: alpha.id, status: "active" }, { id: beta.id, status: "previous" }],
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_telegram_bot_events WHERE action = 'rolled_back' AND outcome = 'success'").get().count, 1);

    sqlite.prepare("UPDATE shop_telegram_bot_configs SET previous_expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", beta.id);
    const callsBeforeExpiredRollback = telegramApi.calls.length;
    await assert.rejects(
      registry.rollbackTelegramBotConfig(db, registryBindings, alpha.id, rolledBack.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_previous_unavailable",
    );
    assert.equal(telegramApi.calls.length, callsBeforeExpiredRollback);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("rotating a third bot retires the displaced previous webhook immediately", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    const gamma = await registerBot(registry, db, botFixtures.gamma, "Gamma");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());
    await registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    telegramApi.calls.length = 0;

    const activeGamma = await registry.activateTelegramBotConfig(db, registryBindings, gamma.id, gamma.version, "owner@example.com", crypto.randomUUID());

    assert.equal(activeGamma.status, "active");
    const states = new Map(sqlite.prepare("SELECT id, status FROM shop_telegram_bot_configs").all().map((row) => [row.id, row.status]));
    assert.equal(states.get(alpha.id), "standby");
    assert.equal(states.get(beta.id), "previous");
    assert.equal(states.get(gamma.id), "active");
    assert.equal(telegramApi.calls.filter((call) => call.token === botFixtures.alpha.token && call.method === "deleteWebhook").length, 1);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("first registry activation removes the legacy environment webhook", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    const active = await registry.activateTelegramBotConfig(db, legacyRegistryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(active.status, "active");
    assert.equal(telegramApi.calls.filter((call) => call.token === botFixtures.alpha.token && call.method === "deleteWebhook").length, 1);
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).last_error_code, null);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("legacy webhook cleanup marker retries after a transient Telegram failure", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  let failLegacyDelete = true;
  const telegramApi = installTelegramApiMock({
    fail: ({ token, method }) => failLegacyDelete && token === botFixtures.alpha.token && method === "deleteWebhook",
  });
  try {
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    const active = await registry.activateTelegramBotConfig(db, legacyRegistryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(active.lastErrorCode, "telegram_legacy_webhook_cleanup_failed");
    failLegacyDelete = false;
    const retry = await registry.retireLegacyEnvironmentTelegramWebhook(db, legacyRegistryBindings);
    assert.deepEqual(retry, { examined: 1, retired: 1, failed: 0, skipped: 0 });
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).last_error_code, null);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("expired previous bot webhook is retired by bounded maintenance", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());
    await registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    sqlite.prepare("UPDATE shop_telegram_bot_configs SET previous_expires_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", alpha.id);
    telegramApi.calls.length = 0;

    const result = await registry.retireExpiredTelegramPreviousBots(db, registryBindings, 2);

    assert.deepEqual(result, { examined: 1, retired: 1, failed: 0, skipped: 0 });
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status, previous_expires_at, last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id) },
      { status: "standby", previous_expires_at: null, last_error_code: null },
    );
    assert.equal(telegramApi.calls.length, 1);
    assert.deepEqual(
      { token: telegramApi.calls[0].token, method: telegramApi.calls[0].method, payload: telegramApi.calls[0].payload },
      { token: botFixtures.alpha.token, method: "deleteWebhook", payload: { drop_pending_updates: false } },
    );
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_telegram_bot_events WHERE bot_config_id = ? AND action = 'previous_retired' AND outcome = 'success'").get(alpha.id).count, 1);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("concurrent candidate activations are serialized with one deterministic conflict", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    const results = await Promise.allSettled([
      registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner-a@example.com", crypto.randomUUID()),
      registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner-b@example.com", crypto.randomUUID()),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(rejected.reason?.code, "telegram_bot_activation_in_progress");
    assert.equal(telegramApi.calls.filter((call) => call.method === "setWebhook").length, 1);
    const rows = sqlite.prepare("SELECT id, status FROM shop_telegram_bot_configs ORDER BY id").all();
    assert.equal(rows.filter((row) => row.status === "active").length, 1);
    assert.equal(rows.filter((row) => row.status === "standby").length, 1);
    assert.equal(rows.filter((row) => row.status === "previous").length, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM shop_telegram_bot_events WHERE action = 'activated' AND outcome = 'success'").get().count, 1);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("failed candidate activation preserves the old active bot and deletes the candidate webhook", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  let failBetaWebhook = false;
  const telegramApi = installTelegramApiMock({
    fail: ({ token, method }) => failBetaWebhook && token === botFixtures.beta.token && method === "setWebhook",
  });
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());

    failBetaWebhook = true;
    await assert.rejects(
      registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_api_502",
    );
    const rows = sqlite.prepare("SELECT id, status, last_error_code FROM shop_telegram_bot_configs ORDER BY id").all();
    assert.equal(rows.find((row) => row.id === alpha.id).status, "active");
    assert.deepEqual(
      { status: rows.find((row) => row.id === beta.id).status, code: rows.find((row) => row.id === beta.id).last_error_code },
      { status: "error", code: "telegram_api_502" },
    );
    const betaMethods = telegramApi.calls.filter((call) => call.token === botFixtures.beta.token).map((call) => call.method);
    assert.ok(betaMethods.includes("setWebhook"));
    assert.equal(betaMethods.at(-1), "deleteWebhook");
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("stale registry versions fail before any Telegram API mutation", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    telegramApi.calls.length = 0;
    await assert.rejects(
      registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version + 1, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_version_conflict",
    );
    await assert.rejects(
      registry.revokeTelegramBotConfig(db, registryBindings, beta.id, beta.version + 1, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_version_conflict",
    );
    assert.equal(telegramApi.calls.length, 0);
    const persisted = sqlite.prepare("SELECT status, version FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id);
    assert.equal(persisted.status, "standby");
    assert.equal(persisted.version, beta.version);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("revoke losing a compare-and-swap race never deletes the newly active webhook", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite, setFirstInterceptor } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    telegramApi.calls.length = 0;
    let raced = false;
    setFirstInterceptor(({ sql, bindings, row }) => {
      if (raced || !row || !sql.includes("SELECT * FROM shop_telegram_bot_configs WHERE id = ?")) return;
      if (bindings[0] !== beta.id) return;
      raced = true;
      sqlite.prepare("UPDATE shop_telegram_bot_configs SET status = 'active', version = version + 1 WHERE id = ?").run(beta.id);
    });

    await assert.rejects(
      registry.revokeTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_version_conflict",
    );
    assert.equal(raced, true);
    assert.equal(telegramApi.calls.length, 0);
    const persisted = sqlite.prepare("SELECT status, version, token_ciphertext_b64 FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id);
    assert.equal(persisted.status, "active");
    assert.equal(persisted.version, beta.version + 1);
    assert.ok(persisted.token_ciphertext_b64);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("stale activating leases are recovered without blocking a later rotation", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    const gamma = await registerBot(registry, db, botFixtures.gamma, "Gamma");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());

    const betaVersion = beta.version + 1;
    sqlite.prepare(`UPDATE shop_telegram_bot_configs SET status = 'activating', version = ?,
      updated_at = ?, updated_by = 'crashed-request' WHERE id = ?`).run(
      betaVersion,
      "2000-01-01T00:00:00.000Z",
      beta.id,
    );
    telegramApi.calls.length = 0;

    const recovered = await registry.retireExpiredTelegramPreviousBots(db, registryBindings, 2);
    assert.deepEqual(recovered, { examined: 1, retired: 1, failed: 0, skipped: 0 });
    const recoveredBeta = sqlite.prepare("SELECT status, last_error_code, token_ciphertext_b64 FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id);
    assert.equal(recoveredBeta.status, "error");
    assert.equal(recoveredBeta.last_error_code, "telegram_bot_activation_lease_expired");
    assert.ok(recoveredBeta.token_ciphertext_b64);
    assert.equal(telegramApi.calls.filter((call) => call.token === botFixtures.beta.token && call.method === "deleteWebhook").length, 1);

    const activeGamma = await registry.activateTelegramBotConfig(db, registryBindings, gamma.id, gamma.version, "owner@example.com", crypto.randomUUID());
    assert.equal(activeGamma.status, "active");
    assert.equal(sqlite.prepare("SELECT status FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id).status, "previous");
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("activation commit is fenced when maintenance reclaims the candidate lease", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  let reclaimed = false;
  const telegramApi = installTelegramApiMock({
    fail: ({ token, method }) => {
      if (reclaimed || token !== botFixtures.beta.token || method !== "setWebhook") return false;
      reclaimed = true;
      sqlite.prepare(`UPDATE shop_telegram_bot_configs SET status = 'retiring',
        last_error_code = 'telegram_activation_recovery_pending', version = version + 1,
        updated_at = '2020-01-01T00:00:00.000Z' WHERE telegram_bot_id = ?`).run("222222222");
      return false;
    },
  });
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());

    await assert.rejects(
      registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_activation_lease_lost",
    );
    assert.equal(reclaimed, true);
    assert.equal(sqlite.prepare("SELECT status FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id).status, "active");
    assert.equal(sqlite.prepare("SELECT status FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).status, "retiring");
    const betaMethods = telegramApi.calls.filter((call) => call.token === botFixtures.beta.token).map((call) => call.method);
    assert.equal(betaMethods.at(-1), "deleteWebhook");
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("revoke retains encrypted credentials and retries cleanup after Telegram failure", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  let failDelete = true;
  const telegramApi = installTelegramApiMock({
    fail: ({ token, method }) => failDelete && token === botFixtures.alpha.token && method === "deleteWebhook",
  });
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, registryBindings, alpha.id, alpha.version, "owner@example.com", crypto.randomUUID());
    const activeBeta = await registry.activateTelegramBotConfig(db, registryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    const previousAlpha = sqlite.prepare("SELECT version FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id);
    telegramApi.calls.length = 0;

    await assert.rejects(
      registry.revokeTelegramBotConfig(db, registryBindings, beta.id, activeBeta.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_active_bot_requires_switch",
    );
    assert.equal(telegramApi.calls.length, 0);
    await assert.rejects(
      registry.revokeTelegramBotConfig(db, registryBindings, alpha.id, previousAlpha.version, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_api_502",
    );
    const failed = sqlite.prepare("SELECT status, last_error_code, token_ciphertext_b64 FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id);
    assert.equal(failed.status, "retiring");
    assert.equal(failed.last_error_code, "telegram_bot_revoke_cleanup_failed");
    assert.ok(failed.token_ciphertext_b64);

    const callsBeforeTest = telegramApi.calls.length;
    await assert.rejects(
      registry.testTelegramBotConfig(db, registryBindings, alpha.id, "owner@example.com", crypto.randomUUID()),
      (error) => error instanceof registry.TelegramBotConfigError && error.code === "telegram_bot_operation_in_progress",
    );
    assert.equal(telegramApi.calls.length, callsBeforeTest);
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id).last_error_code, "telegram_bot_revoke_cleanup_failed");

    failDelete = false;
    sqlite.prepare("UPDATE shop_telegram_bot_configs SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(alpha.id);
    const retried = await registry.retireExpiredTelegramPreviousBots(db, registryBindings, 2);
    assert.deepEqual(retried, { examined: 1, retired: 1, failed: 0, skipped: 0 });
    const revoked = sqlite.prepare("SELECT status, token_ciphertext_b64, webhook_secret_ciphertext_b64 FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id);
    assert.deepEqual({ status: revoked.status, token: revoked.token_ciphertext_b64, webhook: revoked.webhook_secret_ciphertext_b64 }, { status: "revoked", token: null, webhook: null });
    assert.equal(sqlite.prepare("SELECT status FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).status, "active");
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("standby registry rows do not suppress legacy webhook cleanup", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  const telegramApi = installTelegramApiMock();
  try {
    const alpha = await registerBot(registry, db, botFixtures.alpha, "Alpha");
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, legacyRegistryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(sqlite.prepare("SELECT status FROM shop_telegram_bot_configs WHERE id = ?").get(alpha.id).status, "standby");
    assert.equal(telegramApi.calls.filter((call) => call.token === botFixtures.alpha.token && call.method === "deleteWebhook").length, 1);
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("connection checks preserve a pending legacy webhook cleanup marker", async () => {
  const registry = await loadTelegramBotRegistry();
  const { db, sqlite } = createRegistryD1();
  let failLegacyDelete = true;
  let failWebhookInfo = false;
  const telegramApi = installTelegramApiMock({
    fail: ({ token, method }) => {
      if (failLegacyDelete && token === botFixtures.alpha.token && method === "deleteWebhook") return true;
      if (failWebhookInfo && token === botFixtures.beta.token && method === "getWebhookInfo") return true;
      return false;
    },
  });
  try {
    const beta = await registerBot(registry, db, botFixtures.beta, "Beta");
    await registry.activateTelegramBotConfig(db, legacyRegistryBindings, beta.id, beta.version, "owner@example.com", crypto.randomUUID());
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).last_error_code, "telegram_legacy_webhook_cleanup_failed");

    await registry.testTelegramBotConfig(db, legacyRegistryBindings, beta.id, "owner@example.com", crypto.randomUUID());
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).last_error_code, "telegram_legacy_webhook_cleanup_failed");

    failWebhookInfo = true;
    await assert.rejects(registry.testTelegramBotConfig(db, legacyRegistryBindings, beta.id, "owner@example.com", crypto.randomUUID()));
    assert.equal(sqlite.prepare("SELECT last_error_code FROM shop_telegram_bot_configs WHERE id = ?").get(beta.id).last_error_code, "telegram_legacy_webhook_cleanup_failed");
    failLegacyDelete = false;
  } finally {
    telegramApi.restore();
    sqlite.close();
  }
});

test("Telegram registry admin routes remain behind Access, password session, and CSRF gates", () => {
  const entry = read("src/pages/admin/api/[...path].ts");
  const integrations = read("src/lib/admin/router/shop/integrations.ts");
  const shared = read("src/lib/admin/router/shop/shared.ts");
  const accessGate = entry.indexOf("await verifyCloudflareAccess(request, bindings)");
  const csrfGate = entry.indexOf("verifyMutationRequest(request)");
  const passwordGate = entry.indexOf("await getAdminSession(db, bindings, request, auth.user)", csrfGate);
  const registryRoutes = integrations.indexOf('resource === "telegram" && segments[2] === "bots"');
  assert.ok(accessGate >= 0 && accessGate < csrfGate);
  assert.ok(csrfGate < passwordGate, "password session must follow CSRF in the entry");
  assert.ok(registryRoutes >= 0, "registry dispatch must exist in the integrations module");
  const registryBlock = integrations.slice(
    integrations.indexOf("async function handleTelegramBots"),
    integrations.indexOf("async function handleTelegram("),
  );
  assert.match(shared, /const ADMIN_RECENT_AUTH_WINDOW_MS = 30 \* 60 \* 1_000/);
  assert.match(shared, /age < 0 \|\| age > ADMIN_RECENT_AUTH_WINDOW_MS/);
  assert.equal((registryBlock.match(/recentAdminAuthError\(session\)/g) ?? []).length, 4);
  assert.ok(
    registryBlock.indexOf("recentAdminAuthError(session)") < registryBlock.indexOf("parseTelegramBotInput(payload)"),
    "credential persistence must reject stale sessions before parsing the token payload",
  );
  assert.doesNotMatch(registryBlock, /token_ciphertext_b64|token_iv_b64|webhook_secret_ciphertext_b64|webhook_secret_iv_b64|webhookSecret/);

  const legacyStart = integrations.indexOf('if (action === "configure" && method === "POST" && configurePath)');
  const legacyEnd = integrations.indexOf('return adminError("method_not_allowed", 405);', legacyStart);
  const legacyBlock = integrations.slice(legacyStart, legacyEnd);
  assert.ok(legacyStart >= 0 && legacyEnd > legacyStart);
  assert.ok(legacyBlock.indexOf("recentAdminAuthError(session)") < legacyBlock.indexOf("configureLegacyTelegramBotSafely"));
  assert.ok(legacyBlock.indexOf("configureLegacyTelegramBotSafely") < legacyBlock.indexOf("configureTelegramBot(bindings)"));
});
