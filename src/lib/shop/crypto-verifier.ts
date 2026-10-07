/**
 * On-chain cryptocurrency transaction verification.
 *
 * NOT IMPLEMENTED. This module previously contained a stub that unconditionally
 * returned `verified: true`, which would have let any well-formed hash settle an
 * order. It is now fail-closed: every path returns `verified: false` with an
 * explicit reason. Do not wire it into a settlement path until a real RPC or
 * explorer client is implemented behind it.
 *
 * Intended scope once implemented: Tron (TRC20), BNB Chain (BEP20), Polygon.
 */

export type CryptoNetwork = "tron" | "bsc" | "polygon" | "ethereum";

export type OnChainVerificationInput = {
  txHash: string;
  network: CryptoNetwork;
  expectedRecipientAddress: string;
  expectedAmountUsdt: number;
  expectedMemo?: string | null;
};

export type OnChainVerificationResult = {
  verified: boolean;
  blockNumber?: number;
  actualAmount?: number;
  confirmations?: number;
  error?: string;
};

/**
 * Normalizes TXID string (trims, removes leading/trailing spaces).
 */
export function normalizeTxHash(txHash: string): string {
  return txHash.trim().replace(/^0x/i, "0x").toLowerCase();
}

/**
 * Verify a transaction against a blockchain RPC or explorer endpoint.
 *
 * Always returns `verified: false` today. Callers MUST treat anything other than
 * `verified: true` as "not settled" and fall back to manual review.
 */
export async function verifyOnChainTransaction(
  input: OnChainVerificationInput,
): Promise<OnChainVerificationResult> {
  const hash = input.txHash.trim();
  if (!hash || hash.length < 10) {
    return { verified: false, error: "invalid_tx_hash" };
  }

  // Verification pattern for standard EVM / Tron hashes:
  // EVM: 64 hex characters (with optional 0x prefix) -> 64 or 66 chars
  // Tron: 64 hex characters
  const isHexHash = /^(0x)?[0-9a-fA-F]{64}$/.test(hash);
  if (!isHexHash) {
    return { verified: false, error: "malformed_tx_hash_format" };
  }

  // Fail closed. Reaching here means the hash is well-formed but no RPC or
  // explorer client exists yet to confirm it on-chain.
  return {
    verified: false,
    error: "onchain_verification_not_implemented",
  };
}
