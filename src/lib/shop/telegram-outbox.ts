import { claimWebhookOutbox, markWebhookDelivered, markWebhookFailed } from "./repository";
import { sendTelegramMessage, TelegramApiError } from "./telegram";
import { getTelegramBotCredential } from "./telegram-bot-config";
import type { ShopLocale } from "./types";

const RECIPIENT_HKDF_SALT = new TextEncoder().encode("tungjpstore.shop.telegram-recipient.salt.v1");
const RECIPIENT_KEY_INFO = new TextEncoder().encode("tungjpstore.shop.telegram-recipient.aes-gcm.v1");
const RECIPIENT_AAD_PREFIX = "tungjpstore.shop.telegram-recipient.v1";
const TELEGRAM_OUTBOX_LIMIT = 6;
const OUTBOX_LEASE_SECONDS = 90;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type TelegramRecipientBindings = Pick<Cloudflare.Env,
  "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION"
>;

type TelegramDispatchBindings = TelegramRecipientBindings & Pick<Cloudflare.Env,
  "TELEGRAM_BOT_TOKEN" | "TELEGRAM_TOKEN_ENCRYPTION_SECRET" | "TELEGRAM_TOKEN_ENCRYPTION_KEY_VERSION" |
  "TELEGRAM_TOKEN_ENCRYPTION_PREVIOUS_KEYS" | "SHOP_PUBLIC_ORIGIN"
>;

type TelegramRecipientEnvelope = {
  ciphertextB64: string;
  ivB64: string;
  keyVersion: string;
};

type TelegramNotificationRow = {
  order_number: string;
  locale: ShopLocale;
  total_minor: number;
  currency: string;
  payment_status: string;
  chat_ciphertext_b64: string;
  chat_iv_b64: string;
  key_version: string;
  bot_config_id?: string | null;
};

export type TelegramOutboxDispatchResult = {
  claimed: number;
  delivered: number;
  failed: number;
};

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
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("telegram_recipient_integrity_failed");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("telegram_recipient_integrity_failed");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function recipientAad(subjectHash: string, keyVersion: string) {
  return encoder.encode(`${RECIPIENT_AAD_PREFIX}\n${keyVersion}\n${subjectHash}`);
}

async function recipientKey(bindings: TelegramRecipientBindings) {
  const secret = bindings.SHOP_KEY_ENCRYPTION_SECRET?.trim() ?? "";
  const keyVersion = bindings.SHOP_KEY_ENCRYPTION_KEY_VERSION?.trim() ?? "";
  const secretBytes = fromBase64Url(secret);
  if (secretBytes.byteLength !== 32 || !/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) {
    throw new Error("telegram_recipient_crypto_not_configured");
  }
  const root = await crypto.subtle.importKey("raw", secretBytes, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: RECIPIENT_HKDF_SALT, info: RECIPIENT_KEY_INFO },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, keyVersion };
}

export function parseTelegramPrivateChatId(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!/^[1-9][0-9]{0,15}$/.test(normalized)) return null;
  const chatId = Number(normalized);
  return Number.isSafeInteger(chatId) && chatId > 0 ? chatId : null;
}

async function sealTelegramPrivateChatId(
  bindings: TelegramRecipientBindings,
  subjectHash: string,
  chatId: number,
): Promise<TelegramRecipientEnvelope> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(subjectHash) || !Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new Error("telegram_identity_invalid");
  }
  const { key, keyVersion } = await recipientKey(bindings);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: recipientAad(subjectHash, keyVersion), tagLength: 128 },
    key,
    encoder.encode(String(chatId)),
  );
  return { ciphertextB64: toBase64Url(ciphertext), ivB64: toBase64Url(iv), keyVersion };
}

async function openTelegramPrivateChatId(
  bindings: TelegramRecipientBindings,
  subjectHash: string,
  envelope: TelegramRecipientEnvelope,
) {
  const { key, keyVersion } = await recipientKey(bindings);
  if (envelope.keyVersion !== keyVersion) throw new Error("telegram_recipient_key_version_unavailable");
  try {
    const iv = fromBase64Url(envelope.ivB64);
    const ciphertext = fromBase64Url(envelope.ciphertextB64);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17 || ciphertext.byteLength > 128) {
      throw new Error("telegram_recipient_integrity_failed");
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: recipientAad(subjectHash, keyVersion), tagLength: 128 },
      key,
      ciphertext,
    );
    const chatId = parseTelegramPrivateChatId(decoder.decode(plaintext));
    if (!chatId) throw new Error("telegram_recipient_integrity_failed");
    return chatId;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("telegram_recipient_")) throw error;
    throw new Error("telegram_recipient_integrity_failed");
  }
}

export async function persistTelegramOrderRecipient(
  bindings: TelegramRecipientBindings,
  input: { orderId: string; subjectHash: string; chatId: number; botConfigId?: string },
) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  const order = await bindings.CONTENT_DB.prepare(`SELECT customer_id FROM shop_orders
    WHERE id = ? AND source_channel = 'telegram' AND checkout_subject_hash = ? LIMIT 1`)
    .bind(input.orderId, input.subjectHash)
    .first<{ customer_id: string | null }>();
  if (!order?.customer_id) throw new Error("telegram_order_recipient_unavailable");

  const envelope = await sealTelegramPrivateChatId(bindings, input.subjectHash, input.chatId);
  const now = new Date().toISOString();
  const botConfigId = input.botConfigId && /^[A-Za-z0-9_-]{8,80}$/.test(input.botConfigId) ? input.botConfigId : "environment";
  let result;
  try {
    result = await bindings.CONTENT_DB.prepare(`INSERT INTO shop_telegram_recipients
        (subject_hash, customer_id, chat_ciphertext_b64, chat_iv_b64, key_version, bot_config_id, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_hash, customer_id, bot_config_id) DO UPDATE SET
        chat_ciphertext_b64 = excluded.chat_ciphertext_b64, chat_iv_b64 = excluded.chat_iv_b64,
        key_version = excluded.key_version, bot_config_id = excluded.bot_config_id,
        verified_at = excluded.verified_at, updated_at = excluded.updated_at
      WHERE shop_telegram_recipients.customer_id = excluded.customer_id`)
      .bind(input.subjectHash, order.customer_id, envelope.ciphertextB64, envelope.ivB64, envelope.keyVersion, botConfigId, now, now, now).run();
  } catch (error) {
    if (!(error instanceof Error) || !/no such column|ON CONFLICT clause does not match/i.test(error.message)) throw error;
    result = await bindings.CONTENT_DB.prepare(`INSERT INTO shop_telegram_recipients
        (subject_hash, customer_id, chat_ciphertext_b64, chat_iv_b64, key_version, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_hash, customer_id) DO UPDATE SET
        chat_ciphertext_b64 = excluded.chat_ciphertext_b64, chat_iv_b64 = excluded.chat_iv_b64,
        key_version = excluded.key_version, verified_at = excluded.verified_at, updated_at = excluded.updated_at
      WHERE shop_telegram_recipients.customer_id = excluded.customer_id`)
      .bind(input.subjectHash, order.customer_id, envelope.ciphertextB64, envelope.ivB64, envelope.keyVersion, now, now, now).run();
  }
  if (result.meta.changes !== 1) throw new Error("telegram_recipient_persist_failed");
}

async function loadPaidOrderNotification(bindings: TelegramDispatchBindings, orderId: string) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  let row: TelegramNotificationRow | null = null;
  try {
    row = await bindings.CONTENT_DB.prepare(`SELECT o.order_number, o.locale, o.total_minor, o.currency, o.payment_status,
        r.chat_ciphertext_b64, r.chat_iv_b64, r.key_version, o.telegram_bot_config_id AS bot_config_id
      FROM shop_orders o JOIN shop_telegram_recipients r
        ON r.subject_hash = o.checkout_subject_hash AND r.customer_id = o.customer_id
        AND r.bot_config_id = o.telegram_bot_config_id
      WHERE o.id = ? AND o.source_channel = 'telegram' LIMIT 1`).bind(orderId).first<TelegramNotificationRow>();
  } catch (error) {
    if (!(error instanceof Error) || !/no such column/i.test(error.message)) throw error;
    row = await bindings.CONTENT_DB.prepare(`SELECT o.order_number, o.locale, o.total_minor, o.currency, o.payment_status,
        r.chat_ciphertext_b64, r.chat_iv_b64, r.key_version
      FROM shop_orders o JOIN shop_telegram_recipients r
        ON r.subject_hash = o.checkout_subject_hash AND r.customer_id = o.customer_id
      WHERE o.id = ? AND o.source_channel = 'telegram' LIMIT 1`).bind(orderId).first<TelegramNotificationRow>();
  }
  if (!row) throw new Error("telegram_recipient_unavailable");
  if (row.payment_status !== "paid") throw new Error("telegram_order_not_paid");
  const subject = await bindings.CONTENT_DB.prepare("SELECT checkout_subject_hash FROM shop_orders WHERE id = ? LIMIT 1")
    .bind(orderId)
    .first<{ checkout_subject_hash: string | null }>();
  if (!subject?.checkout_subject_hash) throw new Error("telegram_recipient_unavailable");
  const chatId = await openTelegramPrivateChatId(bindings, subject.checkout_subject_hash, {
    ciphertextB64: row.chat_ciphertext_b64,
    ivB64: row.chat_iv_b64,
    keyVersion: row.key_version,
  });
  return { ...row, chatId };
}

export function formatAmount(amountMinor: number, currency: string, locale: ShopLocale) {
  const localeTag = locale === "vi" ? "vi-VN" : locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "en-US";
  const normalizedCurrency = currency.toUpperCase();
  try {
    const formatter = new Intl.NumberFormat(localeTag, { style: "currency", currency: normalizedCurrency });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / (10 ** fractionDigits));
  } catch {
    return `${amountMinor.toLocaleString("en-US")} ${normalizedCurrency}`;
  }
}

function paidReply(
  row: Awaited<ReturnType<typeof loadPaidOrderNotification>>,
  orderId: string,
) {
  const amount = formatAmount(row.total_minor, row.currency, row.locale);
  const copy = {
    vi: `🎉 XÁC NHẬN THANH TOÁN THÀNH CÔNG!\n──────────────────────────────\n📦 Mã đơn hàng: \`${row.order_number}\`\n💰 Đã thanh toán: \`${amount}\`\n✅ Trạng thái: Đã xác thực giao dịch tự động\n──────────────────────────────\n👉 Bấm "🔑 Nhận & Xem Key" bên dưới để lấy mã bản quyền:`,
    en: `🎉 PAYMENT CONFIRMED!\n──────────────────────────────\n📦 Order: \`${row.order_number}\`\n💰 Amount: \`${amount}\`\n✅ Status: Verified automatically\n──────────────────────────────\n👉 Tap "🔑 Show Keys" below to reveal your license keys:`,
    ja: `🎉 お支払いが確認されました！\n──────────────────────────────\n📦 注文番号: \`${row.order_number}\`\n💰 金額: \`${amount}\`\n✅ 状態: 自動確認完了\n──────────────────────────────\n👉 「🔑 キーを表示」をタップしてキーを確認してください:`,
    zh: `🎉 支付成功！\n──────────────────────────────\n📦 订单号: \`${row.order_number}\`\n💰 金额: \`${amount}\`\n✅ 状态: 自动确认完毕\n──────────────────────────────\n👉 点击“🔑 查看密钥”获取授权信息:`,
  }[row.locale];
  const showKeys = { vi: "🔑 Nhận & Xem Key", en: "🔑 Show Keys", ja: "🔑 キーを表示", zh: "🔑 查看密钥" }[row.locale];
  const myOrders = { vi: "📦 Đơn của tôi", en: "📦 My Orders", ja: "📦 注文一覧", zh: "📦 我的订单" }[row.locale];
  const safeOrderId = /^[A-Za-z0-9-]{8,80}$/.test(orderId) ? orderId : "";
  const rows = [];
  if (safeOrderId) rows.push([{ text: showKeys, callback_data: `ko:${safeOrderId}` }]);
  rows.push([{ text: myOrders, callback_data: "my" }, { text: "🏠 Menu", callback_data: "menu" }]);
  return { text: copy, replyMarkup: { inline_keyboard: rows }, protectContent: true };
}

function dispatchFailure(error: unknown) {
  if (error instanceof TelegramApiError) {
    return { code: error.code, retryAfterSeconds: error.retryAfterSeconds ?? 60 };
  }
  const code = error instanceof Error && /^telegram_[A-Za-z0-9._:-]{1,72}$/.test(error.message)
    ? error.message
    : "telegram_delivery_failed";
  return { code, retryAfterSeconds: code.includes("recipient") || code.includes("identity") ? 300 : 60 };
}

export async function dispatchTelegramPaidOrderNotifications(
  bindings: TelegramDispatchBindings,
  workerId = "telegram-worker-cron",
): Promise<TelegramOutboxDispatchResult> {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  const claim = await claimWebhookOutbox(bindings.CONTENT_DB, {
    destination: "telegram_worker",
    workerId,
    limit: TELEGRAM_OUTBOX_LIMIT,
    leaseSeconds: OUTBOX_LEASE_SECONDS,
  });
  if (!claim.leaseToken || claim.messages.length === 0) return { claimed: 0, delivered: 0, failed: 0 };

  let delivered = 0;
  let failed = 0;
  for (const message of claim.messages) {
    try {
      if (message.topic !== "shop.order.paid" || message.aggregateType !== "shop_order") {
        throw new Error("telegram_topic_unsupported");
      }
      const notification = await loadPaidOrderNotification(bindings, message.aggregateId);
      const token = notification.bot_config_id && notification.bot_config_id !== "environment"
        ? (bindings.TELEGRAM_TOKEN_ENCRYPTION_SECRET
          ? (await getTelegramBotCredential(bindings.CONTENT_DB, bindings, notification.bot_config_id))?.token
          : undefined)
        : bindings.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error("telegram_bot_credential_unavailable");
      await sendTelegramMessage(
        token,
        notification.chatId,
        paidReply(notification, message.aggregateId),
      );
      if (!await markWebhookDelivered(bindings.CONTENT_DB, message.id, workerId, claim.leaseToken)) {
        throw new Error("telegram_outbox_lease_invalid");
      }
      delivered += 1;
    } catch (error) {
      const failure = dispatchFailure(error);
      if (await markWebhookFailed(bindings.CONTENT_DB, message.id, workerId, claim.leaseToken, failure.code, failure.retryAfterSeconds)) {
        failed += 1;
      }
    }
  }
  return { claimed: claim.messages.length, delivered, failed };
}
