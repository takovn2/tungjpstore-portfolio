import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
export const root = fileURLToPath(new URL("../..", import.meta.url));
export const read = (file) => readFileSync(`${root}/${file}`, "utf8");
export async function otpModule(file) {
  const result = await build({ entryPoints: [`${root}/${file}`], bundle: true, format: "esm", platform: "node", target: "node22", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
export function createOtpD1({ full = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  const files = full ? readdirSync(`${root}/content-migrations`).filter((file) => file.endsWith(".sql")).sort() : [
    "0001_content_cms.sql", "0009_shop_core.sql", "0013_shop_idempotency_and_outbox_leases.sql", "0014_shop_inventory_operations.sql",
    "0019_shop_email_outbox.sql", "0023_shop_customer_auth.sql", "0062_shop_otp_bridge.sql",
  ];
  for (const file of files) { try { sqlite.exec(read(`content-migrations/${file}`)); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`); } }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql); let values = [];
      const prepared = { bind(...input) { values = input; return prepared; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
        __run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      }; return prepared;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = statements.map((statement) => statement.__run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, sqlite, close: () => sqlite.close() };
}
export async function seedOtpShop(db, auth, { fulfilled = true, active = true, now = Date.now() } = {}) {
  const at = new Date(now - 1000).toISOString(), token = "A".repeat(43), secret = "synthetic-session-secret-32-characters-only";
  const sessionHash = await auth.hashCustomerSessionToken(token, secret);
  const statements = [
    ["INSERT INTO shop_products (id,slug,status,created_by,updated_by,created_at,updated_at) VALUES ('otp-product','otp-synthetic','active','test','test',?,?)", [at,at]],
    ["INSERT INTO shop_variants (id,product_id,sku,fulfillment_type,delivery_mode,inventory_policy,price_minor,currency,created_at,updated_at) VALUES ('otp-variant','otp-product','OTP-SYNTHETIC','license_key','automatic','tracked',100,'USD',?,?)", [at,at]],
    ["INSERT INTO shop_customers (id,email_normalized,status,account_activated_at,created_at,updated_at) VALUES ('customer-a','buyer@example.test','active',?,?,?)", [at,at,at]],
    ["INSERT INTO shop_customers (id,email_normalized,status,account_activated_at,created_at,updated_at) VALUES ('customer-b','other@example.test','active',?,?,?)", [at,at,at]],
    ["INSERT INTO shop_customer_identities (id,customer_id,provider,external_subject,verified_at,created_at,updated_at) VALUES ('email-a','customer-a','email','buyer@example.test',?,?,?)", [at,at,at]],
    ["INSERT INTO shop_orders (id,order_number,order_reference,public_token_hash,customer_id,status,payment_status,fulfillment_status,currency,subtotal_minor,total_minor,customer_email_snapshot,paid_at,fulfilled_at,created_at,updated_at) VALUES ('order-a','OTP001','OTPREF','public-token-hash','customer-a','fulfilled','paid','fulfilled','USD',100,100,'buyer@example.test',?,?,?,?)", [at,at,at,at]],
    ["INSERT INTO shop_order_items (id,order_id,line_number,product_id,variant_id,product_slug_snapshot,sku_snapshot,product_title_snapshot,variant_title_snapshot,fulfillment_type,delivery_mode,quantity,unit_price_minor,subtotal_minor,total_minor,fulfillment_status,created_at,updated_at) VALUES ('item-a','order-a',1,'otp-product','otp-variant','otp-synthetic','OTP-SYNTHETIC','Synthetic account','Email OTP', 'license_key','automatic',1,100,100,100,'fulfilled',?,?)", [at,at]],
    ["INSERT INTO shop_inventory_units (id,variant_id,status,crypto_version,key_version,ciphertext_b64,data_iv_b64,wrapped_dek_b64,wrap_iv_b64,key_fingerprint,imported_by,imported_at,updated_at,fulfilled_at) VALUES ('unit-a','otp-variant',?,'aes-256-gcm-envelope-v1','v1',?,?,?,?,?,'test',?,?,?)", [fulfilled ? "fulfilled":"available", "a".repeat(24), "a".repeat(16), "a".repeat(64), "a".repeat(16), "a".repeat(43),at,at,fulfilled ? at:null]],
    ["INSERT INTO shop_otp_inventory_aliases (id,inventory_unit_id,alias_id,provider_key,state,validated_at,created_at,updated_at) VALUES ('binding-a','unit-a','alias-a','synthetic','ready',?,?,?)", [at,at,at]],
    ["INSERT INTO shop_inventory_reservations (id,order_id,order_item_id,variant_id,status,quantity,expires_at,created_at,updated_at) VALUES ('reservation-a','order-a','item-a','otp-variant','converted',1,?,?,?)", [new Date(now+600000).toISOString(),at,at]],
    ["INSERT INTO shop_inventory_allocations (id,reservation_id,order_item_id,inventory_unit_id,status,created_at,updated_at,fulfilled_at) VALUES ('allocation-a','reservation-a','item-a','unit-a',?,?,?,?)", [fulfilled ? "fulfilled":"held",at,at,fulfilled ? at:null]],
    ["INSERT INTO shop_customer_sessions (token_hash,customer_id,auth_provider,created_at,last_seen_at,expires_at) VALUES (?,'customer-a','email',?,?,?)", [sessionHash,at,at,new Date(now+3600000).toISOString()]],
    ["INSERT INTO shop_otp_session_proofs (session_hash,customer_id,authenticated_at,expires_at,provider) VALUES (?,'customer-a',?,?,'email')", [sessionHash,at,new Date(now+600000).toISOString()]],
  ];
  for (const [sql, values] of statements) await db.prepare(sql).bind(...values).run();
  if (fulfilled) {
    await db.prepare(`INSERT INTO shop_otp_grants (id,customer_id,order_id,order_item_id,allocation_id,inventory_unit_id,alias_id,provider_key,state,activated_at,next_validation_at,created_at,updated_at)
      VALUES ('otp_allocation-a','customer-a','order-a','item-a','allocation-a','unit-a','alias-a','synthetic',?,?,?,?,?)`)
      .bind(active ? "active":"pending",active ? new Date(now-120000).toISOString():null,at,at,at).run();
  }
  return { token, secret, sessionHash, cookie: `__Host-shop_session=${token}`, now };
}
