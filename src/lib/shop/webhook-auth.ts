import { sha256Base64Url } from "./crypto";
import type { PaymentConfirmationInput } from "./types";
import { validatePaymentConfirmation } from "./validation";

const WEBHOOK_ENCODER = new TextEncoder();
const WEBHOOK_DECODER = new TextDecoder("utf-8", { fatal: true });
const SIGNATURE_PREFIX = "tung-shop-webhook-v1";
const MAX_WEBHOOK_BODY_BYTES = 32_000;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const GENERIC_BODY_KEYS = new Set([
  "orderReference",
  "amountMinor",
  "currency",
  "occurredAt",
  "providerReference",
  "transactionReference",
]);
const PAYOS_VERIFICATION_PROBE = Object.freeze({
  orderCode: 123,
  amount: 3_000,
  description: "VQRIO123",
  accountNumber: "12345678",
  reference: "TF230204212323",
  transactionDateTime: "2023-02-04 18:25:00",
  currency: "VND",
  paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
  code: "00",
  desc: "Thành công",
});

export type AuthenticatedPayOsPaymentWebhook =
  | { kind: "verification" }
  | { kind: "payment"; confirmation: PaymentConfirmationInput };

export class ShopWebhookRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ShopWebhookRequestError";
    this.code = code;
    this.status = status;
  }
}

function fromHex(value: string) {
  if (!/^[A-Fa-f0-9]{64}$/.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function signatureBytes(value: string | null) {
  const match = value?.trim().match(/^v1=([A-Fa-f0-9]{64})$/);
  return match ? fromHex(match[1]) : null;
}

function isSafeSecret(secret: string | undefined): secret is string {
  if (typeof secret !== "string" || /[\u0000-\u001f\u007f]/.test(secret)) return false;
  const byteLength = WEBHOOK_ENCODER.encode(secret).byteLength;
  return byteLength >= 32 && byteLength <= 1_024;
}

function isWebhookRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string"
    && value.length >= min
    && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
}

async function verifyHmacSha256(secret: string, signature: Uint8Array, payload: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    WEBHOOK_ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(signature);
  const payloadBytes = Uint8Array.from(payload);
  return crypto.subtle.verify("HMAC", key, signatureBytes.buffer, payloadBytes.buffer);
}

function canonicalSignaturePayload(input: {
  timestamp: string;
  eventId: string;
  provider: "generic_signed";
  pathname: string;
  body: Uint8Array;
}) {
  const context = WEBHOOK_ENCODER.encode(
    `${SIGNATURE_PREFIX}\n${input.timestamp}\n${input.eventId}\n${input.provider}\n${input.pathname}\n`,
  );
  const payload = new Uint8Array(context.byteLength + input.body.byteLength);
  payload.set(context);
  payload.set(input.body, context.byteLength);
  return payload;
}

export async function verifyShopWebhookSignature(input: {
  body: Uint8Array;
  providedSignature: string | null;
  secret: string | undefined;
  timestamp: string;
  eventId: string;
  provider: "generic_signed";
  pathname: string;
}) {
  if (!isSafeSecret(input.secret)) return false;
  const provided = signatureBytes(input.providedSignature);
  if (!provided) return false;
  return verifyHmacSha256(input.secret, provided, canonicalSignaturePayload(input));
}

async function readRawBody(request: Request) {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) throw new ShopWebhookRequestError("invalid_content_length", 400);
    if (Number(contentLengthHeader) > MAX_WEBHOOK_BODY_BYTES) throw new ShopWebhookRequestError("payload_too_large", 413);
  }
  if (!request.body) throw new ShopWebhookRequestError("empty_body", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        throw new ShopWebhookRequestError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new ShopWebhookRequestError("empty_body", 400);

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function parseTimestamp(value: string | null, nowMs: number) {
  if (!value || !/^\d{10,12}$/.test(value)) throw new ShopWebhookRequestError("webhook_timestamp_invalid", 401);
  const timestampSeconds = Number(value);
  if (!Number.isSafeInteger(timestampSeconds)) throw new ShopWebhookRequestError("webhook_timestamp_invalid", 401);
  const skewSeconds = Math.abs(Math.floor(nowMs / 1_000) - timestampSeconds);
  if (skewSeconds > MAX_CLOCK_SKEW_SECONDS) throw new ShopWebhookRequestError("webhook_timestamp_expired", 401);
  return value;
}

function parseEventId(value: string | null) {
  const eventId = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(eventId)) {
    throw new ShopWebhookRequestError("webhook_event_id_invalid", 400);
  }
  return eventId;
}

function parseGenericBody(body: Uint8Array, eventId: string, payloadHash: string) {
  let value: unknown;
  try {
    value = JSON.parse(WEBHOOK_DECODER.decode(body)) as unknown;
  } catch {
    throw new ShopWebhookRequestError("invalid_json", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }
  if (Object.keys(value).some((key) => !GENERIC_BODY_KEYS.has(key))) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }

  const parsed = validatePaymentConfirmation({
    ...(value as Record<string, unknown>),
    provider: "generic_signed",
    providerEventId: eventId,
    payloadHash,
    signatureVerified: true,
  });
  if (!parsed.ok) throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  return parsed.value;
}

function parseJsonBody(body: Uint8Array) {
  try {
    return JSON.parse(WEBHOOK_DECODER.decode(body)) as unknown;
  } catch {
    throw new ShopWebhookRequestError("invalid_json", 400);
  }
}

function canonicalPayOsData(value: Record<string, unknown>) {
  // Match payOS SDK: sort keys alphabetically; null/undefined/"null"/"undefined" → "";
  // arrays of objects are JSON-stringified with each element key-sorted.
  const keys = Object.keys(value).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    let field = value[key] as unknown;
    if (field === null || field === undefined || field === "null" || field === "undefined") {
      pairs.push(`${key}=`);
      continue;
    }
    if (Array.isArray(field)) {
      const sorted = field.map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, nestedKey) => {
            acc[nestedKey] = (item as Record<string, unknown>)[nestedKey];
            return acc;
          }, {});
        }
        return item;
      });
      pairs.push(`${key}=${JSON.stringify(sorted)}`);
      continue;
    }
    if (typeof field === "object") return null;
    if (typeof field === "number" && !Number.isFinite(field)) return null;
    pairs.push(`${key}=${String(field)}`);
  }
  return WEBHOOK_ENCODER.encode(pairs.join("&"));
}

function payOsOccurredAt(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  const localMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value);
  if (!localMatch) return null;
  const parsed = new Date(`${localMatch[1]}T${localMatch[2]}+07:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parsePayOsSignedEnvelope(value: unknown) {
  // Require the official envelope fields but allow payOS to add extra top-level keys over time.
  if (!isWebhookRecord(value)
    || typeof value.code !== "string"
    || typeof value.desc !== "string"
    || (value.success !== undefined && typeof value.success !== "boolean")
    || typeof value.signature !== "string"
    || !isWebhookRecord(value.data)) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }
  // Reject only if a required data field is missing; unknown extra data keys are ignored for parse
  // but still participate in HMAC via canonicalPayOsData (sorted full object).
  return { envelope: value, data: value.data, signature: value.signature };
}

function isPayOsVerificationProbe(data: Record<string, unknown>) {
  return Object.entries(PAYOS_VERIFICATION_PROBE).every(([key, expected]) => data[key] === expected);
}

function parsePayOsConfirmation(value: unknown, payloadHash: string) {
  if (!isWebhookRecord(value)) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }
  if (value.code !== "00" || value.success === false || !isWebhookRecord(value.data)) {
    throw new ShopWebhookRequestError("payment_event_not_successful", 422);
  }
  const data = value.data;
  // data.code may be missing on some channel payloads; treat non-"00" as failure when present.
  if (data.code != null && data.code !== "00") {
    throw new ShopWebhookRequestError("payment_event_not_successful", 422);
  }
  const orderCode = typeof data.orderCode === "number"
    ? data.orderCode
    : typeof data.orderCode === "string" && /^\d+$/.test(data.orderCode)
      ? Number(data.orderCode)
      : NaN;
  const amount = typeof data.amount === "number"
    ? data.amount
    : typeof data.amount === "string" && /^\d+$/.test(data.amount)
      ? Number(data.amount)
      : NaN;
  const accountNumber = String(data.accountNumber ?? "").trim();
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const reference = typeof data.reference === "string" ? data.reference.trim() : "";
  const paymentLinkId = typeof data.paymentLinkId === "string" ? data.paymentLinkId.trim() : "";
  const currency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "VND";
  const transactionDateTime = typeof data.transactionDateTime === "string" ? data.transactionDateTime : "";
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0
    || !Number.isSafeInteger(amount) || amount < 0
    || !isSafeText(description, 1, 64)
    || !/^[A-Za-z0-9]{4,32}$/.test(accountNumber)
    || !isSafeText(reference, 1, 180)
    || !isSafeText(transactionDateTime, 10, 40)
    || currency !== "VND"
    || !isSafeText(paymentLinkId, 1, 180)) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }
  const occurredAt = payOsOccurredAt(transactionDateTime);
  if (!occurredAt) throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  // Strip bank noise; keep full cleaned note (payOS codes are ≤9, banks may append text).
  const transferContent = description.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (transferContent.length < 4 || transferContent.length > 64) {
    throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  }
  const parsed = validatePaymentConfirmation({
    provider: "payos",
    providerEventId: reference,
    providerReference: paymentLinkId,
    providerOrderCode: orderCode,
    destinationAccountNumber: accountNumber,
    transactionReference: reference,
    // Transfer content (not TUNG order id).
    orderReference: transferContent,
    amountMinor: amount,
    currency,
    payloadHash,
    signatureVerified: true,
    occurredAt,
  });
  if (!parsed.ok) throw new ShopWebhookRequestError("invalid_payment_webhook", 422);
  return { confirmation: parsed.value, data, signature: value.signature };
}

export async function authenticateGenericPaymentWebhook(
  request: Request,
  secret: string | undefined,
  nowMs = Date.now(),
): Promise<PaymentConfirmationInput> {
  if (!isSafeSecret(secret)) throw new ShopWebhookRequestError("provider_not_configured", 503);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new ShopWebhookRequestError("invalid_content_type", 415);

  const timestamp = parseTimestamp(request.headers.get("x-tung-timestamp"), nowMs);
  const eventId = parseEventId(request.headers.get("x-tung-event-id"));
  const providedSignature = request.headers.get("x-tung-signature");
  if (!signatureBytes(providedSignature)) throw new ShopWebhookRequestError("webhook_signature_invalid", 401);
  const body = await readRawBody(request);
  const pathname = new URL(request.url).pathname;
  const signatureVerified = await verifyShopWebhookSignature({
    body,
    providedSignature,
    secret,
    timestamp,
    eventId,
    provider: "generic_signed",
    pathname,
  });
  if (!signatureVerified) throw new ShopWebhookRequestError("webhook_signature_invalid", 401);

  return parseGenericBody(body, eventId, await sha256Base64Url(body));
}

export async function authenticatePayOsPaymentWebhook(
  request: Request,
  secret: string | undefined,
): Promise<AuthenticatedPayOsPaymentWebhook> {
  if (!isSafeSecret(secret)) throw new ShopWebhookRequestError("provider_not_configured", 503);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new ShopWebhookRequestError("invalid_content_type", 415);

  const body = await readRawBody(request);
  const value = parseJsonBody(body);
  const signed = parsePayOsSignedEnvelope(value);
  const signature = typeof signed.signature === "string" ? fromHex(signed.signature.trim()) : null;
  const canonicalData = canonicalPayOsData(signed.data);
  if (!signature || !canonicalData || !await verifyHmacSha256(secret, signature, canonicalData)) {
    throw new ShopWebhookRequestError("webhook_signature_invalid", 401);
  }
  if (isPayOsVerificationProbe(signed.data)) return { kind: "verification" };

  const parsed = parsePayOsConfirmation(signed.envelope, await sha256Base64Url(body));
  return { kind: "payment", confirmation: parsed.confirmation };
}
