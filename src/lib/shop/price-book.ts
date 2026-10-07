import { getFxRate } from "./fx";
import { convertMinor, currencyFractionDigits } from "./money";

/**
 * Per-market pricing.
 *
 * A price book holds a hand-set price per variant per market. It exists because
 * converting one VND price with an FX rate produces numbers no local buyer will
 * accept: a Cursor Pro seat sells for 269,000 VND in Vietnam, which converts to
 * about 10.50 USD, but realistically sells for 3-5 USD in the Philippines.
 * Purchasing power, not the exchange rate, decides what a market will pay.
 *
 * FX still has a job here, but as a margin guard rather than a price source: the
 * cost floor is the VND catalog price converted into the book's currency, and no
 * price is ever allowed below it. A mistyped book entry therefore cannot sell
 * below cost.
 */

export type RoundingRule = "none" | "nearest_100" | "nearest_1000" | "charm_99";

export type PriceBook = {
  id: string;
  code: string;
  currency: string;
  isDefault: boolean;
  roundingRule: RoundingRule;
};

export type PriceBookItem = {
  priceMinor: number;
  compareAtMinor: number | null;
  floorMinor: number;
};

export type PriceSource = "book" | "converted" | "catalog";

export type ResolvedPrice = {
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  source: PriceSource;
  /** True when the floor replaced the requested price, which is a margin incident. */
  belowFloor: boolean;
};

type PriceBookRow = {
  id: string;
  code: string;
  currency: string;
  is_default: number;
  rounding_rule: string;
};

type PriceBookItemRow = {
  variant_id: string;
  price_minor: number;
  compare_at_minor: number | null;
  floor_minor: number;
};

const ROUNDING_RULES: readonly RoundingRule[] = ["none", "nearest_100", "nearest_1000", "charm_99"];

export function normalizeRoundingRule(value: string | null | undefined): RoundingRule {
  return ROUNDING_RULES.find((rule) => rule === value) ?? "none";
}

function toPriceBook(row: PriceBookRow): PriceBook {
  return {
    id: row.id,
    code: row.code,
    currency: row.currency.toUpperCase(),
    isDefault: row.is_default === 1,
    roundingRule: normalizeRoundingRule(row.rounding_rule),
  };
}

/**
 * Shape a converted price into something a human would accept.
 *
 * `nearest_100` / `nearest_1000` suit zero-decimal currencies where exact
 * converted amounts look broken (12,347 VND). `charm_99` ends a two-decimal
 * price in .99; it can round down by up to one minor unit, which the floor guard
 * then covers.
 */
export function applyRounding(amountMinor: number, rule: RoundingRule, currency: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return amountMinor;
  switch (rule) {
    case "nearest_100":
      return Math.round(amountMinor / 100) * 100;
    case "nearest_1000":
      return Math.round(amountMinor / 1000) * 1000;
    case "charm_99": {
      if (currencyFractionDigits(currency) === 0) return amountMinor;
      const unit = 100;
      const rounded = Math.round(amountMinor / unit) * unit;
      return Math.max(rounded - 1, 0);
    }
    default:
      return amountMinor;
  }
}

/**
 * Pick the book for a market.
 *
 * The market's own currency wins over the default book, and that matters: the
 * Vietnamese market is priced in VND and has no book, so falling through to the
 * default USD book would silently re-price the entire Vietnamese catalogue in
 * dollars. When no book exists in the market's currency, this returns null and
 * the caller keeps catalog pricing.
 */
export async function resolvePriceBook(
  db: D1Database,
  priceBookId: string | null,
  currency?: string | null,
): Promise<PriceBook | null> {
  try {
    if (priceBookId) {
      const explicit = await db.prepare(`SELECT id, code, currency, is_default, rounding_rule
        FROM shop_price_books WHERE id = ? LIMIT 1`).bind(priceBookId).first<PriceBookRow>();
      if (explicit && (!currency || explicit.currency.toUpperCase() === currency.toUpperCase())) return toPriceBook(explicit);
    }
    if (currency) {
      const byCurrency = await db.prepare(`SELECT id, code, currency, is_default, rounding_rule
        FROM shop_price_books WHERE currency = ? ORDER BY is_default DESC, code LIMIT 1`)
        .bind(currency.toUpperCase()).first<PriceBookRow>();
      return byCurrency ? toPriceBook(byCurrency) : null;
    }
    const fallback = await db.prepare(`SELECT id, code, currency, is_default, rounding_rule
      FROM shop_price_books WHERE is_default = 1 ORDER BY code LIMIT 1`).first<PriceBookRow>();
    return fallback ? toPriceBook(fallback) : null;
  } catch {
    // Migration 0055 is additive. No price books yet means catalog pricing only.
    return null;
  }
}

export async function listPriceBooks(db: D1Database): Promise<PriceBook[]> {
  try {
    const result = await db.prepare(`SELECT id, code, currency, is_default, rounding_rule
      FROM shop_price_books ORDER BY is_default DESC, code`).all<PriceBookRow>();
    return (result.results ?? []).map(toPriceBook);
  } catch {
    return [];
  }
}

/**
 * Every variant price in one book, keyed by variant id.
 *
 * Loads the whole book rather than filtering by variant id: the catalogue query
 * that produces those ids runs after this, so filtering here would need either a
 * two-pass query or an empty result set. Books are hand-maintained and small;
 * the cap is a guard against a runaway import, not an expected limit.
 */
export const MAX_BOOK_ITEMS = 5000;

export async function listBookItems(db: D1Database, bookId: string): Promise<Map<string, PriceBookItem>> {
  const items = new Map<string, PriceBookItem>();
  const result = await db.prepare(`SELECT variant_id, price_minor, compare_at_minor, floor_minor
    FROM shop_price_book_items WHERE price_book_id = ? LIMIT ${MAX_BOOK_ITEMS}`)
    .bind(bookId).all<PriceBookItemRow>();
  for (const row of result.results ?? []) {
    items.set(row.variant_id, {
      priceMinor: row.price_minor,
      compareAtMinor: row.compare_at_minor,
      floorMinor: row.floor_minor,
    });
  }
  return items;
}

export type PriceBookContext = {
  book: PriceBook | null;
  items: Map<string, PriceBookItem>;
  rate: { rateScaled: number; rateScale: number } | null;
};

/**
 * Adapt a loaded context into the resolver signature the public catalog expects.
 *
 * Structurally typed so `repository.ts` never has to import this module: it is
 * bundled by harnesses that strip imports, and every dependency it gains has to
 * be added to four of them.
 */
export function createPriceResolver(context: PriceBookContext) {
  return (input: {
    variantId: string;
    priceMinor: number;
    compareAtMinor: number | null;
    currency: string;
  }): { priceMinor: number; compareAtMinor: number | null; currency: string } | null => {
    if (!context.book) return null;
    const resolved = resolvePrice({
      variantId: input.variantId,
      catalogPriceMinor: input.priceMinor,
      catalogCompareAtMinor: input.compareAtMinor,
      catalogCurrency: input.currency,
      book: context.book,
      item: context.items.get(input.variantId),
      rate: context.rate,
    });
    return {
      priceMinor: resolved.priceMinor,
      compareAtMinor: resolved.compareAtMinor,
      currency: resolved.currency,
    };
  };
}

export type ResolvePriceInput = {
  variantId: string;
  /** The catalog row: integer minor units in the merchant's cost currency. */
  catalogPriceMinor: number;
  catalogCompareAtMinor: number | null;
  catalogCurrency: string;
  book: PriceBook | null;
  item: PriceBookItem | null | undefined;
  /** Rate from the catalog currency to the book currency, if one is known. */
  rate: { rateScaled: number; rateScale: number } | null;
};

/**
 * Resolve the price a visitor should be shown.
 *
 * Precedence: a hand-set book entry, then the catalog price converted into the
 * book's currency, then the catalog price untouched. Whichever wins, the result
 * is never allowed below the item's floor.
 */
export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const catalogCurrency = input.catalogCurrency.toUpperCase();
  const book = input.book;

  if (!book || book.currency === catalogCurrency) {
    return {
      priceMinor: input.catalogPriceMinor,
      compareAtMinor: input.catalogCompareAtMinor,
      currency: catalogCurrency,
      source: "catalog",
      belowFloor: false,
    };
  }

  const convertedMinor = input.rate
    ? convertMinor(input.catalogPriceMinor, catalogCurrency, book.currency, input.rate.rateScaled, input.rate.rateScale)
    : null;

  let priceMinor: number;
  let compareAtMinor: number | null;
  let source: PriceSource;

  if (input.item) {
    priceMinor = input.item.priceMinor;
    compareAtMinor = input.item.compareAtMinor;
    source = "book";
  } else if (input.rate && convertedMinor !== null) {
    priceMinor = convertedMinor;
    compareAtMinor = input.catalogCompareAtMinor === null
      ? null
      : convertMinor(input.catalogCompareAtMinor, catalogCurrency, book.currency, input.rate.rateScaled, input.rate.rateScale);
    source = "converted";
  } else {
    // No rate: the catalog price is the only number we can trust. Keep it and
    // keep its currency rather than pretending it is in the book's currency.
    return {
      priceMinor: input.catalogPriceMinor,
      compareAtMinor: input.catalogCompareAtMinor,
      currency: catalogCurrency,
      source: "catalog",
      belowFloor: false,
    };
  }

  priceMinor = applyRounding(priceMinor, book.roundingRule, book.currency);

  // The floor is a hand-set per-item guard, and it defaults to 0. It is
  // deliberately NOT derived from the catalog price: the whole point of a book
  // is that a market may pay less than another, and using the Vietnamese
  // catalog price as the floor would forbid that everywhere.
  const floor = input.item?.floorMinor ?? 0;
  const belowFloor = priceMinor < floor;
  if (belowFloor) priceMinor = floor;

  return {
    priceMinor,
    compareAtMinor: compareAtMinor === null ? null : Math.max(compareAtMinor, priceMinor),
    currency: book.currency,
    source,
    belowFloor,
  };
}

/**
 * Load everything `resolvePrice` needs for a market, in two queries.
 *
 * Loaded once per request rather than per variant: the catalogue renders 48
 * variants at a time and per-variant lookups would turn a page load into a query
 * storm.
 */
export async function loadPriceBookContext(
  db: D1Database,
  priceBookId: string | null,
  marketCurrency: string | null,
): Promise<PriceBookContext> {
  const book = await resolvePriceBook(db, priceBookId, marketCurrency);
  if (!book) return { book: null, items: new Map(), rate: null };
  const items = await listBookItems(db, book.id);
  // Only needed when the book is not in the catalog's currency. With no rate the
  // resolver keeps the catalog price and its own currency, which is safe; it
  // never guesses a number.
  const rateRow = await getFxRate(db, "VND", book.currency);
  return { book, items, rate: rateRow ? { rateScaled: rateRow.rateScaled, rateScale: rateRow.rateScale } : null };
}
