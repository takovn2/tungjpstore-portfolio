import { LIVE_GRANT_JOIN, LIVE_GRANT_WHERE } from "./grant-repository";

export type OtpEntitlementKind = "perpetual" | "duration" | "until";

export type OtpVariantPolicy = {
  variant_id: string;
  kind: OtpEntitlementKind;
  duration_seconds: number | null;
  expires_at: string | null;
  policy_version: number;
  reason: string;
  configured_by: string;
  configured_at: string;
  updated_at: string;
};

export type OtpVariantPolicyInput =
  | { variantId: string; kind: "perpetual"; expectedRevision: number; actor: string; reason: string }
  | { variantId: string; kind: "duration"; durationSeconds: number; expectedRevision: number; actor: string; reason: string }
  | { variantId: string; kind: "until"; expiresAt: string; expectedRevision: number; actor: string; reason: string };

const MAX_DURATION_SECONDS = 315_360_000;
const REASON = /^[a-z][a-z0-9_]{2,63}$/;

function parseIso(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error("otp_entitlement_invalid_expiry");
  return parsed;
}

function validatePolicy(input: OtpVariantPolicyInput, now: number) {
  if (!["perpetual","duration","until"].includes(input.kind) || !input.variantId || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    (!input.actor || input.actor.length > 256) || !REASON.test(input.reason)) throw new Error("otp_entitlement_invalid_policy");
  if (input.kind === "duration" && (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 60 || input.durationSeconds > MAX_DURATION_SECONDS)) {
    throw new Error("otp_entitlement_invalid_duration");
  }
  if (input.kind === "until" && parseIso(input.expiresAt) <= now) throw new Error("otp_entitlement_expired_policy");
}

export async function getOtpVariantPolicy(db: D1Database, variantId: string): Promise<OtpVariantPolicy | null> {
  return db.prepare(`SELECT variant_id, kind, duration_seconds, expires_at, policy_version, reason,
      configured_by, configured_at, updated_at
    FROM shop_otp_variant_policies WHERE variant_id = ? LIMIT 1`).bind(variantId).first<OtpVariantPolicy>();
}

/** Configure only an explicit policy; catalog prose and checkout deadlines are never parsed here. */
export async function configureOtpVariantPolicy(db: D1Database, input: OtpVariantPolicyInput, now = Date.now()) {
  validatePolicy(input, now);
  const variant = await db.prepare(`SELECT id FROM shop_variants WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(input.variantId).first<{ id: string }>();
  if (!variant) throw new Error("otp_entitlement_variant_not_found");
  const existing = await getOtpVariantPolicy(db, input.variantId);
  if ((existing?.policy_version ?? 0) !== input.expectedRevision) throw new Error("otp_entitlement_revision_conflict");
  const at = new Date(now).toISOString();
  const duration = input.kind === "duration" ? input.durationSeconds : null;
  const expiry = input.kind === "until" ? new Date(parseIso(input.expiresAt)).toISOString() : null;
  const idempotent = input.expectedRevision === 0
    ? await db.prepare(`INSERT INTO shop_otp_variant_policies
        (variant_id, kind, duration_seconds, expires_at, policy_version, reason, configured_by, configured_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
        ON CONFLICT(variant_id) DO NOTHING RETURNING variant_id`).bind(input.variantId, input.kind, duration, expiry, input.reason, input.actor, at, at).first<{ variant_id: string }>()
    : await db.prepare(`UPDATE shop_otp_variant_policies SET kind = ?, duration_seconds = ?, expires_at = ?,
        policy_version = policy_version + 1, reason = ?, configured_by = ?, configured_at = ?, updated_at = ?
      WHERE variant_id = ? AND policy_version = ? RETURNING variant_id`).bind(input.kind, duration, expiry, input.reason, input.actor, at, at, input.variantId, input.expectedRevision).first<{ variant_id: string }>();
  if (!idempotent) throw new Error("otp_entitlement_revision_conflict");
  return getOtpVariantPolicy(db, input.variantId);
}

/** Extend a live term grant through an authorized operator path. Terminal/expired grants cannot return. */
export async function extendOtpEntitlement(db: D1Database, input: {
  grantId?: string;
  inventoryUnitId?: string;
  expectedVersion: number;
  expiresAt: string;
  actor: string;
  reason: string;
}, now = Date.now()) {
  if ((!input.grantId && !input.inventoryUnitId) || (input.grantId && input.inventoryUnitId) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || (!input.actor || input.actor.length > 256) || !REASON.test(input.reason)) {
    throw new Error("otp_entitlement_invalid_extension");
  }
  const expiryMs = parseIso(input.expiresAt);
  if (expiryMs <= now || expiryMs > now + MAX_DURATION_SECONDS * 1000) throw new Error("otp_entitlement_invalid_expiry");
  const at = new Date(now).toISOString();
  const nextExpiry = new Date(expiryMs).toISOString();
  const key = input.grantId ?? input.inventoryUnitId!;
  const inserted = await db.prepare(`INSERT INTO shop_otp_grant_extensions
    (id, grant_id, grant_version, previous_expires_at, new_expires_at, actor, reason, created_at)
    SELECT ?, g.id, g.version, g.expires_at, ?, ?, ?, ? ${LIVE_GRANT_JOIN}
    WHERE ${input.grantId ? "g.id = ?" : "g.inventory_unit_id = ?"} AND g.version = ?
      AND ${LIVE_GRANT_WHERE} AND g.entitlement_start_at <= ?
      AND g.state IN ('active','pending') AND g.entitlement_kind IN ('duration','until')
      AND g.expires_at IS NOT NULL AND g.expires_at > ? AND ? > g.expires_at
    RETURNING grant_id`).bind(
    crypto.randomUUID(), nextExpiry, input.actor, input.reason, at, key, input.expectedVersion, at, at, nextExpiry).first<{ grant_id: string }>();
  if (!inserted) throw new Error("otp_entitlement_extension_conflict");
  const row = await db.prepare(`SELECT id AS grant_id, expires_at, version FROM shop_otp_grants
    WHERE ${input.grantId ? "id = ?" : "inventory_unit_id = ?"} LIMIT 1`).bind(key).first<{ grant_id: string; expires_at: string; version: number }>();
  return row;
}
