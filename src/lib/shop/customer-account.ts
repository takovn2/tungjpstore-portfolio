import { sha256Base64Url } from "./crypto";
import {
  type CustomerAuthProvider,
  recordCustomerSecurityEvent,
} from "./customer-auth";
import { deliverCustomerOwnedOrder, ShopConflictError } from "./service";
import type { ShopBindings, ShopLocale } from "./types";
import { maskShopEmail, normalizeShopEmail } from "./validation";

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function requireDb(bindings: Pick<ShopBindings, "CONTENT_DB">) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  return bindings.CONTENT_DB;
}

export class CustomerAccountError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = "CustomerAccountError";
    this.code = code;
  }
}

export type ResolvedCustomer = {
  id: string;
  emailNormalized: string | null;
  emailMasked: string | null;
  displayName: string;
  locale: ShopLocale;
  status: "active" | "blocked" | "archived";
  accountActivatedAt: string | null;
};

/**
 * Upsert customer + verified identity after OAuth / magic-link success.
 * Links orphan orders that share the verified email and null/same customer_id.
 */
export async function upsertVerifiedCustomerIdentity(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: {
    provider: CustomerAuthProvider;
    externalSubject: string;
    email: string;
    displayName?: string | null;
    displayHandle?: string | null;
    locale?: ShopLocale;
    metadata?: Record<string, unknown>;
  },
): Promise<ResolvedCustomer> {
  const db = requireDb(bindings);
  const now = nowIso();
  const email = normalizeShopEmail(input.email);
  if (!email || email.length > 320 || !email.includes("@")) {
    throw new CustomerAccountError("email_invalid");
  }
  const displayName = (input.displayName?.trim() || email.split("@")[0] || "Customer").slice(0, 120);
  const displayHandle = (input.displayHandle?.trim() || email).slice(0, 200);
  const locale: ShopLocale = input.locale === "en" || input.locale === "ja" || input.locale === "zh" ? input.locale : "vi";

  const byIdentity = await db.prepare(`SELECT c.id, c.email_normalized, c.email_masked, c.display_name, c.locale, c.status,
      c.account_activated_at, c.deleted_at
    FROM shop_customer_identities i
    JOIN shop_customers c ON c.id = i.customer_id
    WHERE i.provider = ? AND i.external_subject = ?
    LIMIT 1`).bind(input.provider, input.externalSubject).first<{
      id: string;
      email_normalized: string | null;
      email_masked: string | null;
      display_name: string;
      locale: ShopLocale;
      status: "active" | "blocked" | "archived";
      account_activated_at: string | null;
      deleted_at: string | null;
    }>();

  let customerId: string;

  if (byIdentity && !byIdentity.deleted_at) {
    if (byIdentity.status === "blocked") throw new CustomerAccountError("customer_blocked");
    customerId = byIdentity.id;
    await db.prepare(`UPDATE shop_customers SET
      email_normalized = COALESCE(email_normalized, ?),
      email_masked = COALESCE(email_masked, ?),
      display_name = CASE WHEN length(trim(display_name)) = 0 THEN ? ELSE display_name END,
      account_activated_at = COALESCE(account_activated_at, ?),
      updated_at = ?
      WHERE id = ?`).bind(email, maskShopEmail(email), displayName, now, now, customerId).run();
    await db.prepare(`UPDATE shop_customer_identities SET
      display_handle = ?, metadata_json = ?, verified_at = COALESCE(verified_at, ?), updated_at = ?
      WHERE provider = ? AND external_subject = ?`).bind(
      displayHandle,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
      input.provider,
      input.externalSubject,
    ).run();
  } else {
    const byEmail = await db.prepare(`SELECT id, status, deleted_at, account_activated_at FROM shop_customers
      WHERE email_normalized = ? AND deleted_at IS NULL LIMIT 1`).bind(email).first<{
        id: string;
        status: "active" | "blocked" | "archived";
        deleted_at: string | null;
        account_activated_at: string | null;
      }>();
    if (byEmail?.status === "blocked") throw new CustomerAccountError("customer_blocked");
    if (byEmail) {
      customerId = byEmail.id;
      await db.prepare(`UPDATE shop_customers SET
        display_name = CASE WHEN length(trim(display_name)) = 0 THEN ? ELSE display_name END,
        account_activated_at = COALESCE(account_activated_at, ?),
        updated_at = ?
        WHERE id = ?`).bind(displayName, now, now, customerId).run();
    } else {
      customerId = crypto.randomUUID();
      await db.prepare(`INSERT INTO shop_customers
        (id, email_normalized, email_masked, display_name, locale, marketing_consent, account_activated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(
        customerId,
        email,
        maskShopEmail(email),
        displayName,
        locale,
        now,
        now,
        now,
      ).run();
    }

    await db.prepare(`INSERT INTO shop_customer_identities
      (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, external_subject) DO UPDATE SET
        customer_id = excluded.customer_id,
        display_handle = excluded.display_handle,
        metadata_json = excluded.metadata_json,
        verified_at = COALESCE(shop_customer_identities.verified_at, excluded.verified_at),
        updated_at = excluded.updated_at`).bind(
      crypto.randomUUID(),
      customerId,
      input.provider,
      input.externalSubject,
      displayHandle,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
      now,
    ).run();
  }

  // Always ensure a verified email identity for account recovery / attach.
  await db.prepare(`INSERT INTO shop_customer_identities
    (id, customer_id, provider, external_subject, display_handle, metadata_json, verified_at, created_at, updated_at)
    VALUES (?, ?, 'email', ?, ?, '{}', ?, ?, ?)
    ON CONFLICT(provider, external_subject) DO UPDATE SET
      customer_id = excluded.customer_id,
      verified_at = COALESCE(shop_customer_identities.verified_at, excluded.verified_at),
      updated_at = excluded.updated_at`).bind(
    crypto.randomUUID(),
    customerId,
    email,
    email,
    now,
    now,
    now,
  ).run();

  await attachOrdersByVerifiedEmail(bindings, customerId, email);

  // Retry this insert on every verified login; the durable dedupe key keeps
  // delivery exactly-once while recovering from a transient first-write error.
  await db.prepare(`INSERT OR IGNORE INTO transactional_email_outbox
    (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
    VALUES (?, 'shop.customer.welcome', 'shop_customer', ?, ?, 'pending', ?, ?, ?)`).bind(
    crypto.randomUUID(),
    customerId,
    `customer-welcome:${customerId}`,
    now,
    now,
    now,
  ).run();

  const row = await db.prepare(`SELECT id, email_normalized, email_masked, display_name, locale, status, account_activated_at
    FROM shop_customers WHERE id = ? LIMIT 1`).bind(customerId).first<{
      id: string;
      email_normalized: string | null;
      email_masked: string | null;
      display_name: string;
      locale: ShopLocale;
      status: "active" | "blocked" | "archived";
      account_activated_at: string | null;
    }>();
  if (!row || row.status === "blocked") throw new CustomerAccountError("customer_blocked");
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    emailMasked: row.email_masked,
    displayName: row.display_name,
    locale: row.locale,
    status: row.status,
    accountActivatedAt: row.account_activated_at,
  };
}

export async function attachOrdersByVerifiedEmail(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  email: string,
) {
  const db = requireDb(bindings);
  const normalized = normalizeShopEmail(email);
  await db.prepare(`UPDATE shop_orders SET customer_id = ?, updated_at = ?
    WHERE customer_email_snapshot = ?
      AND (customer_id IS NULL OR customer_id = ?)`).bind(customerId, nowIso(), normalized, customerId).run();
}

export async function claimOrderByAccessToken(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: { customerId: string; accessToken: string; requestId?: string },
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.accessToken)) {
    throw new CustomerAccountError("order_access_required");
  }
  const db = requireDb(bindings);
  const tokenHash = await sha256Base64Url(input.accessToken);
  const order = await db.prepare(`SELECT id, order_number, customer_id FROM shop_orders
    WHERE public_token_hash = ? LIMIT 1`).bind(tokenHash).first<{
      id: string;
      order_number: string;
      customer_id: string | null;
    }>();
  if (!order) throw new CustomerAccountError("order_not_found");
  if (order.customer_id && order.customer_id !== input.customerId) {
    throw new CustomerAccountError("order_owned_by_other");
  }
  if (!order.customer_id) {
    await db.prepare("UPDATE shop_orders SET customer_id = ?, updated_at = ? WHERE id = ? AND customer_id IS NULL")
      .bind(input.customerId, nowIso(), order.id).run();
  }
  await recordCustomerSecurityEvent(bindings, {
    customerId: input.customerId,
    eventType: "claim_order",
    requestId: input.requestId,
    details: { orderId: order.id },
  });
  return { orderId: order.id, orderNumber: order.order_number };
}

export async function getCustomerProfile(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
) {
  const db = requireDb(bindings);
  const customer = await db.prepare(`SELECT id, email_normalized, email_masked, display_name, locale, status, account_activated_at, created_at
    FROM shop_customers WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(customerId).first<{
      id: string;
      email_normalized: string | null;
      email_masked: string | null;
      display_name: string;
      locale: ShopLocale;
      status: "active" | "blocked" | "archived";
      account_activated_at: string | null;
      created_at: string;
    }>();
  if (!customer) return null;
  const identities = await db.prepare(`SELECT provider, display_handle, verified_at FROM shop_customer_identities
    WHERE customer_id = ? ORDER BY provider`).bind(customerId).all<{
      provider: string;
      display_handle: string | null;
      verified_at: string | null;
    }>();
  return {
    id: customer.id,
    emailMasked: customer.email_masked,
    displayName: customer.display_name,
    locale: customer.locale,
    status: customer.status,
    accountActivatedAt: customer.account_activated_at,
    createdAt: customer.created_at,
    providers: (identities.results ?? []).map((row) => ({
      provider: row.provider,
      handle: row.display_handle,
      verified: Boolean(row.verified_at),
    })),
  };
}

export async function listCustomerOrders(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  options: { limit?: number; cursor?: string | null } = {},
) {
  const db = requireDb(bindings);
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const cursor = options.cursor?.trim() || null;
  const rows = cursor
    ? await db.prepare(`SELECT id, order_number, order_reference, status, payment_status, fulfillment_status,
        currency, total_minor, created_at, paid_at, fulfilled_at
      FROM shop_orders
      WHERE customer_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC
      LIMIT ?`).bind(customerId, cursor, cursor, cursor, limit + 1).all<{
        id: string;
        order_number: string;
        order_reference: string;
        status: string;
        payment_status: string;
        fulfillment_status: string;
        currency: string;
        total_minor: number;
        created_at: string;
        paid_at: string | null;
        fulfilled_at: string | null;
      }>()
    : await db.prepare(`SELECT id, order_number, order_reference, status, payment_status, fulfillment_status,
        currency, total_minor, created_at, paid_at, fulfilled_at
      FROM shop_orders
      WHERE customer_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`).bind(customerId, limit + 1).all<{
        id: string;
        order_number: string;
        order_reference: string;
        status: string;
        payment_status: string;
        fulfillment_status: string;
        currency: string;
        total_minor: number;
        created_at: string;
        paid_at: string | null;
        fulfilled_at: string | null;
      }>();

  const list = rows.results ?? [];
  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;
  const nextCursor = hasMore ? page[page.length - 1]?.created_at ?? null : null;
  return {
    orders: page.map((row) => ({
      id: row.id,
      number: row.order_number,
      reference: row.order_reference,
      status: row.status,
      paymentStatus: row.payment_status,
      fulfillmentStatus: row.fulfillment_status,
      currency: row.currency,
      totalMinor: row.total_minor,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      fulfilledAt: row.fulfilled_at,
    })),
    nextCursor,
  };
}

export async function getCustomerOrderDetail(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  customerId: string,
  orderId: string,
) {
  const db = requireDb(bindings);
  const order = await db.prepare(`SELECT id, order_number, order_reference, status, payment_status, fulfillment_status,
      currency, subtotal_minor, discount_minor, total_minor, discount_code_snapshot,
      created_at, paid_at, fulfilled_at, expires_at
    FROM shop_orders WHERE id = ? AND customer_id = ? LIMIT 1`).bind(orderId, customerId).first<{
      id: string;
      order_number: string;
      order_reference: string;
      status: string;
      payment_status: string;
      fulfillment_status: string;
      currency: string;
      subtotal_minor: number;
      discount_minor: number;
      total_minor: number;
      discount_code_snapshot: string | null;
      created_at: string;
      paid_at: string | null;
      fulfilled_at: string | null;
      expires_at: string | null;
    }>();
  if (!order) return null;
  const items = await db.prepare(`SELECT id, product_slug_snapshot, sku_snapshot, product_title_snapshot,
      variant_title_snapshot, fulfillment_type, delivery_mode, quantity, unit_price_minor,
      total_minor, fulfillment_status
    FROM shop_order_items WHERE order_id = ? ORDER BY line_number, id`).bind(order.id).all<{
      id: string;
      product_slug_snapshot: string;
      sku_snapshot: string;
      product_title_snapshot: string;
      variant_title_snapshot: string;
      fulfillment_type: string;
      delivery_mode: string;
      quantity: number;
      unit_price_minor: number;
      total_minor: number;
      fulfillment_status: string;
    }>();
  return {
    id: order.id,
    number: order.order_number,
    reference: order.order_reference,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    currency: order.currency,
    subtotalMinor: order.subtotal_minor,
    discountMinor: order.discount_minor,
    totalMinor: order.total_minor,
    discountCode: order.discount_code_snapshot,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    fulfilledAt: order.fulfilled_at,
    expiresAt: order.expires_at,
    items: (items.results ?? []).map((item) => ({
      id: item.id,
      productSlug: item.product_slug_snapshot,
      sku: item.sku_snapshot,
      productTitle: item.product_title_snapshot,
      variantTitle: item.variant_title_snapshot,
      fulfillmentType: item.fulfillment_type,
      deliveryMode: item.delivery_mode,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      totalMinor: item.total_minor,
      fulfillmentStatus: item.fulfillment_status,
    })),
  };
}

/**
 * Reveal keys for a customer-owned order by reusing the guest delivery path
 * after proving ownership via customer_id (token recovered from public_token_hash is not available).
 * Implementation: load order, verify ownership+paid, then deliver via internal path using a
 * short-lived reconstructed access — actually we cannot reverse the token hash.
 * Instead call deliver logic with order id ownership check.
 */
export async function revealCustomerOrderKeys(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: { customerId: string; orderId: string; requestId?: string },
) {
  const db = requireDb(bindings);
  const order = await db.prepare(`SELECT id, order_number, public_token_hash, payment_status, status, customer_id
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{
      id: string;
      order_number: string;
      public_token_hash: string;
      payment_status: string;
      status: string;
      customer_id: string | null;
    }>();
  if (!order || order.customer_id !== input.customerId) {
    throw new CustomerAccountError("order_not_found");
  }
  if (order.payment_status !== "paid") {
    throw new CustomerAccountError("order_not_paid");
  }

  // Reserve the reveal slot atomically. A count-then-deliver sequence lets
  // concurrent requests all pass the limit before any event is recorded.
  const since = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const gate = await db.prepare(`INSERT INTO shop_customer_security_events
      (id, customer_id, event_type, request_id, details_json, created_at)
    SELECT ?, ?, 'key_reveal', ?, ?, ?
    WHERE (SELECT COUNT(*) FROM shop_customer_security_events
      WHERE customer_id = ? AND event_type = 'key_reveal' AND created_at >= ?) < 20`).bind(
    crypto.randomUUID(),
    input.customerId,
    input.requestId ?? crypto.randomUUID(),
    JSON.stringify({ orderId: order.id, channel: "account" }),
    nowIso(),
    input.customerId,
    since,
  ).run();
  if (gate.meta.changes !== 1) {
    throw new CustomerAccountError("key_reveal_rate_limited");
  }

  try {
    return await deliverCustomerOwnedOrder(bindings, input.customerId, order.id, "account");
  } catch (error) {
    if (error instanceof ShopConflictError) {
      throw new CustomerAccountError(error.code);
    }
    throw error;
  }
}
