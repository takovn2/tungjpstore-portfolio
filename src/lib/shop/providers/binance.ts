import type { ShopCryptoPaymentMethod } from "../types";
import {
  asNumber,
  asString,
  evidenceHash,
  hmacSha256Hex,
  normalizeAtomic,
  normalizeNetwork,
  parseConfirmations,
  providerJson,
  queryString,
  safeBaseUrl,
  type CryptoProviderEvidence,
  type CryptoProviderQuery,
} from "./crypto";

type BinanceBindings = {
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  BINANCE_API_BASE_URL?: string;
};

type BinanceDeposit = Record<string, unknown>;

function matchesNetwork(record: BinanceDeposit, method: ShopCryptoPaymentMethod) {
  if (!method.network) return true;
  const expected = normalizeNetwork(method.network);
  const actual = normalizeNetwork(asString(record.network));
  return Boolean(actual) && actual === expected;
}

async function signedGet<T>(bindings: BinanceBindings, path: string, params: Record<string, string | number | null | undefined>) {
  const apiKey = bindings.BINANCE_API_KEY?.trim();
  const secret = bindings.BINANCE_API_SECRET?.trim();
  if (!apiKey || !secret) throw new Error("binance_api_not_configured");
  const query = queryString({ ...params, timestamp: Date.now(), recvWindow: 5_000 });
  const signature = await hmacSha256Hex(secret, query);
  const url = `${safeBaseUrl(bindings.BINANCE_API_BASE_URL, "https://api.binance.com")}${path}?${query}&signature=${signature}`;
  return providerJson<T>("binance", url, { headers: { "X-MBX-APIKEY": apiKey, accept: "application/json" } });
}

function mapDeposit(record: BinanceDeposit, method: ShopCryptoPaymentMethod, index: number): CryptoProviderEvidence | null {
  const amountAtomic = normalizeAtomic(record.amount);
  if (!amountAtomic) return null;
  const txId = asString(record.txId) || asString(record.id) || null;
  const statusCode = asNumber(record.status);
  const statusValue = asString(record.status).toLowerCase();
  const status: CryptoProviderEvidence["status"] = statusCode === 1 || statusCode === 6 || /success|completed|credited/.test(statusValue)
    ? "success"
    : statusCode === 0 || /pending|processing/.test(statusValue)
      ? "pending"
      : "failed";
  const occurredAt = new Date(asNumber(record.insertTime) || asNumber(record.completeTime) || Date.now()).toISOString();
  const raw = { ...record, _index: index };
  return {
    provider: "binance",
    rail: method.rail,
    providerEventId: txId || `${method.id}:${occurredAt}:${index}`,
    transactionReference: txId,
    asset: method.asset,
    network: asString(record.network) || method.network || null,
    amountAtomic,
    destination: asString(record.address) || method.destinationValue,
    sender: null,
    status,
    confirmations: parseConfirmations(record.confirmTimes),
    occurredAt,
    raw,
    rawEvidenceHash: "",
  };
}

export async function listBinanceCryptoEvidence(bindings: BinanceBindings, query: CryptoProviderQuery): Promise<CryptoProviderEvidence[]> {
  // Binance's standard exchange API exposes wallet deposit history. Binance
  // Pay/internal-user transfers require a separate merchant product and are
  // intentionally reported as review-only until those credentials exist.
  if (query.method.rail !== "onchain_deposit") return [];
  const records = await signedGet<BinanceDeposit[]>(bindings, "/sapi/v1/capital/deposit/hisrec", {
    coin: query.method.asset,
    startTime: query.startTimeMs,
    endTime: query.endTimeMs,
    ...(query.transactionReference ? { txId: query.transactionReference } : {}),
  });
  const filtered = records.filter((record) => matchesNetwork(record, query.method));
  return Promise.all(filtered.map((record, index) => mapDeposit(record, query.method, index)).filter((row): row is CryptoProviderEvidence => Boolean(row)).map(async (row) => ({ ...row, rawEvidenceHash: await evidenceHash(row.raw) })));
}
