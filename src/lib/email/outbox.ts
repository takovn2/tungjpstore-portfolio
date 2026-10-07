import type { TransactionalEmailProvider } from "./provider";
import { buildWelcomeEmail } from "./auth-templates";
import { buildContactConfirmationEmail, buildShopOrderEmail, type ShopOrderEmailTopic, type TransactionalEmailSource, type TransactionalEmailTopic } from "./templates";
import type { ShopEmailCryptoBindings } from "./delivery";

const MAX_ATTEMPTS = 8;
const DEFAULT_LIMIT = 8;
// Leave enough room for a bounded sequential batch without allowing a crashed
// worker to hold a message for more than one cron interval.
const DEFAULT_LEASE_SECONDS = 300;

type EmailOutboxRow = {
  id: string;
  topic: TransactionalEmailTopic;
  aggregate_type: "shop_order" | "shop_customer" | "contact_submission";
  aggregate_id: string;
  attempt_count: number;
};

type ClaimedEmail = {
  id: string;
  topic: TransactionalEmailTopic;
  aggregateType: EmailOutboxRow["aggregate_type"];
  aggregateId: string;
  attemptCount: number;
};

export type TransactionalEmailDispatchResult = {
  claimed: number;
  sent: number;
  failed: number;
  deadLettered: number;
};

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function leaseToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes.buffer);
}

function nowIso() {
  return new Date().toISOString();
}

function retryDelaySeconds(attemptCount: number) {
  const schedule = [30, 120, 600, 1_800, 7_200, 21_600, 43_200, 86_400];
  return schedule[Math.min(schedule.length - 1, Math.max(0, attemptCount - 1))] as number;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^email_[A-Za-z0-9._:-]{1,70}$/.test(error.message)) return error.message;
  return "email_delivery_failed";
}

function permanentFailure(code: string) {
  return new Set([
    "E_VALIDATION_ERROR",
    "E_FIELD_MISSING",
    "E_TOO_MANY_RECIPIENTS",
    "E_TOO_MANY_ATTACHMENTS",
    "E_SENDER_NOT_VERIFIED",
    "E_RECIPIENT_NOT_ALLOWED",
    "E_RECIPIENT_SUPPRESSED",
    "E_SENDER_DOMAIN_NOT_AVAILABLE",
    "E_CONTENT_TOO_LARGE",
    "E_HEADER_NOT_ALLOWED",
    "E_HEADER_USE_API_FIELD",
    "E_HEADER_VALUE_INVALID",
    "E_HEADER_VALUE_TOO_LONG",
    "E_HEADER_NAME_INVALID",
    "E_HEADERS_TOO_LARGE",
    "E_HEADERS_TOO_MANY",
    "email_recipient_invalid",
    "email_public_origin_invalid",
    "email_aggregate_not_found",
    "email_order_items_missing",
    "email_delivery_order_ineligible",
    "email_delivery_keys_incomplete",
  ]).has(code);
}

async function buildCustomerWelcomeEmail(
  db: D1Database,
  customerId: string,
  options: { origin: string; from: { email: string; name?: string } },
) {
  const customer = await db.prepare(`SELECT email_normalized, display_name, locale
    FROM shop_customers WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(customerId).first<{
      email_normalized: string | null;
      display_name: string;
      locale: string;
    }>();
  if (!customer?.email_normalized) throw new Error("email_aggregate_not_found");
  const locale = customer.locale === "en" || customer.locale === "ja" || customer.locale === "zh" ? customer.locale : "vi";
  const origin = new URL(options.origin).origin;
  return buildWelcomeEmail({
    recipient: { email: customer.email_normalized, name: customer.display_name },
    displayName: customer.display_name,
    accountUrl: `${origin}${locale === "vi" ? "" : `/${locale}`}/shop/account`,
    locale,
    from: options.from,
  });
}

async function claimEmails(db: D1Database, workerId: string, limit: number, leaseSeconds: number) {
  const now = nowIso();
  const rows = await db.prepare(`SELECT id, topic, aggregate_type, aggregate_id, attempt_count
    FROM transactional_email_outbox
    WHERE status IN ('pending', 'failed', 'processing') AND available_at <= ?
      AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
    ORDER BY available_at, created_at LIMIT ?`).bind(now, now, Math.max(1, Math.min(25, limit))).all<EmailOutboxRow>();
  if (!rows.results.length) return { messages: [] as ClaimedEmail[], token: null as string | null };
  const token = leaseToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.parse(now) + Math.max(30, Math.min(900, leaseSeconds)) * 1_000).toISOString();
  const messages: ClaimedEmail[] = [];
  for (const row of rows.results) {
    const result = await db.prepare(`UPDATE transactional_email_outbox
      SET status = 'processing', locked_by = ?, lock_token_hash = ?, lock_expires_at = ?,
        attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed', 'processing') AND available_at <= ?
        AND (lock_expires_at IS NULL OR lock_expires_at <= ?)`)
      .bind(workerId, tokenHash, expiresAt, now, row.id, now, now).run();
    if (result.meta.changes === 1) messages.push({
      id: row.id,
      topic: row.topic,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      attemptCount: row.attempt_count + 1,
    });
  }
  return { messages, token: messages.length ? token : null };
}

async function markSent(db: D1Database, message: ClaimedEmail, workerId: string, token: string, providerMessageId: string) {
  const now = nowIso();
  const result = await db.prepare(`UPDATE transactional_email_outbox
    SET status = 'sent', provider_message_id = ?, sent_at = ?, last_error_code = NULL,
      locked_by = NULL, lock_token_hash = NULL, lock_expires_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'processing' AND locked_by = ? AND lock_token_hash = ? AND lock_expires_at > ?`)
    .bind(providerMessageId.slice(0, 255), now, now, message.id, workerId, await sha256(token), now).run();
  if (result.meta.changes !== 1) throw new Error("email_outbox_lease_invalid");
}

async function markFailed(db: D1Database, message: ClaimedEmail, workerId: string, token: string, code: string) {
  const now = nowIso();
  const deadLetter = permanentFailure(code) || message.attemptCount >= MAX_ATTEMPTS;
  const nextAttempt = new Date(Date.parse(now) + retryDelaySeconds(message.attemptCount) * 1_000).toISOString();
  const result = await db.prepare(`UPDATE transactional_email_outbox
    SET status = ?, available_at = ?, last_error_code = ?, locked_by = NULL,
      lock_token_hash = NULL, lock_expires_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'processing' AND locked_by = ? AND lock_token_hash = ? AND lock_expires_at > ?`)
    .bind(deadLetter ? "dead_letter" : "failed", nextAttempt, code, now, message.id, workerId, await sha256(token), now).run();
  return { updated: result.meta.changes === 1, deadLetter };
}

export async function dispatchTransactionalEmails(input: {
  db: D1Database;
  source: TransactionalEmailSource;
  provider: TransactionalEmailProvider;
  from: { email: string; name?: string };
  origin: string;
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
  /** Key delivery is opt-in and must be enabled explicitly by the Worker. */
  deliverKeysByEmail?: boolean;
  cryptoBindings?: ShopEmailCryptoBindings;
}): Promise<TransactionalEmailDispatchResult> {
  const workerId = input.workerId ?? `email-${input.source}-cron`;
  const claim = await claimEmails(input.db, workerId, input.limit ?? DEFAULT_LIMIT, input.leaseSeconds ?? DEFAULT_LEASE_SECONDS);
  if (!claim.token) return { claimed: 0, sent: 0, failed: 0, deadLettered: 0 };
  let sent = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const message of claim.messages) {
    try {
      const email = input.source === "shop"
        ? message.topic === "shop.customer.welcome" && message.aggregateType === "shop_customer"
          ? await buildCustomerWelcomeEmail(input.db, message.aggregateId, { origin: input.origin, from: input.from })
          : message.aggregateType === "shop_order" && message.topic.startsWith("shop.order.")
            ? await buildShopOrderEmail(input.db, message.topic as ShopOrderEmailTopic, message.aggregateId, {
                origin: input.origin,
                from: input.from,
                deliverKeysByEmail: input.deliverKeysByEmail === true,
                cryptoBindings: input.cryptoBindings,
              })
            : (() => { throw new Error("email_aggregate_not_found"); })()
        : message.topic === "contact.submission.confirmed" && message.aggregateType === "contact_submission"
          ? await buildContactConfirmationEmail(input.db, message.aggregateId, { from: input.from })
          : (() => { throw new Error("email_aggregate_not_found"); })();
      const result = await input.provider.send(email);
      await markSent(input.db, message, workerId, claim.token, result.messageId);
      sent += 1;
    } catch (error) {
      const code = errorCode(error);
      const outcome = await markFailed(input.db, message, workerId, claim.token, code);
      if (outcome.updated) {
        failed += 1;
        if (outcome.deadLetter) deadLettered += 1;
      }
      console.error(JSON.stringify({ event: "transactional_email_failed", source: input.source, topic: message.topic, outboxId: message.id, code }));
    }
  }
  return { claimed: claim.messages.length, sent, failed, deadLettered };
}
