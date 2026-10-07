import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Finishing the rail unlock.
 *
 * Migration 0056 opened the provider-config and payment-attempt tables, but the
 * crypto path stayed pinned to `provider IN ('bybit','binance')` and
 * `asset IN ('USDT','USDC')`, and `shop_payment_events.provider` stayed pinned
 * to five values. Registering any other crypto provider was therefore still
 * rejected by the schema.
 *
 * That matters more than it sounds: outside Vietnam there is no local bank rail,
 * and USDT is the one method that works everywhere without a local acquiring
 * licence. Crypto is priority one for this expansion, and it was the one path
 * the schema had not opened.
 *
 * Migration 0057 completes it.
 */

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${projectRoot}/${path}`, "utf8");

const ALL_MIGRATIONS = readdirSync(`${projectRoot}/content-migrations`)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function migrate(names) {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of names) sqlite.exec(read(`content-migrations/${name}`));
  return sqlite;
}

const WITHOUT_UNLOCK = ALL_MIGRATIONS.filter((name) => name < "0057");
const now = "2026-08-29T00:00:00.000Z";

/** Seed one order and one complete crypto payment, then return the db. */
function seedCryptoPayment(sqlite) {
  sqlite.exec("PRAGMA foreign_keys = OFF");
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, locale, status, payment_status,
     fulfillment_status, currency, subtotal_minor, total_minor, metadata_json, customer_name_snapshot,
     customer_email_snapshot, version, created_at, updated_at)
    VALUES ('order-1', 'ORD-1', 'REF-1', 'hash-1', 'en', 'pending_payment', 'unpaid', 'unfulfilled',
            'USD', 1055, 1055, '{}', 'Buyer', 'buyer@example.com', 1, ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, network, destination_type, destination_value, memo_or_tag,
     display_name, status, verification_mode, min_confirmations, expiry_minutes, sort_order,
     version, public_config_json, storefront_scope, created_by, updated_by, created_at, updated_at)
    VALUES ('method-1', 'bybit', 'onchain_deposit', 'USDT', 'TRC20', 'wallet_address', 'TADDRESS1', 'memo-1',
            'Bybit USDT', 'active', 'manual', 3, 30, 0, 1, '{"a":1}', 'glb', 'admin', 'admin', ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_crypto_payment_attempts
    (id, order_id, payment_method_id, provider, rail, asset, network, expected_amount_atomic,
     expected_amount_minor, destination_snapshot, memo_or_tag_snapshot, status, expires_at, created_at, updated_at)
    VALUES ('attempt-1', 'order-1', 'method-1', 'bybit', 'onchain_deposit', 'USDT', 'TRC20',
            '1055000', 1055, 'TADDRESS1', 'memo-1', 'awaiting_payment', ?, ?, ?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO shop_crypto_payment_events
    (id, payment_attempt_id, order_id, provider, rail, provider_event_id, transaction_reference,
     asset, network, amount_atomic, status, match_state, evidence_hash, occurred_at, created_at)
    VALUES ('event-1', 'attempt-1', 'order-1', 'bybit', 'onchain_deposit', 'evt-1', 'tx-1',
            'USDT', 'TRC20', '1055000', 'success', 'matched', 'hash-evt-1', ?, ?)`).run(now, now);
  sqlite.prepare(`INSERT INTO shop_payment_events
    (id, provider, provider_event_id, order_id, event_type, payload_hash, signature_verified,
     match_state, processing_state, occurred_at, created_at)
    VALUES ('pay-event-1', 'vietqr', 'pay-evt-1', 'order-1', 'payment', 'hash-pay-1', 1,
            'matched', 'accepted', ?, ?)`).run(now, now);
  return sqlite;
}

test("the migration runs on the full production chain", () => {
  assert.doesNotThrow(() => migrate(ALL_MIGRATIONS));
});

test("every crypto payment record survives the rebuild", () => {
  const sqlite = seedCryptoPayment(migrate(WITHOUT_UNLOCK));
  sqlite.exec(read("content-migrations/0057_shop_crypto_rails_unlock.sql"));

  const method = sqlite.prepare("SELECT * FROM shop_crypto_payment_methods WHERE id = 'method-1'").get();
  assert.equal(method.provider, "bybit");
  assert.equal(method.asset, "USDT");
  assert.equal(method.destination_value, "TADDRESS1");
  assert.equal(method.memo_or_tag, "memo-1");
  assert.equal(method.verification_mode, "manual", "an existing method must not start auto-settling");
  assert.equal(method.storefront_scope, "glb");
  assert.equal(JSON.parse(method.public_config_json).a, 1);

  const attempt = sqlite.prepare("SELECT * FROM shop_crypto_payment_attempts WHERE id = 'attempt-1'").get();
  assert.equal(attempt.provider, "bybit");
  assert.equal(attempt.expected_amount_minor, 1055);
  assert.equal(attempt.memo_or_tag_snapshot, "memo-1");
  assert.equal(attempt.status, "awaiting_payment");

  const event = sqlite.prepare("SELECT * FROM shop_crypto_payment_events WHERE id = 'event-1'").get();
  assert.equal(event.provider_event_id, "evt-1");
  assert.equal(event.match_state, "matched");
  // The parent link survived the drop-and-rename of both tables.
  assert.equal(event.payment_attempt_id, "attempt-1");

  const paymentEvent = sqlite.prepare("SELECT * FROM shop_payment_events WHERE id = 'pay-event-1'").get();
  assert.equal(paymentEvent.provider, "vietqr");
  assert.equal(paymentEvent.signature_verified, 1);
});

test("indexes are recreated, including the partial uniqueness rules", () => {
  const sqlite = seedCryptoPayment(migrate(WITHOUT_UNLOCK));
  sqlite.exec(read("content-migrations/0057_shop_crypto_rails_unlock.sql"));

  const indexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
    .all("shop_crypto_payment_attempts").map((row) => row.name);
  for (const expected of [
    "uq_shop_crypto_attempt_live_order",
    "uq_shop_crypto_attempt_provider_reference",
    "idx_shop_crypto_attempt_reconcile",
  ]) {
    assert.ok(indexes.includes(expected), `missing ${expected}`);
  }

  // The live-order uniqueness rule still bites after the rebuild.
  sqlite.exec("PRAGMA foreign_keys = OFF");
  assert.throws(
    () => sqlite.prepare(`INSERT INTO shop_crypto_payment_attempts
      (id, order_id, payment_method_id, provider, rail, asset, expected_amount_atomic,
       expected_amount_minor, destination_snapshot, status, expires_at, created_at, updated_at)
      VALUES ('attempt-2', 'order-1', 'method-1', 'bybit', 'onchain_deposit', 'USDT', '1', 1, 'd',
              'awaiting_payment', ?, ?, ?)`).run(now, now, now),
    /UNIQUE/,
  );
});

test("a crypto provider other than Bybit or Binance can now be registered", () => {
  const sqlite = migrate(ALL_MIGRATIONS);
  sqlite.exec("PRAGMA foreign_keys = OFF");
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, locale, status, payment_status,
     fulfillment_status, currency, subtotal_minor, total_minor, metadata_json, customer_name_snapshot,
     customer_email_snapshot, version, created_at, updated_at)
    VALUES ('order-1', 'ORD-1', 'REF-1', 'hash-1', 'en', 'pending_payment', 'unpaid', 'unfulfilled',
            'USD', 1055, 1055, '{}', 'Buyer', 'b@e.com', 1, ?, ?)`).run(now, now);

  // This is the whole point: rejected by the schema before 0057.
  sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, network, destination_type, destination_value, display_name,
     status, verification_mode, created_by, updated_by, created_at, updated_at)
    VALUES ('method-np', 'nowpayments', 'onchain_deposit', 'USDT', 'TRC20', 'wallet_address',
            'TNEW', 'NOWPayments USDT', 'active', 'auto', 'admin', 'admin', ?, ?)`).run(now, now);

  sqlite.prepare(`INSERT INTO shop_crypto_payment_attempts
    (id, order_id, payment_method_id, provider, rail, asset, network, expected_amount_atomic,
     expected_amount_minor, destination_snapshot, status, expires_at, created_at, updated_at)
    VALUES ('attempt-np', 'order-1', 'method-np', 'nowpayments', 'onchain_deposit', 'USDT', 'TRC20',
            '1055000', 1055, 'TNEW', 'awaiting_payment', ?, ?, ?)`).run(now, now, now);

  sqlite.prepare(`INSERT INTO shop_crypto_payment_events
    (id, payment_attempt_id, order_id, provider, rail, provider_event_id, asset, status,
     match_state, evidence_hash, occurred_at, created_at)
    VALUES ('event-np', 'attempt-np', 'order-1', 'nowpayments', 'onchain_deposit', 'evt-np',
            'USDT', 'success', 'matched', 'h', ?, ?)`).run(now, now);

  // Payment events from a non-VietQR rail are recordable too.
  sqlite.prepare(`INSERT INTO shop_payment_events
    (id, provider, provider_event_id, event_type, payload_hash, signature_verified,
     match_state, processing_state, occurred_at, created_at)
    VALUES ('ev-gcash', 'gcash', 'gcash-1', 'payment', 'h', 1, 'matched', 'accepted', ?, ?)`).run(now, now);

  const attempt = sqlite.prepare("SELECT provider, asset FROM shop_crypto_payment_attempts WHERE id = 'attempt-np'").get();
  assert.equal(attempt.provider, "nowpayments");
});

test("assets beyond USDT and USDC are accepted", () => {
  const sqlite = migrate(ALL_MIGRATIONS);
  sqlite.exec("PRAGMA foreign_keys = OFF");
  assert.doesNotThrow(() => sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, network, destination_type, destination_value, display_name,
     created_by, updated_by, created_at, updated_at)
    VALUES ('m-btc', 'oxapay', 'onchain_deposit', 'BTC', 'bitcoin', 'wallet_address', 'bc1q', 'BTC',
            'admin', 'admin', ?, ?)`).run(now, now));
});

test("junk values are still rejected, so the column is not wide open", () => {
  const sqlite = migrate(ALL_MIGRATIONS);
  sqlite.exec("PRAGMA foreign_keys = OFF");
  const insert = (provider, asset) => sqlite.prepare(`INSERT INTO shop_crypto_payment_methods
    (id, provider, rail, asset, destination_type, destination_value, display_name,
     created_by, updated_by, created_at, updated_at)
    VALUES ('probe', ?, 'onchain_deposit', ?, 'wallet_address', 'addr', 'Name', 'admin', 'admin', ?, ?)`)
    .run(provider, asset, now, now);

  assert.throws(() => insert("BYBIT", "USDT"), /CHECK/, "uppercase provider is rejected");
  assert.throws(() => insert("x", "USDT"), /CHECK/, "a one-character provider is rejected");
  assert.throws(() => insert("nowpayments", ""), /CHECK/, "an empty asset is rejected");
  assert.throws(() => insert("nowpayments", "this-asset-name-is-far-too-long"), /CHECK/);
  // A well-formed value is still accepted, so the checks are not over-tight.
  assert.doesNotThrow(() => insert("nowpayments", "usdc"));
});

test("foreign keys are enforced again once the migration finishes", () => {
  const sqlite = migrate(ALL_MIGRATIONS);
  seedCryptoPayment(sqlite);
  // The seed turns enforcement off to insert in any order; the assertion below
  // is only meaningful with it back on, which is the state a live connection
  // must be left in.
  sqlite.exec("PRAGMA foreign_keys = ON");
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  // A second order, so the failure below is the foreign key and not the
  // partial unique index that allows only one live attempt per order.
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, order_reference, public_token_hash, locale, status, payment_status,
     fulfillment_status, currency, subtotal_minor, total_minor, metadata_json, customer_name_snapshot,
     customer_email_snapshot, version, created_at, updated_at)
    VALUES ('order-2', 'ORD-2', 'REF-2', 'hash-2', 'en', 'pending_payment', 'unpaid', 'unfulfilled',
            'USD', 1055, 1055, '{}', 'Buyer', 'b2@e.com', 1, ?, ?)`).run(now, now);

  // An attempt pointing at a method that does not exist must be refused.
  assert.throws(
    () => sqlite.prepare(`INSERT INTO shop_crypto_payment_attempts
      (id, order_id, payment_method_id, provider, rail, asset, expected_amount_atomic,
       expected_amount_minor, destination_snapshot, expires_at, created_at, updated_at)
      VALUES ('attempt-orphan', 'order-2', 'method-missing', 'bybit', 'onchain_deposit', 'USDT',
              '1', 1, 'd', ?, ?, ?)`).run(now, now, now),
    /FOREIGN KEY/,
  );
});
