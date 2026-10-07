import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Payment rails v2 (migration 0056).
 *
 * The payment layer could only ever be VietQR: both shop_payment_provider_configs
 * and shop_payment_attempts carried CHECK (provider IN ('vietqr')), and attempts
 * pinned method to 'bank_transfer_qr'. No second rail could be stored, let alone
 * routed to, which is why the shop has zero international rails.
 *
 * SQLite cannot drop or alter a CHECK, so 0056 rebuilds three tables. Rebuilding
 * tables that hold payment records is the riskiest kind of migration, so most of
 * what is here is about proving nothing was lost.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

/** Every migration up to but excluding 0056, i.e. the production chain as it stands. */
const MIGRATIONS_BEFORE = readdirSync(`${projectRoot}/content-migrations`)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .filter((name) => name < "0056_shop_payment_rails_v2.sql")
  .map((name) => `content-migrations/${name}`);

const NEW_MIGRATION = "content-migrations/0056_shop_payment_rails_v2.sql";

function createDb(migrations = MIGRATIONS_BEFORE) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) sqlite.exec(read(migration));
  return sqlite;
}

function seedPaymentHistory(sqlite) {
  const now = "2026-08-01T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, locale, status, payment_status,
     fulfillment_status, currency, subtotal_minor, tax_minor, total_minor,
     customer_name_snapshot, metadata_json, version, created_at, updated_at)
    VALUES ('order-1', 'TUNG-000001', 'ref-1', 'token-hash-1', 'vi', 'processing', 'paid',
            'fulfilled', 'VND', 120000, 0, 120000, 'Buyer', '{}', 1, ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_payment_provider_configs
    (id, provider, display_name, status, bank_id, account_ref, account_name_display,
     qr_template, confirmation_adapter, secret_ref, public_config_json, version,
     created_by, updated_by, created_at, updated_at)
    VALUES ('config-1', 'vietqr', 'VietQR Bank', 'active', '970436', 'ACC-1', 'TUNG SHOP',
            'compact2', 'payos', 'secret-ref-1', '{}', 3, 'owner', 'owner', ?, ?)`).run(now, now);
  // Every column added by later migrations, so a rebuild that misses one shows up.
  // 26 columns, 26 values, all literal: a placeholder count mismatch here would
  // surface as a confusing "column index out of range".
  sqlite.prepare(`INSERT INTO shop_payment_attempts
    (id, order_id, provider_config_id, provider, confirmation_provider, method, status,
     amount_minor, currency, order_reference, provider_reference, qr_payload_hash, failure_code,
     expires_at, confirmed_at, created_at, updated_at, provider_order_code, provider_description,
     checkout_url, qr_image_url, reconciliation_attempted_at, reconciliation_checked_at,
     provider_bank_bin, provider_account_number, payment_recovery_claimed_at)
    VALUES ('attempt-1', 'order-1', 'config-1', 'vietqr', 'payos', 'bank_transfer_qr', 'confirmed',
            120000, 'VND', 'ref-1', 'payos-ref-1', 'qr-hash-1', NULL,
            '2026-08-01T00:30:00.000Z', '${now}', '${now}', '${now}',
            123456, 'TUNG ref-1', 'https://pay.example/1', 'https://qr.example/1.png',
            '${now}', '${now}', '970436', 'ACC-1', '${now}')`).run();
  sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, network, destination_type, destination_value, memo_or_tag,
     display_name, status, min_confirmations, expiry_minutes, sort_order, version,
     public_config_json, storefront_scope, verification_mode, created_by, updated_by,
     created_at, updated_at)
    VALUES ('crypto-1', 'bybit', 'onchain_deposit', 'USDT', 'TRC-20', 'wallet_address',
            'TAddr1', 'memo-1', 'USDT TRC-20', 'active', 3, 30, 0, 1, '{}', 'glb', 'manual',
            'owner', 'owner', ?, ?)`).run(now, now);
  return now;
}

test("the migration runs on the full production chain", () => {
  const sqlite = createDb();
  seedPaymentHistory(sqlite);
  assert.doesNotThrow(() => sqlite.exec(read(NEW_MIGRATION)));
});

test("every payment record survives the rebuild, column for column", () => {
  const sqlite = createDb();
  seedPaymentHistory(sqlite);
  sqlite.exec(read(NEW_MIGRATION));

  const config = sqlite.prepare("SELECT * FROM shop_payment_provider_configs WHERE id = 'config-1'").get();
  assert.equal(config.provider, "vietqr");
  assert.equal(config.bank_id, "970436");
  assert.equal(config.account_ref, "ACC-1");
  assert.equal(config.confirmation_adapter, "payos");
  assert.equal(config.secret_ref, "secret-ref-1");
  assert.equal(config.version, 3);
  // New columns default rather than null, so routing code need not special-case them.
  assert.equal(config.rail_type, "bank_qr");
  assert.equal(config.priority, 100);
  assert.equal(config.currencies_json, "[]");
  assert.equal(config.status, "active");

  const attempt = sqlite.prepare("SELECT * FROM shop_payment_attempts WHERE id = 'attempt-1'").get();
  // Columns accumulated across five later migrations must all be present.
  assert.equal(attempt.provider_order_code, 123456, "0011 payOS link fields");
  assert.equal(attempt.checkout_url, "https://pay.example/1");
  assert.equal(attempt.qr_image_url, "https://qr.example/1.png");
  assert.equal(attempt.reconciliation_checked_at, "2026-08-01T00:00:00.000Z", "0012 guards");
  assert.equal(attempt.provider_bank_bin, "970436", "0025 dynamic accounts");
  assert.equal(attempt.provider_account_number, "ACC-1");
  assert.equal(attempt.payment_recovery_claimed_at, "2026-08-01T00:00:00.000Z", "0036 recovery leases");
  assert.equal(attempt.status, "confirmed");
  assert.equal(attempt.amount_minor, 120000);

  const method = sqlite.prepare("SELECT * FROM shop_crypto_payment_methods WHERE id = 'crypto-1'").get();
  assert.equal(method.provider, "bybit");
  assert.equal(method.storefront_scope, "glb", "0045 scope");
  assert.equal(method.verification_mode, "manual", "existing methods must not start auto-settling");
});

test("indexes are recreated, including the partial uniqueness rules", () => {
  const sqlite = createDb();
  sqlite.exec(read(NEW_MIGRATION));
  const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);

  for (const expected of [
    "uq_shop_payment_provider_active",
    "uq_shop_payment_attempt_provider_reference",
    "idx_shop_payment_attempt_order",
    "uq_shop_payment_attempt_live_order",
    "idx_shop_payment_attempt_expiry",
    "idx_shop_crypto_method_public",
    "idx_shop_crypto_method_scope_public",
  ]) {
    assert.ok(names.includes(expected), `${expected} must survive the rebuild`);
  }

  // The one live attempt per order rule still holds after the rebuild.
  const db = createDb();
  seedPaymentHistory(db);
  db.exec(read(NEW_MIGRATION));
  const now = "2026-08-01T00:00:00.000Z";
  db.prepare(`INSERT INTO shop_payment_attempts
    (id, order_id, provider_config_id, provider, confirmation_provider, method, status,
     amount_minor, currency, order_reference, expires_at, created_at, updated_at)
    VALUES ('live-1', 'order-1', 'config-1', 'vietqr', 'manual', 'bank_transfer_qr', 'awaiting_payment',
            1000, 'VND', 'ref-1', ?, ?, ?)`).run(now, now, now);
  assert.throws(
    () => db.prepare(`INSERT INTO shop_payment_attempts
      (id, order_id, provider_config_id, provider, confirmation_provider, method, status,
       amount_minor, currency, order_reference, expires_at, created_at, updated_at)
      VALUES ('live-2', 'order-1', 'config-1', 'vietqr', 'manual', 'bank_transfer_qr', 'awaiting_payment',
              1000, 'VND', 'ref-1', ?, ?, ?)`).run(now, now, now),
    /UNIQUE|constraint/i,
    "two live attempts on one order must still be rejected",
  );
});

test("a second rail can now be stored, which was impossible before", () => {
  const before = createDb();
  seedPaymentHistory(before);
  assert.throws(
    () => before.prepare(`INSERT INTO shop_payment_provider_configs
      (id, provider, display_name, status, bank_id, account_ref, account_name_display,
       qr_template, confirmation_adapter, version, created_by, updated_by, created_at, updated_at)
      VALUES ('config-2', 'gcash', 'GCash', 'active', '', '', 'GCash', 'compact2', 'provider_webhook', 1,
              'owner', 'owner', 'x', 'x')`).run(),
    /CHECK/i,
    "before the migration, no rail other than vietqr can be stored",
  );

  const after = createDb([...MIGRATIONS_BEFORE, NEW_MIGRATION]);
  seedPaymentHistory(after);
  assert.doesNotThrow(() => after.prepare(`INSERT INTO shop_payment_provider_configs
    (id, provider, rail_type, display_name, status, confirmation_adapter, currencies_json,
     countries_json, capabilities_json, priority, version, created_by, updated_by, created_at, updated_at)
    VALUES ('config-2', 'gcash', 'ewallet', 'GCash', 'active', 'provider_webhook', '["PHP"]',
            '["PH"]', '{"create":true,"verify":true,"refund":false}', 10, 1,
            'owner', 'owner', 'x', 'x')`).run());
  // A non-bank rail needs no bank fields.
  assert.doesNotThrow(() => after.prepare(`INSERT INTO shop_payment_attempts
    (id, order_id, provider_config_id, provider, confirmation_provider, method, status,
     amount_minor, currency, order_reference, expires_at, created_at, updated_at)
    VALUES ('attempt-2', 'order-1', 'config-2', 'gcash', 'provider_webhook', 'ewallet_redirect',
            'awaiting_payment', 1000, 'PHP', 'ref-1', 'x', 'x', 'x')`).run());
});

test("crypto methods may opt into automatic settlement", () => {
  const sqlite = createDb([...MIGRATIONS_BEFORE, NEW_MIGRATION]);
  seedPaymentHistory(sqlite);
  for (const mode of ["auto", "hybrid"]) {
    assert.doesNotThrow(() => sqlite.prepare(`UPDATE shop_crypto_payment_methods
      SET verification_mode = ? WHERE id = 'crypto-1'`).run(mode), `${mode} must be accepted`);
  }
  assert.throws(() => sqlite.prepare(`UPDATE shop_crypto_payment_methods
    SET verification_mode = 'yolo' WHERE id = 'crypto-1'`).run(), /CHECK/i);
});

test("refunds are recorded as records, not as an admin editing an order", () => {
  const sqlite = createDb([...MIGRATIONS_BEFORE, NEW_MIGRATION]);
  seedPaymentHistory(sqlite);
  const now = "2026-08-02T00:00:00.000Z";
  assert.doesNotThrow(() => sqlite.prepare(`INSERT INTO shop_payment_refunds
    (id, order_id, payment_attempt_id, provider, rail_type, amount_minor, currency, reason,
     status, provider_reference, requested_by, requested_at, created_at, updated_at)
    VALUES ('refund-1', 'order-1', 'attempt-1', 'vietqr', 'bank_qr', 120000, 'VND',
            'duplicate charge', 'succeeded', 'rref-1', 'owner', ?, ?, ?)`).run(now, now, now));
  // A zero refund is a data error, not a no-op.
  assert.throws(() => sqlite.prepare(`INSERT INTO shop_payment_refunds
    (id, order_id, provider, rail_type, amount_minor, currency, status, requested_by,
     requested_at, created_at, updated_at)
    VALUES ('refund-2', 'order-1', 'vietqr', 'bank_qr', 0, 'VND', 'requested', 'owner', ?, ?, ?)`)
    .run(now, now, now), /CHECK/i);
  const stored = sqlite.prepare("SELECT * FROM shop_payment_refunds WHERE id = 'refund-1'").get();
  assert.equal(stored.amount_minor, 120000);
  assert.equal(stored.provider_reference, "rref-1");
});

test("foreign keys still hold after the rebuild", () => {
  const sqlite = createDb([...MIGRATIONS_BEFORE, NEW_MIGRATION]);
  seedPaymentHistory(sqlite);
  const now = "2026-08-01T00:00:00.000Z";
  // An attempt pointing at a config that does not exist must be rejected.
  assert.throws(() => sqlite.prepare(`INSERT INTO shop_payment_attempts
    (id, order_id, provider_config_id, provider, confirmation_provider, method, status,
     amount_minor, currency, order_reference, expires_at, created_at, updated_at)
    VALUES ('bad', 'order-1', 'missing-config', 'vietqr', 'manual', 'bank_transfer_qr',
            'created', 1, 'VND', 'ref-1', ?, ?, ?)`).run(now, now, now), /FOREIGN KEY/i);

  // Deleting the order cascades to its attempt, as before.
  sqlite.prepare("DELETE FROM shop_orders WHERE id = 'order-1'").run();
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shop_payment_attempts WHERE order_id = 'order-1'").get().n, 0);
});
