import { sha256Base64Url } from "../crypto";
import type { ShopCryptoAsset, ShopCryptoPaymentMethod, ShopCryptoRail, ShopCryptoProvider } from "../types";

export type CryptoProviderSecretBindings = {
  BYBIT_API_KEY?: string;
  BYBIT_API_SECRET?: string;
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
};

export function isCryptoProviderConfigured(bindings: CryptoProviderSecretBindings, provider: ShopCryptoProvider) {
  const apiKey = provider === "bybit" ? bindings.BYBIT_API_KEY : bindings.BINANCE_API_KEY;
  const apiSecret = provider === "bybit" ? bindings.BYBIT_API_SECRET : bindings.BINANCE_API_SECRET;
  return typeof apiKey === "string" && apiKey.trim().length >= 8
    && typeof apiSecret === "string" && apiSecret.trim().length >= 16;
}

export type CryptoProviderEvidence = {
  provider: ShopCryptoProvider;
  rail: ShopCryptoRail;
  providerEventId: string;
  transactionReference: string | null;
  asset: ShopCryptoAsset;
  network: string | null;
  amountAtomic: string;
  destination: string;
  sender: string | null;
  status: "pending" | "success" | "failed";
  confirmations: number | null;
  occurredAt: string;
  raw: unknown;
  rawEvidenceHash: string;
};

export type CryptoProviderQuery = {
  method: ShopCryptoPaymentMethod;
  transactionReference?: string | null;
  startTimeMs: number;
  endTimeMs: number;
};

export class CryptoProviderError extends Error {
  readonly provider: ShopCryptoProvider;
  readonly status: number;
  readonly retryable: boolean;

  constructor(provider: ShopCryptoProvider, message: string, status = 502, retryable = true) {
    super(message);
    this.name = "CryptoProviderError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNetwork(value: string | null | undefined) {
  const cleaned = asString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["TRC20", "TRON", "TRX"].includes(cleaned)) return "TRON";
  if (["ERC20", "ETH", "ETHEREUM"].includes(cleaned)) return "ETHEREUM";
  if (["BEP20", "BSC"].includes(cleaned)) return "BSC";
  if (["MATIC", "POLYGON"].includes(cleaned)) return "POLYGON";
  if (["SOL", "SOLANA"].includes(cleaned)) return "SOLANA";
  return cleaned;
}

export function normalizeAtomic(value: unknown) {
  const raw = asString(value).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  // Do not truncate a non-zero seventh decimal into an exact six-decimal match.
  if (fraction.length > 6 && /[1-9]/.test(fraction.slice(6))) return null;
  const digits = `${whole}${fraction.padEnd(6, "0").slice(0, 6)}`.replace(/^0+(?=\d)/, "");
  return digits || "0";
}

export function parseConfirmations(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = asString(value);
  const match = raw.match(/^(\d+)(?:\s*\/\s*\d+)?$/);
  return match ? Number(match[1]) : null;
}

export async function evidenceHash(raw: unknown) {
  return sha256Base64Url(JSON.stringify(raw));
}

export function queryString(params: Record<string, string | number | undefined | null>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeBaseUrl(value: string | undefined, fallback: string) {
  try {
    const url = new URL(value?.trim() || fallback);
    if (url.protocol !== "https:") throw new Error("https_required");
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export async function providerJson<T>(provider: ShopCryptoProvider, url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(8_000) });
  } catch (error) {
    throw new CryptoProviderError(provider, error instanceof Error ? error.message : "provider_unreachable");
  }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new CryptoProviderError(provider, `http_${response.status}`, response.status, response.status === 429 || response.status >= 500);
  if (!payload || typeof payload !== "object") throw new CryptoProviderError(provider, "invalid_provider_response", 502, true);
  return payload as T;
}
