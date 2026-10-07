/**
 * Backwards-compatible entry point for shop pricing.
 *
 * The money primitives now live in `./money`, which is the single source of
 * truth. `repository.ts` previously carried its own copy of these constants and
 * conversion helpers because its smoke-test bundler strips imports; that copy
 * has been removed and the harness now bundles `money.ts` instead.
 *
 * Prefer importing from `./money` directly in new code.
 */
export {
  SHOP_BASE_CURRENCY,
  SHOP_DISPLAY_CURRENCY,
  SHOP_RATE_SCALE,
  DEFAULT_USD_VND_RATE,
  DEFAULT_USD_VND_RATE_SCALED,
  type ShopPricingSettings,
  rateScaledToNumber,
  currencyFractionDigits,
  minorToMajor,
  majorToMinor,
  assertSameCurrency,
  convertMinor,
  invertRateScaled,
  vndToUsdCents,
  convertVndPricePair,
} from "./money";
