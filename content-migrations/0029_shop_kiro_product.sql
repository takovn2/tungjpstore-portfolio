-- Add Kiro digital-key product with four credit tiers (expire 2026-08-01).
-- Inventory keys are NOT created here; import via admin or scripts/import-kiro-inventory.mjs.
PRAGMA foreign_keys = ON;

INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-kiro',
  'kiro',
  'active',
  'digital_key',
  0,
  140,
  'vi',
  NULL,
  json_object(
    'categorySlug', 'productivity',
    'category', 'Năng suất',
    'termMonths', 0,
    'expiresOn', '2026-08-01',
    'provider', 'Kiro',
    'badges', json_array('Hạn 01/08', 'Giao key tự động', 'Theo credit'),
    'seedKey', 'shop-kiro-2026-07-25-v1'
  ),
  1,
  '2026-07-25T00:00:00.000Z',
  'seed:shop-kiro:2026-07-25:v1',
  'seed:shop-kiro:2026-07-25:v1',
  '2026-07-25T00:00:00.000Z',
  '2026-07-25T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM shop_products p WHERE p.slug = 'kiro' AND p.deleted_at IS NULL
);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES
  (
    'catalog-product-kiro', 'vi', 'Kiro', 'AI IDE · Hạn 01/08',
    'Gói Kiro (AWS AI IDE) theo credit, giao tài khoản dạng mail|pass|2fa. Hạn dùng đến 01/08/2026.',
    'Kiro là AI IDE agentic (xây bởi AWS) hỗ trợ spec-driven development, agent song song và coding workflow.

Giao hàng: tài khoản số định dạng email|password|2fa sau khi thanh toán được xác nhận.
Hạn dùng chung: đến hết ngày 01/08/2026 (theo gói được bàn giao).
Chọn biến thể theo số credit: Pro 1.000 · Pro+ 2.000 · Pro Max 5.000 · Power 10.000.

Lưu ý: quyền lợi, model và credit phụ thuộc chính sách nhà cung cấp; kiểm tra mô tả biến thể và tồn kho trước khi mua.',
    'Kiro AI IDE — gói credit hạn 01/08 | DigiStore',
    'Mua gói Kiro AI IDE theo credit tại DigiStore. Pro / Pro+ / Pro Max / Power, giao key tự động, hạn 01/08/2026.'
  ),
  (
    'catalog-product-kiro', 'en', 'Kiro', 'AI IDE · Expires Aug 1',
    'Kiro (AWS AI IDE) credit packages delivered as mail|pass|2fa. Valid through 2026-08-01.',
    'Kiro is an agentic AI IDE (built by AWS) for spec-driven development, parallel agents, and coding workflows.

Delivery: digital account in email|password|2fa form after payment is confirmed.
Shared expiry: through 2026-08-01 for the delivered tier.
Tiers by credit: Pro 1,000 · Pro+ 2,000 · Pro Max 5,000 · Power 10,000.

Note: entitlements, models, and credits follow the provider policy; review the variant description and stock before purchase.',
    'Kiro AI IDE — credit packs until Aug 1 | DigiStore',
    'Buy Kiro AI IDE credit packages at DigiStore. Pro / Pro+ / Pro Max / Power with automatic key delivery. Expires 2026-08-01.'
  ),
  (
    'catalog-product-kiro', 'ja', 'Kiro', 'AI IDE · 有効期限 8/1',
    'Kiro（AWS AI IDE）のクレジットパッケージ。mail|pass|2fa 形式で納品。有効期限 2026-08-01。',
    'KiroはAWSが提供するエージェント型AI IDEで、仕様駆動開発や並列エージェント、コーディング作業を支援します。

納品：支払い確認後に email|password|2fa 形式のアカウント情報を提供します。
共通有効期限：2026-08-01まで。
クレジット別：Pro 1,000 · Pro+ 2,000 · Pro Max 5,000 · Power 10,000。

注意：特典・モデル・クレジットは提供元ポリシーに準じます。購入前にバリエーション説明と在庫をご確認ください。',
    'Kiro AI IDE — クレジットパック（〜8/1）| DigiStore',
    'DigiStoreでKiro AI IDEのクレジットパッケージを購入。Pro / Pro+ / Pro Max / Power。自動キー納品。有効期限 2026-08-01。'
  ),
  (
    'catalog-product-kiro', 'zh', 'Kiro', 'AI IDE · 有效期至 8/1',
    'Kiro（AWS AI IDE）按积分套餐，以 mail|pass|2fa 形式交付。有效期至 2026-08-01。',
    'Kiro 是由 AWS 打造的智能体 AI IDE，支持规格驱动开发、并行智能体与编程工作流。

交付：付款确认后提供 email|password|2fa 格式的账号信息。
统一有效期：至 2026-08-01。
按积分分档：Pro 1,000 · Pro+ 2,000 · Pro Max 5,000 · Power 10,000。

注意：权益、模型与积分以服务提供方政策为准；购买前请确认变体说明与库存。',
    'Kiro AI IDE — 积分套餐（至 8/1）| DigiStore',
    '在 DigiStore 购买 Kiro AI IDE 积分套餐。Pro / Pro+ / Pro Max / Power，自动交付密钥。有效期至 2026-08-01。'
  );

-- Pro 1000cr / 35k
INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kiro-pro', 'catalog-product-kiro', 'KIRO-PRO-1K', 'active',
  'license_key', 'automatic', 'tracked', 35000, NULL, 'VND', 5, 1,
  json_object('plan', 'pro', 'credits', 1000, 'expiresOn', '2026-08-01', 'deliveryFormat', 'mail|pass|2fa'),
  json_object('credits', 1000, 'expiresOn', '2026-08-01', 'plan', 'pro', 'seedKey', 'shop-kiro-2026-07-25-v1'),
  1, '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kiro' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KIRO-PRO-1K' COLLATE NOCASE AND deleted_at IS NULL);

-- Pro+ 2000cr / 50k
INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kiro-pro-plus', 'catalog-product-kiro', 'KIRO-PRO-PLUS-2K', 'active',
  'license_key', 'automatic', 'tracked', 50000, NULL, 'VND', 5, 1,
  json_object('plan', 'pro_plus', 'credits', 2000, 'expiresOn', '2026-08-01', 'deliveryFormat', 'mail|pass|2fa'),
  json_object('credits', 2000, 'expiresOn', '2026-08-01', 'plan', 'pro_plus', 'seedKey', 'shop-kiro-2026-07-25-v1'),
  1, '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kiro' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KIRO-PRO-PLUS-2K' COLLATE NOCASE AND deleted_at IS NULL);

-- Pro Max 5000cr / 75k
INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kiro-promax', 'catalog-product-kiro', 'KIRO-PROMAX-5K', 'active',
  'license_key', 'automatic', 'tracked', 75000, NULL, 'VND', 5, 1,
  json_object('plan', 'pro_max', 'credits', 5000, 'expiresOn', '2026-08-01', 'deliveryFormat', 'mail|pass|2fa'),
  json_object('credits', 5000, 'expiresOn', '2026-08-01', 'plan', 'pro_max', 'seedKey', 'shop-kiro-2026-07-25-v1'),
  1, '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kiro' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KIRO-PROMAX-5K' COLLATE NOCASE AND deleted_at IS NULL);

-- Power 10000cr / 100k
INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kiro-power', 'catalog-product-kiro', 'KIRO-POWER-10K', 'active',
  'license_key', 'automatic', 'tracked', 100000, NULL, 'VND', 5, 1,
  json_object('plan', 'power', 'credits', 10000, 'expiresOn', '2026-08-01', 'deliveryFormat', 'mail|pass|2fa'),
  json_object('credits', 10000, 'expiresOn', '2026-08-01', 'plan', 'power', 'seedKey', 'shop-kiro-2026-07-25-v1'),
  1, '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kiro' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KIRO-POWER-10K' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES
  ('catalog-variant-kiro-pro', 'vi', 'Kiro Pro · 1.000 credit', 'Credit: 1.000 · Hạn: 01/08/2026'),
  ('catalog-variant-kiro-pro', 'en', 'Kiro Pro · 1,000 credits', 'Credits: 1,000 · Expires: 2026-08-01'),
  ('catalog-variant-kiro-pro', 'ja', 'Kiro Pro · 1,000クレジット', 'クレジット: 1,000 · 有効期限: 2026-08-01'),
  ('catalog-variant-kiro-pro', 'zh', 'Kiro Pro · 1,000 积分', '积分: 1,000 · 有效期: 2026-08-01'),
  ('catalog-variant-kiro-pro-plus', 'vi', 'Kiro Pro+ · 2.000 credit', 'Credit: 2.000 · Hạn: 01/08/2026'),
  ('catalog-variant-kiro-pro-plus', 'en', 'Kiro Pro+ · 2,000 credits', 'Credits: 2,000 · Expires: 2026-08-01'),
  ('catalog-variant-kiro-pro-plus', 'ja', 'Kiro Pro+ · 2,000クレジット', 'クレジット: 2,000 · 有効期限: 2026-08-01'),
  ('catalog-variant-kiro-pro-plus', 'zh', 'Kiro Pro+ · 2,000 积分', '积分: 2,000 · 有效期: 2026-08-01'),
  ('catalog-variant-kiro-promax', 'vi', 'Kiro Pro Max · 5.000 credit', 'Credit: 5.000 · Hạn: 01/08/2026'),
  ('catalog-variant-kiro-promax', 'en', 'Kiro Pro Max · 5,000 credits', 'Credits: 5,000 · Expires: 2026-08-01'),
  ('catalog-variant-kiro-promax', 'ja', 'Kiro Pro Max · 5,000クレジット', 'クレジット: 5,000 · 有効期限: 2026-08-01'),
  ('catalog-variant-kiro-promax', 'zh', 'Kiro Pro Max · 5,000 积分', '积分: 5,000 · 有效期: 2026-08-01'),
  ('catalog-variant-kiro-power', 'vi', 'Kiro Power · 10.000 credit', 'Credit: 10.000 · Hạn: 01/08/2026'),
  ('catalog-variant-kiro-power', 'en', 'Kiro Power · 10,000 credits', 'Credits: 10,000 · Expires: 2026-08-01'),
  ('catalog-variant-kiro-power', 'ja', 'Kiro Power · 10,000クレジット', 'クレジット: 10,000 · 有効期限: 2026-08-01'),
  ('catalog-variant-kiro-power', 'zh', 'Kiro Power · 10,000 积分', '积分: 10,000 · 有效期: 2026-08-01');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-kiro',
  'catalog-product-kiro',
  NULL,
  NULL,
  'image',
  'https://media.tungjpstore.net/shop/kiro.webp',
  'Ảnh bìa Kiro AI IDE — logo chính thức, gói credit hạn 01/08',
  0,
  '2026-07-25T00:00:00.000Z'
);

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-kiro-2026-07-25-v1',
  'seed:shop-kiro:2026-07-25:v1',
  'shop.product.seeded',
  'shop_product',
  'catalog-product-kiro',
  NULL,
  json_object(
    'slug', 'kiro',
    'variants', 4,
    'pricesVnd', json_array(35000, 50000, 75000, 100000),
    'credits', json_array(1000, 2000, 5000, 10000),
    'expiresOn', '2026-08-01',
    'inventoryCreated', 0
  ),
  '2026-07-25T00:00:00.000Z'
);
