import assert from "node:assert/strict";
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

async function loadEmailModules() {
  const types = compile(read("src/lib/shop/types.ts"));
  const cryptoSource = compile(read("src/lib/shop/crypto.ts")).replace(/^import[\s\S]*?;\s*/m, "");
  const delivery = compile(read("src/lib/email/delivery.ts")).replace(/^import[^\n]*\n/gm, "");
  const provider = compile(read("src/lib/email/provider.ts"));
  const templates = compile(read("src/lib/email/templates.ts")).replace(/^import[^\n]*\n/gm, "");
  const authTemplates = compile(read("src/lib/email/auth-templates.ts")).replace(/^import[^\n]*\n/gm, "");
  const outbox = compile(read("src/lib/email/outbox.ts")).replace(/^import[^\n]*\n/gm, "");
  return importSource(`${types}\n${cryptoSource}\n${provider}\n${delivery}\n${templates}\n${authTemplates}\n${outbox}`);
}

function createD1(schema) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
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

const shopSchema = `
  CREATE TABLE shop_customers (
    id TEXT PRIMARY KEY, email_normalized TEXT, display_name TEXT NOT NULL,
    locale TEXT NOT NULL, deleted_at TEXT
  );
  CREATE TABLE shop_orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL, locale TEXT NOT NULL, status TEXT NOT NULL,
    payment_status TEXT NOT NULL, fulfillment_status TEXT NOT NULL, currency TEXT NOT NULL,
    subtotal_minor INTEGER NOT NULL, discount_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL,
    customer_email_snapshot TEXT NOT NULL, customer_name_snapshot TEXT NOT NULL,
    expires_at TEXT, paid_at TEXT, fulfilled_at TEXT
  );
  CREATE TABLE shop_order_items (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, line_number INTEGER NOT NULL,
    product_title_snapshot TEXT NOT NULL, variant_title_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL, quantity INTEGER NOT NULL, total_minor INTEGER NOT NULL,
    fulfillment_type TEXT NOT NULL DEFAULT 'license_key', delivery_mode TEXT NOT NULL DEFAULT 'automatic',
    inventory_policy TEXT NOT NULL DEFAULT 'tracked', fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE shop_inventory_units (
    id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, status TEXT NOT NULL,
    crypto_version TEXT NOT NULL, key_version TEXT NOT NULL, ciphertext_b64 TEXT NOT NULL,
    data_iv_b64 TEXT NOT NULL, wrapped_dek_b64 TEXT NOT NULL, wrap_iv_b64 TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL
  );
  CREATE TABLE shop_inventory_allocations (
    id TEXT PRIMARY KEY, order_item_id TEXT NOT NULL, inventory_unit_id TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT ''
  );
`;

const contactSchema = `
  CREATE TABLE contact_submissions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, locale TEXT NOT NULL, created_at TEXT NOT NULL
  );
`;

function insertOutbox(sqlite, input) {
  const now = new Date(Date.now() - 1_000).toISOString();
  sqlite.prepare(`INSERT INTO transactional_email_outbox
    (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
      input.id,
      input.topic,
      input.aggregateType,
      input.aggregateId,
      input.dedupeKey,
      now,
      now,
      now,
    );
}

function seedFulfilledKeyOrder(sqlite, email, options = {}) {
  const orderId = options.orderId ?? `fulfilled-${crypto.randomUUID()}`;
  const itemId = options.itemId ?? `item-${crypto.randomUUID()}`;
  const inventoryId = options.inventoryId ?? `inventory-${crypto.randomUUID()}`;
  const allocationId = options.allocationId ?? `allocation-${crypto.randomUUID()}`;
  const orderNumber = options.orderNumber ?? "DS-FULFILLED";
  const now = new Date().toISOString();
  const secret = options.secret ?? Buffer.alloc(32, 9).toString("base64url");
  const keyVersion = "v1";
  const plaintextKey = options.plaintextKey ?? `DELIVERY-${crypto.randomUUID()}`;
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, locale, status, payment_status, fulfillment_status, currency, subtotal_minor,
      discount_minor, total_minor, customer_email_snapshot, customer_name_snapshot, expires_at, paid_at, fulfilled_at)
    VALUES (?, ?, 'en', 'fulfilled', 'paid', 'fulfilled', 'USD', 1299, 0, 1299, ?, 'Buyer', NULL, ?, ?)`)
    .run(orderId, orderNumber, "buyer@example.invalid", now, now);
  sqlite.prepare(`INSERT INTO shop_order_items
    (id, order_id, line_number, product_title_snapshot, variant_title_snapshot, sku_snapshot, quantity, total_minor,
      fulfillment_type, delivery_mode, inventory_policy, fulfillment_status, created_at, updated_at)
    VALUES (?, ?, 1, 'Cloud Key', 'Standard', 'CLOUD-STD', 1, 1299, 'license_key', 'automatic', 'tracked', 'fulfilled', ?, ?)`)
    .run(itemId, orderId, now, now);
  return email.createShopCryptoContext(secret, keyVersion).then(async (context) => {
    const sealed = await email.sealInventoryKey(context, { inventoryUnitId: inventoryId, variantId: "variant-1", plaintextKey });
    sqlite.prepare(`INSERT INTO shop_inventory_units
      (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64,
       wrapped_dek_b64, wrap_iv_b64, key_fingerprint)
      VALUES (?, 'variant-1', 'fulfilled', ?, ?, ?, ?, ?, ?, ?)`)
      .run(inventoryId, sealed.cryptoVersion, sealed.keyVersion, sealed.ciphertextB64, sealed.dataIvB64, sealed.wrappedDekB64, sealed.wrapIvB64, sealed.keyFingerprint);
    sqlite.prepare(`INSERT INTO shop_inventory_allocations (id, order_item_id, inventory_unit_id, status, created_at)
      VALUES (?, ?, ?, 'fulfilled', ?)`)
      .run(allocationId, itemId, inventoryId, now);
    return { orderId, itemId, inventoryId, orderNumber, secret, keyVersion, plaintextKey };
  });
}

test("email outbox migrations are durable, indexed and contain no plaintext delivery payload", () => {
  for (const [migrationPath, baseSchema] of [
    ["content-migrations/0019_shop_email_outbox.sql", shopSchema],
    ["migrations/0006_contact_email_outbox.sql", contactSchema],
  ]) {
    const migration = read(migrationPath);
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(baseSchema);
    sqlite.exec(migration);
    const columns = new Set(sqlite.prepare("PRAGMA table_info(transactional_email_outbox)").all().map((row) => row.name));
    for (const column of ["dedupe_key", "status", "attempt_count", "available_at", "lock_token_hash", "provider_message_id", "last_error_code", "sent_at"]) {
      assert.equal(columns.has(column), true, `${migrationPath} missing ${column}`);
    }
    for (const forbidden of ["recipient_email", "payload_json", "license_key", "plaintext", "message_html"]) {
      assert.equal(columns.has(forbidden), false, `${migrationPath} persists ${forbidden}`);
    }
    assert.ok(sqlite.prepare("PRAGMA index_list(transactional_email_outbox)").all().length >= 3);
    sqlite.close();
  }
});

test("shop email dispatch sends localized escaped snapshots once and records the provider id", async () => {
  const email = await loadEmailModules();
  const { db, sqlite } = createD1(`${shopSchema}\n${read("content-migrations/0019_shop_email_outbox.sql")}`);
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO shop_orders VALUES (?, ?, 'vi', 'pending_payment', 'unpaid', 'unfulfilled', 'VND', 120000, 0, 120000, ?, ?, ?, NULL, NULL)`)
    .run("order-1", "DS-1001", "buyer@example.invalid", "Buyer <script>alert(1)</script>", now);
  sqlite.prepare(`INSERT INTO shop_order_items
    (id, order_id, line_number, product_title_snapshot, variant_title_snapshot, sku_snapshot, quantity, total_minor)
    VALUES (?, ?, 1, ?, ?, ?, 1, 120000)`)
    .run("item-1", "order-1", "Cloud Key", "Standard <b>safe</b>", "CLOUD-STD");
  insertOutbox(sqlite, { id: "email-1", topic: "shop.order.created", aggregateType: "shop_order", aggregateId: "order-1", dedupeKey: "created:order-1" });

  const provider = email.createFakeEmailProvider({ messageIdPrefix: "cf-test" });
  const first = await email.dispatchTransactionalEmails({
    db,
    source: "shop",
    provider,
    from: { email: "orders@tungjpstore.net", name: "DigiStore" },
    origin: "https://tung.codes",
  });
  const second = await email.dispatchTransactionalEmails({
    db,
    source: "shop",
    provider,
    from: { email: "orders@tungjpstore.net", name: "DigiStore" },
    origin: "https://tung.codes",
  });

  assert.deepEqual(first, { claimed: 1, sent: 1, failed: 0, deadLettered: 0 });
  assert.deepEqual(second, { claimed: 0, sent: 0, failed: 0, deadLettered: 0 });
  assert.equal(provider.deliveries.length, 1);
  assert.match(provider.deliveries[0].subject, /DS-1001/);
  assert.match(provider.deliveries[0].text, /120/);
  assert.doesNotMatch(provider.deliveries[0].html, /<script>|<b>safe<\/b>/);
  assert.match(provider.deliveries[0].html, /&lt;script&gt;|&lt;b&gt;safe&lt;\/b&gt;/);
  const row = { ...sqlite.prepare("SELECT status, attempt_count, provider_message_id, last_error_code FROM transactional_email_outbox WHERE id = 'email-1'").get() };
  assert.deepEqual(row, { status: "sent", attempt_count: 1, provider_message_id: "cf-test-1", last_error_code: null });
  assert.throws(() => insertOutbox(sqlite, { id: "email-duplicate", topic: "shop.order.created", aggregateType: "shop_order", aggregateId: "order-1", dedupeKey: "created:order-1" }));
  sqlite.close();
});

test("new customer welcome email is localized, escaped, durable and deduplicated", async () => {
  const email = await loadEmailModules();
  const { db, sqlite } = createD1(`${shopSchema}\n${read("content-migrations/0019_shop_email_outbox.sql")}\n${read("content-migrations/0026_shop_customer_welcome_email.sql")}`);
  sqlite.prepare(`INSERT INTO shop_customers (id, email_normalized, display_name, locale, deleted_at)
    VALUES ('customer-1', 'buyer@example.invalid', '<Buyer>', 'ja', NULL)`).run();
  insertOutbox(sqlite, {
    id: "email-welcome-1",
    topic: "shop.customer.welcome",
    aggregateType: "shop_customer",
    aggregateId: "customer-1",
    dedupeKey: "customer-welcome:customer-1",
  });

  const provider = email.createFakeEmailProvider({ messageIdPrefix: "welcome" });
  const result = await email.dispatchTransactionalEmails({
    db,
    source: "shop",
    provider,
    from: { email: "orders@tungjpstore.net", name: "DigiStore" },
    origin: "https://tung.codes",
  });

  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0, deadLettered: 0 });
  assert.equal(provider.deliveries.length, 1);
  assert.match(provider.deliveries[0].subject, /TUNG Shop/);
  assert.match(provider.deliveries[0].text, /https:\/\/tung.codes\/ja\/shop\/account/);
  assert.doesNotMatch(provider.deliveries[0].html, /<Buyer>/);
  assert.match(provider.deliveries[0].html, /&lt;Buyer&gt;/);
  assert.throws(() => insertOutbox(sqlite, {
    id: "email-welcome-duplicate",
    topic: "shop.customer.welcome",
    aggregateType: "shop_customer",
    aggregateId: "customer-1",
    dedupeKey: "customer-welcome:customer-1",
  }));
  assert.equal(sqlite.prepare("SELECT status FROM transactional_email_outbox WHERE id = 'email-welcome-1'").get().status, "sent");
  sqlite.close();
});

test("welcome migration backfills activated email accounts once", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`${shopSchema}\n${read("content-migrations/0019_shop_email_outbox.sql")}\n${read("content-migrations/0026_shop_customer_welcome_email.sql")}`);
  sqlite.prepare(`INSERT INTO shop_customers (id, email_normalized, display_name, locale, deleted_at)
    VALUES ('active-customer', 'active@example.invalid', 'Active', 'vi', NULL),
           ('guest-customer', 'guest@example.invalid', 'Guest', 'vi', NULL)`).run();
  sqlite.exec("ALTER TABLE shop_customers ADD COLUMN account_activated_at TEXT");
  sqlite.prepare("UPDATE shop_customers SET account_activated_at = ? WHERE id = 'active-customer'").run(new Date().toISOString());
  const migration = read("content-migrations/0027_backfill_customer_welcome_email.sql");
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.deepEqual(sqlite.prepare("SELECT aggregate_id, topic, status FROM transactional_email_outbox").all().map((row) => ({ ...row })), [{
    aggregate_id: "active-customer",
    topic: "shop.customer.welcome",
    status: "pending",
  }]);
  sqlite.close();
});

test("fulfilled email keeps keys out by default and delivers them only with explicit opt-in", async () => {
  const email = await loadEmailModules();
  const { db, sqlite } = createD1(`${shopSchema}\n${read("content-migrations/0019_shop_email_outbox.sql")}`);
  const seeded = await seedFulfilledKeyOrder(sqlite, email, { orderNumber: "DS-KEY-1" });
  insertOutbox(sqlite, { id: "email-key-off", topic: "shop.order.fulfilled", aggregateType: "shop_order", aggregateId: seeded.orderId, dedupeKey: "fulfilled:key-off" });

  const safeProvider = email.createFakeEmailProvider({ messageIdPrefix: "safe" });
  const safeResult = await email.dispatchTransactionalEmails({
    db, source: "shop", provider: safeProvider,
    from: { email: "orders@tungjpstore.net", name: "DigiStore" }, origin: "https://tung.codes",
  });
  assert.deepEqual(safeResult, { claimed: 1, sent: 1, failed: 0, deadLettered: 0 });
  assert.doesNotMatch(safeProvider.deliveries[0].text, new RegExp(seeded.plaintextKey));
  assert.doesNotMatch(safeProvider.deliveries[0].html, new RegExp(seeded.plaintextKey));

  insertOutbox(sqlite, { id: "email-key-on", topic: "shop.order.fulfilled", aggregateType: "shop_order", aggregateId: seeded.orderId, dedupeKey: "fulfilled:key-on" });
  const deliveryProvider = email.createFakeEmailProvider({ messageIdPrefix: "delivery" });
  const deliveryResult = await email.dispatchTransactionalEmails({
    db, source: "shop", provider: deliveryProvider,
    from: { email: "orders@tungjpstore.net", name: "DigiStore" }, origin: "https://tung.codes",
    deliverKeysByEmail: true,
    cryptoBindings: { SHOP_KEY_ENCRYPTION_SECRET: seeded.secret, SHOP_KEY_ENCRYPTION_KEY_VERSION: seeded.keyVersion },
  });
  assert.deepEqual(deliveryResult, { claimed: 1, sent: 1, failed: 0, deadLettered: 0 });
  assert.match(deliveryProvider.deliveries[0].text, new RegExp(seeded.plaintextKey));
  assert.match(deliveryProvider.deliveries[0].text, /12\.99|12,99/);
  assert.doesNotMatch(deliveryProvider.deliveries[0].text, /1,299/);
  assert.match(deliveryProvider.deliveries[0].html, /<code/);
  const outboxDump = JSON.stringify(sqlite.prepare("SELECT * FROM transactional_email_outbox").all());
  assert.doesNotMatch(outboxDump, new RegExp(seeded.plaintextKey));
  sqlite.close();
});

test("key delivery refuses an order that is not paid and fulfilled", async () => {
  const email = await loadEmailModules();
  const { db, sqlite } = createD1(`${shopSchema}\n${read("content-migrations/0019_shop_email_outbox.sql")}`);
  const orderId = "unpaid-order";
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO shop_orders
    (id, order_number, locale, status, payment_status, fulfillment_status, currency, subtotal_minor,
      discount_minor, total_minor, customer_email_snapshot, customer_name_snapshot, expires_at, paid_at, fulfilled_at)
    VALUES (?, 'DS-UNPAID', 'en', 'processing', 'pending', 'fulfilled', 'USD', 1299, 0, 1299,
      'buyer@example.invalid', 'Buyer', NULL, NULL, ?)`)
    .run(orderId, now);
  sqlite.prepare(`INSERT INTO shop_order_items
    (id, order_id, line_number, product_title_snapshot, variant_title_snapshot, sku_snapshot, quantity, total_minor,
      fulfillment_type, delivery_mode, inventory_policy, fulfillment_status)
    VALUES ('item-unpaid', ?, 1, 'Cloud Key', 'Standard', 'CLOUD-STD', 1, 1299, 'license_key', 'automatic', 'tracked', 'fulfilled')`).run(orderId);
  insertOutbox(sqlite, { id: "email-unpaid", topic: "shop.order.fulfilled", aggregateType: "shop_order", aggregateId: orderId, dedupeKey: "fulfilled:unpaid" });
  const result = await email.dispatchTransactionalEmails({
    db, source: "shop", provider: email.createFakeEmailProvider(),
    from: { email: "orders@tungjpstore.net" }, origin: "https://tung.codes", deliverKeysByEmail: true,
    cryptoBindings: { SHOP_KEY_ENCRYPTION_SECRET: Buffer.alloc(32, 9).toString("base64url"), SHOP_KEY_ENCRYPTION_KEY_VERSION: "v1" },
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 1, deadLettered: 1 });
  assert.equal(sqlite.prepare("SELECT last_error_code FROM transactional_email_outbox WHERE id = 'email-unpaid'").get().last_error_code, "email_delivery_order_ineligible");
  sqlite.close();
});

test("auth email builders are distinct, escaped and reject insecure external links", async () => {
  const email = await loadEmailModules();
  const from = { email: "orders@tungjpstore.net", name: "DigiStore" };
  const verification = email.buildSignupVerificationEmail({ recipient: { email: "buyer@example.invalid" }, displayName: "<Buyer>", verificationUrl: "https://tung.codes/auth/verify?token=opaque", from, locale: "en" });
  const login = email.buildLoginAlertEmail({ recipient: { email: "buyer@example.invalid" }, displayName: "Buyer", occurredAt: "2026-07-25T00:00:00.000Z", approximateLocation: "Tokyo <script>", deviceSummary: "Browser", securityUrl: "https://tung.codes/account/security", from, locale: "en" });
  const reset = email.buildPasswordResetEmail({ recipient: { email: "buyer@example.invalid" }, displayName: "Buyer", resetUrl: "https://tung.codes/auth/reset?token=opaque", expiresAt: "2026-07-25T01:00:00.000Z", from, locale: "en" });
  const welcome = email.buildWelcomeEmail({ recipient: { email: "buyer@example.invalid" }, displayName: "<Buyer>", accountUrl: "https://tung.codes/shop/account", from, locale: "vi" });
  assert.notEqual(verification.subject, login.subject);
  assert.notEqual(login.subject, reset.subject);
  assert.match(verification.html, /&lt;Buyer&gt;/);
  assert.match(login.html, /Tokyo &lt;script&gt;/);
  assert.match(welcome.subject, /Chào mừng/);
  assert.match(welcome.html, /&lt;Buyer&gt;/);
  assert.throws(() => email.buildPasswordResetEmail({ recipient: { email: "buyer@example.invalid" }, resetUrl: "http://evil.example/reset", expiresAt: "2026-07-25T01:00:00.000Z", from }), /email_auth_url_invalid/);
});

test("transient email failures back off while permanent provider failures dead-letter", async () => {
  const email = await loadEmailModules();
  const { db, sqlite } = createD1(`${contactSchema}\n${read("migrations/0006_contact_email_outbox.sql")}`);
  const originalConsoleError = console.error;
  const errorLogs = [];
  console.error = (...values) => errorLogs.push(values.join(" "));
  try {
    sqlite.prepare("INSERT INTO contact_submissions VALUES ('contact-1', 'Buyer', 'buyer@example.invalid', 'en', ?)").run(new Date().toISOString());
    insertOutbox(sqlite, { id: "email-transient", topic: "contact.submission.confirmed", aggregateType: "contact_submission", aggregateId: "contact-1", dedupeKey: "contact:transient" });
    const transient = Object.assign(new Error("temporary"), { code: "E_INTERNAL_SERVER_ERROR" });
    const transientResult = await email.dispatchTransactionalEmails({
      db,
      source: "contact",
      provider: email.createFakeEmailProvider({ failWith: transient }),
      from: { email: "orders@tungjpstore.net", name: "DigiStore" },
      origin: "https://tung.codes",
    });
    assert.deepEqual(transientResult, { claimed: 1, sent: 0, failed: 1, deadLettered: 0 });
    const transientRow = sqlite.prepare("SELECT status, attempt_count, last_error_code, available_at FROM transactional_email_outbox WHERE id = 'email-transient'").get();
    assert.equal(transientRow.status, "failed");
    assert.equal(transientRow.attempt_count, 1);
    assert.equal(transientRow.last_error_code, "E_INTERNAL_SERVER_ERROR");
    assert.ok(Date.parse(transientRow.available_at) > Date.now());

    insertOutbox(sqlite, { id: "email-permanent", topic: "contact.submission.confirmed", aggregateType: "contact_submission", aggregateId: "contact-1", dedupeKey: "contact:permanent" });
    const permanent = Object.assign(new Error("sender"), { code: "E_SENDER_NOT_VERIFIED" });
    const permanentResult = await email.dispatchTransactionalEmails({
      db,
      source: "contact",
      provider: email.createFakeEmailProvider({ failWith: permanent }),
      from: { email: "orders@tungjpstore.net", name: "DigiStore" },
      origin: "https://tung.codes",
    });
    assert.deepEqual(permanentResult, { claimed: 1, sent: 0, failed: 1, deadLettered: 1 });
    assert.deepEqual({ ...sqlite.prepare("SELECT status, last_error_code FROM transactional_email_outbox WHERE id = 'email-permanent'").get() }, {
      status: "dead_letter",
      last_error_code: "E_SENDER_NOT_VERIFIED",
    });
    assert.equal(errorLogs.length, 2);
    assert.ok(errorLogs.every((line) => line.includes("transactional_email_failed")));
    assert.ok(errorLogs.every((line) => !line.includes("buyer@example.invalid")));
  } finally {
    console.error = originalConsoleError;
  }
  sqlite.close();
});

test("commerce and contact writes enqueue only aggregate references inside their D1 batches", () => {
  const repository = read("src/lib/shop/repository.ts");
  const contact = read("src/pages/api/contact.ts");
  const maintenance = read("src/pages/api/shop/maintenance.ts");
  for (const topic of ["shop.order.created", "shop.order.payment_confirmed", "shop.order.fulfilled"]) {
    assert.match(repository, new RegExp(topic.replaceAll(".", "\\.")));
  }
  assert.match(contact, /contact\.submission\.confirmed/);
  assert.match(contact, /batch\(\[cleanup, claim, insert, enqueueConfirmation\]\)/);
  assert.match(maintenance, /source:\s*"shop"/);
  assert.match(maintenance, /source:\s*"contact"/);
  assert.match(maintenance, /new CloudflareEmailProvider\(env\.SHOP_EMAIL\)/);
  assert.doesNotMatch(repository, /transactional_email_outbox[\s\S]{0,400}(?:plaintextKey|ciphertext_b64|license[_ ]?key)/i);
});

test("Wrangler binds Cloudflare Email Service to the verified sender and generated runtime types", () => {
  const config = JSON.parse(read("wrangler.jsonc"));
  assert.deepEqual(config.send_email, [{
    name: "SHOP_EMAIL",
    allowed_sender_addresses: ["orders@tungjpstore.net"],
  }]);
  assert.equal(config.vars.TRANSACTIONAL_EMAIL_FROM_ADDRESS, "orders@tungjpstore.net");
  assert.equal(config.vars.TRANSACTIONAL_EMAIL_FROM_NAME, "TUNG Shop");
  const generatedTypes = read("src/worker-configuration.d.ts");
  assert.match(generatedTypes, /SHOP_EMAIL:\s*SendEmail/);
  assert.match(generatedTypes, /TRANSACTIONAL_EMAIL_FROM_ADDRESS/);
});
