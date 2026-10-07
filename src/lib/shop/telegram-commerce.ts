import { deriveShopCheckoutSubjectHash, sha256Base64Url } from "./crypto";
import { listPaymentProofs } from "./payment-proofs";
import { createVietQrPayment, deliverCustomerOwnedOrder, createTelegramShopCheckout, createGlbTelegramShopCheckout, reconcilePendingPayOsPayments, cryptoAccountUid, cryptoQrUrl, ShopConflictError } from "./service";
import { buildVietQrImageUrl, getPayOsCheckoutQr, validatePayOsCheckoutQrUrl } from "./payos";
import { consumeCheckoutRateLimit, getPublicVariantStock, previewCheckoutQuote } from "./repository";
import type { PublicProduct, PublicVariant, ShopBindings, ShopLocale } from "./types";
import { maskShopEmail, normalizeShopEmail } from "./validation";
import type { TelegramInlineKeyboardButton, TelegramReply, TelegramUser } from "./telegram";

// The original Telegram bot is the Vietnam storefront. Keep this contract
// deliberately separate from any future global bot so a caller cannot switch
// the legacy cart or checkout into a non-VND payment flow by sending locale
// input from an older client.
const LEGACY_TELEGRAM_LOCALE: ShopLocale = "vi";

export type TelegramCommerceBindings = Pick<
  ShopBindings,
  | "CONTENT_DB"
  | "VIETQR_BANK_ACCOUNT"
  | "SHOP_ORDER_TOKEN_SECRET"
  | "PAYOS_CLIENT_ID"
  | "PAYOS_API_KEY"
  | "PAYOS_CHECKSUM_KEY"
  | "SHOP_PUBLIC_ORIGIN"
  | "SHOP_KEY_ENCRYPTION_SECRET"
  | "SHOP_KEY_ENCRYPTION_KEY_VERSION"
>;

export type GlbTelegramCommerceBindings = Pick<
  ShopBindings,
  | "CONTENT_DB"
  | "SHOP_ORDER_TOKEN_SECRET"
  | "SHOP_PUBLIC_ORIGIN"
  | "SHOP_KEY_ENCRYPTION_SECRET"
  | "SHOP_KEY_ENCRYPTION_KEY_VERSION"
>;

export type TelegramOrderSummary = {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  discountCode: string | null;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  lineCount: number;
  itemCount: number;
  deliveryReadiness: TelegramDeliveryReadiness;
};

export type TelegramDeliveryReadiness = "awaiting_payment" | "ready" | "partial" | "delivered" | "manual" | "processing" | "closed";

type TelegramOrderAggregateRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  discount_code_snapshot: string | null;
  total_minor: number;
  created_at: string;
  paid_at: string | null;
  line_count: number;
  item_count: number;
  automatic_key_lines: number;
  fulfilled_automatic_key_lines: number;
  manual_lines: number;
};

function deliveryReadiness(row: Pick<TelegramOrderAggregateRow, "payment_status" | "fulfillment_status" | "automatic_key_lines" | "fulfilled_automatic_key_lines" | "manual_lines">): TelegramDeliveryReadiness {
  if (row.payment_status === "failed" || row.payment_status === "refunded") return "closed";
  if (row.payment_status !== "paid" && row.payment_status !== "partially_refunded") return "awaiting_payment";
  if (row.fulfillment_status === "fulfilled") return "delivered";
  if (row.fulfillment_status === "failed") return "processing";
  if (row.automatic_key_lines > 0 && row.fulfillment_status === "partial") return "partial";
  if (row.automatic_key_lines > 0 && row.fulfilled_automatic_key_lines < row.automatic_key_lines) return "ready";
  if (row.manual_lines > 0) return "manual";
  return "processing";
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

// QR/link recovery is an external side effect. Keep one short cross-isolate
// lease per payment attempt so concurrent Mini App refreshes cannot fan out to
// payOS. The timestamp is intentionally retained after success: once the
// fields are persisted no later request needs recovery, while a failed worker
// can retry after the bounded backoff window.
const TELEGRAM_PAYMENT_RECOVERY_BACKOFF_SECONDS = 15;

async function claimTelegramPaymentRecovery(db: D1Database, attemptId: string, claimedAt: string) {
  const result = await db.prepare(`UPDATE shop_payment_attempts
      SET payment_recovery_claimed_at = ?
      WHERE id = ? AND status IN ('created', 'awaiting_payment')
        AND (qr_image_url IS NULL OR checkout_url IS NULL OR provider_reference IS NULL
          OR provider_bank_bin IS NULL OR provider_account_number IS NULL)
        AND (payment_recovery_claimed_at IS NULL
          OR unixepoch(payment_recovery_claimed_at) <= unixepoch(?) - ?)`)
    .bind(claimedAt, attemptId, claimedAt, TELEGRAM_PAYMENT_RECOVERY_BACKOFF_SECONDS)
    .run();
  return result.meta.changes === 1;
}

function requireDb(bindings: Pick<ShopBindings, "CONTENT_DB">) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  return bindings.CONTENT_DB;
}

/** Stable synthetic mailbox for Telegram-native buyers (no web form). */
export function telegramSyntheticEmail(telegramUserId: number) {
  return normalizeShopEmail(`tg${telegramUserId}@telegram.tungjpstore.local`);
}

export function formatShopMoney(amountMinor: number, currency: string, locale: ShopLocale) {
  try {
    const formatter = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / (10 ** fractionDigits));
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

/**
 * Resolve or create a shop customer bound to a Telegram private-chat user id.
 * No email form: identity is the Telegram user id.
 */
export async function ensureTelegramCustomer(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  user: TelegramUser,
  locale: ShopLocale,
): Promise<{ customerId: string; email: string; displayName: string }> {
  const db = requireDb(bindings);
  const subject = String(user.id);
  const email = telegramSyntheticEmail(user.id);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim().slice(0, 120)
    || (user.username ? `@${user.username}` : `Telegram ${subject}`);
  const now = nowIso();

  const existing = await db.prepare(`SELECT c.id, c.email_normalized, c.display_name, c.status, c.deleted_at
    FROM shop_customer_identities i
    JOIN shop_customers c ON c.id = i.customer_id
    WHERE i.provider = 'telegram' AND i.external_subject = ?
    LIMIT 1`).bind(subject).first<{
      id: string;
      email_normalized: string | null;
      display_name: string;
      status: "active" | "blocked" | "archived";
      deleted_at: string | null;
    }>();

  if (existing && !existing.deleted_at) {
    if (existing.status === "blocked") throw new ShopConflictError("customer_blocked");
    await db.prepare(`UPDATE shop_customers SET
      display_name = CASE WHEN length(trim(display_name)) = 0 THEN ? ELSE display_name END,
      locale = CASE WHEN ? = 'vi' THEN 'vi' ELSE locale END,
      account_activated_at = COALESCE(account_activated_at, ?),
      updated_at = ?
      WHERE id = ?`).bind(displayName, locale, now, now, existing.id).run();
    await db.prepare(`UPDATE shop_customer_identities SET
      display_handle = ?, verified_at = COALESCE(verified_at, ?), updated_at = ?
      WHERE provider = 'telegram' AND external_subject = ?`).bind(
      user.username ? `@${user.username}` : subject,
      now,
      now,
      subject,
    ).run();
    return {
      customerId: existing.id,
      email: existing.email_normalized || email,
      displayName: existing.display_name || displayName,
    };
  }

  const emailCollision = await db.prepare(`SELECT 1 AS found FROM shop_customers
    WHERE email_normalized = ? AND deleted_at IS NULL LIMIT 1`).bind(email).first<{ found: number }>();
  // A pre-existing synthetic mailbox may have been claimed by a web buyer
  // before this guard shipped. Never attach that account to a new Telegram
  // identity; issue a private alias and keep the verified identity authoritative.
  const customerEmail = emailCollision
    ? normalizeShopEmail(`tg${subject}-${crypto.randomUUID().replaceAll("-", "")}@telegram.tungjpstore.local`)
    : email;
  const customerId = crypto.randomUUID();
  await db.prepare(`INSERT INTO shop_customers
    (id, email_normalized, email_masked, display_name, locale, marketing_consent, account_activated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(
    customerId,
    customerEmail,
    maskShopEmail(customerEmail),
    displayName,
    locale,
    now,
    now,
    now,
  ).run();

  await db.prepare(`INSERT INTO shop_customer_identities
    (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
    VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, external_subject) DO UPDATE SET
      customer_id = excluded.customer_id,
      display_handle = excluded.display_handle,
      verified_at = COALESCE(shop_customer_identities.verified_at, excluded.verified_at),
      updated_at = excluded.updated_at`).bind(
    crypto.randomUUID(),
    customerId,
    subject,
    user.username ? `@${user.username}` : subject,
    JSON.stringify({ source: "telegram_bot" }),
    now,
    now,
    now,
  ).run();

  return { customerId, email: customerEmail, displayName };
}

export async function listTelegramCustomerOrders(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  limit = 10,
  botConfigId?: string,
): Promise<TelegramOrderSummary[]> {
  const db = requireDb(bindings);
  const bounded = Math.max(1, Math.min(20, Math.floor(limit)));
  const rows = await db.prepare(`SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
      o.currency, o.subtotal_minor, o.discount_minor, o.discount_code_snapshot, o.total_minor, o.created_at, o.paid_at,
      COUNT(oi.id) AS line_count,
      COALESCE(SUM(oi.quantity), 0) AS item_count,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic' THEN 1 ELSE 0 END), 0) AS automatic_key_lines,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic' AND oi.fulfillment_status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled_automatic_key_lines,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'manual' OR oi.delivery_mode = 'manual' THEN 1 ELSE 0 END), 0) AS manual_lines
    FROM shop_orders o
    LEFT JOIN shop_order_items oi ON oi.order_id = o.id
    WHERE o.customer_id = ? AND (? IS NULL OR o.telegram_bot_config_id = ?)
    GROUP BY o.id
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ?`).bind(customerId, botConfigId ?? null, botConfigId ?? null, bounded).all<TelegramOrderAggregateRow>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    number: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    subtotalMinor: row.subtotal_minor,
    discountMinor: row.discount_minor,
    discountCode: row.discount_code_snapshot,
    totalMinor: row.total_minor,
    currency: row.currency,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    lineCount: Number(row.line_count) || 0,
    itemCount: Number(row.item_count) || 0,
    deliveryReadiness: deliveryReadiness(row),
  }));
}

export async function getTelegramOwnedOrder(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  orderId: string,
  botConfigId?: string,
) {
  const db = requireDb(bindings);
  if (botConfigId !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(botConfigId)) return null;
  const scopedBot = botConfigId ?? null;
  const query = `SELECT id, order_number, status, payment_status, fulfillment_status,
      currency, subtotal_minor, discount_minor, tax_minor, discount_code_snapshot, total_minor,
      created_at, paid_at, fulfilled_at, expires_at
    FROM shop_orders WHERE id = ? AND customer_id = ? AND source_channel = 'telegram'${scopedBot ? " AND telegram_bot_config_id = ?" : ""} LIMIT 1`;
  return (scopedBot ? db.prepare(query).bind(orderId, customerId, scopedBot) : db.prepare(query).bind(orderId, customerId)).first<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      fulfillment_status: string;
      currency: string;
      subtotal_minor: number;
      discount_minor: number;
      tax_minor: number;
      discount_code_snapshot: string | null;
      total_minor: number;
      created_at: string;
      paid_at: string | null;
      fulfilled_at: string | null;
      expires_at: string | null;
    }>();
}

export async function listTelegramOrderLines(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  orderId: string,
) {
  const db = requireDb(bindings);
  const rows = await db.prepare(`SELECT oi.id, oi.product_title_snapshot, oi.variant_title_snapshot,
      oi.sku_snapshot, oi.quantity, oi.unit_price_minor, oi.total_minor, oi.fulfillment_type,
      oi.delivery_mode, oi.inventory_policy, oi.fulfillment_status
    FROM shop_order_items oi
    JOIN shop_orders o ON o.id = oi.order_id AND o.customer_id = ?
    WHERE oi.order_id = ?
    ORDER BY oi.line_number ASC, oi.id ASC`).bind(customerId, orderId).all<{
      id: string;
      product_title_snapshot: string;
      variant_title_snapshot: string;
      sku_snapshot: string;
      quantity: number;
      unit_price_minor: number;
      total_minor: number;
      fulfillment_type: string;
      delivery_mode: string;
      inventory_policy: string;
      fulfillment_status: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    itemId: row.id,
    productTitle: row.product_title_snapshot,
    variantTitle: row.variant_title_snapshot,
    sku: row.sku_snapshot,
    quantity: Number(row.quantity) || 0,
    unitPriceMinor: Number(row.unit_price_minor) || 0,
    totalMinor: Number(row.total_minor) || 0,
    fulfillmentType: row.fulfillment_type,
    deliveryMode: row.delivery_mode,
    inventoryPolicy: row.inventory_policy,
    fulfillmentStatus: row.fulfillment_status,
  }));
}

export type TelegramCartItem = { variantId: string; quantity: number };

export type TelegramQuoteInput = {
  customerId: string;
  telegramUserId: number;
  locale: ShopLocale;
  items: TelegramCartItem[];
  discountCode?: string | null;
  pricingCurrency?: "VND" | "USD";
};

/**
 * Preview Telegram pricing without creating an order or reserving inventory.
 * The customer and checkout subject are still bound to the verified Telegram
 * identity so per-customer promotion limits match the real checkout path.
 */
export async function previewTelegramItems(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_ORDER_TOKEN_SECRET">,
  input: TelegramQuoteInput,
) {
  const db = requireDb(bindings);
  const telegramLocale = input.pricingCurrency === "USD" ? "en" as const : LEGACY_TELEGRAM_LOCALE;
  if (!input.items.length) throw new ShopConflictError("cart_empty");
  if (!/^[0-9]{1,32}$/.test(String(input.telegramUserId))) throw new ShopConflictError("telegram_identity_invalid");
  for (const item of input.items) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(item.variantId)) throw new ShopConflictError("variant_not_available");
  }

  // Resolve the exact session customer rather than trusting a synthetic email
  // derived from user input. This also supports collision-safe legacy aliases.
  const customer = await db.prepare(`SELECT c.email_normalized AS email, c.status
    FROM shop_customer_identities i
    JOIN shop_customers c ON c.id = i.customer_id
    WHERE i.provider = 'telegram' AND i.external_subject = ? AND i.customer_id = ?
      AND c.deleted_at IS NULL LIMIT 1`).bind(String(input.telegramUserId), input.customerId).first<{
        email: string | null;
        status: "active" | "blocked" | "archived";
      }>();
  if (!customer || !customer.email) throw new ShopConflictError("telegram_order_identity_mismatch");
  if (customer.status === "blocked") throw new ShopConflictError("customer_blocked");

  const quoteSubject = await deriveShopCheckoutSubjectHash(
    bindings.SHOP_ORDER_TOKEN_SECRET,
    `telegram-discount-quote:${input.telegramUserId}`,
  );
  const rate = await consumeCheckoutRateLimit(db, quoteSubject);
  if (!rate.allowed) throw new ShopConflictError("discount_quote_rate_limited");
  return previewCheckoutQuote(db, {
    items: input.items,
    locale: telegramLocale,
    customerEmail: customer.email,
    ...(input.pricingCurrency ? { pricingCurrency: input.pricingCurrency } : {}),
    ...(input.discountCode?.trim() ? { discountCode: input.discountCode.trim() } : {}),
  });
}

export type TelegramCart = {
  telegramUserId: string;
  locale: ShopLocale;
  discountCode: string | null;
  awaiting: "discount" | "quantity" | null;
  pendingQuantityVariantId: string | null;
  pendingQuantityMessageId: number | null;
  pendingQuantityUsesCaption: boolean;
  pendingQuantityExpiresAt: string | null;
  items: TelegramCartItem[];
  updatedAt: string;
  expiresAt: string;
};

const CART_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const CART_MAX_LINES = 8;
/** Align with schema max_per_order / stock-based buy limits (1..1000). */
const CART_MAX_QTY = 1000;
const QUANTITY_INPUT_TTL_MS = 15 * 60 * 1_000;

function parseCartItems(raw: string): TelegramCartItem[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { variantId?: unknown; quantity?: unknown };
      if (typeof row.variantId !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(row.variantId)) return [];
      const quantity = Math.max(1, Math.min(CART_MAX_QTY, Math.floor(Number(row.quantity) || 1)));
      return [{ variantId: row.variantId, quantity }];
    }).slice(0, CART_MAX_LINES);
  } catch {
    return [];
  }
}

export async function getTelegramCart(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  telegramUserId: number,
  locale: ShopLocale,
): Promise<TelegramCart> {
  const db = requireDb(bindings);
  const userId = String(telegramUserId);
  const now = Date.now();
  const row = await db.prepare(`SELECT telegram_user_id, locale, discount_code, awaiting,
      pending_quantity_variant_id, pending_quantity_message_id, pending_quantity_expires_at,
      pending_quantity_uses_caption,
      items_json, updated_at, expires_at
    FROM shop_telegram_carts WHERE telegram_user_id = ? LIMIT 1`).bind(userId).first<{
      telegram_user_id: string;
      locale: ShopLocale;
      discount_code: string | null;
      awaiting: "discount" | null;
      pending_quantity_variant_id: string | null;
      pending_quantity_message_id: number | null;
      pending_quantity_uses_caption: number | null;
      pending_quantity_expires_at: string | null;
      items_json: string;
      updated_at: string;
      expires_at: string;
    }>();
  if (!row || Date.parse(row.expires_at) <= now) {
    return {
      telegramUserId: userId,
      locale,
      discountCode: null,
      awaiting: null,
      pendingQuantityVariantId: null,
      pendingQuantityMessageId: null,
      pendingQuantityUsesCaption: false,
      pendingQuantityExpiresAt: null,
      items: [],
      updatedAt: nowIso(now),
      expiresAt: new Date(now + CART_TTL_MS).toISOString(),
    };
  }
  const pendingQuantityValid = Boolean(
    row.pending_quantity_variant_id
    && /^[A-Za-z0-9-]{8,80}$/.test(row.pending_quantity_variant_id)
    && Number.isSafeInteger(row.pending_quantity_message_id)
    && Number(row.pending_quantity_message_id) > 0
    && row.pending_quantity_expires_at
    && Date.parse(row.pending_quantity_expires_at) > now,
  );
  return {
    telegramUserId: row.telegram_user_id,
    // Existing rows may have been written by an earlier multilingual build.
    // Do not let that stale value leak into the Vietnam-only storefront.
    locale: LEGACY_TELEGRAM_LOCALE,
    discountCode: row.discount_code,
    awaiting: row.awaiting === "discount" ? "discount" : pendingQuantityValid ? "quantity" : null,
    pendingQuantityVariantId: pendingQuantityValid ? row.pending_quantity_variant_id : null,
    pendingQuantityMessageId: pendingQuantityValid ? row.pending_quantity_message_id : null,
    pendingQuantityUsesCaption: pendingQuantityValid && row.pending_quantity_uses_caption === 1,
    pendingQuantityExpiresAt: pendingQuantityValid ? row.pending_quantity_expires_at : null,
    items: parseCartItems(row.items_json),
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

async function saveTelegramCart(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  cart: TelegramCart,
) {
  const db = requireDb(bindings);
  const now = Date.now();
  const updatedAt = nowIso(now);
  const expiresAt = new Date(now + CART_TTL_MS).toISOString();
  const pendingQuantity = cart.awaiting === "quantity"
    && cart.pendingQuantityVariantId
    && cart.pendingQuantityMessageId
    && cart.pendingQuantityExpiresAt;
  await db.prepare(`INSERT INTO shop_telegram_carts
    (telegram_user_id, locale, discount_code, awaiting, pending_quantity_variant_id,
      pending_quantity_message_id, pending_quantity_expires_at, pending_quantity_uses_caption,
      items_json, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      locale = excluded.locale,
      discount_code = excluded.discount_code,
      awaiting = excluded.awaiting,
      pending_quantity_variant_id = excluded.pending_quantity_variant_id,
      pending_quantity_message_id = excluded.pending_quantity_message_id,
      pending_quantity_expires_at = excluded.pending_quantity_expires_at,
      pending_quantity_uses_caption = excluded.pending_quantity_uses_caption,
      items_json = excluded.items_json,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at`).bind(
    cart.telegramUserId,
    cart.locale,
    cart.discountCode,
    cart.awaiting === "discount" ? "discount" : null,
    pendingQuantity ? cart.pendingQuantityVariantId : null,
    pendingQuantity ? cart.pendingQuantityMessageId : null,
    pendingQuantity ? cart.pendingQuantityExpiresAt : null,
    pendingQuantity && cart.pendingQuantityUsesCaption ? 1 : 0,
    JSON.stringify(cart.items),
    updatedAt,
    expiresAt,
  ).run();
  return { ...cart, updatedAt, expiresAt };
}

export async function mutateTelegramCart(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: {
    telegramUserId: number;
    locale: ShopLocale;
    action: "add" | "inc" | "dec" | "remove" | "clear" | "set_discount" | "clear_discount" | "await_discount" | "await_quantity" | "clear_awaiting";
    variantId?: string;
    quantity?: number;
    discountCode?: string | null;
    messageId?: number;
    messageUsesCaption?: boolean;
  },
): Promise<TelegramCart> {
  const cart = await getTelegramCart(bindings, input.telegramUserId, LEGACY_TELEGRAM_LOCALE);
  cart.locale = LEGACY_TELEGRAM_LOCALE;
  const variantId = input.variantId;
  const clearPendingQuantity = () => {
    cart.pendingQuantityVariantId = null;
    cart.pendingQuantityMessageId = null;
    cart.pendingQuantityUsesCaption = false;
    cart.pendingQuantityExpiresAt = null;
    if (cart.awaiting === "quantity") cart.awaiting = null;
  };

  if (input.action === "clear") {
    cart.items = [];
    cart.discountCode = null;
    cart.awaiting = null;
    clearPendingQuantity();
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "await_discount") {
    clearPendingQuantity();
    cart.awaiting = "discount";
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "await_quantity") {
    if (!variantId || !/^[A-Za-z0-9-]{8,80}$/.test(variantId)
      || !Number.isSafeInteger(input.messageId) || Number(input.messageId) <= 0) {
      throw new ShopConflictError("variant_not_available");
    }
    cart.awaiting = "quantity";
    cart.pendingQuantityVariantId = variantId;
    cart.pendingQuantityMessageId = Number(input.messageId);
    cart.pendingQuantityUsesCaption = input.messageUsesCaption === true;
    cart.pendingQuantityExpiresAt = new Date(Date.now() + QUANTITY_INPUT_TTL_MS).toISOString();
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "clear_awaiting") {
    cart.awaiting = null;
    clearPendingQuantity();
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "set_discount") {
    const code = (input.discountCode ?? "").trim().toUpperCase().slice(0, 64);
    cart.discountCode = code || null;
    cart.awaiting = null;
    clearPendingQuantity();
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "clear_discount") {
    cart.discountCode = null;
    cart.awaiting = null;
    clearPendingQuantity();
    return saveTelegramCart(bindings, cart);
  }

  if (!variantId || !/^[A-Za-z0-9-]{8,80}$/.test(variantId)) {
    throw new ShopConflictError("variant_not_available");
  }
  clearPendingQuantity();
  const index = cart.items.findIndex((item) => item.variantId === variantId);
  if (input.action === "remove") {
    if (index >= 0) cart.items.splice(index, 1);
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "dec") {
    if (index >= 0) {
      cart.items[index]!.quantity -= 1;
      if (cart.items[index]!.quantity <= 0) cart.items.splice(index, 1);
    }
    return saveTelegramCart(bindings, cart);
  }
  const [stock] = await getPublicVariantStock(requireDb(bindings), [variantId]);
  if (!stock?.purchasable || stock.maxQuantity < 1) throw new ShopConflictError("variant_not_available");
  const maxQuantity = Math.min(CART_MAX_QTY, stock.maxQuantity);
  if (input.action === "add") {
    const quantity = Math.max(1, Math.min(maxQuantity, Math.floor(input.quantity ?? 1)));
    if (index >= 0) {
      cart.items[index]!.quantity = Math.min(maxQuantity, cart.items[index]!.quantity + quantity);
    } else {
      if (cart.items.length >= CART_MAX_LINES) throw new ShopConflictError("cart_full");
      cart.items.push({ variantId, quantity });
    }
    return saveTelegramCart(bindings, cart);
  }
  if (input.action === "inc") {
    if (index >= 0) cart.items[index]!.quantity = Math.min(maxQuantity, cart.items[index]!.quantity + 1);
    else {
      if (cart.items.length >= CART_MAX_LINES) throw new ShopConflictError("cart_full");
      cart.items.push({ variantId, quantity: 1 });
    }
    return saveTelegramCart(bindings, cart);
  }
  return saveTelegramCart(bindings, cart);
}

/**
 * Create a Telegram-native checkout (no web form). Supports multi-line cart + discount.
 */
export async function checkoutTelegramItems(
  bindings: TelegramCommerceBindings,
  input: {
    user: TelegramUser;
    locale: ShopLocale;
    botConfigId?: string;
    items: TelegramCartItem[];
    discountCode?: string | null;
    idempotencySuffix?: string;
    idempotencyKey?: string;
    /** Optional attribution payload from Mini App / affiliate deep links. */
    externalReference?: string | null;
  },
) {
  // Keep the legacy bot contract stable: Vietnamese catalog copy, VND prices
  // and PayOS/VietQR checkout. A future global bot should call a separate
  // entry point instead of changing these persisted order invariants.
  const telegramLocale = LEGACY_TELEGRAM_LOCALE;
  if (!input.items.length) throw new ShopConflictError("cart_empty");
  for (const item of input.items) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(item.variantId)) throw new ShopConflictError("variant_not_available");
  }
  const customer = await ensureTelegramCustomer(bindings, input.user, telegramLocale);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const fingerprint = input.items.map((item) => `${item.variantId}x${item.quantity}`).join(".");
  const discountPart = input.discountCode?.trim().toUpperCase() || "none";
  const botConfigId = input.botConfigId && /^[A-Za-z0-9_-]{8,80}$/.test(input.botConfigId) ? input.botConfigId : "environment";
  const suppliedIdempotency = input.idempotencyKey?.trim();
  const idempotencyKey = suppliedIdempotency
    ? `tg-${botConfigId}-${await sha256Base64Url(suppliedIdempotency)}`
    : `tg-cart-${botConfigId}-${await sha256Base64Url(`${input.user.id}\0${input.idempotencySuffix || fingerprint}\0${discountPart}\0${minuteBucket}`)}`;
  const requestId = crypto.randomUUID();
  const externalReference = input.externalReference?.trim().slice(0, 180) || "";

  const result = await createTelegramShopCheckout(
    bindings,
    {
      sourceChannel: "telegram",
      locale: telegramLocale,
      customer: {
        email: customer.email,
        displayName: customer.displayName,
        locale: telegramLocale,
        telegramSubject: String(input.user.id),
        telegramBotConfigId: botConfigId,
        marketingConsent: false,
      },
      items: input.items.map((item) => ({
        variantId: item.variantId,
        quantity: Math.max(1, Math.min(CART_MAX_QTY, item.quantity)),
      })),
      ...(input.discountCode?.trim() ? { discountCode: input.discountCode.trim() } : {}),
      ...(externalReference ? { externalReference } : {}),
    },
    idempotencyKey,
    requestId,
  );

  if (result.order.orderId) {
    const updated = await bindings.CONTENT_DB!.prepare(
      "UPDATE shop_orders SET customer_id = ?, updated_at = ? WHERE id = ? AND (customer_id IS NULL OR customer_id = ?)",
    ).bind(customer.customerId, nowIso(), result.order.orderId, customer.customerId).run();
    // The order transaction is keyed by the signed Telegram subject. Never
    // return a payment for an order that D1 attached to another customer,
    // even if a stale idempotency replay or a concurrent write is involved.
    const binding = await bindings.CONTENT_DB!.prepare(`SELECT customer_id, source_channel,
        checkout_subject_hash FROM shop_orders WHERE id = ? LIMIT 1`).bind(result.order.orderId).first<{
      customer_id: string | null;
      source_channel: string;
      checkout_subject_hash: string | null;
    }>();
    const expectedSubject = await deriveShopCheckoutSubjectHash(bindings.SHOP_ORDER_TOKEN_SECRET, `telegram:${input.user.id}`);
    if (updated.meta.changes < 1 || !binding
      || binding.customer_id !== customer.customerId
      || binding.source_channel !== "telegram"
      || binding.checkout_subject_hash !== expectedSubject) {
      throw new ShopConflictError("telegram_order_identity_mismatch");
    }
  }

  return { ...result, customer };
}

/** Single-variant buy, bounded by live stock and the variant per-order cap. */
export async function buyVariantFromTelegram(
  bindings: TelegramCommerceBindings,
  input: {
    user: TelegramUser;
    locale: ShopLocale;
    botConfigId?: string;
    variantId: string;
    quantity?: number;
    discountCode?: string | null;
    idempotencyKey?: string;
  },
) {
  const quantity = Math.max(1, Math.min(CART_MAX_QTY, Math.floor(input.quantity ?? 1)));
  const [stock] = await getPublicVariantStock(requireDb(bindings), [input.variantId]);
  if (!stock?.purchasable || stock.maxQuantity < 1) throw new ShopConflictError("variant_not_available");
  if (quantity > stock.maxQuantity) throw new ShopConflictError("variant_quantity_exceeded");
  return checkoutTelegramItems(bindings, {
    user: input.user,
    locale: LEGACY_TELEGRAM_LOCALE,
    botConfigId: input.botConfigId,
    items: [{ variantId: input.variantId, quantity }],
    discountCode: input.discountCode,
    idempotencySuffix: `${input.variantId}x${quantity}`,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function checkoutTelegramCart(
  bindings: TelegramCommerceBindings,
  input: { user: TelegramUser; locale: ShopLocale; botConfigId?: string; idempotencyKey?: string },
) {
  const telegramLocale = LEGACY_TELEGRAM_LOCALE;
  const cart = await getTelegramCart(bindings, input.user.id, telegramLocale);
  if (!cart.items.length) throw new ShopConflictError("cart_empty");
  const result = await checkoutTelegramItems(bindings, {
    user: input.user,
    locale: telegramLocale,
    botConfigId: input.botConfigId,
    items: cart.items,
    discountCode: cart.discountCode,
    idempotencyKey: input.idempotencyKey,
  });
  if (result.payment?.qrUrl) {
    await mutateTelegramCart(bindings, {
      telegramUserId: input.user.id,
      locale: telegramLocale,
      action: "clear",
    });
  }
  return result;
}

export async function checkoutGlbTelegramItems(
  bindings: GlbTelegramCommerceBindings,
  input: {
    user: TelegramUser;
    botConfigId: string;
    items: TelegramCartItem[];
    discountCode?: string | null;
    paymentMethodId?: string;
    idempotencyKey?: string;
    externalReference?: string | null;
  },
) {
  if (!input.items.length) throw new ShopConflictError("cart_empty");
  const customer = await ensureTelegramCustomer(bindings, input.user, "en");
  const idempotencyKey = input.idempotencyKey?.trim() || `cart:${input.user.id}:${input.items.map((item) => `${item.variantId}x${item.quantity}`).join(".")}:${Math.floor(Date.now() / 60_000)}`;
  return createGlbTelegramShopCheckout(bindings, {
    sourceChannel: "telegram",
    locale: "en",
    customer: {
      email: customer.email,
      displayName: customer.displayName,
      locale: "en",
      telegramSubject: String(input.user.id),
      telegramBotConfigId: input.botConfigId,
      marketingConsent: false,
    },
    items: input.items,
    ...(input.discountCode?.trim() ? { discountCode: input.discountCode.trim() } : {}),
    ...(input.paymentMethodId?.trim() ? { paymentMethodId: input.paymentMethodId.trim() } : {}),
    ...(input.externalReference?.trim() ? { externalReference: input.externalReference.trim().slice(0, 180) } : {}),
  }, idempotencyKey, crypto.randomUUID());
}

/** Read a GLB order without exposing records from another Telegram identity. */
export async function statusForGlbTelegramOrder(
  bindings: GlbTelegramCommerceBindings,
  customerId: string,
  orderId: string,
  botConfigId: string,
) {
  const owned = await getTelegramOwnedOrder(bindings, customerId, orderId, botConfigId);
  if (!owned) return null;
  const refreshed = owned;
  const db = requireDb(bindings);
  const attempt = await db.prepare(`SELECT a.id, a.provider, a.rail, a.asset, a.network,
      a.expected_amount_atomic AS amountAtomic, a.expected_amount_minor AS amountMinor,
      a.destination_snapshot AS destination, a.memo_or_tag_snapshot AS memoOrTag,
      a.status, a.transaction_reference AS transactionReference, a.expires_at AS expiresAt,
      m.destination_type AS destinationType, m.public_config_json AS publicConfig
    FROM shop_crypto_payment_attempts a
    JOIN shop_crypto_payment_methods m ON m.id = a.payment_method_id
    WHERE a.order_id = ? AND m.storefront_scope = 'glb'
    ORDER BY a.created_at DESC, a.id DESC LIMIT 1`).bind(orderId).first<Record<string, unknown>>();
  const lines = await listTelegramOrderLines(bindings, customerId, orderId);
  if (!attempt) return { order: refreshed, payment: null, lines, delivery: { readiness: deliveryReadiness({ payment_status: refreshed.payment_status, fulfillment_status: refreshed.fulfillment_status, automatic_key_lines: 0, fulfilled_automatic_key_lines: 0, manual_lines: 0 }), lineCount: lines.length, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) } };
  let paymentProofs: Awaited<ReturnType<typeof listPaymentProofs>> = [];
  try {
    paymentProofs = await listPaymentProofs(db, orderId);
  } catch (error) {
    if (!(error instanceof Error) || !/no such table:\s*shop_payment_proofs/i.test(error.message)) throw error;
  }
  const status = String(attempt.status || "awaiting_payment");
  const state = refreshed.payment_status === "paid" || status === "confirmed" ? "paid" : status === "expired" ? "expired" : status === "failed" ? "failed" : status === "detected" || status === "needs_review" ? "confirming" : "awaiting_payment";
  return {
    order: refreshed,
    payment: {
      id: String(attempt.id), provider: String(attempt.provider), rail: String(attempt.rail), asset: String(attempt.asset),
      network: String(attempt.network || ""), amountAtomic: String(attempt.amountAtomic), amountMinor: Number(attempt.amountMinor) || 0,
      destination: String(attempt.destination || ""), memoOrTag: String(attempt.memoOrTag || ""), destinationType: String(attempt.destinationType || "wallet_address"),
      qrUrl: String(attempt.destinationType || "") === "uid" ? null : (() => { try { return cryptoQrUrl(attempt.publicConfig ? JSON.parse(String(attempt.publicConfig)) : null); } catch { return null; } })(),
      accountUid: String(attempt.destinationType || "") === "uid" ? (() => { try { return cryptoAccountUid(attempt.publicConfig ? JSON.parse(String(attempt.publicConfig)) : null); } catch { return null; } })() : null,
      status, transactionReference: attempt.transactionReference ? String(attempt.transactionReference) : null, expiresAt: String(attempt.expiresAt), state, paymentProofs,
    },
    lines,
    delivery: { readiness: deliveryReadiness({ payment_status: refreshed.payment_status, fulfillment_status: refreshed.fulfillment_status, automatic_key_lines: lines.filter((line) => line.fulfillmentType === "license_key" && line.deliveryMode === "automatic").length, fulfilled_automatic_key_lines: lines.filter((line) => line.fulfillmentType === "license_key" && line.deliveryMode === "automatic" && line.fulfillmentStatus === "fulfilled").length, manual_lines: lines.filter((line) => line.fulfillmentType === "manual" || line.deliveryMode === "manual").length }), lineCount: lines.length, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) },
  };
}

/**
 * Lightweight GLB status snapshot used by the Mini App polling loop.
 *
 * Payment instructions and proof history remain on the full order endpoint;
 * polling only needs the payment state and delivery readiness. Keeping the
 * aggregate in SQL avoids loading every proof and line into the Worker every
 * few seconds while an admin reviews a transfer.
 */
export async function statusSummaryForGlbTelegramOrder(
  bindings: GlbTelegramCommerceBindings,
  customerId: string,
  orderId: string,
  botConfigId: string,
) {
  const owned = await getTelegramOwnedOrder(bindings, customerId, orderId, botConfigId);
  if (!owned) return null;
  const db = requireDb(bindings);

  type GlbStatusAttempt = {
    id: string;
    status: string;
    transactionReference: string | null;
    expiresAt: string;
  };
  let attempt: GlbStatusAttempt | null = null;
  try {
    attempt = await db.prepare(`SELECT a.id, a.status,
        a.transaction_reference AS transactionReference, a.expires_at AS expiresAt
      FROM shop_crypto_payment_attempts a
      JOIN shop_crypto_payment_methods m ON m.id = a.payment_method_id
      WHERE a.order_id = ? AND m.storefront_scope = 'glb'
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`).bind(orderId).first<GlbStatusAttempt>();
  } catch (error) {
    // Keep older deployments readable while the additive crypto migrations
    // are being rolled out; the order snapshot still gives a safe status.
    if (!(error instanceof Error) || !/no such table:\s*shop_crypto_payment_attempts/i.test(error.message)) throw error;
  }

  let aggregate = {
    automatic_key_lines: 0,
    fulfilled_automatic_key_lines: 0,
    manual_lines: 0,
    line_count: 0,
    item_count: 0,
  };
  const lines = await db.prepare(`SELECT
      COUNT(oi.id) AS line_count,
      COALESCE(SUM(oi.quantity), 0) AS item_count,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic' THEN 1 ELSE 0 END), 0) AS automatic_key_lines,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic' AND oi.fulfillment_status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled_automatic_key_lines,
      COALESCE(SUM(CASE WHEN oi.fulfillment_type = 'manual' OR oi.delivery_mode = 'manual' THEN 1 ELSE 0 END), 0) AS manual_lines
    FROM shop_order_items oi
    JOIN shop_orders o ON o.id = oi.order_id AND o.customer_id = ?
    WHERE oi.order_id = ?`).bind(customerId, orderId).first<Record<string, unknown>>();
  if (lines) {
    aggregate = {
      automatic_key_lines: Number(lines.automatic_key_lines) || 0,
      fulfilled_automatic_key_lines: Number(lines.fulfilled_automatic_key_lines) || 0,
      manual_lines: Number(lines.manual_lines) || 0,
      line_count: Number(lines.line_count) || 0,
      item_count: Number(lines.item_count) || 0,
    };
  }

  const status = String(attempt?.status || "awaiting_payment");
  const state = owned.payment_status === "paid" || status === "confirmed" ? "paid"
    : status === "expired" ? "expired"
      : status === "failed" ? "failed"
        : status === "detected" || status === "needs_review" ? "confirming"
          : "awaiting_payment";
  const delivery = {
    readiness: deliveryReadiness({
      payment_status: owned.payment_status,
      fulfillment_status: owned.fulfillment_status,
      automatic_key_lines: aggregate.automatic_key_lines,
      fulfilled_automatic_key_lines: aggregate.fulfilled_automatic_key_lines,
      manual_lines: aggregate.manual_lines,
    }),
    lineCount: aggregate.line_count,
    itemCount: aggregate.item_count,
  };

  return {
    order: owned,
    payment: attempt ? {
      id: attempt.id,
      status,
      transactionReference: attempt.transactionReference,
      expiresAt: attempt.expiresAt,
      state,
    } : null,
    delivery,
  };
}

export async function purgeExpiredTelegramCarts(db: D1Database, limit = 100) {
  const now = nowIso();
  const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await db.prepare(`DELETE FROM shop_telegram_carts
    WHERE telegram_user_id IN (
      SELECT telegram_user_id FROM shop_telegram_carts WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
    )`).bind(now, bounded).run();
  return result.meta.changes;
}

export async function statusForTelegramOrder(
  bindings: TelegramCommerceBindings,
  customerId: string,
  orderId: string,
  botConfigId?: string,
) {
  let owned = await getTelegramOwnedOrder(bindings, customerId, orderId, botConfigId);
  if (!owned) return null;

  // User-driven status refresh performs a bounded, signed payOS check for this
  // exact owned order. This closes the gap when the provider webhook is delayed.
  if (owned.payment_status !== "paid") {
    await reconcilePendingPayOsPayments(bindings, { orderId }).catch(() => undefined);
    owned = await getTelegramOwnedOrder(bindings, customerId, orderId, botConfigId);
    if (!owned) return null;
  }

  // Rebuild status from the customer-owned order and its latest payment attempt.
  const db = requireDb(bindings);
  // Without the raw public token we still return a safe DB snapshot; payment
  // QR recovery is scoped to the latest attempt for this already-owned order.
  let attempt = await db.prepare(`SELECT pa.id, pa.provider_config_id, pa.status, pa.expires_at, pa.provider_description,
      pa.qr_image_url, pa.checkout_url, pa.provider_reference, pa.provider_bank_bin, pa.provider_account_number,
      pc.bank_id, o.total_minor, o.currency
    FROM shop_payment_attempts pa
    JOIN shop_payment_provider_configs pc ON pc.id = pa.provider_config_id
    JOIN shop_orders o ON o.id = pa.order_id
    WHERE pa.order_id = ? AND pa.provider = 'vietqr' AND pa.confirmation_provider = 'payos'
    ORDER BY pa.created_at DESC, pa.id DESC LIMIT 1`).bind(orderId).first<{
      id: string;
      provider_config_id: string;
      status: string;
      expires_at: string;
      provider_description: string | null;
      qr_image_url: string | null;
      checkout_url: string | null;
      provider_reference: string | null;
      provider_bank_bin: string | null;
      provider_account_number: string | null;
      bank_id: string;
      total_minor: number;
      currency: string;
    }>();

  if (attempt && (attempt.status === "created" || attempt.status === "awaiting_payment")) {
    // Prefer stored virtual destination over merchant config BIN.
    if (attempt.qr_image_url) {
      try {
        const validatedQr = validatePayOsCheckoutQrUrl({
          qrUrl: attempt.qr_image_url,
          expectedBin: attempt.provider_bank_bin || null,
          expectedAmount: attempt.total_minor,
          expectedDescription: attempt.provider_description ?? "",
          expectedAccountNumber: attempt.provider_account_number,
        });
        attempt.qr_image_url = validatedQr.qrUrl;
        // Older attempts may have persisted the QR but lost its destination
        // columns. Recover those locally from the already validated URL.
        const recoveredBin = attempt.provider_bank_bin || validatedQr.bin;
        const recoveredAccountNumber = attempt.provider_account_number || validatedQr.accountNumber;
        if (recoveredBin !== attempt.provider_bank_bin || recoveredAccountNumber !== attempt.provider_account_number) {
          attempt.provider_bank_bin = recoveredBin;
          attempt.provider_account_number = recoveredAccountNumber;
          await db.prepare(`UPDATE shop_payment_attempts SET provider_bank_bin = ?,
            provider_account_number = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')`)
            .bind(recoveredBin, recoveredAccountNumber, nowIso(), attempt.id).run();
        }
      } catch {
        // Rebuild from stored destination before dropping the QR entirely.
        try {
          if (attempt.provider_bank_bin && attempt.provider_account_number && attempt.provider_description) {
            attempt.qr_image_url = buildVietQrImageUrl({
              bin: attempt.provider_bank_bin,
              accountNumber: attempt.provider_account_number,
              amount: attempt.total_minor,
              description: attempt.provider_description,
            });
          } else {
            attempt.qr_image_url = null;
          }
        } catch {
          attempt.qr_image_url = null;
        }
      }
    }
    const recoveryNeeded = !attempt.qr_image_url || !attempt.checkout_url || !attempt.provider_reference
      || !attempt.provider_bank_bin || !attempt.provider_account_number;
    if (recoveryNeeded) {
      const claimedAt = nowIso();
      // Only the winner may contact payOS. Losers immediately return the
      // latest safe DB snapshot while the winner finishes its recovery lease.
      const claimed = await claimTelegramPaymentRecovery(db, attempt.id, claimedAt);
      if (claimed) {
        if (attempt.provider_reference && (!attempt.qr_image_url || !attempt.provider_bank_bin || !attempt.provider_account_number)) {
          const previousQr = attempt.qr_image_url;
          try {
            const recoveredQr = await getPayOsCheckoutQr({
              paymentLinkId: attempt.provider_reference,
              expectedBin: attempt.provider_bank_bin || null,
              expectedAmount: attempt.total_minor,
              expectedDescription: attempt.provider_description ?? "",
              expectedAccountNumber: attempt.provider_account_number || null,
            });
            attempt.qr_image_url = recoveredQr.qrUrl;
            attempt.provider_bank_bin = recoveredQr.bin;
            attempt.provider_account_number = recoveredQr.accountNumber;
            await db.prepare(`UPDATE shop_payment_attempts SET qr_image_url = ?, provider_bank_bin = ?,
              provider_account_number = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')`)
              .bind(recoveredQr.qrUrl, recoveredQr.bin, recoveredQr.accountNumber, nowIso(), attempt.id).run();
          } catch {
            // Never wipe a QR that already validated or was rebuilt locally.
            attempt.qr_image_url = previousQr;
          }
        }
        if (!attempt.qr_image_url || !attempt.checkout_url || !attempt.provider_reference) {
          const previousQr = attempt.qr_image_url;
          try {
            const recovered = await createVietQrPayment(bindings, {
              orderId,
              providerConfigId: attempt.provider_config_id,
              expiresAt: attempt.expires_at,
            }, { id: "telegram-status", channel: "telegram" }, crypto.randomUUID());
            attempt.qr_image_url = recovered.qrUrl || previousQr;
            attempt.checkout_url = recovered.checkoutUrl ?? attempt.checkout_url;
          } catch {
            // Return the safe snapshot below; never synthesize a base-account QR.
            attempt.qr_image_url = previousQr;
          }
        }
      }
      // Refresh after a claimed recovery (or a competing winner) so the
      // response reflects only data committed under the attempt CAS fence.
      const refreshed = await db.prepare(`SELECT pa.id, pa.provider_config_id, pa.status, pa.expires_at, pa.provider_description,
          pa.qr_image_url, pa.checkout_url, pa.provider_reference, pa.provider_bank_bin, pa.provider_account_number,
          pc.bank_id, o.total_minor, o.currency
        FROM shop_payment_attempts pa
        JOIN shop_payment_provider_configs pc ON pc.id = pa.provider_config_id
        JOIN shop_orders o ON o.id = pa.order_id
        WHERE pa.id = ? LIMIT 1`).bind(attempt.id).first<typeof attempt>();
      if (refreshed) {
        if (refreshed.qr_image_url) {
          try {
            refreshed.qr_image_url = validatePayOsCheckoutQrUrl({
              qrUrl: refreshed.qr_image_url,
              expectedBin: refreshed.provider_bank_bin || null,
              expectedAmount: refreshed.total_minor,
              expectedDescription: refreshed.provider_description ?? "",
              expectedAccountNumber: refreshed.provider_account_number,
            }).qrUrl;
          } catch {
            try {
              refreshed.qr_image_url = refreshed.provider_bank_bin
                && refreshed.provider_account_number
                && refreshed.provider_description
                ? buildVietQrImageUrl({
                  bin: refreshed.provider_bank_bin,
                  accountNumber: refreshed.provider_account_number,
                  amount: refreshed.total_minor,
                  description: refreshed.provider_description,
                })
                : null;
            } catch {
              refreshed.qr_image_url = null;
            }
          }
        }
        attempt = refreshed;
      }
    }
  }

  const lines = await listTelegramOrderLines(bindings, customerId, orderId);
  const aggregate = {
    payment_status: owned.payment_status,
    fulfillment_status: owned.fulfillment_status,
    automatic_key_lines: lines.filter((line) => line.fulfillmentType === "license_key" && line.deliveryMode === "automatic").length,
    fulfilled_automatic_key_lines: lines.filter((line) => line.fulfillmentType === "license_key" && line.deliveryMode === "automatic" && line.fulfillmentStatus === "fulfilled").length,
    manual_lines: lines.filter((line) => line.fulfillmentType === "manual" || line.deliveryMode === "manual").length,
  };
  const delivery = {
    readiness: deliveryReadiness(aggregate),
    lineCount: lines.length,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
  };
  return {
    order: owned,
    payment: attempt,
    lines,
    delivery,
  };
}

export async function revealKeysForTelegramOrder(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  customerId: string,
  orderId: string,
  botConfigId?: string,
) {
  const owned = await getTelegramOwnedOrder(bindings, customerId, orderId, botConfigId);
  if (!owned) throw new ShopConflictError("order_not_found");
  if (owned.payment_status !== "paid") throw new ShopConflictError("order_not_paid");

  // Keep Telegram key delivery subject to the same per-customer guard as the
  // signed-in account path. This protects fulfilled keys from brute-force
  // polling while preserving repeat delivery for legitimate buyers.
  const db = requireDb(bindings);
  const since = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  // Reserve the reveal slot in the same conditional INSERT that checks the
  // rolling window. This closes the count-then-deliver race under concurrent
  // requests; a failed delivery still consumes a small security budget.
  const requestId = crypto.randomUUID();
  const gate = await db.prepare(`INSERT INTO shop_customer_security_events
      (id, customer_id, event_type, request_id, details_json, created_at)
    SELECT ?, ?, 'key_reveal', ?, ?, ?
    WHERE (SELECT COUNT(*) FROM shop_customer_security_events
      WHERE customer_id = ? AND event_type = 'key_reveal' AND created_at >= ?) < 20`).bind(
    crypto.randomUUID(),
    customerId,
    requestId,
    JSON.stringify({ orderId, channel: "telegram" }),
    new Date().toISOString(),
    customerId,
    since,
  ).run();
  if (gate.meta.changes !== 1) throw new ShopConflictError("key_reveal_rate_limited");

  return deliverCustomerOwnedOrder(bindings, customerId, orderId, "telegram");
}

export function pickDefaultVariant(product: PublicProduct): PublicVariant | null {
  const available = product.variants.find((v) => v.availability !== "out_of_stock");
  return available ?? product.variants[0] ?? null;
}

export async function hashTelegramSubject(bindings: Pick<ShopBindings, "SHOP_ORDER_TOKEN_SECRET">, telegramUserId: number) {
  return deriveShopCheckoutSubjectHash(bindings.SHOP_ORDER_TOKEN_SECRET, `telegram:${telegramUserId}`);
}

export async function attachTelegramIdentityIfMissing(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_ORDER_TOKEN_SECRET">,
  telegramUserId: number,
) {
  // Helper for ops/debug — subject hash for recipient table alignment.
  if (!bindings.SHOP_ORDER_TOKEN_SECRET) return null;
  return sha256Base64Url(`telegram-subject-hint\0${telegramUserId}`);
}

/** Truncate Telegram messages under hard limit with continuation note. */
export function chunkTelegramText(text: string, limit = 3_800): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, "");
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export type CommerceCopy = {
  menuTitle: string;
  menuSubtitle: string;
  productCount: string;
  cartCount: string;
  categories: string;
  chooseCategory: string;
  allProducts: string;
  chooseProduct: string;
  choosePackage: string;
  packages: string;
  featured: string;
  from: string;
  available: string;
  unavailable: string;
  otherCategory: string;
  backCategories: string;
  backProducts: string;
  catalog: string;
  cart: string;
  myOrders: string;
  myKeys: string;
  buy: string;
  buyQty: string;
  addCart: string;
  addedCart: string;
  cartEmpty: string;
  cartTitle: string;
  cartLine: string;
  checkout: string;
  clearCart: string;
  discount: string;
  discountPrompt: string;
  discountSet: string;
  discountCleared: string;
  discountInvalid: string;
  confirmBuy: string;
  payTitle: string;
  payBody: string;
  amount: string;
  content: string;
  openPay: string;
  refresh: string;
  status: string;
  unpaid: string;
  paid: string;
  keysTitle: string;
  noOrders: string;
  noKeys: string;
  orderLine: string;
  productDetail: string;
  variants: string;
  quantity: string;
  selectQuantity: string;
  customQuantity: string;
  customQuantityPrompt: string;
  invalidQuantity: string;
  maximum: string;
  total: string;
  addQuantityCart: string;
  outOfStock: string;
  buyFailed: string;
  rateLimited: string;
  blocked: string;
  cartFull: string;
  keysReady: string;
  keyItem: string;
  backMenu: string;
  processing: string;
};

const commerceCopyTable: Record<ShopLocale, CommerceCopy> = {
  en: {
    menuTitle: "TUNG Shop",
    menuSubtitle: "Choose a product, package and quantity. Pay and receive keys entirely in Telegram.",
    productCount: "{count} products",
    cartCount: "{count} items in cart",
    categories: "Categories",
    chooseCategory: "Choose a category to browse faster.",
    allProducts: "All products",
    chooseProduct: "Choose a product to view its packages.",
    choosePackage: "Choose a package",
    packages: "packages",
    featured: "Featured products",
    from: "From",
    available: "Available",
    unavailable: "Unavailable",
    otherCategory: "Other products",
    backCategories: "Categories",
    backProducts: "Products",
    catalog: "Products",
    cart: "Cart",
    myOrders: "My orders",
    myKeys: "My keys",
    buy: "Buy now",
    buyQty: "Buy ×{qty}",
    addCart: "Add to cart",
    addedCart: "Added to cart.",
    cartEmpty: "Cart is empty. Browse products to add items.",
    cartTitle: "Your cart",
    cartLine: "• {title} ×{qty}",
    checkout: "Checkout & pay",
    clearCart: "Clear cart",
    discount: "Discount code",
    discountPrompt: "Send your discount code as the next message (or /discount CODE).",
    discountSet: "Discount code saved: {code}",
    discountCleared: "Discount removed.",
    discountInvalid: "That discount could not be applied. Check the code or checkout without it.",
    confirmBuy: "Create payment",
    payTitle: "Payment created",
    payBody: "Transfer the exact amount with the content below. Keys unlock after verification.",
    amount: "Amount",
    content: "Transfer content",
    openPay: "Open payOS",
    refresh: "Refresh status",
    status: "Status",
    unpaid: "Awaiting payment",
    paid: "Paid",
    keysTitle: "Your license keys",
    noOrders: "No orders yet. Browse products to buy.",
    noKeys: "No paid keys yet.",
    orderLine: "{number} · {amount} · {status}",
    productDetail: "Pick quantity, add to cart, or buy now.",
    variants: "Versions",
    quantity: "Quantity",
    selectQuantity: "Choose quantity",
    customQuantity: "Enter another quantity",
    customQuantityPrompt: "Send a whole number from 6 to {max} in the chat.",
    invalidQuantity: "Invalid quantity. Enter a whole number from 6 to {max}.",
    maximum: "Maximum",
    total: "Total",
    addQuantityCart: "Add ×{qty} to cart",
    outOfStock: "Out of stock",
    buyFailed: "Could not create the order. Try again in a moment.",
    rateLimited: "Too many checkouts. Wait a minute and retry.",
    blocked: "This account is blocked.",
    cartFull: "Cart is full (max 8 lines).",
    keysReady: "Keys for {number}",
    keyItem: "Key",
    backMenu: "Main menu",
    processing: "Working…",
  },
  ja: {
    menuTitle: "TUNG Shop",
    menuSubtitle: "商品・プラン・数量を選択し、Telegram 内で支払いとキー受取まで完了できます。",
    productCount: "商品 {count} 件",
    cartCount: "カート {count} 点",
    categories: "カテゴリー",
    chooseCategory: "カテゴリーを選んで商品を探します。",
    allProducts: "すべての商品",
    chooseProduct: "商品を選んでプランを確認してください。",
    choosePackage: "プランを選択",
    packages: "プラン",
    featured: "おすすめ商品",
    from: "最低",
    available: "購入可能",
    unavailable: "在庫なし",
    otherCategory: "その他",
    backCategories: "カテゴリー",
    backProducts: "商品一覧",
    catalog: "商品",
    cart: "カート",
    myOrders: "注文一覧",
    myKeys: "キー一覧",
    buy: "今すぐ購入",
    buyQty: "×{qty} 購入",
    addCart: "カートへ",
    addedCart: "カートに追加しました。",
    cartEmpty: "カートは空です。商品を追加してください。",
    cartTitle: "カート",
    cartLine: "• {title} ×{qty}",
    checkout: "会計・支払い",
    clearCart: "カートを空に",
    discount: "クーポン",
    discountPrompt: "次のメッセージでクーポンコードを送るか /discount CODE を使ってください。",
    discountSet: "クーポンを保存: {code}",
    discountCleared: "クーポンを削除しました。",
    discountInvalid: "クーポンを適用できません。コードを確認するか、なしで進めてください。",
    confirmBuy: "支払いを作成",
    payTitle: "支払いを作成しました",
    payBody: "表示の金額と内容で送金してください。確認後にキーが届きます。",
    amount: "金額",
    content: "振込内容",
    openPay: "payOS を開く",
    refresh: "状態を更新",
    status: "状態",
    unpaid: "支払い待ち",
    paid: "支払い済み",
    keysTitle: "ライセンスキー",
    noOrders: "注文はまだありません。",
    noKeys: "支払い済みのキーはまだありません。",
    orderLine: "{number} · {amount} · {status}",
    productDetail: "数量を選び、カート追加または即購入。",
    variants: "バージョン",
    quantity: "数量",
    selectQuantity: "数量を選択",
    customQuantity: "別の数量を入力",
    customQuantityPrompt: "チャットに 6〜{max} の整数を送信してください。",
    invalidQuantity: "数量が無効です。6〜{max} の整数を入力してください。",
    maximum: "上限",
    total: "合計",
    addQuantityCart: "×{qty} をカートへ",
    outOfStock: "在庫なし",
    buyFailed: "注文を作成できませんでした。",
    rateLimited: "注文が多すぎます。1分後に再試行してください。",
    blocked: "このアカウントは停止されています。",
    cartFull: "カートがいっぱいです（最大8行）。",
    keysReady: "{number} のキー",
    keyItem: "キー",
    backMenu: "メニュー",
    processing: "処理中…",
  },
  zh: {
    menuTitle: "TUNG Shop",
    menuSubtitle: "选择产品、套餐和数量，在 Telegram 内完成支付并领取密钥。",
    productCount: "{count} 个产品",
    cartCount: "购物车 {count} 件",
    categories: "产品分类",
    chooseCategory: "选择分类以快速浏览产品。",
    allProducts: "全部产品",
    chooseProduct: "选择产品查看可用套餐。",
    choosePackage: "选择套餐",
    packages: "个套餐",
    featured: "推荐产品",
    from: "起价",
    available: "有货",
    unavailable: "缺货",
    otherCategory: "其他产品",
    backCategories: "产品分类",
    backProducts: "产品列表",
    catalog: "商品",
    cart: "购物车",
    myOrders: "我的订单",
    myKeys: "我的密钥",
    buy: "立即购买",
    buyQty: "买 ×{qty}",
    addCart: "加入购物车",
    addedCart: "已加入购物车。",
    cartEmpty: "购物车为空，请先添加商品。",
    cartTitle: "购物车",
    cartLine: "• {title} ×{qty}",
    checkout: "结算支付",
    clearCart: "清空购物车",
    discount: "优惠码",
    discountPrompt: "请发送优惠码，或使用 /discount CODE。",
    discountSet: "已保存优惠码：{code}",
    discountCleared: "已清除优惠码。",
    discountInvalid: "无法使用该优惠码，请检查或不用优惠码结算。",
    confirmBuy: "创建支付",
    payTitle: "已创建支付",
    payBody: "请按显示金额与备注转账。验证通过后即可获取密钥。",
    amount: "金额",
    content: "转账备注",
    openPay: "打开 payOS",
    refresh: "刷新状态",
    status: "状态",
    unpaid: "待支付",
    paid: "已支付",
    keysTitle: "授权密钥",
    noOrders: "暂无订单。",
    noKeys: "暂无已支付密钥。",
    orderLine: "{number} · {amount} · {status}",
    productDetail: "选择数量，加入购物车或立即购买。",
    variants: "版本",
    quantity: "数量",
    selectQuantity: "选择数量",
    customQuantity: "输入其他数量",
    customQuantityPrompt: "请在聊天中发送 6 到 {max} 之间的整数。",
    invalidQuantity: "数量无效，请输入 6 到 {max} 之间的整数。",
    maximum: "上限",
    total: "总计",
    addQuantityCart: "加入购物车 ×{qty}",
    outOfStock: "缺货",
    buyFailed: "无法创建订单。",
    rateLimited: "下单过于频繁，请稍后再试。",
    blocked: "账户已被停用。",
    cartFull: "购物车已满（最多 8 行）。",
    keysReady: "{number} 的密钥",
    keyItem: "密钥",
    backMenu: "主菜单",
    processing: "处理中…",
  },
  vi: {
    menuTitle: "TUNG Shop",
    menuSubtitle: "Chọn sản phẩm, gói và số lượng. Thanh toán và nhận key hoàn toàn trong Telegram.",
    productCount: "{count} sản phẩm",
    cartCount: "{count} tài khoản trong giỏ",
    categories: "Danh mục sản phẩm",
    chooseCategory: "Chọn danh mục để tìm sản phẩm nhanh hơn.",
    allProducts: "Tất cả sản phẩm",
    chooseProduct: "Chọn sản phẩm để xem các gói đang bán.",
    choosePackage: "Chọn gói phù hợp",
    packages: "gói",
    featured: "Sản phẩm nổi bật",
    from: "Từ",
    available: "Còn hàng",
    unavailable: "Hết hàng",
    otherCategory: "Sản phẩm khác",
    backCategories: "Danh mục",
    backProducts: "Sản phẩm",
    catalog: "Sản phẩm",
    cart: "Giỏ hàng",
    myOrders: "Đơn của tôi",
    myKeys: "Key của tôi",
    buy: "Mua ngay",
    buyQty: "Mua ×{qty}",
    addCart: "Thêm giỏ",
    addedCart: "Đã thêm vào giỏ.",
    cartEmpty: "Giỏ trống. Chọn sản phẩm để thêm.",
    cartTitle: "Giỏ hàng của bạn",
    cartLine: "• {title} ×{qty}",
    checkout: "Thanh toán giỏ",
    clearCart: "Xóa giỏ",
    discount: "Mã giảm giá",
    discountPrompt: "Gửi mã giảm giá ở tin nhắn tiếp theo (hoặc /discount MA).",
    discountSet: "Đã lưu mã: {code}",
    discountCleared: "Đã xóa mã giảm giá.",
    discountInvalid: "Không áp dụng được mã. Kiểm tra lại hoặc thanh toán không mã.",
    confirmBuy: "Tạo thanh toán",
    payTitle: "Đã tạo mã thanh toán",
    payBody: "Chuyển đúng số tiền và nội dung bên dưới. Key mở sau khi xác minh.",
    amount: "Số tiền",
    content: "Nội dung CK",
    openPay: "Mở payOS",
    refresh: "Làm mới trạng thái",
    status: "Trạng thái",
    unpaid: "Chờ thanh toán",
    paid: "Đã thanh toán",
    keysTitle: "License key của bạn",
    noOrders: "Chưa có đơn. Chọn sản phẩm để mua.",
    noKeys: "Chưa có key đã thanh toán.",
    orderLine: "{number} · {amount} · {status}",
    productDetail: "Chọn số lượng, thêm giỏ hoặc mua ngay.",
    variants: "Phiên bản",
    quantity: "Số lượng tài khoản",
    selectQuantity: "Chọn số lượng",
    customQuantity: "Nhập số lượng khác",
    customQuantityPrompt: "Gửi một số nguyên từ 6 đến {max} trong ô chat.",
    invalidQuantity: "Số lượng không hợp lệ. Hãy nhập số nguyên từ 6 đến {max}.",
    maximum: "Tối đa",
    total: "Tổng tiền",
    addQuantityCart: "Thêm ×{qty} vào giỏ",
    outOfStock: "Hết hàng",
    buyFailed: "Không tạo được đơn. Thử lại sau ít phút.",
    rateLimited: "Bạn tạo đơn quá nhanh. Đợi khoảng 1 phút rồi thử lại.",
    blocked: "Tài khoản bị khóa.",
    cartFull: "Giỏ đã đầy (tối đa 8 dòng).",
    keysReady: "Key cho đơn {number}",
    keyItem: "Key",
    backMenu: "Menu chính",
    processing: "Đang xử lý…",
  },
};

export function commerceCopy(locale: ShopLocale): CommerceCopy {
  return commerceCopyTable[locale] ?? commerceCopyTable.vi;
}

export async function getTelegramCustomerWallet(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  user: TelegramUser,
  locale: ShopLocale,
): Promise<{
  customerId: string;
  balanceVndMinor: number;
  balanceUsdMinor: number;
  balanceFormatted: string;
  lifetimeSpendFormatted: string;
  tier: "standard" | "bronze" | "silver" | "gold" | "diamond";
  tierBadge: string;
}> {
  const db = requireDb(bindings);
  const customer = await ensureTelegramCustomer(bindings, user, locale);
  const wallet = await db.prepare(`
    SELECT COALESCE(balance_vnd_minor, 0) AS balance_vnd,
           COALESCE(balance_usd_minor, 0) AS balance_usd
    FROM shop_customer_wallets
    WHERE customer_id = ?
  `).bind(customer.customerId).first<{ balance_vnd: number; balance_usd: number }>();

  const balanceVndMinor = wallet?.balance_vnd ?? 0;
  const balanceUsdMinor = wallet?.balance_usd ?? 0;
  const isUsd = locale !== "vi";
  const balanceFormatted = formatShopMoney(isUsd ? balanceUsdMinor : balanceVndMinor, isUsd ? "USD" : "VND", locale);

  const { getCustomerLifetimeSpend } = await import("./loyalty");
  const loyalty = await getCustomerLifetimeSpend(db, customer.email).catch(() => null);
  const tierLevel = loyalty?.tier?.level ?? "standard";
  const tierBadge = tierLevel === "diamond" ? "💎 Diamond VIP"
    : tierLevel === "gold" ? "🥇 Gold Member"
    : tierLevel === "silver" ? "🥈 Silver Member"
    : "🌟 Thành Viên";
  const lifetimeSpendFormatted = formatShopMoney(loyalty?.totalSpendVndMinor ?? 0, "VND", locale);

  return {
    customerId: customer.customerId,
    balanceVndMinor,
    balanceUsdMinor,
    balanceFormatted,
    lifetimeSpendFormatted,
    tier: tierLevel,
    tierBadge,
  };
}

export async function processTelegramWalletPayment(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  user: TelegramUser,
  orderId: string,
  locale: ShopLocale,
  requestId: string,
): Promise<{ ok: true; orderNumber: string; delivery: Awaited<ReturnType<typeof deliverCustomerOwnedOrder>> } | { ok: false; code: string }> {
  void requestId;
  const db = requireDb(bindings);
  const customer = await ensureTelegramCustomer(bindings, user, locale);
  const order = await db.prepare(`SELECT id, order_number, status, payment_status, total_minor, currency
    FROM shop_orders WHERE id = ? AND customer_id = ? LIMIT 1`).bind(orderId, customer.customerId).first<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total_minor: number;
      currency: string;
    }>();

  if (!order) return { ok: false, code: "order_not_found" };
  if (order.payment_status === "paid") return { ok: false, code: "order_already_paid" };

  const wallet = await db.prepare(`SELECT balance_vnd_minor, balance_usd_minor FROM shop_customer_wallets WHERE customer_id = ?`).bind(customer.customerId).first<{ balance_vnd_minor: number; balance_usd_minor: number }>();
  const isUsd = order.currency.toUpperCase() === "USD";
  const available = isUsd ? (wallet?.balance_usd_minor ?? 0) : (wallet?.balance_vnd_minor ?? 0);
  if (available < order.total_minor) {
    return { ok: false, code: "insufficient_wallet_balance" };
  }

  const col = isUsd ? "balance_usd_minor" : "balance_vnd_minor";
  const deduct = await db.prepare(`UPDATE shop_customer_wallets SET ${col} = ${col} - ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND ${col} >= ?`).bind(order.total_minor, customer.customerId, order.total_minor).run();
  if ((deduct.meta.changes ?? 0) !== 1) {
    return { ok: false, code: "insufficient_wallet_balance" };
  }

  await db.prepare(`INSERT INTO shop_wallet_transactions (id, customer_id, type, amount_minor, currency, balance_after_minor, reference_id, description) VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), customer.customerId, -order.total_minor, order.currency, available - order.total_minor, order.id, `Thanh toán Telegram đơn #${order.order_number}`
  ).run();

  await db.prepare(`UPDATE shop_orders SET status = 'fulfilled', payment_status = 'paid', fulfillment_status = 'fulfilled', paid_at = CURRENT_TIMESTAMP, fulfilled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(order.id).run();

  const delivery = await deliverCustomerOwnedOrder(bindings, customer.customerId, order.id, "telegram");
  return { ok: true, orderNumber: order.order_number, delivery };
}

export async function createTelegramWalletTopup(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT">,
  user: TelegramUser,
  amountMinor: number,
  locale: ShopLocale,
): Promise<{
  id: string;
  amountFormatted: string;
  amountMinor: number;
  qrUrl: string;
  accountNumber: string;
  bankBin: string;
  bankName: string;
  accountName: string;
  description: string;
}> {
  const db = requireDb(bindings);
  const customer = await ensureTelegramCustomer(bindings, user, locale);
  const topupId = crypto.randomUUID();
  const description = `NAP ${user.id}`;
  const bankAccount = bindings.VIETQR_BANK_ACCOUNT?.trim() || "0398367897";
  const bankBin = "970422";
  const bankName = "MBBank (Quân Đội)";
  const accountName = "NGUYEN THANH TUNG";

  await db.prepare(`INSERT INTO shop_wallet_topups (id, customer_id, provider, provider_order_code, provider_description, provider_reference, amount_minor, currency, status, qr_image_url, checkout_url, expires_at, created_at, updated_at) VALUES (?, ?, 'vietqr', ?, ?, ?, ?, 'VND', 'awaiting_payment', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(
    topupId, customer.customerId, Number(user.id) || 0, description, topupId, amountMinor, "", "", new Date(Date.now() + 30 * 60_000).toISOString()
  ).run().catch(() => undefined);

  const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-compact2.png?amount=${amountMinor}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

  return {
    id: topupId,
    amountFormatted: formatShopMoney(amountMinor, "VND", locale),
    amountMinor,
    qrUrl,
    accountNumber: bankAccount,
    bankBin,
    bankName,
    accountName,
    description,
  };
}

const copyBrowse: Record<ShopLocale, string> = {
  vi: "Mở TUNG Shop",
  en: "Open TUNG Shop",
  ja: "TUNG Shop を開く",
  zh: "打开 TUNG Shop",
};

export function menuKeyboard(locale: ShopLocale, origin?: string, miniAppEnabled = false, botName?: string): TelegramReply["replyMarkup"] {
  if (miniAppEnabled && origin) {
    try {
      const url = new URL(origin.trim());
      if (url.protocol === "https:") {
        url.pathname = "/telegram/shop";
        const label = (copyBrowse[locale] || copyBrowse.vi).replace(/TUNG Shop/g, botName || "TUNG Shop");
        return {
          inline_keyboard: [[{ text: label, web_app: { url: url.toString() } }]],
        };
      }
    } catch {
      // ignore
    }
  }

  const shopLabel = locale === "vi" ? "💎 Cửa Hàng" : locale === "en" ? "💎 Store" : locale === "ja" ? "💎 ストア" : "💎 商店";
  const walletLabel = locale === "vi" ? "👑 Ví & Trang Cá Nhân" : locale === "en" ? "👑 Wallet & Profile" : locale === "ja" ? "👑 マイページ" : "👑 钱包与个人中心";
  const ordersLabel = locale === "vi" ? "🛒 Đơn Hàng Của Tôi" : locale === "en" ? "🛒 My Orders" : locale === "ja" ? "🛒 注文履歴" : "🛒 我的订单";
  const langLabel = locale === "vi" ? "🌐 Đổi Ngôn Ngữ" : locale === "en" ? "🌐 Language" : locale === "ja" ? "🌐 言語変更" : "🌐 切换语言";
  const supportLabel = locale === "vi" ? "📇 Hỗ Trợ" : locale === "en" ? "📇 Support" : locale === "ja" ? "📇 サポート" : "📇 客户支持";

  return {
    inline_keyboard: [
      [{ text: shopLabel, callback_data: "cat:0" }],
      [
        { text: walletLabel, callback_data: "wallet" },
        { text: ordersLabel, callback_data: "my" },
      ],
      [
        { text: langLabel, callback_data: "lang" },
        { text: supportLabel, callback_data: "help" },
      ],
    ],
  };
}

export function persistentBottomKeyboard(locale: ShopLocale): TelegramReply["replyMarkup"] {
  const menuLabel = "🏠 Menu";
  const shopLabel = locale === "vi" ? "🛒 Mua nhanh" : locale === "en" ? "🛒 Quick Shop" : locale === "ja" ? "🛒 クイック購入" : "🛒 快捷购买";
  const topupLabel = locale === "vi" ? "💳 Nạp tiền" : locale === "en" ? "💳 Top Up" : locale === "ja" ? "💳 チャージ" : "💳 充值";

  return {
    keyboard: [
      [
        { text: menuLabel },
        { text: shopLabel },
        { text: topupLabel },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function getTelegramProductIcon(title: string, slug = ""): string {
  const s = `${slug} ${title}`.toLowerCase();
  if (s.includes("chatgpt") || s.includes("gpt") || s.includes("openai") || s.includes("sora")) return "🤖";
  if (s.includes("gemini") || s.includes("veo") || s.includes("google one")) return "✨";
  if (s.includes("claude") || s.includes("anthropic")) return "🎭";
  if (s.includes("grok") || s.includes("xai")) return "🚀";
  if (s.includes("deepseek")) return "🐋";
  if (s.includes("kiro") || s.includes("cursor") || s.includes("copilot") || s.includes("code") || s.includes("dev") || s.includes("gpm") || s.includes("codex")) return "💻";
  if (s.includes("mail edu") || s.includes("campus") || s.includes("student") || s.includes("edu")) return "🎓";
  if (s.includes("gmail") || s.includes("email") || s.includes("mail") || s.includes("hotmail") || s.includes("outlook")) return "📧";
  if (s.includes("netflix")) return "🍿";
  if (s.includes("youtube") || s.includes("ytb")) return "▶️";
  if (s.includes("spotify") || s.includes("suno") || s.includes("music")) return "🎵";
  if (s.includes("duolingo")) return "🦉";
  if (s.includes("turnitin")) return "📑";
  if (s.includes("elsa")) return "🗣️";
  if (s.includes("adobe") || s.includes("canva") || s.includes("figma") || s.includes("design")) return "🎨";
  if (s.includes("capcut") || s.includes("kling") || s.includes("video")) return "🎬";
  if (s.includes("elevenlab") || s.includes("voice") || s.includes("audio")) return "🎙️";
  if (s.includes("leonardo") || s.includes("midjourney") || s.includes("dall")) return "🖼️";
  if (s.includes("heygen")) return "👤";
  if (s.includes("lovable")) return "💖";
  if (s.includes("notion")) return "📝";
  if (s.includes("scribd") || s.includes("book")) return "📚";
  if (s.includes("linkedin")) return "💼";
  if (s.includes("microsoft") || s.includes("windows") || s.includes("office") || s.includes("365")) return "🪟";
  if (s.includes("xbox") || s.includes("game") || s.includes("steam")) return "🎮";
  if (s.includes("vpn") || s.includes("hma") || s.includes("proxy") || s.includes("warp")) return "🛡️";
  if (s.includes("zoom") || s.includes("meet") || s.includes("teams")) return "📹";
  if (s.includes("tiktok")) return "📱";
  if (s.includes("x premium") || s.includes("twitter")) return "🐦";
  if (s.includes("google") || s.includes("family") || s.includes("drive")) return "🌐";
  if (s.includes("telegram") || s.includes("discord")) return "💎";
  return "⚡";
}

export function cleanTelegramProductTitle(rawTitle: string): string {
  let t = rawTitle.trim();
  if (/^chatgpt/i.test(t)) {
    if (/gpay|siêu trâu/i.test(t)) return "ChatGPT Plus GPAY Siêu trâu";
    if (/plus/i.test(t)) return "ChatGPT Plus";
    if (/team/i.test(t)) return "ChatGPT Team";
    return "ChatGPT";
  }
  if (/mail edu/i.test(t) || /campus mail/i.test(t)) {
    return "Mail Edu US";
  }
  if (/hotmail/i.test(t)) {
    return "Hotmail TRUST";
  }
  if (/turnitin/i.test(t)) {
    return "Turnitin No-Repo";
  }
  if (/duolingo/i.test(t)) {
    return "Duolingo Super";
  }
  if (/elsa/i.test(t)) {
    return "Elsa Speak Pro";
  }
  if (/codex/i.test(t)) {
    return "Codex API Credit";
  }
  if (/gemini/i.test(t)) {
    if (/ultra|veo/i.test(t)) return "Gemini Veo3 Ultra";
    if (/pro/i.test(t)) return "Gemini Pro";
    return "Gemini AI";
  }
  if (/^kiro/i.test(t)) {
    return "Kiro Pro IDE (1/10)";
  }
  if (/super grok/i.test(t)) {
    return "Super Grok 7D";
  }
  if (/grok/i.test(t)) {
    return "Grok xAI API";
  }
  if (/netflix/i.test(t)) {
    return "Netflix 4K Ultra";
  }
  if (/capcut/i.test(t)) {
    return "CapCut Pro";
  }
  if (/canva/i.test(t)) {
    return "Canva Pro";
  }
  if (/claude/i.test(t)) {
    if (/api/i.test(t)) return "Claude API";
    if (/x20/i.test(t)) return "Claude X20";
    if (/pro/i.test(t)) return "Claude Pro";
    return "Claude AI";
  }
  if (/cursor/i.test(t)) return "Cursor Pro";
  if (/elevenlab/i.test(t)) return "ElevenLabs";
  if (/youtube|ytb/i.test(t)) return "YouTube Premium";
  if (/leonardo/i.test(t)) return "Leonardo AI";
  if (/kling/i.test(t)) return "Kling AI";
  if (/suno/i.test(t)) return "Suno AI Pro";
  if (/zoom/i.test(t)) return "Zoom Pro";
  if (/hma/i.test(t)) return "HMA VPN";
  if (/notion/i.test(t)) return "Notion Enterprise";
  if (/adobe/i.test(t)) return "Adobe Creative Cloud";
  if (/microsoft/i.test(t)) return "Microsoft 365";
  if (/linkedin/i.test(t)) return "LinkedIn Premium";
  if (/tiktok/i.test(t)) return "TikTok LiveStudio";

  t = t.replace(/\s*(?:hàng|siêu trâu|thẻ riêng|acc cấp sẵn|chưa qua dịch vụ|bh\s*\w+|bảo hành\s*\w+|dùng riêng).*/gi, "");
  t = t.trim();
  if (t.length > 24) {
    const cut = t.slice(0, 24);
    const space = cut.lastIndexOf(" ");
    return space > 10 ? cut.slice(0, space) : cut;
  }
  return t || rawTitle.slice(0, 20);
}

