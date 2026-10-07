-- Google Workspace for Education Fundamentals — 2500 Users (.com domain, cuối năm 2024)
-- Product seed with detailed Vietnamese/English/Japanese/Chinese localizations
-- and 10 test inventory keys.
PRAGMA foreign_keys = ON;

-- ===== Google Workspace for Education Fundamentals =====
INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT
  'catalog-product-google-workspace-edu',
  'google-workspace-edu',
  'active', 'digital_key', 1, 10, 'vi', NULL,
  '{"categorySlug":"productivity","category":"Doanh nghiệp & Giáo dục","badges":["Domain .COM","2500 Users","Cuối năm 2024","Google Education","Giao key tự động","TUNG Shop"],"seedKey":"shop-gws-edu-2026-09-12-v1","source":"manual"}',
  1, '2026-09-12T08:00:00.000Z', 'seed:gws-edu:2026-09-12:v1', 'seed:gws-edu:2026-09-12:v1', '2026-09-12T08:00:00.000Z', '2026-09-12T08:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = 'google-workspace-edu' AND p.deleted_at IS NULL);

-- Vietnamese localization
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-workspace-edu', 'vi',
  'Google Workspace for Education Fundamentals',
  'Google Education · 2500 Users · Domain .COM',
  'Bộ giải pháp Google Workspace for Education Fundamentals bản 2500 user — domain .COM, khởi tạo cuối năm 2024. Nền tảng giáo dục đám mây hàng đầu cho trường học & tổ chức giáo dục.',
  '## 🎓 Google Workspace for Education Fundamentals — 2500 Users

### Tổng quan sản phẩm
Bộ giải pháp **Google Workspace for Education Fundamentals** dành cho tổ chức giáo dục với **2500 tài khoản người dùng**, đi kèm domain **.COM** chuyên nghiệp, được khởi tạo **cuối năm 2024**.

Đây là gói nền tảng (Fundamentals) — bản miễn phí chính thức từ Google dành riêng cho các cơ sở giáo dục đủ điều kiện, cung cấp trọn bộ công cụ cộng tác và quản lý lớp học trên nền tảng đám mây.

---

### 🔑 Thông tin sản phẩm

| Thông tin | Chi tiết |
|-----------|----------|
| **Gói** | Education Fundamentals |
| **Số lượng user** | 2500 tài khoản |
| **Loại domain** | .COM (tên miền quốc tế) |
| **Thời gian tạo** | Cuối năm 2024 |
| **Admin Console** | Có đầy đủ quyền quản trị |

---

### 📦 Ứng dụng & Tính năng bao gồm

✅ **Gmail** — Email chuyên nghiệp theo tên miền riêng (ví dụ: name@yourdomain.com)
✅ **Google Drive** — 100TB dung lượng lưu trữ đám mây dùng chung (pooled storage)
✅ **Google Docs, Sheets, Slides** — Bộ soạn thảo văn bản, bảng tính, trình chiếu trực tuyến
✅ **Google Classroom** — Quản lý lớp học, giao bài, chấm điểm trực tuyến
✅ **Google Meet** — Họp video lên đến 100 người tham gia
✅ **Google Calendar** — Lịch biểu dùng chung cho toàn trường
✅ **Google Forms** — Tạo khảo sát, bài kiểm tra trực tuyến
✅ **Google Sites** — Xây dựng website nội bộ cho trường học
✅ **Google Chat** — Nhắn tin, trao đổi nhanh trong tổ chức
✅ **Google Jamboard** — Bảng trắng kỹ thuật số tương tác
✅ **Google Admin Console** — Bảng điều khiển quản trị toàn diện

---

### 🎯 Đối tượng phù hợp

- 🏫 Trường học K-12 (tiểu học, THCS, THPT)
- 🎓 Trường đại học, cao đẳng
- 📚 Trung tâm đào tạo, giáo dục
- 🏢 Tổ chức giáo dục phi lợi nhuận
- 👨‍💻 Doanh nghiệp EdTech cần nền tảng giáo dục

---

### ⭐ Ưu điểm nổi bật

🔹 **Domain .COM** — Tên miền quốc tế uy tín, chuyên nghiệp, dễ nhớ
🔹 **2500 tài khoản** — Quy mô lớn phù hợp cho trường học cỡ vừa đến lớn
🔹 **Đã khởi tạo cuối 2024** — Tài khoản đã ổn định, sẵn sàng sử dụng ngay
🔹 **100TB lưu trữ chung** — Dung lượng lớn cho toàn bộ tổ chức
🔹 **Admin toàn quyền** — Quản lý user, bảo mật, chính sách tổ chức
🔹 **Miễn phí trọn đời** — Gói Fundamentals không phát sinh phí hàng tháng/năm
🔹 **Nâng cấp được** — Có thể nâng cấp lên Education Standard, Teaching & Learning Upgrade, hoặc Education Plus

---

### 📋 Hướng dẫn sử dụng

1️⃣ Nhận thông tin đăng nhập Admin Console sau khi thanh toán được xác nhận
2️⃣ Truy cập **admin.google.com** bằng tài khoản Super Admin được cung cấp
3️⃣ Thiết lập cấu trúc tổ chức (OU - Organizational Units) theo nhu cầu
4️⃣ Tạo tài khoản người dùng (giáo viên, học sinh, nhân viên)
5️⃣ Cấu hình Gmail, Drive, Classroom theo chính sách tổ chức
6️⃣ **Đổi mật khẩu Super Admin** và bật xác thực 2 bước (2FA) ngay lập tức
7️⃣ Bắt đầu sử dụng các ứng dụng Google Workspace trên web, mobile & desktop

---

### 🛡️ Chính sách bảo hành & hỗ trợ

- ✅ Bảo hành **30 ngày** kể từ ngày bàn giao
- ✅ Hỗ trợ kỹ thuật setup ban đầu miễn phí
- ✅ Hướng dẫn cấu hình DNS nếu cần chuyển domain
- ⚠️ Lưu ý: quyền lợi có thể thay đổi theo chính sách Google; kiểm tra biến thể, tồn kho và mô tả trước khi mua

---

### 💡 Tại sao chọn TUNG Shop?

🔸 Giao dịch an toàn, bảo mật
🔸 Bàn giao tự động sau thanh toán
🔸 Hỗ trợ kỹ thuật 24/7
🔸 Giá cạnh tranh nhất thị trường
🔸 Đã phục vụ hàng trăm tổ chức giáo dục',
  'Google Workspace for Education Fundamentals 2500 Users | TUNG Shop',
  'Mua Google Workspace for Education Fundamentals 2500 Users, domain .COM, khởi tạo cuối 2024. Trọn bộ Gmail, Drive, Classroom, Meet cho trường học. Giá tốt nhất tại TUNG Shop.'
);

-- English localization
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-workspace-edu', 'en',
  'Google Workspace for Education Fundamentals',
  'Google Education · 2500 Users · .COM Domain',
  'Google Workspace for Education Fundamentals — 2500 users with .COM domain, created late 2024. The leading cloud-based education platform for schools & organizations.',
  '## 🎓 Google Workspace for Education Fundamentals — 2500 Users

### Product Overview
**Google Workspace for Education Fundamentals** for educational organizations with **2500 user accounts**, paired with a professional **.COM domain**, created in **late 2024**.

This is the Fundamentals tier — the official free edition from Google designed for eligible educational institutions, providing a full suite of collaboration and classroom management tools on the cloud.

---

### 🔑 Product Details

| Detail | Info |
|--------|------|
| **Plan** | Education Fundamentals |
| **Users** | 2500 accounts |
| **Domain** | .COM (international) |
| **Created** | Late 2024 |
| **Admin Console** | Full admin access |

---

### 📦 Apps & Features Included

✅ **Gmail** — Professional email with your custom domain
✅ **Google Drive** — 100TB pooled cloud storage
✅ **Google Docs, Sheets, Slides** — Online document suite
✅ **Google Classroom** — Class management, assignments, grading
✅ **Google Meet** — Video meetings up to 100 participants
✅ **Google Calendar** — Shared organizational calendars
✅ **Google Forms** — Surveys, quizzes, and online tests
✅ **Google Sites** — Build internal school websites
✅ **Google Chat** — Instant messaging for your organization
✅ **Google Jamboard** — Interactive digital whiteboard
✅ **Google Admin Console** — Comprehensive admin dashboard

---

### How to Use

1. Receive Admin Console credentials after payment confirmation
2. Access **admin.google.com** with the provided Super Admin account
3. Set up Organizational Units (OU) as needed
4. Create user accounts (teachers, students, staff)
5. Configure Gmail, Drive, Classroom per your policies
6. **Change Super Admin password** and enable 2FA immediately
7. Start using Google Workspace apps on web, mobile & desktop

Note: Features may change per Google''s policies; check variant, stock and description before purchasing.',
  'Google Workspace for Education Fundamentals 2500 Users | TUNG Shop',
  'Buy Google Workspace for Education Fundamentals with 2500 users, .COM domain, created late 2024. Complete Gmail, Drive, Classroom, Meet suite for schools. Best price at TUNG Shop.'
);

-- Japanese localization
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-workspace-edu', 'ja',
  'Google Workspace for Education Fundamentals',
  'Google Education · 2500ユーザー · .COMドメイン',
  'Google Workspace for Education Fundamentals — 2500ユーザー、.COMドメイン付き、2024年末作成。学校・教育機関向けクラウド教育プラットフォーム。',
  '## 🎓 Google Workspace for Education Fundamentals — 2500ユーザー

教育機関向け **Google Workspace for Education Fundamentals**。**2500ユーザーアカウント**と**.COMドメイン**付き、**2024年末**に作成されたアカウントです。

Gmail、Google Drive、Google Classroom、Google Meetなど、すべてのコラボレーションツールが含まれています。

### 使い方
1. お支払い確認後、管理コンソールの資格情報を受け取ります
2. 提供されたスーパー管理者アカウントで **admin.google.com** にアクセス
3. 組織部門（OU）を設定
4. ユーザーアカウントを作成
5. スーパー管理者のパスワードを変更し、2FAを有効にしてください

注意: 特典はGoogleのポリシーにより変更される場合があります。',
  'Google Workspace for Education Fundamentals 2500ユーザー | TUNG Shop',
  'Google Workspace for Education Fundamentals 2500ユーザー、.COMドメイン、2024年末作成。Gmail、Drive、Classroom、Meet完備。TUNG Shopで最安値。'
);

-- Chinese localization
INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
VALUES (
  'catalog-product-google-workspace-edu', 'zh',
  'Google Workspace for Education Fundamentals',
  'Google Education · 2500用户 · .COM域名',
  'Google Workspace for Education Fundamentals — 2500用户，.COM域名，2024年底创建。领先的云端教育平台，适用于学校和教育机构。',
  '## 🎓 Google Workspace for Education Fundamentals — 2500用户

面向教育机构的 **Google Workspace for Education Fundamentals**，包含 **2500个用户账户**和 **.COM域名**，创建于 **2024年底**。

包含Gmail、Google Drive、Google Classroom、Google Meet等全套协作工具。

### 使用说明
1. 付款确认后，收到管理控制台凭据
2. 使用提供的超级管理员账户访问 **admin.google.com**
3. 设置组织部门（OU）
4. 创建用户账户
5. 立即更改超级管理员密码并启用两步验证

注意：权益可能根据Google政策变化。',
  'Google Workspace for Education Fundamentals 2500用户 | TUNG Shop',
  'Google Workspace for Education Fundamentals 2500用户，.COM域名，2024年底创建。Gmail、Drive、Classroom、Meet一应俱全。TUNG Shop最优价格。'
);

-- Variant: Google Workspace for Education Fundamentals 2500 Users
INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT
  'catalog-variant-gws-edu-2500u', 'catalog-product-google-workspace-edu', 'GWS-EDU-FUND-2500U',
  'active', 'license_key', 'automatic', 'tracked',
  9500000, NULL, 'VND', 2, 1,
  '{"plan":"fundamentals","users":"2500","domain":".com","created":"2024-Q4"}',
  '{"seedKey":"shop-gws-edu-2026-09-12-v1","plan":"fundamentals","users":2500,"domainType":".com","domainCreated":"2024-Q4","warrantyDays":30}',
  1, '2026-09-12T08:00:00.000Z', '2026-09-12T08:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM shop_products WHERE id = 'catalog-product-google-workspace-edu' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM shop_variants WHERE sku = 'GWS-EDU-FUND-2500U' COLLATE NOCASE AND deleted_at IS NULL);

-- Variant localizations
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gws-edu-2500u', 'vi', 'Fundamentals · 2500 Users · Domain .COM', '2500 Users · Domain .COM · Tạo cuối 2024 · BH: 30 ngày');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gws-edu-2500u', 'en', 'Fundamentals · 2500 Users · .COM Domain', '2500 Users · .COM Domain · Created Q4 2024 · Warranty: 30 days');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gws-edu-2500u', 'ja', 'Fundamentals · 2500ユーザー · .COMドメイン', '2500ユーザー · .COMドメイン · 2024年Q4作成 · 保証: 30日');
INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
VALUES ('catalog-variant-gws-edu-2500u', 'zh', 'Fundamentals · 2500用户 · .COM域名', '2500用户 · .COM域名 · 2024年Q4创建 · 保修: 30天');

-- Product media (using uploaded image)
INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
VALUES (
  'catalog-media-google-workspace-edu',
  'catalog-product-google-workspace-edu',
  NULL, NULL, 'image',
  '/images/shop/google-workspace-edu.jpg',
  'Google Workspace for Education Fundamentals 2500 Users — TUNG Shop',
  0, '2026-09-12T08:00:00.000Z'
);

-- Audit log
INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-gws-edu-2026-09-12-v1',
  'seed:gws-edu:2026-09-12:v1',
  'shop.catalog.seeded',
  'shop_catalog',
  'shop-gws-edu-2026-09-12-v1',
  NULL,
  '{"products":1,"variants":1,"source":"manual","productSlug":"google-workspace-edu","sku":"GWS-EDU-FUND-2500U","price":9500000,"currency":"VND","users":2500,"domainType":".com"}',
  '2026-09-12T08:00:00.000Z'
);
