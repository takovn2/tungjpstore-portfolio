import { adminError, isResponse, readJsonBody } from "./http";

/**
 * Shared primitives for the D1-backed admin repositories. Every helper here
 * previously existed as two or three private copies; new code must import
 * from this module instead of re-deriving the behavior.
 */

/** Parse a stored JSON column as an object, falling back to an empty shape. */
export function safeJsonParse<T extends object>(value: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Escape LIKE wildcards; pair with `ESCAPE '\\'` in the SQL. */
export const escapeLike = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

export const encodeOpaqueCursor = (first: string, second: string) =>
  btoa(`${first}\t${second}`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

export function decodeOpaqueCursor(value: string): [first: string, second: string] | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = atob(normalized);
    const separator = decoded.indexOf("\t");
    if (separator <= 0) return null;
    const first = decoded.slice(0, separator);
    const second = decoded.slice(separator + 1);
    return first && second ? [first, second] : null;
  } catch {
    return null;
  }
}

/**
 * Read a JSON request body that must decode to a plain object. Returns the
 * parsed record or a ready-to-return error response, replacing the repeated
 * read-body/object-shape/version ritual at every mutation route.
 */
export async function readJsonObject(
  request: Request,
  limit: number,
  invalid: { code: string; status?: number } = { code: "validation_failed" },
): Promise<Record<string, unknown> | Response> {
  const payload = await readJsonBody(request, limit);
  if (isResponse(payload)) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return adminError(invalid.code, invalid.status ?? 422);
  }
  return payload as Record<string, unknown>;
}

/**
 * D1 has no interactive transactions; the guard-table idiom emulates them by
 * inserting a token whose `valid` flag is computed from the state predicate,
 * then deleting it inside the same batch. A CHECK constraint fails the whole
 * batch when the state moved. Build the insert here so every repository shares
 * one implementation.
 */
export function guardStatement(db: D1Database, table: "transaction_guards" | "contact_crm_guards", token: string, predicateSql: string, ...predicateBindings: unknown[]) {
  return db.prepare(`INSERT INTO ${table} (token, valid)
    SELECT ?, CASE WHEN EXISTS (${predicateSql}) THEN 1 ELSE 0 END`)
    .bind(token, ...predicateBindings);
}

/** True when a D1 batch failed on a guard CHECK or a uniqueness violation. */
export function isGuardConflict(error: unknown, guardTable?: string): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("CHECK constraint failed: valid = 1")) return true;
  if (error.message.includes("UNIQUE constraint failed")) return true;
  return guardTable ? error.message.includes(`${guardTable}.valid`) : false;
}
