/**
 * Customer Store Credit and Balance Wallet.
 * Enables instant 1-click checkout using pre-funded customer balance.
 */

export type WalletCurrency = "VND" | "USD";

export type WalletTransactionType = "deposit" | "topup" | "purchase" | "refund" | "adjustment";
export type WalletTopupStatus = "created" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "cancelled";

export type WalletBalance = {
  customerId: string;
  balanceVndMinor: number;
  balanceUsdMinor: number;
  updatedAt: string;
};

export type WalletTransaction = {
  id: string;
  customerId: string;
  type: WalletTransactionType;
  amountMinor: number;
  currency: WalletCurrency;
  balanceAfterMinor: number;
  referenceId: string | null;
  description: string;
  createdAt: string;
};

export type WalletTopup = {
  id: string;
  customerId: string;
  provider: "payos";
  providerOrderCode: number;
  providerDescription: string;
  providerReference: string | null;
  amountMinor: number;
  currency: "VND";
  status: WalletTopupStatus;
  qrImageUrl: string | null;
  checkoutUrl: string | null;
  expiresAt: string;
  confirmedAt: string | null;
};

/**
 * Checks whether the customer wallet has sufficient funds to cover an order total.
 */
export function hasSufficientWalletBalance(
  balance: WalletBalance,
  orderTotalMinor: number,
  currency: WalletCurrency = "VND",
): boolean {
  if (orderTotalMinor <= 0) return true;
  const available = currency === "USD" ? balance.balanceUsdMinor : balance.balanceVndMinor;
  return available >= orderTotalMinor;
}

/**
 * Calculates new balance after a credit (deposit/refund) or debit (purchase).
 */
export function calculateWalletMutation(
  currentBalanceMinor: number,
  deltaMinor: number,
  type: WalletTransactionType,
): { newBalanceMinor: number; success: boolean; error?: string } {
  if (type === "purchase" || deltaMinor < 0) {
    const required = Math.abs(deltaMinor);
    if (currentBalanceMinor < required) {
      return { newBalanceMinor: currentBalanceMinor, success: false, error: "insufficient_wallet_balance" };
    }
    return { newBalanceMinor: currentBalanceMinor - required, success: true };
  }

  // Credit operations
  return { newBalanceMinor: currentBalanceMinor + Math.abs(deltaMinor), success: true };
}

export function walletTopupDescription(id: string) {
  const compact = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `N${compact.slice(-8).padStart(8, "0")}`;
}

export function walletTopupOrderCode(id: string) {
  let value = 0n;
  for (const byte of new TextEncoder().encode(id).slice(0, 7)) value = (value << 8n) | BigInt(byte);
  return Number(100_000_000_000_000n + value % 800_000_000_000_000n);
}

function nowIso() { return new Date().toISOString(); }

export async function applyWalletPayment(db: D1Database, input: { orderId: string; customerId: string; amountMinor: number; currency: WalletCurrency; actor?: string }) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("wallet_amount_invalid");
  const column = input.currency === "USD" ? "balance_usd_minor" : "balance_vnd_minor";
  const guard = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const now = nowIso();
  const statements = [
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_orders WHERE id = ? AND customer_id = ?
          AND payment_status IN ('unpaid', 'pending') AND status NOT IN ('cancelled', 'expired', 'refunded')
      ) AND EXISTS (
        SELECT 1 FROM shop_customer_wallets WHERE customer_id = ? AND ${column} >= ?
      ) THEN 1 ELSE 0 END`).bind(guard, input.orderId, input.customerId, input.customerId, input.amountMinor),
    db.prepare(`UPDATE shop_customer_wallets SET ${column} = ${column} - ?, updated_at = ?
      WHERE customer_id = ? AND ${column} >= ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`)
      .bind(input.amountMinor, now, input.customerId, input.amountMinor, guard),
    db.prepare(`INSERT INTO shop_wallet_transactions
      (id, customer_id, type, amount_minor, currency, balance_after_minor, reference_id, description, created_by, created_at)
      SELECT ?, customer_id, 'purchase', ?, ?, ${column}, ?, ?, ?, ?
      FROM shop_customer_wallets WHERE customer_id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`)
      .bind(transactionId, -input.amountMinor, input.currency, input.orderId, `Thanh toán số dư cho đơn ${input.orderId}`, input.actor ?? "storefront", now, input.customerId, guard),
    db.prepare(`UPDATE shop_orders SET status = CASE WHEN status = 'pending_payment' THEN 'processing' ELSE status END,
      payment_status = 'paid', paid_at = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND customer_id = ? AND payment_status IN ('unpaid', 'pending')
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`)
      .bind(now, now, input.orderId, input.customerId, guard),
    db.prepare(`UPDATE shop_inventory_reservations SET status = 'converted', updated_at = ?
      WHERE order_id = ? AND status = 'active'
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`).bind(now, input.orderId, guard),
    db.prepare(`INSERT INTO shop_fulfillment_events (id, order_id, order_item_id, event_type, channel, details_json, actor, created_at)
      SELECT ? || ':' || oi.id, oi.order_id, oi.id, 'requested',
        CASE WHEN oi.fulfillment_type = 'license_key' AND oi.delivery_mode = 'automatic' THEN 'web' ELSE 'manual' END,
        '{"source":"wallet_payment"}', ?, ? FROM shop_order_items oi
      WHERE oi.order_id = ? AND oi.fulfillment_status = 'unfulfilled'
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`).bind(transactionId, input.actor ?? "storefront", now, input.orderId, guard),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
  ];
  const results = await db.batch(statements);
  if ((results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1 || (results[3]?.meta?.changes ?? 0) !== 1) {
    throw new Error("insufficient_wallet_balance");
  }
  return { transactionId, orderId: input.orderId, amountMinor: input.amountMinor, currency: input.currency };
}

export async function reconcileWalletTopup(db: D1Database, input: {
  providerEventId: string;
  providerReference: string | null;
  providerOrderCode: number;
  orderReference: string;
  amountMinor: number;
  currency: string;
  destinationAccountNumber: string | null;
  expectedAccountNumber: string;
  payloadHash: string;
  occurredAt: string;
}) {
  const existing = await db.prepare("SELECT id, payload_hash, event_type FROM shop_payment_events WHERE provider = 'payos' AND provider_event_id = ? LIMIT 1").bind(input.providerEventId).first<{ id: string; payload_hash: string; event_type: string }>();
  if (existing) {
    if (existing.event_type !== "wallet.topup.confirmation") throw new Error("wallet_topup_not_matched");
    if (existing.payload_hash !== input.payloadHash) throw new Error("wallet_topup_event_payload_mismatch");
    return { outcome: "already_processed" as const, eventId: existing.id };
  }
  const topup = await db.prepare(`SELECT id, customer_id, provider_reference, amount_minor, currency, status, provider_description
    FROM shop_wallet_topups WHERE provider_order_code = ? LIMIT 1`).bind(input.providerOrderCode).first<{
    id: string; customer_id: string; provider_reference: string | null; amount_minor: number; currency: string; status: WalletTopupStatus; provider_description: string;
  }>();
  const matches = Boolean(topup
    && topup.status === "awaiting_payment"
    && topup.amount_minor === input.amountMinor
    && input.currency === "VND"
    && input.orderReference.toUpperCase().replace(/[^A-Z0-9]/g, "") === topup.provider_description
    && /^[0-9]{4,32}$/.test(input.expectedAccountNumber)
    && (input.destinationAccountNumber === input.expectedAccountNumber || !input.destinationAccountNumber)
    && (!topup.provider_reference || !input.providerReference || topup.provider_reference === input.providerReference));
  if (!matches || !topup) throw new Error("wallet_topup_not_matched");
  const eventId = crypto.randomUUID();
  const now = nowIso();
  const transactionId = crypto.randomUUID();
  const guard = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT INTO transaction_guards (token, valid)
      SELECT ?, CASE WHEN EXISTS (
        SELECT 1 FROM shop_wallet_topups WHERE id = ? AND status = 'awaiting_payment'
      ) THEN 1 ELSE 0 END`).bind(guard, topup.id),
    db.prepare(`INSERT INTO shop_payment_events
      (id, provider, provider_event_id, event_type, transaction_reference, amount_minor, currency, order_reference,
       payload_hash, signature_verified, match_state, processing_state, occurred_at, processed_at, created_at)
      SELECT ?, 'payos', ?, 'wallet.topup.confirmation', ?, ?, ?, ?, ?, 1, 'matched', 'processed', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`)
      .bind(eventId, input.providerEventId, input.providerReference, input.amountMinor, input.currency, input.orderReference, input.payloadHash, input.occurredAt, now, now, guard),
    db.prepare(`UPDATE shop_wallet_topups SET status = 'confirmed', provider_reference = COALESCE(provider_reference, ?), confirmed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'awaiting_payment'
        AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`).bind(input.providerReference, now, now, topup.id, guard),
    db.prepare(`INSERT INTO shop_customer_wallets (customer_id, balance_vnd_minor, updated_at)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)
      ON CONFLICT(customer_id) DO UPDATE SET balance_vnd_minor = balance_vnd_minor + excluded.balance_vnd_minor, updated_at = excluded.updated_at`).bind(topup.customer_id, input.amountMinor, now, guard),
    db.prepare(`INSERT INTO shop_wallet_transactions
      (id, customer_id, type, amount_minor, currency, balance_after_minor, reference_id, description, created_by, created_at)
      SELECT ?, customer_id, 'topup', ?, 'VND', balance_vnd_minor, ?, ?, 'payos', ? FROM shop_customer_wallets
      WHERE customer_id = ? AND EXISTS (SELECT 1 FROM transaction_guards WHERE token = ? AND valid = 1)`)
      .bind(transactionId, input.amountMinor, topup.id, `Nạp tiền ví ${topup.id}`, now, topup.customer_id, guard),
    db.prepare("DELETE FROM transaction_guards WHERE token = ?").bind(guard),
  ]);
  if ((results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1
    || (results[3]?.meta?.changes ?? 0) !== 1 || (results[4]?.meta?.changes ?? 0) !== 1) {
    throw new Error("wallet_topup_state_conflict");
  }
  return { outcome: "credited" as const, eventId, topupId: topup.id, customerId: topup.customer_id, amountMinor: input.amountMinor };
}
