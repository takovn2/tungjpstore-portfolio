export const SHOP_LOCALES = ["vi", "en", "ja", "zh"] as const;
export const SHOP_PRODUCT_TYPES = ["digital_key", "digital_download", "service"] as const;
export const SHOP_FULFILLMENT_TYPES = ["license_key", "download", "manual"] as const;
export const SHOP_DELIVERY_MODES = ["automatic", "manual"] as const;
export const SHOP_SOURCE_CHANNELS = ["web", "admin", "telegram", "api"] as const;
export const PAYMENT_CONFIRMATION_PROVIDERS = ["payos", "casso", "generic_signed", "manual"] as const;
export const SHOP_CRYPTO_PROVIDERS = ["bybit", "binance"] as const;
export const SHOP_CRYPTO_RAILS = ["internal_uid", "onchain_deposit", "pay_order"] as const;
export const SHOP_CRYPTO_ASSETS = ["USDT", "USDC"] as const;
export const SHOP_CRYPTO_NETWORKS = ["ETHEREUM", "BSC", "SOLANA", "POLYGON", "TRON"] as const;
export const SHOP_TELEGRAM_BOT_SCOPES = ["legacy", "glb"] as const;

export type ShopLocale = (typeof SHOP_LOCALES)[number];
export type ShopProductType = (typeof SHOP_PRODUCT_TYPES)[number];
export type ShopFulfillmentType = (typeof SHOP_FULFILLMENT_TYPES)[number];
export type ShopDeliveryMode = (typeof SHOP_DELIVERY_MODES)[number];
export type ShopSourceChannel = (typeof SHOP_SOURCE_CHANNELS)[number];
export type PaymentConfirmationProvider = (typeof PAYMENT_CONFIRMATION_PROVIDERS)[number];
export type ShopCryptoProvider = (typeof SHOP_CRYPTO_PROVIDERS)[number];
export type ShopCryptoRail = (typeof SHOP_CRYPTO_RAILS)[number];
export type ShopCryptoAsset = (typeof SHOP_CRYPTO_ASSETS)[number];
export type ShopCryptoNetwork = (typeof SHOP_CRYPTO_NETWORKS)[number];
export type ShopTelegramBotScope = (typeof SHOP_TELEGRAM_BOT_SCOPES)[number];
export type ShopCryptoMethodStatus = "disabled" | "active" | "archived";
export type ShopCryptoAttemptStatus = "created" | "awaiting_payment" | "detected" | "needs_review" | "confirmed" | "failed" | "expired" | "cancelled";
export type ShopProductStatus = "draft" | "active" | "archived";
export type ShopCategoryStatus = "active" | "archived";
export type ShopInventoryPolicy = "tracked" | "unlimited";
export type ShopAvailability = "in_stock" | "low_stock" | "out_of_stock" | "unlimited";
export type ShopOrderStatus = "pending_payment" | "processing" | "fulfilled" | "cancelled" | "expired" | "refunded";
export type ShopPaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "partially_refunded" | "refunded";
export type ShopFulfillmentStatus = "unfulfilled" | "partial" | "fulfilled" | "failed";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ShopBindings = Cloudflare.Env;

export type ProductLocalizationInput = {
  title: string;
  eyebrow?: string;
  shortDescription: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
};

export type VariantLocalizationInput = {
  title: string;
  optionSummary?: string;
};

export type ProductVariantInput = {
  id?: string;
  sku: string;
  status: ShopProductStatus;
  fulfillmentType: ShopFulfillmentType;
  deliveryMode: ShopDeliveryMode;
  inventoryPolicy: ShopInventoryPolicy;
  priceMinor: number;
  compareAtMinor?: number | null;
  currency: string;
  lowStockThreshold?: number;
  maxPerOrder?: number;
  optionValues?: Record<string, string>;
  metadata?: JsonObject;
  localizations: Partial<Record<ShopLocale, VariantLocalizationInput>>;
};

export type ProductMediaInput = {
  id?: string;
  variantId?: string | null;
  mediaId?: string | null;
  type: "image" | "video";
  url: string;
  alt: string;
  sortOrder?: number;
};

export type ProductUpsertInput = {
  slug: string;
  status: ShopProductStatus;
  productType: ShopProductType;
  featured?: boolean;
  sortOrder?: number;
  defaultLocale?: ShopLocale;
  coverMediaId?: string | null;
  metadata?: JsonObject;
  localizations: Partial<Record<ShopLocale, ProductLocalizationInput>>;
  variants: ProductVariantInput[];
  media?: ProductMediaInput[];
};

export type ShopCategoryLocalizationInput = {
  title: string;
  description?: string;
};

export type ShopCategoryInput = {
  slug: string;
  status: ShopCategoryStatus;
  sortOrder?: number;
  defaultLocale?: ShopLocale;
  localizations: Partial<Record<ShopLocale, ShopCategoryLocalizationInput>>;
};

export type ShopCategory = {
  id: string;
  slug: string;
  status: ShopCategoryStatus;
  sortOrder: number;
  defaultLocale: ShopLocale;
  version: number;
  usageCount: number;
  localizations: ShopCategoryInput["localizations"];
};

export type ProductMedia = {
  id: string;
  type: "image" | "video";
  url: string;
  alt: string;
  sortOrder: number;
};

export type PublicVariant = {
  id: string;
  sku: string;
  title: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  fulfillmentType: ShopFulfillmentType;
  deliveryMode: ShopDeliveryMode;
  availability: ShopAvailability;
  availableQuantity: number | null;
  /** Server-side per-order cap; cart/UI should clamp quantity to this. */
  maxPerOrder: number;
  optionValues: Record<string, string>;
};

export type PublicProduct = {
  id: string;
  slug: string;
  status: "active";
  featured: boolean;
  productType: ShopProductType;
  /** Optional merchandising category sourced from product metadata_json. */
  category?: string;
  categorySlug?: string;
  title: string;
  eyebrow?: string;
  shortDescription: string;
  description: string;
  locale: ShopLocale;
  fallbackLocale?: ShopLocale;
  badges: string[];
  media: ProductMedia[];
  variants: PublicVariant[];
  minPriceMinor: number;
  maxPriceMinor: number;
  currency: string;
  availability: ShopAvailability;
  seo: {
    title: string;
    description: string;
  };
};

export type InventoryImportInput = {
  variantId: string;
  keys: string[];
};

export type InventoryImportSourceFormat = "json" | "csv" | "txt";

export type InventoryImportPreviewInput = {
  variantId: string;
  rows: string[];
  sourceFormat: InventoryImportSourceFormat;
  sourceName?: string;
  sourceHash?: string;
  idempotencyKey: string;
};

export type InventoryImportPreviewRowStatus = "valid" | "invalid" | "duplicate_in_file" | "already_in_stock";

export type InventoryImportPreviewRow = {
  lineNumber: number;
  chunkIndex: number | null;
  maskedKey: string;
  status: InventoryImportPreviewRowStatus;
  errorCode: string | null;
};

export type InventoryImportPreviewResult = {
  batchId: string;
  variantId: string;
  status: "ready" | "completed";
  sourceFormat: InventoryImportSourceFormat;
  sourceName: string | null;
  totalRows: number;
  validRows: number;
  duplicateInFileCount: number;
  duplicateInStockCount: number;
  invalidCount: number;
  chunkCount: number;
  rows: InventoryImportPreviewRow[];
  idempotentReplay: boolean;
};

export type InventoryImportChunkInput = {
  batchId: string;
  chunkIndex: number;
  rows: Array<{ lineNumber: number; key: string }>;
};

export type InventoryImportChunkResult = {
  batchId: string;
  variantId: string;
  chunkIndex: number;
  status: "completed";
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  batchStatus: "processing" | "completed" | "partial";
  batchImportedCount: number;
  batchSkippedCount: number;
  batchFailedCount: number;
  idempotentReplay: boolean;
};

export const SHOP_CRYPTO_VERSION = "aes-256-gcm-envelope-v1" as const;
export type ShopCryptoVersion = typeof SHOP_CRYPTO_VERSION;

export type EncryptedInventoryUnit = {
  id: string;
  variantId: string;
  cryptoVersion: ShopCryptoVersion;
  keyVersion: string;
  ciphertextB64: string;
  dataIvB64: string;
  wrappedDekB64: string;
  wrapIvB64: string;
  keyFingerprint: string;
};

export type EncryptedInventoryUnitRow = EncryptedInventoryUnit & {
  status: "available" | "reserved" | "fulfilled" | "quarantined" | "revoked";
};

export type CheckoutCustomerInput = {
  email: string;
  displayName: string;
  phone?: string;
  locale?: ShopLocale;
  marketingConsent?: boolean;
  telegramSubject?: string;
  telegramBotConfigId?: string;
};

export type CheckoutItemInput = {
  variantId: string;
  quantity: number;
};

export type CreateCheckoutInput = {
  customer: CheckoutCustomerInput;
  items: CheckoutItemInput[];
  locale?: ShopLocale;
  sourceChannel?: ShopSourceChannel;
  externalReference?: string;
  discountCode?: string;
  paymentMethodId?: string;
  /** Internal server-selected pricing projection; never accepted from clients. */
  pricingCurrency?: "VND" | "USD";
  /**
   * Internal server-selected market, resolved from the request the same way the
   * catalogue resolves it. Snapshotted onto the order so a price can be audited
   * against the market that produced it. Never accepted from clients.
   */
  marketCode?: string;
};

export type ShopCryptoPaymentMethod = {
  id: string;
  storefrontScope: ShopTelegramBotScope;
  provider: ShopCryptoProvider;
  rail: ShopCryptoRail;
  asset: ShopCryptoAsset;
  network: string;
  verificationMode: "manual";
  destinationType: "uid" | "wallet_address";
  destinationValue: string;
  memoOrTag: string;
  displayName: string;
  status: ShopCryptoMethodStatus;
  minConfirmations: number;
  expiryMinutes: number;
  sortOrder: number;
  version: number;
  publicConfig: JsonObject;
  createdAt?: string;
  updatedAt?: string;
};

export type ShopCryptoPaymentMethodInput = {
  storefrontScope?: ShopTelegramBotScope;
  provider: ShopCryptoProvider;
  rail: ShopCryptoRail;
  asset: ShopCryptoAsset;
  network?: string;
  destinationType: "uid" | "wallet_address";
  destinationValue: string;
  memoOrTag?: string;
  displayName: string;
  status: ShopCryptoMethodStatus;
  minConfirmations?: number;
  expiryMinutes?: number;
  sortOrder?: number;
  publicConfig?: JsonObject;
};

export type ShopPaymentProof = {
  id: string;
  orderId: string;
  paymentAttemptId: string | null;
  filename: string;
  mimeType: string;
  byteSize: number;
  transactionReference: string | null;
  status: "submitted" | "reviewed" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  downloadUrl?: string;
};

export type ShopCryptoPaymentView = {
  orderId: string;
  orderNumber: string;
  orderReference: string;
  state: "awaiting_payment" | "detected" | "under_review" | "paid" | "expired" | "failed";
  verificationStatus: ShopCryptoAttemptStatus;
  paymentAttemptId: string;
  method: "crypto_transfer";
  provider: ShopCryptoProvider;
  rail: ShopCryptoRail;
  asset: ShopCryptoAsset;
  network: string;
  destinationType: "uid" | "wallet_address";
  destination: string;
  memoOrTag: string;
  amountMinor: number;
  amountAtomic: string;
  amountDisplay: string;
  currency: "USD";
  expiresAt: string;
  pollingAfterSeconds: number;
  qrUrl: string | null;
  accountUid?: string | null;
};

export type CheckoutLine = {
  orderItemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  sku: string;
  productTitle: string;
  variantTitle: string;
  fulfillmentType: ShopFulfillmentType;
  deliveryMode: ShopDeliveryMode;
  inventoryPolicy: ShopInventoryPolicy;
  currency: string;
  variantVersion: number;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** Base VND snapshot used for inventory-price guards and audit display. */
  baseCurrency?: string;
  baseUnitPriceMinor?: number;
  exchangeRateVndPerUsd?: number | null;
};

export type CheckoutResult = {
  orderId: string;
  orderNumber: string;
  orderReference: string;
  // Present on the first response. Replays intentionally omit it because the
  // idempotency record never stores a bearer token in plaintext.
  orderAccessToken: string | null;
  status: ShopOrderStatus;
  paymentStatus: ShopPaymentStatus;
  fulfillmentStatus: ShopFulfillmentStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  expiresAt: string;
  lines: CheckoutLine[];
  idempotentReplay: boolean;
};

export type DiscountUpsertInput = {
  code: string;
  status: "draft" | "active" | "paused" | "archived";
  type: "percentage" | "fixed_amount";
  value: number;
  currency?: string | null;
  minimumSubtotalMinor?: number;
  maximumDiscountMinor?: number | null;
  maximumRedemptions?: number | null;
  maximumPerCustomer?: number | null;
  stackable?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  productIds?: string[];
  variantIds?: string[];
  metadata?: JsonObject;
};

export type PaymentProviderConfigInput = {
  displayName: string;
  status: "disabled" | "active" | "archived";
  provider: "vietqr";
  bankId: string;
  accountRef: "VIETQR_BANK_ACCOUNT";
  accountNameDisplay?: string;
  qrTemplate?: string;
  confirmationAdapter: "payos";
  secretRef: "PAYOS_CHECKSUM_KEY";
  publicConfig?: JsonObject;
};

export type PaymentAttemptInput = {
  orderId: string;
  providerConfigId: string;
  providerReference?: string | null;
  providerOrderCode?: number | null;
  providerDescription?: string | null;
  checkoutUrl?: string | null;
  qrImageUrl?: string | null;
  qrPayloadHash?: string | null;
  expiresAt: string;
};

export type PaymentConfirmationInput = {
  provider: "payos" | "casso" | "generic_signed" | "manual";
  providerEventId: string;
  providerReference?: string | null;
  providerOrderCode?: number | null;
  destinationAccountNumber?: string | null;
  transactionReference?: string | null;
  orderReference: string;
  amountMinor: number;
  currency: string;
  payloadHash: string;
  signatureVerified: boolean;
  occurredAt: string;
};

export type PaymentReconciliationContext = {
  payOsAccountNumber?: string;
};

export type PaymentAttempt = {
  id: string;
  orderId: string;
  provider: "vietqr";
  confirmationProvider: PaymentConfirmationProvider;
  status: "created" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "cancelled";
  amountMinor: number;
  currency: string;
  orderReference: string;
  providerReference: string | null;
  providerOrderCode: number | null;
  providerDescription: string | null;
  checkoutUrl: string | null;
  qrImageUrl: string | null;
  expiresAt: string;
  confirmedAt: string | null;
};

export type CheckoutPaymentView = {
  orderId: string;
  orderNumber: string;
  orderReference: string;
  state: "awaiting_payment" | "confirming" | "paid" | "expired" | "failed";
  paymentAttemptId: string;
  method: "bank_transfer_qr";
  provider: "vietqr";
  qrUrl: string;
  paymentDescription: string;
  qrPayload?: string;
  checkoutUrl?: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
  pollingAfterSeconds: number;
};

export type ShopCheckoutReadiness =
  | { ready: true }
  | { ready: false; code: "shop_database_not_configured" | "vietqr_bank_account_not_configured" | "vietqr_config_not_found" | "payos_not_configured" | "shop_public_origin_invalid" | "shop_order_token_not_configured" | "crypto_provider_not_configured" | "crypto_catalog_currency_not_usd" };

export type PublicShopOrderState =
  | "created"
  | "awaiting_payment"
  | "confirming"
  | "paid"
  | "fulfilled"
  | "expired"
  | "failed"
  | "cancelled";

export type PublicShopOrderStatus = {
  orderId: string;
  orderNumber: string;
  /** Internal order id shown to the customer (TUNG…). Not bank transfer content. */
  orderReference: string;
  /**
   * Exact transfer note / VietQR addInfo / payOS description.
   * Must match QR content and reconciliation — never the TUNG order reference.
   */
  paymentDescription: string | null;
  state: PublicShopOrderState;
  paymentAttemptId: string | null;
  method: "bank_transfer_qr" | "crypto_transfer";
  provider: "vietqr" | ShopCryptoProvider;
  qrUrl: string | null;
  checkoutUrl: string | null;
  amountMinor: number;
  currency: string;
  expiresAt: string | null;
  paidAt: string | null;
  fulfilledAt: string | null;
  pollingAfterSeconds: number | null;
  statusDetailCode: "payment_configuration_unavailable" | null;
  verificationStatus?: ShopCryptoAttemptStatus | null;
  rail?: ShopCryptoRail | null;
  asset?: ShopCryptoAsset | null;
  network?: string | null;
  destinationType?: "uid" | "wallet_address" | null;
  destination?: string | null;
  memoOrTag?: string | null;
  amountAtomic?: string | null;
  amountDisplay?: string | null;
  accountUid?: string | null;
  transactionReference?: string | null;
  paymentProofs?: ShopPaymentProof[];
};

export type PublicShopDeliveryItem = {
  itemId: string;
  sku: string;
  title: string;
  quantity: number;
  keys: string[];
};

export type PublicShopDeliveryResult = {
  orderId: string;
  orderNumber: string;
  state: "paid" | "fulfilled";
  deliveries: PublicShopDeliveryItem[];
  deliveredAt: string | null;
};

export type PaymentReconciliationResult = {
  eventId: string;
  orderId: string | null;
  paymentAttemptId: string | null;
  outcome: "paid" | "already_processed" | "rejected" | "unmatched";
  code?: string;
};

export type FulfillmentDelivery = {
  orderId: string;
  orderItemId: string;
  allocationId: string;
  inventoryUnitId: string;
  plaintextKey: string;
  leaseToken: string;
  leaseExpiresAt: string;
};

export type OutboxMessage = {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  destination: string;
  dedupeKey: string;
  payload: JsonObject;
  attemptCount: number;
  availableAt: string;
};

export type ValidationIssue = {
  path: string;
  code: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type ShopActor = {
  id: string;
  channel: "admin" | "system" | "web" | "telegram" | "api";
};
