/**
 * Customer VIP Loyalty Tiering and Automatic Discounts.
 */

export type LoyaltyTierLevel = "standard" | "silver" | "gold" | "diamond";

export type LoyaltyTierConfig = {
  level: LoyaltyTierLevel;
  name: Record<string, string>;
  minSpendVndMinor: number;
  minSpendUsdMinor: number;
  discountPercent: number;
  badgeTone: string;
};

export const LOYALTY_TIERS: Record<LoyaltyTierLevel, LoyaltyTierConfig> = {
  standard: {
    level: "standard",
    name: { vi: "Thành viên", en: "Standard Member", ja: "一般会員", zh: "普通会员" },
    minSpendVndMinor: 0,
    minSpendUsdMinor: 0,
    discountPercent: 0,
    badgeTone: "neutral",
  },
  silver: {
    level: "silver",
    name: { vi: "Thành viên Bạc", en: "Silver VIP", ja: "シルバー会員", zh: "白银会员" },
    minSpendVndMinor: 2_500_000,
    minSpendUsdMinor: 10_000, // $100.00
    discountPercent: 3,
    badgeTone: "info",
  },
  gold: {
    level: "gold",
    name: { vi: "Thành viên Vàng", en: "Gold VIP", ja: "ゴールド会員", zh: "黄金会员" },
    minSpendVndMinor: 7_500_000,
    minSpendUsdMinor: 30_000, // $300.00
    discountPercent: 5,
    badgeTone: "warning",
  },
  diamond: {
    level: "diamond",
    name: { vi: "Thành viên Kim Cương", en: "Diamond VIP", ja: "ダイヤモンド会員", zh: "钻石会员" },
    minSpendVndMinor: 25_000_000,
    minSpendUsdMinor: 100_000, // $1,000.00
    discountPercent: 8,
    badgeTone: "accent",
  },
};

export type CustomerLoyaltyInfo = {
  tier: LoyaltyTierConfig;
  totalSpendVndMinor: number;
  totalOrdersCount: number;
  nextTier: LoyaltyTierConfig | null;
  progressPercent: number;
};

/**
 * Determine loyalty tier from total spend in VND minor.
 */
export function resolveLoyaltyTier(totalSpendVndMinor: number): CustomerLoyaltyInfo {
  const spend = Math.max(0, Math.round(totalSpendVndMinor || 0));

  let tier = LOYALTY_TIERS.standard;
  let nextTier: LoyaltyTierConfig | null = LOYALTY_TIERS.silver;

  if (spend >= LOYALTY_TIERS.diamond.minSpendVndMinor) {
    tier = LOYALTY_TIERS.diamond;
    nextTier = null;
  } else if (spend >= LOYALTY_TIERS.gold.minSpendVndMinor) {
    tier = LOYALTY_TIERS.gold;
    nextTier = LOYALTY_TIERS.diamond;
  } else if (spend >= LOYALTY_TIERS.silver.minSpendVndMinor) {
    tier = LOYALTY_TIERS.silver;
    nextTier = LOYALTY_TIERS.gold;
  }

  let progressPercent = 100;
  if (nextTier) {
    const currentBase = tier.minSpendVndMinor;
    const target = nextTier.minSpendVndMinor;
    progressPercent = Math.min(100, Math.max(0, Math.round(((spend - currentBase) / (target - currentBase)) * 100)));
  }

  return {
    tier,
    totalSpendVndMinor: spend,
    totalOrdersCount: 0,
    nextTier,
    progressPercent,
  };
}

/**
 * Calculate loyalty discount amount given subtotal and tier.
 */
export function calculateLoyaltyDiscount(subtotalMinor: number, tierLevel: LoyaltyTierLevel): number {
  if (subtotalMinor <= 0) return 0;
  const config = LOYALTY_TIERS[tierLevel] ?? LOYALTY_TIERS.standard;
  if (config.discountPercent <= 0) return 0;
  return Math.floor((subtotalMinor * config.discountPercent) / 100);
}

/**
 * Query customer lifetime spend from paid orders in D1.
 */
export async function getCustomerLifetimeSpend(
  db: D1Database,
  customerEmail: string,
): Promise<CustomerLoyaltyInfo> {
  const normalizedEmail = customerEmail.trim().toLowerCase();
  if (!normalizedEmail) return resolveLoyaltyTier(0);

  try {
    const row = await db.prepare(`
      SELECT COUNT(id) AS total_orders,
             COALESCE(SUM(total_minor), 0) AS total_spent_vnd
      FROM shop_orders
      WHERE customer_email_snapshot = ?
        AND status IN ('fulfilled', 'processing')
        AND payment_status = 'paid'
        AND currency = 'VND'
    `).bind(normalizedEmail).first<{ total_orders: number; total_spent_vnd: number }>();

    const totalSpend = Number(row?.total_spent_vnd) || 0;
    const count = Number(row?.total_orders) || 0;
    const info = resolveLoyaltyTier(totalSpend);
    return {
      ...info,
      totalOrdersCount: count,
    };
  } catch {
    return resolveLoyaltyTier(0);
  }
}
