import { adminError, adminJson } from "../../http";
import { readJsonObject } from "../../db-utils";
import { getShopOrderDetail, getShopOverviewSnapshot, listFulfillmentOps, listShopOrdersForAdmin } from "../../../../lib/shop/ops-repository";
import { manuallyConfirmOrderPayment, ShopConflictError, ShopNotFoundError } from "../../../../lib/shop/repository";
import { runShopExpirySweep } from "../../../../lib/shop/service";
import { validateManualOrderConfirmInput } from "../../../../lib/shop/validation";
import type { AdminRouteContext } from "../context";
import { parseLimit, parsePage } from "./shared";

async function handleOverview(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { segments, method } = ctx;
  if (resource !== "overview" || method !== "GET" || segments.length !== 2) return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const snapshot = await getShopOverviewSnapshot(shopDb);
  return adminJson({
    ok: true,
    counts: snapshot.counts,
    ops: snapshot.ops,
    inventoryAlerts: snapshot.inventoryAlerts,
    ordersSeries: snapshot.ordersSeries,
  });
}

async function handleOrders(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { request, segments, method, requestId } = ctx;
  if (resource !== "orders") return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  const actor = { id: ctx.user.email, channel: "admin" as const };
  if (method === "GET" && segments.length === 2) {
    const url = new URL(request.url);
    const page = await listShopOrdersForAdmin(shopDb, {
      page: parsePage(url.searchParams.get("page")),
      limit: parseLimit(url.searchParams.get("limit"), 20),
      query: url.searchParams.get("q"),
    });
    return adminJson({ ok: true, orders: page.orders, total: page.total, pagination: page.pagination });
  }
  if (method === "GET" && segments.length === 3) {
    const order = await getShopOrderDetail(shopDb, segments[2]);
    return order ? adminJson({ ok: true, order }) : adminError("shop_order_not_found", 404);
  }
  if (method === "POST" && segments.length === 4 && segments[3] === "manual-confirm") {
    const payload = await readJsonObject(request, 8_000, { code: "manual_confirm_validation_failed" });
    if (payload instanceof Response) return payload;
    const parsed = validateManualOrderConfirmInput(payload);
    if (!parsed.ok) return adminError("manual_confirm_validation_failed", 422, { issues: parsed.issues });
    try {
      const result = await manuallyConfirmOrderPayment(shopDb, segments[2], parsed.value, actor, requestId);
      return adminJson({ ok: true, confirmation: result }, result.outcome === "already_paid" ? 200 : 201);
    } catch (error) {
      if (error instanceof ShopNotFoundError) return adminError("shop_order_not_found", 404);
      if (error instanceof ShopConflictError) return adminError(error.code, 409);
      throw error;
    }
  }
  return adminError("method_not_allowed", 405);
}

async function handleFulfillment(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { segments, method } = ctx;
  if (resource !== "fulfillment" || method !== "GET" || segments.length !== 2) return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  return adminJson({ ok: true, ...(await listFulfillmentOps(shopDb)) });
}

async function handleMaintenance(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  const { segments, method, bindings } = ctx;
  if (resource !== "maintenance" || method !== "POST" || segments.length !== 2) return null;
  const shopDb = ctx.bindings.CONTENT_DB;
  if (!shopDb) return adminError("shop_not_configured", 503);
  return adminJson({ ok: true, sweep: await runShopExpirySweep({
    CONTENT_DB: shopDb,
    VIETQR_BANK_ACCOUNT: bindings.VIETQR_BANK_ACCOUNT,
    PAYOS_CLIENT_ID: bindings.PAYOS_CLIENT_ID,
    PAYOS_API_KEY: bindings.PAYOS_API_KEY,
    PAYOS_CHECKSUM_KEY: bindings.PAYOS_CHECKSUM_KEY,
    SHOP_PUBLIC_ORIGIN: bindings.SHOP_PUBLIC_ORIGIN,
  }) });
}

export async function handleOpsRoutes(ctx: AdminRouteContext, resource: string): Promise<Response | null> {
  return (await handleOverview(ctx, resource))
    ?? (await handleOrders(ctx, resource))
    ?? (await handleFulfillment(ctx, resource))
    ?? (await handleMaintenance(ctx, resource));
}
