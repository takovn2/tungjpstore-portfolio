/**
 * Server-side platform services (D1-backed bridges, affiliates, attribution log).
 * Uses Web Crypto for Worker portability (nodejs_compat optional).
 */
import {
  type CartBridgePayload,
  type ShopChannel,
} from "./attribution.ts";
import { recommendProducts, type RecommendProductInput, type RecommendResponse } from "./recommend.ts";

const textEncoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  view.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toBase64Url(digest);
}

function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function createCartBridge(
  db: D1Database,
  payload: CartBridgePayload,
  channel: ShopChannel = "web",
  ttlMinutes = 120,
): Promise<{ token: string; expiresAt: string; itemCount: number }> {
  const sanitized: CartBridgePayload = {
    v: 1,
    items: (payload.items || [])
      .filter((item) => item && typeof item.variantId === "string" && item.variantId.length > 0)
      .slice(0, 30)
      .map((item) => ({
        ...item,
        quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1)),
      })),
    attribution: payload.attribution,
    createdAt: new Date().toISOString(),
  };
  if (!sanitized.items.length) throw new Error("bridge_empty");

  const token = randomToken(24);
  const tokenHash = await sha256Base64Url(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(5, Math.min(24 * 60, ttlMinutes)) * 60_000).toISOString();
  const id = crypto.randomUUID();

  await db.prepare(`INSERT INTO shop_cart_bridges
    (id, token_hash, payload_json, channel, item_count, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
    id,
    tokenHash,
    JSON.stringify(sanitized),
    channel,
    sanitized.items.length,
    now.toISOString(),
    expiresAt,
  ).run();

  await logAttributionEvent(db, {
    eventType: "bridge_create",
    channel,
    refCode: sanitized.attribution?.ref ?? null,
    discountCode: sanitized.attribution?.discountCode ?? null,
    payload: { itemCount: sanitized.items.length },
  });

  return { token, expiresAt, itemCount: sanitized.items.length };
}

export async function consumeCartBridge(
  db: D1Database,
  token: string,
): Promise<CartBridgePayload | null> {
  if (!token || token.length < 16 || token.length > 200) return null;
  const tokenHash = await sha256Base64Url(token);
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT id, payload_json, expires_at, consumed_at
    FROM shop_cart_bridges WHERE token_hash = ? LIMIT 1`).bind(tokenHash).first<{
    id: string;
    payload_json: string;
    expires_at: string;
    consumed_at: string | null;
  }>();
  if (!row || row.consumed_at || row.expires_at <= now) return null;

  let payload: CartBridgePayload | null = null;
  try {
    payload = JSON.parse(row.payload_json) as CartBridgePayload;
  } catch {
    return null;
  }
  await db.prepare(`UPDATE shop_cart_bridges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`)
    .bind(now, row.id).run();

  await logAttributionEvent(db, {
    eventType: "bridge_consume",
    channel: payload.attribution?.channel ?? null,
    refCode: payload.attribution?.ref ?? null,
    discountCode: payload.attribution?.discountCode ?? null,
    payload: { itemCount: payload.items?.length ?? 0 },
  });

  return payload;
}

export type AffiliatePartner = {
  id: string;
  code: string;
  displayName: string;
  status: "active" | "paused" | "archived";
  commissionBps: number;
  notes: string | null;
};

export async function listAffiliatePartners(db: D1Database): Promise<AffiliatePartner[]> {
  const rows = await db.prepare(`SELECT id, code_normalized AS code, display_name AS displayName,
      status, commission_bps AS commissionBps, notes
    FROM shop_affiliate_partners
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC, code_normalized ASC
    LIMIT 200`).all<{
    id: string; code: string; displayName: string; status: AffiliatePartner["status"];
    commissionBps: number; notes: string | null;
  }>();
  return rows.results ?? [];
}

export async function upsertAffiliatePartner(
  db: D1Database,
  input: { code: string; displayName: string; commissionBps?: number; notes?: string | null; status?: AffiliatePartner["status"] },
): Promise<AffiliatePartner> {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  if (code.length < 2) throw new Error("invalid_affiliate_code");
  const displayName = input.displayName.trim().slice(0, 120) || code;
  const commissionBps = Math.max(0, Math.min(5000, Math.floor(input.commissionBps ?? 0)));
  const status = input.status ?? "active";
  const notes = input.notes?.trim().slice(0, 500) || null;
  const now = new Date().toISOString();
  const existing = await db.prepare(`SELECT id FROM shop_affiliate_partners WHERE code_normalized = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(code).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.prepare(`UPDATE shop_affiliate_partners
      SET display_name = ?, status = ?, commission_bps = ?, notes = ?, updated_at = ?
      WHERE id = ?`).bind(displayName, status, commissionBps, notes, now, id).run();
  } else {
    await db.prepare(`INSERT INTO shop_affiliate_partners
      (id, code_normalized, display_name, status, commission_bps, notes, metadata_json, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, NULL)`).bind(id, code, displayName, status, commissionBps, notes, now, now).run();
  }
  return { id, code, displayName, status, commissionBps, notes };
}

export async function resolveActiveAffiliate(db: D1Database, code: string | null | undefined) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  if (normalized.length < 2) return null;
  return db.prepare(`SELECT id, code_normalized AS code, display_name AS displayName,
      status, commission_bps AS commissionBps
    FROM shop_affiliate_partners
    WHERE code_normalized = ? AND status = 'active' AND deleted_at IS NULL
    LIMIT 1`).bind(normalized).first<{
    id: string; code: string; displayName: string; status: string; commissionBps: number;
  }>();
}

/**
 * Accrue commission when checkout carries a matching affiliate ref.
 * Never throws to caller — ledger is best-effort side effect.
 */
export async function recordCommissionAccrual(
  db: D1Database,
  input: {
    orderId: string;
    externalReference?: string | null;
    orderTotalMinor: number;
    currency: string;
    sourceChannel?: string | null;
  },
): Promise<{ accrued: boolean; commissionMinor?: number; partnerCode?: string }> {
  try {
    const { parseAttributionReference } = await import("./attribution.ts");
    const parsed = parseAttributionReference(input.externalReference ?? null);
    if (!parsed.ref) return { accrued: false };
    const partner = await resolveActiveAffiliate(db, parsed.ref);
    if (!partner || partner.commissionBps <= 0) return { accrued: false };
    const total = Math.max(0, Math.floor(Number(input.orderTotalMinor) || 0));
    const commissionMinor = Math.floor((total * partner.commissionBps) / 10_000);
    if (commissionMinor <= 0) return { accrued: false };
    const now = new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO shop_commission_accruals
      (id, order_id, partner_id, partner_code, order_total_minor, currency, commission_bps, commission_minor, status, source_channel, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accrued', ?, ?, ?)`).bind(
      crypto.randomUUID(),
      input.orderId,
      partner.id,
      partner.code,
      total,
      (input.currency || "VND").toUpperCase().slice(0, 8),
      partner.commissionBps,
      commissionMinor,
      input.sourceChannel ?? null,
      now,
      now,
    ).run();
    return { accrued: true, commissionMinor, partnerCode: partner.code };
  } catch {
    return { accrued: false };
  }
}

export async function listCommissionAccruals(db: D1Database, limit = 50) {
  const rows = await db.prepare(`SELECT id, order_id AS orderId, partner_code AS partnerCode,
      order_total_minor AS orderTotalMinor, currency, commission_bps AS commissionBps,
      commission_minor AS commissionMinor, status, source_channel AS sourceChannel, created_at AS createdAt
    FROM shop_commission_accruals
    ORDER BY created_at DESC LIMIT ?`).bind(Math.max(1, Math.min(200, limit))).all<{
    id: string; orderId: string; partnerCode: string; orderTotalMinor: number; currency: string;
    commissionBps: number; commissionMinor: number; status: string; sourceChannel: string | null; createdAt: string;
  }>();
  return rows.results ?? [];
}

export async function logAttributionEvent(
  db: D1Database,
  input: {
    eventType: "capture" | "checkout" | "bridge_create" | "bridge_consume" | "recommend";
    channel?: string | null;
    refCode?: string | null;
    discountCode?: string | null;
    productSlug?: string | null;
    orderId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  try {
    await db.prepare(`INSERT INTO shop_attribution_events
      (id, event_type, channel, ref_code, discount_code, product_slug, order_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      input.eventType,
      input.channel ?? null,
      input.refCode ?? null,
      input.discountCode ?? null,
      input.productSlug ?? null,
      input.orderId ?? null,
      JSON.stringify(input.payload ?? {}),
      new Date().toISOString(),
    ).run();
  } catch {
    // Table may not exist until migration 0049 is applied; never break checkout.
  }
}

/**
 * Optional SpaceXAI (xAI) enrichment — falls back to heuristic.
 * Locked off by default until SHOP_AI_RECOMMEND_ENABLED=1 and XAI_API_KEY exist.
 */
export const SHOP_AI_RECOMMEND_LOCKED = true;

export function isShopAiRecommendEnabled(options: {
  xaiApiKey?: string | null;
  /** Explicit override: env SHOP_AI_RECOMMEND_ENABLED=1 */
  featureFlag?: string | null | boolean;
} = {}): boolean {
  if (SHOP_AI_RECOMMEND_LOCKED) return false;
  const flag = options.featureFlag;
  const enabled = flag === true || flag === "1" || flag === "true";
  if (!enabled) return false;
  return Boolean(options.xaiApiKey?.trim());
}

export async function recommendWithOptionalAi(
  catalog: RecommendProductInput[],
  query: string,
  options: {
    locale?: string;
    limit?: number;
    xaiApiKey?: string | null;
    featureFlag?: string | null | boolean;
  } = {},
): Promise<RecommendResponse> {
  const base = recommendProducts(catalog, query, {
    locale: options.locale,
    limit: options.limit,
  });

  // Temporary lock: no external LLM calls while API key is unavailable.
  if (!isShopAiRecommendEnabled({
    xaiApiKey: options.xaiApiKey,
    featureFlag: options.featureFlag,
  })) {
    return { ...base, engine: "heuristic" };
  }

  const key = options.xaiApiKey?.trim();
  const cleaned = query.trim();
  if (!key || !cleaned || cleaned.length < 3) return base;

  try {
    const slim = catalog.slice(0, 40).map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.categorySlug || p.category,
      price: p.minPriceMinor,
      availability: p.availability,
    }));
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-non-reasoning",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You are a digital goods shop assistant for TUNG Shop. Pick up to 4 product slugs from the catalog that best match the user need. Reply JSON only: {\"slugs\":[\"...\"],\"message\":\"short advice\"}. Never invent slugs.",
          },
          {
            role: "user",
            content: JSON.stringify({ locale: options.locale ?? "vi", need: cleaned, catalog: slim }),
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return base;
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return base;
    const parsed = JSON.parse(jsonMatch[0]) as { slugs?: string[]; message?: string };
    const slugs = Array.isArray(parsed.slugs) ? parsed.slugs.map(String) : [];
    const bySlug = new Map(catalog.map((p) => [p.slug, p]));
    const aiResults = slugs
      .map((slug) => bySlug.get(slug))
      .filter(Boolean)
      .slice(0, options.limit ?? 4)
      .map((product) => ({
        product: product!,
        score: 10,
        reasons: [options.locale === "vi" ? "Gợi ý AI" : "AI match"],
      }));
    if (!aiResults.length) return base;
    return {
      engine: "hybrid",
      query: cleaned,
      results: aiResults,
      assistantMessage: typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message.trim().slice(0, 500)
        : base.assistantMessage,
    };
  } catch {
    return base;
  }
}
