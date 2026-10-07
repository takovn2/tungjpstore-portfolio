import type { Locale } from "../../i18n/dictionaries";

export type ServiceBudgetBand = "focused" | "build" | "platform";
export type ServicePricePoint =
  | "landing"
  | "businessLeadGen"
  | "businessGrowth"
  | "commercePortal"
  | "saasDiscovery"
  | "saasMvp"
  | "saasMultiTenant"
  | "advanced";

const budgetBandsVnd = {
  // Evidence-based planning bands for common SME web engagements.
  // They are intentionally ranges, not fixed quotes; scope and acceptance
  // criteria are confirmed in the proposal.
  focused: { minimum: 12_000_000, maximum: 18_000_000 },
  build: { minimum: 28_000_000, maximum: 95_000_000 },
  platform: { minimum: 100_000_000 },
} as const;

const servicePricePointsVnd = {
  landing: { minimum: 12_000_000, maximum: 18_000_000 },
  businessLeadGen: { minimum: 28_000_000, maximum: 45_000_000 },
  businessGrowth: { minimum: 60_000_000, maximum: 95_000_000 },
  commercePortal: { minimum: 100_000_000, maximum: 180_000_000 },
  saasDiscovery: { minimum: 20_000_000, maximum: 35_000_000 },
  saasMvp: { minimum: 180_000_000, maximum: 320_000_000 },
  saasMultiTenant: { minimum: 400_000_000, maximum: 800_000_000 },
  advanced: { minimum: 900_000_000 },
} as const satisfies Record<ServicePricePoint, { minimum: number; maximum?: number }>;

// Indicative midpoint rates from ExchangeRate-API, base VND, updated 2026-07-25 UTC.
const currencyByLocale = {
  vi: { currency: "VND", locale: "vi-VN", rate: 1, rounding: 1 },
  en: { currency: "USD", locale: "en-US", rate: 0.000038, rounding: 100 },
  ja: { currency: "JPY", locale: "ja-JP", rate: 0.006231, rounding: 10_000 },
  zh: { currency: "CNY", locale: "zh-CN", rate: 0.000258, rounding: 1_000 },
} as const satisfies Record<Locale, { currency: string; locale: string; rate: number; rounding: number }>;

function formatAmount(amountVnd: number, locale: Locale) {
  const target = currencyByLocale[locale];
  const converted = amountVnd * target.rate;
  const rounded = Math.round(converted / target.rounding) * target.rounding;
  return new Intl.NumberFormat(target.locale, {
    style: "currency",
    currency: target.currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(rounded);
}

function formatBaseAmount(amountVnd: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amountVnd);
}

export function formatServiceBudgetBand(band: ServiceBudgetBand, locale: Locale) {
  const range = budgetBandsVnd[band];
  const minimum = "minimum" in range ? range.minimum : null;
  const maximum = "maximum" in range ? range.maximum : null;
  const targetMinimum = minimum === null ? null : formatAmount(minimum, locale);
  const targetMaximum = maximum === null ? null : formatAmount(maximum, locale);
  const baseMinimum = minimum === null ? null : formatBaseAmount(minimum);
  const baseMaximum = maximum === null ? null : formatBaseAmount(maximum);

  if (locale === "vi") {
    if (targetMinimum === null) return { primary: `Tối đa ${targetMaximum}`, base: null };
    if (targetMaximum === null) return { primary: `Từ ${targetMinimum}`, base: null };
    return { primary: `${targetMinimum} – ${targetMaximum}`, base: null };
  }

  const labels = {
    en: { upTo: "Up to", from: "From", estimate: "≈", base: "Base planning band" },
    ja: { upTo: "まで", from: "から", estimate: "目安", base: "基準予算帯" },
    zh: { upTo: "以内", from: "起", estimate: "参考", base: "基础预算区间" },
  } as const;
  const label = labels[locale];

  if (targetMinimum === null) {
    return {
      primary: locale === "en" ? `${label.upTo} ${label.estimate} ${targetMaximum}` : `${label.estimate} ${targetMaximum}${label.upTo}`,
      base: `${label.base}: ${locale === "en" ? "up to " : ""}${baseMaximum}${locale === "ja" ? "まで" : locale === "zh" ? "以内" : ""}`,
    };
  }
  if (targetMaximum === null) {
    return {
      primary: locale === "en" ? `${label.from} ${label.estimate} ${targetMinimum}` : `${label.estimate} ${targetMinimum}${label.from}`,
      base: `${label.base}: ${locale === "en" ? "from " : ""}${baseMinimum}${locale === "ja" ? "から" : locale === "zh" ? "起" : ""}`,
    };
  }
  return {
    primary: `${label.estimate} ${targetMinimum} – ${targetMaximum}`,
    base: `${label.base}: ${baseMinimum} – ${baseMaximum}`,
  };
}

export function formatServicePricePoint(point: ServicePricePoint, locale: Locale) {
  const range = servicePricePointsVnd[point];
  const targetMinimum = formatAmount(range.minimum, locale);
  const targetMaximum = "maximum" in range ? formatAmount(range.maximum, locale) : null;
  const baseMinimum = formatBaseAmount(range.minimum);
  const baseMaximum = "maximum" in range ? formatBaseAmount(range.maximum) : null;

  if (locale === "vi") {
    return {
      primary: targetMaximum ? `${targetMinimum} – ${targetMaximum}` : `Từ ${targetMinimum}`,
      base: null,
    };
  }

  const from = locale === "en" ? "From" : locale === "ja" ? "目安" : "参考";
  const baseLabel = locale === "en" ? "Base" : locale === "ja" ? "基準" : "基础";
  return {
    primary: targetMaximum
      ? `≈ ${targetMinimum} – ${targetMaximum}`
      : locale === "en"
        ? `${from} ≈ ${targetMinimum}`
        : `≈ ${targetMinimum}${locale === "ja" ? "から" : "起"}`,
    base: targetMaximum
      ? `${baseLabel}: ${baseMinimum} – ${baseMaximum}`
      : `${baseLabel}: ${locale === "en" ? "from " : ""}${baseMinimum}${locale === "ja" ? "から" : locale === "zh" ? "起" : ""}`,
  };
}

export function getServiceCurrencyNote(locale: Locale) {
  return ({
    vi: "Các dải ngân sách là mốc lập kế hoạch, không phải báo giá cố định. Mặc định proposal tính 50/30/20 theo milestone; phí domain, hosting, SaaS, ảnh, nội dung và bên thứ ba chưa bao gồm. Bảo hành lỗi 14–30 ngày được ghi rõ theo phạm vi.",
    en: "Converted amounts are planning references using rates updated 25 Jul 2026. Proposals typically use 50/30/20 milestone payments; domains, hosting, SaaS, media and third-party fees are excluded. A 14–30 day defect warranty is stated per scope.",
    ja: "換算額は2026年7月25日更新の為替を使った計画上の参考値です。通常は50/30/20のマイルストーン払いで、domain、hosting、SaaS、素材、第三者費用は別途。14〜30日の不具合保証を範囲ごとに明記します。",
    zh: "换算金额仅用于规划，汇率更新于2026年7月25日。方案通常按50/30/20里程碑付款；domain、hosting、SaaS、素材和第三方费用另计，并按范围注明14–30天缺陷保修。",
  } as const)[locale];
}
