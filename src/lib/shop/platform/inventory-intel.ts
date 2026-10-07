/**
 * F6 Inventory Intelligence — stock health signals from inventory rows.
 */

export type InventoryRowInput = {
  variantId: string;
  sku?: string;
  productTitle?: string;
  variantTitle?: string;
  availableCount: number;
  reservedCount?: number;
  fulfilledCount?: number;
  lowStockThreshold?: number;
  inventoryPolicy?: string;
};

export type InventoryAlert = {
  severity: "critical" | "low" | "healthy" | "unlimited";
  variantId: string;
  sku: string;
  title: string;
  availableCount: number;
  threshold: number;
  message: string;
};

export function classifyInventoryRow(row: InventoryRowInput, locale = "vi"): InventoryAlert {
  const threshold = Number(row.lowStockThreshold ?? 3);
  const available = Number(row.availableCount || 0);
  const title = row.productTitle || row.variantTitle || row.sku || row.variantId;
  const sku = row.sku || row.variantId;

  if (row.inventoryPolicy === "unlimited") {
    return {
      severity: "unlimited",
      variantId: row.variantId,
      sku,
      title,
      availableCount: available,
      threshold,
      message: locale === "vi" ? "Không giới hạn tồn" : "Unlimited inventory",
    };
  }
  if (available <= 0) {
    return {
      severity: "critical",
      variantId: row.variantId,
      sku,
      title,
      availableCount: available,
      threshold,
      message: locale === "vi" ? "Hết hàng — cần nhập key" : "Out of stock — restock required",
    };
  }
  if (available <= threshold) {
    return {
      severity: "low",
      variantId: row.variantId,
      sku,
      title,
      availableCount: available,
      threshold,
      message: locale === "vi"
        ? `Sắp hết (${available}/${threshold})`
        : `Low stock (${available}/${threshold})`,
    };
  }
  return {
    severity: "healthy",
    variantId: row.variantId,
    sku,
    title,
    availableCount: available,
    threshold,
    message: locale === "vi" ? "Tồn ổn" : "Healthy stock",
  };
}

export function buildInventoryIntel(
  rows: readonly InventoryRowInput[],
  locale = "vi",
) {
  const alerts = rows.map((row) => classifyInventoryRow(row, locale));
  const critical = alerts.filter((a) => a.severity === "critical");
  const low = alerts.filter((a) => a.severity === "low");
  const healthy = alerts.filter((a) => a.severity === "healthy");
  const totalAvailable = rows.reduce((sum, row) => sum + Number(row.availableCount || 0), 0);

  return {
    totalVariants: rows.length,
    totalAvailable,
    criticalCount: critical.length,
    lowCount: low.length,
    healthyCount: healthy.length,
    alerts: [...critical, ...low, ...healthy],
    needsAttention: [...critical, ...low],
  };
}
