import {
  computeInventoryKeyFingerprint,
  createShopCryptoContext,
  deriveShopCheckoutSubjectHash,
  deriveShopOrderAccessToken,
  hashIdempotencyKey,
  isShopOrderTokenSecretConfigured,
  openInventoryKey,
  randomOpaqueToken,
  requireShopCrypto,
  sealInventoryKey,
  sha256Base64Url,
  ShopCryptoConfigurationError,
  ShopCryptoIntegrityError,
} from "./crypto";
import {
  claimFulfillmentAllocation,
  cleanupExpiredIdempotencyKeys,
  createCheckoutOrder,
  createInventoryImportPreview,
  createPaymentAttempt,
  createCryptoPaymentMethod,
  commitInventoryImportChunk,
  expirePaymentAttempts,
  getInventoryImportBatch,
  getOrderByAccessToken,
  getCryptoPaymentMethod,
  listCryptoPaymentMethods,
  listFulfilledFulfillmentAllocations,
  markFulfillmentFailed,
  markFulfillmentDelivered,
  quarantineFulfillmentAllocation,
  recordPayOsPaymentAttention,
  reconcilePaymentConfirmation,
  releaseFulfillmentLease,
  releaseExpiredReservations,
  consumeCheckoutRateLimit,
  assertImportVariant,
  auditStatement,
  getPublicVariantStock,
  previewCheckoutQuote,
  ShopConflictError,
  type CheckoutQuotePreview,
} from "./repository";
import { listPaymentProofs } from "./payment-proofs";
import { parseTelegramPrivateChatId, persistTelegramOrderRecipient } from "./telegram-outbox";
import {
  buildEmvCoQrImageUrl,
  buildVietQrImageUrl,
  classifyPayOsSettlement,
  createPayOsPaymentLink,
  getPayOsCheckoutQr,
  getPayOsPaymentLink,
  isAllowedPaymentQrImageUrl,
  normalizePayOsTransferDescription,
  payOsReconciliationDeadline,
  PAYOS_TRANSFER_DESCRIPTION_MAX,
  PayOsRequestError,
  validatePayOsCheckoutQrUrl,
  type PayOsPaymentLinkData,
} from "./payos";
import type {
  CheckoutPaymentView,
  CheckoutResult,
  CreateCheckoutInput,
  FulfillmentDelivery,
  InventoryImportChunkInput,
  InventoryImportChunkResult,
  InventoryImportInput,
  InventoryImportPreviewInput,
  InventoryImportPreviewResult,
  PaymentAttemptInput,
  PublicShopOrderState,
  PublicShopOrderStatus,
  PublicShopDeliveryResult,
  PublicShopDeliveryItem,
  ShopActor,
  ShopBindings,
  ShopCheckoutReadiness,
  ShopLocale,
  ShopOrderStatus,
  ShopPaymentStatus,
  ShopCryptoPaymentMethodInput,
  ShopCryptoPaymentView,
  ShopCryptoAttemptStatus,
} from "./types";
import { isTelegramSyntheticEmail, normalizeCurrency } from "./validation";
import { applyWalletPayment, walletTopupDescription, walletTopupOrderCode } from "./wallet";

export { ShopConflictError } from "./repository";
export { ShopCryptoConfigurationError } from "./crypto";
export type { CheckoutQuotePreview } from "./repository";

function requireDb(bindings: Pick<ShopBindings, "CONTENT_DB">) {
  if (!bindings.CONTENT_DB) throw new Error("shop_database_not_configured");
  return bindings.CONTENT_DB;
}

function cryptoAmountAtomic(amountMinor: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new ShopConflictError("crypto_amount_invalid");
  // USD is stored in cents; USDT/USDC provider APIs are normalized to six
  // decimals, so 1 cent becomes 10,000 atomic units.
  return String(amountMinor * 10_000);
}

function cryptoAmountDisplay(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export function cryptoQrUrl(publicConfig: unknown) {
  if (typeof publicConfig === "string") {
    try { publicConfig = JSON.parse(publicConfig) as unknown; } catch { return null; }
  }
  if (!publicConfig || typeof publicConfig !== "object" || Array.isArray(publicConfig)) return null;
  const value = (publicConfig as Record<string, unknown>).qrUrl;
  return typeof value === "string" && /^\/payment-qr\/[A-Za-z0-9._/-]+\.png$/.test(value) ? value : null;
}

export function cryptoAccountUid(publicConfig: unknown) {
  if (typeof publicConfig === "string") {
    try { publicConfig = JSON.parse(publicConfig) as unknown; } catch { return null; }
  }
  if (!publicConfig || typeof publicConfig !== "object" || Array.isArray(publicConfig)) return null;
  const value = (publicConfig as Record<string, unknown>).accountUid;
  return typeof value === "string" && /^\d{3,32}$/.test(value.trim()) ? value.trim() : null;
}

export async function listPublicCryptoPaymentMethods(bindings: Pick<ShopBindings, "CONTENT_DB">) {
  // GLB is the only storefront allowed to expose crypto methods. Keep the
  // scope explicit so a stale/default repository argument cannot hide the
  // configured methods or leak legacy PayOS data into the Mini App.
  return listCryptoPaymentMethods(requireDb(bindings), true, "glb");
}

export async function createCryptoPaymentMethodConfig(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: ShopCryptoPaymentMethodInput,
  actor: ShopActor | string,
  requestId: string,
) {
  return createCryptoPaymentMethod(requireDb(bindings), input, actor, requestId);
}

export async function getCryptoPaymentMethodConfig(bindings: Pick<ShopBindings, "CONTENT_DB">, id: string, publicOnly = false) {
  return getCryptoPaymentMethod(requireDb(bindings), id, publicOnly);
}

export async function createCryptoPayment(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: { orderId: string; paymentMethodId?: string; expiresAt: string },
  actor: ShopActor | string,
  requestId: string,
): Promise<ShopCryptoPaymentView> {
  const db = requireDb(bindings);
  const order = await db.prepare(`SELECT order_number AS orderNumber, order_reference AS orderReference,
      currency, total_minor AS totalMinor, status, payment_status AS paymentStatus
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{
      orderNumber: string; orderReference: string; currency: string; totalMinor: number;
      status: string; paymentStatus: string;
    }>();
  if (!order) throw new Error("crypto_order_not_found");
  if (normalizeCurrency(order.currency) !== "USD") throw new ShopConflictError("crypto_currency_usd_required");
  if (order.status === "cancelled" || order.status === "expired" || order.paymentStatus === "paid") throw new ShopConflictError("order_not_payable");
  const method = input.paymentMethodId
    ? await getCryptoPaymentMethod(db, input.paymentMethodId, true, "glb")
    : (await listCryptoPaymentMethods(db, true, "glb"))[0] ?? null;
  if (!method) throw new Error("crypto_payment_method_not_configured");
  type CryptoAttemptRow = {
    id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit"; asset: "USDT" | "USDC";
    network: string; amountAtomic: string; amountMinor: number; destination: string; memoOrTag: string;
    status: ShopCryptoAttemptStatus; expiresAt: string; transactionReference: string | null;
  };
  const existing = await db.prepare(`SELECT id, provider, rail, asset, network,
      expected_amount_atomic AS amountAtomic, expected_amount_minor AS amountMinor,
      destination_snapshot AS destination, memo_or_tag_snapshot AS memoOrTag,
      status, expires_at AS expiresAt, transaction_reference AS transactionReference
    FROM shop_crypto_payment_attempts WHERE order_id = ?
      AND status IN ('created', 'awaiting_payment', 'detected', 'needs_review')
    ORDER BY created_at DESC LIMIT 1`).bind(input.orderId).first<CryptoAttemptRow>();
  if (existing) {
    return {
      orderId: input.orderId,
      orderNumber: order.orderNumber,
      orderReference: order.orderReference,
      state: existing.status === "detected" ? "detected" : existing.status === "needs_review" ? "under_review" : "awaiting_payment",
      verificationStatus: existing.status,
      paymentAttemptId: existing.id,
      method: "crypto_transfer",
      provider: existing.provider,
      rail: existing.rail,
      asset: existing.asset,
      network: existing.network,
      destinationType: method.destinationType,
      destination: existing.destination,
      memoOrTag: existing.memoOrTag,
      amountMinor: existing.amountMinor,
      amountAtomic: existing.amountAtomic,
      amountDisplay: cryptoAmountDisplay(existing.amountMinor),
      currency: "USD",
      expiresAt: existing.expiresAt,
      pollingAfterSeconds: 20,
      qrUrl: method.destinationType === "uid" ? null : cryptoQrUrl(method.publicConfig),
      accountUid: method.destinationType === "uid" ? cryptoAccountUid(method.publicConfig) : null,
    };
  }
  const amountAtomic = cryptoAmountAtomic(order.totalMinor);
  const now = new Date();
  const requestedExpiry = Date.parse(input.expiresAt);
  const methodExpiry = now.getTime() + method.expiryMinutes * 60_000;
  const expiresAt = new Date(Math.min(Number.isFinite(requestedExpiry) ? requestedExpiry : methodExpiry, methodExpiry)).toISOString();
  const id = crypto.randomUUID();
  const actorLabel = typeof actor === "string" ? actor : `${actor.channel}:${actor.id}`;
  try {
    await db.batch([
      db.prepare(`INSERT INTO shop_crypto_payment_attempts
        (id, order_id, payment_method_id, provider, rail, asset, network, expected_amount_atomic,
         expected_amount_minor, destination_snapshot, memo_or_tag_snapshot, status, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?)`)
        .bind(id, input.orderId, method.id, method.provider, method.rail, method.asset, method.network, amountAtomic,
          order.totalMinor, method.destinationValue, method.memoOrTag, expiresAt, now.toISOString(), now.toISOString()),
      db.prepare(`UPDATE shop_orders SET payment_status = 'pending', updated_at = ? WHERE id = ? AND payment_status = 'unpaid'`)
        .bind(now.toISOString(), input.orderId),
      db.prepare(`INSERT INTO shop_crypto_payment_events
        (id, payment_attempt_id, order_id, provider, rail, provider_event_id, asset, network, amount_atomic,
         destination, status, match_state, evidence_hash, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'detected', ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, input.orderId, method.provider, method.rail, `intent:${id}`, method.asset, method.network,
          amountAtomic, method.destinationValue, await sha256Base64Url(`intent:${id}`), now.toISOString(), now.toISOString()),
      auditStatement(db, actor, "shop.crypto_payment.created", "shop_order", input.orderId, requestId, { paymentAttemptId: id, provider: method.provider, rail: method.rail, asset: method.asset, actor: actorLabel }),
    ]);
  } catch (error) {
    if (isCryptoConflict(error)) {
      const replay = await db.prepare(`SELECT id, provider, rail, asset, network,
          expected_amount_atomic AS amountAtomic, expected_amount_minor AS amountMinor,
          destination_snapshot AS destination, memo_or_tag_snapshot AS memoOrTag,
          status, transaction_reference AS transactionReference, expires_at AS expiresAt
        FROM shop_crypto_payment_attempts WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`).bind(input.orderId).first<CryptoAttemptRow>();
      if (replay) return {
        orderId: input.orderId, orderNumber: order.orderNumber, orderReference: order.orderReference,
        state: replay.status === "detected" ? "detected" : replay.status === "needs_review" ? "under_review" : "awaiting_payment",
        verificationStatus: replay.status, paymentAttemptId: replay.id, method: "crypto_transfer",
        provider: replay.provider, rail: replay.rail, asset: replay.asset, network: replay.network,
        destinationType: method.destinationType, destination: replay.destination, memoOrTag: replay.memoOrTag,
        amountMinor: replay.amountMinor, amountAtomic: replay.amountAtomic, amountDisplay: cryptoAmountDisplay(replay.amountMinor),
        currency: "USD", expiresAt: replay.expiresAt, pollingAfterSeconds: 20,
        qrUrl: method.destinationType === "uid" ? null : cryptoQrUrl(method.publicConfig),
        accountUid: method.destinationType === "uid" ? cryptoAccountUid(method.publicConfig) : null,
      };
    }
    throw error;
  }
  return {
    orderId: input.orderId,
    orderNumber: order.orderNumber,
    orderReference: order.orderReference,
    state: "awaiting_payment",
    verificationStatus: "awaiting_payment",
    paymentAttemptId: id,
    method: "crypto_transfer",
    provider: method.provider,
    rail: method.rail,
    asset: method.asset,
    network: method.network,
    destinationType: method.destinationType,
    destination: method.destinationValue,
    memoOrTag: method.memoOrTag,
    amountMinor: order.totalMinor,
    amountAtomic,
    amountDisplay: cryptoAmountDisplay(order.totalMinor),
    currency: "USD",
    expiresAt,
    pollingAfterSeconds: 20,
    qrUrl: method.destinationType === "uid" ? null : cryptoQrUrl(method.publicConfig),
    accountUid: method.destinationType === "uid" ? cryptoAccountUid(method.publicConfig) : null,
  };
}

function isCryptoConflict(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed|FOREIGN KEY constraint failed|CHECK constraint failed/.test(error.message);
}

// QR/link recovery is an external side effect. Fence concurrent public order
// refreshes so one missing payment snapshot cannot fan out to payOS.
const PAYMENT_RECOVERY_BACKOFF_SECONDS = 15;

async function claimPaymentRecovery(db: D1Database, attemptId: string, claimedAt: string) {
  const result = await db.prepare(`UPDATE shop_payment_attempts
      SET payment_recovery_claimed_at = ?
      WHERE id = ? AND status IN ('created', 'awaiting_payment')
        AND (qr_image_url IS NULL OR checkout_url IS NULL OR provider_reference IS NULL
          OR provider_bank_bin IS NULL OR provider_account_number IS NULL)
        AND (payment_recovery_claimed_at IS NULL
          OR unixepoch(payment_recovery_claimed_at) <= unixepoch(?) - ?)`)
    .bind(claimedAt, attemptId, claimedAt, PAYMENT_RECOVERY_BACKOFF_SECONDS)
    .run();
  return result.meta.changes === 1;
}

type VietQrProviderRow = {
  id: string;
  bank_id: string;
  account_ref: string;
  account_name_display: string;
  qr_template: string;
  confirmation_adapter: "payos";
};

async function resolveVietQrProviderConfig(db: D1Database) {
  return db.prepare(`SELECT id, bank_id, account_ref, account_name_display, qr_template, confirmation_adapter
    FROM shop_payment_provider_configs
    WHERE provider = 'vietqr'
      AND status = 'active'
      AND account_ref = 'VIETQR_BANK_ACCOUNT'
      AND confirmation_adapter = 'payos'
      AND secret_ref = 'PAYOS_CHECKSUM_KEY'
    ORDER BY updated_at DESC, id LIMIT 1`).first<VietQrProviderRow>();
}

export async function createWalletTopup(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN">,
  input: { customerId: string; amountMinor: number },
) {
  const db = requireDb(bindings);
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 10_000 || input.amountMinor > 50_000_000) {
    throw new ShopConflictError("wallet_topup_amount_invalid");
  }
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim() ?? "";
  if (!/^[0-9]{4,32}$/.test(account)) throw new Error("vietqr_bank_account_not_configured");
  const provider = await resolveVietQrProviderConfig(db);
  if (!provider) throw new Error("vietqr_config_not_found");
  const id = crypto.randomUUID();
  const providerOrderCode = walletTopupOrderCode(id);
  const providerDescription = walletTopupDescription(id);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  await db.prepare(`INSERT INTO shop_wallet_topups
    (id, customer_id, provider, provider_order_code, provider_description, amount_minor, currency, status, expires_at, created_at, updated_at)
    VALUES (?, ?, 'payos', ?, ?, ?, 'VND', 'created', ?, ?, ?)`).bind(
    id, input.customerId, providerOrderCode, providerDescription, input.amountMinor, expiresAt, now, now,
  ).run();
  try {
    const origin = new URL(bindings.SHOP_PUBLIC_ORIGIN?.trim() || "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("shop_public_origin_invalid");
    const accountPath = new URL(`/shop/account?wallet_topup=${encodeURIComponent(id)}`, origin).toString();
    const payment = await createPayOsPaymentLink({
      credentials: payOsCredentials(bindings),
      orderCode: providerOrderCode,
      amount: input.amountMinor,
      description: providerDescription,
      cancelUrl: accountPath,
      returnUrl: accountPath,
      expiredAt: Math.floor(Date.parse(expiresAt) / 1_000),
    });
    assertPayOsPaymentMatches({
      payment,
      attempt: {
        id,
        order_id: id,
        confirmation_provider: "payos",
        status: "created",
        amount_minor: input.amountMinor,
        currency: "VND",
        order_reference: providerDescription,
        provider_reference: null,
        provider_order_code: providerOrderCode,
        provider_description: providerDescription,
        checkout_url: null,
        qr_image_url: null,
        provider_bank_bin: null,
        provider_account_number: null,
        expires_at: expiresAt,
      },
    });
    const qrImageUrl = resolveCustomerQrImageUrl({
      qrUrl: null,
      amountMinor: input.amountMinor,
      description: providerDescription,
      bankBin: payment.bin,
      accountNumber: payment.accountNumber,
      template: provider.qr_template,
      accountName: payment.accountName || provider.account_name_display,
      emvPayload: payment.qrCode,
    });
    if (!qrImageUrl) throw new Error("vietqr_generation_failed");
    await db.prepare(`UPDATE shop_wallet_topups SET provider_reference = ?, qr_image_url = ?, checkout_url = ?, status = 'awaiting_payment', updated_at = ? WHERE id = ? AND status = 'created'`)
      .bind(payment.paymentLinkId, qrImageUrl, payment.checkoutUrl, new Date().toISOString(), id).run();
    return {
      id, amountMinor: input.amountMinor, currency: "VND" as const, status: "awaiting_payment" as const,
      providerDescription, providerReference: payment.paymentLinkId, qrImageUrl, checkoutUrl: payment.checkoutUrl, expiresAt,
    };
  } catch (error) {
    await db.prepare("UPDATE shop_wallet_topups SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'created'").bind(new Date().toISOString(), id).run().catch(() => undefined);
    throw error;
  }
}

export async function listPublicVariantStock(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  variantIds: string[],
  locale: ShopLocale = "en",
) {
  return getPublicVariantStock(requireDb(bindings), variantIds, locale);
}

export async function previewPublicCheckoutQuote(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_ORDER_TOKEN_SECRET">,
  input: {
    items: Array<{ variantId: string; quantity: number }>;
    locale?: ShopLocale;
    discountCode?: string;
    customerEmail?: string | null;
    pricingCurrency?: "VND" | "USD";
  },
  clientAddress?: string | null,
): Promise<CheckoutQuotePreview> {
  const db = requireDb(bindings);
  const identityDigest = await sha256Base64Url(
    `discount-quote\0${input.customerEmail?.trim().toLowerCase() || "guest"}\0${clientAddress?.trim() || "unknown-client"}`,
  );
  const subjectHash = await deriveShopCheckoutSubjectHash(
    bindings.SHOP_ORDER_TOKEN_SECRET,
    `discount-quote:${identityDigest}`,
  );
  const rate = await consumeCheckoutRateLimit(db, subjectHash);
  if (!rate.allowed) throw new ShopConflictError("discount_quote_rate_limited");
  const isUsd = input.pricingCurrency === "USD" || (input.pricingCurrency !== "VND" && input.locale !== "vi");
  return previewCheckoutQuote(db, {
    ...input,
    pricingCurrency: isUsd ? "USD" : "VND",
  });
}

export async function getShopCheckoutReadiness(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN" | "SHOP_ORDER_TOKEN_SECRET">,
): Promise<ShopCheckoutReadiness> {
  if (!bindings.CONTENT_DB) return { ready: false, code: "shop_database_not_configured" };
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim();
  if (!account || !/^[0-9]{4,32}$/.test(account)) return { ready: false, code: "vietqr_bank_account_not_configured" };
  const config = await resolveVietQrProviderConfig(bindings.CONTENT_DB);
  if (!config) return { ready: false, code: "vietqr_config_not_found" };
  if (![bindings.PAYOS_CLIENT_ID, bindings.PAYOS_API_KEY].every((value) => typeof value === "string" && value.trim().length >= 16)
    || typeof bindings.PAYOS_CHECKSUM_KEY !== "string" || bindings.PAYOS_CHECKSUM_KEY.trim().length < 32) return { ready: false, code: "payos_not_configured" };
  try {
    const origin = new URL(bindings.SHOP_PUBLIC_ORIGIN?.trim() || "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) return { ready: false, code: "shop_public_origin_invalid" };
  } catch {
    return { ready: false, code: "shop_public_origin_invalid" };
  }
  if (!isShopOrderTokenSecretConfigured(bindings.SHOP_ORDER_TOKEN_SECRET)) {
    return { ready: false, code: "shop_order_token_not_configured" };
  }
  return { ready: true };
}

export async function previewInventoryImport(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: InventoryImportPreviewInput,
  actor: ShopActor | string,
  requestId: string,
): Promise<InventoryImportPreviewResult> {
  const db = requireDb(bindings);
  const context = await requireShopCrypto(bindings);
  return createInventoryImportPreview(db, context, input, actor, requestId);
}

export async function commitInventoryImport(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: InventoryImportChunkInput,
  actor: ShopActor | string,
  requestId: string,
): Promise<InventoryImportChunkResult> {
  const db = requireDb(bindings);
  const context = await requireShopCrypto(bindings);
  const batch = await getInventoryImportBatch(db, input.batchId);
  if (!batch) throw new ShopConflictError("inventory_import_not_found");
  await assertImportVariant(db, batch.variantId);
  const units = await Promise.all(input.rows.map(async (row) => {
    const id = crypto.randomUUID();
    const unit = await sealInventoryKey(context, {
      inventoryUnitId: id,
      variantId: batch.variantId,
      plaintextKey: row.key,
    });
    return { lineNumber: row.lineNumber, unit };
  }));
  return commitInventoryImportChunk(db, input, units, actor, requestId);
}

export async function importInventoryKeys(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: InventoryImportInput,
  actor: ShopActor | string,
  requestId: string,
) {
  const preview = await previewInventoryImport(bindings, {
    variantId: input.variantId,
    rows: input.keys,
    sourceFormat: "json",
    sourceName: "legacy-json-import",
    idempotencyKey: `legacy:${requestId}`,
  }, actor, requestId);
  if (preview.invalidCount || preview.duplicateInFileCount || preview.duplicateInStockCount || preview.chunkCount !== 1) {
    throw new ShopConflictError("inventory_import_conflict");
  }
  const committed = await commitInventoryImport(bindings, {
    batchId: preview.batchId,
    chunkIndex: 0,
    rows: input.keys.map((key, index) => ({ lineNumber: index + 1, key })),
  }, actor, requestId);
  return { count: committed.importedCount, variantId: committed.variantId, batchId: committed.batchId };
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBase32(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => BASE32[byte % 32]).join("");
}

function randomLocalPart(prefix: string, index: number) {
  const salt = randomBase32(6).toLowerCase();
  return `${prefix}+${salt}${String(index).padStart(3, "0")}`;
}

/** Synthetic mail|pass|2fa lines for storefront inventory testing only. */
export function buildTestInventoryKey(
  productSlug: string,
  index: number,
  options: { emailDomain?: string } = {},
): string {
  const slug = productSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "item";
  const domainRaw = (options.emailDomain ?? "seed.tungjpstore.local").trim().toLowerCase();
  const domain = /^[a-z0-9.-]{3,80}$/.test(domainRaw) ? domainRaw : "seed.tungjpstore.local";
  const n = String(index).padStart(3, "0");
  const salt = randomBase32(6).toLowerCase();
  // ChatGPT merchant paste shape: chatgpt.plus.<salt>.<nnn>@domain|ChatGPT_plus_nnn_<tok>!|2fa
  if (slug === "chatgpt-plus" || slug.startsWith("chatgpt")) {
    const email = `chatgpt.plus.${salt}.${n}@${domain}`;
    const password = `ChatGPT_plus_${n}_${randomBase32(6)}!`;
    const totp = randomBase32(16);
    return `${email}|${password}|${totp}`;
  }
  if (slug === "campus-mail") {
    const email = `mail${n}@${domain}`;
    const password = `Seed_campus_${n}_${randomBase32(6)}!`;
    const totp = randomBase32(16);
    return `${email}|${password}|${totp}`;
  }
  const email = `${randomLocalPart(slug, index)}@${domain}`;
  const password = `Seed_${slug}_${n}_${randomBase32(4)}!`;
  const totp = randomBase32(16);
  // Match merchant paste shape: email|password|2fa_secret
  return `${email}|${password}|${totp}`;
}

/**
 * Seed encrypted test inventory for active tracked license-key variants.
 * Intended for ops smoke tests; keys are synthetic and not real accounts.
 * By default only variants with zero inventory units are filled so existing stock is left alone.
 */
export async function seedTestInventoryKeys(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  options: {
    keysPerVariant?: number;
    requestId?: string;
    onlyEmpty?: boolean;
    /** When set, only these product slugs receive synthetic keys. */
    productSlugs?: string[];
    /** Email domain for synthetic keys (default seed.tungjpstore.local). */
    emailDomain?: string;
  } = {},
) {
  // Align with inventory preview row cap (500).
  const keysPerVariant = Math.max(1, Math.min(500, Math.floor(options.keysPerVariant ?? 100)));
  const onlyEmpty = options.onlyEmpty !== false;
  const emailDomain = options.emailDomain;
  const productSlugs = Array.from(
    new Set(
      (options.productSlugs ?? [])
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug)),
    ),
  ).slice(0, 20);
  const requestId = options.requestId ?? crypto.randomUUID();
  const actor = { id: "ops:seed-test-inventory", channel: "api" as const };
  const db = requireDb(bindings);
  await requireShopCrypto(bindings);

  const slugFilterSql = productSlugs.length
    ? `AND p.slug IN (${productSlugs.map(() => "?").join(", ")})`
    : "";
  const variants = await db.prepare(`SELECT v.id AS variantId, p.slug AS productSlug, v.sku, v.option_values_json AS optionValuesJson
    FROM shop_variants v
    JOIN shop_products p ON p.id = v.product_id
    WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
      AND v.status = 'active' AND p.status = 'active'
      AND v.fulfillment_type = 'license_key' AND v.inventory_policy = 'tracked'
      AND (
        ? = 0 OR NOT EXISTS (
          SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id
        )
      )
      ${slugFilterSql}
    ORDER BY p.slug, v.sku`).bind(onlyEmpty ? 1 : 0, ...productSlugs).all<{ variantId: string; productSlug: string; sku: string; optionValuesJson: string | null }>();

  const results: Array<{
    variantId: string;
    productSlug: string;
    sku: string;
    requested: number;
    imported: number;
    batchId: string | null;
    skipped: number;
    error?: string;
  }> = [];

  for (const variant of variants.results) {
    let variantDomain = emailDomain;
    try {
      const options = JSON.parse(variant.optionValuesJson || "{}") as { domain?: unknown };
      if (typeof options.domain === "string" && /^[a-z0-9.-]{3,80}$/.test(options.domain.trim().toLowerCase())) {
        variantDomain = options.domain.trim().toLowerCase();
      }
    } catch {
      // keep caller/default domain
    }
    const rows = Array.from({ length: keysPerVariant }, (_, index) =>
      buildTestInventoryKey(variant.productSlug, index + 1, { emailDomain: variantDomain }),
    );
    try {
      const preview = await previewInventoryImport(bindings, {
        variantId: variant.variantId,
        rows,
        sourceFormat: "txt",
        sourceName: `seed-test:${variant.productSlug}:${requestId}`,
        idempotencyKey: `seed-test:${variant.variantId}:${requestId}:${keysPerVariant}`,
      }, actor, `${requestId}:${variant.variantId}:preview`);

      if (!preview.validRows) {
        results.push({
          variantId: variant.variantId,
          productSlug: variant.productSlug,
          sku: variant.sku,
          requested: keysPerVariant,
          imported: 0,
          batchId: preview.batchId,
          skipped: preview.duplicateInFileCount + preview.duplicateInStockCount + preview.invalidCount,
          error: "preview_had_no_valid_rows",
        });
        continue;
      }

      // Chunks are partitioned by candidate (valid) row order, 25 per chunk.
      const validRows = (preview.rows ?? [])
        .filter((row) => row.status === "valid")
        .map((row) => ({ lineNumber: row.lineNumber, key: rows[row.lineNumber - 1] }))
        .filter((row) => Boolean(row.key));

      let imported = 0;
      for (let chunkIndex = 0; chunkIndex < preview.chunkCount; chunkIndex += 1) {
        const commitRows = validRows.slice(chunkIndex * 25, chunkIndex * 25 + 25);
        if (!commitRows.length) continue;
        const committed = await commitInventoryImport(bindings, {
          batchId: preview.batchId,
          chunkIndex,
          rows: commitRows,
        }, actor, `${requestId}:${variant.variantId}:chunk:${chunkIndex}`);
        imported += committed.importedCount;
      }

      results.push({
        variantId: variant.variantId,
        productSlug: variant.productSlug,
        sku: variant.sku,
        requested: keysPerVariant,
        imported,
        batchId: preview.batchId,
        skipped: preview.duplicateInFileCount + preview.duplicateInStockCount + preview.invalidCount,
      });
    } catch (error) {
      results.push({
        variantId: variant.variantId,
        productSlug: variant.productSlug,
        sku: variant.sku,
        requested: keysPerVariant,
        imported: 0,
        batchId: null,
        skipped: 0,
        error: error instanceof Error ? error.message : "seed_failed",
      });
    }
  }

  return {
    keysPerVariant,
    variantCount: variants.results.length,
    importedTotal: results.reduce((sum, row) => sum + row.imported, 0),
    results,
  };
}

export async function createShopCheckout(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  input: CreateCheckoutInput,
  idempotencyKey: string,
  actor: ShopActor | string,
  requestId: string,
): Promise<CheckoutResult> {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("idempotency_key_required");
  return createCheckoutOrder(requireDb(bindings), input, idempotencyKey, actor, requestId);
}

/**
 * payOS payment identity for one order.
 * - orderCode: payOS numeric order code
 * - description: bank transfer content / VietQR addInfo (max 9 chars per payOS)
 *
 * Never reuse shop order_reference (TUNG…) here — it exceeds the Napas/payOS
 * description limit and must not appear as transfer content.
 */
async function derivePayOsIdentifiers(orderId: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tung-shop:payos:${orderId}`)));
  let numeric = 0n;
  for (const byte of digest.slice(0, 7)) numeric = (numeric << 8n) | BigInt(byte);
  const orderCode = Number(100_000_000_000_000n + numeric % 800_000_000_000_000n);
  let descriptionValue = 0n;
  for (const byte of digest.slice(7, 13)) descriptionValue = (descriptionValue << 8n) | BigInt(byte);
  // Exactly PAYOS_TRANSFER_DESCRIPTION_MAX chars: T + 8 base36 digits.
  const description = normalizePayOsTransferDescription(
    `T${descriptionValue.toString(36).toUpperCase().padStart(8, "0").slice(-8)}`,
  );
  if (description.length < 4 || description.length > PAYOS_TRANSFER_DESCRIPTION_MAX) {
    throw new Error("payos_description_invalid");
  }
  return { orderCode, description };
}

function publicShopOrderUrl(originValue: string, result: "success" | "cancelled") {
  const origin = new URL(originValue);
  const url = new URL("/shop/order", origin);
  url.searchParams.set("payment", result);
  return url.toString();
}

type LivePaymentAttemptRow = {
  id: string;
  order_id: string;
  confirmation_provider: "payos" | "casso" | "generic_signed" | "manual";
  status: "created" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "cancelled";
  amount_minor: number;
  currency: string;
  order_reference: string;
  provider_reference: string | null;
  provider_order_code: number | null;
  provider_description: string | null;
  checkout_url: string | null;
  qr_image_url: string | null;
  provider_bank_bin: string | null;
  provider_account_number: string | null;
  expires_at: string;
};

function payOsCredentials(bindings: Pick<ShopBindings, "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY">) {
  return { clientId: bindings.PAYOS_CLIENT_ID, apiKey: bindings.PAYOS_API_KEY, checksumKey: bindings.PAYOS_CHECKSUM_KEY };
}

function assertPayOsPaymentMatches(input: {
  payment: PayOsPaymentLinkData;
  attempt: LivePaymentAttemptRow;
}) {
  const expectedDescription = normalizePayOsTransferDescription(input.attempt.provider_description ?? "");
  const paymentDescription = normalizePayOsTransferDescription(input.payment.description);
  // Trust the signed payOS destination (bin + account). Virtual accounts may
  // surface a channel BIN that differs from the merchant config bank_id.
  if (input.payment.orderCode !== input.attempt.provider_order_code
    || input.payment.amount !== input.attempt.amount_minor
    || input.payment.currency !== "VND"
    || !expectedDescription
    || paymentDescription !== expectedDescription) {
    throw new Error("payos_payment_mismatch");
  }
}

/**
 * Prefer a validated VietQR image URL. Fall back to rebuilding from the stored
 * payOS destination, then to an EMVCo image host when only the payload exists.
 */
function resolveCustomerQrImageUrl(input: {
  qrUrl: string | null | undefined;
  amountMinor: number;
  description: string | null | undefined;
  bankBin?: string | null;
  accountNumber?: string | null;
  template?: string | null;
  accountName?: string | null;
  emvPayload?: string | null;
}): string | null {
  const description = normalizePayOsTransferDescription(input.description ?? "");
  if (!description || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return null;

  if (input.qrUrl) {
    try {
      return validatePayOsCheckoutQrUrl({
        qrUrl: input.qrUrl,
        expectedBin: input.bankBin,
        expectedAmount: input.amountMinor,
        expectedDescription: description,
        expectedAccountNumber: input.accountNumber,
      }).qrUrl;
    } catch {
      // Fall through to rebuild / EMVCo.
    }
    // Display-only EMVCo image URLs are not VietQR-shaped; keep if CSP-safe.
    if (isAllowedPaymentQrImageUrl(input.qrUrl) && !input.qrUrl.includes("img.vietqr.io")) {
      return input.qrUrl;
    }
  }

  const bin = input.bankBin?.trim() ?? "";
  const accountNumber = input.accountNumber?.trim() ?? "";
  if (/^[0-9]{4,12}$/.test(bin) && /^[A-Za-z0-9]{4,32}$/.test(accountNumber)) {
    try {
      return buildVietQrImageUrl({
        bin,
        accountNumber,
        amount: input.amountMinor,
        description,
        ...(input.accountName ? { accountName: input.accountName } : {}),
        ...(input.template ? { template: input.template } : {}),
      });
    } catch {
      // Continue to EMVCo fallback.
    }
  }

  const emv = input.emvPayload?.trim() ?? "";
  if (emv) {
    try {
      return buildEmvCoQrImageUrl(emv);
    } catch {
      return null;
    }
  }
  return null;
}

export async function createVietQrPayment(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN">,
  input: PaymentAttemptInput,
  actor: ShopActor | string,
  requestId: string,
): Promise<CheckoutPaymentView> {
  const db = requireDb(bindings);
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim();
  if (!account || !/^[0-9]{4,32}$/.test(account)) throw new Error("vietqr_bank_account_not_configured");
  const config = await db.prepare(`SELECT bank_id, account_ref, account_name_display, qr_template, confirmation_adapter FROM shop_payment_provider_configs
    WHERE id = ?
      AND provider = 'vietqr'
      AND status = 'active'
      AND account_ref = 'VIETQR_BANK_ACCOUNT'
      AND confirmation_adapter = 'payos'
      AND secret_ref = 'PAYOS_CHECKSUM_KEY'
    LIMIT 1`).bind(input.providerConfigId).first<VietQrProviderRow>();
  if (!config) throw new Error("vietqr_config_not_found");
  const order = await db.prepare("SELECT order_number, currency FROM shop_orders WHERE id = ? LIMIT 1")
    .bind(input.orderId).first<{ order_number: string; currency: string }>();
  if (!order) throw new Error("vietqr_order_not_found");
  if (normalizeCurrency(order.currency) !== "VND") throw new Error("vietqr_currency_not_supported");
  let attempt = await db.prepare(`SELECT id, order_id, confirmation_provider, status, amount_minor, currency, order_reference,
      provider_reference, provider_order_code, provider_description, checkout_url, qr_image_url,
      provider_bank_bin, provider_account_number, expires_at
    FROM shop_payment_attempts
    WHERE order_id = ?
      AND provider_config_id = ?
      AND confirmation_provider = 'payos'
      AND status IN ('created', 'awaiting_payment')
    ORDER BY created_at DESC LIMIT 1`).bind(input.orderId, input.providerConfigId).first<LivePaymentAttemptRow>();
  if (!attempt) {
    const identifiers = await derivePayOsIdentifiers(input.orderId);
    const created = await createPaymentAttempt(db, {
      ...input,
      providerOrderCode: identifiers.orderCode,
      providerDescription: identifiers.description,
      qrPayloadHash: null,
    }, actor, requestId);
    attempt = {
      id: created.id,
      order_id: created.orderId,
      confirmation_provider: created.confirmationProvider,
      status: created.status,
      amount_minor: created.amountMinor,
      currency: created.currency,
      order_reference: created.orderReference,
      provider_reference: created.providerReference,
      provider_order_code: created.providerOrderCode,
      provider_description: created.providerDescription,
      checkout_url: created.checkoutUrl,
      qr_image_url: created.qrImageUrl,
      provider_bank_bin: null,
      provider_account_number: null,
      expires_at: created.expiresAt,
    };
  }

  let checkoutUrl = attempt.checkout_url;
  if (!attempt.provider_order_code || !attempt.provider_description) throw new Error("payos_payment_identity_missing");
  const transferDescription = normalizePayOsTransferDescription(attempt.provider_description);
  if (!transferDescription) throw new Error("payos_payment_identity_missing");

  let providerBankBin = attempt.provider_bank_bin;
  let providerAccountNumber = attempt.provider_account_number;
  let qrUrl = resolveCustomerQrImageUrl({
    qrUrl: attempt.qr_image_url,
    amountMinor: attempt.amount_minor,
    description: transferDescription,
    bankBin: providerBankBin,
    accountNumber: providerAccountNumber,
    template: config.qr_template,
    accountName: config.account_name_display,
  });

  if (!qrUrl || !checkoutUrl || !attempt.provider_reference) {
    const origin = bindings.SHOP_PUBLIC_ORIGIN?.trim() ?? "";
    let payment: PayOsPaymentLinkData | null = null;
    let paymentLinkId = attempt.provider_reference ?? "";
    try {
      // Transfer content = provider_description only (≤9 chars). Never order_reference.
      payment = await createPayOsPaymentLink({
        credentials: payOsCredentials(bindings),
        orderCode: attempt.provider_order_code,
        amount: attempt.amount_minor,
        description: transferDescription,
        cancelUrl: publicShopOrderUrl(origin, "cancelled"),
        returnUrl: publicShopOrderUrl(origin, "success"),
        expiredAt: Math.floor(Date.parse(attempt.expires_at) / 1_000),
      });
      assertPayOsPaymentMatches({ payment, attempt });
      paymentLinkId = payment.paymentLinkId;
      checkoutUrl = payment.checkoutUrl;
      providerBankBin = payment.bin;
      providerAccountNumber = payment.accountNumber;
      // Signed payOS response may contain a per-link virtual account.
      qrUrl = resolveCustomerQrImageUrl({
        qrUrl: null,
        amountMinor: payment.amount,
        description: transferDescription,
        bankBin: payment.bin,
        accountNumber: payment.accountNumber,
        template: config.qr_template,
        accountName: payment.accountName || config.account_name_display,
        emvPayload: payment.qrCode,
      });
      if (!qrUrl) throw new Error("vietqr_generation_failed");
    } catch (createError) {
      // payos_payment_mismatch is a local invariant error; still try remote recovery
      // when the link may already exist on payOS (retry / lost response).
      const canRecover = createError instanceof PayOsRequestError
        || (createError instanceof Error && createError.message === "payos_payment_mismatch");
      if (!canRecover) throw createError;
      const recovered = await getPayOsPaymentLink(payOsCredentials(bindings), attempt.provider_order_code).catch(() => null);
      if (!recovered || recovered.orderCode !== attempt.provider_order_code || recovered.amount !== attempt.amount_minor || !["PENDING", "PROCESSING", "UNDERPAID"].includes(recovered.status)) {
        throw createError instanceof PayOsRequestError ? createError : new PayOsRequestError("payos_payment_recovery_failed", 502);
      }
      paymentLinkId = recovered.id;
      checkoutUrl = `https://pay.payos.vn/web/${encodeURIComponent(recovered.id)}`;
      // Prefer rebuilding from already-known destination before scraping HTML.
      qrUrl = resolveCustomerQrImageUrl({
        qrUrl: attempt.qr_image_url,
        amountMinor: attempt.amount_minor,
        description: transferDescription,
        bankBin: providerBankBin,
        accountNumber: providerAccountNumber,
        template: config.qr_template,
        accountName: config.account_name_display,
      });
      if (!qrUrl || !providerBankBin || !providerAccountNumber) {
        const recoveredQr = await getPayOsCheckoutQr({
          paymentLinkId: recovered.id,
          // Prefer the known virtual destination; otherwise accept amount+addInfo match.
          expectedBin: providerBankBin || null,
          expectedAmount: attempt.amount_minor,
          expectedDescription: transferDescription,
          expectedAccountNumber: providerAccountNumber || null,
        });
        qrUrl = recoveredQr.qrUrl;
        providerBankBin = recoveredQr.bin;
        providerAccountNumber = recoveredQr.accountNumber;
      }
    }
    if (!qrUrl || !checkoutUrl || !paymentLinkId) throw new Error("vietqr_generation_failed");
    const qrPayloadHash = await sha256Base64Url(`${qrUrl}\n${checkoutUrl}`);
    const updatedAt = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE shop_payment_attempts SET provider_reference = ?, checkout_url = ?, qr_image_url = ?, qr_payload_hash = ?,
        provider_bank_bin = ?, provider_account_number = ?,
        status = 'awaiting_payment', updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')`)
        .bind(paymentLinkId, checkoutUrl, qrUrl, qrPayloadHash, providerBankBin, providerAccountNumber, updatedAt, attempt.id),
      db.prepare("UPDATE shop_payment_events SET payload_hash = ? WHERE provider = 'vietqr' AND provider_event_id = ?").bind(qrPayloadHash, `qr:${attempt.id}`),
    ]);
  }
  if (!qrUrl) throw new Error("vietqr_generation_failed");
  return {
    orderId: attempt.order_id,
    orderNumber: order.order_number,
    orderReference: attempt.order_reference,
    state: "awaiting_payment",
    paymentAttemptId: attempt.id,
    method: "bank_transfer_qr",
    provider: "vietqr",
    qrUrl,
    paymentDescription: transferDescription,
    ...(checkoutUrl ? { checkoutUrl } : {}),
    amountMinor: attempt.amount_minor,
    currency: normalizeCurrency(attempt.currency),
    expiresAt: attempt.expires_at,
    pollingAfterSeconds: 8,
  };
}

export async function createPublicShopCheckout(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "SHOP_ORDER_TOKEN_SECRET" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: CreateCheckoutInput,
  idempotencyKey: string,
  requestId: string,
  clientAddress?: string | null,
  marketCode?: string,
) {
  if ((input.sourceChannel ?? "web") !== "web" || isTelegramSyntheticEmail(input.customer.email)) {
    throw new ShopConflictError("checkout_identity_reserved");
  }
  // Snapshotted onto the order so its price can be audited against the market
  // that produced it, long after the rate row has moved on.
  const marketScopedInput: CreateCheckoutInput = marketCode ? { ...input, marketCode } : input;
  const db = requireDb(bindings);
  const cryptoMethods = await listCryptoPaymentMethods(db, true, "glb").catch(() => []);
  const cryptoMethodMap = new Map(cryptoMethods.map((m) => [m.id, m]));
  const isWallet = input.paymentMethodId === "wallet";
  const isSelectedCrypto = !isWallet && Boolean(input.paymentMethodId && cryptoMethodMap.has(input.paymentMethodId));
  const shouldDefaultToCrypto = !isWallet && !input.paymentMethodId && input.locale !== "vi" && cryptoMethods.length > 0;
  const useCrypto = Boolean(isSelectedCrypto || shouldDefaultToCrypto);

  const selectedCryptoMethodId = isSelectedCrypto
    ? input.paymentMethodId!
    : (cryptoMethods[0]?.id ?? null);

  if (!useCrypto && !isWallet) {
    const readiness = await getShopCheckoutReadiness(bindings);
    if (!readiness.ready) throw new Error(readiness.code);
    const provider = await resolveVietQrProviderConfig(db);
    if (!provider) throw new Error("vietqr_config_not_found");
  }

  const subject = clientAddress?.trim() || "unknown-client";
  const checkoutSubjectHash = await deriveShopCheckoutSubjectHash(bindings.SHOP_ORDER_TOKEN_SECRET, subject);
  const idempotencyHash = await hashIdempotencyKey("checkout:web", idempotencyKey);
  const existingIdempotency = await db.prepare("SELECT 1 AS found FROM shop_idempotency_keys WHERE namespace = 'checkout:web' AND key_hash = ? AND expires_at > ? LIMIT 1").bind(idempotencyHash, new Date().toISOString()).first<{ found: number }>();
  if (!existingIdempotency) {
    const rate = await consumeCheckoutRateLimit(db, checkoutSubjectHash);
    if (!rate.allowed) throw new ShopConflictError("checkout_rate_limited");
  }
  const accessToken = await deriveShopOrderAccessToken(bindings.SHOP_ORDER_TOKEN_SECRET, "checkout:web", idempotencyKey);

  const checkoutInput: CreateCheckoutInput = useCrypto
    ? {
      ...marketScopedInput,
      pricingCurrency: "USD",
      ...(selectedCryptoMethodId ? { paymentMethodId: selectedCryptoMethodId } : {}),
    }
    : isWallet
      ? {
        ...marketScopedInput,
        pricingCurrency: input.locale === "vi" ? "VND" : "USD",
      }
      : {
      ...marketScopedInput,
      pricingCurrency: "VND",
    };

  const order = await createCheckoutOrder(db, checkoutInput, idempotencyKey, { id: "storefront", channel: "web" }, requestId, accessToken, checkoutSubjectHash);
  try {
    const { logAttributionEvent, recordCommissionAccrual } = await import("./platform/service");
    const { parseAttributionReference } = await import("./platform/attribution");
    const parsed = parseAttributionReference(input.externalReference ?? null);
    await logAttributionEvent(db, {
      eventType: "checkout",
      channel: "web",
      refCode: parsed.ref ?? null,
      discountCode: parsed.discountCode ?? input.discountCode ?? null,
      productSlug: parsed.lastProductSlug ?? null,
      orderId: order.orderId,
      payload: { source: "web_checkout" },
    });
    await recordCommissionAccrual(db, {
      orderId: order.orderId,
      externalReference: input.externalReference,
      orderTotalMinor: order.totalMinor,
      currency: order.currency,
      sourceChannel: "web",
    });
  } catch { /* attribution/commission must never block checkout */ }
  if (!order.orderAccessToken) return { order, payment: null, paymentConfiguration: "ready" as const };

  if (isWallet) {
    try {
      const orderCurrency = normalizeCurrency(order.currency);
      if (orderCurrency !== "VND" && orderCurrency !== "USD") {
        throw new ShopConflictError("wallet_currency_not_supported");
      }
      const isUsd = orderCurrency === "USD";
      const customer = await db.prepare("SELECT id FROM shop_customers WHERE email_normalized = ?").bind(input.customer.email.trim().toLowerCase()).first<{ id: string }>();
      if (!customer) throw new ShopConflictError("customer_wallet_not_found");
      await applyWalletPayment(db, {
        orderId: order.orderId,
        customerId: customer.id,
        amountMinor: order.totalMinor,
        currency: isUsd ? "USD" : "VND",
        actor: "storefront",
      });

      await deliverPaidOrderKeys(bindings, { id: order.orderId, order_number: order.orderNumber, status: "processing", payment_status: "paid", fulfillment_status: "unfulfilled", fulfilled_at: null }, "web").catch(() => null);
      return { order: { ...order, status: "fulfilled", paymentStatus: "paid" }, payment: null, paymentConfiguration: "ready" as const };
    } catch (error) {
      await db.batch([
        db.prepare("UPDATE shop_orders SET status = 'cancelled', payment_status = 'failed', cancelled_at = ?, updated_at = ? WHERE id = ? AND payment_status IN ('unpaid', 'pending')").bind(new Date().toISOString(), new Date().toISOString(), order.orderId),
        db.prepare("UPDATE shop_inventory_reservations SET status = 'released', updated_at = ? WHERE order_id = ? AND status = 'active'").bind(new Date().toISOString(), order.orderId),
      ]).catch(() => undefined);
      if (error instanceof ShopConflictError) throw error;
      if (error instanceof Error && error.message === "insufficient_wallet_balance") throw new ShopConflictError("insufficient_wallet_balance");
      throw new ShopConflictError("wallet_payment_failed");
    }
  }

  if (useCrypto && selectedCryptoMethodId) {
    try {
      const payment = await createCryptoPayment(bindings, { orderId: order.orderId, paymentMethodId: selectedCryptoMethodId, expiresAt: order.expiresAt }, { id: "storefront", channel: "web" }, requestId);
      return { order, payment, paymentConfiguration: "ready" as const };
    } catch (error) {
      console.error(JSON.stringify({
        event: "public_crypto_checkout_payment_failed",
        requestId,
        orderId: order.orderId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorCode: error instanceof Error ? error.message : "unknown",
      }));
      return { order, payment: null, paymentConfiguration: "unavailable" as const };
    }
  }

  try {
    const provider = await resolveVietQrProviderConfig(db);
    if (!provider) throw new Error("vietqr_config_not_found");
    const payment = await createVietQrPayment(bindings, { orderId: order.orderId, providerConfigId: provider.id, expiresAt: order.expiresAt }, { id: "storefront", channel: "web" }, requestId);
    return { order, payment, paymentConfiguration: "ready" as const };
  } catch (error) {
    // The caller still receives the one-time order token. Losing it after the
    // order write would make the reservation inaccessible to the customer.
    console.error(JSON.stringify({
      event: "public_checkout_payment_failed",
      requestId,
      orderId: order.orderId,
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode: error instanceof Error ? error.message : "unknown",
    }));
    return { order, payment: null, paymentConfiguration: "unavailable" as const };
  }
}

/**
 * Checkout entry point for the Telegram VPS service account.
 *
 * It shares the catalog, payment and fulfillment invariants with storefront
 * checkout but uses a separate idempotency namespace and Telegram identity as
 * the rate-limit subject. The VPS never receives admin credentials.
 */
export async function createTelegramShopCheckout(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "SHOP_ORDER_TOKEN_SECRET" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: CreateCheckoutInput,
  idempotencyKey: string,
  requestId: string,
) {
  if (input.sourceChannel !== "telegram" || !input.customer.telegramSubject?.trim()) throw new ShopConflictError("telegram_identity_required");
  const telegramChatId = parseTelegramPrivateChatId(input.customer.telegramSubject);
  if (telegramChatId === null) throw new ShopConflictError("telegram_identity_invalid");
  const db = requireDb(bindings);
  // The existing Telegram bot is intentionally Vietnam-only. Keep its
  // persisted checkout invariant on VND + PayOS/VietQR even if an old client
  // sends a different locale or the global crypto configuration is present.
  if (!isShopOrderTokenSecretConfigured(bindings.SHOP_ORDER_TOKEN_SECRET)) throw new ShopConflictError("shop_order_token_not_configured");
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim() ?? "";
  if (!/^[0-9]{4,32}$/.test(account)) throw new ShopConflictError("vietqr_bank_account_not_configured");
  if (![bindings.PAYOS_CLIENT_ID, bindings.PAYOS_API_KEY].every((value) => typeof value === "string" && value.trim().length >= 16)
    || typeof bindings.PAYOS_CHECKSUM_KEY !== "string" || bindings.PAYOS_CHECKSUM_KEY.trim().length < 32) {
    throw new ShopConflictError("payos_not_configured");
  }
  try {
    const origin = new URL(bindings.SHOP_PUBLIC_ORIGIN?.trim() || "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) throw new ShopConflictError("shop_public_origin_invalid");
  } catch (error) {
    if (error instanceof ShopConflictError) throw error;
    throw new ShopConflictError("shop_public_origin_invalid");
  }
  const provider = await resolveVietQrProviderConfig(db);
  if (!provider) throw new ShopConflictError("vietqr_config_not_found");
  const telegramInput: CreateCheckoutInput = {
    ...input,
    locale: "vi",
    pricingCurrency: "VND",
    customer: { ...input.customer, locale: "vi" },
  };
  const subject = telegramInput.customer.telegramSubject!.trim();
  const checkoutSubjectHash = await deriveShopCheckoutSubjectHash(bindings.SHOP_ORDER_TOKEN_SECRET, `telegram:${subject}`);
  const idempotencyHash = await hashIdempotencyKey("checkout:telegram", idempotencyKey);
  const existingIdempotency = await db.prepare("SELECT 1 AS found FROM shop_idempotency_keys WHERE namespace = 'checkout:telegram' AND key_hash = ? AND expires_at > ? LIMIT 1").bind(idempotencyHash, new Date().toISOString()).first<{ found: number }>();
  if (!existingIdempotency) {
    const rate = await consumeCheckoutRateLimit(db, checkoutSubjectHash);
    if (!rate.allowed) throw new ShopConflictError("checkout_rate_limited");
  }
  const accessToken = await deriveShopOrderAccessToken(bindings.SHOP_ORDER_TOKEN_SECRET, "checkout:telegram", idempotencyKey);
  const actor: ShopActor = { id: "telegram-vps", channel: "telegram" };
  const order = await createCheckoutOrder(db, telegramInput, idempotencyKey, actor, requestId, accessToken, checkoutSubjectHash);
  try {
    const { logAttributionEvent, recordCommissionAccrual } = await import("./platform/service");
    const { parseAttributionReference } = await import("./platform/attribution");
    const parsed = parseAttributionReference(telegramInput.externalReference ?? null);
    await logAttributionEvent(db, {
      eventType: "checkout",
      channel: "telegram",
      refCode: parsed.ref ?? null,
      discountCode: parsed.discountCode ?? telegramInput.discountCode ?? null,
      productSlug: parsed.lastProductSlug ?? null,
      orderId: order.orderId,
      payload: { source: "telegram_vn_checkout" },
    });
    await recordCommissionAccrual(db, {
      orderId: order.orderId,
      externalReference: telegramInput.externalReference,
      orderTotalMinor: order.totalMinor,
      currency: order.currency,
      sourceChannel: "telegram",
    });
  } catch { /* never block checkout */ }
  const telegramBotConfigId = telegramInput.customer.telegramBotConfigId && /^[A-Za-z0-9_-]{8,80}$/.test(telegramInput.customer.telegramBotConfigId)
    ? telegramInput.customer.telegramBotConfigId
    : undefined;
  await persistTelegramOrderRecipient(bindings, {
    orderId: order.orderId,
    subjectHash: checkoutSubjectHash,
    chatId: telegramChatId,
    botConfigId: telegramBotConfigId,
  });
  if (!order.orderAccessToken) return { order, payment: null, paymentConfiguration: "ready" as const };
  try {
    const payment = await createVietQrPayment(bindings, {
      orderId: order.orderId,
      providerConfigId: provider.id,
      expiresAt: order.expiresAt,
    }, actor, requestId);
    return { order, payment, paymentConfiguration: "ready" as const };
  } catch {
    return { order, payment: null, paymentConfiguration: "unavailable" as const };
  }
}

/**
 * Independent GLB Store checkout. It deliberately does not call the legacy
 * PayOS path: global orders are priced in USD cents and create a crypto
 * attempt against a method explicitly assigned to the `glb` storefront scope.
 */
export async function createGlbTelegramShopCheckout(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_ORDER_TOKEN_SECRET" | "SHOP_PUBLIC_ORIGIN" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  input: CreateCheckoutInput,
  idempotencyKey: string,
  requestId: string,
) {
  if (input.sourceChannel !== "telegram" || !input.customer.telegramSubject?.trim()) throw new Error("telegram_identity_required");
  const telegramChatId = parseTelegramPrivateChatId(input.customer.telegramSubject);
  if (telegramChatId === null) throw new Error("telegram_identity_invalid");
  const db = requireDb(bindings);
  if (!isShopOrderTokenSecretConfigured(bindings.SHOP_ORDER_TOKEN_SECRET)) throw new Error("shop_order_token_not_configured");
  try {
    const origin = new URL(bindings.SHOP_PUBLIC_ORIGIN?.trim() || "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("shop_public_origin_invalid");
  } catch (error) {
    if (error instanceof Error && error.message === "shop_public_origin_invalid") throw error;
    throw new Error("shop_public_origin_invalid");
  }
  const methods = await listCryptoPaymentMethods(db, true, "glb");
  if (!methods.length) throw new Error("crypto_payment_method_not_configured");
  const globalInput: CreateCheckoutInput = {
    ...input,
    locale: "en",
    pricingCurrency: "USD",
    customer: { ...input.customer, locale: "en" },
  };
  const subject = globalInput.customer.telegramSubject!.trim();
  const checkoutSubjectHash = await deriveShopCheckoutSubjectHash(bindings.SHOP_ORDER_TOKEN_SECRET, `telegram:${subject}`);
  const checkoutKey = `glb-${idempotencyKey}`.slice(0, 200);
  const idempotencyHash = await hashIdempotencyKey("checkout:telegram", checkoutKey);
  const existingIdempotency = await db.prepare("SELECT 1 AS found FROM shop_idempotency_keys WHERE namespace = 'checkout:telegram' AND key_hash = ? AND expires_at > ? LIMIT 1").bind(idempotencyHash, new Date().toISOString()).first<{ found: number }>();
  if (!existingIdempotency) {
    const rate = await consumeCheckoutRateLimit(db, checkoutSubjectHash);
    if (!rate.allowed) throw new ShopConflictError("checkout_rate_limited");
  }
  const accessToken = await deriveShopOrderAccessToken(bindings.SHOP_ORDER_TOKEN_SECRET, "checkout:telegram", checkoutKey);
  const actor: ShopActor = { id: "glb-telegram", channel: "telegram" };
  const order = await createCheckoutOrder(db, globalInput, checkoutKey, actor, requestId, accessToken, checkoutSubjectHash);
  try {
    const { logAttributionEvent, recordCommissionAccrual } = await import("./platform/service");
    const { parseAttributionReference } = await import("./platform/attribution");
    const parsed = parseAttributionReference(globalInput.externalReference ?? null);
    await logAttributionEvent(db, {
      eventType: "checkout",
      channel: "telegram_glb",
      refCode: parsed.ref ?? null,
      discountCode: parsed.discountCode ?? globalInput.discountCode ?? null,
      productSlug: parsed.lastProductSlug ?? null,
      orderId: order.orderId,
      payload: { source: "telegram_glb_checkout" },
    });
    await recordCommissionAccrual(db, {
      orderId: order.orderId,
      externalReference: globalInput.externalReference,
      orderTotalMinor: order.totalMinor,
      currency: order.currency,
      sourceChannel: "telegram_glb",
    });
  } catch { /* never block checkout */ }
  const botConfigId = globalInput.customer.telegramBotConfigId && /^[A-Za-z0-9_-]{8,80}$/.test(globalInput.customer.telegramBotConfigId)
    ? globalInput.customer.telegramBotConfigId
    : "glb-store";
  await persistTelegramOrderRecipient(bindings, { orderId: order.orderId, subjectHash: checkoutSubjectHash, chatId: telegramChatId, botConfigId });
  if (!order.orderAccessToken) return { order, payment: null, paymentConfiguration: "ready" as const };
  try {
    const payment = await createCryptoPayment(bindings, { orderId: order.orderId, paymentMethodId: globalInput.paymentMethodId, expiresAt: order.expiresAt }, actor, requestId);
    return { order, payment, paymentConfiguration: "ready" as const };
  } catch {
    return { order, payment: null, paymentConfiguration: "unavailable" as const };
  }
}

// Cloudflare D1 Paid permits up to 1,000 queries per invocation. Keep a
// deliberate 133-query reserve for conflict retries and future maintenance
// work: one candidate query + 24 full reconciliations, 100 payment expiries,
// 50 reservation releases, one idempotency cleanup and one rate-limit cleanup.
const SHOP_MAINTENANCE_D1_QUERY_LIMIT = 1_000;
const PAYOS_RECONCILIATION_LIMIT = 24;
const PAYOS_RECONCILIATION_CONCURRENCY = 4;
const PAYOS_ORPHAN_RECOVERY_LIMIT = 4;
const PAYOS_INTERACTIVE_RETRY_SECONDS = 15;
const PAYMENT_EXPIRY_SWEEP_LIMIT = 100;
const RESERVATION_EXPIRY_SWEEP_LIMIT = 50;
const SHOP_MAINTENANCE_WORST_CASE_D1_QUERIES = 1
  + PAYOS_RECONCILIATION_LIMIT * 14
  + PAYOS_ORPHAN_RECOVERY_LIMIT * 5
  + 1 + PAYMENT_EXPIRY_SWEEP_LIMIT * 2
  + 1 + RESERVATION_EXPIRY_SWEEP_LIMIT * 7
  + 1
  + 1;
if (SHOP_MAINTENANCE_WORST_CASE_D1_QUERIES > SHOP_MAINTENANCE_D1_QUERY_LIMIT) {
  throw new Error("shop_maintenance_query_budget_exceeded");
}

type ShopMaintenanceBindings = Pick<ShopBindings,
  "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN"
>;

type PayOsReconciliationCandidate = {
  id: string;
  order_id: string;
  provider_config_id: string;
  provider_reference: string | null;
  provider_order_code: number;
  provider_description: string;
  amount_minor: number;
  currency: string;
  expires_at: string;
};

export type PayOsReconciliationSweep = {
  checked: number;
  reconciled: number;
  alreadyProcessed: number;
  pending: number;
  partial: number;
  overpaid: number;
  late: number;
  identityMismatch: number;
  inconsistent: number;
  terminalUnpaid: number;
  attentionCreated: number;
  errors: number;
  skipped: "not_configured" | null;
};

function emptyPayOsSweep(skipped: PayOsReconciliationSweep["skipped"] = null): PayOsReconciliationSweep {
  return { checked: 0, reconciled: 0, alreadyProcessed: 0, pending: 0, partial: 0, overpaid: 0, late: 0, identityMismatch: 0, inconsistent: 0, terminalUnpaid: 0, attentionCreated: 0, errors: 0, skipped };
}

function payOsReconciliationConfigured(bindings: ShopMaintenanceBindings) {
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim();
  return Boolean(account && /^[0-9]{4,32}$/.test(account)
    && typeof bindings.PAYOS_CLIENT_ID === "string" && bindings.PAYOS_CLIENT_ID.trim().length >= 16
    && typeof bindings.PAYOS_API_KEY === "string" && bindings.PAYOS_API_KEY.trim().length >= 16
    && typeof bindings.PAYOS_CHECKSUM_KEY === "string" && bindings.PAYOS_CHECKSUM_KEY.trim().length >= 32);
}

async function recordPayOsReconciliationCheck(db: D1Database, attemptId: string, attemptedAt: string, successful: boolean) {
  const statement = successful
    ? db.prepare(`UPDATE shop_payment_attempts
        SET reconciliation_attempted_at = ?, reconciliation_checked_at = ?
        WHERE id = ? AND status IN ('created', 'awaiting_payment')`).bind(attemptedAt, attemptedAt, attemptId)
    : db.prepare(`UPDATE shop_payment_attempts
        SET reconciliation_attempted_at = ?
        WHERE id = ? AND status IN ('created', 'awaiting_payment')`).bind(attemptedAt, attemptId);
  await statement.run();
}

// Claim the reconciliation slot before contacting payOS. The previous
// post-request timestamp update allowed concurrent order refreshes to all pass
// the 15-second eligibility window and fan out provider requests.
async function claimPayOsReconciliationCheck(db: D1Database, attemptId: string, claimedAt: string) {
  const result = await db.prepare(`UPDATE shop_payment_attempts
      SET reconciliation_attempted_at = ?
      WHERE id = ? AND status IN ('created', 'awaiting_payment')
        AND (reconciliation_attempted_at IS NULL
          OR unixepoch(reconciliation_attempted_at) <= unixepoch(?) - ?)`)
    .bind(claimedAt, attemptId, claimedAt, PAYOS_INTERACTIVE_RETRY_SECONDS)
    .run();
  return result.meta.changes === 1;
}

export async function reconcilePendingPayOsPayments(
  bindings: ShopMaintenanceBindings,
  options: { orderId?: string } = {},
): Promise<PayOsReconciliationSweep> {
  const db = requireDb(bindings);
  if (!payOsReconciliationConfigured(bindings)) return emptyPayOsSweep("not_configured");
  const targetOrderId = options.orderId?.trim() ?? "";
  if (targetOrderId && !/^[A-Za-z0-9-]{8,80}$/.test(targetOrderId)) throw new Error("payos_reconciliation_order_invalid");
  const checkedAt = new Date().toISOString();
  const candidates = await db.prepare(`SELECT pa.id, pa.order_id, pa.provider_config_id, pa.provider_reference, pa.provider_order_code, pa.provider_description,
      pa.amount_minor, pa.currency, pa.expires_at
    FROM shop_payment_attempts pa
    JOIN shop_orders o ON o.id = pa.order_id
    JOIN shop_payment_provider_configs pc ON pc.id = pa.provider_config_id
    WHERE pa.confirmation_provider = 'payos'
      AND pa.status IN ('created', 'awaiting_payment')
      AND pa.provider_order_code IS NOT NULL
      AND pa.provider_description IS NOT NULL
      AND pa.amount_minor = o.total_minor
      AND pa.currency = 'VND' AND o.currency = 'VND'
      AND o.status = 'pending_payment' AND o.payment_status IN ('unpaid', 'pending')
      AND pc.account_ref = 'VIETQR_BANK_ACCOUNT'
      AND (? = '' OR pa.order_id = ?)
      AND (pa.reconciliation_attempted_at IS NULL
        OR unixepoch(pa.reconciliation_attempted_at) <= unixepoch(?) - ?)
    ORDER BY CASE WHEN pa.expires_at <= ? THEN 0 ELSE 1 END,
      COALESCE(pa.reconciliation_attempted_at, pa.created_at) ASC, pa.expires_at ASC
    LIMIT ?`).bind(
      targetOrderId,
      targetOrderId,
      checkedAt,
      PAYOS_INTERACTIVE_RETRY_SECONDS,
      checkedAt,
      targetOrderId ? 1 : PAYOS_RECONCILIATION_LIMIT,
    ).all<PayOsReconciliationCandidate>();
  const sweep = emptyPayOsSweep();
  const credentials = payOsCredentials(bindings);
  const expectedAccountNumber = bindings.VIETQR_BANK_ACCOUNT!.trim();
  let orphanRecoverySlots = PAYOS_ORPHAN_RECOVERY_LIMIT;
  const eligibleCandidates = candidates.results.filter((candidate) => {
    if (candidate.provider_reference) return true;
    if (orphanRecoverySlots <= 0) return false;
    orphanRecoverySlots -= 1;
    return true;
  });

  for (let offset = 0; offset < eligibleCandidates.length; offset += PAYOS_RECONCILIATION_CONCURRENCY) {
    const batch = eligibleCandidates.slice(offset, offset + PAYOS_RECONCILIATION_CONCURRENCY);
    const results = await Promise.all(batch.map(async (candidate) => {
      try {
        // D1's conditional update is the cross-isolate fence. Only the
        // winner proceeds to the external provider; losers are skipped.
        if (!await claimPayOsReconciliationCheck(db, candidate.id, checkedAt)) {
          return { candidate, payment: null, error: null, skipped: true as const };
        }
        if (!candidate.provider_reference) {
          await createVietQrPayment(bindings, {
            orderId: candidate.order_id,
            providerConfigId: candidate.provider_config_id,
            expiresAt: candidate.expires_at,
          }, "system:payos-link-recovery", `payos-link-recovery:${candidate.id}`);
        }
        const orderCode = Number(candidate.provider_order_code);
        const payment = await getPayOsPaymentLink(credentials, orderCode);
        return {
          candidate: { ...candidate, provider_reference: candidate.provider_reference ?? payment.id },
          payment,
          error: null,
          skipped: false as const,
        };
      } catch (error) {
        return { candidate, payment: null, error, skipped: false as const };
      }
    }));

    for (const result of results) {
      if (result.skipped) continue;
      sweep.checked += 1;
      if (result.error || !result.payment) {
        sweep.errors += 1;
        const errorName = result.error instanceof Error ? result.error.message : "payos_status_unavailable";
        console.error(JSON.stringify({
          event: "shop_payos_status_fetch_failed",
          paymentAttemptId: result.candidate.id,
          providerOrderCode: result.candidate.provider_order_code,
          errorName,
        }));
        try {
          const created = await recordPayOsPaymentAttention(db, {
            paymentAttemptId: result.candidate.id,
            providerEventId: `status-error:${result.candidate.id}:${checkedAt.slice(0, 16)}`,
            transactionReference: null,
            amountMinor: result.candidate.amount_minor,
            currency: "VND",
            orderReference: result.candidate.provider_description,
            payloadHash: await sha256Base64Url(`status-error:${result.candidate.id}:${errorName}:${checkedAt}`),
            matchState: "unmatched",
            errorCode: `payos_status_${errorName}`.slice(0, 80),
            occurredAt: checkedAt,
          });
          if (created) sweep.attentionCreated += 1;
        } catch {
          // Best-effort diagnostics only.
        }
        await recordPayOsReconciliationCheck(db, result.candidate.id, checkedAt, false).catch(() => undefined);
        continue;
      }
      const decision = classifyPayOsSettlement({
        payment: result.payment,
        providerReference: result.candidate.provider_reference,
        providerOrderCode: Number(result.candidate.provider_order_code),
        expectedAmount: result.candidate.amount_minor,
        expectedAccountNumber,
        expectedDescription: result.candidate.provider_description,
        expiresAt: result.candidate.expires_at,
      });
      const sortedTransactions = [...result.payment.transactions].sort((left, right) => left.reference.localeCompare(right.reference));
      const evidence = JSON.stringify({
        version: 1,
        id: result.payment.id,
        orderCode: result.payment.orderCode,
        amount: result.payment.amount,
        amountPaid: result.payment.amountPaid,
        amountRemaining: result.payment.amountRemaining,
        status: result.payment.status,
        transactions: sortedTransactions,
      });
      const payloadHash = await sha256Base64Url(evidence);
      // Always leave a trail of what payOS reported so "chờ thanh toán" vs PAID is visible in D1.
      try {
        const created = await recordPayOsPaymentAttention(db, {
          paymentAttemptId: result.candidate.id,
          providerEventId: `snapshot:${result.candidate.id}:${result.payment.status}:${result.payment.amountPaid}`,
          transactionReference: sortedTransactions.length === 1 ? sortedTransactions[0].reference : null,
          amountMinor: result.payment.amountPaid,
          currency: "VND",
          orderReference: result.candidate.provider_description,
          payloadHash,
          matchState: decision.kind === "paid_exact" ? "matched" : "unmatched",
          errorCode: `payos_${decision.kind}:${result.payment.status}:paid=${result.payment.amountPaid}:tx=${sortedTransactions.length}`.slice(0, 80),
          occurredAt: sortedTransactions[0]?.occurredAt ?? checkedAt,
        });
        if (created) sweep.attentionCreated += 1;
      } catch {
        // Diagnostic only.
      }
      if (decision.kind !== "paid_exact") {
        if (decision.kind === "identity_mismatch") sweep.identityMismatch += 1;
        else if (decision.kind === "terminal_unpaid") sweep.terminalUnpaid += 1;
        else if (decision.kind === "pending") sweep.pending += 1;
        else if (decision.kind === "partial") sweep.partial += 1;
        else if (decision.kind === "overpaid") sweep.overpaid += 1;
        else if (decision.kind === "late") sweep.late += 1;
        else if (decision.kind === "inconsistent") sweep.inconsistent += 1;
        // Any transfer evidence, including late/partial/overpaid payments, needs
        // review or later reconciliation and must never release the order.
        const reconciliationDeadline = payOsReconciliationDeadline(result.candidate.expires_at);
        const expiryAuthorized = decision.kind === "terminal_unpaid"
          && reconciliationDeadline !== null
          && checkedAt >= reconciliationDeadline;
        await recordPayOsReconciliationCheck(db, result.candidate.id, checkedAt, expiryAuthorized).catch(() => undefined);
        continue;
      }
      try {
        const reconciliation = await reconcilePaymentConfirmation(db, {
          provider: "payos",
          providerEventId: `status:${payloadHash}`,
          providerReference: result.payment.id,
          providerOrderCode: result.payment.orderCode,
          destinationAccountNumber: expectedAccountNumber,
          transactionReference: decision.transactionReferences.length === 1 ? decision.transactionReferences[0] : null,
          orderReference: result.candidate.provider_description,
          amountMinor: result.payment.amountPaid,
          currency: "VND",
          payloadHash,
          signatureVerified: true,
          occurredAt: decision.occurredAt,
        }, "system:payos-status", `payos-status:${payloadHash}`, { payOsAccountNumber: expectedAccountNumber });
        if (reconciliation.outcome === "paid") sweep.reconciled += 1;
        else if (reconciliation.outcome === "already_processed") sweep.alreadyProcessed += 1;
        else sweep.identityMismatch += 1;
      } catch {
        sweep.errors += 1;
        await recordPayOsReconciliationCheck(db, result.candidate.id, checkedAt, false).catch(() => undefined);
      }
    }
  }
  return sweep;
}

export async function runShopExpirySweep(bindings: ShopMaintenanceBindings) {
  const db = requireDb(bindings);
  // Crypto payments stay pending until an operator reviews the customer proof
  // and uses the existing manual-confirm action in the admin workspace.
  const payOs = await reconcilePendingPayOsPayments(bindings);
  const payments = await expirePaymentAttempts(db, PAYMENT_EXPIRY_SWEEP_LIMIT);
  const reservations = await releaseExpiredReservations(db, RESERVATION_EXPIRY_SWEEP_LIMIT);
  const idempotencyKeys = await cleanupExpiredIdempotencyKeys(db);
  const rateLimits = await db.prepare("DELETE FROM shop_checkout_rate_limits WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1_000)).run();
  return { payOs, payments, reservations, idempotencyKeys, rateLimits: rateLimits.meta.changes };
}

export async function claimFulfillmentDelivery(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  orderItemId: string,
  leaseSeconds = 90,
  channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram",
  integrityRetry = 0,
): Promise<FulfillmentDelivery | null> {
  const db = requireDb(bindings);
  const context = await requireShopCrypto(bindings);
  const leaseToken = randomOpaqueToken(32);
  const leaseTokenHash = await sha256Base64Url(leaseToken);
  const row = await claimFulfillmentAllocation(db, orderItemId, leaseTokenHash, leaseSeconds, channel);
  if (!row) return null;
  try {
    const plaintextKey = await openInventoryKey(context, row);
    return { orderId: row.orderId, orderItemId: row.orderItemId, allocationId: row.allocationId, inventoryUnitId: row.id, plaintextKey, leaseToken, leaseExpiresAt: row.lease_expires_at ?? new Date(Date.now() + leaseSeconds * 1_000).toISOString() };
  } catch (error) {
    if (error instanceof ShopCryptoConfigurationError) {
      await releaseFulfillmentLease(db, row.allocationId, leaseTokenHash);
      throw error;
    }
    if (error instanceof ShopCryptoIntegrityError) {
      const quarantine = await quarantineFulfillmentAllocation(db, row.allocationId, leaseTokenHash, "system:fulfillment", crypto.randomUUID(), channel);
      if (quarantine.replaced && integrityRetry < 5) return claimFulfillmentDelivery(bindings, orderItemId, leaseSeconds, channel, integrityRetry + 1);
      throw new ShopConflictError("fulfillment_key_unavailable");
    }
    await markFulfillmentFailed(db, row.allocationId, leaseTokenHash, "key_decryption_failed", "system:fulfillment", crypto.randomUUID(), channel);
    throw error;
  }
}

export async function confirmFulfillmentDelivery(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  delivery: Pick<FulfillmentDelivery, "allocationId" | "leaseToken">,
  actor: ShopActor | string,
  requestId: string,
  channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram",
) {
  const leaseTokenHash = await sha256Base64Url(delivery.leaseToken);
  return markFulfillmentDelivered(requireDb(bindings), delivery.allocationId, leaseTokenHash, actor, requestId, channel);
}

export async function failFulfillmentDelivery(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  delivery: Pick<FulfillmentDelivery, "allocationId" | "leaseToken">,
  errorCode: string,
  actor: ShopActor | string,
  requestId: string,
  channel: "web" | "email" | "telegram" | "manual" | "api" = "telegram",
) {
  const leaseTokenHash = await sha256Base64Url(delivery.leaseToken);
  return markFulfillmentFailed(requireDb(bindings), delivery.allocationId, leaseTokenHash, errorCode, actor, requestId, channel);
}

type DeliverableOrderRow = {
  id: string;
  order_number: string;
  status: "pending_payment" | "processing" | "fulfilled" | "cancelled" | "expired" | "refunded";
  payment_status: string;
  fulfillment_status?: string;
  fulfilled_at: string | null;
};

export async function checkAndNotifyLowStock(
  bindings: Pick<ShopBindings, "CONTENT_DB">,
  orderItemIds: string[],
): Promise<void> {
  if (!orderItemIds.length) return;
  try {
    const db = requireDb(bindings);
    for (const itemId of orderItemIds) {
      const row = await db.prepare(`
        SELECT v.id, v.sku, v.low_stock_threshold,
               COALESCE(vl.title, v.sku) AS variant_title,
               COALESCE(pl.title, p.slug) AS product_title,
               COUNT(u.id) AS available_count
        FROM shop_order_items oi
        JOIN shop_variants v ON v.id = oi.variant_id
        JOIN shop_products p ON p.id = v.product_id
        LEFT JOIN shop_variant_localizations vl ON vl.variant_id = v.id AND vl.locale = 'vi'
        LEFT JOIN shop_product_localizations pl ON pl.product_id = p.id AND pl.locale = 'vi'
        LEFT JOIN shop_inventory_units u ON u.variant_id = v.id AND u.status = 'available'
        WHERE oi.id = ? AND v.inventory_policy = 'tracked' AND v.deleted_at IS NULL
        GROUP BY v.id
      `).bind(itemId).first<{
        id: string;
        sku: string;
        low_stock_threshold: number;
        variant_title: string;
        product_title: string;
        available_count: number;
      }>();
      if (row && row.available_count <= Math.max(1, row.low_stock_threshold || 5)) {
        console.warn(JSON.stringify({
          event: "low_stock_alert",
          variantId: row.id,
          sku: row.sku,
          productTitle: row.product_title,
          variantTitle: row.variant_title,
          availableCount: row.available_count,
        }));
      }
    }
  } catch {
    // Low-stock alert should never interrupt order delivery
  }
}

async function deliverPaidOrderKeys(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  order: DeliverableOrderRow,
  channel: "web" | "telegram" | "account" = "web",
): Promise<PublicShopDeliveryResult> {
  const db = requireDb(bindings);
  if (order.payment_status !== "paid") throw new ShopConflictError("order_not_paid");
  if (order.status === "cancelled" || order.status === "expired" || order.status === "refunded") {
    throw new ShopConflictError("order_not_deliverable");
  }

  const rows = await db.prepare(`SELECT id, sku_snapshot, product_title_snapshot, variant_title_snapshot, quantity,
      fulfillment_type, delivery_mode, inventory_policy, fulfillment_status
    FROM shop_order_items WHERE order_id = ? ORDER BY line_number, id`).bind(order.id).all<{
      id: string;
      sku_snapshot: string;
      product_title_snapshot: string;
      variant_title_snapshot: string;
      quantity: number;
      fulfillment_type: "license_key" | "download" | "manual";
      delivery_mode: "automatic" | "manual";
      inventory_policy: "tracked" | "unlimited";
      fulfillment_status: "unfulfilled" | "processing" | "fulfilled" | "failed" | "cancelled";
    }>();
  if (rows.results.some((row) => row.fulfillment_type === "download" && row.delivery_mode === "automatic")) {
    throw new ShopConflictError("automatic_download_unsupported");
  }
  const eligible = rows.results.filter((row) => row.fulfillment_type === "license_key" && row.delivery_mode === "automatic" && row.inventory_policy === "tracked");
  if (!eligible.length) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      state: order.status === "fulfilled" ? "fulfilled" : "paid",
      deliveries: [],
      deliveredAt: order.fulfilled_at,
    };
  }

  const fulfillmentChannel = channel === "account" ? "web" : channel;
  const context = await requireShopCrypto(bindings);
  const fulfilledRows = await listFulfilledFulfillmentAllocations(db, order.id);
  const keysByItem = new Map<string, string[]>();
  const deliveredAt = new Date().toISOString();
  // Existing allocations are read frequently when a buyer reopens an order.
  // Decrypt a small bounded batch in parallel to avoid N-key latency while
  // keeping memory/CPU pressure predictable and preserving database order.
  for (let offset = 0; offset < fulfilledRows.length; offset += 8) {
    const batch = fulfilledRows.slice(offset, offset + 8);
    const decrypted = await Promise.all(batch.map((row) => openInventoryKey(context, row)));
    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index]!;
      const key = decrypted[index]!;
      const keys = keysByItem.get(row.orderItemId) ?? [];
      keys.push(key);
      keysByItem.set(row.orderItemId, keys);
    }
  }

  for (const item of eligible) {
    const existing = keysByItem.get(item.id) ?? [];
    while (existing.length < item.quantity) {
      let delivery = await claimFulfillmentDelivery(bindings, item.id, 90, fulfillmentChannel);
      if (!delivery) {
        // A payment webhook or another reveal request may still be committing
        // the reservation. Give that short transaction a chance to finish so
        // buyers do not see a false "try again" error on the first tap.
        for (const delayMs of [60, 120]) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delivery = await claimFulfillmentDelivery(bindings, item.id, 90, fulfillmentChannel);
          if (delivery) break;
        }
      }
      if (!delivery) {
        const refreshedRows = (await listFulfilledFulfillmentAllocations(db, order.id)).filter((row) => row.orderItemId === item.id);
        const refreshedKeys = await Promise.all(refreshedRows.map((row) => openInventoryKey(context, row)));
        existing.splice(0, existing.length, ...refreshedKeys);
        keysByItem.set(item.id, existing);
        if (existing.length >= item.quantity) break;
        const latest = await db.prepare("SELECT fulfillment_status FROM shop_order_items WHERE id = ? LIMIT 1").bind(item.id).first<{ fulfillment_status: "unfulfilled" | "processing" | "fulfilled" | "failed" | "cancelled" }>();
        if (latest?.fulfillment_status === "failed") throw new ShopConflictError("fulfillment_key_unavailable");
        throw new ShopConflictError("order_delivery_in_progress");
      }
      try {
        existing.push(delivery.plaintextKey);
        await confirmFulfillmentDelivery(
          bindings,
          delivery,
          channel === "telegram" ? "telegram-vps" : channel === "account" ? "storefront:account" : "storefront:web",
          crypto.randomUUID(),
          fulfillmentChannel,
        );
      } catch (error) {
        await failFulfillmentDelivery(
          bindings,
          delivery,
          "delivery_commit_failed",
          channel === "telegram" ? "telegram-vps" : channel === "account" ? "storefront:account" : "storefront:web",
          crypto.randomUUID(),
          fulfillmentChannel,
        ).catch(() => undefined);
        throw error;
      }
      keysByItem.set(item.id, existing);
    }
  }

  const deliveries: PublicShopDeliveryItem[] = eligible.map((item) => ({
    itemId: item.id,
    sku: item.sku_snapshot,
    title: item.variant_title_snapshot || item.product_title_snapshot,
    quantity: item.quantity,
    keys: keysByItem.get(item.id) ?? [],
  }));
  const latestOrder = await db.prepare(`SELECT status, fulfillment_status, fulfilled_at
    FROM shop_orders WHERE id = ? LIMIT 1`).bind(order.id).first<{
      status: "pending_payment" | "processing" | "fulfilled" | "cancelled" | "expired" | "refunded";
      fulfillment_status: "unfulfilled" | "partial" | "fulfilled" | "failed";
      fulfilled_at: string | null;
    }>();
  const orderFulfilled = latestOrder?.status === "fulfilled" || latestOrder?.fulfillment_status === "fulfilled";
  checkAndNotifyLowStock(bindings, eligible.map((item) => item.id)).catch(() => undefined);
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    state: orderFulfilled ? "fulfilled" : "paid",
    deliveries,
    deliveredAt: latestOrder?.fulfilled_at ?? deliveredAt,
  };
}

/**
 * Delivers only paid, automatic license-key lines to the bearer of the order
 * token. Keys remain encrypted at rest; retries decrypt the already fulfilled
 * allocation instead of minting or reserving a second key.
 */
export async function deliverPublicShopOrder(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  accessToken: string,
  channel: "web" | "telegram" = "web",
): Promise<PublicShopDeliveryResult> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken)) throw new ShopConflictError("order_access_required");
  const db = requireDb(bindings);
  const order = await getOrderByAccessToken(db, accessToken);
  if (!order) throw new ShopConflictError("order_not_found");
  return deliverPaidOrderKeys(bindings, order, channel);
}

/**
 * Account-scoped delivery. Recheck ownership at the delivery boundary so a
 * future caller cannot accidentally turn a known order ID into an IDOR.
 */
export async function deliverCustomerOwnedOrder(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "SHOP_KEY_ENCRYPTION_SECRET" | "SHOP_KEY_ENCRYPTION_KEY_VERSION">,
  customerId: string,
  orderId: string,
  channel: "web" | "account" | "telegram" = "account",
): Promise<PublicShopDeliveryResult> {
  const db = requireDb(bindings);
  const order = await db.prepare(`SELECT id, order_number, status, payment_status, fulfillment_status, fulfilled_at
    FROM shop_orders WHERE id = ? AND customer_id = ? LIMIT 1`).bind(orderId, customerId).first<DeliverableOrderRow>();
  if (!order) throw new ShopConflictError("order_not_found");
  return deliverPaidOrderKeys(bindings, order, channel);
}

export async function getShopOrderByAccessToken(bindings: Pick<ShopBindings, "CONTENT_DB">, accessToken: string) {
  return getOrderByAccessToken(requireDb(bindings), accessToken);
}

function publicOrderState(
  order: Awaited<ReturnType<typeof getOrderByAccessToken>>,
  attempt: { status: "created" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "cancelled"; expires_at: string } | null,
): PublicShopOrderState {
  if (!order) return "failed";
  if (order.status === "fulfilled" || order.fulfillment_status === "fulfilled") return "fulfilled";
  if (order.status === "cancelled" || order.status === "refunded") return "cancelled";
  if (order.status === "expired" || attempt?.status === "expired") return "expired";
  if (order.payment_status === "paid" || attempt?.status === "confirmed") return "paid";
  if (order.payment_status === "failed" || attempt?.status === "failed") return "failed";
  if (attempt?.status === "cancelled") return "cancelled";
  if ((attempt?.status === "created" || attempt?.status === "awaiting_payment")
    && Date.parse(attempt.expires_at) <= Date.now()) return "confirming";
  if (attempt?.status === "awaiting_payment" || order.payment_status === "pending") return "awaiting_payment";
  return "created";
}

export async function getPublicShopOrderStatusByCustomer(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN">,
  orderNumberOrId: string,
  customerId: string,
): Promise<PublicShopOrderStatus | null> {
  const db = requireDb(bindings);
  const order = await db.prepare(`SELECT id, order_number, order_reference, status, payment_status, fulfillment_status, currency,
      subtotal_minor, discount_minor, tax_minor, total_minor, expires_at, paid_at, fulfilled_at, created_at
    FROM shop_orders WHERE (order_number = ? OR id = ?) AND customer_id = ? LIMIT 1`)
    .bind(orderNumberOrId, orderNumberOrId, customerId).first<{
      id: string; order_number: string; order_reference: string; status: ShopOrderStatus; payment_status: ShopPaymentStatus; fulfillment_status: "unfulfilled" | "partial" | "fulfilled" | "failed"; currency: string; subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; expires_at: string | null; paid_at: string | null; fulfilled_at: string | null; created_at: string;
    }>();
  if (!order) return null;
  return resolvePublicOrderStatusFromRow(bindings, order);
}

export async function getPublicShopOrderStatus(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN">,
  accessToken: string,
): Promise<PublicShopOrderStatus | null> {
  if (!/^[A-Za-z0-9_-]{24,200}$/.test(accessToken)) return null;
  const db = requireDb(bindings);
  const order = await getOrderByAccessToken(db, accessToken);
  if (!order) return null;
  return resolvePublicOrderStatusFromRow(bindings, order);
}

async function resolvePublicOrderStatusFromRow(
  bindings: Pick<ShopBindings, "CONTENT_DB" | "VIETQR_BANK_ACCOUNT" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "SHOP_PUBLIC_ORIGIN">,
  order: {
    id: string; order_number: string; order_reference: string; status: ShopOrderStatus; payment_status: ShopPaymentStatus; fulfillment_status: "unfulfilled" | "partial" | "fulfilled" | "failed"; currency: string; subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; expires_at: string | null; paid_at: string | null; fulfilled_at: string | null; created_at: string;
  },
): Promise<PublicShopOrderStatus | null> {
  const db = requireDb(bindings);
  // Crypto tables are additive. Older deployments can still serve legacy
  // payOS orders until migration 0042 has been applied remotely.
  let cryptoAttempt: {
    id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit" | "pay_order";
    asset: "USDT" | "USDC"; network: string; amountAtomic: string; amountMinor: number; destination: string;
    memoOrTag: string; status: ShopCryptoAttemptStatus; transactionReference: string | null; expiresAt: string;
    destinationType: "uid" | "wallet_address"; publicConfig: string | null; qrUrl: string | null; accountUid: string | null;
  } | null = null;
  try {
    cryptoAttempt = await db.prepare(`SELECT a.id, a.provider, a.rail, a.asset, a.network,
        a.expected_amount_atomic AS amountAtomic, a.expected_amount_minor AS amountMinor,
        a.destination_snapshot AS destination, a.memo_or_tag_snapshot AS memoOrTag,
        a.status, a.transaction_reference AS transactionReference, a.expires_at AS expiresAt,
        m.destination_type AS destinationType, m.public_config_json AS publicConfig
      FROM shop_crypto_payment_attempts a
      JOIN shop_crypto_payment_methods m ON m.id = a.payment_method_id
      WHERE a.order_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 1`).bind(order.id).first<{
        id: string; provider: "bybit" | "binance"; rail: "internal_uid" | "onchain_deposit" | "pay_order";
        asset: "USDT" | "USDC"; network: string; amountAtomic: string; amountMinor: number; destination: string;
        memoOrTag: string; status: ShopCryptoAttemptStatus; transactionReference: string | null; expiresAt: string;
        destinationType: "uid" | "wallet_address"; publicConfig: string | null; qrUrl: string | null; accountUid: string | null;
      }>();
    if (cryptoAttempt) {
      let publicConfig: unknown = null;
      try { publicConfig = cryptoAttempt.publicConfig ? JSON.parse(cryptoAttempt.publicConfig) : null; } catch { publicConfig = null; }
      cryptoAttempt.qrUrl = cryptoAttempt.destinationType === "uid" ? null : cryptoQrUrl(publicConfig);
      cryptoAttempt.accountUid = cryptoAttempt.destinationType === "uid" ? cryptoAccountUid(publicConfig) : null;
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table:\s*shop_crypto_payment_attempts/i.test(error.message)) throw error;
  }
  if (cryptoAttempt) {
    let paymentProofs: Awaited<ReturnType<typeof listPaymentProofs>> = [];
    try {
      paymentProofs = await listPaymentProofs(db, order.id);
    } catch (error) {
      if (!(error instanceof Error) || !/no such table:\s*shop_payment_proofs/i.test(error.message)) throw error;
    }
    const state: PublicShopOrderState = order.status === "fulfilled" || order.fulfillment_status === "fulfilled"
      ? "fulfilled"
      : order.payment_status === "paid" || cryptoAttempt.status === "confirmed"
        ? "paid"
        : cryptoAttempt.status === "expired" || order.status === "expired"
          ? "expired"
          : cryptoAttempt.status === "failed" ? "failed"
            : cryptoAttempt.status === "cancelled" ? "cancelled"
              : cryptoAttempt.status === "detected" || cryptoAttempt.status === "needs_review" ? "confirming"
                : "awaiting_payment";
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderReference: order.order_reference,
      paymentDescription: cryptoAttempt.memoOrTag || null,
      state,
      paymentAttemptId: cryptoAttempt.id,
      method: "crypto_transfer",
      provider: cryptoAttempt.provider,
      qrUrl: cryptoAttempt.qrUrl,
      accountUid: cryptoAttempt.accountUid,
      checkoutUrl: null,
      amountMinor: cryptoAttempt.amountMinor,
      currency: "USD",
      expiresAt: cryptoAttempt.expiresAt,
      paidAt: order.paid_at,
      fulfilledAt: order.fulfilled_at,
      pollingAfterSeconds: state === "awaiting_payment" || state === "confirming" ? 20 : null,
      statusDetailCode: null,
      verificationStatus: cryptoAttempt.status,
      rail: cryptoAttempt.rail,
      asset: cryptoAttempt.asset,
      network: cryptoAttempt.network,
      destinationType: cryptoAttempt.destinationType,
      destination: cryptoAttempt.destination,
      memoOrTag: cryptoAttempt.memoOrTag,
      amountAtomic: cryptoAttempt.amountAtomic,
      amountDisplay: cryptoAmountDisplay(cryptoAttempt.amountMinor),
      transactionReference: cryptoAttempt.transactionReference,
      paymentProofs,
    };
  }
  const attempt = await db.prepare(`SELECT pa.id, pa.provider_config_id, pa.status, pa.expires_at, pa.provider_reference,
      pa.provider_description, pa.checkout_url, pa.qr_image_url, pa.provider_bank_bin, pa.provider_account_number,
      pc.bank_id, pc.account_ref,
      pc.account_name_display, pc.qr_template, pc.confirmation_adapter
    FROM shop_payment_attempts pa
    JOIN shop_payment_provider_configs pc ON pc.id = pa.provider_config_id
    WHERE pa.order_id = ?
      AND pa.provider = 'vietqr'
      AND pa.confirmation_provider = 'payos'
      AND pc.provider = 'vietqr'
      AND pc.account_ref = 'VIETQR_BANK_ACCOUNT'
      AND pc.confirmation_adapter = 'payos'
      AND pc.secret_ref = 'PAYOS_CHECKSUM_KEY'
    ORDER BY pa.created_at DESC, pa.id DESC LIMIT 1`).bind(order.id).first<{
      id: string;
      provider_config_id: string;
      status: "created" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "cancelled";
      expires_at: string;
      provider_reference: string | null;
      provider_description: string | null;
      checkout_url: string | null;
      qr_image_url: string | null;
      provider_bank_bin: string | null;
      provider_account_number: string | null;
      bank_id: string;
      account_ref: string;
      account_name_display: string;
      qr_template: string;
      confirmation_adapter: "payos";
    }>();
  const state = publicOrderState(order, attempt);
  const account = bindings.VIETQR_BANK_ACCOUNT?.trim() ?? "";
  const canResolveQr = Boolean(
    attempt
    && (state === "created" || state === "awaiting_payment")
    && attempt.account_ref === "VIETQR_BANK_ACCOUNT"
    && normalizeCurrency(order.currency) === "VND"
    && Number.isSafeInteger(order.total_minor)
    && order.total_minor > 0,
  );
  const canCreatePayment = canResolveQr && /^[0-9]{4,32}$/.test(account);
  let checkoutUrl: string | null = attempt?.checkout_url ?? null;
  // Prefer the exact payOS virtual destination when stored. Do not force the
  // merchant config BIN — it can diverge from the signed/recovered channel BIN.
  let qrUrl: string | null = canResolveQr && attempt
    ? resolveCustomerQrImageUrl({
      qrUrl: attempt.qr_image_url,
      amountMinor: order.total_minor,
      description: attempt.provider_description,
      bankBin: attempt.provider_bank_bin,
      accountNumber: attempt.provider_account_number,
      template: attempt.qr_template,
      accountName: attempt.account_name_display,
    })
    : null;

  // Recover the exact payOS destination. Never substitute the merchant base
  // account because payOS can assign a virtual account per payment link.
  // Never clear a previously resolved QR if the network recovery fails.
  const recoveryNeeded = Boolean(attempt && (!qrUrl || !checkoutUrl || !attempt.provider_reference
    || !attempt.provider_bank_bin || !attempt.provider_account_number));
  const recoveryClaimed = recoveryNeeded && attempt
    ? await claimPaymentRecovery(db, attempt.id, new Date().toISOString())
    : false;
  if (recoveryClaimed && canResolveQr && attempt?.provider_reference
    && (!qrUrl || !attempt.provider_bank_bin || !attempt.provider_account_number)) {
    const previousQr = qrUrl;
    try {
      const recoveredQr = await getPayOsCheckoutQr({
        paymentLinkId: attempt.provider_reference,
        expectedBin: attempt.provider_bank_bin || null,
        expectedAmount: order.total_minor,
        expectedDescription: attempt.provider_description ?? "",
        expectedAccountNumber: attempt.provider_account_number || null,
      });
      qrUrl = recoveredQr.qrUrl;
      await db.prepare(`UPDATE shop_payment_attempts SET qr_image_url = ?, provider_bank_bin = ?,
        provider_account_number = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'awaiting_payment')`)
        .bind(qrUrl, recoveredQr.bin, recoveredQr.accountNumber, new Date().toISOString(), attempt.id).run();
    } catch {
      qrUrl = previousQr;
    }
  }

  if (recoveryClaimed && canCreatePayment && attempt && (!checkoutUrl || !attempt.provider_reference || !qrUrl)) {
    const previousQr = qrUrl;
    try {
      const recovered = await createVietQrPayment(bindings, {
        orderId: order.id,
        providerConfigId: attempt.provider_config_id,
        expiresAt: attempt.expires_at,
      }, { id: "storefront-status", channel: "web" }, crypto.randomUUID());
      qrUrl = recovered.qrUrl || previousQr;
      checkoutUrl = recovered.checkoutUrl ?? checkoutUrl;
    } catch {
      // Keep any QR already resolved when payOS link recovery is transiently unavailable.
      qrUrl = previousQr;
    }
  }
  const activePayment = state === "created" || state === "awaiting_payment" || state === "confirming";
  const reconciliationDeadline = attempt ? payOsReconciliationDeadline(attempt.expires_at) : null;
  const paymentDescription = attempt?.provider_description
    ? normalizePayOsTransferDescription(attempt.provider_description) || attempt.provider_description
    : null;
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    orderReference: order.order_reference,
    paymentDescription,
    state,
    paymentAttemptId: attempt?.id ?? null,
    method: "bank_transfer_qr",
    provider: "vietqr",
    qrUrl,
    checkoutUrl,
    amountMinor: order.total_minor,
    currency: normalizeCurrency(order.currency),
    expiresAt: state === "confirming"
      ? reconciliationDeadline ?? attempt?.expires_at ?? order.expires_at
      : attempt?.expires_at ?? order.expires_at,
    paidAt: order.paid_at,
    fulfilledAt: order.fulfilled_at,
    pollingAfterSeconds: activePayment ? (qrUrl ? 8 : 2) : null,
    statusDetailCode: activePayment && !qrUrl ? "payment_configuration_unavailable" : null,
  };
}

// Keep these imports/exports available to adapters that need to precompute a
// blind index or derive a versioned context during key rotation.
export { computeInventoryKeyFingerprint, createShopCryptoContext, hashIdempotencyKey };
