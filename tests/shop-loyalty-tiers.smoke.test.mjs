import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOYALTY_TIERS,
  resolveLoyaltyTier,
  calculateLoyaltyDiscount,
} from "../src/lib/shop/loyalty.ts";
import {
  normalizeTxHash,
  verifyOnChainTransaction,
} from "../src/lib/shop/crypto-verifier.ts";

test("resolveLoyaltyTier classifies customer spend into correct VIP tiers", () => {
  const standard = resolveLoyaltyTier(500_000);
  assert.equal(standard.tier.level, "standard");
  assert.equal(standard.tier.discountPercent, 0);
  assert.equal(standard.nextTier?.level, "silver");

  const silver = resolveLoyaltyTier(2_500_000);
  assert.equal(silver.tier.level, "silver");
  assert.equal(silver.tier.discountPercent, 3);
  assert.equal(silver.nextTier?.level, "gold");

  const gold = resolveLoyaltyTier(7_500_000);
  assert.equal(gold.tier.level, "gold");
  assert.equal(gold.tier.discountPercent, 5);
  assert.equal(gold.nextTier?.level, "diamond");

  const diamond = resolveLoyaltyTier(25_000_000);
  assert.equal(diamond.tier.level, "diamond");
  assert.equal(diamond.tier.discountPercent, 8);
  assert.equal(diamond.nextTier, null);
  assert.equal(diamond.progressPercent, 100);
});

test("calculateLoyaltyDiscount calculates exact discount amount", () => {
  const subtotal = 1_000_000;
  assert.equal(calculateLoyaltyDiscount(subtotal, "standard"), 0);
  assert.equal(calculateLoyaltyDiscount(subtotal, "silver"), 30_000);
  assert.equal(calculateLoyaltyDiscount(subtotal, "gold"), 50_000);
  assert.equal(calculateLoyaltyDiscount(subtotal, "diamond"), 80_000);
  assert.equal(calculateLoyaltyDiscount(0, "diamond"), 0);
});

// This test lives here for the loyalty tier helpers; the crypto verifier case
// rides along. It asserts the verifier FAILS CLOSED. An earlier version of
// `verifyOnChainTransaction` was a stub that returned `verified: true` for any
// well-formed hash, which would have let anyone settle an order with a made-up
// TXID. If this test ever needs `verified: true` again, a real RPC or explorer
// client must exist behind it first.
test("crypto on-chain verification fails closed until a real RPC client exists", async () => {
  const validEvmHash = "0x" + "a".repeat(64);
  assert.equal(normalizeTxHash(validEvmHash), validEvmHash);

  const wellFormed = await verifyOnChainTransaction({
    txHash: validEvmHash,
    network: "bsc",
    expectedRecipientAddress: "0x1234567890abcdef",
    expectedAmountUsdt: 15.5,
  });
  assert.equal(wellFormed.verified, false);
  assert.equal(wellFormed.error, "onchain_verification_not_implemented");
  assert.equal(wellFormed.actualAmount, undefined, "a failed verification must not report an amount");

  const tooShort = await verifyOnChainTransaction({
    txHash: "too-short",
    network: "tron",
    expectedRecipientAddress: "TRX123",
    expectedAmountUsdt: 10,
  });
  assert.equal(tooShort.verified, false);
  assert.equal(tooShort.error, "invalid_tx_hash");

  const badFormat = await verifyOnChainTransaction({
    txHash: "0x" + "z".repeat(64),
    network: "ethereum",
    expectedRecipientAddress: "0xabc",
    expectedAmountUsdt: 1,
  });
  assert.equal(badFormat.verified, false);
  assert.equal(badFormat.error, "malformed_tx_hash_format");
});
