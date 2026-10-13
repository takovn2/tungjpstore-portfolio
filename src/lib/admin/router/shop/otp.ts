import { otpBindings } from "../../../shop/otp/bindings";
import { adminError, adminJson } from "../../http";
import type { AdminRouteContext } from "../context";
import { recentAdminAuthError } from "./shared";
import { readBoundedJson, OTP_ID } from "../../../shop/otp/contract";
import { requeueOtpValidation } from "../../../shop/otp/validation-recovery";
import { configureOtpVariantPolicy, extendOtpEntitlement } from "../../../shop/otp/entitlement-policy";
import { bindOtpInventory } from "../../../shop/otp/inventory-binding";

export async function handleOtpRoutes(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  if (resource !== "otp") return null;
  const db = ctx.bindings.CONTENT_DB;
  if (!db || ctx.bindings.SHOP_OTP_ENABLED !== "true") return adminError("otp_not_available", 404);
  const recent = recentAdminAuthError(ctx.session);
  if (recent) return recent;
  if (ctx.method === "GET" && ctx.segments.length === 2) {
    const unitId = new URL(ctx.request.url).searchParams.get("inventoryUnitId");
    if (!unitId || !OTP_ID.test(unitId)) return adminError("otp_binding_invalid", 400);
    const binding = await db.prepare(`SELECT inventory_unit_id, state, provider_key, validated_at, record_version
      FROM shop_otp_inventory_aliases WHERE inventory_unit_id = ? LIMIT 1`).bind(unitId).first();
    const grants = await db.prepare(`SELECT id, allocation_id, order_id, state, version, revoked_reason, entitlement_kind, expires_at,
      validation_attempts, validation_total_attempts, validation_cycle, next_validation_at, validation_last_failure, validation_failed_at
      FROM shop_otp_grants WHERE inventory_unit_id = ? LIMIT 1`).bind(unitId).all();
    const attempts = await db.prepare(`SELECT outcome, COUNT(*) AS count FROM shop_otp_lookup_attempts
      WHERE grant_id IN (SELECT id FROM shop_otp_grants WHERE inventory_unit_id = ?) GROUP BY outcome`).bind(unitId).all();
    return adminJson({ ok: true, binding, grants: grants.results, outcomes: attempts.results });
  }
  if (ctx.method !== "POST" || ctx.segments.length !== 3) return adminError("method_not_allowed", 405);
  const body = await readBoundedJson(ctx.request);
  if (!body) return adminError("otp_binding_invalid", 400);
  if (ctx.segments[2] === "policy") {
    const keys = ["variantId","kind","durationSeconds","expiresAt","expectedRevision","reason"];
    if (Object.keys(body).some(key => !keys.includes(key)) || typeof body.variantId !== "string" ||
      !OTP_ID.test(body.variantId) || !["duration","until","perpetual"].includes(String(body.kind)) ||
      !Number.isInteger(body.expectedRevision) || typeof body.reason !== "string") return adminError("otp_binding_invalid", 400);
    try {
      const common = { variantId: body.variantId, expectedRevision: body.expectedRevision as number,
        actor: ctx.user.sub, reason: body.reason };
      if (body.kind === "duration" && (typeof body.durationSeconds !== "number" || "expiresAt" in body) ||
        body.kind === "until" && (typeof body.expiresAt !== "string" || "durationSeconds" in body) ||
        body.kind === "perpetual" && ("expiresAt" in body || "durationSeconds" in body)) return adminError("otp_binding_invalid", 400);
      const input = body.kind === "duration" ? { ...common, kind: "duration" as const, durationSeconds: body.durationSeconds as number }
        : body.kind === "until" ? { ...common, kind: "until" as const, expiresAt: body.expiresAt as string }
        : { ...common, kind: "perpetual" as const };
      return adminJson({ ok: true, policy: await configureOtpVariantPolicy(db, input) });
    } catch { return adminError("otp_policy_invalid", 409); }
  }
  if (typeof body.inventoryUnitId !== "string" || !OTP_ID.test(body.inventoryUnitId)) return adminError("otp_binding_invalid", 400);
  try {
    if (ctx.segments[2] === "extend" && Object.keys(body).length === 4 && Number.isInteger(body.expectedVersion) &&
      typeof body.expiresAt === "string" && typeof body.reason === "string") {
      return adminJson({ ok: true, entitlement: await extendOtpEntitlement(db, { inventoryUnitId: body.inventoryUnitId,
        expectedVersion: body.expectedVersion as number, expiresAt: body.expiresAt, actor: ctx.user.sub, reason: body.reason }) });
    }
    if (ctx.segments[2] === "revalidate" && Object.keys(body).length === 2 && typeof body.reason === "string") {
      return adminJson({ ok: true, ...await requeueOtpValidation(db, {
        inventoryUnitId: body.inventoryUnitId, actor: ctx.user.sub, reason: body.reason }) });
    }
    if (ctx.segments[2] === "bind" && Object.keys(body).length === 3 && typeof body.aliasId === "string" && typeof body.providerKey === "string") {
      return adminJson({ ok: true, binding: await bindOtpInventory(otpBindings(ctx.bindings),
        { inventoryUnitId: body.inventoryUnitId, aliasId: body.aliasId, providerKey: body.providerKey }) }, 201);
    }
    if (["disable","quarantine","revoke"].includes(ctx.segments[2]) && Object.keys(body).length === 2 &&
      typeof body.reason === "string" && /^[a-z][a-z0-9_]{2,63}$/.test(body.reason)) {
      const at = new Date().toISOString();
      await db.batch([
        db.prepare(`UPDATE shop_otp_grants SET state = 'revoked', revoked_reason = ?, revoked_at = ?, updated_at = ?, version = version + 1
          WHERE inventory_unit_id = ? AND state NOT IN ('revoked','expired')`).bind(body.reason, at, at, body.inventoryUnitId),
        db.prepare(`UPDATE shop_otp_inventory_aliases SET state = ?, record_version = record_version + 1, updated_at = ? WHERE inventory_unit_id = ?`)
          .bind(ctx.segments[2] === "quarantine" ? "quarantined" : "disabled", at, body.inventoryUnitId),
      ]);
      return adminJson({ ok: true });
    }
    return adminError("otp_binding_invalid", 400);
  } catch { return adminError("otp_binding_unavailable", 409); }
}
