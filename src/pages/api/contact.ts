import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const MAX_BODY_BYTES = 12_000;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const allowedLocales = new Set(["vi", "en", "ja", "zh"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactLocale = "vi" | "en" | "ja" | "zh";
type ResponseMode = "json" | "html";
type ContactField = "name" | "email" | "company" | "website" | "building" | "message";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  projectWebsite?: unknown;
  building?: unknown;
  message?: unknown;
  website?: unknown;
  locale?: unknown;
  turnstileToken?: unknown;
};

const resultCopy: Record<ContactLocale, { success: string; error: string; back: string }> = {
  vi: {
    success: "Tin nhắn đã được tiếp nhận. Tôi sẽ phản hồi sớm nhất có thể.",
    error: "Không thể gửi tin nhắn. Vui lòng kiểm tra thông tin và thử lại.",
    back: "Quay lại trang liên hệ",
  },
  en: {
    success: "Your message has been received. I will get back to you as soon as possible.",
    error: "The message could not be sent. Please review the form and try again.",
    back: "Back to contact",
  },
  ja: {
    success: "メッセージを受け取りました。できるだけ早くご連絡します。",
    error: "メッセージを送信できませんでした。入力内容を確認して、もう一度お試しください。",
    back: "お問い合わせに戻る",
  },
  zh: {
    success: "消息已收到。我会尽快回复您。",
    error: "消息暂时无法发送。请检查填写内容后重试。",
    back: "返回联系页面",
  },
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const localeFrom = (value: unknown): ContactLocale => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return allowedLocales.has(candidate) ? candidate as ContactLocale : "vi";
};

const contactPath = (locale: ContactLocale) => locale === "vi" ? "/contact" : `/${locale}/contact`;

const htmlResult = (locale: ContactLocale, kind: "success" | "error", status = 200) => {
  const copy = resultCopy[locale];
  const isError = kind === "error";
  const heading = isError ? copy.error : copy.success;
  return new Response(`<!doctype html>
<html lang="${locale === "zh" ? "zh-Hans" : locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${heading}</title>
</head>
<body>
  <main>
    <h1${isError ? ' role="alert"' : ' role="status"'}>${heading}</h1>
    <p><a href="${contactPath(locale)}">${copy.back}</a></p>
  </main>
</body>
</html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};

const errorResponse = (
  mode: ResponseMode,
  code: string,
  status: number,
  locale: ContactLocale = "vi",
  field?: ContactField,
) => mode === "html"
  ? htmlResult(locale, "error", status)
  : json({ ok: false, code, ...(field ? { field } : {}) }, status);

const successResponse = (mode: ResponseMode, request: Request, locale: ContactLocale, status = 201) => {
  if (mode === "json") return json({ ok: true }, status);
  const target = new URL("/api/contact", request.url);
  target.searchParams.set("result", "success");
  target.searchParams.set("locale", locale);
  return new Response(null, {
    status: 303,
    headers: {
      location: target.pathname + target.search,
      "cache-control": "no-store",
    },
  });
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const clean = (value: unknown, maxLength: number) => text(value).slice(0, maxLength);
const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

async function verifyTurnstile(token: string, secret: string, remoteip: string | null) {
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (remoteip) form.set("remoteip", remoteip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function hashIp(value: string | undefined, secret?: string) {
  if (!value) return "unknown";
  const bytes = new TextEncoder().encode(value);
  if (!secret) return hex(await crypto.subtle.digest("SHA-256", bytes));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, bytes));
}

async function readBody(request: Request, maxBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return null;
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
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

const formPayload = (raw: string): ContactPayload => {
  const form = new URLSearchParams(raw);
  return {
    name: form.get("name"),
    email: form.get("email"),
    company: form.get("company"),
    projectWebsite: form.get("website"),
    building: form.get("building"),
    message: form.get("message"),
    website: form.get("website_confirm"),
    locale: form.get("locale"),
    turnstileToken: form.get("turnstileToken") ?? form.get("cf-turnstile-response"),
  };
};

const invalidField = (payload: ContactPayload): ContactField | null => {
  const name = text(payload.name);
  const email = text(payload.email).toLowerCase();
  const company = text(payload.company);
  const projectWebsite = text(payload.projectWebsite);
  const building = text(payload.building);
  const message = text(payload.message);

  if (name.length < 2 || name.length > 80) return "name";
  if (email.length > 160 || !emailPattern.test(email)) return "email";
  if (company.length > 120) return "company";
  if (projectWebsite.length > 300 || (projectWebsite.length > 0 && !isHttpUrl(projectWebsite))) return "website";
  if (building.length < 10 || building.length > 1000) return "building";
  if (message.length < 20 || message.length > 1900) return "message";
  return null;
};

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("result") !== "success") {
    return json({ ok: false, code: "method_not_allowed" }, 405);
  }
  return htmlResult(localeFrom(url.searchParams.get("locale")), "success");
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const mode: ResponseMode = mediaType === "application/x-www-form-urlencoded" ? "html" : "json";
  if (mediaType !== "application/json" && mediaType !== "application/x-www-form-urlencoded") {
    return errorResponse(mode, "invalid_content_type", 415);
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? 0 : Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return errorResponse(mode, "invalid_content_length", 400);
  }
  if (contentLength > MAX_BODY_BYTES) return errorResponse(mode, "payload_too_large", 413);

  let payload: ContactPayload;
  try {
    const raw = await readBody(request, MAX_BODY_BYTES);
    if (raw === null) return errorResponse(mode, "payload_too_large", 413);
    if (mediaType === "application/x-www-form-urlencoded") {
      payload = formPayload(raw);
    } else {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return errorResponse(mode, "invalid_payload", 400);
      }
      payload = parsed as ContactPayload;
    }
  } catch {
    return errorResponse(mode, mediaType === "application/json" ? "invalid_json" : "invalid_payload", 400);
  }

  const locale = localeFrom(payload.locale);
  if (clean(payload.website, 120)) return successResponse(mode, request, locale, 200);

  const field = invalidField(payload);
  if (field) return errorResponse(mode, "validation_failed", 400, locale, field);

  const name = text(payload.name);
  const email = text(payload.email).toLowerCase();
  const company = text(payload.company);
  const projectWebsite = text(payload.projectWebsite);
  const building = text(payload.building);
  const message = text(payload.message);
  const turnstileToken = clean(payload.turnstileToken, 2048);

  const bindings = env;
  const requestIp = clientAddress ?? request.headers.get("CF-Connecting-IP") ?? undefined;
  const hasTurnstileSiteKey = Boolean(bindings.TURNSTILE_SITE_KEY?.trim());
  const hasTurnstileSecret = Boolean(bindings.TURNSTILE_SECRET_KEY?.trim());
  const contactHashSecret = bindings.CONTACT_HASH_SECRET?.trim();
  if (hasTurnstileSiteKey !== hasTurnstileSecret) {
    return errorResponse(mode, "challenge_not_configured", 503, locale);
  }
  if (hasTurnstileSecret && !contactHashSecret) {
    return errorResponse(mode, "contact_hash_not_configured", 503, locale);
  }
  if (hasTurnstileSecret) {
    if (!turnstileToken) return errorResponse(mode, "challenge_required", 400, locale);
    const verified = await verifyTurnstile(turnstileToken, bindings.TURNSTILE_SECRET_KEY!, requestIp ?? null);
    if (!verified) return errorResponse(mode, "challenge_failed", 400, locale);
  }

  if (!bindings.CONTACT_DB) return errorResponse(mode, "contact_not_configured", 503, locale);

  const id = crypto.randomUUID();
  const userAgent = clean(request.headers.get("user-agent"), 300);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const ipHash = await hashIp(requestIp, contactHashSecret);
  const storedMessage = `${building}\n\n${message}`;

  try {
    const cleanup = bindings.CONTACT_DB.prepare(
      "DELETE FROM contact_rate_limits WHERE expires_at <= ?",
    ).bind(now);
    const claim = bindings.CONTACT_DB.prepare(
      `INSERT INTO contact_rate_limits
        (ip_hash, window_started_at, expires_at, submission_count, last_claim_id)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         submission_count = contact_rate_limits.submission_count + 1,
         last_claim_id = excluded.last_claim_id
       WHERE contact_rate_limits.submission_count < ?`,
    ).bind(ipHash, now, now + RATE_LIMIT_WINDOW_MS, id, RATE_LIMIT_MAX);
    const insert = bindings.CONTACT_DB.prepare(
      `INSERT INTO contact_submissions
        (id, name, email, company, project_website, message, locale, user_agent, ip_hash, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM contact_rate_limits
         WHERE ip_hash = ? AND last_claim_id = ? AND expires_at > ?
       )`,
    ).bind(
      id,
      name,
      email,
      company || null,
      projectWebsite || null,
      storedMessage,
      locale,
      userAgent,
      ipHash,
      createdAt,
      ipHash,
      id,
      now,
    );
    const enqueueConfirmation = bindings.CONTACT_DB.prepare(
      `INSERT INTO transactional_email_outbox
        (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
       SELECT ?, 'contact.submission.confirmed', 'contact_submission', id, ?, 'pending', ?, ?, ?
       FROM contact_submissions WHERE id = ?`,
    ).bind(crypto.randomUUID(), `contact-confirmation:${id}`, createdAt, createdAt, createdAt, id);

    // D1 executes a batch as one transaction, so a concurrent request cannot
    // replace the claim between incrementing the counter and storing the message.
    const [, claimResult, insertResult] = await bindings.CONTACT_DB.batch([cleanup, claim, insert, enqueueConfirmation]);
    if (Number(claimResult.meta?.changes ?? 0) === 0 || Number(insertResult.meta?.changes ?? 0) === 0) {
      return errorResponse(mode, "rate_limited", 429, locale);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "contact_insert_failed", id, message: error instanceof Error ? error.message : "unknown" }));
    return errorResponse(mode, "service_unavailable", 503, locale);
  }

  return successResponse(mode, request, locale);
};

export const ALL: APIRoute = () => json({ ok: false, code: "method_not_allowed" }, 405);
