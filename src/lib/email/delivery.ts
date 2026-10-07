import { openInventoryKey, requireShopCrypto } from "../shop/crypto";
import type { EncryptedInventoryUnitRow, ShopBindings } from "../shop/types";

export type ShopEmailCryptoBindings = Pick<ShopBindings, "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">;

export type DeliveryKeyGroup = {
  orderItemId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  keys: string[];
};

type EligibleOrderItem = {
  id: string;
  quantity: number;
  product_title_snapshot: string;
  variant_title_snapshot: string;
  sku_snapshot: string;
};

type FulfilledAllocation = EncryptedInventoryUnitRow & {
  allocationId: string;
  orderItemId: string;
};

/**
 * Resolve keys only at the last possible boundary before a delivery email is
 * sent. Nothing returned by this function is suitable for persistence or
 * logging; callers must keep the result in memory for the provider call only.
 */
export async function loadFulfilledOrderEmailKeys(
  db: D1Database,
  orderId: string,
  bindings: ShopEmailCryptoBindings,
): Promise<DeliveryKeyGroup[]> {
  const order = await db.prepare(`SELECT status, payment_status, fulfillment_status
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(orderId).first<{
      status: string;
      payment_status: string;
      fulfillment_status: string;
    }>();
  if (!order || order.status !== "fulfilled" || order.payment_status !== "paid" || order.fulfillment_status !== "fulfilled") {
    throw new Error("email_delivery_order_ineligible");
  }

  const expectedRows = await db.prepare(`SELECT id, quantity, product_title_snapshot,
      variant_title_snapshot, sku_snapshot
    FROM shop_order_items
    WHERE order_id = ? AND fulfillment_type = 'license_key'
      AND delivery_mode = 'automatic' AND inventory_policy = 'tracked'
      AND fulfillment_status = 'fulfilled'
    ORDER BY line_number, id`).bind(orderId).all<EligibleOrderItem>();
  if (!expectedRows.results.length) return [];

  const allocationRows = await db.prepare(`SELECT a.id AS allocation_id, a.order_item_id,
      iu.id, iu.variant_id AS variantId, iu.status, iu.crypto_version AS cryptoVersion,
      iu.key_version AS keyVersion, iu.ciphertext_b64 AS ciphertextB64,
      iu.data_iv_b64 AS dataIvB64, iu.wrapped_dek_b64 AS wrappedDekB64,
      iu.wrap_iv_b64 AS wrapIvB64, iu.key_fingerprint AS keyFingerprint
    FROM shop_inventory_allocations a
    JOIN shop_order_items oi ON oi.id = a.order_item_id
    JOIN shop_inventory_units iu ON iu.id = a.inventory_unit_id
    WHERE oi.order_id = ? AND a.status = 'fulfilled' AND iu.status = 'fulfilled'
    ORDER BY oi.line_number, a.created_at, a.id`).bind(orderId).all<EncryptedInventoryUnitRow & { allocation_id: string; order_item_id: string }>();
  const allocations: FulfilledAllocation[] = allocationRows.results.map((row) => ({ ...row, allocationId: row.allocation_id, orderItemId: row.order_item_id }));
  const byItem = new Map<string, FulfilledAllocation[]>();
  const seenAllocationIds = new Set<string>();
  const seenInventoryIds = new Set<string>();
  for (const allocation of allocations) {
    if (seenAllocationIds.has(allocation.allocationId) || seenInventoryIds.has(allocation.id)) {
      throw new Error("email_delivery_keys_incomplete");
    }
    seenAllocationIds.add(allocation.allocationId);
    seenInventoryIds.add(allocation.id);
    const current = byItem.get(allocation.orderItemId) ?? [];
    current.push(allocation);
    byItem.set(allocation.orderItemId, current);
  }

  for (const item of expectedRows.results) {
    if ((byItem.get(item.id)?.length ?? 0) !== item.quantity) {
      throw new Error("email_delivery_keys_incomplete");
    }
  }

  let cryptoContext;
  try {
    cryptoContext = await requireShopCrypto(bindings);
  } catch {
    throw new Error("email_delivery_key_unavailable");
  }

  const groups: DeliveryKeyGroup[] = [];
  for (const item of expectedRows.results) {
    const rows = byItem.get(item.id) ?? [];
    const keys: string[] = [];
    for (const row of rows) {
      try {
        const key = await openInventoryKey(cryptoContext, row as EncryptedInventoryUnitRow);
        if (!key || key.length > 4_096) throw new Error("invalid_delivery_key");
        keys.push(key);
      } catch {
        // Do not leak the row, ciphertext, or plaintext through an error.
        throw new Error("email_delivery_key_unavailable");
      }
    }
    groups.push({
      orderItemId: item.id,
      productTitle: item.product_title_snapshot,
      variantTitle: item.variant_title_snapshot,
      sku: item.sku_snapshot,
      keys,
    });
  }
  return groups;
}
