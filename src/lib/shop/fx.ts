import { SHOP_RATE_SCALE } from "./money";

/**
 * FX rate storage and freshness.
 *
 * Rates used to be three hardcoded tables stamped "updated 2026-07-25", which is
 * how the site ended up converting with a year-old number. Rates now live in
 * `shop_fx_rates` with the direction, the provider and an `as_of` timestamp, so
 * a stale rate can be detected and reported instead of believed.
 *
 * Direction matches `convertMinor`: a rate means "N units of fromCurrency per
 * 1 unit of toCurrency", and conversion divides by it.
 */

export type FxProvider = "manual" | "exchangerate-api" | "open-er-api" | "cloudflare";

export type FxRate = {
  fromCurrency: string;
  toCurrency: string;
  rateScaled: number;
  rateScale: number;
  provider: string;
  asOf: string;
  fetchedAt: string;
};

export type FxRateRow = {
  from_currency: string;
  to_currency: string;
  rate_scaled: number;
  rate_scale: number;
  provider: string;
  as_of: string;
  fetched_at: string;
};

/** Past this age a rate is still used, but it is reported as stale. */
export const FX_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Beyond this the rate is treated as unusable for pricing decisions. */
export const FX_EXPIRED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type FxFreshness = "fresh" | "stale" | "expired" | "unknown";

export function fxFreshness(rate: Pick<FxRate, "asOf"> | null, now: number = Date.now()): FxFreshness {
  if (!rate) return "unknown";
  const observed = Date.parse(rate.asOf);
  if (Number.isNaN(observed)) return "unknown";
  const age = now - observed;
  // Allow a small tolerance: a provider clock running slightly ahead of ours is
  // not a reason to discard a rate.
  if (age < -60_000) return "fresh";
  if (age > FX_EXPIRED_AFTER_MS) return "expired";
  if (age > FX_STALE_AFTER_MS) return "stale";
  return "fresh";
}

export function isStale(rate: Pick<FxRate, "asOf"> | null, now: number = Date.now()): boolean {
  const state = fxFreshness(rate, now);
  return state === "stale" || state === "expired" || state === "unknown";
}

/**
 * Widen a rate by a safety margin, in basis points, before it is used to price.
 *
 * Converting at the raw midpoint means FX movement between refresh and checkout
 * eats the margin. `spreadBps = 250` makes the customer pay 2.5% more of the
 * source currency for the same target amount.
 */
export function applySpread(rateScaled: number, spreadBps: number): number {
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) throw new RangeError("invalid_rate");
  if (!Number.isSafeInteger(spreadBps) || spreadBps < 0 || spreadBps > 10_000) throw new RangeError("invalid_spread");
  if (spreadBps === 0) return rateScaled;
  const widened = (BigInt(rateScaled) * BigInt(10_000 + spreadBps)) / 10_000n;
  const result = Number(widened);
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError("widened_rate_out_of_range");
  return result;
}

const normalize = (currency: string) => currency.trim().toUpperCase();

export function toFxRate(row: FxRateRow): FxRate {
  return {
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rateScaled: row.rate_scaled,
    rateScale: row.rate_scale,
    provider: row.provider,
    asOf: row.as_of,
    fetchedAt: row.fetched_at,
  };
}

export async function getFxRate(
  db: D1Database,
  fromCurrency: string,
  toCurrency: string,
): Promise<FxRate | null> {
  const from = normalize(fromCurrency);
  const to = normalize(toCurrency);
  if (from === to) return null;
  const row = await db.prepare(`SELECT from_currency, to_currency, rate_scaled, rate_scale,
      provider, as_of, fetched_at
    FROM shop_fx_rates WHERE from_currency = ? AND to_currency = ? LIMIT 1`)
    .bind(from, to).first<FxRateRow>();
  return row ? toFxRate(row) : null;
}

export async function listFxRates(db: D1Database): Promise<FxRate[]> {
  const result = await db.prepare(`SELECT from_currency, to_currency, rate_scaled, rate_scale,
      provider, as_of, fetched_at
    FROM shop_fx_rates ORDER BY from_currency, to_currency`).all<FxRateRow>();
  return (result.results ?? []).map(toFxRate);
}

export type PutFxRateInput = {
  fromCurrency: string;
  toCurrency: string;
  rateScaled: number;
  rateScale?: number;
  provider: string;
  asOf: string;
  changedBy: string;
};

export async function putFxRate(db: D1Database, input: PutFxRateInput): Promise<FxRate> {
  const from = normalize(input.fromCurrency);
  const to = normalize(input.toCurrency);
  if (from === to) throw new RangeError("fx_same_currency");
  if (!Number.isSafeInteger(input.rateScaled) || input.rateScaled <= 0) throw new RangeError("invalid_rate");
  const rateScale = input.rateScale ?? SHOP_RATE_SCALE;
  if (!Number.isSafeInteger(rateScale) || rateScale <= 0) throw new RangeError("invalid_rate_scale");
  if (Number.isNaN(Date.parse(input.asOf))) throw new RangeError("invalid_as_of");

  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO shop_fx_rates
      (from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, fetched_at, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (from_currency, to_currency) DO UPDATE SET
        rate_scaled = excluded.rate_scaled,
        rate_scale = excluded.rate_scale,
        provider = excluded.provider,
        as_of = excluded.as_of,
        fetched_at = excluded.fetched_at,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at`).bind(from, to, input.rateScaled, rateScale, input.provider, input.asOf, now, input.changedBy, now, now),
    db.prepare(`INSERT INTO shop_fx_rate_history
      (id, from_currency, to_currency, rate_scaled, rate_scale, provider, as_of, changed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), from, to, input.rateScaled, rateScale, input.provider, input.asOf, input.changedBy, now),
  ]);
  const stored = await getFxRate(db, from, to);
  if (!stored) throw new RangeError("fx_rate_write_failed");
  return stored;
}
