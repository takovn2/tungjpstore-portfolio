import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

async function bundleShop() {
  const result = await build({
    entryPoints: [`${projectRoot}/src/lib/shop/index.ts`],
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of [
    "0001_content_cms.sql",
    "0009_shop_core.sql",
    "0011_payos_payment_link_fields.sql",
    "0012_payos_reconciliation_guards.sql",
    "0025_payos_dynamic_accounts.sql",
    "0036_payos_telegram_recovery_leases.sql",
  ]) {
    sqlite.exec(read(`content-migrations/${migration}`));
  }
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

test("Telegram payment recovery uses one cross-request lease", async () => {
  const shop = await bundleShop();
  const { db, sqlite } = createD1();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const customerId = "telegram-recovery-customer";
  const orderId = "telegram-recovery-order";
  const attemptId = "telegram-recovery-attempt";
  const providerId = "telegram-recovery-provider";
  const paymentLinkId = "telegram-recovery-link-0001";
  const accountNumber = "0123456789012";
  const description = "TGQR0001";

  sqlite.prepare(`INSERT INTO shop_customers
    (id, email_normalized, email_masked, display_name, locale, created_at, updated_at)
    VALUES (?, ?, ?, 'Telegram Buyer', 'vi', ?, ?)`).run(
    customerId,
    "tg-recovery@telegram.tungjpstore.local",
    "t***@telegram.tungjpstore.local",
    now,
    now,
  );
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, customer_id, source_channel, locale,
      status, payment_status, fulfillment_status, currency, subtotal_minor, discount_minor,
      tax_minor, total_minor, expires_at, created_at, updated_at)
    VALUES (?, 'TG-RECOVERY-1', 'TUNG-TG-RECOVERY-1', 'telegram-recovery-token-hash', ?, 'telegram', 'vi',
      'pending_payment', 'pending', 'unfulfilled', 'VND', 120000, 0, 0, 120000, ?, ?, ?)`).run(
    orderId,
    customerId,
    expiresAt,
    now,
    now,
  );
  sqlite.prepare(`INSERT INTO shop_payment_provider_configs
    (id, provider, display_name, status, bank_id, account_ref, account_name_display, qr_template,
      confirmation_adapter, secret_ref, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'vietqr', 'PayOS', 'active', '970436', 'VIETQR_BANK_ACCOUNT', 'TUNG SHOP', 'compact2',
      'payos', 'PAYOS_CHECKSUM_KEY', 'test', 'test', ?, ?)`).run(providerId, now, now);
  sqlite.prepare(`INSERT INTO shop_payment_attempts
    (id, order_id, provider_config_id, provider, confirmation_provider, status, amount_minor, currency,
      order_reference, provider_reference, expires_at, created_at, updated_at, provider_order_code,
      provider_description, checkout_url, qr_image_url, provider_bank_bin, provider_account_number)
    VALUES (?, ?, ?, 'vietqr', 'payos', 'awaiting_payment', 120000, 'VND', 'TUNG-TG-RECOVERY-1', ?,
      ?, ?, ?, 202607300001, ?, ?, NULL, NULL, NULL)`).run(
    attemptId,
    orderId,
    providerId,
    paymentLinkId,
    expiresAt,
    now,
    now,
    description,
    `https://pay.payos.vn/web/${paymentLinkId}`,
  );

  const originalFetch = globalThis.fetch;
  let payOsFetches = 0;
  let releaseFetch;
  const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });
  globalThis.fetch = async (url) => {
    payOsFetches += 1;
    await fetchGate;
    const response = new Response(
      `<script>\\"quicklink\\":\\"https://img.vietqr.io/image/970436-${accountNumber}-vietqr_pro.jpg?addInfo=${description}\\u0026amount=120000\\"</script>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  };

  try {
    const pending = Promise.all(Array.from({ length: 8 }, () => (
      shop.statusForTelegramOrder({ CONTENT_DB: db }, customerId, orderId)
    )));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(payOsFetches, 1, "concurrent refreshes must share one recovery lease");
    releaseFetch();
    const statuses = await pending;
    assert.equal(statuses.some((status) => Boolean(status?.payment?.qr_image_url)), true);

    const persisted = sqlite.prepare(`SELECT qr_image_url, provider_bank_bin, provider_account_number,
      payment_recovery_claimed_at FROM shop_payment_attempts WHERE id = ?`).get(attemptId);
    assert.match(persisted.qr_image_url, /^https:\/\/img\.vietqr\.io\//);
    assert.equal(persisted.provider_bank_bin, "970436");
    assert.equal(persisted.provider_account_number, accountNumber);
    assert.ok(persisted.payment_recovery_claimed_at);

    const stable = await shop.statusForTelegramOrder({ CONTENT_DB: db }, customerId, orderId);
    assert.ok(stable?.payment?.qr_image_url);
    assert.equal(payOsFetches, 1, "persisted recovery must not call payOS again");
  } finally {
    releaseFetch?.();
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
