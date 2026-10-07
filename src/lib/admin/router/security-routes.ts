import { adminError, adminJson, isResponse, readJsonBody } from "../http";
import { adminSecurityError, changeAdminPassword, clearAdminSessionCookie, createAdminLoginChallenge, getAdminSession, loginAdminPassword, logoutAdminSession, revokeAdminSessions, securityStatus, setupAdminPassword } from "../security";
import type { AdminBindings, AdminUser } from "../types";
import { requireDb } from "./context";

const SECURITY_ACTIONS = new Set(["status", "setup", "challenge", "login", "logout", "change", "revoke"]);

function logSecurityFailure(action: string, stage: string, id: string, error: unknown) {
  const errorName = error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
    ? error.name
    : "UnknownError";
  console.error(JSON.stringify({
    event: "admin_security_failed",
    requestId: id,
    action: SECURITY_ACTIONS.has(action) ? action : "unknown",
    stage: /^[a-z_]{1,32}$/.test(stage) ? stage : "unknown",
    errorName,
  }));
}

export async function handleSecurityRoute(request: Request, segments: string[], authUser: AdminUser, bindings: AdminBindings, id: string): Promise<Response> {
  const action = segments[1] ?? "unknown";
  let stage = "route";
  try {
    const db = requireDb(bindings);
    const method = request.method.toUpperCase();
    if (segments.length !== 2 || !action) return adminError("not_found", 404);

    if (method === "GET" && action === "status") {
      stage = "status";
      return adminJson({ ok: true, security: await securityStatus(db, bindings, authUser, request) });
    }
    if (method !== "POST") return adminError("method_not_allowed", 405);
    stage = "read_body";
    const payload = await readJsonBody(request, 32_000);
    if (isResponse(payload)) return payload;
    const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};

    if (action === "setup") {
      stage = "setup";
      const result = await setupAdminPassword(db, bindings, authUser, body.password, id);
      return result.ok ? adminJson({ ok: true, passwordSetAt: result.passwordSetAt }) : adminSecurityError(result);
    }
    if (action === "challenge") {
      stage = "challenge";
      const result = await createAdminLoginChallenge(db, bindings, request, authUser, body.action, id);
      if (!result.ok) {
        const response = adminSecurityError(result);
        if (result.retryAfter) response.headers.set("retry-after", String(result.retryAfter));
        return response;
      }
      return adminJson({ ok: true, challenge: result.challenge });
    }
    if (action === "login") {
      stage = "login";
      const result = await loginAdminPassword(db, bindings, request, authUser, body.challenge, id);
      if (!result.ok) {
        const response = adminSecurityError(result);
        if (result.retryAfter) response.headers.set("retry-after", String(result.retryAfter));
        return response;
      }
      return adminJson({ ok: true, authenticated: true, expiresAt: result.session?.expiresAt }, 200, { "set-cookie": result.session?.cookie ?? "" });
    }
    stage = "session";
    const session = db ? await getAdminSession(db, bindings, request, authUser) : null;
    if (action === "logout") {
      stage = "logout";
      await logoutAdminSession(db, session, authUser, id);
      return adminJson({ ok: true, authenticated: false }, 200, { "set-cookie": clearAdminSessionCookie() });
    }
    if (!session) return adminError("password_required", 401);
    if (action === "revoke") {
      stage = "revoke";
      await revokeAdminSessions(db, authUser, id);
      return adminJson({ ok: true, authenticated: false }, 200, { "set-cookie": clearAdminSessionCookie() });
    }
    if (action === "change") {
      stage = "change";
      const result = await changeAdminPassword(db, bindings, authUser, body.currentPassword, body.newPassword, id);
      if (!result.ok) return adminSecurityError(result);
      return adminJson({ ok: true, passwordChangedAt: result.passwordSetAt }, 200, { "set-cookie": clearAdminSessionCookie() });
    }
    return adminError("not_found", 404);
  } catch (error) {
    logSecurityFailure(action, stage, id, error);
    return adminError("security_unavailable", 503);
  }
}
