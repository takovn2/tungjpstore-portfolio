import type { AdminBindings, AdminUser } from "../types";
import { parseExpectedVersion } from "../validation";

/**
 * Shared request context passed to every admin route module. The HTTP entry
 * owns Access verification, CSRF and the password session; modules only see
 * the already-authenticated context.
 */

export type AdminSessionSnapshot = { createdAt?: string } | null;

export type AdminRouteContext = {
  request: Request;
  segments: string[];
  method: string;
  bindings: AdminBindings;
  user: AdminUser;
  session: AdminSessionSnapshot;
  requestId: string;
};

export function pathSegments(rawPath: string | undefined): string[] | null {
  try {
    return (rawPath ?? "").split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

export function requireDb(bindings: AdminBindings): D1Database | null {
  return bindings.CONTENT_DB ?? null;
}

/** Pull expectedVersion out of a mutation payload shape shared by routes. */
export function parseActionVersion(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return parseExpectedVersion((value as Record<string, unknown>).expectedVersion);
}
