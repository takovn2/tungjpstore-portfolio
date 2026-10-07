-- DigiStore catalog expansion from tap-hoa-ai-products.json (non-duplicates only).
-- Categories reused: ai-tools, creative-tools, entertainment, productivity.
-- Inventory keys are NOT created here.
PRAGMA foreign_keys = ON;

-- ===== Suno Pro (suno) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-suno',
  'suno',
  'active', 'digital_key', 0, 150, 'vi', NULL,
  '{"categorySlug":"creative-tools","category":"Thiết kế & sáng tạo","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["suno-pro-1-month"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'suno' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-suno', 'vi',
  'Suno Pro', 'AI Music · 1 tháng', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.',
  'Suno Pro hỗ trợ tạo bài hát, giai điệu và lời từ prompt AI trong thời hạn gói được bàn giao.

Hướng dẫn sử dụng:
1) Nhận key/tài khoản sau thanh toán.
2) Đăng nhập Suno (hoặc redeem theo hướng dẫn kèm key).
3) Kiểm tra quyền Pro và hạn dùng trên tài khoản.
4) Đổi mật khẩu / bật 2FA nếu key dạng mail|pass|2fa.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Suno Pro | DigiStore', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-suno', 'en',
  'Suno Pro', 'AI Music · 1 tháng', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.',
  'Suno Pro hỗ trợ tạo bài hát, giai điệu và lời từ prompt AI trong thời hạn gói được bàn giao.

How to use:
1) Nhận key/tài khoản sau thanh toán.
2) Đăng nhập Suno (hoặc redeem theo hướng dẫn kèm key).
3) Kiểm tra quyền Pro và hạn dùng trên tài khoản.
4) Đổi mật khẩu / bật 2FA nếu key dạng mail|pass|2fa.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Suno Pro | DigiStore', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-suno', 'ja',
  'Suno Pro', 'AI Music · 1 tháng', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.',
  'Suno Pro hỗ trợ tạo bài hát, giai điệu và lời từ prompt AI trong thời hạn gói được bàn giao.

使い方:
1) Nhận key/tài khoản sau thanh toán.
2) Đăng nhập Suno (hoặc redeem theo hướng dẫn kèm key).
3) Kiểm tra quyền Pro và hạn dùng trên tài khoản.
4) Đổi mật khẩu / bật 2FA nếu key dạng mail|pass|2fa.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Suno Pro | DigiStore', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-suno', 'zh',
  'Suno Pro', 'AI Music · 1 tháng', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.',
  'Suno Pro hỗ trợ tạo bài hát, giai điệu và lời từ prompt AI trong thời hạn gói được bàn giao.

使用说明:
1) Nhận key/tài khoản sau thanh toán.
2) Đăng nhập Suno (hoặc redeem theo hướng dẫn kèm key).
3) Kiểm tra quyền Pro và hạn dùng trên tài khoản.
4) Đổi mật khẩu / bật 2FA nếu key dạng mail|pass|2fa.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Suno Pro | DigiStore', 'Gói Suno Pro 1 tháng — tạo nhạc và lời bằng AI.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-suno-pro-1m', 'catalog-product-suno', 'SUNO-PRO-1M',
  'active', 'license_key', 'automatic', 'tracked',
  270000, NULL, 'VND', 3, 1,
  '{"duration":"1-month","warrantyDays":7}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["suno-pro-1-month"],"duration":"1-month","warrantyDays":7}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-suno' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'SUNO-PRO-1M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-suno-pro-1m', 'vi', 'Suno Pro · 1 tháng', 'Thời hạn: 1 tháng · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-suno-pro-1m', 'en', 'Suno Pro · 1 tháng', 'Thời hạn: 1 tháng · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-suno-pro-1m', 'ja', 'Suno Pro · 1 tháng', 'Thời hạn: 1 tháng · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-suno-pro-1m', 'zh', 'Suno Pro · 1 tháng', 'Thời hạn: 1 tháng · BH: 7 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-suno',
  'catalog-product-suno',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/suno.webp',
  'Ảnh bìa Suno Pro — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Claude API (claude-api) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-claude-api',
  'claude-api',
  'active', 'digital_key', 0, 160, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["claude-api-10m-token-1-day","claude-api-50m-token-1-day","claude-api-100m-token-1-day","claude-api-100m-token-3-days"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'claude-api' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-api', 'vi',
  'Claude API', 'Anthropic · Token pack', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.',
  'Claude API token pack dùng cho tích hợp và thử nghiệm model Claude. Hạn token và thời hạn theo từng biến thể.

Hướng dẫn sử dụng:
1) Nhận API key/thông tin endpoint sau thanh toán.
2) Cấu hình key vào client (SDK, proxy, hoặc tool).
3) Theo dõi quota token còn lại.
4) Không chia sẻ key công khai; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude API | DigiStore', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-api', 'en',
  'Claude API', 'Anthropic · Token pack', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.',
  'Claude API token pack dùng cho tích hợp và thử nghiệm model Claude. Hạn token và thời hạn theo từng biến thể.

How to use:
1) Nhận API key/thông tin endpoint sau thanh toán.
2) Cấu hình key vào client (SDK, proxy, hoặc tool).
3) Theo dõi quota token còn lại.
4) Không chia sẻ key công khai; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude API | DigiStore', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-api', 'ja',
  'Claude API', 'Anthropic · Token pack', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.',
  'Claude API token pack dùng cho tích hợp và thử nghiệm model Claude. Hạn token và thời hạn theo từng biến thể.

使い方:
1) Nhận API key/thông tin endpoint sau thanh toán.
2) Cấu hình key vào client (SDK, proxy, hoặc tool).
3) Theo dõi quota token còn lại.
4) Không chia sẻ key công khai; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude API | DigiStore', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-api', 'zh',
  'Claude API', 'Anthropic · Token pack', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.',
  'Claude API token pack dùng cho tích hợp và thử nghiệm model Claude. Hạn token và thời hạn theo từng biến thể.

使用说明:
1) Nhận API key/thông tin endpoint sau thanh toán.
2) Cấu hình key vào client (SDK, proxy, hoặc tool).
3) Theo dõi quota token còn lại.
4) Không chia sẻ key công khai; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude API | DigiStore', 'Gói token Claude API theo ngày — chọn mức 10M / 50M / 100M.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-api-10m-1d', 'catalog-product-claude-api', 'CLAUDE-API-10M-1D',
  'active', 'license_key', 'automatic', 'tracked',
  70000, NULL, 'VND', 3, 1,
  '{"tokens":"10M","duration":"1-day"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["claude-api-10m-token-1-day"],"tokens":"10M","duration":"1-day"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-api' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-API-10M-1D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-10m-1d', 'vi', '10M token · 1 ngày', '10M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-10m-1d', 'en', '10M token · 1 ngày', '10M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-10m-1d', 'ja', '10M token · 1 ngày', '10M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-10m-1d', 'zh', '10M token · 1 ngày', '10M token · Hạn: 1 ngày');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-api-50m-1d', 'catalog-product-claude-api', 'CLAUDE-API-50M-1D',
  'active', 'license_key', 'automatic', 'tracked',
  160000, NULL, 'VND', 3, 1,
  '{"tokens":"50M","duration":"1-day"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["claude-api-50m-token-1-day"],"tokens":"50M","duration":"1-day"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-api' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-API-50M-1D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-50m-1d', 'vi', '50M token · 1 ngày', '50M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-50m-1d', 'en', '50M token · 1 ngày', '50M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-50m-1d', 'ja', '50M token · 1 ngày', '50M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-50m-1d', 'zh', '50M token · 1 ngày', '50M token · Hạn: 1 ngày');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-api-100m-1d', 'catalog-product-claude-api', 'CLAUDE-API-100M-1D',
  'active', 'license_key', 'automatic', 'tracked',
  180000, NULL, 'VND', 3, 1,
  '{"tokens":"100M","duration":"1-day"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["claude-api-100m-token-1-day"],"tokens":"100M","duration":"1-day"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-api' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-API-100M-1D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-1d', 'vi', '100M token · 1 ngày', '100M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-1d', 'en', '100M token · 1 ngày', '100M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-1d', 'ja', '100M token · 1 ngày', '100M token · Hạn: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-1d', 'zh', '100M token · 1 ngày', '100M token · Hạn: 1 ngày');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-api-100m-3d', 'catalog-product-claude-api', 'CLAUDE-API-100M-3D',
  'active', 'license_key', 'automatic', 'tracked',
  225000, NULL, 'VND', 3, 1,
  '{"tokens":"100M","duration":"3-day"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["claude-api-100m-token-3-days"],"tokens":"100M","duration":"3-day"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-api' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-API-100M-3D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-3d', 'vi', '100M token · 3 ngày', '100M token · Hạn: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-3d', 'en', '100M token · 3 ngày', '100M token · Hạn: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-3d', 'ja', '100M token · 3 ngày', '100M token · Hạn: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-api-100m-3d', 'zh', '100M token · 3 ngày', '100M token · Hạn: 3 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-claude-api',
  'catalog-product-claude-api',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/claude-api.webp',
  'Ảnh bìa Claude API — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Claude X20 (claude-x20) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-claude-x20',
  'claude-x20',
  'active', 'digital_key', 0, 170, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["preorder-claude-x20-1-month-no-warranty","preorder-claude-x20-1-month-full-warranty"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'claude-x20' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-x20', 'vi',
  'Claude X20', 'Pre-order · 1 tháng', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.',
  'Gói Claude X20 pre-order thời hạn 1 tháng. Quyền lợi và model theo cấu hình bàn giao; chọn mức bảo hành phù hợp.

Hướng dẫn sử dụng:
1) Đặt mua và chờ bàn giao (pre-order).
2) Nhận thông tin đăng nhập/key theo email đơn.
3) Đăng nhập Claude và kiểm tra gói X20.
4) Liên hệ hỗ trợ trong thời hạn BH của biến thể đã chọn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude X20 | DigiStore', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-x20', 'en',
  'Claude X20', 'Pre-order · 1 tháng', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.',
  'Gói Claude X20 pre-order thời hạn 1 tháng. Quyền lợi và model theo cấu hình bàn giao; chọn mức bảo hành phù hợp.

How to use:
1) Đặt mua và chờ bàn giao (pre-order).
2) Nhận thông tin đăng nhập/key theo email đơn.
3) Đăng nhập Claude và kiểm tra gói X20.
4) Liên hệ hỗ trợ trong thời hạn BH của biến thể đã chọn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude X20 | DigiStore', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-x20', 'ja',
  'Claude X20', 'Pre-order · 1 tháng', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.',
  'Gói Claude X20 pre-order thời hạn 1 tháng. Quyền lợi và model theo cấu hình bàn giao; chọn mức bảo hành phù hợp.

使い方:
1) Đặt mua và chờ bàn giao (pre-order).
2) Nhận thông tin đăng nhập/key theo email đơn.
3) Đăng nhập Claude và kiểm tra gói X20.
4) Liên hệ hỗ trợ trong thời hạn BH của biến thể đã chọn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude X20 | DigiStore', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-claude-x20', 'zh',
  'Claude X20', 'Pre-order · 1 tháng', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.',
  'Gói Claude X20 pre-order thời hạn 1 tháng. Quyền lợi và model theo cấu hình bàn giao; chọn mức bảo hành phù hợp.

使用说明:
1) Đặt mua và chờ bàn giao (pre-order).
2) Nhận thông tin đăng nhập/key theo email đơn.
3) Đăng nhập Claude và kiểm tra gói X20.
4) Liên hệ hỗ trợ trong thời hạn BH của biến thể đã chọn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Claude X20 | DigiStore', 'Pre-order Claude X20 1 tháng — chọn gói không BH hoặc full BH.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-x20-1m-no-warranty', 'catalog-product-claude-x20', 'CLAUDE-X20-1M-NO-BH',
  'active', 'license_key', 'automatic', 'tracked',
  2940000, NULL, 'VND', 3, 1,
  '{"plan":"x20","duration":"1-month","warranty":"none","preorder":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["preorder-claude-x20-1-month-no-warranty"],"plan":"x20","duration":"1-month","warranty":"none","preorder":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-x20' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-X20-1M-NO-BH' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-no-warranty', 'vi', 'X20 · 1 tháng · Không BH', 'Pre-order · Không bảo hành');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-no-warranty', 'en', 'X20 · 1 tháng · Không BH', 'Pre-order · Không bảo hành');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-no-warranty', 'ja', 'X20 · 1 tháng · Không BH', 'Pre-order · Không bảo hành');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-no-warranty', 'zh', 'X20 · 1 tháng · Không BH', 'Pre-order · Không bảo hành');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-claude-x20-1m-full', 'catalog-product-claude-x20', 'CLAUDE-X20-1M-FULL',
  'active', 'license_key', 'automatic', 'tracked',
  5180000, NULL, 'VND', 3, 1,
  '{"plan":"x20","duration":"1-month","warranty":"full","preorder":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["preorder-claude-x20-1-month-full-warranty"],"plan":"x20","duration":"1-month","warranty":"full","preorder":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-claude-x20' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'CLAUDE-X20-1M-FULL' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-full', 'vi', 'X20 · 1 tháng · Full BH', 'Pre-order · Bảo hành full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-full', 'en', 'X20 · 1 tháng · Full BH', 'Pre-order · Bảo hành full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-full', 'ja', 'X20 · 1 tháng · Full BH', 'Pre-order · Bảo hành full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-claude-x20-1m-full', 'zh', 'X20 · 1 tháng · Full BH', 'Pre-order · Bảo hành full');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-claude-x20',
  'catalog-product-claude-x20',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/claude-x20.webp',
  'Ảnh bìa Claude X20 — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Leonardo AI (leonardo-ai) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-leonardo-ai',
  'leonardo-ai',
  'active', 'digital_key', 0, 180, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["leonardo-ai-8500-credits-1-month"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'leonardo-ai' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-leonardo-ai', 'vi',
  'Leonardo AI', 'AI Image · 8.500 credit', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.',
  'Gói Leonardo AI với 8.500 credit trong 1 tháng, phục vụ tạo ảnh, concept art và tài nguyên sáng tạo.

Hướng dẫn sử dụng:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Leonardo AI.
3) Kiểm tra số credit còn lại.
4) Đổi mật khẩu nếu nhận dạng mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Leonardo AI | DigiStore', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-leonardo-ai', 'en',
  'Leonardo AI', 'AI Image · 8.500 credit', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.',
  'Gói Leonardo AI với 8.500 credit trong 1 tháng, phục vụ tạo ảnh, concept art và tài nguyên sáng tạo.

How to use:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Leonardo AI.
3) Kiểm tra số credit còn lại.
4) Đổi mật khẩu nếu nhận dạng mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Leonardo AI | DigiStore', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-leonardo-ai', 'ja',
  'Leonardo AI', 'AI Image · 8.500 credit', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.',
  'Gói Leonardo AI với 8.500 credit trong 1 tháng, phục vụ tạo ảnh, concept art và tài nguyên sáng tạo.

使い方:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Leonardo AI.
3) Kiểm tra số credit còn lại.
4) Đổi mật khẩu nếu nhận dạng mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Leonardo AI | DigiStore', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-leonardo-ai', 'zh',
  'Leonardo AI', 'AI Image · 8.500 credit', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.',
  'Gói Leonardo AI với 8.500 credit trong 1 tháng, phục vụ tạo ảnh, concept art và tài nguyên sáng tạo.

使用说明:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Leonardo AI.
3) Kiểm tra số credit còn lại.
4) Đổi mật khẩu nếu nhận dạng mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Leonardo AI | DigiStore', 'Leonardo AI 8.500 credit / 1 tháng — tạo ảnh và asset bằng AI.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-leonardo-8500-1m', 'catalog-product-leonardo-ai', 'LEONARDO-8500-1M',
  'active', 'license_key', 'automatic', 'tracked',
  60000, NULL, 'VND', 3, 1,
  '{"credits":8500,"duration":"1-month","warrantyHours":24}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["leonardo-ai-8500-credits-1-month"],"credits":8500,"duration":"1-month","warrantyHours":24}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-leonardo-ai' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'LEONARDO-8500-1M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-leonardo-8500-1m', 'vi', '8.500 credit · 1 tháng', '8.500 credit · BH: 24 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-leonardo-8500-1m', 'en', '8.500 credit · 1 tháng', '8.500 credit · BH: 24 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-leonardo-8500-1m', 'ja', '8.500 credit · 1 tháng', '8.500 credit · BH: 24 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-leonardo-8500-1m', 'zh', '8.500 credit · 1 tháng', '8.500 credit · BH: 24 giờ');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-leonardo-ai',
  'catalog-product-leonardo-ai',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/leonardo-ai.webp',
  'Ảnh bìa Leonardo AI — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== HeyGen Creator (heygen) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-heygen',
  'heygen',
  'active', 'digital_key', 0, 190, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["heygen-creator-600-credits-30-days"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'heygen' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-heygen', 'vi',
  'HeyGen Creator', 'AI Avatar · 600 credit', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.',
  'Gói HeyGen Creator gồm 600 credit trong 30 ngày cho video avatar, thuyết minh và nội dung marketing.

Hướng dẫn sử dụng:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập HeyGen.
3) Kiểm tra gói Creator và credit.
4) Xuất video trong hạn 30 ngày.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HeyGen Creator | DigiStore', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-heygen', 'en',
  'HeyGen Creator', 'AI Avatar · 600 credit', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.',
  'Gói HeyGen Creator gồm 600 credit trong 30 ngày cho video avatar, thuyết minh và nội dung marketing.

How to use:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập HeyGen.
3) Kiểm tra gói Creator và credit.
4) Xuất video trong hạn 30 ngày.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HeyGen Creator | DigiStore', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-heygen', 'ja',
  'HeyGen Creator', 'AI Avatar · 600 credit', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.',
  'Gói HeyGen Creator gồm 600 credit trong 30 ngày cho video avatar, thuyết minh và nội dung marketing.

使い方:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập HeyGen.
3) Kiểm tra gói Creator và credit.
4) Xuất video trong hạn 30 ngày.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HeyGen Creator | DigiStore', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-heygen', 'zh',
  'HeyGen Creator', 'AI Avatar · 600 credit', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.',
  'Gói HeyGen Creator gồm 600 credit trong 30 ngày cho video avatar, thuyết minh và nội dung marketing.

使用说明:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập HeyGen.
3) Kiểm tra gói Creator và credit.
4) Xuất video trong hạn 30 ngày.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HeyGen Creator | DigiStore', 'HeyGen Creator 600 credit / 30 ngày — avatar và video AI.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-heygen-600-30d', 'catalog-product-heygen', 'HEYGEN-CREATOR-600-30D',
  'active', 'license_key', 'automatic', 'tracked',
  280000, NULL, 'VND', 3, 1,
  '{"plan":"creator","credits":600,"duration":"30-day","warrantyDays":1}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["heygen-creator-600-credits-30-days"],"plan":"creator","credits":600,"duration":"30-day","warrantyDays":1}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-heygen' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'HEYGEN-CREATOR-600-30D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-heygen-600-30d', 'vi', 'Creator · 600 credit · 30 ngày', '600 credit · BH: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-heygen-600-30d', 'en', 'Creator · 600 credit · 30 ngày', '600 credit · BH: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-heygen-600-30d', 'ja', 'Creator · 600 credit · 30 ngày', '600 credit · BH: 1 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-heygen-600-30d', 'zh', 'Creator · 600 credit · 30 ngày', '600 credit · BH: 1 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-heygen',
  'catalog-product-heygen',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/heygen.webp',
  'Ảnh bìa HeyGen Creator — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Kling AI (kling) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-kling',
  'kling',
  'active', 'digital_key', 0, 200, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["kling-standard-792-992-credits","kling-ultra-27500-credits"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'kling' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-kling', 'vi',
  'Kling AI', 'AI Video · Credit pack', 'Kling AI video generation — Standard hoặc Ultra theo credit.',
  'Gói credit Kling AI cho tạo video generative. Chọn Standard (~792–992 credit) hoặc Ultra (27.500 credit).

Hướng dẫn sử dụng:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Kling AI.
3) Kiểm tra credit và hạn BH biến thể.
4) Tạo video và theo dõi credit tiêu hao.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Kling AI | DigiStore', 'Kling AI video generation — Standard hoặc Ultra theo credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-kling', 'en',
  'Kling AI', 'AI Video · Credit pack', 'Kling AI video generation — Standard hoặc Ultra theo credit.',
  'Gói credit Kling AI cho tạo video generative. Chọn Standard (~792–992 credit) hoặc Ultra (27.500 credit).

How to use:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Kling AI.
3) Kiểm tra credit và hạn BH biến thể.
4) Tạo video và theo dõi credit tiêu hao.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Kling AI | DigiStore', 'Kling AI video generation — Standard hoặc Ultra theo credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-kling', 'ja',
  'Kling AI', 'AI Video · Credit pack', 'Kling AI video generation — Standard hoặc Ultra theo credit.',
  'Gói credit Kling AI cho tạo video generative. Chọn Standard (~792–992 credit) hoặc Ultra (27.500 credit).

使い方:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Kling AI.
3) Kiểm tra credit và hạn BH biến thể.
4) Tạo video và theo dõi credit tiêu hao.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Kling AI | DigiStore', 'Kling AI video generation — Standard hoặc Ultra theo credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-kling', 'zh',
  'Kling AI', 'AI Video · Credit pack', 'Kling AI video generation — Standard hoặc Ultra theo credit.',
  'Gói credit Kling AI cho tạo video generative. Chọn Standard (~792–992 credit) hoặc Ultra (27.500 credit).

使用说明:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Kling AI.
3) Kiểm tra credit và hạn BH biến thể.
4) Tạo video và theo dõi credit tiêu hao.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Kling AI | DigiStore', 'Kling AI video generation — Standard hoặc Ultra theo credit.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kling-standard', 'catalog-product-kling', 'KLING-STANDARD',
  'active', 'license_key', 'automatic', 'tracked',
  150000, NULL, 'VND', 3, 1,
  '{"plan":"standard","credits":"792-992","warrantyHours":12}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["kling-standard-792-992-credits"],"plan":"standard","credits":"792-992","warrantyHours":12}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kling' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KLING-STANDARD' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-standard', 'vi', 'Standard · 792–992 credit', 'Standard · BH: 12 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-standard', 'en', 'Standard · 792–992 credit', 'Standard · BH: 12 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-standard', 'ja', 'Standard · 792–992 credit', 'Standard · BH: 12 giờ');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-standard', 'zh', 'Standard · 792–992 credit', 'Standard · BH: 12 giờ');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-kling-ultra', 'catalog-product-kling', 'KLING-ULTRA-27500',
  'active', 'license_key', 'automatic', 'tracked',
  2590000, NULL, 'VND', 3, 1,
  '{"plan":"ultra","credits":27500,"warrantyDays":3}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["kling-ultra-27500-credits"],"plan":"ultra","credits":27500,"warrantyDays":3}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-kling' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'KLING-ULTRA-27500' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-ultra', 'vi', 'Ultra · 27.500 credit', 'Ultra · BH: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-ultra', 'en', 'Ultra · 27.500 credit', 'Ultra · BH: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-ultra', 'ja', 'Ultra · 27.500 credit', 'Ultra · BH: 3 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-kling-ultra', 'zh', 'Ultra · 27.500 credit', 'Ultra · BH: 3 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-kling',
  'catalog-product-kling',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/kling.webp',
  'Ảnh bìa Kling AI — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Lovable AI Pro (lovable) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-lovable',
  'lovable',
  'active', 'digital_key', 0, 210, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["lovable-ai-pro-1-month"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'lovable' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-lovable', 'vi',
  'Lovable AI Pro', 'AI App Builder · 1 tháng', 'Lovable AI Pro 1 tháng — build app từ prompt.',
  'Lovable AI Pro hỗ trợ dựng giao diện và ứng dụng từ mô tả tự nhiên trong thời hạn 1 tháng.

Hướng dẫn sử dụng:
1) Nhận tài khoản Pro sau thanh toán.
2) Đăng nhập Lovable.
3) Tạo project và deploy theo hướng dẫn nền tảng.
4) Đổi mật khẩu ngay khi nhận mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Lovable AI Pro | DigiStore', 'Lovable AI Pro 1 tháng — build app từ prompt.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-lovable', 'en',
  'Lovable AI Pro', 'AI App Builder · 1 tháng', 'Lovable AI Pro 1 tháng — build app từ prompt.',
  'Lovable AI Pro hỗ trợ dựng giao diện và ứng dụng từ mô tả tự nhiên trong thời hạn 1 tháng.

How to use:
1) Nhận tài khoản Pro sau thanh toán.
2) Đăng nhập Lovable.
3) Tạo project và deploy theo hướng dẫn nền tảng.
4) Đổi mật khẩu ngay khi nhận mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Lovable AI Pro | DigiStore', 'Lovable AI Pro 1 tháng — build app từ prompt.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-lovable', 'ja',
  'Lovable AI Pro', 'AI App Builder · 1 tháng', 'Lovable AI Pro 1 tháng — build app từ prompt.',
  'Lovable AI Pro hỗ trợ dựng giao diện và ứng dụng từ mô tả tự nhiên trong thời hạn 1 tháng.

使い方:
1) Nhận tài khoản Pro sau thanh toán.
2) Đăng nhập Lovable.
3) Tạo project và deploy theo hướng dẫn nền tảng.
4) Đổi mật khẩu ngay khi nhận mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Lovable AI Pro | DigiStore', 'Lovable AI Pro 1 tháng — build app từ prompt.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-lovable', 'zh',
  'Lovable AI Pro', 'AI App Builder · 1 tháng', 'Lovable AI Pro 1 tháng — build app từ prompt.',
  'Lovable AI Pro hỗ trợ dựng giao diện và ứng dụng từ mô tả tự nhiên trong thời hạn 1 tháng.

使用说明:
1) Nhận tài khoản Pro sau thanh toán.
2) Đăng nhập Lovable.
3) Tạo project và deploy theo hướng dẫn nền tảng.
4) Đổi mật khẩu ngay khi nhận mail|pass.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Lovable AI Pro | DigiStore', 'Lovable AI Pro 1 tháng — build app từ prompt.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-lovable-pro-1m', 'catalog-product-lovable', 'LOVABLE-PRO-1M',
  'active', 'license_key', 'automatic', 'tracked',
  560000, NULL, 'VND', 3, 1,
  '{"plan":"pro","duration":"1-month","warrantyDays":30}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["lovable-ai-pro-1-month"],"plan":"pro","duration":"1-month","warrantyDays":30}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-lovable' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'LOVABLE-PRO-1M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-lovable-pro-1m', 'vi', 'Pro · 1 tháng', '1 tháng · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-lovable-pro-1m', 'en', 'Pro · 1 tháng', '1 tháng · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-lovable-pro-1m', 'ja', 'Pro · 1 tháng', '1 tháng · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-lovable-pro-1m', 'zh', 'Pro · 1 tháng', '1 tháng · BH: 30 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-lovable',
  'catalog-product-lovable',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/lovable.webp',
  'Ảnh bìa Lovable AI Pro — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Gmail Aged (gmail-aged) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-gmail-aged',
  'gmail-aged',
  'active', 'digital_key', 0, 220, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["gmail-aged-2010-2016-unused-with-phone","gmail-aged-random-2010-2022","gmail-us-aged-2006-2012-phone-api-otp","aged-mail-random-2012-2024"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'gmail-aged' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gmail-aged', 'vi',
  'Gmail Aged', 'Email account · Aged', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.',
  'Tài khoản Gmail aged theo mốc năm. Phù hợp test, warm-up hoặc nhu cầu tài khoản lâu năm. Không cam bảo lịch sử dịch vụ ngoài mô tả biến thể.

Hướng dẫn sử dụng:
1) Nhận mail|pass|2fa (nếu có) sau thanh toán.
2) Đăng nhập tại accounts.google.com.
3) Thêm phương thức khôi phục của bạn.
4) Bật 2FA riêng và xoá 2FA cũ nếu được hướng dẫn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Gmail Aged | DigiStore', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gmail-aged', 'en',
  'Gmail Aged', 'Email account · Aged', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.',
  'Tài khoản Gmail aged theo mốc năm. Phù hợp test, warm-up hoặc nhu cầu tài khoản lâu năm. Không cam bảo lịch sử dịch vụ ngoài mô tả biến thể.

How to use:
1) Nhận mail|pass|2fa (nếu có) sau thanh toán.
2) Đăng nhập tại accounts.google.com.
3) Thêm phương thức khôi phục của bạn.
4) Bật 2FA riêng và xoá 2FA cũ nếu được hướng dẫn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Gmail Aged | DigiStore', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gmail-aged', 'ja',
  'Gmail Aged', 'Email account · Aged', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.',
  'Tài khoản Gmail aged theo mốc năm. Phù hợp test, warm-up hoặc nhu cầu tài khoản lâu năm. Không cam bảo lịch sử dịch vụ ngoài mô tả biến thể.

使い方:
1) Nhận mail|pass|2fa (nếu có) sau thanh toán.
2) Đăng nhập tại accounts.google.com.
3) Thêm phương thức khôi phục của bạn.
4) Bật 2FA riêng và xoá 2FA cũ nếu được hướng dẫn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Gmail Aged | DigiStore', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gmail-aged', 'zh',
  'Gmail Aged', 'Email account · Aged', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.',
  'Tài khoản Gmail aged theo mốc năm. Phù hợp test, warm-up hoặc nhu cầu tài khoản lâu năm. Không cam bảo lịch sử dịch vụ ngoài mô tả biến thể.

使用说明:
1) Nhận mail|pass|2fa (nếu có) sau thanh toán.
2) Đăng nhập tại accounts.google.com.
3) Thêm phương thức khôi phục của bạn.
4) Bật 2FA riêng và xoá 2FA cũ nếu được hướng dẫn.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Gmail Aged | DigiStore', 'Gmail cổ / aged — nhiều mốc năm và tuỳ chọn OTP.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-gmail-2010-2016', 'catalog-product-gmail-aged', 'GMAIL-AGED-2010-2016',
  'active', 'license_key', 'automatic', 'tracked',
  70000, NULL, 'VND', 3, 1,
  '{"range":"2010-2016","phone":true,"unused":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["gmail-aged-2010-2016-unused-with-phone"],"range":"2010-2016","phone":true,"unused":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-gmail-aged' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GMAIL-AGED-2010-2016' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-2010-2016', 'vi', '2010–2016 · kèm số · chưa DV', 'Date 2010–2016 · có số');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-2010-2016', 'en', '2010–2016 · kèm số · chưa DV', 'Date 2010–2016 · có số');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-2010-2016', 'ja', '2010–2016 · kèm số · chưa DV', 'Date 2010–2016 · có số');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-2010-2016', 'zh', '2010–2016 · kèm số · chưa DV', 'Date 2010–2016 · có số');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-gmail-random-2010-2022', 'catalog-product-gmail-aged', 'GMAIL-AGED-2010-2022',
  'active', 'license_key', 'automatic', 'tracked',
  70000, NULL, 'VND', 3, 1,
  '{"range":"2010-2022","random":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["gmail-aged-random-2010-2022"],"range":"2010-2022","random":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-gmail-aged' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GMAIL-AGED-2010-2022' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-random-2010-2022', 'vi', 'Random 2010–2022', 'Random date 2010–2022');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-random-2010-2022', 'en', 'Random 2010–2022', 'Random date 2010–2022');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-random-2010-2022', 'ja', 'Random 2010–2022', 'Random date 2010–2022');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-random-2010-2022', 'zh', 'Random 2010–2022', 'Random date 2010–2022');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-gmail-us-2006-2012-otp', 'catalog-product-gmail-aged', 'GMAIL-US-2006-2012-OTP',
  'active', 'license_key', 'automatic', 'tracked',
  80000, NULL, 'VND', 3, 1,
  '{"range":"2006-2012","region":"US","phone":true,"otpApi":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["gmail-us-aged-2006-2012-phone-api-otp"],"range":"2006-2012","region":"US","phone":true,"otpApi":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-gmail-aged' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GMAIL-US-2006-2012-OTP' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-us-2006-2012-otp', 'vi', 'US 2006–2012 · số + API OTP', 'US · có số & API OTP');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-us-2006-2012-otp', 'en', 'US 2006–2012 · số + API OTP', 'US · có số & API OTP');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-us-2006-2012-otp', 'ja', 'US 2006–2012 · số + API OTP', 'US · có số & API OTP');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gmail-us-2006-2012-otp', 'zh', 'US 2006–2012 · số + API OTP', 'US · có số & API OTP');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-mail-random-2012-2024', 'catalog-product-gmail-aged', 'MAIL-AGED-2012-2024',
  'active', 'license_key', 'automatic', 'tracked',
  50000, NULL, 'VND', 3, 1,
  '{"range":"2012-2024","random":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["aged-mail-random-2012-2024"],"range":"2012-2024","random":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-gmail-aged' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'MAIL-AGED-2012-2024' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-mail-random-2012-2024', 'vi', 'Mail cổ random 2012–2024', 'Siêu trâu · random 2012–2024');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-mail-random-2012-2024', 'en', 'Mail cổ random 2012–2024', 'Siêu trâu · random 2012–2024');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-mail-random-2012-2024', 'ja', 'Mail cổ random 2012–2024', 'Siêu trâu · random 2012–2024');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-mail-random-2012-2024', 'zh', 'Mail cổ random 2012–2024', 'Siêu trâu · random 2012–2024');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-gmail-aged',
  'catalog-product-gmail-aged',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/gmail-aged.webp',
  'Ảnh bìa Gmail Aged — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== LinkedIn Premium (linkedin-premium) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-linkedin-premium',
  'linkedin-premium',
  'active', 'digital_key', 0, 230, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["linkedin-premium-career-code-3-months"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'linkedin-premium' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-linkedin-premium', 'vi',
  'LinkedIn Premium', 'Career · 3 tháng', 'Code LinkedIn Premium Career 3 tháng.',
  'Mã kích hoạt LinkedIn Premium Career thời hạn 3 tháng. Quyền lợi theo gói Career của LinkedIn.

Hướng dẫn sử dụng:
1) Nhận code sau thanh toán.
2) Mở LinkedIn → Settings → Subscriptions.
3) Redeem code trên tài khoản của bạn.
4) Xác nhận Premium Career đã active.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'LinkedIn Premium | DigiStore', 'Code LinkedIn Premium Career 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-linkedin-premium', 'en',
  'LinkedIn Premium', 'Career · 3 tháng', 'Code LinkedIn Premium Career 3 tháng.',
  'Mã kích hoạt LinkedIn Premium Career thời hạn 3 tháng. Quyền lợi theo gói Career của LinkedIn.

How to use:
1) Nhận code sau thanh toán.
2) Mở LinkedIn → Settings → Subscriptions.
3) Redeem code trên tài khoản của bạn.
4) Xác nhận Premium Career đã active.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'LinkedIn Premium | DigiStore', 'Code LinkedIn Premium Career 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-linkedin-premium', 'ja',
  'LinkedIn Premium', 'Career · 3 tháng', 'Code LinkedIn Premium Career 3 tháng.',
  'Mã kích hoạt LinkedIn Premium Career thời hạn 3 tháng. Quyền lợi theo gói Career của LinkedIn.

使い方:
1) Nhận code sau thanh toán.
2) Mở LinkedIn → Settings → Subscriptions.
3) Redeem code trên tài khoản của bạn.
4) Xác nhận Premium Career đã active.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'LinkedIn Premium | DigiStore', 'Code LinkedIn Premium Career 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-linkedin-premium', 'zh',
  'LinkedIn Premium', 'Career · 3 tháng', 'Code LinkedIn Premium Career 3 tháng.',
  'Mã kích hoạt LinkedIn Premium Career thời hạn 3 tháng. Quyền lợi theo gói Career của LinkedIn.

使用说明:
1) Nhận code sau thanh toán.
2) Mở LinkedIn → Settings → Subscriptions.
3) Redeem code trên tài khoản của bạn.
4) Xác nhận Premium Career đã active.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'LinkedIn Premium | DigiStore', 'Code LinkedIn Premium Career 3 tháng.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-linkedin-career-3m', 'catalog-product-linkedin-premium', 'LINKEDIN-CAREER-3M',
  'active', 'license_key', 'automatic', 'tracked',
  120000, NULL, 'VND', 3, 1,
  '{"plan":"career","duration":"3-month","delivery":"code"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["linkedin-premium-career-code-3-months"],"plan":"career","duration":"3-month","delivery":"code"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-linkedin-premium' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'LINKEDIN-CAREER-3M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-linkedin-career-3m', 'vi', 'Premium Career · 3 tháng', 'Code redeem · 3 tháng');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-linkedin-career-3m', 'en', 'Premium Career · 3 tháng', 'Code redeem · 3 tháng');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-linkedin-career-3m', 'ja', 'Premium Career · 3 tháng', 'Code redeem · 3 tháng');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-linkedin-career-3m', 'zh', 'Premium Career · 3 tháng', 'Code redeem · 3 tháng');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-linkedin-premium',
  'catalog-product-linkedin-premium',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/linkedin-premium.webp',
  'Ảnh bìa LinkedIn Premium — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== GPM Login (gpm-login) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-gpm-login',
  'gpm-login',
  'active', 'digital_key', 0, 240, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["gpm-login-license"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'gpm-login' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gpm-login', 'vi',
  'GPM Login', 'Antidetect browser · License', 'Key GPM Login chính hãng — trình duyệt antidetect.',
  'License key GPM Login chính hãng để quản lý profile trình duyệt antidetect phục vụ marketing/automation.

Hướng dẫn sử dụng:
1) Nhận key license sau thanh toán.
2) Tải GPM Login từ nhà phát hành.
3) Kích hoạt key trong phần License.
4) Tạo profile và đồng bộ theo nhu cầu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'GPM Login | DigiStore', 'Key GPM Login chính hãng — trình duyệt antidetect.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gpm-login', 'en',
  'GPM Login', 'Antidetect browser · License', 'Key GPM Login chính hãng — trình duyệt antidetect.',
  'License key GPM Login chính hãng để quản lý profile trình duyệt antidetect phục vụ marketing/automation.

How to use:
1) Nhận key license sau thanh toán.
2) Tải GPM Login từ nhà phát hành.
3) Kích hoạt key trong phần License.
4) Tạo profile và đồng bộ theo nhu cầu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'GPM Login | DigiStore', 'Key GPM Login chính hãng — trình duyệt antidetect.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gpm-login', 'ja',
  'GPM Login', 'Antidetect browser · License', 'Key GPM Login chính hãng — trình duyệt antidetect.',
  'License key GPM Login chính hãng để quản lý profile trình duyệt antidetect phục vụ marketing/automation.

使い方:
1) Nhận key license sau thanh toán.
2) Tải GPM Login từ nhà phát hành.
3) Kích hoạt key trong phần License.
4) Tạo profile và đồng bộ theo nhu cầu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'GPM Login | DigiStore', 'Key GPM Login chính hãng — trình duyệt antidetect.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-gpm-login', 'zh',
  'GPM Login', 'Antidetect browser · License', 'Key GPM Login chính hãng — trình duyệt antidetect.',
  'License key GPM Login chính hãng để quản lý profile trình duyệt antidetect phục vụ marketing/automation.

使用说明:
1) Nhận key license sau thanh toán.
2) Tải GPM Login từ nhà phát hành.
3) Kích hoạt key trong phần License.
4) Tạo profile và đồng bộ theo nhu cầu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'GPM Login | DigiStore', 'Key GPM Login chính hãng — trình duyệt antidetect.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-gpm-login-key', 'catalog-product-gpm-login', 'GPM-LOGIN-KEY',
  'active', 'license_key', 'automatic', 'tracked',
  280000, NULL, 'VND', 3, 1,
  '{"delivery":"license_key"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["gpm-login-license"],"delivery":"license_key"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-gpm-login' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GPM-LOGIN-KEY' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gpm-login-key', 'vi', 'License key chính hãng', 'Key · BH full theo NCC');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gpm-login-key', 'en', 'License key chính hãng', 'Key · BH full theo NCC');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gpm-login-key', 'ja', 'License key chính hãng', 'Key · BH full theo NCC');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gpm-login-key', 'zh', 'License key chính hãng', 'Key · BH full theo NCC');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-gpm-login',
  'catalog-product-gpm-login',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/gpm-login.webp',
  'Ảnh bìa GPM Login — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Zoom Pro (zoom-pro) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-zoom-pro',
  'zoom-pro',
  'active', 'digital_key', 0, 250, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["zoom-pro-trial-28-days"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'zoom-pro' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-zoom-pro', 'vi',
  'Zoom Pro', 'Trial · 28 ngày', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.',
  'Gói Zoom Pro trial 28 ngày cho họp nhóm, webinar cơ bản và ghi hình theo quyền lợi Pro.

Hướng dẫn sử dụng:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Zoom desktop/web.
3) Kiểm tra plan Pro và ngày hết hạn.
4) Đổi mật khẩu ngay.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Zoom Pro | DigiStore', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-zoom-pro', 'en',
  'Zoom Pro', 'Trial · 28 ngày', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.',
  'Gói Zoom Pro trial 28 ngày cho họp nhóm, webinar cơ bản và ghi hình theo quyền lợi Pro.

How to use:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Zoom desktop/web.
3) Kiểm tra plan Pro và ngày hết hạn.
4) Đổi mật khẩu ngay.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Zoom Pro | DigiStore', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-zoom-pro', 'ja',
  'Zoom Pro', 'Trial · 28 ngày', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.',
  'Gói Zoom Pro trial 28 ngày cho họp nhóm, webinar cơ bản và ghi hình theo quyền lợi Pro.

使い方:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Zoom desktop/web.
3) Kiểm tra plan Pro và ngày hết hạn.
4) Đổi mật khẩu ngay.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Zoom Pro | DigiStore', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-zoom-pro', 'zh',
  'Zoom Pro', 'Trial · 28 ngày', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.',
  'Gói Zoom Pro trial 28 ngày cho họp nhóm, webinar cơ bản và ghi hình theo quyền lợi Pro.

使用说明:
1) Nhận tài khoản/key sau thanh toán.
2) Đăng nhập Zoom desktop/web.
3) Kiểm tra plan Pro và ngày hết hạn.
4) Đổi mật khẩu ngay.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Zoom Pro | DigiStore', 'Zoom Pro Trial 28 ngày — họp không giới hạn 40 phút.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-zoom-pro-28d', 'catalog-product-zoom-pro', 'ZOOM-PRO-28D',
  'active', 'license_key', 'automatic', 'tracked',
  100000, NULL, 'VND', 3, 1,
  '{"plan":"pro-trial","duration":"28-day"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["zoom-pro-trial-28-days"],"plan":"pro-trial","duration":"28-day"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-zoom-pro' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'ZOOM-PRO-28D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-zoom-pro-28d', 'vi', 'Pro Trial · 28 ngày', '28 ngày · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-zoom-pro-28d', 'en', 'Pro Trial · 28 ngày', '28 ngày · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-zoom-pro-28d', 'ja', 'Pro Trial · 28 ngày', '28 ngày · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-zoom-pro-28d', 'zh', 'Pro Trial · 28 ngày', '28 ngày · BH full');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-zoom-pro',
  'catalog-product-zoom-pro',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/zoom-pro.webp',
  'Ảnh bìa Zoom Pro — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Scribd Premium (scribd) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-scribd',
  'scribd',
  'active', 'digital_key', 0, 260, 'vi', NULL,
  '{"categorySlug":"entertainment","category":"Giải trí","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["scribd-premium-1-month"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'scribd' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-scribd', 'vi',
  'Scribd Premium', 'Books & docs · 1 tháng', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.',
  'Gói Scribd Premium 1 tháng cho đọc sách, audiobook và tài liệu trong thư viện Scribd.

Hướng dẫn sử dụng:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập scribd.com hoặc app.
3) Kiểm tra Premium badge.
4) Đổi mật khẩu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Scribd Premium | DigiStore', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-scribd', 'en',
  'Scribd Premium', 'Books & docs · 1 tháng', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.',
  'Gói Scribd Premium 1 tháng cho đọc sách, audiobook và tài liệu trong thư viện Scribd.

How to use:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập scribd.com hoặc app.
3) Kiểm tra Premium badge.
4) Đổi mật khẩu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Scribd Premium | DigiStore', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-scribd', 'ja',
  'Scribd Premium', 'Books & docs · 1 tháng', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.',
  'Gói Scribd Premium 1 tháng cho đọc sách, audiobook và tài liệu trong thư viện Scribd.

使い方:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập scribd.com hoặc app.
3) Kiểm tra Premium badge.
4) Đổi mật khẩu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Scribd Premium | DigiStore', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-scribd', 'zh',
  'Scribd Premium', 'Books & docs · 1 tháng', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.',
  'Gói Scribd Premium 1 tháng cho đọc sách, audiobook và tài liệu trong thư viện Scribd.

使用说明:
1) Nhận tài khoản sau thanh toán.
2) Đăng nhập scribd.com hoặc app.
3) Kiểm tra Premium badge.
4) Đổi mật khẩu.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Scribd Premium | DigiStore', 'Scribd Premium 1 tháng — sách, audiobook, tài liệu.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-scribd-1m', 'catalog-product-scribd', 'SCRIBD-PREMIUM-1M',
  'active', 'license_key', 'automatic', 'tracked',
  150000, NULL, 'VND', 3, 1,
  '{"duration":"1-month"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["scribd-premium-1-month"],"duration":"1-month"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-scribd' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'SCRIBD-PREMIUM-1M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-scribd-1m', 'vi', 'Premium · 1 tháng', '1 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-scribd-1m', 'en', 'Premium · 1 tháng', '1 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-scribd-1m', 'ja', 'Premium · 1 tháng', '1 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-scribd-1m', 'zh', 'Premium · 1 tháng', '1 tháng · BH full');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-scribd',
  'catalog-product-scribd',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/scribd.webp',
  'Ảnh bìa Scribd Premium — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== TikTok Account (tiktok) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-tiktok',
  'tiktok',
  'active', 'digital_key', 0, 270, 'vi', NULL,
  '{"categorySlug":"entertainment","category":"Giải trí","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["tiktok-korea-mail-live","tiktok-live-studio-1k-fl-buff","tiktok-aged-shop-live-enabled"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'tiktok' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-tiktok', 'vi',
  'TikTok Account', 'Social account', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.',
  'Các gói tài khoản TikTok: Hàn mail live, Live Studio buff follow, hoặc cổ mở giỏ hàng + Live.

Hướng dẫn sử dụng:
1) Nhận mail|pass|2fa sau thanh toán.
2) Đăng nhập TikTok, đổi mật khẩu và email khôi phục.
3) Kiểm tra quyền Live/Shop theo biến thể.
4) Không spam ngay sau khi nhận tài khoản.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'TikTok Account | DigiStore', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-tiktok', 'en',
  'TikTok Account', 'Social account', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.',
  'Các gói tài khoản TikTok: Hàn mail live, Live Studio buff follow, hoặc cổ mở giỏ hàng + Live.

How to use:
1) Nhận mail|pass|2fa sau thanh toán.
2) Đăng nhập TikTok, đổi mật khẩu và email khôi phục.
3) Kiểm tra quyền Live/Shop theo biến thể.
4) Không spam ngay sau khi nhận tài khoản.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'TikTok Account | DigiStore', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-tiktok', 'ja',
  'TikTok Account', 'Social account', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.',
  'Các gói tài khoản TikTok: Hàn mail live, Live Studio buff follow, hoặc cổ mở giỏ hàng + Live.

使い方:
1) Nhận mail|pass|2fa sau thanh toán.
2) Đăng nhập TikTok, đổi mật khẩu và email khôi phục.
3) Kiểm tra quyền Live/Shop theo biến thể.
4) Không spam ngay sau khi nhận tài khoản.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'TikTok Account | DigiStore', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-tiktok', 'zh',
  'TikTok Account', 'Social account', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.',
  'Các gói tài khoản TikTok: Hàn mail live, Live Studio buff follow, hoặc cổ mở giỏ hàng + Live.

使用说明:
1) Nhận mail|pass|2fa sau thanh toán.
2) Đăng nhập TikTok, đổi mật khẩu và email khôi phục.
3) Kiểm tra quyền Live/Shop theo biến thể.
4) Không spam ngay sau khi nhận tài khoản.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'TikTok Account | DigiStore', 'Tài khoản TikTok theo nhu cầu Live / Shop / Hàn.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-tiktok-kr-live', 'catalog-product-tiktok', 'TIKTOK-KR-MAIL-LIVE',
  'active', 'license_key', 'automatic', 'tracked',
  60000, NULL, 'VND', 3, 1,
  '{"region":"KR","live":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["tiktok-korea-mail-live"],"region":"KR","live":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-tiktok' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'TIKTOK-KR-MAIL-LIVE' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-kr-live', 'vi', 'Hàn · Mail Live', 'KR · Live enabled');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-kr-live', 'en', 'Hàn · Mail Live', 'KR · Live enabled');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-kr-live', 'ja', 'Hàn · Mail Live', 'KR · Live enabled');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-kr-live', 'zh', 'Hàn · Mail Live', 'KR · Live enabled');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-tiktok-live-studio-1k', 'catalog-product-tiktok', 'TIKTOK-LIVE-STUDIO-1K',
  'active', 'license_key', 'automatic', 'tracked',
  280000, NULL, 'VND', 3, 1,
  '{"liveStudio":true,"followBuff":1000}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["tiktok-live-studio-1k-fl-buff"],"liveStudio":true,"followBuff":1000}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-tiktok' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'TIKTOK-LIVE-STUDIO-1K' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-live-studio-1k', 'vi', 'Live Studio · 1K FL buff', 'Live Studio · ~1K follow buff');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-live-studio-1k', 'en', 'Live Studio · 1K FL buff', 'Live Studio · ~1K follow buff');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-live-studio-1k', 'ja', 'Live Studio · 1K FL buff', 'Live Studio · ~1K follow buff');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-live-studio-1k', 'zh', 'Live Studio · 1K FL buff', 'Live Studio · ~1K follow buff');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-tiktok-shop-live', 'catalog-product-tiktok', 'TIKTOK-AGED-SHOP-LIVE',
  'active', 'license_key', 'automatic', 'tracked',
  420000, NULL, 'VND', 3, 1,
  '{"aged":true,"shop":true,"live":true}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["tiktok-aged-shop-live-enabled"],"aged":true,"shop":true,"live":true}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-tiktok' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'TIKTOK-AGED-SHOP-LIVE' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-shop-live', 'vi', 'Cổ · Shop + Live', 'Aged · giỏ hàng + Live');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-shop-live', 'en', 'Cổ · Shop + Live', 'Aged · giỏ hàng + Live');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-shop-live', 'ja', 'Cổ · Shop + Live', 'Aged · giỏ hàng + Live');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-tiktok-shop-live', 'zh', 'Cổ · Shop + Live', 'Aged · giỏ hàng + Live');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-tiktok',
  'catalog-product-tiktok',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/tiktok.webp',
  'Ảnh bìa TikTok Account — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== HMA VPN (hma-vpn) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-hma-vpn',
  'hma-vpn',
  'active', 'digital_key', 0, 280, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["hma-android-pc-key-20-30-days"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'hma-vpn' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-hma-vpn', 'vi',
  'HMA VPN', 'VPN · 20–30 ngày', 'Key HMA VPN Android/PC 20–30 ngày.',
  'License HMA (HideMyAss) VPN dùng trên Android/PC trong khoảng 20–30 ngày tùy key bàn giao.

Hướng dẫn sử dụng:
1) Nhận key sau thanh toán.
2) Cài HMA VPN chính thức.
3) Activate key trên app.
4) Kết nối server và kiểm tra IP.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HMA VPN | DigiStore', 'Key HMA VPN Android/PC 20–30 ngày.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-hma-vpn', 'en',
  'HMA VPN', 'VPN · 20–30 ngày', 'Key HMA VPN Android/PC 20–30 ngày.',
  'License HMA (HideMyAss) VPN dùng trên Android/PC trong khoảng 20–30 ngày tùy key bàn giao.

How to use:
1) Nhận key sau thanh toán.
2) Cài HMA VPN chính thức.
3) Activate key trên app.
4) Kết nối server và kiểm tra IP.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HMA VPN | DigiStore', 'Key HMA VPN Android/PC 20–30 ngày.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-hma-vpn', 'ja',
  'HMA VPN', 'VPN · 20–30 ngày', 'Key HMA VPN Android/PC 20–30 ngày.',
  'License HMA (HideMyAss) VPN dùng trên Android/PC trong khoảng 20–30 ngày tùy key bàn giao.

使い方:
1) Nhận key sau thanh toán.
2) Cài HMA VPN chính thức.
3) Activate key trên app.
4) Kết nối server và kiểm tra IP.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HMA VPN | DigiStore', 'Key HMA VPN Android/PC 20–30 ngày.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-hma-vpn', 'zh',
  'HMA VPN', 'VPN · 20–30 ngày', 'Key HMA VPN Android/PC 20–30 ngày.',
  'License HMA (HideMyAss) VPN dùng trên Android/PC trong khoảng 20–30 ngày tùy key bàn giao.

使用说明:
1) Nhận key sau thanh toán.
2) Cài HMA VPN chính thức.
3) Activate key trên app.
4) Kết nối server và kiểm tra IP.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'HMA VPN | DigiStore', 'Key HMA VPN Android/PC 20–30 ngày.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-hma-20-30d', 'catalog-product-hma-vpn', 'HMA-VPN-20-30D',
  'active', 'license_key', 'automatic', 'tracked',
  40000, NULL, 'VND', 3, 1,
  '{"durationMinDays":20,"durationMaxDays":30,"platforms":"android-pc"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["hma-android-pc-key-20-30-days"],"durationMinDays":20,"durationMaxDays":30,"platforms":"android-pc"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-hma-vpn' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'HMA-VPN-20-30D' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-hma-20-30d', 'vi', 'Android/PC · 20–30 ngày', 'Key · 20–30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-hma-20-30d', 'en', 'Android/PC · 20–30 ngày', 'Key · 20–30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-hma-20-30d', 'ja', 'Android/PC · 20–30 ngày', 'Key · 20–30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-hma-20-30d', 'zh', 'Android/PC · 20–30 ngày', 'Key · 20–30 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-hma-vpn',
  'catalog-product-hma-vpn',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/hma-vpn.webp',
  'Ảnh bìa HMA VPN — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== X Premium (x-premium) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-x-premium',
  'x-premium',
  'active', 'digital_key', 0, 290, 'vi', NULL,
  '{"categorySlug":"entertainment","category":"Giải trí","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["x-premium-slot-3-months"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'x-premium' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-x-premium', 'vi',
  'X Premium', 'Slot · 3 tháng', 'Slot X (Twitter) Premium 3 tháng.',
  'Slot X Premium 3 tháng — tham gia gói Premium qua slot được bàn giao (không phải family Google).

Hướng dẫn sử dụng:
1) Nhận hướng dẫn join slot sau thanh toán.
2) Làm theo link/invite trong email đơn.
3) Kiểm tra badge Premium trên X.
4) Không rời slot trước hạn nếu muốn giữ Premium.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'X Premium | DigiStore', 'Slot X (Twitter) Premium 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-x-premium', 'en',
  'X Premium', 'Slot · 3 tháng', 'Slot X (Twitter) Premium 3 tháng.',
  'Slot X Premium 3 tháng — tham gia gói Premium qua slot được bàn giao (không phải family Google).

How to use:
1) Nhận hướng dẫn join slot sau thanh toán.
2) Làm theo link/invite trong email đơn.
3) Kiểm tra badge Premium trên X.
4) Không rời slot trước hạn nếu muốn giữ Premium.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'X Premium | DigiStore', 'Slot X (Twitter) Premium 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-x-premium', 'ja',
  'X Premium', 'Slot · 3 tháng', 'Slot X (Twitter) Premium 3 tháng.',
  'Slot X Premium 3 tháng — tham gia gói Premium qua slot được bàn giao (không phải family Google).

使い方:
1) Nhận hướng dẫn join slot sau thanh toán.
2) Làm theo link/invite trong email đơn.
3) Kiểm tra badge Premium trên X.
4) Không rời slot trước hạn nếu muốn giữ Premium.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'X Premium | DigiStore', 'Slot X (Twitter) Premium 3 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-x-premium', 'zh',
  'X Premium', 'Slot · 3 tháng', 'Slot X (Twitter) Premium 3 tháng.',
  'Slot X Premium 3 tháng — tham gia gói Premium qua slot được bàn giao (không phải family Google).

使用说明:
1) Nhận hướng dẫn join slot sau thanh toán.
2) Làm theo link/invite trong email đơn.
3) Kiểm tra badge Premium trên X.
4) Không rời slot trước hạn nếu muốn giữ Premium.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'X Premium | DigiStore', 'Slot X (Twitter) Premium 3 tháng.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-x-premium-3m', 'catalog-product-x-premium', 'X-PREMIUM-SLOT-3M',
  'active', 'license_key', 'automatic', 'tracked',
  450000, NULL, 'VND', 3, 1,
  '{"duration":"3-month","delivery":"slot"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["x-premium-slot-3-months"],"duration":"3-month","delivery":"slot"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-x-premium' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'X-PREMIUM-SLOT-3M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-x-premium-3m', 'vi', 'Premium slot · 3 tháng', 'Slot · 3 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-x-premium-3m', 'en', 'Premium slot · 3 tháng', 'Slot · 3 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-x-premium-3m', 'ja', 'Premium slot · 3 tháng', 'Slot · 3 tháng · BH full');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-x-premium-3m', 'zh', 'Premium slot · 3 tháng', 'Slot · 3 tháng · BH full');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-x-premium',
  'catalog-product-x-premium',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/x-premium.webp',
  'Ảnh bìa X Premium — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Notion Enterprise (notion-enterprise) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-notion-enterprise',
  'notion-enterprise',
  'active', 'digital_key', 0, 300, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Năng suất","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["notion-enterprise-slot-1-year"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'notion-enterprise' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-notion-enterprise', 'vi',
  'Notion Enterprise', 'Slot · 1 năm', 'Slot Notion Enterprise 1 năm.',
  'Slot workspace Notion Enterprise thời hạn 1 năm — quyền lợi theo workspace được mời.

Hướng dẫn sử dụng:
1) Nhận invite email/link sau thanh toán.
2) Join workspace Notion.
3) Kiểm tra plan Enterprise.
4) Dùng email cá nhân ổn định; không rời workspace nếu muốn giữ quyền.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Notion Enterprise | DigiStore', 'Slot Notion Enterprise 1 năm.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-notion-enterprise', 'en',
  'Notion Enterprise', 'Slot · 1 năm', 'Slot Notion Enterprise 1 năm.',
  'Slot workspace Notion Enterprise thời hạn 1 năm — quyền lợi theo workspace được mời.

How to use:
1) Nhận invite email/link sau thanh toán.
2) Join workspace Notion.
3) Kiểm tra plan Enterprise.
4) Dùng email cá nhân ổn định; không rời workspace nếu muốn giữ quyền.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Notion Enterprise | DigiStore', 'Slot Notion Enterprise 1 năm.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-notion-enterprise', 'ja',
  'Notion Enterprise', 'Slot · 1 năm', 'Slot Notion Enterprise 1 năm.',
  'Slot workspace Notion Enterprise thời hạn 1 năm — quyền lợi theo workspace được mời.

使い方:
1) Nhận invite email/link sau thanh toán.
2) Join workspace Notion.
3) Kiểm tra plan Enterprise.
4) Dùng email cá nhân ổn định; không rời workspace nếu muốn giữ quyền.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Notion Enterprise | DigiStore', 'Slot Notion Enterprise 1 năm.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-notion-enterprise', 'zh',
  'Notion Enterprise', 'Slot · 1 năm', 'Slot Notion Enterprise 1 năm.',
  'Slot workspace Notion Enterprise thời hạn 1 năm — quyền lợi theo workspace được mời.

使用说明:
1) Nhận invite email/link sau thanh toán.
2) Join workspace Notion.
3) Kiểm tra plan Enterprise.
4) Dùng email cá nhân ổn định; không rời workspace nếu muốn giữ quyền.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Notion Enterprise | DigiStore', 'Slot Notion Enterprise 1 năm.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-notion-ent-1y', 'catalog-product-notion-enterprise', 'NOTION-ENT-SLOT-1Y',
  'active', 'license_key', 'automatic', 'tracked',
  50000, NULL, 'VND', 3, 1,
  '{"duration":"1-year","delivery":"slot","warranty":"none"}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["notion-enterprise-slot-1-year"],"duration":"1-year","delivery":"slot","warranty":"none"}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-notion-enterprise' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'NOTION-ENT-SLOT-1Y' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-notion-ent-1y', 'vi', 'Enterprise slot · 1 năm', 'Slot · 1 năm');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-notion-ent-1y', 'en', 'Enterprise slot · 1 năm', 'Slot · 1 năm');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-notion-ent-1y', 'ja', 'Enterprise slot · 1 năm', 'Slot · 1 năm');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-notion-ent-1y', 'zh', 'Enterprise slot · 1 năm', 'Slot · 1 năm');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-notion-enterprise',
  'catalog-product-notion-enterprise',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/notion-enterprise.webp',
  'Ảnh bìa Notion Enterprise — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== VEO3 Credits (veo3-credits) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-veo3-credits',
  'veo3-credits',
  'active', 'digital_key', 0, 310, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["veo3-45k-credits-extension","admin-veo3-x20-25k-credits"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'veo3-credits' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-veo3-credits', 'vi',
  'VEO3 Credits', 'AI Video · Credit pack', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.',
  'Credit pack VEO3 cho tạo video AI. Khác gói VEO3 Anti sẵn có: đây là nạp/extension credit theo mức chọn.

Hướng dẫn sử dụng:
1) Nhận hướng dẫn nạp hoặc tài khoản sau thanh toán.
2) Áp dụng credit vào tài khoản VEO3 chỉ định.
3) Kiểm tra số dư credit.
4) Dùng trong hạn BH biến thể.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'VEO3 Credits | DigiStore', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-veo3-credits', 'en',
  'VEO3 Credits', 'AI Video · Credit pack', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.',
  'Credit pack VEO3 cho tạo video AI. Khác gói VEO3 Anti sẵn có: đây là nạp/extension credit theo mức chọn.

How to use:
1) Nhận hướng dẫn nạp hoặc tài khoản sau thanh toán.
2) Áp dụng credit vào tài khoản VEO3 chỉ định.
3) Kiểm tra số dư credit.
4) Dùng trong hạn BH biến thể.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'VEO3 Credits | DigiStore', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-veo3-credits', 'ja',
  'VEO3 Credits', 'AI Video · Credit pack', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.',
  'Credit pack VEO3 cho tạo video AI. Khác gói VEO3 Anti sẵn có: đây là nạp/extension credit theo mức chọn.

使い方:
1) Nhận hướng dẫn nạp hoặc tài khoản sau thanh toán.
2) Áp dụng credit vào tài khoản VEO3 chỉ định.
3) Kiểm tra số dư credit.
4) Dùng trong hạn BH biến thể.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'VEO3 Credits | DigiStore', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-veo3-credits', 'zh',
  'VEO3 Credits', 'AI Video · Credit pack', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.',
  'Credit pack VEO3 cho tạo video AI. Khác gói VEO3 Anti sẵn có: đây là nạp/extension credit theo mức chọn.

使用说明:
1) Nhận hướng dẫn nạp hoặc tài khoản sau thanh toán.
2) Áp dụng credit vào tài khoản VEO3 chỉ định.
3) Kiểm tra số dư credit.
4) Dùng trong hạn BH biến thể.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'VEO3 Credits | DigiStore', 'Gói credit VEO3 — extension 45K hoặc Admin X20 25K.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-veo3-45k-ext', 'catalog-product-veo3-credits', 'VEO3-45K-EXT',
  'active', 'license_key', 'automatic', 'tracked',
  420000, NULL, 'VND', 3, 1,
  '{"credits":45000,"kind":"extension","warrantyDays":20}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["veo3-45k-credits-extension"],"credits":45000,"kind":"extension","warrantyDays":20}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-veo3-credits' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'VEO3-45K-EXT' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-45k-ext', 'vi', '45K credits extension', '45K credit · BH: 20 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-45k-ext', 'en', '45K credits extension', '45K credit · BH: 20 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-45k-ext', 'ja', '45K credits extension', '45K credit · BH: 20 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-45k-ext', 'zh', '45K credits extension', '45K credit · BH: 20 ngày');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-veo3-admin-x20-25k', 'catalog-product-veo3-credits', 'VEO3-ADMIN-X20-25K',
  'active', 'license_key', 'automatic', 'tracked',
  2380000, NULL, 'VND', 3, 1,
  '{"credits":25000,"plan":"admin-x20","warrantyDays":7}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["admin-veo3-x20-25k-credits"],"credits":25000,"plan":"admin-x20","warrantyDays":7}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-veo3-credits' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'VEO3-ADMIN-X20-25K' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-admin-x20-25k', 'vi', 'Admin X20 · 25K credits', 'Admin X20 · 25K · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-admin-x20-25k', 'en', 'Admin X20 · 25K credits', 'Admin X20 · 25K · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-admin-x20-25k', 'ja', 'Admin X20 · 25K credits', 'Admin X20 · 25K · BH: 7 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-veo3-admin-x20-25k', 'zh', 'Admin X20 · 25K credits', 'Admin X20 · 25K · BH: 7 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-veo3-credits',
  'catalog-product-veo3-credits',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/veo3-credits.webp',
  'Ảnh bìa VEO3 Credits — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Google Family Slot (google-family) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-google-family',
  'google-family',
  'active', 'digital_key', 0, 320, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["slot-add-family-0-credit","slot-add-family-random-credit"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'google-family' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-family', 'vi',
  'Google Family Slot', 'Family slot · AI plan', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.',
  'Slot gia đình Google/AI plan: biến thể 0 credit hoặc random credit. Quyền lợi phụ thuộc gói chủ family.

Hướng dẫn sử dụng:
1) Cung cấp email Google sạch theo hướng dẫn đơn.
2) Chấp nhận lời mời family.
3) Kiểm tra quyền AI trên tài khoản.
4) Không rời family trước hạn nếu muốn giữ slot.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Google Family Slot | DigiStore', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-family', 'en',
  'Google Family Slot', 'Family slot · AI plan', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.',
  'Slot gia đình Google/AI plan: biến thể 0 credit hoặc random credit. Quyền lợi phụ thuộc gói chủ family.

How to use:
1) Cung cấp email Google sạch theo hướng dẫn đơn.
2) Chấp nhận lời mời family.
3) Kiểm tra quyền AI trên tài khoản.
4) Không rời family trước hạn nếu muốn giữ slot.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Google Family Slot | DigiStore', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-family', 'ja',
  'Google Family Slot', 'Family slot · AI plan', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.',
  'Slot gia đình Google/AI plan: biến thể 0 credit hoặc random credit. Quyền lợi phụ thuộc gói chủ family.

使い方:
1) Cung cấp email Google sạch theo hướng dẫn đơn.
2) Chấp nhận lời mời family.
3) Kiểm tra quyền AI trên tài khoản.
4) Không rời family trước hạn nếu muốn giữ slot.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Google Family Slot | DigiStore', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-family', 'zh',
  'Google Family Slot', 'Family slot · AI plan', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.',
  'Slot gia đình Google/AI plan: biến thể 0 credit hoặc random credit. Quyền lợi phụ thuộc gói chủ family.

使用说明:
1) Cung cấp email Google sạch theo hướng dẫn đơn.
2) Chấp nhận lời mời family.
3) Kiểm tra quyền AI trên tài khoản.
4) Không rời family trước hạn nếu muốn giữ slot.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Google Family Slot | DigiStore', 'Slot Add Family cho gói AI — 0 credit hoặc random credit.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-family-0-credit', 'catalog-product-google-family', 'FAMILY-SLOT-0CR',
  'active', 'license_key', 'automatic', 'tracked',
  535000, NULL, 'VND', 3, 1,
  '{"credits":0,"warrantyDays":30}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["slot-add-family-0-credit"],"credits":0,"warrantyDays":30}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-google-family' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'FAMILY-SLOT-0CR' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-0-credit', 'vi', 'Slot family · 0 credit', '0 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-0-credit', 'en', 'Slot family · 0 credit', '0 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-0-credit', 'ja', 'Slot family · 0 credit', '0 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-0-credit', 'zh', 'Slot family · 0 credit', '0 credit · BH: 30 ngày');

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-family-random-credit', 'catalog-product-google-family', 'FAMILY-SLOT-RND-CR',
  'active', 'license_key', 'automatic', 'tracked',
  630000, NULL, 'VND', 3, 1,
  '{"credits":"random","warrantyDays":30}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["slot-add-family-random-credit"],"credits":"random","warrantyDays":30}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-google-family' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'FAMILY-SLOT-RND-CR' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-random-credit', 'vi', 'Slot family · random credit', 'Random credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-random-credit', 'en', 'Slot family · random credit', 'Random credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-random-credit', 'ja', 'Slot family · random credit', 'Random credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-family-random-credit', 'zh', 'Slot family · random credit', 'Random credit · BH: 30 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-google-family',
  'catalog-product-google-family',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/google-family.webp',
  'Ảnh bìa Google Family Slot — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

-- ===== Grok xAI API (grok-api) =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-grok-api',
  'grok-api',
  'active', 'digital_key', 0, 330, 'vi', NULL,
  '{"categorySlug":"ai-tools","category":"Công cụ AI","badges":["Giao key tự động","DigiStore"],"seedKey":"shop-taphoa-2026-07-25-v1","source":"tap-hoa-ai-products.json","sourceIds":["grok-xai-api-key-100usd-1-month"]}',
  1, '2026-07-25T15:30:00.000Z', 'seed:shop-taphoa:2026-07-25:v1', 'seed:shop-taphoa:2026-07-25:v1', '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'grok-api' AND p.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-grok-api', 'vi',
  'Grok xAI API', 'API Key · $100 · 1 tháng', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.',
  'API key Grok (xAI) với hạn mức tương đương gói 100 USD trong 1 tháng. Khác gói Super Grok dùng web/app.

Hướng dẫn sử dụng:
1) Nhận API key sau thanh toán.
2) Gọi API theo docs xAI/Grok.
3) Theo dõi usage/quota.
4) Không public key; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Grok xAI API | DigiStore', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-grok-api', 'en',
  'Grok xAI API', 'API Key · $100 · 1 tháng', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.',
  'API key Grok (xAI) với hạn mức tương đương gói 100 USD trong 1 tháng. Khác gói Super Grok dùng web/app.

How to use:
1) Nhận API key sau thanh toán.
2) Gọi API theo docs xAI/Grok.
3) Theo dõi usage/quota.
4) Không public key; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Grok xAI API | DigiStore', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-grok-api', 'ja',
  'Grok xAI API', 'API Key · $100 · 1 tháng', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.',
  'API key Grok (xAI) với hạn mức tương đương gói 100 USD trong 1 tháng. Khác gói Super Grok dùng web/app.

使い方:
1) Nhận API key sau thanh toán.
2) Gọi API theo docs xAI/Grok.
3) Theo dõi usage/quota.
4) Không public key; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Grok xAI API | DigiStore', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.'
);
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-grok-api', 'zh',
  'Grok xAI API', 'API Key · $100 · 1 tháng', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.',
  'API key Grok (xAI) với hạn mức tương đương gói 100 USD trong 1 tháng. Khác gói Super Grok dùng web/app.

使用说明:
1) Nhận API key sau thanh toán.
2) Gọi API theo docs xAI/Grok.
3) Theo dõi usage/quota.
4) Không public key; rotate nếu lộ.

Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; kiểm tra biến thể, tồn kho và mô tả trước khi mua. Giao key/tài khoản tự động sau khi thanh toán được xác nhận.', 'Grok xAI API | DigiStore', 'API Key Grok xAI mệnh giá 100 USD / 1 tháng.'
);

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-grok-api-100-1m', 'catalog-product-grok-api', 'GROK-API-100USD-1M',
  'active', 'license_key', 'automatic', 'tracked',
  1400000, NULL, 'VND', 3, 1,
  '{"usdCredit":100,"duration":"1-month","warrantyDays":30}',
  '{"seedKey":"shop-taphoa-2026-07-25-v1","sourceIds":["grok-xai-api-key-100usd-1-month"],"usdCredit":100,"duration":"1-month","warrantyDays":30}',
  1, '2026-07-25T15:30:00.000Z', '2026-07-25T15:30:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-grok-api' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GROK-API-100USD-1M' COLLATE NOCASE AND deleted_at IS NULL);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-grok-api-100-1m', 'vi', 'API · $100 · 1 tháng', '$100 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-grok-api-100-1m', 'en', 'API · $100 · 1 tháng', '$100 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-grok-api-100-1m', 'ja', 'API · $100 · 1 tháng', '$100 credit · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-grok-api-100-1m', 'zh', 'API · $100 · 1 tháng', '$100 credit · BH: 30 ngày');

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-grok-api',
  'catalog-product-grok-api',
  NULL, NULL, 'image',
  'https://media.tungjpstore.net/shop/grok-api.webp',
  'Ảnh bìa Grok xAI API — DigiStore',
  0, '2026-07-25T15:30:00.000Z'
);

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-taphoa-2026-07-25-v1',
  'seed:shop-taphoa:2026-07-25:v1',
  'shop.catalog.seeded',
  'shop_catalog',
  'shop-taphoa-2026-07-25-v1',
  NULL,
  '{"products":19,"variants":31,"source":"tap-hoa-ai-products.json","skippedDuplicates":["gpt-plus-1-month","netflix-premium-4k-1-month","netflix-1-month","adobe-full-app-1-month","capcut-pro-7-days","capcut-pro-30-days","preorder-cursor-pro-plus-1-month","preorder-cursor-ultra-1-month","xbox-game-pass-ultimate"]}',
  '2026-07-25T15:30:00.000Z'
);
