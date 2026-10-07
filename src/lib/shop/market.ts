import { locales, type Locale } from "../../i18n/dictionaries";

/**
 * Markets.
 *
 * Before this module, "which market is this visitor in" was one boolean in
 * api/shop/payment-methods.ts:
 *     isInternational = locale !== "vi" || country !== "VN"
 * Everything else derived from it, so the shop could only ever be "Vietnam" or
 * "not Vietnam": no local currency, no per-market rails, no catalogue gating.
 *
 * A market is now a record with countries, locale, presentment currency, ordered
 * payment rails and a catalogue scope.
 *
 * The built-in defaults mirror today's behaviour exactly (VN: VietQR then
 * crypto; everywhere else: crypto), so the module is safe to adopt before any
 * market rows exist.
 */

export const MARKET_COOKIE_NAME = "tung_market";
export const MARKET_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEFAULT_MARKET_CODE = "GLOBAL";

export type CatalogScope = "all" | "glb" | "vn_only";

export type MarketRail = {
  railId: string;
  priority: number;
  enabled: boolean;
};

export type Market = {
  id: string;
  code: string;
  locale: Locale;
  currency: string;
  priceBookId: string | null;
  taxProfileId: string | null;
  catalogScope: CatalogScope;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  countryCodes: string[];
  rails: MarketRail[];
};

export type MarketSource = "explicit" | "country" | "accept-language" | "default";

export type MarketResolution = {
  market: Market;
  source: MarketSource;
};

const nowIso = () => new Date().toISOString();

export function createMarket(partial: Partial<Market> & Pick<Market, "id" | "code" | "locale" | "currency">): Market {
  return {
    priceBookId: null,
    taxProfileId: null,
    catalogScope: "all",
    isDefault: false,
    enabled: true,
    sortOrder: 0,
    countryCodes: [],
    rails: [],
    ...partial,
  };
}

/**
 * Used whenever D1 has no market rows, e.g. before the migration is applied.
 *
 * VN, JP and ZH must exist here or adopting this module would be a regression:
 * localeForCountry() already maps JP to ja and CN/TW/HK/MO to zh, and the
 * middleware relies on that. Their currency is USD, matching the storefront
 * today. Giving Japan JPY is a pricing decision, not a refactor, so it belongs
 * with the currency picker rather than here.
 */
export const DEFAULT_MARKETS: readonly Market[] = [
  createMarket({
    id: "market-vn",
    code: "VN",
    locale: "vi",
    currency: "VND",
    countryCodes: ["VN"],
    rails: [
      { railId: "payos", priority: 0, enabled: true },
      { railId: "crypto", priority: 1, enabled: true },
    ],
  }),
  createMarket({
    id: "market-jp",
    code: "JP",
    locale: "ja",
    currency: "USD",
    countryCodes: ["JP"],
    sortOrder: 1,
    rails: [{ railId: "crypto", priority: 0, enabled: true }],
  }),
  createMarket({
    id: "market-zh",
    code: "ZH",
    locale: "zh",
    currency: "USD",
    countryCodes: ["CN", "TW", "HK", "MO"],
    sortOrder: 2,
    rails: [{ railId: "crypto", priority: 0, enabled: true }],
  }),
  createMarket({
    id: "market-global",
    code: DEFAULT_MARKET_CODE,
    locale: "en",
    currency: "USD",
    isDefault: true,
    sortOrder: 3,
    // VietQR stays listed but disabled: the endpoint falls back to it when no
    // crypto method is configured, and that fallback needs the row to exist.
    rails: [
      { railId: "crypto", priority: 0, enabled: true },
      { railId: "payos", priority: 1, enabled: false },
    ],
  }),
];

export function defaultMarket(markets: readonly Market[] = DEFAULT_MARKETS): Market {
  const explicit = markets.find((item) => item.isDefault && item.enabled);
  if (explicit) return explicit;
  const fallback = markets.find((item) => item.code === DEFAULT_MARKET_CODE) ?? markets[0];
  if (!fallback) throw new RangeError("no_markets_configured");
  return fallback;
}

/**
 * Parse an Accept-Language header into supported locales, best first.
 *
 * The site never consulted this header at all: locale came only from a cookie or
 * from Cloudflare's country. A Vietnamese-speaking visitor in Germany got
 * English because their IP said DE, despite their browser asking for vi.
 */
export function localesFromAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return [];
  const ranked = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = rawTag.trim().toLowerCase();
      if (!tag) return null;
      const qParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
      const parsed = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag, quality: Number.isFinite(parsed) ? parsed : 0 };
    })
    .filter((entry): entry is { tag: string; quality: number } => entry !== null && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality);

  const resolved: Locale[] = [];
  for (const entry of ranked) {
    const primary = entry.tag.split("-")[0];
    const match = locales.find((locale) => locale === primary);
    if (match && !resolved.includes(match)) resolved.push(match);
  }
  return resolved;
}

export function normalizeMarketCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9_-]{2,24}$/.test(code) ? code : null;
}

export function findMarketByCode(markets: readonly Market[], code: string | null | undefined): Market | null {
  const normalized = normalizeMarketCode(code);
  if (!normalized) return null;
  return markets.find((item) => item.code === normalized && item.enabled) ?? null;
}

export function marketForCountry(markets: readonly Market[], country: string | null | undefined): Market | null {
  const code = country?.trim().toUpperCase();
  if (!code) return null;
  return markets.find((item) => item.enabled && item.countryCodes.includes(code)) ?? null;
}

/**
 * Resolve the market for a request.
 *
 * Precedence, highest first:
 *   1. explicit choice (?market= or the tung_market cookie) — a visitor who
 *      picked a market must never be overridden by their IP
 *   2. country, from Cloudflare's geo headers
 *   3. Accept-Language, which narrows the locale when the country is unknown
 *   4. the configured default market
 */
export function resolveMarket(input: {
  explicit?: string | null;
  country?: string | null;
  acceptLanguage?: string | null;
  markets?: readonly Market[];
} = {}): MarketResolution {
  const markets = input.markets ?? DEFAULT_MARKETS;
  const available = markets.filter((item) => item.enabled);
  const pool = available.length ? available : markets;

  const explicit = findMarketByCode(pool, input.explicit);
  if (explicit) return { market: explicit, source: "explicit" };

  const byCountry = marketForCountry(pool, input.country);
  if (byCountry) return { market: byCountry, source: "country" };

  // Only useful when the country told us nothing: an unknown country resolves to
  // the default market, whose locale may not match what the browser asked for.
  for (const locale of localesFromAcceptLanguage(input.acceptLanguage)) {
    const match = pool.find((item) => item.locale === locale && item.countryCodes.length === 0);
    if (match) return { market: match, source: "accept-language" };
  }

  return { market: defaultMarket(pool), source: "default" };
}

/** Enabled rails in priority order, which is the order they are offered in. */
export function orderedRails(market: Market): MarketRail[] {
  return [...market.rails].filter((rail) => rail.enabled).sort((left, right) => left.priority - right.priority);
}

export function parseCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function getMarketCookie(request: Request): string | null {
  return normalizeMarketCode(parseCookieValue(request.headers.get("cookie"), MARKET_COOKIE_NAME));
}

export function setMarketCookieValue(code: string): string {
  return `${MARKET_COOKIE_NAME}=${encodeURIComponent(code.toUpperCase())}; Path=/; Max-Age=${MARKET_COOKIE_MAX_AGE}; SameSite=Lax`;
}

type MarketRow = {
  id: string;
  code: string;
  locale: Locale;
  currency: string;
  price_book_id: string | null;
  tax_profile_id: string | null;
  catalog_scope: CatalogScope;
  is_default: number;
  enabled: number;
  sort_order: number;
};

/** Empty array means the migration has not been applied; callers use the defaults. */
export async function listMarkets(db: D1Database): Promise<Market[]> {
  let markets: MarketRow[];
  try {
    const result = await db.prepare(`SELECT id, code, locale, currency, price_book_id, tax_profile_id,
      catalog_scope, is_default, enabled, sort_order
      FROM shop_markets ORDER BY sort_order, code`).all<MarketRow>();
    markets = result.results ?? [];
  } catch {
    return [];
  }
  if (!markets.length) return [];

  let countries: Array<{ market_id: string; country_code: string }> = [];
  let rails: Array<{ market_id: string; rail_id: string; priority: number; enabled: number }> = [];
  try {
    const [countryResult, railResult] = await Promise.all([
      db.prepare("SELECT market_id, country_code FROM shop_market_countries").all<{ market_id: string; country_code: string }>(),
      db.prepare(`SELECT market_id, rail_id, priority, enabled FROM shop_market_payment_methods
        ORDER BY market_id, priority, rail_id`).all<{ market_id: string; rail_id: string; priority: number; enabled: number }>(),
    ]);
    countries = countryResult.results ?? [];
    rails = railResult.results ?? [];
  } catch {
    // Partial migration: markets exist but the child tables do not. Serve the
    // markets without countries or rails rather than failing the request.
  }

  return markets.map((row) => createMarket({
    id: row.id,
    code: row.code,
    locale: row.locale,
    currency: row.currency,
    priceBookId: row.price_book_id,
    taxProfileId: row.tax_profile_id,
    catalogScope: row.catalog_scope,
    isDefault: row.is_default === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    countryCodes: countries.filter((item) => item.market_id === row.id).map((item) => item.country_code),
    rails: rails
      .filter((item) => item.market_id === row.id)
      .map((item) => ({ railId: item.rail_id, priority: item.priority, enabled: item.enabled === 1 })),
  }));
}

export async function loadMarket(db: D1Database, code: string | null | undefined): Promise<Market | null> {
  const markets = await listMarkets(db);
  return findMarketByCode(markets, code);
}

/**
 * Explicit per-product visibility for one market: product id -> visible.
 *
 * The table ships with migration 0054. Empty when that migration has not run,
 * which is treated as "no rules" rather than an error so the catalogue keeps
 * working. Only rows present in the map have an opinion; everything else falls
 * through to the market's scope.
 */
export async function listCatalogRules(db: D1Database, marketId: string): Promise<Map<string, boolean>> {
  const rules = new Map<string, boolean>();
  try {
    const result = await db.prepare(`SELECT product_id, visible FROM shop_market_catalog_rules
      WHERE market_id = ?`).bind(marketId).all<{ product_id: string; visible: number }>();
    for (const row of result.results ?? []) rules.set(row.product_id, row.visible === 1);
  } catch {
    return rules;
  }
  return rules;
}

/**
 * Should this product appear in this market?
 *
 * An explicit rule always wins. Otherwise the market's scope sets the default,
 * and only `vn_only` changes it: a market that exists solely for domestic sales
 * must not leak region-locked stock to the rest of the world.
 */
export function isProductVisibleInMarket(
  productId: string,
  catalogScope: CatalogScope,
  rules: ReadonlyMap<string, boolean>,
): boolean {
  const rule = rules.get(productId);
  if (rule !== undefined) return rule;
  return catalogScope !== "vn_only";
}

export function createCatalogFilter(
  catalogScope: CatalogScope,
  rules: ReadonlyMap<string, boolean>,
) {
  return (productId: string) => isProductVisibleInMarket(productId, catalogScope, rules);
}

export async function upsertMarket(
  db: D1Database,
  input: {
    code: string;
    locale: Locale;
    currency: string;
    countryCodes?: string[];
    rails?: MarketRail[];
    catalogScope?: CatalogScope;
    enabled?: boolean;
    isDefault?: boolean;
    sortOrder?: number;
  },
): Promise<Market> {
  const code = normalizeMarketCode(input.code);
  if (!code) throw new RangeError("invalid_market_code");
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("invalid_market_currency");
  const now = nowIso();
  const id = `market-${code.toLowerCase()}`;

  await db.batch([
    db.prepare(`INSERT INTO shop_markets
      (id, code, locale, currency, catalog_scope, is_default, enabled, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (code) DO UPDATE SET
        locale = excluded.locale,
        currency = excluded.currency,
        catalog_scope = excluded.catalog_scope,
        is_default = excluded.is_default,
        enabled = excluded.enabled,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`).bind(
      id, code, input.locale, currency, input.catalogScope ?? "all",
      input.isDefault ? 1 : 0, input.enabled === false ? 0 : 1, input.sortOrder ?? 0, now, now,
    ),
    db.prepare("DELETE FROM shop_market_countries WHERE market_id = ?").bind(id),
    db.prepare("DELETE FROM shop_market_payment_methods WHERE market_id = ?").bind(id),
  ]);

  const countryCodes = [...new Set((input.countryCodes ?? []).map((item) => item.trim().toUpperCase()).filter((item) => /^[A-Z]{2}$/.test(item)))];
  if (countryCodes.length) {
    await db.batch(countryCodes.map((countryCode) => db.prepare(
      "INSERT INTO shop_market_countries (country_code, market_id, created_at) VALUES (?, ?, ?)",
    ).bind(countryCode, id, now)));
  }
  if (input.rails?.length) {
    await db.batch(input.rails.map((rail) => db.prepare(
      "INSERT INTO shop_market_payment_methods (market_id, rail_id, priority, enabled) VALUES (?, ?, ?, ?)",
    ).bind(id, rail.railId, rail.priority, rail.enabled ? 1 : 0)));
  }

  const stored = await loadMarket(db, code);
  if (!stored) throw new RangeError("market_write_failed");
  return stored;
}
