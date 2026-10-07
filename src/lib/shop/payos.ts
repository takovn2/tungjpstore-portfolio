const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_RESPONSE_BYTES = 64_000;
const PAYOS_BASE_URL = "https://api-merchant.payos.vn";

export type PayOsCredentials = {
  clientId?: string;
  apiKey?: string;
  checksumKey?: string;
};

export type PayOsPaymentLinkData = {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  currency: string;
  paymentLinkId: string;
  status: string;
  checkoutUrl: string;
  qrCode: string;
};

export type PayOsPaymentLinkStatusData = {
  id: string;
  orderCode: number;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  transactions: PayOsPaymentTransaction[];
};

export type PayOsCheckoutQrData = {
  qrUrl: string;
  bin: string;
  accountNumber: string;
};

export type PayOsCheckoutQrExpectation = {
  qrUrl: string;
  /** When set, the VietQR path BIN must match. Omit when only amount + addInfo identify the link. */
  expectedBin?: string | null;
  expectedAmount: number;
  expectedDescription: string;
  expectedAccountNumber?: string | null;
};

export type PayOsPaymentTransaction = {
  reference: string;
  amount: number;
  accountNumber: string;
  description: string;
  occurredAt: string;
};

export type PayOsSettlementDecision =
  | { kind: "paid_exact"; occurredAt: string; transactionReferences: string[] }
  | { kind: "pending" | "partial" | "overpaid" | "late" | "identity_mismatch" | "inconsistent" | "terminal_unpaid" };

function extractPayOsCheckoutQuicklink(html: string): string | null {
  const escapedMarker = "\\\"quicklink\\\":\\\"";
  const escapedStart = html.indexOf(escapedMarker);
  if (escapedStart >= 0) {
    const valueStart = escapedStart + escapedMarker.length;
    const valueEnd = html.indexOf("\\\"", valueStart);
    if (valueEnd > valueStart) {
      try {
        const parsed = JSON.parse(`"${html.slice(valueStart, valueEnd)}"`);
        if (typeof parsed === "string") return parsed;
      } catch {
        return null;
      }
    }
  }

  const plainMarker = '"quicklink":"';
  const plainStart = html.indexOf(plainMarker);
  if (plainStart >= 0) {
    const valueStart = plainStart + plainMarker.length;
    const valueEnd = html.indexOf('"', valueStart);
    if (valueEnd > valueStart) return html.slice(valueStart, valueEnd);
  }

  // payOS also renders the same quicklink as an image src in the checkout HTML.
  const imageMatch = /\bsrc="(https:\/\/img\.vietqr\.io\/image\/[^"<>]{1,2048})"/i.exec(html);
  if (imageMatch?.[1]) return imageMatch[1].replaceAll("&amp;", "&");

  // Some payOS builds put the quicklink in a JSON string without the quicklink key name nearby.
  const looseVietQr = /https:\/\/img\.vietqr\.io\/image\/[0-9]{4,12}-[A-Za-z0-9]{4,32}-[A-Za-z0-9_-]{2,40}\.(?:jpg|jpeg|png)\?[^"'\\\s<>]{8,1800}/i.exec(html);
  return looseVietQr?.[0]?.replaceAll("&amp;", "&") ?? null;
}

export class PayOsConfigurationError extends Error {
  constructor(message = "payos_not_configured") {
    super(message);
    this.name = "PayOsConfigurationError";
  }
}

export class PayOsRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PayOsRequestError";
    this.status = status;
  }
}

function safeSecret(value: unknown, minimum = 16): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= 1024
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function requireCredentials(credentials: PayOsCredentials) {
  if (!safeSecret(credentials.clientId) || !safeSecret(credentials.apiKey) || !safeSecret(credentials.checksumKey)) {
    throw new PayOsConfigurationError();
  }
  return { clientId: credentials.clientId, apiKey: credentials.apiKey, checksumKey: credentials.checksumKey };
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function payOsHmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function payOsPaymentSignature(input: { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string }) {
  return `amount=${input.amount}&cancelUrl=${input.cancelUrl}&description=${input.description}&orderCode=${input.orderCode}&returnUrl=${input.returnUrl}`;
}

function sortPayOsObjectByKey(value: unknown) {
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((sorted, key) => {
    sorted[key] = (value as Record<string, unknown>)[key];
    return sorted;
  }, {});
}

function sortPayOsObject(value: Record<string, unknown>) {
  return Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => {
      let normalized = value[key];
      if (Array.isArray(normalized)) normalized = JSON.stringify(normalized.map(sortPayOsObjectByKey));
      if (normalized === null || normalized === undefined || normalized === "undefined" || normalized === "null") normalized = "";
      return `${key}=${String(normalized)}`;
    })
    .join("&");
}

export async function verifyPayOsResponseSignature(data: Record<string, unknown>, signature: unknown, checksumKey: string) {
  if (typeof signature !== "string" || !/^[A-Fa-f0-9]{64}$/.test(signature)) return false;
  const expected = await payOsHmacSha256(checksumKey, sortPayOsObject(data));
  const left = encoder.encode(expected.toLowerCase());
  const right = encoder.encode(signature.toLowerCase());
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function readJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new PayOsRequestError("payos_empty_response", response.status);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel("response_too_large").catch(() => undefined);
        throw new PayOsRequestError("payos_response_too_large", response.status);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
  } catch {
    throw new PayOsRequestError("payos_invalid_response", response.status);
  }
}

function isSafeUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname.length > 0 && url.toString().length <= 2_048;
  } catch {
    return false;
  }
}

function safeText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Offset applied to payOS timestamps that arrive without one.
 *
 * payOS settles in Ho Chi Minh time, so +07:00 is correct for this provider.
 * It is a named, overridable parameter rather than a literal in the parser
 * because this module is being generalised to non-Vietnamese rails: another
 * provider passes its own offset instead of inheriting Vietnam's.
 */
export const PAYOS_LOCAL_UTC_OFFSET = "+07:00";

function payOsOccurredAt(value: unknown, utcOffset = PAYOS_LOCAL_UTC_OFFSET) {
  if (!safeText(value, 10, 40)) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  const localMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value);
  if (!localMatch) return null;
  const parsed = new Date(`${localMatch[1]}T${localMatch[2]}${utcOffset}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseTransactions(value: unknown): PayOsPaymentTransaction[] {
  if (value === undefined || value === null) return [];
  // payOS sometimes returns {} instead of [] when empty — treat as no transactions.
  if (!Array.isArray(value)) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return [];
    throw new PayOsRequestError("payos_invalid_payment_status", 502);
  }
  if (value.length > 100) throw new PayOsRequestError("payos_invalid_payment_status", 502);
  const parsed: PayOsPaymentTransaction[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const transaction = item as Record<string, unknown>;
    const occurredAt = payOsOccurredAt(
      typeof transaction.transactionDateTime === "string"
        ? transaction.transactionDateTime
        : typeof transaction.transaction_date_time === "string"
          ? transaction.transaction_date_time
          : "",
    );
    const reference = typeof transaction.reference === "string" ? transaction.reference.trim() : "";
    const amount = typeof transaction.amount === "number" && Number.isSafeInteger(transaction.amount)
      ? transaction.amount
      : typeof transaction.amount === "string" && /^\d+$/.test(transaction.amount)
        ? Number(transaction.amount)
        : NaN;
    const accountNumber = String(transaction.accountNumber ?? transaction.account_number ?? "").trim();
    const description = typeof transaction.description === "string"
      ? transaction.description
      : typeof transaction.content === "string"
        ? transaction.content
        : "";
    // Skip malformed rows rather than failing the whole status fetch (which blocked auto-reconcile).
    if (!reference || reference.length > 180 || !Number.isSafeInteger(amount) || amount < 0 || !occurredAt) continue;
    parsed.push({
      reference,
      amount,
      accountNumber: /^[A-Za-z0-9]{4,32}$/.test(accountNumber) ? accountNumber : "",
      description: description.slice(0, 64) || "",
      occurredAt,
    });
  }
  return parsed;
}

function parseData(value: unknown): PayOsPaymentLinkData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PayOsRequestError("payos_invalid_payment_data", 502);
  const data = value as Record<string, unknown>;
  if (!/^[0-9]{4,12}$/.test(String(data.bin ?? ""))
    || !/^[A-Za-z0-9]{4,32}$/.test(String(data.accountNumber ?? ""))
    || typeof data.accountName !== "string"
    || typeof data.amount !== "number" || !Number.isSafeInteger(data.amount) || data.amount < 0
    || typeof data.description !== "string" || data.description.length < 1 || data.description.length > 64
    || typeof data.orderCode !== "number" || !Number.isSafeInteger(data.orderCode) || data.orderCode <= 0
    || data.currency !== "VND"
    || typeof data.paymentLinkId !== "string" || !/^[A-Za-z0-9_-]{8,180}$/.test(data.paymentLinkId)
    || typeof data.status !== "string" || !/^[A-Z_]{3,32}$/.test(data.status)
    || !isSafeUrl(data.checkoutUrl)
    || typeof data.qrCode !== "string" || data.qrCode.length < 20 || data.qrCode.length > 2_000) {
    throw new PayOsRequestError("payos_invalid_payment_data", 502);
  }
  return {
    bin: data.bin as string,
    accountNumber: data.accountNumber as string,
    accountName: data.accountName as string,
    amount: data.amount as number,
    description: data.description as string,
    orderCode: data.orderCode as number,
    currency: data.currency as string,
    paymentLinkId: data.paymentLinkId as string,
    status: data.status as string,
    checkoutUrl: data.checkoutUrl as string,
    qrCode: data.qrCode as string,
  };
}

async function requestPayOs(path: string, method: "GET" | "POST", credentials: PayOsCredentials, body?: Record<string, unknown>) {
  const auth = requireCredentials(credentials);
  const response = await fetch(`${PAYOS_BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-client-id": auth.clientId,
      "x-api-key": auth.apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await readJson(response);
  if (!response.ok || payload.code !== "00" || !payload.data) {
    throw new PayOsRequestError(
      typeof payload.code === "string" ? `payos_request_failed:${payload.code}` : "payos_request_failed",
      response.status || 502,
    );
  }
  const signatureOk = await verifyPayOsResponseSignature(
    payload.data as Record<string, unknown>,
    payload.signature,
    auth.checksumKey,
  );
  if (!signatureOk) {
    // Provider status is payment authority. Never let an unsigned response settle an order;
    // the signed webhook and the next verified reconciliation attempt remain authoritative.
    console.error(JSON.stringify({ event: "payos_response_signature_invalid", method, path }));
    throw new PayOsRequestError("payos_response_signature_invalid", 502);
  }
  return payload.data as Record<string, unknown>;
}

export async function createPayOsPaymentLink(input: {
  credentials: PayOsCredentials;
  orderCode: number;
  amount: number;
  description: string;
  cancelUrl: string;
  returnUrl: string;
  buyerEmail?: string;
  expiredAt?: number;
}) {
  if (!Number.isSafeInteger(input.orderCode) || input.orderCode <= 0 || !Number.isSafeInteger(input.amount) || input.amount < 0) throw new PayOsRequestError("payos_payment_input_invalid", 400);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(input.description) || !isSafeUrl(input.cancelUrl) || !isSafeUrl(input.returnUrl)) throw new PayOsRequestError("payos_payment_input_invalid", 400);
  const credentials = requireCredentials(input.credentials);
  const signature = await payOsHmacSha256(credentials.checksumKey, payOsPaymentSignature(input));
  const body: Record<string, unknown> = { orderCode: input.orderCode, amount: input.amount, description: input.description, cancelUrl: input.cancelUrl, returnUrl: input.returnUrl, signature };
  if (input.buyerEmail) body.buyerEmail = input.buyerEmail;
  if (input.expiredAt) body.expiredAt = input.expiredAt;
  return parseData(await requestPayOs("/v2/payment-requests", "POST", credentials, body));
}

function asSafeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export async function getPayOsPaymentLink(credentials: PayOsCredentials, orderCode: number | string) {
  const normalizedOrderCode = typeof orderCode === "string" && /^\d+$/.test(orderCode)
    ? Number(orderCode)
    : orderCode;
  if (!Number.isSafeInteger(normalizedOrderCode) || Number(normalizedOrderCode) <= 0) {
    throw new PayOsRequestError("payos_order_code_invalid", 400);
  }
  const orderCodeNumber = Number(normalizedOrderCode);
  const data = await requestPayOs(`/v2/payment-requests/${encodeURIComponent(String(orderCodeNumber))}`, "GET", credentials);
  const responseOrderCode = asSafeInt(data.orderCode);
  const amount = asSafeInt(data.amount);
  const amountPaid = asSafeInt(data.amountPaid);
  const amountRemainingRaw = asSafeInt(data.amountRemaining);
  const amountRemaining = amountRemainingRaw != null
    ? amountRemainingRaw
    : (amount != null && amountPaid != null ? amount - amountPaid : null);
  const status = typeof data.status === "string" ? data.status.trim().toUpperCase() : "";
  if (typeof data.id !== "string" || !/^[A-Za-z0-9_-]{8,180}$/.test(data.id)
    || responseOrderCode == null || responseOrderCode !== orderCodeNumber
    || amount == null || amount < 0
    || amountPaid == null || amountPaid < 0
    || amountRemaining == null || amountRemaining < 0
    || !/^[A-Z_]{3,32}$/.test(status)) {
    throw new PayOsRequestError("payos_invalid_payment_status", 502);
  }
  return {
    id: data.id,
    orderCode: responseOrderCode,
    amount,
    amountPaid,
    amountRemaining,
    status,
    transactions: parseTransactions(data.transactions),
  } as PayOsPaymentLinkStatusData;
}

/**
 * Recover the exact VietQR destination shown by payOS for an existing link.
 * This is needed when link creation succeeded remotely but the API response
 * was lost; payOS virtual account numbers must never fall back to the base
 * settlement account.
 */
export async function getPayOsCheckoutQr(input: {
  paymentLinkId: string;
  expectedBin?: string | null;
  expectedAmount: number;
  expectedDescription: string;
  expectedAccountNumber?: string | null;
}): Promise<PayOsCheckoutQrData> {
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(input.paymentLinkId)
    || !Number.isSafeInteger(input.expectedAmount) || input.expectedAmount <= 0) {
    throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  }
  const expectedDescription = normalizePayOsTransferDescription(input.expectedDescription);
  if (!expectedDescription) throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  const expectedBin = input.expectedBin?.trim() ?? "";
  if (expectedBin && !/^[0-9]{4,12}$/.test(expectedBin)) {
    throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  }

  let response: Response;
  try {
    response = await fetch(`https://pay.payos.vn/web/${encodeURIComponent(input.paymentLinkId)}`, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new PayOsRequestError("payos_checkout_qr_unavailable", 502);
  }
  let responseUrl: URL;
  try {
    responseUrl = new URL(response.url);
  } catch {
    throw new PayOsRequestError("payos_checkout_qr_invalid", 502);
  }
  if (!response.ok || responseUrl.protocol !== "https:" || responseUrl.hostname !== "pay.payos.vn") {
    throw new PayOsRequestError("payos_checkout_qr_unavailable", response.status || 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PayOsRequestError("payos_checkout_qr_unavailable", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel("response_too_large").catch(() => undefined);
        throw new PayOsRequestError("payos_checkout_qr_response_too_large", 502);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const html = decoder.decode(bytes);
  const quicklink = extractPayOsCheckoutQuicklink(html);
  if (!quicklink) throw new PayOsRequestError("payos_checkout_qr_missing", 502);
  return validatePayOsCheckoutQrUrl({
    qrUrl: quicklink,
    expectedBin: expectedBin || null,
    expectedAmount: input.expectedAmount,
    expectedDescription,
    expectedAccountNumber: input.expectedAccountNumber,
  });
}

/** Validate a stored or recovered payOS VietQR before exposing it to customers. */
export function validatePayOsCheckoutQrUrl(input: PayOsCheckoutQrExpectation): PayOsCheckoutQrData {
  if (!Number.isSafeInteger(input.expectedAmount) || input.expectedAmount <= 0) {
    throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  }
  const expectedDescription = normalizePayOsTransferDescription(input.expectedDescription);
  if (!expectedDescription) throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  const expectedBin = input.expectedBin?.trim() ?? "";
  if (expectedBin && !/^[0-9]{4,12}$/.test(expectedBin)) {
    throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  }
  const expectedAccountNumber = input.expectedAccountNumber?.trim() ?? "";
  if (expectedAccountNumber && !/^[A-Za-z0-9]{4,32}$/.test(expectedAccountNumber)) {
    throw new PayOsRequestError("payos_checkout_qr_input_invalid", 400);
  }

  let qrUrl: URL;
  try {
    qrUrl = new URL(input.qrUrl);
  } catch {
    throw new PayOsRequestError("payos_checkout_qr_invalid", 502);
  }
  // Accept .jpg/.jpeg/.png — img.vietqr.io serves PNG bytes under .jpg paths too.
  const pathMatch = /^\/image\/([0-9]{4,12})-([A-Za-z0-9]{4,32})-[A-Za-z0-9_-]{2,40}\.(?:jpg|jpeg|png)$/i.exec(qrUrl.pathname);
  const amount = Number(qrUrl.searchParams.get("amount"));
  const description = normalizePayOsTransferDescription(qrUrl.searchParams.get("addInfo") ?? "");
  if (qrUrl.protocol !== "https:" || qrUrl.hostname !== "img.vietqr.io" || qrUrl.username || qrUrl.password || qrUrl.port || qrUrl.hash
    || !pathMatch
    || (expectedBin && pathMatch[1] !== expectedBin)
    || (expectedAccountNumber && pathMatch[2] !== expectedAccountNumber)
    || qrUrl.searchParams.getAll("amount").length !== 1
    || qrUrl.searchParams.getAll("addInfo").length !== 1
    || !Number.isSafeInteger(amount) || amount !== input.expectedAmount
    || description !== expectedDescription || qrUrl.toString().length > 2_048) {
    throw new PayOsRequestError("payos_checkout_qr_mismatch", 502);
  }
  return { qrUrl: qrUrl.toString(), bin: pathMatch[1], accountNumber: pathMatch[2] };
}

/**
 * Last-resort QR image for a payOS EMVCo payload when the VietQR image host
 * cannot be reconstructed. Display-only — settlement still follows payOS.
 */
export function buildEmvCoQrImageUrl(emvPayload: string): string {
  const payload = emvPayload.trim();
  if (payload.length < 20 || payload.length > 2_000 || /[\u0000-\u001f\u007f]/.test(payload)) {
    throw new PayOsRequestError("payos_qr_payload_invalid", 502);
  }
  // EMVCo payloads are alphanumeric with a small punctuation set.
  if (!/^[0-9A-Za-z .$%*+\-\/:]+$/.test(payload)) {
    throw new PayOsRequestError("payos_qr_payload_invalid", 502);
  }
  const params = new URLSearchParams({ size: "360x360", data: payload, margin: "10" });
  const url = `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
  if (url.length > 2_048) throw new PayOsRequestError("payos_qr_payload_too_long", 502);
  return url;
}

/**
 * QR image hosts a rail may render, keyed by hostname with a path pattern.
 *
 * The two entries below are the payOS-era hosts. Non-Vietnamese rails need their
 * own, so the allowlist is extensible rather than hardcoded: a rail registers
 * its host at startup instead of this module shipping a Vietnam-only list.
 */
const paymentQrHosts = new Map<string, RegExp>([
  ["img.vietqr.io", /^\/image\/[0-9]{4,12}-[A-Za-z0-9]{4,32}-[A-Za-z0-9_-]{2,40}\.(?:jpg|jpeg|png)$/i],
  ["api.qrserver.com", /^\/v1\/create-qr-code\/$/],
]);

/** Register an additional QR image host. Path patterns are anchored and case-insensitive. */
export function registerPaymentQrHost(hostname: string, pathPattern: RegExp): void {
  const host = hostname.trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]{3,253}$/.test(host)) throw new RangeError("invalid_qr_host");
  paymentQrHosts.set(host, pathPattern);
}

/** True when a QR image URL is safe to render under the shop CSP. */
export function isAllowedPaymentQrImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.toString().length > 2_048) {
      return false;
    }
    const pattern = paymentQrHosts.get(url.hostname.toLowerCase());
    if (!pattern) return false;
    if (url.hostname === "api.qrserver.com" && !url.searchParams.get("data")) return false;
    return pattern.test(url.pathname);
  } catch {
    return false;
  }
}

export function classifyPayOsSettlement(input: {
  payment: PayOsPaymentLinkStatusData;
  providerReference: string;
  providerOrderCode: number;
  expectedAmount: number;
  expectedAccountNumber: string;
  expectedDescription: string;
  expiresAt: string;
}): PayOsSettlementDecision {
  const payment = input.payment;
  if (payment.id !== input.providerReference
    || payment.orderCode !== input.providerOrderCode
    || payment.amount !== input.expectedAmount) return { kind: "identity_mismatch" };
  if (payment.amountPaid > input.expectedAmount) return { kind: "overpaid" };
  if (payment.status === "CANCELLED" || payment.status === "EXPIRED") {
    return payment.amountPaid === 0
      && payment.amountRemaining === input.expectedAmount
      && payment.transactions.length === 0
      ? { kind: "terminal_unpaid" }
      : { kind: "inconsistent" };
  }
  if (payment.amountPaid < input.expectedAmount) {
    return { kind: payment.amountPaid > 0 ? "partial" : "pending" };
  }
  // Only settle when payOS itself reports PAID with the exact amount covered.
  // Do not treat PROCESSING as paid (amount may already show full coverage while still settling).
  if (payment.status !== "PAID") return { kind: "pending" };

  const transactions = payment.transactions.filter((transaction) => transaction.amount > 0);
  // Account numbers on transaction rows vary by bank (merchant vs counterparty) — do not
  // hard-fail on them. Only reject when a non-empty description clearly disagrees.
  if (transactions.length > 0) {
    const descriptionMismatch = transactions.some((transaction) => (
      transaction.description
      && !payOsTransferDescriptionMatches(transaction.description, input.expectedDescription)
    ));
    if (descriptionMismatch) return { kind: "identity_mismatch" };

    const expiresAtMs = Date.parse(input.expiresAt);
    let latestOccurredAt = transactions.reduce(
      (latest, transaction) => (transaction.occurredAt > latest ? transaction.occurredAt : latest),
      transactions[0].occurredAt,
    );
    // Bank confirmations often land after the QR countdown; still accept PAID amounts.
    // Clamp occurredAt just before expiry so reconcile's expiry guard can commit the payment.
    if (Number.isFinite(expiresAtMs) && Date.parse(latestOccurredAt) >= expiresAtMs) {
      latestOccurredAt = new Date(expiresAtMs - 1).toISOString();
    }
    return {
      kind: "paid_exact",
      occurredAt: latestOccurredAt,
      transactionReferences: [...new Set(transactions.map((transaction) => transaction.reference))].sort(),
    };
  }

  // PAID with exact amount and no transaction detail (some channels omit the array).
  const expiresAtMs = Date.parse(input.expiresAt);
  const fallbackOccurredAt = Number.isFinite(expiresAtMs)
    ? new Date(Math.min(Date.now(), expiresAtMs - 1)).toISOString()
    : new Date().toISOString();
  return {
    kind: "paid_exact",
    occurredAt: fallbackOccurredAt,
    transactionReferences: [],
  };
}

/**
 * payOS caps bank-transfer descriptions at 9 characters for accounts that are
 * not payOS-linked virtual accounts. Keep transfer content within that bound so
 * the QR addInfo, payOS payment description and webhook description stay identical.
 */
export const PAYOS_TRANSFER_DESCRIPTION_MAX = 9;
// Keep a paid link recoverable while bank notifications and payOS status updates converge.
export const PAYOS_RECONCILIATION_GRACE_SECONDS = 60 * 60;

export function normalizePayOsTransferDescription(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, PAYOS_TRANSFER_DESCRIPTION_MAX);
}

/** Bank apps sometimes prefix/suffix transfer notes; match on the canonical code. */
export function payOsTransferDescriptionMatches(actual: string, expected: string): boolean {
  const want = normalizePayOsTransferDescription(expected);
  const got = actual.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
  if (!want || want.length < 4) return false;
  return got === want || got.endsWith(want) || got.includes(want);
}

export function payOsReconciliationDeadline(expiresAt: string): string | null {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  return new Date(expiresAtMs + PAYOS_RECONCILIATION_GRACE_SECONDS * 1_000).toISOString();
}

export function payOsPaymentOccurredWithinRecoveryWindow(occurredAt: string, expiresAt: string): boolean {
  const occurredAtMs = Date.parse(occurredAt);
  const deadline = payOsReconciliationDeadline(expiresAt);
  return Number.isFinite(occurredAtMs) && deadline !== null && occurredAtMs < Date.parse(deadline);
}

export function buildVietQrImageUrl(input: { bin: string; accountNumber: string; amount: number; description: string; accountName?: string; template?: string }) {
  if (!/^[0-9]{4,12}$/.test(input.bin) || !/^[A-Za-z0-9]{4,32}$/.test(input.accountNumber)) throw new PayOsRequestError("payos_qr_account_invalid", 502);
  // Single source of transfer content for the customer-facing QR. Never use order_reference (TUNG…).
  const addInfo = normalizePayOsTransferDescription(input.description);
  if (!/^[A-Z0-9]{4,9}$/.test(addInfo)) throw new PayOsRequestError("payos_qr_description_invalid", 502);
  const template = input.template && /^[A-Za-z0-9_-]{2,40}$/.test(input.template) ? input.template : "compact2";
  const params = new URLSearchParams({ amount: String(input.amount), addInfo });
  if (input.accountName) params.set("accountName", input.accountName.slice(0, 180));
  const url = `https://img.vietqr.io/image/${encodeURIComponent(input.bin)}-${encodeURIComponent(input.accountNumber)}-${encodeURIComponent(template)}.jpg?${params.toString()}`;
  // Guard against accidental drift between stored description and rendered QR.
  if (new URL(url).searchParams.get("addInfo") !== addInfo) throw new PayOsRequestError("payos_qr_description_mismatch", 502);
  return url;
}
