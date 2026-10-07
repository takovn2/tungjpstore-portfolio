-- Digital-commerce core for CONTENT_DB. D1 is the source of truth for price,
-- inventory, orders, payments and fulfillment; Notion is an editorial/sync surface only.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  product_type TEXT NOT NULL DEFAULT 'digital_key' CHECK (product_type IN ('digital_key', 'digital_download', 'service')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  default_locale TEXT NOT NULL DEFAULT 'vi' CHECK (default_locale IN ('vi', 'en', 'ja', 'zh')),
  cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_products_slug_active
  ON shop_products (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_products_storefront
  ON shop_products (status, featured DESC, sort_order, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shop_product_localizations (
  product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  title TEXT NOT NULL,
  eyebrow TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_shop_product_localizations_locale
  ON shop_product_localizations (locale, product_id);

CREATE TABLE IF NOT EXISTS shop_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('license_key', 'download', 'manual')),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('automatic', 'manual')),
  inventory_policy TEXT NOT NULL CHECK (inventory_policy IN ('tracked', 'unlimited')),
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  compare_at_minor INTEGER CHECK (compare_at_minor IS NULL OR compare_at_minor >= price_minor),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0 AND low_stock_threshold <= 1000000),
  max_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_per_order >= 1 AND max_per_order <= 1000),
  option_values_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_variants_sku_active
  ON shop_variants (sku)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_variants_product_status
  ON shop_variants (product_id, status, price_minor, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shop_variant_localizations (
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  title TEXT NOT NULL,
  option_summary TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (variant_id, locale)
);

CREATE TABLE IF NOT EXISTS shop_product_media (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES shop_variants(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  asset_url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CHECK (variant_id IS NULL OR length(variant_id) > 0)
);

CREATE INDEX IF NOT EXISTS idx_shop_product_media_order
  ON shop_product_media (product_id, sort_order, id);

CREATE TABLE IF NOT EXISTS shop_customers (
  id TEXT PRIMARY KEY,
  email_normalized TEXT COLLATE NOCASE,
  email_masked TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'archived')),
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (email_normalized IS NULL OR length(email_normalized) <= 320)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_customers_email_active
  ON shop_customers (email_normalized)
  WHERE email_normalized IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_customers_created
  ON shop_customers (created_at DESC);

CREATE TABLE IF NOT EXISTS shop_customer_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('email', 'telegram', 'notion', 'external')),
  external_subject TEXT NOT NULL,
  display_handle TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, external_subject)
);

CREATE INDEX IF NOT EXISTS idx_shop_customer_identities_customer
  ON shop_customer_identities (customer_id, provider);

CREATE TABLE IF NOT EXISTS shop_discounts (
  id TEXT PRIMARY KEY,
  code_normalized TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  value INTEGER NOT NULL CHECK (value > 0),
  currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))),
  minimum_subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (minimum_subtotal_minor >= 0),
  maximum_discount_minor INTEGER CHECK (maximum_discount_minor IS NULL OR maximum_discount_minor >= 0),
  maximum_redemptions INTEGER CHECK (maximum_redemptions IS NULL OR maximum_redemptions >= 1),
  maximum_per_customer INTEGER CHECK (maximum_per_customer IS NULL OR maximum_per_customer >= 1),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  stackable INTEGER NOT NULL DEFAULT 0 CHECK (stackable IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (discount_type = 'percentage' OR currency IS NOT NULL),
  CHECK (discount_type != 'percentage' OR value <= 10000),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_discounts_code_active
  ON shop_discounts (code_normalized)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_discounts_active_window
  ON shop_discounts (status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS shop_discount_targets (
  discount_id TEXT NOT NULL REFERENCES shop_discounts(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'variant')),
  target_id TEXT NOT NULL,
  PRIMARY KEY (discount_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_discount_targets_lookup
  ON shop_discount_targets (target_type, target_id, discount_id);

CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL COLLATE NOCASE,
  order_reference TEXT NOT NULL COLLATE NOCASE,
  public_token_hash TEXT NOT NULL UNIQUE,
  checkout_subject_hash TEXT CHECK (checkout_subject_hash IS NULL OR length(checkout_subject_hash) = 43),
  customer_id TEXT REFERENCES shop_customers(id) ON DELETE SET NULL,
  source_channel TEXT NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web', 'admin', 'telegram', 'api')),
  external_reference TEXT,
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en', 'ja', 'zh')),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'processing', 'fulfilled', 'cancelled', 'expired', 'refunded')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'failed')),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  discount_code_snapshot TEXT,
  customer_email_snapshot TEXT,
  customer_name_snapshot TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  expires_at TEXT,
  paid_at TEXT,
  fulfilled_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_number),
  UNIQUE (order_reference),
  CHECK (discount_minor <= subtotal_minor),
  CHECK (total_minor = subtotal_minor - discount_minor + tax_minor)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_orders_channel_reference
  ON shop_orders (source_channel, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_orders_status_updated
  ON shop_orders (status, payment_status, fulfillment_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_orders_customer_created
  ON shop_orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_orders_checkout_subject
  ON shop_orders (checkout_subject_hash, status, expires_at)
  WHERE checkout_subject_hash IS NOT NULL;

-- One fixed-window row per pseudonymous checkout subject. The subject is an
-- HMAC of the client address, never a raw IP address.
CREATE TABLE IF NOT EXISTS shop_checkout_rate_limits (
  subject_hash TEXT PRIMARY KEY CHECK (length(subject_hash) = 43),
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1 AND request_count <= 1000000),
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expires_at > window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_shop_checkout_rate_limits_expiry
  ON shop_checkout_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number >= 1),
  product_id TEXT REFERENCES shop_products(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES shop_variants(id) ON DELETE SET NULL,
  product_slug_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  product_title_snapshot TEXT NOT NULL,
  variant_title_snapshot TEXT NOT NULL,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('license_key', 'download', 'manual')),
  delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_mode IN ('automatic', 'manual')),
  inventory_policy TEXT NOT NULL DEFAULT 'tracked' CHECK (inventory_policy IN ('tracked', 'unlimited')),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 1000),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'fulfilled', 'failed', 'cancelled')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_id, line_number),
  CHECK (subtotal_minor = unit_price_minor * quantity),
  CHECK (discount_minor <= subtotal_minor),
  CHECK (total_minor = subtotal_minor - discount_minor)
);

CREATE INDEX IF NOT EXISTS idx_shop_order_items_order
  ON shop_order_items (order_id, line_number);

CREATE INDEX IF NOT EXISTS idx_shop_order_items_delivery
  ON shop_order_items (order_id, fulfillment_type, delivery_mode, fulfillment_status);

CREATE TABLE IF NOT EXISTS shop_discount_redemptions (
  id TEXT PRIMARY KEY,
  discount_id TEXT NOT NULL REFERENCES shop_discounts(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES shop_customers(id) ON DELETE SET NULL,
  code_snapshot TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
  committed_at TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (discount_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_discount_redemptions_customer
  ON shop_discount_redemptions (discount_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shop_discount_redemptions_quota
  ON shop_discount_redemptions (discount_id, status, created_at DESC)
  WHERE status IN ('reserved', 'committed');

-- Every stored key is envelope-encrypted. The keyed fingerprint is a blind
-- index for duplicate detection; no plaintext or reversible preview exists.
CREATE TABLE IF NOT EXISTS shop_inventory_units (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'fulfilled', 'quarantined', 'revoked')),
  crypto_version TEXT NOT NULL CHECK (crypto_version = 'aes-256-gcm-envelope-v1'),
  key_version TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  data_iv_b64 TEXT NOT NULL,
  wrapped_dek_b64 TEXT NOT NULL,
  wrap_iv_b64 TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  fulfilled_at TEXT,
  CHECK (length(data_iv_b64) = 16),
  CHECK (length(wrap_iv_b64) = 16),
  CHECK (length(wrapped_dek_b64) = 64),
  CHECK (length(key_fingerprint) = 43),
  CHECK (length(ciphertext_b64) >= 23)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_variant_fingerprint
  ON shop_inventory_units (variant_id, key_fingerprint);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_variant_status
  ON shop_inventory_units (variant_id, status, imported_at, id);

CREATE TABLE IF NOT EXISTS shop_inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES shop_order_items(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'expired', 'cancelled', 'released')),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 1000),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_reservations_status_expiry
  ON shop_inventory_reservations (status, expires_at, created_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS shop_inventory_allocations (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES shop_inventory_reservations(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES shop_order_items(id) ON DELETE CASCADE,
  inventory_unit_id TEXT NOT NULL REFERENCES shop_inventory_units(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'delivering', 'fulfilled', 'released')),
  lease_token_hash TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  fulfilled_at TEXT,
  released_at TEXT,
  release_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_allocation_live
  ON shop_inventory_allocations (inventory_unit_id)
  WHERE status IN ('held', 'delivering');

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_allocation_fulfilled
  ON shop_inventory_allocations (inventory_unit_id)
  WHERE status = 'fulfilled';

CREATE INDEX IF NOT EXISTS idx_shop_inventory_allocations_reservation
  ON shop_inventory_allocations (reservation_id, status, created_at);

CREATE TABLE IF NOT EXISTS shop_idempotency_keys (
  namespace TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'completed', 'failed')),
  resource_type TEXT,
  resource_id TEXT,
  response_status INTEGER,
  response_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_shop_idempotency_expiry
  ON shop_idempotency_keys (expires_at, state);

-- Configuration stores symbolic secret/account references only. Actual bank
-- account numbers and provider signing secrets remain Worker secrets.
CREATE TABLE IF NOT EXISTS shop_payment_provider_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('vietqr')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'archived')),
  bank_id TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  account_name_display TEXT NOT NULL DEFAULT '',
  qr_template TEXT NOT NULL DEFAULT 'compact2',
  confirmation_adapter TEXT NOT NULL CHECK (confirmation_adapter IN ('payos', 'casso', 'generic_signed', 'manual')),
  secret_ref TEXT,
  public_config_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_provider_active
  ON shop_payment_provider_configs (provider)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS shop_payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  provider_config_id TEXT NOT NULL REFERENCES shop_payment_provider_configs(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('vietqr')),
  confirmation_provider TEXT NOT NULL CHECK (confirmation_provider IN ('payos', 'casso', 'generic_signed', 'manual')),
  method TEXT NOT NULL DEFAULT 'bank_transfer_qr' CHECK (method = 'bank_transfer_qr'),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'awaiting_payment', 'confirmed', 'failed', 'expired', 'cancelled')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  order_reference TEXT NOT NULL COLLATE NOCASE,
  provider_reference TEXT,
  qr_payload_hash TEXT,
  failure_code TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_provider_reference
  ON shop_payment_attempts (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_order
  ON shop_payment_attempts (order_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_payment_attempt_live_order
  ON shop_payment_attempts (order_id)
  WHERE status IN ('created', 'awaiting_payment');

CREATE INDEX IF NOT EXISTS idx_shop_payment_attempt_expiry
  ON shop_payment_attempts (status, expires_at)
  WHERE status IN ('created', 'awaiting_payment');

CREATE TABLE IF NOT EXISTS shop_payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('vietqr', 'payos', 'casso', 'generic_signed', 'manual')),
  provider_event_id TEXT NOT NULL,
  payment_attempt_id TEXT REFERENCES shop_payment_attempts(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES shop_orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  transaction_reference TEXT,
  amount_minor INTEGER,
  currency TEXT,
  order_reference TEXT,
  payload_hash TEXT NOT NULL,
  signature_verified INTEGER NOT NULL CHECK (signature_verified IN (0, 1)),
  match_state TEXT NOT NULL CHECK (match_state IN ('matched', 'unmatched', 'amount_mismatch', 'currency_mismatch', 'invalid_signature')),
  processing_state TEXT NOT NULL CHECK (processing_state IN ('accepted', 'ignored', 'rejected', 'processed')),
  error_code TEXT,
  occurred_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_payment_events_order
  ON shop_payment_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_fulfillment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  order_item_id TEXT REFERENCES shop_order_items(id) ON DELETE CASCADE,
  inventory_unit_id TEXT REFERENCES shop_inventory_units(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('requested', 'claimed', 'delivered', 'failed', 'revoked')),
  channel TEXT NOT NULL CHECK (channel IN ('web', 'email', 'telegram', 'manual', 'api')),
  provider_reference TEXT,
  error_code TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_fulfillment_events_order
  ON shop_fulfillment_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_integration_endpoints (
  id TEXT PRIMARY KEY,
  destination TEXT NOT NULL CHECK (destination IN ('telegram_vps', 'notion', 'email', 'generic_webhook')),
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'archived')),
  endpoint_url TEXT,
  secret_ref TEXT,
  subscribed_topics_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_webhook_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000),
  available_at TEXT NOT NULL,
  locked_by TEXT,
  lock_expires_at TEXT,
  last_error_code TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (destination, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_shop_webhook_outbox_dispatch
  ON shop_webhook_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS shop_external_mappings (
  provider TEXT NOT NULL CHECK (provider IN ('notion', 'telegram', 'external')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'variant', 'customer', 'order')),
  entity_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  sync_cursor TEXT,
  last_synced_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, entity_type, entity_id),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_external_mappings_entity
  ON shop_external_mappings (entity_type, entity_id, provider);
