/**
 * Payment rail registry.
 *
 * Migration 0056 made a payment rail *data*: `shop_payment_provider_configs`
 * gained `rail_type`, `currencies_json`, `countries_json`, `capabilities_json`
 * and `priority`, and the `provider` CHECK was opened. But no code reads any of
 * those columns -- every query in `repository.ts` and `service.ts` still pins
 * `provider = 'vietqr'`. So the schema can describe a GCash or USDT rail while
 * the checkout remains physically unable to route to one.
 *
 * This module closes that gap. It is the single place that turns rail rows into
 * routable rails, and it is deliberately additive: it does not touch the VietQR
 * path, it sits beside it.
 *
 * Two-key design: a rail is usable only when BOTH
 *   1. a config row exists, is active, and serves the market, and
 *   2. an adapter is registered in code under the same provider id.
 * A row without an adapter is a rail an admin has switched on that no deployed
 * code can actually execute. Offering it would strand the buyer on a dead
 * checkout, so it is withheld and reported. This is the failure mode you get
 * from making rails data, and it has to be handled here or not at all.
 */

/** Kinds of rail. Mirrors the `rail_type` CHECK in migration 0056. */
export type RailType = "bank_qr" | "crypto" | "ewallet" | "card" | "manual";

/** How a payment on this rail gets confirmed. Mirrors the 0056 CHECK. */
export type ConfirmationAdapter =
  | "payos"
  | "casso"
  | "generic_signed"
  | "manual"
  | "onchain"
  | "provider_webhook";

/** Payment method recorded on an attempt. Mirrors the 0056 `method` CHECK. */
export type RailMethod =
  | "bank_transfer_qr"
  | "crypto_transfer"
  | "ewallet_redirect"
  | "card_redirect"
  | "manual";

/**
 * Guard against a pathological config table. Routing runs on the checkout path,
 * so it must not turn into an unbounded scan if a bug mass-inserts rows.
 */
export const MAX_RAIL_CONFIGS = 100;

/** Declared abilities of a rail. Absent means "no", never "unknown". */
export type RailCapabilities = {
  /** Rail can return money programmatically (see `shop_payment_refunds`). */
  refund?: boolean;
  /** Rail can confirm without a human looking at it. */
  autoConfirm?: boolean;
  /** Rail can settle a partial amount. */
  partialCapture?: boolean;
  /** Minimum accepted amount, in minor units of the rail's currency. */
  minAmountMinor?: number;
  /** Maximum accepted amount, in minor units. */
  maxAmountMinor?: number;
};

/** A rail config row, decoded. */
export type RailConfig = {
  id: string;
  provider: string;
  railType: RailType;
  displayName: string;
  status: "disabled" | "active" | "archived";
  bankId: string;
  accountRef: string;
  accountNameDisplay: string;
  qrTemplate: string;
  confirmationAdapter: ConfirmationAdapter;
  secretRef: string | null;
  publicConfig: Record<string, unknown>;
  /** Uppercase ISO-4217 codes. Empty means unrestricted. */
  currencies: string[];
  /** Uppercase ISO-3166-1 alpha-2 codes. Empty means unrestricted. */
  countries: string[];
  capabilities: RailCapabilities;
  /** Lower sorts first. */
  priority: number;
};

/** Where a payment is being attempted from. */
export type RailMarketContext = {
  currency: string;
  country?: string | null;
  amountMinor?: number | null;
};

/** What a rail needs in order to start a payment. */
export type RailIntentInput = {
  orderId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  config: RailConfig;
  /** ISO 8601. The rail must not create an intent outliving this. */
  expiresAt: string;
  customerEmail?: string | null;
  description?: string | null;
};

/** What a rail returns after starting a payment. */
export type RailIntent = {
  method: RailMethod;
  /** Rail-side id, if the rail issues one. Unique per provider. */
  providerReference: string | null;
  /** Where to send the buyer, for redirect rails. */
  checkoutUrl?: string | null;
  /** Scannable payload, for QR rails. */
  qrImageUrl?: string | null;
  qrPayloadHash?: string | null;
  /** Destination address/UID, for crypto rails. */
  destination?: string | null;
  memo?: string | null;
  expiresAt: string;
};

/** Outcome of asking a rail whether a payment landed. */
export type RailVerification = {
  status: "pending" | "confirmed" | "failed";
  /** Amount actually observed, in minor units. */
  observedAmountMinor?: number | null;
  providerReference?: string | null;
  confirmations?: number | null;
  /** Machine-readable reason when not confirmed. */
  reason?: string | null;
  raw?: unknown;
};

/** Outcome of asking a rail to return money. */
export type RailRefundResult = {
  status: "pending" | "succeeded" | "failed";
  providerReference?: string | null;
  failureCode?: string | null;
};

/**
 * A payment rail implementation.
 *
 * `verify` must be conservative: anything it cannot positively confirm has to
 * come back `pending` or `failed`, never `confirmed`. A rail that guesses
 * `confirmed` releases goods for free.
 */
export interface PaymentRail {
  readonly provider: string;
  readonly railType: RailType;
  createIntent(input: RailIntentInput): Promise<RailIntent>;
  verify(input: {
    config: RailConfig;
    providerReference: string | null;
    orderReference: string;
    expectedAmountMinor: number;
    currency: string;
  }): Promise<RailVerification>;
  refund?(input: {
    config: RailConfig;
    providerReference: string | null;
    amountMinor: number;
    currency: string;
    reason: string;
  }): Promise<RailRefundResult>;
}

/**
 * Why a config row that looked active is not being offered. Surfaced rather
 * than swallowed, because every one of these is an admin-visible misconfiguration
 * that would otherwise present as "the rail just doesn't show up".
 */
export type RailProblem = {
  configId: string;
  provider: string;
  reason:
    | "no_adapter_registered"
    | "malformed_currencies_json"
    | "malformed_countries_json"
    | "malformed_capabilities_json"
    | "unknown_rail_type"
    | "currency_not_served"
    | "country_not_served"
    | "amount_below_minimum"
    | "amount_above_maximum";
};

export type RailResolution = {
  /** Usable rails, best first. */
  rails: Array<{ rail: PaymentRail; config: RailConfig }>;
  /** Configs that were rejected, with the reason. */
  problems: RailProblem[];
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RAIL_TYPES: readonly RailType[] = ["bank_qr", "crypto", "ewallet", "card", "manual"];

const registry = new Map<string, PaymentRail>();

/**
 * Register a rail adapter. Last registration wins so a test can swap an
 * adapter, but re-registering a different object under a live provider id in
 * production is a bug, so the previous entry is returned for the caller to
 * assert on if it cares.
 */
export function registerRail(rail: PaymentRail): PaymentRail | undefined {
  const provider = normalizeProvider(rail.provider);
  if (!provider) throw new Error("rail_provider_required");
  const previous = registry.get(provider);
  registry.set(provider, rail);
  return previous;
}

export function getRail(provider: string): PaymentRail | undefined {
  return registry.get(normalizeProvider(provider));
}

export function listRegisteredRails(): PaymentRail[] {
  return [...registry.values()];
}

/** Test seam. Do not call from request code. */
export function clearRailRegistry() {
  registry.clear();
}

function normalizeProvider(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// ---------------------------------------------------------------------------
// Row decoding
// ---------------------------------------------------------------------------

/**
 * Parse a JSON array column into uppercase codes.
 *
 * Returns `null` on malformed input rather than `[]`. The distinction matters:
 * `[]` means "serves every currency", so silently substituting it for corrupt
 * data would *widen* a restriction on a money path. Callers treat `null` as
 * fail-closed.
 */
function parseCodeArray(value: unknown): string[] | null {
  if (value == null || value === "") return [];
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const codes: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") return null;
    const code = entry.trim().toUpperCase();
    if (code) codes.push(code);
  }
  return codes;
}

function parseCapabilities(value: unknown): RailCapabilities | null {
  if (value == null || value === "") return {};
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const source = parsed as Record<string, unknown>;
  const capabilities: RailCapabilities = {};
  if (typeof source.refund === "boolean") capabilities.refund = source.refund;
  if (typeof source.autoConfirm === "boolean") capabilities.autoConfirm = source.autoConfirm;
  if (typeof source.partialCapture === "boolean") capabilities.partialCapture = source.partialCapture;
  if (Number.isSafeInteger(source.minAmountMinor) && Number(source.minAmountMinor) >= 0) {
    capabilities.minAmountMinor = Number(source.minAmountMinor);
  }
  if (Number.isSafeInteger(source.maxAmountMinor) && Number(source.maxAmountMinor) >= 0) {
    capabilities.maxAmountMinor = Number(source.maxAmountMinor);
  }
  return capabilities;
}

export type RailConfigRow = Record<string, unknown>;

/**
 * Decode a raw row. Returns the config plus any decode problem, so a caller can
 * report a corrupt row instead of it vanishing from routing unexplained.
 */
export function decodeRailConfig(row: RailConfigRow): {
  config: RailConfig | null;
  problem: RailProblem["reason"] | null;
} {
  const provider = normalizeProvider(row.provider);
  const railTypeRaw = typeof row.rail_type === "string" ? row.rail_type.trim().toLowerCase() : "bank_qr";
  const railType = RAIL_TYPES.includes(railTypeRaw as RailType) ? (railTypeRaw as RailType) : null;
  if (!railType) return { config: null, problem: "unknown_rail_type" };

  const currencies = parseCodeArray(row.currencies_json);
  if (currencies === null) return { config: null, problem: "malformed_currencies_json" };
  const countries = parseCodeArray(row.countries_json);
  if (countries === null) return { config: null, problem: "malformed_countries_json" };
  const capabilities = parseCapabilities(row.capabilities_json);
  if (capabilities === null) return { config: null, problem: "malformed_capabilities_json" };

  let publicConfig: Record<string, unknown> = {};
  if (typeof row.public_config_json === "string" && row.public_config_json.trim()) {
    try {
      const parsed = JSON.parse(row.public_config_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        publicConfig = parsed as Record<string, unknown>;
      }
    } catch {
      // `public_config_json` is display data, not a routing input, so a bad
      // value degrades to empty instead of withholding the rail.
      publicConfig = {};
    }
  }

  const priorityRaw = Number(row.priority);
  return {
    config: {
      id: String(row.id ?? ""),
      provider,
      railType,
      displayName: typeof row.display_name === "string" ? row.display_name : provider,
      status: (row.status === "active" || row.status === "archived" ? row.status : "disabled") as RailConfig["status"],
      bankId: typeof row.bank_id === "string" ? row.bank_id : "",
      accountRef: typeof row.account_ref === "string" ? row.account_ref : "",
      accountNameDisplay: typeof row.account_name_display === "string" ? row.account_name_display : "",
      qrTemplate: typeof row.qr_template === "string" ? row.qr_template : "compact2",
      confirmationAdapter: (typeof row.confirmation_adapter === "string"
        ? row.confirmation_adapter
        : "manual") as ConfirmationAdapter,
      secretRef: typeof row.secret_ref === "string" ? row.secret_ref : null,
      publicConfig,
      currencies,
      countries,
      capabilities,
      priority: Number.isFinite(priorityRaw) ? priorityRaw : 100,
    },
    problem: null,
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Does this rail serve this market? Pure, so routing rules are testable without
 * a database.
 *
 * Empty `currencies`/`countries` mean unrestricted, which is what migration 0056
 * backfills for the pre-existing VietQR row -- so an un-migrated rail keeps
 * serving everything it served before rather than disappearing.
 */
export function railServesMarket(
  config: RailConfig,
  market: RailMarketContext,
): { ok: true } | { ok: false; reason: RailProblem["reason"] } {
  const currency = (market.currency ?? "").trim().toUpperCase();
  if (config.currencies.length > 0 && !config.currencies.includes(currency)) {
    return { ok: false, reason: "currency_not_served" };
  }
  const country = (market.country ?? "").trim().toUpperCase();
  // A country restriction with no known country is not a match: a rail limited
  // to PH must not be offered to a buyer whose country could not be determined.
  if (config.countries.length > 0 && (!country || !config.countries.includes(country))) {
    return { ok: false, reason: "country_not_served" };
  }
  const amount = market.amountMinor;
  if (typeof amount === "number" && Number.isFinite(amount)) {
    const min = config.capabilities.minAmountMinor;
    if (typeof min === "number" && amount < min) return { ok: false, reason: "amount_below_minimum" };
    const max = config.capabilities.maxAmountMinor;
    if (typeof max === "number" && amount > max) return { ok: false, reason: "amount_above_maximum" };
  }
  return { ok: true };
}

/**
 * Deterministic ordering: priority, then rail type in the order a buyer is most
 * likely to complete, then provider id so the result never depends on row order.
 */
function compareRails(left: RailConfig, right: RailConfig) {
  if (left.priority !== right.priority) return left.priority - right.priority;
  const leftRank = RAIL_TYPES.indexOf(left.railType);
  const rightRank = RAIL_TYPES.indexOf(right.railType);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.provider.localeCompare(right.provider);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load active rail configs. Ordered in SQL so the `LIMIT` keeps the highest
 * priority rows rather than an arbitrary slice.
 */
export async function loadRailConfigs(db: D1Database): Promise<{
  configs: RailConfig[];
  problems: RailProblem[];
}> {
  const result = await db
    .prepare(
      `SELECT id, provider, rail_type, display_name, status, bank_id, account_ref,
              account_name_display, qr_template, confirmation_adapter, secret_ref,
              public_config_json, currencies_json, countries_json, capabilities_json, priority
       FROM shop_payment_provider_configs
       WHERE status = 'active'
       ORDER BY priority ASC, provider ASC
       LIMIT ?`,
    )
    .bind(MAX_RAIL_CONFIGS)
    .all<RailConfigRow>();

  const configs: RailConfig[] = [];
  const problems: RailProblem[] = [];
  for (const row of result.results ?? []) {
    const decoded = decodeRailConfig(row);
    if (!decoded.config) {
      problems.push({
        configId: String(row.id ?? ""),
        provider: normalizeProvider(row.provider),
        reason: decoded.problem ?? "unknown_rail_type",
      });
      continue;
    }
    configs.push(decoded.config);
  }
  return { configs, problems };
}

/**
 * Resolve the rails usable for a market, best first.
 *
 * Anything withheld lands in `problems` with a reason. Callers that render a
 * checkout should use `rails`; callers that render an admin screen should also
 * show `problems`, because that is where "why is GCash not appearing" is
 * answered.
 */
export async function resolveRails(
  db: D1Database,
  market: RailMarketContext,
): Promise<RailResolution> {
  const { configs, problems } = await loadRailConfigs(db);
  const rails: Array<{ rail: PaymentRail; config: RailConfig }> = [];

  for (const config of configs) {
    const serves = railServesMarket(config, market);
    if (!serves.ok) {
      problems.push({ configId: config.id, provider: config.provider, reason: serves.reason });
      continue;
    }
    const rail = registry.get(config.provider);
    if (!rail) {
      // Switched on in the database, but no deployed adapter can execute it.
      problems.push({ configId: config.id, provider: config.provider, reason: "no_adapter_registered" });
      continue;
    }
    rails.push({ rail, config });
  }

  rails.sort((left, right) => compareRails(left.config, right.config));
  return { rails, problems };
}

/**
 * Pick one rail for a market, or `null`. Convenience over `resolveRails` for the
 * common "just give me the default" case.
 */
export async function resolvePreferredRail(
  db: D1Database,
  market: RailMarketContext,
): Promise<{ rail: PaymentRail; config: RailConfig } | null> {
  const { rails } = await resolveRails(db, market);
  return rails[0] ?? null;
}
