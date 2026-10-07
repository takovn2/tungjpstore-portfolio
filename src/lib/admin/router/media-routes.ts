import { adminError, adminJson } from "../http";
import { listMedia } from "../repository";
import { parseMediaCursor } from "../validation";
import { getPaymentProofObject } from "../../../lib/shop/payment-proofs";
import type { AdminRouteContext } from "./context";
import { requireDb } from "./context";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

function isRaster(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mime === "image/gif") return bytes.length >= 6 && (new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a" || new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a");
  if (mime === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mime === "image/avif") {
    if (bytes.length < 16 || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp") return false;
    const brands = new TextDecoder().decode(bytes.slice(8, Math.min(bytes.length, 64)));
    return brands.includes("avif") || brands.includes("avis");
  }
  return false;
}

function extensionFor(mime: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[mime] ?? "bin";
}

/** Read the whole multipart body with a hard cap before parsing the form. */
async function readMultipartBytes(request: Request, limit: number): Promise<Uint8Array | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit + 256_000) return adminError("payload_too_large", 413);
  if (!request.body) return adminError("empty_body", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit + 256_000) {
        await reader.cancel("payload_too_large");
        return adminError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function uploadMedia(request: Request, actor: string, bindings: AdminRouteContext["bindings"], id: string) {
  const bucket = bindings.MEDIA;
  if (!bucket) return adminError("media_not_configured", 503);
  let form: FormData;
  try {
    const body = await readMultipartBytes(request, MAX_MEDIA_BYTES);
    if (body instanceof Response) return body;
    const contentType = request.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) return adminError("invalid_content_type", 415);
    form = await new Response(body.buffer as ArrayBuffer, { headers: { "content-type": contentType } }).formData();
  } catch {
    return adminError("invalid_multipart", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return adminError("file_required", 400);
  if (file.size <= 0 || file.size > MAX_MEDIA_BYTES || !ALLOWED_MEDIA.has(file.type)) {
    return adminError("invalid_media", 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isRaster(bytes, file.type)) return adminError("invalid_media_signature", 400);
  const altValue = form.get("alt");
  const alt = typeof altValue === "string" && altValue.length <= 300 && !/[<>]/.test(altValue) ? altValue.trim() : "";
  const mediaId = crypto.randomUUID();
  const objectKey = `cms/${new Date().toISOString().slice(0, 10)}/${mediaId}.${extensionFor(file.type)}`;
  try {
    await bucket.put(objectKey, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { filename: file.name.slice(0, 180), alt },
    });
    const db = requireDb(bindings);
    if (!db) {
      await bucket.delete(objectKey);
      return adminError("content_not_configured", 503);
    }
    await db.batch([
      db.prepare(`INSERT INTO media
        (id, object_key, filename, mime_type, byte_size, alt, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(mediaId, objectKey, file.name.slice(0, 180) || `${mediaId}.${extensionFor(file.type)}`, file.type, file.size, alt, actor, new Date().toISOString()),
      db.prepare(`INSERT INTO audit_logs
        (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
        VALUES (?, ?, 'media.uploaded', 'media', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), actor, mediaId, id, JSON.stringify({ objectKey, mimeType: file.type, bytes: file.size }), new Date().toISOString()),
    ]);
  } catch (error) {
    try { await bucket.delete(objectKey); } catch { /* best effort cleanup of a newly-created object */ }
    console.error(JSON.stringify({ event: "admin_media_upload_failed", requestId: id, message: error instanceof Error ? error.message : "unknown" }));
    return adminError("media_upload_failed", 503);
  }
  const publicBase = bindings.MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  const publicUrl = publicBase && /^https:\/\//.test(publicBase) ? `${publicBase}/${objectKey}` : null;
  return adminJson({ ok: true, media: { id: mediaId, objectKey, mimeType: file.type, bytes: file.size, alt, adminPreviewUrl: `/admin/api/media/${mediaId}`, publicUrl } }, 201);
}

async function getMedia(mediaId: string, bindings: AdminRouteContext["bindings"]) {
  const bucket = bindings.MEDIA;
  const db = requireDb(bindings);
  if (!bucket || !db) return adminError("media_not_configured", 503);
  const row = await db.prepare("SELECT object_key, mime_type, filename, byte_size, alt FROM media WHERE id = ? AND status = 'active' LIMIT 1")
    .bind(mediaId).first<{ object_key: string; mime_type: string; filename: string; byte_size: number; alt: string }>();
  if (!row) return adminError("media_not_found", 404);
  const object = await bucket.get(row.object_key);
  if (!object) return adminError("media_not_found", 404);
  const headers = new Headers();
  headers.set("content-type", row.mime_type);
  headers.set("content-length", String(row.byte_size));
  headers.set("content-disposition", `inline; filename="${row.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function getMediaIntegrity(mediaId: string, bindings: AdminRouteContext["bindings"]) {
  const bucket = bindings.MEDIA;
  const db = requireDb(bindings);
  if (!bucket || !db) return adminError("media_not_configured", 503);
  const row = await db.prepare(`SELECT id, object_key, mime_type, byte_size, alt, status
    FROM media WHERE id = ? LIMIT 1`)
    .bind(mediaId).first<{ id: string; object_key: string; mime_type: string; byte_size: number; alt: string; status: string }>();
  if (!row) return adminError("media_not_found", 404);
  const object = await bucket.head(row.object_key);
  const sizeMatches = Boolean(object && object.size === row.byte_size);
  const mimeMatches = Boolean(object && object.httpMetadata?.contentType === row.mime_type);
  return adminJson({
    ok: true,
    integrity: {
      id: row.id,
      status: row.status,
      objectPresent: Boolean(object),
      sizeMatches,
      mimeMatches,
      hasAlt: Boolean(row.alt.trim()),
      healthy: row.status === "active" && Boolean(object) && sizeMatches && mimeMatches,
    },
  });
}

async function streamPaymentProof(ctx: AdminRouteContext): Promise<Response> {
  const proofDb = requireDb(ctx.bindings);
  if (!ctx.bindings.MEDIA || !proofDb) return adminError("payment_proof_storage_unavailable", 503);
  const result = await getPaymentProofObject(proofDb, ctx.bindings.MEDIA, ctx.segments[1]);
  if (!result) return adminError("payment_proof_not_found", 404);
  const headers = new Headers({
    "content-type": result.mimeType,
    "content-disposition": `inline; filename="${result.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    "content-length": String(result.byteSize),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  return new Response(result.object.body, { headers });
}

export async function handleMediaRoutes(ctx: AdminRouteContext): Promise<Response> {
  const { request, segments, method, bindings, user, requestId } = ctx;
  try {
    if (segments[0] === "media") {
      if (method === "POST" && segments.length === 1) return uploadMedia(request, user.email, bindings, requestId);
      if (method === "GET" && segments.length === 1) {
        const url = new URL(request.url);
        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null ? 24 : Number(rawLimit);
        const rawCursor = url.searchParams.get("cursor");
        const cursor = rawCursor ? parseMediaCursor(rawCursor) : null;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return adminError("invalid_media_query", 400);
        if (rawCursor && !cursor) return adminError("invalid_media_cursor", 400);
        const contentDb = requireDb(bindings);
        if (!contentDb) return adminError("content_not_configured", 503);
        return adminJson({ ok: true, ...(await listMedia(contentDb, {
          query: url.searchParams.get("q"),
          limit,
          cursor,
        })) });
      }
      if (method === "GET" && segments.length === 3 && segments[2] === "integrity") return getMediaIntegrity(segments[1], bindings);
      if (method === "GET" && segments.length === 2) return getMedia(segments[1], bindings);
      return adminError("method_not_allowed", 405);
    }
    if (segments[0] === "payment-proofs") {
      if (method !== "GET" || segments.length !== 2 || !/^[A-Za-z0-9_-]{16,120}$/.test(segments[1])) return adminError("method_not_allowed", 405);
      return streamPaymentProof(ctx);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_media_api_failed", requestId, message: error instanceof Error ? error.message : "unknown" }));
    return adminError("media_unavailable", 503);
  }
  return adminError("not_found", 404);
}
