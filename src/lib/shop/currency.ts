import type { Locale } from "../../i18n/dictionaries";
import type { ProductViewModel } from "../../i18n/shop";
import { localeCurrency } from "../../i18n/locale-preference.ts";

// Indicative midpoint rates from ExchangeRate-API, base VND, updated 2026-07-25 UTC.
const ratesPerVnd = {
  VND: 1,
  USD: 0.000038,
  JPY: 0.006231,
  CNY: 0.000258,
} as const;

// The locale-to-currency map is shared with the storefront header and the market
// layer. This file used to carry its own copy mapping ja to JPY and zh to CNY
// while every other surface said USD, so a Japanese visitor saw "USD" in the
// header and "≈ ¥..." on the same product page. JPY and CNY stay in the rate
// table above for when a market actually prices in them.
const localeTag = {
  vi: "vi-VN",
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
} as const satisfies Record<Locale, string>;

const fractionDigits = (currency: string) => new Intl.NumberFormat("en", {
  style: "currency",
  currency,
}).resolvedOptions().maximumFractionDigits ?? 2;

function convertMajor(amountMinor: number, sourceCurrency: string, targetCurrency: keyof typeof ratesPerVnd) {
  const source = sourceCurrency.toUpperCase() as keyof typeof ratesPerVnd;
  const sourceRate = ratesPerVnd[source];
  if (!sourceRate) return null;
  const sourceMajor = amountMinor / (10 ** fractionDigits(source));
  return (sourceMajor / sourceRate) * ratesPerVnd[targetCurrency];
}

function formatConverted(amountMinor: number, sourceCurrency: string, locale: Locale) {
  const targetCurrency = localeCurrency[locale];
  if (sourceCurrency.toUpperCase() === targetCurrency) return null;
  const converted = convertMajor(amountMinor, sourceCurrency, targetCurrency);
  if (converted === null || !Number.isFinite(converted)) return null;
  return `≈ ${new Intl.NumberFormat(localeTag[locale], {
    style: "currency",
    currency: targetCurrency,
    currencyDisplay: "symbol",
    maximumFractionDigits: targetCurrency === "VND" ? 0 : 2,
  }).format(converted)}`;
}

export function formatApproximateMoney(amountMinor: number, sourceCurrency: string, locale: Locale) {
  return formatConverted(amountMinor, sourceCurrency, locale);
}

export function formatApproximateProductPrice(product: ProductViewModel, locale: Locale) {
  const minimum = formatConverted(product.minPriceMinor, product.currency, locale);
  if (!minimum) return null;
  if (product.minPriceMinor === product.maxPriceMinor) return minimum;
  const maximum = formatConverted(product.maxPriceMinor, product.currency, locale);
  return maximum ? `${minimum} – ${maximum.replace(/^≈\s*/, "")}` : minimum;
}

export function getExchangeRateNote(locale: Locale) {
  const target = localeCurrency[locale];
  return ({
    vi: `Giá quy đổi ${target} chỉ để tham khảo. Cập nhật tỷ giá: 25/07/2026; đơn hàng luôn dùng giá và tiền tệ gốc.`,
    en: `${target} conversions are indicative only. Rates updated 25 Jul 2026; orders always use the original price and currency.`,
    ja: `${target}換算は参考値です。為替更新：2026年7月25日。注文には元の価格と通貨が適用されます。`,
    zh: `${target}换算仅供参考。汇率更新于2026年7月25日；订单始终以原始价格和币种为准。`,
  } as const)[locale];
}
