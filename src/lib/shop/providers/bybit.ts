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

type BybitBindings = {
  BYBIT_API_KEY?: string;
  BYBIT_API_SECRET?: string;
  BYBIT_API_BASE_URL?: string;
};

type BybitEnvelope<T> = {
  retCode?: number;
  retMsg?: string;
  result?: T;
};

type BybitRecord = Record<string, unknown>;

const RECV_WINDOW = "5000";

async function signedGet<T>(bindings: BybitBindings, path: string, params: Record<string, string | number | null | undefined>) {
  const apiKey = bindings.BYBIT_API_KEY?.trim();
  const secret = bindings.BYBIT_API_SECRET?.trim();
  if (!apiKey || !secret) throw new Error("bybit_api_not_configured");
  const timestamp = String(Date.now());
  const query = queryString(params);
  const signature = await hmacSha256Hex(secret, `${timestamp}${apiKey}${RECV_WINDOW}${query}`);
  const url = `${safeBaseUrl(bindings.BYBIT_API_BASE_URL, "https://api.bybit.com")}${path}${query ? `?${query}` : ""}`;
  const payload = await providerJson<BybitEnvelope<T>>("bybit", url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      accept: "application/json",
    },
  });
  if (payload.retCode !== 0) throw new Error(`bybit_${payload.retCode ?? "error"}`);
  return payload.result;
}

function matchesChain(record: BybitRecord, method: ShopCryptoPaymentMethod) {
  if (!method.network) return true;
  const expected = normalizeNetwork(method.network);
  const chain = normalizeNetwork(asString(record.chain));
  return Boolean(chain) && chain === expected;
}

function destinationFromRecord(record: BybitRecord, method: ShopCryptoPaymentMethod) {
  if (method.destinationType === "uid") {
    // Bybit internal-deposit records expose the sender UID and an email/phone
    // address, but not the recipient UID. The API key is scoped to the
    // receiving account, so use the configured UID as the destination snapshot
    // when the provider omits it.
    return asString(record.toMemberId) || asString(record.toUid) || asString(record.toUserId)
      || asString(record.toAccountId) || (method.rail === "internal_uid" ? method.destinationValue : "");
  }
  return asString(record.toAddress) || asString(record.address);
}

function mapDeposit(record: BybitRecord, method: ShopCryptoPaymentMethod, index: number): CryptoProviderEvidence | null {
  const amountAtomic = normalizeAtomic(record.amount);
  if (!amountAtomic) return null;
  const txId = asString(record.txID) || asString(record.id) || null;
  const statusValue = asString(record.status).toLowerCase();
  const statusCode = asNumber(record.status);
  const status: CryptoProviderEvidence["status"] = statusCode === 1 || statusCode === 2 || /success|completed|credited/.test(statusValue)
    ? "success"
    : statusCode === 0 || /pending|processing|confirm/.test(statusValue)
      ? "pending"
      : "failed";
  const occurredAt = new Date(asNumber(record.successAt) || asNumber(record.updatedTime) || asNumber(record.createTime) || Date.now()).toISOString();
  const raw = { ...record, _index: index };
  return {
    provider: "bybit",
    rail: method.rail,
    providerEventId: txId || `${method.id}:${occurredAt}:${index}`,
    transactionReference: txId,
    asset: method.asset,
    network: asString(record.chain) || null,
    amountAtomic,
    destination: destinationFromRecord(record, method),
    sender: asString(record.fromAddress) || asString(record.fromMemberId) || null,
    status,
    confirmations: parseConfirmations(record.confirmations),
    occurredAt,
    raw,
    rawEvidenceHash: "",
  };
}

async function withHashes(records: CryptoProviderEvidence[]) {
  return Promise.all(records.map(async (record) => ({ ...record, rawEvidenceHash: await evidenceHash(record.raw) })));
}

export async function listBybitCryptoEvidence(bindings: BybitBindings, query: CryptoProviderQuery): Promise<CryptoProviderEvidence[]> {
  const baseParams = {
    coin: query.method.asset,
    startTime: query.startTimeMs,
    endTime: query.endTimeMs,
    limit: 50,
  };
  if (query.method.rail === "internal_uid") {
    const result = await signedGet<{ rows?: BybitRecord[] }>(bindings, "/v5/asset/deposit/query-internal-record", baseParams);
    const rows = result?.rows ?? [];
    return withHashes(rows.map((row, index) => mapDeposit(row, query.method, index)).filter((row): row is CryptoProviderEvidence => Boolean(row)));
  }
  if (query.method.rail === "onchain_deposit") {
    const result = await signedGet<{ rows?: BybitRecord[] }>(bindings, "/v5/asset/deposit/query-record", baseParams);
    const rows = result?.rows ?? [];
    return withHashes(rows.filter((row) => matchesChain(row, query.method)).map((row, index) => mapDeposit(row, query.method, index)).filter((row): row is CryptoProviderEvidence => Boolean(row)));
  }
  // Bybit Pay merchant order verification has a separate onboarding/API
  // surface. Keep the rail explicit and fail closed until configured there.
  return [];
}
