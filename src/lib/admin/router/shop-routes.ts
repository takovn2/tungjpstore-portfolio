import { adminError } from "../http";
import type { AdminRouteContext } from "./context";
import { handleCatalogRoutes } from "./shop/catalog";
import { handleIntegrationRoutes } from "./shop/integrations";
import { handleOpsRoutes } from "./shop/ops";
import { handlePaymentRoutes } from "./shop/payments";
import { shopFailure } from "./shop/shared";

/**
 * Shop sub-router. Each domain module owns its resources and returns null
 * when the path belongs to another module; failures funnel through the
 * shop-layer error translator.
 */
export async function handleShopRoutes(ctx: AdminRouteContext): Promise<Response> {
  const resource = ctx.segments[1] ?? "overview";
  try {
    const response = (await handleOpsRoutes(ctx, resource))
      ?? (await handleCatalogRoutes(ctx, resource))
      ?? (await handlePaymentRoutes(ctx, resource))
      ?? (await handleIntegrationRoutes(ctx, resource));
    return response ?? adminError("not_found", 404);
  } catch (error) {
    return shopFailure(error, ctx.requestId);
  }
}
