/**
 * Money: the single source of truth for shop currency math.
 *
 * This module is deliberately import-free so the lightweight smoke-test bundler
 * can concatenate it ahead of modules whose imports it strips (notably
 * repository.ts). Do not add imports here without updating those harnesses.
 *
 * Rules enforced across the codebase:
 *  - Amounts are always integer minor units (cents, xu, sen...). Never floats.
 *  - Conversion goes through BigInt so repeated rounding cannot drift.
 *  - Two minor amounts may only be added or compared when the currency matches.
 *
 * Currency roles, which are easy to conflate and must not be:
 *  - COST currency (VND today): what the merchant pays. The margin floor.
 *  - PRESENTMENT currency: what the customer is shown and charged in.
 *  - SETTLEMENT currency: what the order books against.
 * An order snapshots all three plus the rate used, so it stays auditable after
 * the rate moves.
 */

export const SHOP_BASE_CURRENCY = "VND" as const;
export const SHOP_DISPLAY_CURRENCY = "USD" as const;
export const SHOP_RATE_SCALE = 1_000_000;
export const DEFAULT_USD_VND_RATE = 25_500;
export const DEFAULT_USD_VND_RATE_SCALED = DEFAULT_USD_VND_RATE * SHOP_RATE_SCALE;

export type ShopPricingSettings = {
  id: "default";
  baseCurrency: typeof SHOP_BASE_CURRENCY;
  displayCurrency: typeof SHOP_DISPLAY_CURRENCY;
  usdVndRateScaled: number;
  rateScale: typeof SHOP_RATE_SCALE;
  version: number;
  updatedBy: string;
  updatedAt: string;
};

export function rateScaledToNumber(rateScaled: number) {
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) return null;
  return rateScaled / SHOP_RATE_SCALE;
}

/**
 * How many decimal places a currency actually has.
 *
 * Hardcoding 2 is wrong for JPY, KRW and VND (0) and for BHD, KWD (3). Anything
 * that renders or converts money has to respect this, otherwise a ¥ price is
 * shown 100x too small.
 */
export function currencyFractionDigits(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" ? digits : 2;
  } catch {
    return 2;
  }
}

export function minorToMajor(amountMinor: number, currency: string): number {
  return amountMinor / (10 ** currencyFractionDigits(currency));
}

export function majorToMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * (10 ** currencyFractionDigits(currency)));
}

/**
 * Guards the one mistake that silently corrupts money: mixing currencies.
 * Call it before adding, subtracting or comparing two minor amounts.
 */
export function assertSameCurrency(left: string, right: string): void {
  if (left.toUpperCase() !== right.toUpperCase()) {
    throw new RangeError(`currency_mismatch:${left}:${right}`);
  }
}

/**
 * Invert a scaled rate, e.g. "25,500 VND per USD" into "USD per VND".
 *
 * Inverse rates are almost never integers at the original scale (1/25500 needs
 * five leading zeros), so the result is re-expressed at `targetScale`. Callers
 * must pass that scale back into `convertMinor`. Precision beyond 1e-12 is
 * irrelevant for retail prices.
 */
export function invertRateScaled(
  rateScaled: number,
  rateScale: number = SHOP_RATE_SCALE,
  targetScale: number = 1_000_000_000_000,
): number {
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) throw new RangeError("invalid_rate");
  if (!Number.isSafeInteger(rateScale) || rateScale <= 0) throw new RangeError("invalid_rate_scale");
  const numerator = BigInt(targetScale) * BigInt(rateScale);
  const denominator = BigInt(rateScaled);
  const result = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError("inverted_rate_out_of_range");
  return result;
}

/**
 * Convert an integer minor amount between any two currencies, rounding half up.
 *
 * IMPORTANT — rate direction: `rateScaled / rateScale` is how many units of
 * `fromCurrency` one unit of `toCurrency` costs, i.e. the conversion DIVIDES by
 * the rate. A stored "25,500 VND per USD" therefore converts VND to USD directly
 * and needs `invertRateScaled` to go the other way.
 *
 * BigInt throughout, so no intermediate value is ever a float.
 */
export function convertMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rateScaled: number,
  rateScale: number = SHOP_RATE_SCALE,
): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError("invalid_amount");
  // Short-circuit before validating the rate: converting within one currency
  // needs no rate at all, and callers legitimately pass a placeholder when no
  // pricing settings are loaded.
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return amountMinor;
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) throw new RangeError("invalid_rate");
  if (!Number.isSafeInteger(rateScale) || rateScale <= 0) throw new RangeError("invalid_rate_scale");

  const fromDigits = currencyFractionDigits(fromCurrency);
  const toDigits = currencyFractionDigits(toCurrency);
  const numerator = BigInt(amountMinor) * (10n ** BigInt(toDigits)) * BigInt(rateScale);
  const denominator = (10n ** BigInt(fromDigits)) * BigInt(rateScaled);
  const result = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(result)) throw new RangeError("converted_amount_out_of_range");
  return result;
}

/**
 * VND amount to USD cents. Kept because the checkout path and several tests are
 * written against this exact signature; it is now a special case of convertMinor.
 */
export function vndToUsdCents(vndAmount: number, usdVndRateScaled: number) {
  if (!Number.isSafeInteger(vndAmount) || vndAmount < 0) throw new RangeError("invalid_vnd_amount");
  if (!Number.isSafeInteger(usdVndRateScaled) || usdVndRateScaled <= 0) throw new RangeError("invalid_usd_vnd_rate");
  return convertMinor(vndAmount, SHOP_BASE_CURRENCY, SHOP_DISPLAY_CURRENCY, usdVndRateScaled);
}

export function convertVndPricePair(
  priceMinor: number,
  compareAtMinor: number | null,
  usdVndRateScaled: number,
) {
  return {
    priceMinor: vndToUsdCents(priceMinor, usdVndRateScaled),
    compareAtMinor: compareAtMinor === null ? null : vndToUsdCents(compareAtMinor, usdVndRateScaled),
    currency: SHOP_DISPLAY_CURRENCY,
  } as const;
}
