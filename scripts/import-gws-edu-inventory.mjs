#!/usr/bin/env node
/**
 * Encrypt + import Google Workspace Education Fundamentals inventory keys into CONTENT_DB (remote D1).
 *
 * Requires:
 *   SHOP_KEY_ENCRYPTION_SECRET  (32-byte base64url, same as Worker secret)
 *   SHOP_KEY_ENCRYPTION_KEY_VERSION  (default: v1)
 *
 * Usage:
 *   SHOP_KEY_ENCRYPTION_SECRET=... node scripts/import-gws-edu-inventory.mjs
 *   SHOP_KEY_ENCRYPTION_SECRET=... node scripts/import-gws-edu-inventory.mjs --local
 *   SHOP_KEY_ENCRYPTION_SECRET=... node scripts/import-gws-edu-inventory.mjs --keys-dir=artifacts/gws-edu-keys
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const HKDF_SALT = encoder.encode("tungjpstore.shop.crypto.v1");
const CRYPTO_VERSION = "aes-256-gcm-envelope-v1";

const VARIANT_FILES = [
  { id: "catalog-variant-gws-edu-2500u", sku: "GWS-EDU-FUND-2500U", file: "gws-edu-fund.txt" },
];

function parseArgs(argv) {
  const out = {
    keysDir: "artifacts/gws-edu-keys",
    remote: true,
    dryRun: false,
    batchSize: 25,
  };
  for (const arg of argv) {
    if (arg === "--local") out.remote = false;
    if (arg === "--dry-run") out.dryRun = true;
    if (arg.startsWith("--keys-dir=")) out.keysDir = arg.slice(11);
    if (arg.startsWith("--batch-size=")) out.batchSize = Math.max(1, Math.min(25, Number(arg.slice(13)) || 25));
  }
  return out;
}

function toBase64Url(bytes) {
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Buffer.from(view).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function lengthFramed(...parts) {
  const encoded = parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part));
  const total = encoded.reduce((sum, part) => sum + 4 + part.byteLength, 0);
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const part of encoded) {
    view.setUint32(offset, part.byteLength, false);
    offset += 4;
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function createCryptoContext(secret, keyVersion) {
  const secretBytes = fromBase64Url(secret);
  if (secretBytes.byteLength !== 32) {
    throw new Error("SHOP_KEY_ENCRYPTION_SECRET must decode to 32 bytes (base64url)");
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) throw new Error("invalid key version");
  const root = await subtle.importKey("raw", secretBytes, "HKDF", false, ["deriveKey"]);
  const wrappingKey = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode("shop-envelope-wrap-v1") },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const fingerprintKey = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode("shop-key-fingerprint-v1") },
    root,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return { keyVersion, wrappingKey, fingerprintKey };
}

function inventoryAad(inventoryUnitId, variantId, keyVersion, purpose) {
  return lengthFramed(CRYPTO_VERSION, keyVersion, inventoryUnitId, variantId, purpose);
}

async function sealKey(context, { inventoryUnitId, variantId, plaintextKey }) {
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const dataKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: dataIv,
      additionalData: inventoryAad(inventoryUnitId, variantId, context.keyVersion, "payload"),
      tagLength: 128,
    },
    dataKey,
    encoder.encode(plaintextKey),
  );
  const rawDataKey = await subtle.exportKey("raw", dataKey);
  const fingerprint = toBase64Url(
    await subtle.sign("HMAC", context.fingerprintKey, lengthFramed(variantId, encoder.encode(plaintextKey))),
  );
  const wrappedDek = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: wrapIv,
      additionalData: inventoryAad(inventoryUnitId, variantId, context.keyVersion, "dek"),
      tagLength: 128,
    },
    context.wrappingKey,
    rawDataKey,
  );
  return {
    id: inventoryUnitId,
    variantId,
    cryptoVersion: CRYPTO_VERSION,
    keyVersion: context.keyVersion,
    ciphertextB64: toBase64Url(ciphertext),
    dataIvB64: toBase64Url(dataIv),
    wrappedDekB64: toBase64Url(wrappedDek),
    wrapIvB64: toBase64Url(wrapIv),
    keyFingerprint: fingerprint,
  };
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInsertSql(units, actor, now, batchId) {
  const statements = [];
  statements.push(`INSERT OR IGNORE INTO shop_inventory_import_batches
    (id, variant_id, status, source_format, source_name, source_hash, idempotency_key_hash, request_hash,
     total_rows, valid_rows, duplicate_in_file_count, duplicate_in_stock_count, invalid_count,
     imported_count, skipped_count, failed_count, created_by, created_at, updated_at, completed_at)
  VALUES (
    ${sqlQuote(batchId)},
    ${sqlQuote(units[0].variantId)},
    'completed',
    'txt',
    'gws-edu-seed-import',
    NULL,
    ${sqlQuote(toBase64Url(crypto.createHash("sha256").update(batchId).digest()))},
    ${sqlQuote(toBase64Url(crypto.createHash("sha256").update(`${batchId}:commit`).digest()))},
    ${units.length}, ${units.length}, 0, 0, 0,
    ${units.length}, 0, 0,
    ${sqlQuote(actor)},
    ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)}
  );`);

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    statements.push(`INSERT OR IGNORE INTO shop_inventory_units
      (id, variant_id, status, crypto_version, key_version, ciphertext_b64, data_iv_b64,
       wrapped_dek_b64, wrap_iv_b64, key_fingerprint, imported_by, imported_at, updated_at,
       import_batch_id, import_line_number)
    VALUES (
      ${sqlQuote(unit.id)},
      ${sqlQuote(unit.variantId)},
      'available',
      ${sqlQuote(unit.cryptoVersion)},
      ${sqlQuote(unit.keyVersion)},
      ${sqlQuote(unit.ciphertextB64)},
      ${sqlQuote(unit.dataIvB64)},
      ${sqlQuote(unit.wrappedDekB64)},
      ${sqlQuote(unit.wrapIvB64)},
      ${sqlQuote(unit.keyFingerprint)},
      ${sqlQuote(actor)},
      ${sqlQuote(now)},
      ${sqlQuote(now)},
      ${sqlQuote(batchId)},
      ${index + 1}
    );`);
  }
  return statements.join("\n");
}

function runWranglerSql(sql, remote) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tmp = path.join(
    root,
    ".wrangler",
    "tmp",
    `gws-edu-import-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.sql`,
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, sql, "utf8");
  const args = ["wrangler", "d1", "execute", "tungjpstore-content", "--file", tmp];
  if (remote) args.push("--remote");
  else args.push("--local");
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  try {
    fs.unlinkSync(tmp);
  } catch {
    // ignore cleanup errors
  }
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`wrangler d1 execute failed with status ${result.status}`);
  }
  return result.stdout;
}

const args = parseArgs(process.argv.slice(2));
const secret = process.env.SHOP_KEY_ENCRYPTION_SECRET?.trim();
const keyVersion = process.env.SHOP_KEY_ENCRYPTION_KEY_VERSION?.trim() || "v1";
if (!secret) {
  console.error("Missing SHOP_KEY_ENCRYPTION_SECRET. Export the same base64url secret used by the Worker.");
  process.exit(1);
}

const context = await createCryptoContext(secret, keyVersion);
const keysDir = path.resolve(args.keysDir);
const actor = "seed:shop-gws-edu-inventory:2026-09-12:v1";
const now = new Date().toISOString();

let totalImported = 0;
for (const variant of VARIANT_FILES) {
  const filePath = path.join(keysDir, variant.file);
  const text = await fsPromises.readFile(filePath, "utf8");
  const keys = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!keys.length) {
    console.warn(`[skip] ${variant.sku}: empty file ${filePath}`);
    continue;
  }

  console.log(`[seal] ${variant.sku}: encrypting ${keys.length} keys…`);
  const units = [];
  for (const key of keys) {
    const id = crypto.randomUUID();
    units.push(
      await sealKey(context, {
        inventoryUnitId: id,
        variantId: variant.id,
        plaintextKey: key,
      }),
    );
  }

  for (let offset = 0; offset < units.length; offset += args.batchSize) {
    const chunk = units.slice(offset, offset + args.batchSize);
    const batchId = crypto.randomUUID();
    const sql = buildInsertSql(chunk, actor, now, batchId);
    if (args.dryRun) {
      console.log(`[dry-run] ${variant.sku} chunk ${offset / args.batchSize}: ${chunk.length} units`);
      continue;
    }
    runWranglerSql(sql, args.remote);
    totalImported += chunk.length;
    console.log(`[import] ${variant.sku}: ${Math.min(offset + args.batchSize, units.length)}/${units.length}`);
  }
}

console.log(`[done] imported ${totalImported} encrypted inventory units (${args.remote ? "remote" : "local"})`);
