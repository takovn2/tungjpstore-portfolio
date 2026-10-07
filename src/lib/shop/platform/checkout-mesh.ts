/**
 * F5 Global Checkout Mesh — present payment rails by locale/currency/channel.
 */

export type PaymentRailId = "vietqr" | "crypto" | "payos";

export type PaymentRail = {
  id: PaymentRailId;
  label: string;
  description: string;
  currencies: string[];
  channels: Array<"web" | "telegram" | "telegram_glb">;
  recommended?: boolean;
};

export function listPaymentRails(locale = "vi"): PaymentRail[] {
  if (locale === "vi") {
    return [
      {
        id: "vietqr",
        label: "VietQR / payOS",
        description: "Chuyển khoản ngân hàng VN, xác minh tự động sau khi có tín hiệu.",
        currencies: ["VND"],
        channels: ["web", "telegram"],
        recommended: true,
      },
      {
        id: "crypto",
        label: "Crypto (USDT/…)",
        description: "Thanh toán crypto — phù hợp GLB; một số mạng cần review thủ công.",
        currencies: ["USD", "USDT"],
        channels: ["web", "telegram_glb"],
      },
    ];
  }
  return [
    {
      id: "crypto",
      label: "Crypto",
      description: "Pay with supported networks. Manual review may apply.",
      currencies: ["USD", "USDT"],
      channels: ["web", "telegram_glb"],
      recommended: true,
    },
    {
      id: "vietqr",
      label: "VietQR (Vietnam)",
      description: "Bank transfer QR for VND orders on the Vietnam storefront.",
      currencies: ["VND"],
      channels: ["web", "telegram"],
    },
  ];
}

export function recommendRails(input: {
  locale?: string;
  currency?: string;
  channel?: "web" | "telegram" | "telegram_glb";
}): PaymentRail[] {
  const locale = input.locale ?? "en";
  const currency = (input.currency ?? (locale === "vi" ? "VND" : "USD")).toUpperCase();
  const channel = input.channel ?? "web";
  return listPaymentRails(locale)
    .filter((rail) => rail.channels.includes(channel))
    .filter((rail) => rail.currencies.some((c) => c === currency || (currency === "USD" && c === "USDT")))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}
