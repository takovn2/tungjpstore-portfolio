import type { APIRoute } from "astro";
import { env, waitUntil } from "cloudflare:workers";
import { reconcilePaymentConfirmation } from "../../../../lib/shop/repository";
import { reconcileWalletTopup } from "../../../../lib/shop/wallet";
import { dispatchTelegramPaidOrderNotifications } from "../../../../lib/shop/telegram-outbox";
import {
  authenticatePayOsPaymentWebhook,
  ShopWebhookRequestError,
} from "../../../../lib/shop/webhook-auth";

export const prerender = false;

const bindings = env;

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

async function summarizeRejectedPayOsWebhook(request: {
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? null;
  try {
    const value = JSON.parse(await request.text()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { contentType, bodyType: valueType(value) };
    }
    const envelope = value as Record<string, unknown>;
    const data = envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
      ? envelope.data as Record<string, unknown>
      : null;
    return {
      contentType,
      topLevelKeys: Object.keys(envelope).sort(),
      topLevelTypes: Object.fromEntries(Object.entries(envelope).map(([key, field]) => [key, valueType(field)])),
      dataKeys: data ? Object.keys(data).sort() : [],
      dataTypes: data ? Object.fromEntries(Object.entries(data).map(([key, field]) => [key, valueType(field)])) : {},
    };
  } catch {
    return { contentType, bodyType: "unparseable" };
  }
}

function json(body: Record<string, unknown>, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

export const POST: APIRoute = async ({ request, params }) => {
  const startedAt = Date.now();
  const provider = params.provider;
  if (provider !== "payos") {
    return json({ ok: false, code: "provider_not_supported" }, 404);
  }
  if (!bindings.CONTENT_DB) return json({ ok: false, code: "shop_database_not_configured" }, 503);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const logWebhookTrail = async (errorCode: string, orderReference = "webhook") => {
    try {
      // Rejected requests are attacker-controlled. Bucket the provider event
      // key so a signature/body flood cannot append one D1 row per request.
      const bucket = Math.floor(Date.now() / 60_000);
      const eventKey = `webhook:${errorCode}:${orderReference.slice(0, 64)}:${bucket}`.slice(0, 180);
      await bindings.CONTENT_DB!.prepare(`INSERT OR IGNORE INTO shop_payment_events
        (id, provider, provider_event_id, payment_attempt_id, order_id, event_type, transaction_reference,
         amount_minor, currency, order_reference, payload_hash, signature_verified, match_state,
         processing_state, error_code, occurred_at, processed_at, created_at)
        VALUES (?, 'payos', ?, NULL, NULL, 'payment.attention', NULL, NULL, 'VND', ?, ?, 0, 'unmatched',
          'rejected', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(),
        eventKey,
        orderReference.slice(0, 64),
        id.replace(/-/g, "").slice(0, 43),
        errorCode.slice(0, 80),
        now,
        now,
        now,
      ).run();
    } catch {
      // Trail is best-effort; never block the webhook response path.
    }
  };

  let authenticated;
  const diagnosticRequest = request.clone();
  try {
    authenticated = await authenticatePayOsPaymentWebhook(request, bindings.PAYOS_CHECKSUM_KEY);
  } catch (error) {
    if (error instanceof ShopWebhookRequestError) {
      console.error(JSON.stringify({
        event: "shop_payment_webhook_rejected",
        requestId: id,
        provider,
        code: error.code,
        status: error.status,
        shape: await summarizeRejectedPayOsWebhook(diagnosticRequest),
      }));
      await logWebhookTrail(error.code);
      return json({ ok: false, code: error.code }, error.status);
    }
    console.error(JSON.stringify({
      event: "shop_payment_webhook_auth_failed",
      requestId: id,
      provider,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    await logWebhookTrail("payment_webhook_unavailable");
    return json({ ok: false, code: "payment_webhook_unavailable" }, 503);
  }

  if (authenticated.kind === "verification") {
    return json({ ok: true, received: true, verified: true });
  }
  const confirmation = authenticated.confirmation;

  try {
    if (confirmation.providerOrderCode) {
      try {
        const topup = await reconcileWalletTopup(bindings.CONTENT_DB, {
          providerEventId: confirmation.providerEventId,
          providerReference: confirmation.providerReference ?? null,
          providerOrderCode: confirmation.providerOrderCode,
          orderReference: confirmation.orderReference,
          amountMinor: confirmation.amountMinor,
          currency: confirmation.currency,
          destinationAccountNumber: confirmation.destinationAccountNumber ?? null,
          expectedAccountNumber: bindings.VIETQR_BANK_ACCOUNT ?? "",
          payloadHash: confirmation.payloadHash,
          occurredAt: confirmation.occurredAt,
        });
        if (topup.outcome === "credited" || topup.outcome === "already_processed") {
          return json({ ok: true, received: true, accepted: true, outcome: topup.outcome, eventId: topup.eventId });
        }
      } catch (error) {
        if (error instanceof Error && error.message !== "wallet_topup_not_matched") throw error;
        // Not a wallet top-up; continue with the normal order reconciliation.
      }
    }
    const reconciliation = await reconcilePaymentConfirmation(
      bindings.CONTENT_DB,
      confirmation,
      { id: provider, channel: "api" },
      id,
      { payOsAccountNumber: bindings.VIETQR_BANK_ACCOUNT },
    );
    const accepted = reconciliation.outcome === "paid" || reconciliation.outcome === "already_processed";
    if (accepted) {
      // Respond to payOS immediately while the paid notification is delivered
      // in the same Worker lifetime. Cron remains the durable fallback.
      waitUntil(dispatchTelegramPaidOrderNotifications({
        CONTENT_DB: bindings.CONTENT_DB,
        SHOP_KEY_ENCRYPTION_SECRET: bindings.SHOP_KEY_ENCRYPTION_SECRET,
        SHOP_KEY_ENCRYPTION_KEY_VERSION: bindings.SHOP_KEY_ENCRYPTION_KEY_VERSION,
        TELEGRAM_BOT_TOKEN: bindings.TELEGRAM_BOT_TOKEN,
        TELEGRAM_TOKEN_ENCRYPTION_SECRET: bindings.TELEGRAM_TOKEN_ENCRYPTION_SECRET,
        TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION: bindings.TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION,
        TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS: bindings.TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
        SHOP_PUBLIC_ORIGIN: bindings.SHOP_PUBLIC_ORIGIN,
      }, `telegram-payos-webhook:${id}`).catch((error) => {
        console.error(JSON.stringify({
          event: "telegram_paid_notification_deferred_failed",
          requestId: id,
          errorCode: error instanceof Error ? error.message : "unknown_error",
        }));
      }));
    }
    if (!accepted) {
      console.error(JSON.stringify({
        event: "shop_payment_webhook_not_accepted",
        requestId: id,
        outcome: reconciliation.outcome,
        providerEventId: confirmation.providerEventId,
      }));
    }
    console.log(JSON.stringify({
      event: "shop_payment_webhook_completed",
      requestId: id,
      outcome: reconciliation.outcome,
      totalMs: Date.now() - startedAt,
    }));
    return json({
      ok: true,
      received: true,
      accepted,
      outcome: reconciliation.outcome,
      eventId: reconciliation.eventId,
    }, accepted ? 200 : 202);
  } catch (error) {
    console.error(JSON.stringify({
      event: "shop_payment_webhook_reconciliation_failed",
      requestId: id,
      provider,
      providerEventId: confirmation.providerEventId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    await logWebhookTrail("payment_reconciliation_unavailable", confirmation.orderReference);
    return json({ ok: false, code: "payment_reconciliation_unavailable" }, 503);
  }
};

export const ALL: APIRoute = () => json(
  { ok: false, code: "method_not_allowed" },
  405,
  { allow: "POST" },
);
