/**
 * Shop-layer error codes that the admin API surfaces to operators. Keeping
 * the registry next to the shop errors (instead of the HTTP router) means a
 * new code only needs one home; `shopHttpStatus` owns the status mapping.
 */
export const SHOP_CLIENT_ERROR_CODES = new Set([
  "checkout_conflict",
  "discount_currency_mismatch",
  "discount_customer_limit_reached",
  "discount_invalid",
  "discount_limit_reached",
  "discount_minimum_not_met",
  "discount_not_applicable",
  "discount_outside_window",
  "discount_code_conflict",
  "fulfillment_delivery_conflict",
  "fulfillment_lease_invalid",
  "idempotency_in_progress",
  "idempotency_key_reused",
  "insufficient_inventory",
  "inventory_import_conflict",
  "inventory_import_chunk_conflict",
  "inventory_import_chunk_mismatch",
  "inventory_import_chunk_not_found",
  "inventory_import_not_found",
  "variant_archive_inventory_conflict",
  "variant_product_mismatch",
  "inventory_variant_not_eligible",
  "mixed_currency_not_supported",
  "manual_confirm_reason_required",
  "manual_confirm_conflict",
  "order_not_payable",
  "order_payment_not_pending",
  "payment_attempt_conflict",
  "payment_expired",
  "payment_not_available",
  "payment_provider_conflict",
  "crypto_payment_method_conflict",
  "crypto_provider_not_configured",
  "crypto_destination_required",
  "payment_reconciliation_conflict",
  "product_archive_conflict",
  "product_create_conflict",
  "product_update_conflict",
  "category_archive_conflict",
  "category_create_conflict",
  "category_not_found",
  "category_update_conflict",
  "category_slug_in_use",
  "category_in_use",
  "quantity_limit_exceeded",
  "variant_not_available",
  "variant_not_found",
  "crypto_currency_usd_required",
  "crypto_payment_method_not_configured",
  "crypto_amount_invalid",
  "currency_rate_invalid",
  "currency_rate_conflict",
  "currency_pricing_not_migrated",
  "shop_product_not_publishable",
]);

export function shopErrorCode(error: unknown): string {
  const typedCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
  const messageCode = error instanceof Error && SHOP_CLIENT_ERROR_CODES.has(error.message) ? error.message : null;
  return typedCode ?? messageCode ?? "shop_unavailable";
}

export function shopHttpStatus(code: string): number {
  if (code === "shop_not_found" || code.endsWith("_not_found")) return 404;
  if (SHOP_CLIENT_ERROR_CODES.has(code)) return 409;
  if (code.endsWith("_validation_failed")) return 422;
  return 503;
}
