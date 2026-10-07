import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { verifyCloudflareAccess, createCsrfSession, verifyMutationRequest } from "../../../lib/admin/auth";
import { getAdminSession } from "../../../lib/admin/security";
import { adminError, adminJson } from "../../../lib/admin/http";
import type { AdminBindings } from "../../../lib/admin/types";
import { pathSegments, requireDb } from "../../../lib/admin/router/context";
import { handleSecurityRoute } from "../../../lib/admin/router/security-routes";
import { handleMediaRoutes } from "../../../lib/admin/router/media-routes";
import { handleContactRoutes } from "../../../lib/admin/router/contact-routes";
import { handleContentRoutes } from "../../../lib/admin/router/content-routes";
import { handleShopRoutes } from "../../../lib/admin/router/shop-routes";

export const prerender = false;

const bindings = env as AdminBindings;

const handleAdminRequest = async (
  { request, params }: Parameters<NonNullable<APIRoute>>[0],
  correlationId: string,
) => {
  const auth = await verifyCloudflareAccess(request, bindings);
  if (!auth.ok) return auth.response;
  const segments = pathSegments(params.path);
  if (!segments) return adminError("invalid_path", 400);
  const method = request.method.toUpperCase();
  // Correlation identifiers used by security audit rows are always created at
  // this trust boundary; callers cannot inject identifiers into the trail.
  const id = correlationId;

  if (method !== "GET" && method !== "HEAD") {
    const csrfError = verifyMutationRequest(request);
    if (csrfError) return csrfError;
  }

  if (segments[0] === "session" && (method === "GET" || method === "HEAD")) {
    const session = createCsrfSession();
    return adminJson({ ok: true, user: auth.user, csrfToken: session.token }, 200, { "set-cookie": session.cookie });
  }

  if (segments[0] === "security") {
    return handleSecurityRoute(request, segments, auth.user, bindings, id);
  }

  // Cloudflare Access identifies the operator; this opaque session proves the
  // second password factor before any CMS/contact/media data is read.
  let adminSession = null;
  try {
    const db = requireDb(bindings);
    adminSession = db ? await getAdminSession(db, bindings, request, auth.user) : null;
  } catch {
    return adminError("security_unavailable", 503);
  }
  if (!adminSession) return adminError("password_required", 401);

  const ctx = {
    request,
    segments,
    method,
    bindings,
    user: auth.user,
    session: adminSession,
    requestId: id,
  };

  if (segments[0] === "shop") return handleShopRoutes(ctx);
  if (segments[0] === "media" || segments[0] === "payment-proofs") return handleMediaRoutes(ctx);
  if (segments[0] === "contacts") return handleContactRoutes(ctx);
  return handleContentRoutes(ctx);
};

// Give every admin response a server-generated correlation id. Pass it as an
// internal function argument so a client header can never influence audits.
export const ALL: APIRoute = async (context) => {
  const id = crypto.randomUUID();
  const response = await handleAdminRequest(context, id);
  response.headers.set("x-request-id", id);
  return response;
};
