/**
 * Single admin API client. `api()` handles authenticated calls with CSRF;
 * `securityRequest()` is the pre-auth variant for session/security endpoints.
 */

export type ApiError = Error & { code?: string; issues?: Array<string | { path?: string; code?: string }> };

const security = {
  csrf: "",
  authenticated: false,
  accessSub: "",
  accessEmail: "",
};

export function setCsrfToken(token: string) {
  security.csrf = token;
}

export function setAuthenticated(authenticated: boolean) {
  security.authenticated = authenticated;
}

export function setAccessIdentity(sub: string, email: string) {
  security.accessSub = sub;
  security.accessEmail = email;
}

export function getAccessIdentity() {
  return { accessSub: security.accessSub, accessEmail: security.accessEmail };
}

export function apiErrorMessage(data: { code?: string; issues?: unknown } | null, httpStatus: number, labels: Record<string, string>) {
  const heading = labels[data?.code ?? ""] || data?.code || `HTTP ${httpStatus}`;
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  if (issues.length === 0) return heading;
  return `${heading}\n${issues.map((issue) => `- ${typeof issue === "string" ? issue : `${(issue as { path?: string }).path || "$"}: ${(issue as { code?: string }).code || "invalid"}`}`).join("\n")}`;
}

async function request(path: string, options: RequestInit & { method?: string } = {}, requireAuth = true) {
  if (requireAuth && !path.startsWith("security/") && path !== "session" && !security.authenticated) {
    throw new Error("Phiên quản trị chưa được xác minh.");
  }
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) headers.set("x-csrf-token", security.csrf);
  const response = await fetch(`/admin/api/${path}`, { ...options, method, headers, credentials: "same-origin" });
  let data: Record<string, unknown> | null = null;
  try {
    data = await response.json() as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(apiErrorMessage(data, response.status, apiErrorLabels)) as ApiError;
    error.code = String(data?.code || `http_${response.status}`);
    error.issues = Array.isArray(data?.issues) ? data.issues as ApiError["issues"] : [];
    throw error;
  }
  return data ?? {};
}

export async function api<T = Record<string, unknown>>(path: string, options: RequestInit & { method?: string } = {}): Promise<T> {
  return request(path, options, true) as Promise<T>;
}

export async function securityRequest<T = Record<string, unknown>>(path: string, options: RequestInit & { method?: string } = {}): Promise<T> {
  return request(path, options, false) as Promise<T>;
}

export function shopApi<T = Record<string, unknown>>(path: string, options: RequestInit & { method?: string } = {}): Promise<T> {
  return api<T>(`shop/${path}`, options);
}

import { apiErrorLabels } from "../lib/labels";
