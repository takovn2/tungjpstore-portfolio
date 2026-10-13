import { OTP_ID, type OtpBindings } from "./contract";
import { boundedRpc, signedRpcRequest } from "./rpc-client";

export async function bindOtpInventory(bindings: OtpBindings, input: { inventoryUnitId: string; aliasId: string; providerKey: string }, now = Date.now()) {
  if (bindings.SHOP_OTP_ENABLED !== "true" || !bindings.MAILVAULT_OTP) throw new Error("otp_not_available");
  if (!OTP_ID.test(input.inventoryUnitId) || !OTP_ID.test(input.aliasId) || !/^[a-z][a-z0-9_-]{0,31}$/.test(input.providerKey)) throw new Error("otp_binding_invalid");
  const db = bindings.CONTENT_DB;
  const unit = await db.prepare(`SELECT id FROM shop_inventory_units WHERE id = ? AND status = 'available'
    AND NOT EXISTS (SELECT 1 FROM shop_inventory_allocations WHERE inventory_unit_id = shop_inventory_units.id)
    AND NOT EXISTS (SELECT 1 FROM shop_otp_inventory_aliases WHERE inventory_unit_id = shop_inventory_units.id OR alias_id = ?)
    AND NOT EXISTS (SELECT 1 FROM shop_otp_grants WHERE inventory_unit_id = shop_inventory_units.id OR alias_id = ?) LIMIT 1`)
    .bind(input.inventoryUnitId, input.aliasId, input.aliasId).first();
  if (!unit) throw new Error("otp_binding_conflict");
  const request = await signedRpcRequest(bindings, { operation: "validateAlias", aliasId: input.aliasId,
    providerKey: input.providerKey, grantId: `provision_${crypto.randomUUID()}`, notBefore: new Date(now).toISOString() }, now);
  const result = await boundedRpc(bindings.MAILVAULT_OTP.validateAlias(request));
  if (result.state !== "active" || result.aliasId !== input.aliasId) throw new Error("otp_alias_not_validated");
  const at = new Date(now).toISOString();
  const saved = await db.prepare(`INSERT INTO shop_otp_inventory_aliases
    (id, inventory_unit_id, alias_id, provider_key, state, validated_at, created_at, updated_at)
    SELECT ?, id, ?, ?, 'ready', ?, ?, ? FROM shop_inventory_units WHERE id = ? AND status = 'available'
    AND NOT EXISTS (SELECT 1 FROM shop_inventory_allocations WHERE inventory_unit_id = shop_inventory_units.id)
    AND NOT EXISTS (SELECT 1 FROM shop_otp_grants WHERE inventory_unit_id = shop_inventory_units.id OR alias_id = ?)`)
    .bind(crypto.randomUUID(), input.aliasId, input.providerKey, at, at, at, input.inventoryUnitId, input.aliasId).run();
  if (saved.meta.changes !== 1) throw new Error("otp_binding_conflict");
  return { state: "ready" as const, inventoryUnitId: input.inventoryUnitId };
}
export async function disableOtpBinding(db: D1Database, inventoryUnitId: string, state: "disabled" | "quarantined", now = Date.now()) {
  return db.prepare(`UPDATE shop_otp_inventory_aliases SET state = ?, record_version = record_version + 1, updated_at = ? WHERE inventory_unit_id = ?`)
    .bind(state, new Date(now).toISOString(), inventoryUnitId).run();
}
