/**
 * F1 Commerce Graph + F8 Affiliate — cross-channel attribution.
 * Client + server safe pure helpers. Stored in localStorage / order external_reference.
 */

export const ATTRIBUTION_STORAGE_KEY = "tung:shop:attribution:v1";
export const CART_STORAGE_KEY = "tung:shop:cart:v1";
export const CART_BRIDGE_STORAGE_KEY = "tung:shop:cart-bridge:v1";

export type ShopChannel = "web" | "telegram" | "telegram_glb" | "admin" | "api";

export type ShopAttribution = {
  /** Partner / affiliate code (e.g. KOL handle) */
  ref: string | null;
  /** Discount code prefilled from deep link */
  discountCode: string | null;
  /** First-touch channel */
  channel: ShopChannel | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Landing path when captured */
  landingPath: string | null;
  capturedAt: string;
  /** Last product slug viewed (commerce graph continuity) */
  lastProductSlug: string | null;
};

export const emptyAttribution = (): ShopAttribution => ({
  ref: null,
  discountCode: null,
  channel: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  landingPath: null,
  capturedAt: new Date().toISOString(),
  lastProductSlug: null,
});

const cleanCode = (value: unknown, max = 40) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, max);
  return trimmed.length >= 2 ? trimmed : null;
};

const cleanUtm = (value: unknown, max = 80) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
};

/** Capture attribution from URLSearchParams (web or mini deep link). */
export function captureAttributionFromSearch(
  search: string | URLSearchParams,
  options: { channel?: ShopChannel; landingPath?: string | null; existing?: ShopAttribution | null } = {},
): ShopAttribution {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search : `?${search}`) : search;
  const existing = options.existing ?? emptyAttribution();
  const next: ShopAttribution = {
    ...existing,
    capturedAt: existing.ref || existing.discountCode ? existing.capturedAt : new Date().toISOString(),
  };

  const ref = cleanCode(params.get("ref") || params.get("affiliate") || params.get("partner"));
  if (ref) next.ref = ref;

  const discount = cleanCode(params.get("discount") || params.get("promo") || params.get("code"));
  if (discount) next.discountCode = discount;

  const utmSource = cleanUtm(params.get("utm_source"));
  const utmMedium = cleanUtm(params.get("utm_medium"));
  const utmCampaign = cleanUtm(params.get("utm_campaign"));
  if (utmSource) next.utmSource = utmSource;
  if (utmMedium) next.utmMedium = utmMedium;
  if (utmCampaign) next.utmCampaign = utmCampaign;

  if (options.channel && !next.channel) next.channel = options.channel;
  if (options.landingPath && !next.landingPath) next.landingPath = options.landingPath.slice(0, 200);

  return next;
}

/** Encode attribution into checkout external_reference (max ~200 chars in validation). */
export function encodeAttributionReference(attr: ShopAttribution, maxLen = 180): string | null {
  const parts: string[] = [];
  if (attr.ref) parts.push(`ref=${attr.ref}`);
  if (attr.discountCode) parts.push(`promo=${attr.discountCode}`);
  if (attr.channel) parts.push(`ch=${attr.channel}`);
  if (attr.utmSource) parts.push(`us=${attr.utmSource}`);
  if (attr.utmCampaign) parts.push(`uc=${attr.utmCampaign}`);
  if (attr.lastProductSlug) parts.push(`p=${attr.lastProductSlug.slice(0, 40)}`);
  if (!parts.length) return null;
  const joined = parts.join("|");
  return joined.length <= maxLen ? joined : joined.slice(0, maxLen);
}

/**
 * Order-bound external_reference: always unique per order to satisfy
 * UNIQUE(source_channel, external_reference). Call at checkout submit time.
 */
export function encodeOrderExternalReference(
  attr: ShopAttribution | null | undefined,
  nonce?: string,
  maxLen = 180,
): string | null {
  const base = attr ? encodeAttributionReference(attr, maxLen - 20) : null;
  const n = (nonce || (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}`)).replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  if (!n) return base;
  if (!base) return `n=${n}`.slice(0, maxLen);
  const joined = `${base}|n=${n}`;
  return joined.length <= maxLen ? joined : `n=${n}|${base}`.slice(0, maxLen);
}

/** Ensure any client-supplied external ref is unique (server-side safety net). */
export function ensureUniqueExternalReference(value: string | null | undefined, maxLen = 180): string | null {
  const raw = typeof value === "string" ? value.trim().slice(0, maxLen) : "";
  if (!raw) return null;
  if (/(^|\|)n=[A-Za-z0-9]{6,}/.test(raw)) return raw.slice(0, maxLen);
  const n = (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).slice(0, 12);
  const joined = `${raw}|n=${n}`;
  return joined.length <= maxLen ? joined : `n=${n}|${raw}`.slice(0, maxLen);
}

export function parseAttributionReference(value: string | null | undefined): Partial<ShopAttribution> {
  if (!value || typeof value !== "string") return {};
  const out: Partial<ShopAttribution> = {};
  for (const part of value.split("|")) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim();
    const val = rest.join("=").trim();
    if (!key || !val) continue;
    if (key === "ref") out.ref = cleanCode(val);
    if (key === "promo") out.discountCode = cleanCode(val);
    if (key === "ch" && ["web", "telegram", "telegram_glb", "admin", "api"].includes(val)) {
      out.channel = val as ShopChannel;
    }
    if (key === "us") out.utmSource = cleanUtm(val);
    if (key === "uc") out.utmCampaign = cleanUtm(val);
    if (key === "p") out.lastProductSlug = val.slice(0, 80);
  }
  return out;
}

export type CartBridgePayload = {
  v: 1;
  items: Array<{
    productId?: string;
    variantId: string;
    slug?: string;
    title?: string;
    variantTitle?: string;
    priceMinor?: number;
    currency?: string;
    quantity: number;
    maxQuantity?: number;
    imageUrl?: string;
  }>;
  attribution?: ShopAttribution;
  createdAt: string;
};

export function encodeCartBridge(payload: CartBridgePayload): string {
  const json = JSON.stringify(payload);
  // base64url — btoa is available in Workers and Node 18+
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCartBridge(token: string): CartBridgePayload | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as CartBridgePayload;
    if (data?.v !== 1 || !Array.isArray(data.items)) return null;
    // expire after 2 hours
    const created = Date.parse(data.createdAt);
    if (!Number.isFinite(created) || Date.now() - created > 2 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function mergeCartItems<T extends { variantId: string; quantity: number; maxQuantity?: number }>(
  existing: T[],
  incoming: T[],
  maxLines = 30,
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item?.variantId) map.set(item.variantId, { ...item });
  }
  for (const item of incoming) {
    if (!item?.variantId) continue;
    const prev = map.get(item.variantId);
    const maxQ = Math.max(1, Math.min(50, Number(item.maxQuantity ?? prev?.maxQuantity ?? 10)));
    if (prev) {
      prev.quantity = Math.min(maxQ, (Number(prev.quantity) || 0) + (Number(item.quantity) || 0));
      map.set(item.variantId, prev);
    } else {
      map.set(item.variantId, {
        ...item,
        quantity: Math.min(maxQ, Math.max(1, Number(item.quantity) || 1)),
      });
    }
  }
  return Array.from(map.values()).slice(0, maxLines);
}
