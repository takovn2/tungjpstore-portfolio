import { sha256Base64Url } from "./crypto";
import { ShopConflictError } from "./repository";

export const SHOP_PAYMENT_PROOF_MAX_BYTES = 8 * 1024 * 1024;
export const SHOP_PAYMENT_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

type ProofBindings = {
  CONTENT_DB?: D1Database;
  MEDIA?: R2Bucket;
};

export type PaymentProofUpload = {
  bytes?: Uint8Array;
  filename?: string;
  mimeType?: string;
  transactionReference?: string | null;
};

export type PaymentProofMultipartResult = {
  upload: PaymentProofUpload;
} | {
  error: "invalid_content_type" | "payload_too_large" | "invalid_multipart";
};

/** Read a bounded multipart request before handing bytes to the storage layer. */
export async function readPaymentProofMultipart(request: Request): Promise<PaymentProofMultipartResult> {
  const contentType = request.headers.get("content-type")?.trim() || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return { error: "invalid_content_type" };
  const declared = Number(request.headers.get("content-length") || "0");
  const envelopeLimit = SHOP_PAYMENT_PROOF_MAX_BYTES + 256_000;
  if (Number.isFinite(declared) && declared > envelopeLimit) return { error: "payload_too_large" };
  if (!request.body) return { error: "invalid_multipart" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > envelopeLimit) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return { error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const form = await new Response(body.buffer, { headers: { "content-type": contentType } }).formData();
    const file = form.get("proof");
    const referenceValue = form.get("transactionReference");
    const transactionReference = typeof referenceValue === "string" ? referenceValue : null;
    if (!(file instanceof File) || file.size === 0) {
      return { upload: { transactionReference } };
    }
    return {
      upload: {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        mimeType: file.type,
        transactionReference,
      },
    };
  } catch {
    return { error: "invalid_multipart" };
  }
}

export type PaymentProofView = {
  id: string;
  orderId: string;
  paymentAttemptId: string | null;
  filename: string;
  mimeType: string;
  byteSize: number;
  transactionReference: string | null;
  status: "submitted" | "reviewed" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  downloadUrl?: string;
};

function safeFilename(value: string | undefined) {
  const cleaned = (value || "payment-proof").trim().replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180);
  return cleaned || "payment-proof";
}

function extensionFor(mimeType: string) {
  return mimeType === "application/pdf" ? "pdf"
    : mimeType === "image/png" ? "png"
      : mimeType === "image/webp" ? "webp"
        : mimeType === "image/gif" ? "gif" : "jpg";
}

function hasValidSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/gif") return bytes.length >= 6 && (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a");
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

function normalizeReference(value: string | null | undefined) {
  const reference = typeof value === "string" ? value.trim().slice(0, 180) : "";
  if (!reference) return null;
  if (!/^[A-Za-z0-9:_./+=\- ]{4,180}$/.test(reference)) throw new ShopConflictError("invalid_transaction_reference");
  return reference;
}

export async function listPaymentProofs(db: D1Database, orderId: string, downloadBase?: string): Promise<PaymentProofView[]> {
  const rows = await db.prepare(`SELECT id, order_id AS orderId, payment_attempt_id AS paymentAttemptId,
      filename, mime_type AS mimeType, byte_size AS byteSize, transaction_reference AS transactionReference,
      status, review_note AS reviewNote, created_at AS createdAt, reviewed_at AS reviewedAt
    FROM shop_payment_proofs WHERE order_id = ? ORDER BY created_at DESC LIMIT 20`).bind(orderId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: String(row.id), orderId: String(row.orderId), paymentAttemptId: row.paymentAttemptId ? String(row.paymentAttemptId) : null,
    filename: String(row.filename), mimeType: String(row.mimeType), byteSize: Number(row.byteSize) || 0,
    transactionReference: row.transactionReference ? String(row.transactionReference) : null,
    status: row.status === "reviewed" || row.status === "rejected" ? row.status : "submitted",
    reviewNote: row.reviewNote ? String(row.reviewNote) : null, createdAt: String(row.createdAt), reviewedAt: row.reviewedAt ? String(row.reviewedAt) : null,
    ...(downloadBase ? { downloadUrl: `${downloadBase.replace(/\/$/, "")}/${encodeURIComponent(String(row.id))}` } : {}),
  }));
}

export async function submitPaymentProof(
  bindings: ProofBindings,
  input: { orderId: string; upload: PaymentProofUpload; actor: string },
) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  const db = bindings.CONTENT_DB;
  const order = await db.prepare(`SELECT id, status, payment_status AS paymentStatus
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{ id: string; status: string; paymentStatus: string }>();
  if (!order) throw new ShopConflictError("order_not_found");
  if (["cancelled", "expired", "refunded"].includes(order.status) || order.paymentStatus === "paid") throw new ShopConflictError("payment_not_available");
  const attempt = await db.prepare(`SELECT id, provider, rail, asset, network, status
    FROM shop_crypto_payment_attempts WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).bind(order.id).first<{ id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit" | "pay_order"; asset: "USDT" | "USDC"; network: string; status: string }>();
  if (!attempt) throw new ShopConflictError("crypto_payment_not_available");
  if (!["created", "awaiting_payment", "detected", "needs_review"].includes(attempt.status)) throw new ShopConflictError("payment_not_available");

  const reference = normalizeReference(input.upload.transactionReference);
  const bytes = input.upload.bytes;
  const mimeType = String(input.upload.mimeType || "").toLowerCase();
  const hasFile = Boolean(bytes && bytes.byteLength);
  if (!reference && !hasFile) throw new ShopConflictError("payment_proof_or_reference_required");
  if (hasFile) {
    if (!bindings.MEDIA) throw new Error("payment_proof_storage_unavailable");
    if (bytes!.byteLength > SHOP_PAYMENT_PROOF_MAX_BYTES || !SHOP_PAYMENT_PROOF_MIME_TYPES.has(mimeType) || !hasValidSignature(bytes!, mimeType)) {
      throw new ShopConflictError("invalid_payment_proof");
    }
  }

  const now = new Date().toISOString();
  const proofId = crypto.randomUUID();
  // Keep reference-only submissions in the same private proof ledger. A tiny
  // text object satisfies the existing NOT NULL storage contract while still
  // letting admins open the submitted transaction reference from the order.
  const storedBytes = hasFile
    ? bytes!
    : new TextEncoder().encode(`Transaction reference: ${reference}\n`);
  const storedMimeType = hasFile ? mimeType : "text/plain";
  const filename = hasFile ? safeFilename(input.upload.filename) : "transaction-reference.txt";
  const storageKey = `shop/payment-proofs/${now.slice(0, 10)}/${order.id}/${proofId}.${hasFile ? extensionFor(mimeType) : "txt"}`;
  if (!bindings.MEDIA) throw new Error("payment_proof_storage_unavailable");
  await bindings.MEDIA.put(storageKey, storedBytes, {
    httpMetadata: { contentType: storedMimeType, cacheControl: "private, no-store" },
    customMetadata: { filename, orderId: order.id, paymentAttemptId: attempt.id, verification: "manual" },
  });
  const sha256 = await sha256Base64Url(storedBytes);
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_payment_proofs
        (id, order_id, payment_attempt_id, storage_key, filename, mime_type, byte_size, sha256, transaction_reference, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`).bind(proofId, order.id, attempt.id, storageKey, filename, storedMimeType, storedBytes.byteLength, sha256, reference, now),
      db.prepare(`UPDATE shop_crypto_payment_attempts SET status = 'needs_review', customer_reference = COALESCE(?, customer_reference), updated_at = ?
        WHERE id = ? AND status IN ('created', 'awaiting_payment', 'detected', 'needs_review')`).bind(reference, now, attempt.id),
      db.prepare(`INSERT OR IGNORE INTO shop_crypto_payment_events
        (id, payment_attempt_id, order_id, provider, rail, provider_event_id, transaction_reference,
         asset, network, status, match_state, evidence_json, evidence_hash, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'needs_review', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), attempt.id, order.id, attempt.provider, attempt.rail, `customer-proof:${proofId}`,
        reference, attempt.asset, attempt.network, JSON.stringify({ source: "customer_manual_proof", proofId, actor: input.actor }), sha256, now, now,
      ),
    ]);
  } catch (error) {
    await bindings.MEDIA.delete(storageKey).catch(() => undefined);
    throw error;
  }
  return { id: proofId, orderId: order.id, paymentAttemptId: attempt.id, filename, mimeType: storedMimeType, byteSize: storedBytes.byteLength, transactionReference: reference, status: "submitted" as const, createdAt: now };
}

export async function getPaymentProofObject(db: D1Database, bucket: R2Bucket, proofId: string) {
  const row = await db.prepare(`SELECT storage_key AS storageKey, filename, mime_type AS mimeType, byte_size AS byteSize
    FROM shop_payment_proofs WHERE id = ? LIMIT 1`).bind(proofId).first<{ storageKey: string; filename: string; mimeType: string; byteSize: number }>();
  if (!row) return null;
  const object = await bucket.get(row.storageKey);
  if (!object) return null;
  return { object, filename: safeFilename(row.filename), mimeType: row.mimeType, byteSize: row.byteSize };
}
