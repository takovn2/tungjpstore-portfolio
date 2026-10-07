-- 0059_shop_kiro_expiry_and_catalog_unification.sql
-- Synchronize Kiro expiry to 2026-10-01 (1/10) and unify product naming & SEO across vi, en, ja, zh.

-- 1. Kiro Product Metadata
UPDATE shop_products
SET metadata_json = json_set(
  metadata_json,
  '$.expiresOn', '2026-10-01',
  '$.badges', json('["Hạn 01/10","Giao key tự động","Theo credit"]')
),
version = version + 1,
updated_at = CURRENT_TIMESTAMP
WHERE id = 'catalog-product-kiro';

-- 2. Kiro Product Localizations (vi, en, ja, zh)
UPDATE shop_product_localizations
SET
  title = 'Kiro Pro IDE (Hạn 1/10 · BH 3 ngày)',
  eyebrow = 'AI IDE · Hạn 01/10',
  short_description = 'Gói Kiro (AWS AI IDE) theo credit, giao tài khoản dạng mail|pass|2fa. Hạn dùng đến 01/10/2026.',
  description = replace(replace(description, '01/08/2026', '01/10/2026'), '01/09/2026', '01/10/2026'),
  seo_title = 'Mua Kiro Pro IDE Hạn 01/10 Giá Rẻ, Giao Nhanh | TUNG Shop',
  seo_description = 'Mua tài khoản Kiro AWS AI IDE credit dùng đến 01/10/2026 tại TUNG Shop. Giao ngay mail|pass|2fa, bảo hành 1-đổi-1, thanh toán VietQR & Ví số dư.'
WHERE product_id = 'catalog-product-kiro' AND locale = 'vi';

UPDATE shop_product_localizations
SET
  title = 'Kiro AI IDE',
  eyebrow = 'AI IDE · Expires Oct 1',
  short_description = 'Kiro (AWS AI IDE) credit packages delivered as mail|pass|2fa. Valid through 2026-10-01.',
  description = replace(replace(description, '2026-08-01', '2026-10-01'), '2026-09-01', '2026-10-01'),
  seo_title = 'Kiro AI IDE — Credit Packages (Valid until Oct 1) | TUNG Shop',
  seo_description = 'Buy Kiro AWS AI IDE credit packages at TUNG Shop. Pro / Pro Max / Power with instant key delivery. Valid through 2026-10-01.'
WHERE product_id = 'catalog-product-kiro' AND locale = 'en';

UPDATE shop_product_localizations
SET
  title = 'Kiro AI IDE',
  eyebrow = 'AI IDE · 有効期限 10/1',
  short_description = 'Kiro（AWS AI IDE）のクレジットパッケージ。mail|pass|2fa 形式で納品。有効期限 2026-10-01。',
  description = replace(replace(description, '2026-08-01', '2026-10-01'), '2026-09-01', '2026-10-01'),
  seo_title = 'Kiro AI IDE クレジットパック（有効期限 10/1）| TUNG Shop',
  seo_description = 'TUNG ShopでKiro AI IDEクレジットパッケージを購入。Pro / Pro Max / Powerプラン、即時自動納品。有効期限 2026-10-01。'
WHERE product_id = 'catalog-product-kiro' AND locale = 'ja';

UPDATE shop_product_localizations
SET
  title = 'Kiro AI IDE',
  eyebrow = 'AI IDE · 有效期至 10/1',
  short_description = 'Kiro（AWS AI IDE）按积分套餐，以 mail|pass|2fa 形式交付。有效期至 2026-10-01。',
  description = replace(replace(description, '2026-08-01', '2026-10-01'), '2026-09-01', '2026-10-01'),
  seo_title = 'Kiro AI IDE 积分套餐（有效期至 10/1）| TUNG Shop',
  seo_description = '在 TUNG Shop 购买 Kiro AWS AI IDE 积分套餐。Pro / Pro Max / Power，自动秒级交付。有效期至 2026-10-01。'
WHERE product_id = 'catalog-product-kiro' AND locale = 'zh';

-- 3. Kiro Variants Metadata & Option Values
UPDATE shop_variants
SET
  option_values_json = json_set(option_values_json, '$.expiresOn', '2026-10-01'),
  metadata_json = json_set(metadata_json, '$.expiresOn', '2026-10-01'),
  version = version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE product_id = 'catalog-product-kiro';

-- 4. Kiro Variant Localizations Option Summary
UPDATE shop_variant_localizations
SET option_summary = replace(replace(option_summary, '01/08/2026', '01/10/2026'), '01/09/2026', '01/10/2026')
WHERE variant_id LIKE 'catalog-variant-kiro%' AND locale = 'vi';

UPDATE shop_variant_localizations
SET option_summary = replace(replace(option_summary, '2026-08-01', '2026-10-01'), '2026-09-01', '2026-10-01')
WHERE variant_id LIKE 'catalog-variant-kiro%' AND locale IN ('en', 'ja', 'zh');

-- 5. Kiro Media Alt Text
UPDATE shop_product_media
SET alt = 'Ảnh bìa Kiro AI IDE — logo chính thức, gói credit hạn 01/10'
WHERE product_id = 'catalog-product-kiro';

-- 6. Unified Brand Naming & SEO across Other Products
-- ChatGPT Plus
UPDATE shop_product_localizations
SET
  title = 'ChatGPT Plus (GPay Chính Chủ)',
  eyebrow = 'AI Thông Minh · Cấp Sẵn',
  seo_title = 'Mua ChatGPT Plus Chính Chủ Giá Rẻ, Giao Nhanh | TUNG Shop',
  seo_description = 'Mua tài khoản ChatGPT Plus chính chủ GPT-4o, DALL-E, Advanced Voice tại TUNG Shop. Bảo hành uy tín trọn thời hạn, thanh toán tự động 24/7.'
WHERE product_id = 'a7747d12-66c2-4a18-b1cd-54c2f57bbf97' AND locale = 'vi';

-- Campus Mail (Mail Edu US)
UPDATE shop_product_localizations
SET
  title = 'Mail Edu US (Chính Chủ · BH Login)',
  eyebrow = 'Mail Sinh Viên Mỹ',
  seo_title = 'Mua Mail Edu US Chưa Qua Dịch Vụ, BH Login | TUNG Shop',
  seo_description = 'Mua email sinh viên Edu Mỹ chính chủ chưa qua dịch vụ tại TUNG Shop. Nhận ưu đãi GitHub Student Developer Pack, Notion, Canva Pro, JetBrains.'
WHERE product_id = 'catalog-product-campus-mail' AND locale = 'vi';

UPDATE shop_product_localizations
SET
  title = 'US Campus Mail (Edu)',
  eyebrow = 'US Student Email',
  seo_title = 'Buy US College Edu Email Account | TUNG Shop',
  seo_description = 'Get authentic US college .edu student email accounts with GitHub Student Developer Pack benefits at TUNG Shop. Instant automated delivery.'
WHERE product_id = 'catalog-product-campus-mail' AND locale = 'en';

UPDATE shop_product_localizations
SET
  title = '米国大学メール (Edu)',
  eyebrow = '学生メールアカウント',
  seo_title = '米国大学 .edu 学生メールアカウント購入 | TUNG Shop',
  seo_description = 'GitHub Student Developer Packや各種学割が利用可能な米国大学.eduメールアカウント。即時自動納品。'
WHERE product_id = 'catalog-product-campus-mail' AND locale = 'ja';

UPDATE shop_product_localizations
SET
  title = '美国大学教育邮箱 (Edu)',
  eyebrow = '学生邮箱账号',
  seo_title = '购买美国大学 .edu 教育邮箱账号 | TUNG Shop',
  seo_description = '购买未过服务美国大学 .edu 学生邮箱，支持 GitHub 学生包、Notion 等权益，24小时自动发货。'
WHERE product_id = 'catalog-product-campus-mail' AND locale = 'zh';

-- Gemini Veo 3 Ultra
UPDATE shop_product_localizations
SET
  title = 'Gemini Veo 3 Ultra (1 Tháng)',
  eyebrow = 'Google AI Video',
  seo_title = 'Mua Gemini Veo 3 Ultra 1 Tháng Giá Rẻ | TUNG Shop',
  seo_description = 'Tài khoản Google Gemini Veo 3 Ultra cao cấp tạo video AI và mô hình 1.5 Pro không giới hạn. Bảo hành 1-đổi-1 tại TUNG Shop.'
WHERE product_id = 'catalog-product-gemini-pro' AND locale = 'vi';

-- Super Grok
UPDATE shop_product_localizations
SET
  title = 'Super Grok (7 Ngày)',
  eyebrow = 'xAI Grok 2',
  seo_title = 'Mua Super Grok xAI 7 Ngày Giá Tốt | TUNG Shop',
  seo_description = 'Tài khoản Super Grok xAI trải nghiệm mô hình Grok 2, phân tích thời gian thực trên X. Giao tự động trong 3s.'
WHERE product_id = 'catalog-product-super-grok' AND locale = 'vi';

-- Netflix Ultra 4K
UPDATE shop_product_localizations
SET
  title = 'Netflix Ultra 4K (1 Tháng)',
  eyebrow = 'Phim 4K Dùng Riêng',
  seo_title = 'Mua Tài Khoản Netflix Ultra 4K 1 Tháng Riêng | TUNG Shop',
  seo_description = 'Mua tài khoản Netflix Ultra 4K 1 tháng profile riêng không trùng, xem mượt mọi thiết bị. Bảo hành trọn thời hạn.'
WHERE product_id = 'catalog-product-netflix' AND locale = 'vi';

-- CapCut Pro
UPDATE shop_product_localizations
SET
  title = 'CapCut Pro (30 Ngày)',
  eyebrow = 'Chỉnh Sửa Video',
  seo_title = 'Mua CapCut Pro 30 Ngày Giá Rẻ, Full Hiệu Ứng | TUNG Shop',
  seo_description = 'Tài khoản CapCut Pro 30 ngày mở khóa toàn bộ kho hiệu ứng VIP, xóa phông và xuất 4K mượt mà.'
WHERE product_id = 'catalog-product-capcut-pro' AND locale = 'vi';

-- Canva Pro
UPDATE shop_product_localizations
SET
  title = 'Canva Pro (1 Năm)',
  eyebrow = 'Thiết Kế Đồ Họa',
  seo_title = 'Mua Canva Pro 1 Năm Bản Quyền Chính Chủ | TUNG Shop',
  seo_description = 'Nâng cấp Canva Pro 1 năm chính chủ kho mẫu 100M+ ảnh/video, Brand Kit và xóa phông ma thuật.'
WHERE product_id = 'catalog-product-canva' AND locale = 'vi';

-- YouTube Premium
UPDATE shop_product_localizations
SET
  title = 'YouTube Premium (1 Tháng)',
  eyebrow = 'Xem Không Quảng Cáo',
  seo_title = 'Mua YouTube Premium 1 Tháng Giá Rẻ | TUNG Shop',
  seo_description = 'Đăng ký YouTube Premium 1 tháng nghe nhạc tắt màn hình, YouTube Music và không quảng cáo.'
WHERE product_id = 'catalog-product-ytb-premium' AND locale = 'vi';

UPDATE shop_product_localizations
SET
  title = 'YouTube Premium (1 Month)',
  eyebrow = 'Ad-free Video & Music',
  seo_title = 'Buy YouTube Premium 1 Month | TUNG Shop',
  seo_description = 'Get YouTube Premium 1 month for ad-free videos, background play, and YouTube Music. Instant delivery.'
WHERE product_id = 'catalog-product-ytb-premium' AND locale = 'en';

UPDATE shop_product_localizations
SET
  title = 'YouTube Premium (1か月)',
  eyebrow = '広告なし動画＆音楽',
  seo_title = 'YouTube Premium 1か月プラン購入 | TUNG Shop',
  seo_description = '広告なし再生、バックグラウンド再生、YouTube Musicが楽しめるYouTube Premium 1か月プラン。'
WHERE product_id = 'catalog-product-ytb-premium' AND locale = 'ja';

UPDATE shop_product_localizations
SET
  title = 'YouTube Premium (1个月)',
  eyebrow = '无广告视频与音乐',
  seo_title = '购买 YouTube Premium 1个月会员 | TUNG Shop',
  seo_description = '购买 YouTube Premium 1个月会员，享受无广告播放、后台播放和 YouTube Music，自动发货。'
WHERE product_id = 'catalog-product-ytb-premium' AND locale = 'zh';

-- Adobe Creative Cloud
UPDATE shop_product_localizations
SET
  title = 'Adobe Creative Cloud',
  eyebrow = 'Bộ Phần Mềm Đồ Họa',
  seo_title = 'Mua Bản Quyền Adobe Creative Cloud Full App | TUNG Shop',
  seo_description = 'Bản quyền trọn bộ Adobe Creative Cloud: Photoshop, Illustrator, Premiere Pro, After Effects. Hỗ trợ kích hoạt nhanh.'
WHERE product_id = 'catalog-product-adobe' AND locale = 'vi';

-- Microsoft 365
UPDATE shop_product_localizations
SET
  title = 'Microsoft 365 Bản Quyền',
  eyebrow = 'Văn Phòng & 1TB OneDrive',
  seo_title = 'Mua Microsoft 365 Bản Quyền Kèm 1TB OneDrive | TUNG Shop',
  seo_description = 'Bản quyền Microsoft 365 chính hãng cài đặt Word, Excel, PowerPoint trên 5 thiết bị kèm 1TB lưu trữ đám mây OneDrive.'
WHERE product_id = 'catalog-product-microsoft' AND locale = 'vi';

-- HMA VPN
UPDATE shop_product_localizations
SET
  title = 'HMA VPN Bản Quyền',
  eyebrow = 'Fake IP & Bảo Mật',
  seo_title = 'Mua Key HMA VPN Bản Quyền Tốc Độ Cao | TUNG Shop',
  seo_description = 'Key bản quyền HMA VPN truy cập internet tốc độ cao, đổi IP 290+ quốc gia, an toàn bảo mật tuyệt đối.'
WHERE product_id = 'catalog-product-hma-vpn' AND locale = 'vi';
