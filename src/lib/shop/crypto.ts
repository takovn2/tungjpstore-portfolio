import {
  SHOP_CRYPTO_VERSION,
  type EncryptedInventoryUnit,
  type EncryptedInventoryUnitRow,
  type JsonValue,
  type ShopBindings,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const HKDF_SALT = encoder.encode("tungjpstore.shop.crypto.v1");
const SECRET_BYTES = 32;

export type ShopCryptoContext = {
  keyVersion: string;
  wrappingKey: CryptoKey;
  fingerprintKey: CryptoKey;
};

export class ShopCryptoConfigurationError extends Error {
  readonly code = "shop_key_crypto_not_configured";

  constructor() {
    super("Shop key cryptography is unavailable");
    this.name = "ShopCryptoConfigurationError";
  }
}

export class ShopCryptoIntegrityError extends Error {
  readonly code = "shop_key_integrity_check_failed";

  constructor() {
    super("Encrypted inventory could not be verified");
    this.name = "ShopCryptoIntegrityError";
  }
}

function toBase64Url(bytes: ArrayBuffer | ArrayBufferView) {
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ShopCryptoIntegrityError();
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ShopCryptoIntegrityError();
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function lengthFramed(...parts: Array<string | Uint8Array>) {
  const encoded = parts.map((part) => typeof part === "string" ? encoder.encode(part) : part);
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

function timingSafeBytesEqual(left: Uint8Array, right: Uint8Array) {
  // Both fingerprints are fixed-size HMAC outputs; keep the comparison branchless
  // and avoid relying on Node-only crypto APIs in local smoke tests.
  let diff = left.byteLength ^ right.byteLength;
  const length = Math.max(left.byteLength, right.byteLength);
  for (let index = 0; index < length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

async function deriveKey(root: CryptoKey, info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]) {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info) },
    root,
    algorithm,
    false,
    usages,
  );
}

export async function createShopCryptoContext(secret: string, keyVersion: string): Promise<ShopCryptoContext> {
  const secretBytes = fromBase64Url(secret);
  if (secretBytes.byteLength !== SECRET_BYTES || !/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) {
    throw new ShopCryptoConfigurationError();
  }
  const root = await crypto.subtle.importKey("raw", secretBytes, "HKDF", false, ["deriveKey"]);
  const [wrappingKey, fingerprintKey] = await Promise.all([
    deriveKey(root, "shop-envelope-wrap-v1", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
    deriveKey(root, "shop-key-fingerprint-v1", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
  ]);
  return { keyVersion, wrappingKey, fingerprintKey };
}

export async function requireShopCrypto(bindings: Pick<ShopBindings, "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">) {
  if (!bindings.SHOP_KEY_ENCRYPTION_SECRET || !bindings.SHOP_KEY_ENCRYPTION_KEY_VERSION) {
    throw new ShopCryptoConfigurationError();
  }
  try {
    return await createShopCryptoContext(bindings.SHOP_KEY_ENCRYPTION_SECRET, bindings.SHOP_KEY_ENCRYPTION_KEY_VERSION);
  } catch (error) {
    if (error instanceof ShopCryptoConfigurationError) throw error;
    throw new ShopCryptoConfigurationError();
  }
}

export async function computeInventoryKeyFingerprint(context: ShopCryptoContext, variantId: string, plaintextKey: string) {
  const keyBytes = encoder.encode(plaintextKey);
  const signature = await crypto.subtle.sign("HMAC", context.fingerprintKey, lengthFramed(variantId, keyBytes));
  return toBase64Url(signature);
}

function inventoryAad(inventoryUnitId: string, variantId: string, keyVersion: string, purpose: "payload" | "dek") {
  return lengthFramed(SHOP_CRYPTO_VERSION, keyVersion, inventoryUnitId, variantId, purpose);
}

export async function sealInventoryKey(
  context: ShopCryptoContext,
  input: { inventoryUnitId: string; variantId: string; plaintextKey: string },
): Promise<EncryptedInventoryUnit> {
  if (!input.plaintextKey || input.plaintextKey.length > 4_096) throw new TypeError("invalid_inventory_key");
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const [ciphertext, rawDataKey, keyFingerprint] = await Promise.all([
    crypto.subtle.encrypt(
      { name: "AES-GCM", iv: dataIv, additionalData: inventoryAad(input.inventoryUnitId, input.variantId, context.keyVersion, "payload"), tagLength: 128 },
      dataKey,
      encoder.encode(input.plaintextKey),
    ),
    crypto.subtle.exportKey("raw", dataKey),
    computeInventoryKeyFingerprint(context, input.variantId, input.plaintextKey),
  ]);
  const wrappedDek = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv, additionalData: inventoryAad(input.inventoryUnitId, input.variantId, context.keyVersion, "dek"), tagLength: 128 },
    context.wrappingKey,
    rawDataKey,
  );
  return {
    id: input.inventoryUnitId,
    variantId: input.variantId,
    cryptoVersion: SHOP_CRYPTO_VERSION,
    keyVersion: context.keyVersion,
    ciphertextB64: toBase64Url(ciphertext),
    dataIvB64: toBase64Url(dataIv),
    wrappedDekB64: toBase64Url(wrappedDek),
    wrapIvB64: toBase64Url(wrapIv),
    keyFingerprint,
  };
}

export async function openInventoryKey(context: ShopCryptoContext, row: EncryptedInventoryUnitRow | EncryptedInventoryUnit) {
  if (row.cryptoVersion !== SHOP_CRYPTO_VERSION || row.keyVersion !== context.keyVersion) throw new ShopCryptoConfigurationError();
  try {
    const wrappedDek = fromBase64Url(row.wrappedDekB64);
    const wrapIv = fromBase64Url(row.wrapIvB64);
    const dataIv = fromBase64Url(row.dataIvB64);
    const ciphertext = fromBase64Url(row.ciphertextB64);
    if (wrapIv.byteLength !== 12 || dataIv.byteLength !== 12 || wrappedDek.byteLength !== 48) throw new ShopCryptoIntegrityError();
    const rawDataKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: wrapIv, additionalData: inventoryAad(row.id, row.variantId, row.keyVersion, "dek"), tagLength: 128 },
      context.wrappingKey,
      wrappedDek,
    );
    const dataKey = await crypto.subtle.importKey("raw", rawDataKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: dataIv, additionalData: inventoryAad(row.id, row.variantId, row.keyVersion, "payload"), tagLength: 128 },
      dataKey,
      ciphertext,
    );
    const plaintextKey = decoder.decode(plaintext);
    const expectedFingerprint = await computeInventoryKeyFingerprint(context, row.variantId, plaintextKey);
    const provided = fromBase64Url(row.keyFingerprint);
    const expected = fromBase64Url(expectedFingerprint);
    if (!timingSafeBytesEqual(provided, expected)) throw new ShopCryptoIntegrityError();
    return plaintextKey;
  } catch (error) {
    if (error instanceof ShopCryptoConfigurationError || error instanceof ShopCryptoIntegrityError) throw error;
    throw new ShopCryptoIntegrityError();
  }
}

export async function sha256Base64Url(value: string | Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : Uint8Array.from(value));
  return toBase64Url(digest);
}

export async function hashIdempotencyKey(namespace: string, key: string) {
  return sha256Base64Url(lengthFramed(namespace, key));
}

/** True when the Worker secret is a base64url-encoded 32-byte key usable for order tokens. */
export function isShopOrderTokenSecretConfigured(secret: string | undefined): boolean {
  if (!secret?.trim()) return false;
  try {
    return fromBase64Url(secret.trim()).byteLength === SECRET_BYTES;
  } catch {
    return false;
  }
}

export async function deriveShopOrderAccessToken(secret: string | undefined, namespace: string, idempotencyKey: string) {
  if (!isShopOrderTokenSecretConfigured(secret) || namespace.length < 1 || namespace.length > 100 || idempotencyKey.length < 20 || idempotencyKey.length > 200) {
    throw new Error("shop_order_token_not_configured");
  }
  const secretBytes = fromBase64Url(secret!.trim());
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(secretBytes).buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    lengthFramed("tungjpstore.shop.order-access.v1", namespace, idempotencyKey),
  );
  return toBase64Url(signature);
}

export async function deriveShopCheckoutSubjectHash(secret: string | undefined, subject: string) {
  if (!isShopOrderTokenSecretConfigured(secret) || subject.length < 1 || subject.length > 200) {
    throw new Error("shop_order_token_not_configured");
  }
  const secretBytes = fromBase64Url(secret!.trim());
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(secretBytes).buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, lengthFramed("tungjpstore.shop.checkout-subject.v1", subject));
  return toBase64Url(signature);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export async function hashCanonicalJson(value: JsonValue) {
  return sha256Base64Url(canonicalJson(value));
}

export function randomOpaqueToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) throw new TypeError("invalid_token_size");
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomOrderCode(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (const byte of bytes) result += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  return result;
}

export function createOrderIdentifiers(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    orderNumber: `TG-${day}-${randomOrderCode(8)}`,
    orderReference: `TUNG${randomOrderCode(10)}`,
  };
}
