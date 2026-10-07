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

async function loadLegacyGuard() {
  return import(dataModule(compile(read("src/lib/shop/telegram-legacy-config.ts"))));
}

function createD1(status) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE shop_telegram_bot_configs (status TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'legacy')");
  if (status) sqlite.prepare("INSERT INTO shop_telegram_bot_configs (status) VALUES (?)").run(status);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      const prepared = {
        bind(...values) { bindings = values; return prepared; },
        async first() { return statement.get(...bindings) ?? null; },
      };
      return prepared;
    },
  };
  return { db, sqlite };
}

test("legacy Telegram configure makes zero remote calls for every registry-owned lifecycle state", async () => {
  const { configureLegacyTelegramBotSafely } = await loadLegacyGuard();
  for (const status of ["standby", "activating", "active", "previous", "retiring", "error"]) {
    const { db, sqlite } = createD1(status);
    let configureCalls = 0;
    try {
      const result = await configureLegacyTelegramBotSafely(db, async () => {
        configureCalls += 1;
        return { configured: true };
      });
      assert.deepEqual(result, { ok: false, code: "telegram_legacy_config_disabled" });
      assert.equal(configureCalls, 0, `${status} must block before a Telegram mutation`);
    } finally {
      sqlite.close();
    }
  }
});

test("legacy Telegram configure remains available only with no reusable registry credential", async () => {
  const { configureLegacyTelegramBotSafely } = await loadLegacyGuard();
  for (const status of [null, "revoked"]) {
    const { db, sqlite } = createD1(status);
    let configureCalls = 0;
    try {
      const result = await configureLegacyTelegramBotSafely(db, async () => {
        configureCalls += 1;
        return { commandsConfigured: true };
      });
      assert.deepEqual(result, { ok: true, value: { commandsConfigured: true } });
      assert.equal(configureCalls, 1);
    } finally {
      sqlite.close();
    }
  }
});
