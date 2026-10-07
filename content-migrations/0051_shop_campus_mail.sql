-- Campus Mail Lab: fictional .edu inboxes for storefront automation tests.
-- Inventory keys are NOT created here; import via scripts/import-campus-mail-inventory.mjs.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-campus-mail',
  'campus-mail',
  'active',
  'digital_key',
  1,
  5,
  'vi',
  NULL,
  json_object(
    'categorySlug', 'productivity',
    'category', 'Năng suất',
    'provider', 'Campus Mail Lab',
    'badges', json_array('Campus giả định', 'Giao mail|pass|2fa', 'Test tự động hóa'),
    'seedKey', 'shop-campus-mail-2026-08-14-v1',
    'fictional', 1
  ),
  1,
  '2026-08-14T00:00:00.000Z',
  'seed:shop-campus-mail:2026-08-14:v1',
  'seed:shop-campus-mail:2026-08-14:v1',
  '2026-08-14T00:00:00.000Z',
  '2026-08-14T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM shop_products p WHERE p.slug = 'campus-mail' AND p.deleted_at IS NULL
);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES
  (
    'catalog-product-campus-mail', 'vi',
    'Campus Mail',
    'Hộp thư campus giả định',
    'Ba miền trường không tồn tại — Quillmere, Lanternwick, Mossglen. Giao email|password|2fa để test kho và luồng tự động.',
    'Campus Mail là bộ hộp thư campus giả định trên 3 miền trường không có thật. Mỗi đơn giao một dòng email|password|2fa để bạn test parser kho, Telegram và luồng nhận hàng tự động.

## Ba miền campus

- Quillmere College — @quillmere.edu — 99.000đ
- Lanternwick University — @lanternwick.edu — 125.000đ
- Mossglen Institute — @mossglen.edu — 350.000đ

## Định dạng bàn giao

email|password|2fa
mail001@quillmere.edu|Seed_quillmere_001_XXXX!|JBSWY3DPEHPK3PXP

## Hướng dẫn sử dụng

1) Thanh toán xong, mở đơn hàng và copy đúng một dòng key.
2) Tách 3 phần theo dấu | : email — mật khẩu — secret 2FA (Base32).
3) Dán email và mật khẩu vào hệ thống bạn đang test.
4) Thêm secret 2FA vào authenticator bằng Enter a setup key. OTP 6 số đổi mỗi 30 giây.
5) Đánh dấu dòng đã dùng để không lấy trùng khi test kho.

## Lưu ý

- Đây là dữ liệu giả định, không phải hộp thư của trường thật.
- Chỉ dùng để test hệ thống tự động hóa.
- Một dòng = một đơn vị kho. Không chia sẻ công khai.',
    'Campus Mail — hộp thư campus giả định | TUNG Shop',
    'Mua Campus Mail Lab tại TUNG Shop. 3 miền giả định quillmere.edu, lanternwick.edu, mossglen.edu. Giao mail|pass|2fa tự động để test kho.'
  ),
  (
    'catalog-product-campus-mail', 'en',
    'Campus Mail',
    'Fictional campus inbox',
    'Three invented school domains — Quillmere, Lanternwick, Mossglen. Delivered as email|password|2fa for automation tests.',
    'Campus Mail is a pack of fictional campus inboxes on three school domains that do not exist. Each order delivers one email|password|2fa line so you can test inventory parsers, Telegram delivery, and automatic fulfilment.

## Three campus domains

- Quillmere College — @quillmere.edu — 99,000 VND
- Lanternwick University — @lanternwick.edu — 125,000 VND
- Mossglen Institute — @mossglen.edu — 350,000 VND

## Delivery format

email|password|2fa
mail001@quillmere.edu|Seed_quillmere_001_XXXX!|JBSWY3DPEHPK3PXP

## How to use

1) After payment is verified, open the order and copy exactly one key line.
2) Split on | into email, password, and a Base32 2FA secret.
3) Paste the email and password into the system you are testing.
4) Add the 2FA secret in an authenticator with Enter a setup key. The 6-digit OTP rotates every 30 seconds.
5) Mark used lines so inventory tests do not reuse the same unit.

## Notes

- These are synthetic records, not mailboxes at a real school.
- Use them only to test shop automation.
- One line equals one inventory unit. Do not share publicly.',
    'Campus Mail — fictional campus inboxes | TUNG Shop',
    'Buy Campus Mail Lab at TUNG Shop. Three fictional domains with automatic mail|pass|2fa delivery for inventory tests.'
  ),
  (
    'catalog-product-campus-mail', 'ja',
    'Campus Mail',
    '架空キャンパス受信箱',
    '実在しない3つの学校ドメイン。email|password|2fa で自動納品し、在庫と自動化をテストできます。',
    'Campus Mail は実在しない3つの学校ドメイン上の架空キャンパス受信箱です。注文ごとに email|password|2fa を1行納品し、在庫パーサーや Telegram、自動フルフィルメントのテストに使えます。

## 3つのドメイン

- Quillmere College — @quillmere.edu — 99,000 VND
- Lanternwick University — @lanternwick.edu — 125,000 VND
- Mossglen Institute — @mossglen.edu — 350,000 VND

## 納品形式

email|password|2fa
mail001@quillmere.edu|Seed_quillmere_001_XXXX!|JBSWY3DPEHPK3PXP

## 使い方

1) 支払い確認後、注文を開きキーを1行だけコピーします。
2) | で email / パスワード / Base32 の 2FA シークレットに分割します。
3) テスト中のシステムに email とパスワードを貼り付けます。
4) Authenticator の setup key 入力でシークレットを追加します。6桁 OTP は30秒ごとに更新されます。
5) 使用済み行を印付けし、在庫テストで重複しないようにします。

## 注意

- 実在の学校のメールではありません。
- ショップ自動化のテスト専用です。
- 1行 = 在庫1単位。公開共有しないでください。',
    'Campus Mail — 架空キャンパス受信箱 | TUNG Shop',
    'TUNG Shop の Campus Mail Lab。架空ドメイン3種を mail|pass|2fa で自動納品し、在庫テストに使えます。'
  ),
  (
    'catalog-product-campus-mail', 'zh',
    'Campus Mail',
    '虚构校园收件箱',
    '三个不存在的学校域名。以 email|password|2fa 自动交付，用于测试库存与自动化。',
    'Campus Mail 是一套虚构校园收件箱，使用三个并不存在的学校域名。每笔订单交付一行 email|password|2fa，便于测试库存解析、Telegram 与自动履约。

## 三个校园域名

- Quillmere College — @quillmere.edu — 99,000 VND
- Lanternwick University — @lanternwick.edu — 125,000 VND
- Mossglen Institute — @mossglen.edu — 350,000 VND

## 交付格式

email|password|2fa
mail001@quillmere.edu|Seed_quillmere_001_XXXX!|JBSWY3DPEHPK3PXP

## 使用步骤

1) 付款验证后打开订单，只复制一行密钥。
2) 按 | 拆成邮箱、密码和 Base32 的 2FA 密钥。
3) 把邮箱和密码粘贴到你正在测试的系统。
4) 在验证器中用 Enter a setup key 添加 2FA 密钥。6 位 OTP 每 30 秒更新。
5) 标记已用行，避免库存测试重复领取。

## 注意

- 这些是合成数据，不是真实学校邮箱。
- 仅用于测试商店自动化。
- 一行等于一个库存单位。请勿公开分享。',
    'Campus Mail — 虚构校园收件箱 | TUNG Shop',
    '在 TUNG Shop 购买 Campus Mail Lab。三个虚构域名，自动交付 mail|pass|2fa，用于库存测试。'
  );

INSERT OR IGNORE INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-campus-quillmere', 'catalog-product-campus-mail', 'CAMPUS-QUILLMERE', 'active',
  'license_key', 'automatic', 'tracked', 99000, NULL, 'VND', 10, 20,
  json_object('campus', 'Quillmere', 'domain', 'quillmere.edu', 'format', 'mail|pass|2fa'),
  json_object('campus', 'quillmere', 'domain', 'quillmere.edu', 'fictional', 1, 'seedKey', 'shop-campus-mail-2026-08-14-v1'),
  1, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-campus-mail' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CAMPUS-QUILLMERE' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-campus-lanternwick', 'catalog-product-campus-mail', 'CAMPUS-LANTERNWICK', 'active',
  'license_key', 'automatic', 'tracked', 125000, NULL, 'VND', 10, 20,
  json_object('campus', 'Lanternwick', 'domain', 'lanternwick.edu', 'format', 'mail|pass|2fa'),
  json_object('campus', 'lanternwick', 'domain', 'lanternwick.edu', 'fictional', 1, 'seedKey', 'shop-campus-mail-2026-08-14-v1'),
  1, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-campus-mail' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CAMPUS-LANTERNWICK' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-campus-mossglen', 'catalog-product-campus-mail', 'CAMPUS-MOSSGLEN', 'active',
  'license_key', 'automatic', 'tracked', 350000, NULL, 'VND', 10, 20,
  json_object('campus', 'Mossglen', 'domain', 'mossglen.edu', 'format', 'mail|pass|2fa'),
  json_object('campus', 'mossglen', 'domain', 'mossglen.edu', 'fictional', 1, 'seedKey', 'shop-campus-mail-2026-08-14-v1'),
  1, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-campus-mail' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CAMPUS-MOSSGLEN' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary) VALUES
  ('catalog-variant-campus-quillmere', 'vi', 'Quillmere · @quillmere.edu', 'Campus giả định · mail|pass|2fa'),
  ('catalog-variant-campus-quillmere', 'en', 'Quillmere · @quillmere.edu', 'Fictional campus · mail|pass|2fa'),
  ('catalog-variant-campus-quillmere', 'ja', 'Quillmere · @quillmere.edu', '架空キャンパス · mail|pass|2fa'),
  ('catalog-variant-campus-quillmere', 'zh', 'Quillmere · @quillmere.edu', '虚构校园 · mail|pass|2fa'),
  ('catalog-variant-campus-lanternwick', 'vi', 'Lanternwick · @lanternwick.edu', 'Campus giả định · mail|pass|2fa'),
  ('catalog-variant-campus-lanternwick', 'en', 'Lanternwick · @lanternwick.edu', 'Fictional campus · mail|pass|2fa'),
  ('catalog-variant-campus-lanternwick', 'ja', 'Lanternwick · @lanternwick.edu', '架空キャンパス · mail|pass|2fa'),
  ('catalog-variant-campus-lanternwick', 'zh', 'Lanternwick · @lanternwick.edu', '虚构校园 · mail|pass|2fa'),
  ('catalog-variant-campus-mossglen', 'vi', 'Mossglen · @mossglen.edu', 'Campus giả định · mail|pass|2fa'),
  ('catalog-variant-campus-mossglen', 'en', 'Mossglen · @mossglen.edu', 'Fictional campus · mail|pass|2fa'),
  ('catalog-variant-campus-mossglen', 'ja', 'Mossglen · @mossglen.edu', '架空キャンパス · mail|pass|2fa'),
  ('catalog-variant-campus-mossglen', 'zh', 'Mossglen · @mossglen.edu', '虚构校园 · mail|pass|2fa');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES
  (
    'catalog-media-campus-mail',
    'catalog-product-campus-mail',
    NULL,
    NULL,
    'image',
    '/images/shop/campus-mail.webp',
    'Ảnh bìa Campus Mail — hộp thư campus giả định, 3 miền quillmere lanternwick mossglen',
    0,
    '2026-08-14T00:00:00.000Z'
  ),
  (
    'catalog-media-campus-mail-guide-1',
    'catalog-product-campus-mail',
    NULL,
    NULL,
    'image',
    '/images/shop/campus-mail-guide-1.webp',
    'Hướng dẫn Campus Mail bước 1 — nhận đúng một dòng key trong đơn hàng',
    1,
    '2026-08-14T00:00:00.000Z'
  ),
  (
    'catalog-media-campus-mail-guide-2',
    'catalog-product-campus-mail',
    NULL,
    NULL,
    'image',
    '/images/shop/campus-mail-guide-2.webp',
    'Hướng dẫn Campus Mail bước 2 — tách email, mật khẩu và secret 2FA',
    2,
    '2026-08-14T00:00:00.000Z'
  ),
  (
    'catalog-media-campus-mail-guide-3',
    'catalog-product-campus-mail',
    NULL,
    NULL,
    'image',
    '/images/shop/campus-mail-guide-3.webp',
    'Hướng dẫn Campus Mail bước 3 — gắn secret 2FA vào authenticator khi test OTP',
    3,
    '2026-08-14T00:00:00.000Z'
  );

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-campus-mail-2026-08-14-v1',
  'seed:shop-campus-mail:2026-08-14:v1',
  'shop.product.seeded',
  'shop_product',
  'catalog-product-campus-mail',
  NULL,
  json_object(
    'slug', 'campus-mail',
    'variants', 3,
    'pricesVnd', json_array(99000, 125000, 350000),
    'domains', json_array('quillmere.edu', 'lanternwick.edu', 'mossglen.edu'),
    'fictional', 1,
    'inventoryCreated', 0
  ),
  '2026-08-14T00:00:00.000Z'
);
