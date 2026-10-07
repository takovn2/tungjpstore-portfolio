/**
 * F9 Ops Cockpit — pure aggregation of admin health counters.
 */

export type OpsCounts = {
  products: number;
  openOrders: number;
  availableKeys: number;
  paymentAttention: number;
  fulfillmentQueue: number;
  lowStockVariants?: number;
  criticalStockVariants?: number;
  activeDiscounts?: number;
};

export type OpsSnapshot = {
  generatedAt: string;
  health: "healthy" | "attention" | "critical";
  score: number;
  counts: OpsCounts;
  signals: Array<{ level: "info" | "warn" | "error"; code: string; message: string }>;
};

export function buildOpsSnapshot(counts: OpsCounts, locale = "vi"): OpsSnapshot {
  const signals: OpsSnapshot["signals"] = [];
  let score = 100;

  if (counts.paymentAttention > 0) {
    score -= Math.min(40, counts.paymentAttention * 10);
    signals.push({
      level: counts.paymentAttention > 3 ? "error" : "warn",
      code: "payment_attention",
      message: locale === "vi"
        ? `${counts.paymentAttention} sự kiện thanh toán cần chú ý`
        : `${counts.paymentAttention} payment events need attention`,
    });
  }
  if (counts.fulfillmentQueue > 0) {
    score -= Math.min(25, counts.fulfillmentQueue * 5);
    signals.push({
      level: "warn",
      code: "fulfillment_queue",
      message: locale === "vi"
        ? `${counts.fulfillmentQueue} mục outbox/fulfillment đang chờ`
        : `${counts.fulfillmentQueue} fulfillment/outbox items pending`,
    });
  }
  if ((counts.criticalStockVariants ?? 0) > 0) {
    score -= Math.min(30, (counts.criticalStockVariants ?? 0) * 8);
    signals.push({
      level: "error",
      code: "stock_critical",
      message: locale === "vi"
        ? `${counts.criticalStockVariants} SKU hết hàng`
        : `${counts.criticalStockVariants} SKUs out of stock`,
    });
  } else if ((counts.lowStockVariants ?? 0) > 0) {
    score -= Math.min(15, (counts.lowStockVariants ?? 0) * 3);
    signals.push({
      level: "warn",
      code: "stock_low",
      message: locale === "vi"
        ? `${counts.lowStockVariants} SKU sắp hết`
        : `${counts.lowStockVariants} SKUs low stock`,
    });
  }
  if (counts.openOrders > 20) {
    score -= 5;
    signals.push({
      level: "info",
      code: "open_orders_high",
      message: locale === "vi"
        ? `${counts.openOrders} đơn mở — theo dõi xác minh`
        : `${counts.openOrders} open orders — monitor verification`,
    });
  }
  if (counts.availableKeys < 20) {
    score -= 10;
    signals.push({
      level: "warn",
      code: "keys_pool_low",
      message: locale === "vi"
        ? `Pool key available thấp (${counts.availableKeys})`
        : `Low available key pool (${counts.availableKeys})`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const health: OpsSnapshot["health"] =
    score >= 80 ? "healthy" : score >= 50 ? "attention" : "critical";

  if (!signals.length) {
    signals.push({
      level: "info",
      code: "all_clear",
      message: locale === "vi" ? "Hệ thống ổn định" : "Systems nominal",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    health,
    score,
    counts,
    signals,
  };
}
