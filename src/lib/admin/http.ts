const JSON_LIMIT = 512_000;

export function adminJson(body: Record<string, unknown>, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

export function adminError(code: string, status = 400, details?: Record<string, unknown>) {
  return adminJson({ ok: false, code, ...(details ?? {}) }, status);
}

export async function readJsonBody(request: Request, limit = JSON_LIMIT): Promise<unknown | Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return adminError("invalid_content_type", 415);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0) return adminError("invalid_content_length", 400);
  if (declared > limit) return adminError("payload_too_large", 413);
  if (!request.body) return adminError("empty_body", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("payload_too_large");
        return adminError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return adminError("invalid_json", 400);
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
