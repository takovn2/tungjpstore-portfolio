import { buildInventoryIntel } from "./platform/inventory-intel";
import { buildOpsSnapshot, type OpsCounts } from "./platform/ops-snapshot";
import { listPaymentProofs } from "./payment-proofs";

/**
 * Read models for the admin shop ops workbench (overview, orders, payments,
 * fulfillment, telegram bot events). These queries previously lived inline in
 * the admin HTTP router; they belong next to the shop schema they read.
 */

export type ShopOverviewCounts = OpsCounts & {
  activeAffiliates: number;
  revenue30dMinor: number;
  revenue30d: string;
  averageOrderValue: string;
  autoFulfillmentRate: string;
  matchedPaymentsToday: number;
  conversionRate: string;
};

export type ShopOverviewSnapshot = {
  counts: ShopOverviewCounts;
  ops: ReturnType<typeof buildOpsSnapshot>;
  inventoryAlerts: ReturnType<typeof buildInventoryIntel>["needsAttention"];
  ordersSeries: Array<{ date: string; orders: number; paidOrders: number; revenueMinor: number }>;
};

export async function getShopOverviewSnapshot(db: D1Database): Promise<ShopOverviewSnapshot> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const since1d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    products, orders, inventory, payments, fulfillment, lowStock, criticalStock, discounts,
    affiliates, revenue, aov, autoRate, matchedToday, inventoryRows, seriesRows,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM shop_products WHERE deleted_at IS NULL").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_orders WHERE status IN ('pending_payment', 'processing')").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_inventory_units WHERE status = 'available'").first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM shop_payment_events
      WHERE processing_state = 'rejected' OR event_type = 'payment.attention'`).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_webhook_outbox WHERE status IN ('pending', 'failed')").first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (
        SELECT v.id, v.low_stock_threshold AS threshold,
          (SELECT COUNT(*) FROM shop_inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') AS available
        FROM shop_variants v
        WHERE v.deleted_at IS NULL AND v.inventory_policy = 'tracked' AND v.status = 'active'
      ) s WHERE s.available > 0 AND s.available <= s.threshold`).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (
        SELECT v.id,
          (SELECT COUNT(*) FROM shop_inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') AS available
        FROM shop_variants v
        WHERE v.deleted_at IS NULL AND v.inventory_policy = 'tracked' AND v.status = 'active'
      ) s WHERE s.available <= 0`).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_discounts WHERE status = 'active' AND deleted_at IS NULL").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_affiliate_partners WHERE deleted_at IS NULL AND status = 'active'").first<{ count: number }>().catch(() => ({ count: 0 })),
    db.prepare(`SELECT COALESCE(SUM(total_minor), 0) AS sum, COUNT(*) AS cnt
      FROM shop_orders
      WHERE payment_status = 'paid' AND paid_at IS NOT NULL AND paid_at >= ?`).bind(since30d).first<{ sum: number; cnt: number }>(),
    db.prepare(`SELECT COALESCE(AVG(total_minor), 0) AS avg
      FROM shop_orders
      WHERE payment_status = 'paid' AND paid_at IS NOT NULL AND paid_at >= ?`).bind(since30d).first<{ avg: number }>(),
    db.prepare(`SELECT
        SUM(CASE WHEN fulfillment_status = 'fulfilled' AND payment_status = 'paid' THEN 1 ELSE 0 END) AS fulfilled,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid
      FROM shop_orders WHERE paid_at IS NOT NULL AND paid_at >= ?`).bind(since30d).first<{ fulfilled: number; paid: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM shop_payment_events
      WHERE created_at >= ? AND (event_type LIKE '%proof%' OR event_type LIKE '%match%' OR match_state = 'matched')`).bind(since1d).first<{ count: number }>().catch(() => ({ count: 0 })),
    db.prepare(`SELECT v.id AS variantId, v.sku, v.low_stock_threshold AS lowStockThreshold, v.inventory_policy AS inventoryPolicy,
        COALESCE(p_loc.title, v.sku) AS productTitle,
        (SELECT COUNT(*) FROM shop_inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') AS availableCount
      FROM shop_variants v
      JOIN shop_products p ON p.id = v.product_id
      LEFT JOIN shop_product_localizations p_loc ON p_loc.product_id = p.id AND p_loc.locale = 'vi'
      WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.status = 'active' AND v.inventory_policy = 'tracked'
      ORDER BY availableCount ASC LIMIT 80`).all<{
        variantId: string; sku: string; lowStockThreshold: number; inventoryPolicy: string;
        productTitle: string; availableCount: number;
      }>(),
    // Bucket order activity on Vietnam-local calendar days so the admin sales
    // pulse chart matches the operator's wall clock.
    db.prepare(`SELECT substr(datetime(created_at, '+7 hours'), 1, 10) AS date,
        COUNT(*) AS orders,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paidOrders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_minor ELSE 0 END), 0) AS revenueMinor
      FROM shop_orders WHERE created_at >= ?
      GROUP BY substr(datetime(created_at, '+7 hours'), 1, 10)`).bind(since7d).all<{ date: string; orders: number; paidOrders: number; revenueMinor: number }>(),
  ]);
  const paidCount = Number(revenue?.cnt || 0);
  const paidSum = Number(revenue?.sum || 0);
  const paidOrders = Number(autoRate?.paid || 0);
  const fulfilledOrders = Number(autoRate?.fulfilled || 0);
  const counts = {
    products: products?.count ?? 0,
    openOrders: orders?.count ?? 0,
    availableKeys: inventory?.count ?? 0,
    paymentAttention: payments?.count ?? 0,
    fulfillmentQueue: fulfillment?.count ?? 0,
    lowStockVariants: lowStock?.count ?? 0,
    criticalStockVariants: criticalStock?.count ?? 0,
    activeDiscounts: discounts?.count ?? 0,
    activeAffiliates: affiliates?.count ?? 0,
    revenue30dMinor: paidSum,
    revenue30d: paidSum > 0 ? `${Math.round(paidSum / 1000).toLocaleString("vi-VN")}k` : "0",
    averageOrderValue: paidCount > 0
      ? `${Math.round(Number(aov?.avg || 0) / 1000).toLocaleString("vi-VN")}k`
      : "—",
    autoFulfillmentRate: paidOrders > 0
      ? `${Math.round((fulfilledOrders / paidOrders) * 100)}%`
      : "—",
    matchedPaymentsToday: matchedToday?.count ?? 0,
    conversionRate: "—",
  };
  const ops = buildOpsSnapshot(counts, "vi");
  const inventoryIntel = buildInventoryIntel(
    (inventoryRows.results || []).map((row) => ({
      variantId: row.variantId,
      sku: row.sku,
      productTitle: row.productTitle,
      availableCount: Number(row.availableCount || 0),
      lowStockThreshold: Number(row.lowStockThreshold ?? 3),
      inventoryPolicy: row.inventoryPolicy,
    })),
    "vi",
  );
  const byDate = new Map(seriesRows.results.map((row) => [row.date, row]));
  const ordersSeries: ShopOverviewSnapshot["ordersSeries"] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    ordersSeries.push({
      date,
      orders: Number(row?.orders || 0),
      paidOrders: Number(row?.paidOrders || 0),
      revenueMinor: Number(row?.revenueMinor || 0),
    });
  }
  return {
    counts,
    ops,
    inventoryAlerts: inventoryIntel.needsAttention.slice(0, 20),
    ordersSeries,
  };
}

export type AdminOrdersPage = {
  orders: Array<Record<string, unknown>>;
  total: number;
  pagination: { page: number; limit: number; totalPages: number };
};

/** Page-based admin order list with an optional order-number/email search. */
export async function listShopOrdersForAdmin(
  db: D1Database,
  input: { page?: number; limit?: number; query?: string | null } = {},
): Promise<AdminOrdersPage> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const page = Math.max(1, input.page ?? 1);
  const offset = (page - 1) * limit;
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 120) : "";
  if (query) {
    clauses.push(`(order_number LIKE ? ESCAPE '\\' OR order_reference LIKE ? ESCAPE '\\'
      OR customer_email_snapshot LIKE ? ESCAPE '\\')`);
    const prefix = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    bindings.push(prefix, prefix, prefix);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT id, order_number AS orderNumber, order_reference AS orderReference,
      status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, currency, total_minor AS totalMinor,
      customer_email_snapshot AS customerEmail, source_channel AS sourceChannel, created_at AS createdAt, updated_at AS updatedAt
      FROM shop_orders${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM shop_orders${where}`)
      .bind(...bindings).first<{ count: number }>(),
  ]);
  const total = Number(count?.count ?? 0);
  return {
    orders: rows.results,
    total,
    pagination: { page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getShopOrderDetail(db: D1Database, orderId: string) {
  const order = await db.prepare(`SELECT id, order_number AS orderNumber, order_reference AS orderReference,
    status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, currency,
    subtotal_minor AS subtotalMinor, discount_minor AS discountMinor, tax_minor AS taxMinor, total_minor AS totalMinor,
    customer_email_snapshot AS customerEmail, customer_name_snapshot AS customerName, source_channel AS sourceChannel,
    expires_at AS expiresAt, paid_at AS paidAt, fulfilled_at AS fulfilledAt, created_at AS createdAt, updated_at AS updatedAt
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>();
  if (!order) return null;
  const [items, payments, paymentEvents, fulfillment, cryptoPayment, cryptoEvents, paymentProofs] = await Promise.all([
    db.prepare(`SELECT id, line_number AS lineNumber, product_id AS productId, variant_id AS variantId,
      product_slug_snapshot AS productSlug, sku_snapshot AS sku, product_title_snapshot AS productTitle,
      variant_title_snapshot AS variantTitle, fulfillment_type AS fulfillmentType, quantity,
      unit_price_minor AS unitPriceMinor, subtotal_minor AS subtotalMinor, discount_minor AS discountMinor,
      total_minor AS totalMinor, fulfillment_status AS fulfillmentStatus, created_at AS createdAt, updated_at AS updatedAt
      FROM shop_order_items WHERE order_id = ? ORDER BY line_number`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, provider, confirmation_provider AS confirmationProvider, status,
      amount_minor AS amountMinor, currency, order_reference AS orderReference, expires_at AS expiresAt,
      confirmed_at AS confirmedAt, created_at AS createdAt, updated_at AS updatedAt
      FROM shop_payment_attempts WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, provider, payment_attempt_id AS paymentAttemptId, event_type AS eventType,
      transaction_reference AS transactionReference, amount_minor AS amountMinor, currency,
      order_reference AS orderReference, match_state AS matchState, processing_state AS processingState,
      error_code AS errorCode, occurred_at AS occurredAt, created_at AS createdAt
      FROM shop_payment_events WHERE order_id = ? AND event_type = 'payment.attention'
      ORDER BY created_at DESC LIMIT 50`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, order_item_id AS orderItemId, event_type AS eventType, channel,
      provider_reference AS providerReference, error_code AS errorCode, created_at AS createdAt
      FROM shop_fulfillment_events WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, payment_method_id AS paymentMethodId, provider, rail, asset, network,
      expected_amount_atomic AS expectedAmountAtomic, expected_amount_minor AS amountMinor,
      destination_snapshot AS destination, memo_or_tag_snapshot AS memoOrTag, customer_reference AS customerReference,
      transaction_reference AS transactionReference, status, evidence_json AS evidenceJson,
      failure_code AS failureCode, checked_at AS checkedAt, confirmed_at AS confirmedAt,
      expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
      FROM shop_crypto_payment_attempts WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, payment_attempt_id AS paymentAttemptId, provider, rail, provider_event_id AS providerEventId,
      transaction_reference AS transactionReference, asset, network, amount_atomic AS amountAtomic, destination,
      status, match_state AS matchState, error_code AS errorCode, occurred_at AS occurredAt, created_at AS createdAt
      FROM shop_crypto_payment_events WHERE order_id = ? ORDER BY created_at DESC LIMIT 50`).bind(orderId).all<Record<string, unknown>>(),
    listPaymentProofs(db, orderId, "/admin/api/payment-proofs").catch((error) => {
      if (error instanceof Error && /no such table:\s*shop_payment_proofs/i.test(error.message)) return [];
      throw error;
    }),
  ]);
  return {
    ...order,
    items: items.results,
    payments: payments.results,
    paymentEvents: paymentEvents.results,
    cryptoPayments: cryptoPayment.results,
    cryptoEvents: cryptoEvents.results,
    paymentProofs,
    fulfillment: fulfillment.results,
  };
}

export async function listPaymentWorkbench(db: D1Database) {
  const [attempts, attentionEvents, cryptoAttempts, cryptoEvents] = await Promise.all([
    db.prepare(`SELECT id, order_id AS orderId, provider, confirmation_provider AS confirmationProvider,
      status, amount_minor AS amountMinor, currency, order_reference AS orderReference, expires_at AS expiresAt,
      confirmed_at AS confirmedAt, created_at AS createdAt FROM shop_payment_attempts ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, provider, payment_attempt_id AS paymentAttemptId, order_id AS orderId,
      event_type AS eventType, transaction_reference AS transactionReference, amount_minor AS amountMinor,
      currency, order_reference AS orderReference, match_state AS matchState,
      processing_state AS processingState, error_code AS errorCode, occurred_at AS occurredAt,
      created_at AS createdAt FROM shop_payment_events
      WHERE event_type = 'payment.attention' OR processing_state = 'rejected'
      ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, order_id AS orderId, payment_method_id AS paymentMethodId, provider, rail,
      asset, network, expected_amount_atomic AS expectedAmountAtomic, expected_amount_minor AS amountMinor,
      destination_snapshot AS destination, memo_or_tag_snapshot AS memoOrTag, customer_reference AS customerReference,
      transaction_reference AS transactionReference, status, failure_code AS failureCode, checked_at AS checkedAt,
      expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
      FROM shop_crypto_payment_attempts ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, payment_attempt_id AS paymentAttemptId, order_id AS orderId, provider, rail,
      transaction_reference AS transactionReference, asset, network,
      amount_atomic AS amountAtomic, destination, status, match_state AS matchState, error_code AS errorCode,
      occurred_at AS occurredAt, created_at AS createdAt
      FROM shop_crypto_payment_events ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
  ]);
  return {
    payments: attempts.results,
    attentionEvents: attentionEvents.results,
    cryptoAttempts: cryptoAttempts.results,
    cryptoEvents: cryptoEvents.results,
  };
}

export async function getVietQrProviderRow(db: D1Database) {
  return db.prepare(`SELECT id, provider, display_name AS displayName, status, bank_id AS bankId,
      account_ref AS accountRef, account_name_display AS accountNameDisplay, qr_template AS qrTemplate,
      confirmation_adapter AS confirmationAdapter, secret_ref AS secretRef, version,
      created_at AS createdAt, updated_at AS updatedAt
    FROM shop_payment_provider_configs WHERE provider = 'vietqr'
    ORDER BY updated_at DESC LIMIT 1`).first<Record<string, unknown> & { secretRef?: string | null }>();
}

export async function listFulfillmentOps(db: D1Database) {
  const [events, outbox] = await Promise.all([
    db.prepare(`SELECT id, order_id AS orderId, order_item_id AS orderItemId, event_type AS eventType,
      channel, error_code AS errorCode, created_at AS createdAt FROM shop_fulfillment_events ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, topic, aggregate_id AS aggregateId, destination, status, attempt_count AS attemptCount,
      available_at AS availableAt, last_error_code AS lastErrorCode, updated_at AS updatedAt
      FROM shop_webhook_outbox ORDER BY created_at DESC LIMIT 100`).all<Record<string, unknown>>(),
  ]);
  return { fulfillment: events.results, outbox: outbox.results };
}

export async function listTelegramBotEvents(db: D1Database) {
  const events = await db.prepare(`SELECT e.action, e.outcome, e.error_code AS errorCode,
      e.actor, e.request_id AS requestId, e.created_at AS createdAt,
      b.id AS botId, b.label, b.username
    FROM shop_telegram_bot_events e
    LEFT JOIN shop_telegram_bot_configs b ON b.id = e.bot_config_id
    ORDER BY e.created_at DESC LIMIT 100`).all<Record<string, unknown>>();
  return events.results;
}

export type AdminProductsPage = {
  products: Array<Record<string, unknown>>;
  total: number;
  pagination: { page: number; limit: number; totalPages: number };
};

/** Page-based admin product list mirroring the catalog editor ordering. */
export async function listShopProductsForAdmin(
  db: D1Database,
  input: { page?: number; limit?: number } = {},
): Promise<AdminProductsPage> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const page = Math.max(1, input.page ?? 1);
  const offset = (page - 1) * limit;
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT id, slug, status, product_type AS productType, featured,
      sort_order AS sortOrder, default_locale AS defaultLocale, version, updated_at AS updatedAt
      FROM shop_products WHERE deleted_at IS NULL ORDER BY featured DESC, sort_order, updated_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset).all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS count FROM shop_products WHERE deleted_at IS NULL").first<{ count: number }>(),
  ]);
  const total = Number(count?.count ?? 0);
  return {
    products: rows.results,
    total,
    pagination: { page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
