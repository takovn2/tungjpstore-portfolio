import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasSufficientWalletBalance,
  calculateWalletMutation,
} from "../src/lib/shop/wallet.ts";
import {
  validateBroadcastPayload,
  chunkRecipients,
} from "../src/lib/shop/broadcast.ts";
import {
  resolveAssistantQuery,
} from "../src/lib/shop/assistant.ts";

test("wallet checks balance and computes credit/debit mutations correctly", () => {
  const wallet = {
    customerId: "cust-1",
    balanceVndMinor: 500_000,
    balanceUsdMinor: 20_00,
    updatedAt: new Date().toISOString(),
  };

  assert.equal(hasSufficientWalletBalance(wallet, 300_000, "VND"), true);
  assert.equal(hasSufficientWalletBalance(wallet, 600_000, "VND"), false);
  assert.equal(hasSufficientWalletBalance(wallet, 15_00, "USD"), true);
  assert.equal(hasSufficientWalletBalance(wallet, 25_00, "USD"), false);

  const debitOk = calculateWalletMutation(500_000, 200_000, "purchase");
  assert.equal(debitOk.success, true);
  assert.equal(debitOk.newBalanceMinor, 300_000);

  const debitFail = calculateWalletMutation(100_000, 200_000, "purchase");
  assert.equal(debitFail.success, false);
  assert.equal(debitFail.error, "insufficient_wallet_balance");

  const credit = calculateWalletMutation(500_000, 100_000, "deposit");
  assert.equal(credit.success, true);
  assert.equal(credit.newBalanceMinor, 600_000);
});

test("broadcast validator checks payload length and URL safety", () => {
  const valid = validateBroadcastPayload({
    messageText: "🔥 Flash sale 20% all keys today!",
    buttonText: "Shop Now",
    buttonUrl: "https://tung.codes/shop",
  });
  assert.equal(valid.ok, true);

  const empty = validateBroadcastPayload({ messageText: "" });
  assert.equal(empty.ok, false);

  const badUrl = validateBroadcastPayload({
    messageText: "Test message",
    buttonUrl: "javascript:alert(1)",
  });
  assert.equal(badUrl.ok, false);

  const recipients = Array.from({ length: 70 }, (_, i) => `chat-${i}`);
  const chunks = chunkRecipients(recipients, 25);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 25);
  assert.equal(chunks[1].length, 25);
  assert.equal(chunks[2].length, 20);
});

test("support assistant accurately matches intent to knowledge base", () => {
  const win = resolveAssistantQuery("Làm sao để kích hoạt key Windows 11?", "vi");
  assert.equal(win.topic, "windows_activation");
  assert.match(win.title, /Windows/);

  const gpt = resolveAssistantQuery("How to log into ChatGPT Plus?", "en");
  assert.equal(gpt.topic, "chatgpt_guide");
  assert.match(gpt.title, /ChatGPT/);

  const warranty = resolveAssistantQuery("Bảo hành key như thế nào nếu bị lỗi?", "vi");
  assert.equal(warranty.topic, "warranty_policy");

  const edu = resolveAssistantQuery("Đăng nhập mail sinh viên edu", "vi");
  assert.equal(edu.topic, "edu_mail_login");
});
