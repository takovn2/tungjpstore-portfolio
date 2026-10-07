-- Publish the initial DigiStore catalog. Every item is a tracked one-month
-- digital-key product; no inventory keys are created by this migration.
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS seed_shop_variant_copy;
DROP TABLE IF EXISTS seed_shop_product_copy;
DROP TABLE IF EXISTS seed_shop_target_products;
DROP TABLE IF EXISTS seed_shop_adopted_variants;
DROP TABLE IF EXISTS seed_shop_adopted_products;
DROP TABLE IF EXISTS seed_shop_products;
DROP TABLE IF EXISTS seed_shop_categories;

CREATE TABLE seed_shop_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  title_vi TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ja TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  description_vi TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_ja TEXT NOT NULL,
  description_zh TEXT NOT NULL
);

INSERT INTO seed_shop_categories VALUES
  ('catalog-category-ai-tools', 'ai-tools', 10,
   'Công cụ AI', 'AI Tools', 'AIツール', 'AI 工具',
   'Trợ lý, nghiên cứu, giọng nói và sáng tạo nội dung bằng AI.',
   'AI assistants, research, voice, and content creation tools.',
   'AIアシスタント、リサーチ、音声、コンテンツ制作ツール。',
   'AI 助手、研究、语音与内容创作工具。'),
  ('catalog-category-creative-tools', 'creative-tools', 20,
   'Thiết kế & sáng tạo', 'Design & Creative', 'デザイン・クリエイティブ', '设计与创意',
   'Công cụ thiết kế, chỉnh sửa video, âm thanh và nội dung sáng tạo.',
   'Tools for design, video editing, audio, and creative production.',
   'デザイン、動画編集、音声、クリエイティブ制作向けツール。',
   '用于设计、视频编辑、音频与创意制作的工具。'),
  ('catalog-category-entertainment', 'entertainment', 30,
   'Giải trí', 'Entertainment', 'エンターテインメント', '娱乐',
   'Các gói xem nội dung, nghe nhạc và trải nghiệm trò chơi.',
   'Packages for streaming, music, and gaming experiences.',
   '動画、音楽、ゲーム体験向けのパッケージ。',
   '视频、音乐与游戏体验套餐。'),
  ('catalog-category-productivity', 'productivity', 40,
   'Năng suất', 'Productivity', '生産性', '效率工具',
   'Công cụ hỗ trợ lập trình, làm việc và nâng cao năng suất.',
   'Tools for coding, work, and productivity.',
   'コーディング、業務、生産性向上を支援するツール。',
   '支持编程、办公与效率提升的工具。');

CREATE TABLE seed_shop_products (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  reference_usd TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  category_vi TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  feature_vi TEXT NOT NULL,
  feature_en TEXT NOT NULL,
  feature_ja TEXT NOT NULL,
  feature_zh TEXT NOT NULL
);

INSERT INTO seed_shop_products VALUES
  ('catalog-product-chatgpt-plus', 'catalog-variant-chatgpt-plus', 'chatgpt-plus', 'CHATGPT-PLUS-1M', 'ChatGPT Plus', 40000, '1.5', 'ai-tools', 'Công cụ AI', 10,
   'Trò chuyện, phân tích, tóm tắt, lập kế hoạch và sáng tạo nội dung với các công cụ AI nâng cao. Model, công cụ và hạn mức cụ thể áp dụng theo chính sách hiện hành của nhà cung cấp.',
   'Advanced AI chat, analysis, summarization, planning, and content creation. Exact models, tools, and limits follow the provider''s current policy.',
   '高度なAIチャット、分析、要約、計画、コンテンツ制作を利用できます。対象モデル、機能、上限は提供元の最新ポリシーに準じます。',
   '支持高级 AI 对话、分析、总结、规划与内容创作。具体模型、工具和额度以服务提供方当前政策为准。'),
  ('catalog-product-gemini-pro', 'catalog-variant-gemini-pro', 'gemini-pro', 'GEMINI-PRO-1M', 'Gemini Pro', 80000, '3', 'ai-tools', 'Công cụ AI', 20,
   'Hỗ trợ nghiên cứu, tổng hợp thông tin, soạn thảo và xử lý nội dung đa phương thức bằng AI. Model và hạn mức phụ thuộc chính sách của nhà cung cấp.',
   'AI-assisted research, information synthesis, writing, and multimodal workflows. Models and usage limits depend on the provider''s policy.',
   'AIによるリサーチ、情報整理、文章作成、マルチモーダル作業を支援します。モデルと利用上限は提供元のポリシーに準じます。',
   '支持 AI 研究、信息整理、写作与多模态工作流程。模型和使用额度以服务提供方政策为准。'),
  ('catalog-product-canva', 'catalog-variant-canva', 'canva', 'CANVA-1M', 'Canva', 30000, '1.4', 'creative-tools', 'Thiết kế & sáng tạo', 30,
   'Thiết kế nhanh với mẫu, tài nguyên sáng tạo và các công cụ chỉnh sửa nâng cao như xóa nền, thay đổi kích thước và xuất nội dung, tùy quyền lợi của gói.',
   'Create faster with templates, creative assets, and advanced editing tools such as background removal, resizing, and export options, subject to plan entitlements.',
   'テンプレート、クリエイティブ素材、背景削除、サイズ変更、書き出しなどの高度な編集機能をプラン範囲内で利用できます。',
   '可按套餐权益使用模板、创意素材、移除背景、调整尺寸与导出等高级设计工具。'),
  ('catalog-product-capcut-pro', 'catalog-variant-capcut-pro', 'capcut-pro', 'CAPCUT-PRO-1M', 'Capcut Pro', 10000, '0.39', 'creative-tools', 'Thiết kế & sáng tạo', 40,
   'Chỉnh sửa video với hiệu ứng, bộ lọc, mẫu và công cụ hậu kỳ nâng cao. Tài nguyên và tính năng khả dụng có thể thay đổi theo thiết bị hoặc khu vực.',
   'Edit video with premium effects, filters, templates, and advanced post-production tools. Available assets and features may vary by device or region.',
   '高度なエフェクト、フィルター、テンプレート、動画編集機能を利用できます。素材や機能は端末・地域により異なる場合があります。',
   '可使用高级特效、滤镜、模板与视频后期工具；可用资源和功能可能因设备或地区而异。'),
  ('catalog-product-super-grok', 'catalog-variant-super-grok', 'super-grok', 'SUPER-GROK-1M', 'Super Grok', 19000, '0.73', 'ai-tools', 'Công cụ AI', 50,
   'Hỗ trợ tìm kiếm, lập luận, phân tích và tạo nội dung bằng AI với quyền lợi nâng cao của gói. Model và hạn mức áp dụng theo nhà cung cấp.',
   'AI search, reasoning, analysis, and content creation with the package''s enhanced access. Models and limits follow the provider''s policy.',
   'AI検索、推論、分析、コンテンツ制作を拡張アクセスで利用できます。モデルと上限は提供元のポリシーに準じます。',
   '提供增强的 AI 搜索、推理、分析与内容创作能力；模型和额度以服务提供方政策为准。'),
  ('catalog-product-netflix', 'catalog-variant-netflix', 'netflix', 'NETFLIX-1M', 'Netflix', 40000, '1.x', 'entertainment', 'Giải trí', 60,
   'Truy cập nội dung phim và chương trình trong 1 tháng theo phạm vi gói được bàn giao. Chất lượng phát, số thiết bị và khu vực áp dụng tùy cấp gói.',
   'One month of access to films and shows within the delivered plan. Streaming quality, device count, and regional availability depend on the plan tier.',
   '提供されるプラン範囲内で映画や番組を1か月視聴できます。画質、対応端末数、地域条件はプランにより異なります。',
   '可在所交付套餐范围内观看电影与节目一个月；清晰度、设备数量和地区可用性取决于套餐等级。'),
  ('catalog-product-cursor-pro', 'catalog-variant-cursor-pro', 'cursor-pro', 'CURSOR-PRO-1M', 'Cursor Pro', 269000, '10.25', 'productivity', 'Năng suất', 70,
   'Lập trình với AI qua gợi ý mã, chat, agent và chỉnh sửa nhiều tệp. Model, tốc độ và quota sử dụng áp dụng theo chính sách của Cursor.',
   'AI-assisted coding with completions, chat, agents, and multi-file editing. Models, speed, and usage quotas follow Cursor''s current policy.',
   'コード補完、チャット、エージェント、複数ファイル編集でAIコーディングを支援します。モデル、速度、利用枠はCursorの最新ポリシーに準じます。',
   '通过代码补全、聊天、智能代理与多文件编辑辅助编程；模型、速度和额度以 Cursor 当前政策为准。'),
  ('catalog-product-microsoft', 'catalog-variant-microsoft', 'microsoft', 'MICROSOFT-1M', 'Microsoft', 80000, '3', 'productivity', 'Năng suất', 80,
   'Truy cập các công cụ làm việc và năng suất Microsoft trong phạm vi gói được bàn giao. Ứng dụng, dung lượng và số thiết bị phụ thuộc cấp gói cụ thể.',
   'Access Microsoft productivity tools included in the delivered package. Apps, storage, and supported device count depend on the exact plan tier.',
   '提供されるパッケージ範囲内でMicrosoftの業務・生産性ツールを利用できます。アプリ、容量、端末数はプランにより異なります。',
   '可使用所交付套餐包含的 Microsoft 办公与效率工具；应用、存储空间和设备数量取决于具体套餐。'),
  ('catalog-product-elevenlab', 'catalog-variant-elevenlab', 'elevenlab', 'ELEVENLAB-1M', 'Elevenlab', 180000, '7', 'creative-tools', 'Thiết kế & sáng tạo', 90,
   'Tạo giọng nói và nội dung âm thanh bằng AI cho thuyết minh, thử nghiệm giọng và quy trình sáng tạo. Credits, ngôn ngữ và quyền sử dụng phụ thuộc gói.',
   'Create AI voice and audio for narration, voice experiments, and creative workflows. Credits, languages, and usage rights depend on the plan.',
   'ナレーション、音声テスト、制作フロー向けにAI音声を生成できます。クレジット、言語、利用権はプランにより異なります。',
   '可生成用于旁白、声音实验与创作流程的 AI 语音和音频；点数、语言与使用权限取决于套餐。'),
  ('catalog-product-ytb-premium', 'catalog-variant-ytb-premium', 'ytb-premium', 'YTB-PREMIUM-1M', 'YTB Premium', 25000, '1', 'entertainment', 'Giải trí', 100,
   'Trải nghiệm xem và nghe nâng cao như phát không quảng cáo, phát nền và tải xuống tại nơi được hỗ trợ. Quyền lợi cụ thể phụ thuộc tài khoản và khu vực.',
   'Enhanced viewing and listening, including ad-free playback, background play, and downloads where supported. Exact benefits depend on account and region.',
   '広告なし再生、バックグラウンド再生、対応地域でのダウンロードなどを利用できます。特典はアカウントと地域により異なります。',
   '支持无广告播放、后台播放及在支持地区下载等增强体验；具体权益取决于账号和地区。'),
  ('catalog-product-veo3-anti', 'catalog-variant-veo3-anti', 'veo3-anti', 'VEO3-ANTI-1M', 'VEO3 (Anti)', 380000, '15', 'ai-tools', 'Công cụ AI', 110,
   'Hỗ trợ quy trình tạo video bằng AI theo cấu hình VEO3 Anti được bàn giao. Model, thời lượng, chất lượng và quota tạo video phụ thuộc cấp gói thực tế.',
   'Supports AI video generation within the delivered VEO3 Anti configuration. Model access, duration, quality, and generation quota depend on the actual plan.',
   '提供されるVEO3 Anti構成の範囲でAI動画生成を利用できます。モデル、動画時間、品質、生成枠は実際のプランにより異なります。',
   '可在所交付的 VEO3 Anti 配置范围内进行 AI 视频生成；模型、时长、质量和生成额度取决于实际套餐。'),
  ('catalog-product-xbox', 'catalog-variant-xbox', 'xbox', 'XBOX-1M', 'XBOX', 39000, '1.3', 'entertainment', 'Giải trí', 120,
   'Truy cập trải nghiệm trò chơi và quyền lợi trực tuyến trong phạm vi cấp gói được cung cấp. Thư viện game, nền tảng và khu vực hỗ trợ phụ thuộc gói.',
   'Access gaming and online benefits included in the delivered tier. Game library, supported platforms, and regional availability depend on the plan.',
   '提供されるプラン範囲内でゲームやオンライン特典を利用できます。ゲーム一覧、対応機種、地域条件はプランにより異なります。',
   '可使用所交付等级包含的游戏与在线权益；游戏库、支持平台和地区可用性取决于套餐。'),
  ('catalog-product-adobe', 'catalog-variant-adobe', 'adobe', 'ADOBE-1M', 'ADOBE', 49000, '1.87', 'creative-tools', 'Thiết kế & sáng tạo', 130,
   'Hỗ trợ công việc thiết kế, hình ảnh, video hoặc tài liệu với các ứng dụng Adobe thuộc phạm vi gói bàn giao. Ứng dụng và dung lượng phụ thuộc cấp gói.',
   'Supports design, imaging, video, or document workflows with Adobe apps included in the delivered package. Apps and storage depend on the plan tier.',
   '提供されるパッケージに含まれるAdobeアプリでデザイン、画像、動画、文書制作を支援します。アプリと容量はプランにより異なります。',
   '可通过套餐包含的 Adobe 应用支持设计、图像、视频或文档工作；应用范围和存储空间取决于套餐等级。');

-- Only adopt the exact draft created in production. Any concurrent edit or
-- business reference makes the catalog guard fail instead of overwriting it.
CREATE TABLE seed_shop_adopted_products AS
SELECT p.id, p.slug
FROM shop_products p
WHERE p.id = 'a7747d12-66c2-4a18-b1cd-54c2f57bbf97'
  AND p.slug = 'chatgpt-plus'
  AND p.status = 'draft'
  AND p.product_type = 'digital_key'
  AND p.featured = 0
  AND p.sort_order = 0
  AND p.default_locale = 'vi'
  AND p.cover_media_id IS NULL
  AND p.metadata_json = '{}'
  AND p.version = 1
  AND p.published_at IS NULL
  AND p.deleted_at IS NULL
  AND (SELECT COUNT(*) FROM shop_product_localizations l WHERE l.product_id = p.id) = 1
  AND EXISTS (
    SELECT 1 FROM shop_product_localizations l
    WHERE l.product_id = p.id AND l.locale = 'vi'
      AND l.title = 'chatgpt Plut' AND l.short_description = 'chatgpt Plut'
      AND l.description = 'chatgpt Plut' AND l.seo_title = 'chatgpt Plut'
      AND l.seo_description = 'chatgpt Plut'
  )
  AND NOT EXISTS (SELECT 1 FROM shop_product_media pm WHERE pm.product_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM shop_order_items oi WHERE oi.product_id = p.id);

CREATE TABLE seed_shop_adopted_variants AS
SELECT v.id, p.slug
FROM shop_variants v
JOIN seed_shop_adopted_products a ON a.id = v.product_id
JOIN shop_products p ON p.id = v.product_id
WHERE v.id = '0fae287b-a044-490d-9ed4-1bd35bce2e8c'
  AND v.sku = 'TUNG-KEY-001'
  AND v.status = 'draft'
  AND v.fulfillment_type = 'license_key'
  AND v.delivery_mode = 'automatic'
  AND v.inventory_policy = 'tracked'
  AND v.price_minor = 35000
  AND v.compare_at_minor IS NULL
  AND v.currency = 'VND'
  AND v.low_stock_threshold = 3000
  AND v.max_per_order = 1000
  AND v.option_values_json = '{}'
  AND v.metadata_json = '{}'
  AND v.version = 1
  AND v.deleted_at IS NULL
  AND (SELECT COUNT(*) FROM shop_variant_localizations l WHERE l.variant_id = v.id) = 1
  AND EXISTS (
    SELECT 1 FROM shop_variant_localizations l
    WHERE l.variant_id = v.id AND l.locale = 'vi'
      AND l.title = 'chatgpt Plut' AND l.option_summary = ''
  )
  AND NOT EXISTS (SELECT 1 FROM shop_inventory_units iu WHERE iu.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM shop_inventory_reservations r WHERE r.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM shop_inventory_import_batches b WHERE b.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM shop_order_items oi WHERE oi.variant_id = v.id);

CREATE TABLE seed_shop_target_products AS
SELECT s.*,
  COALESCE((SELECT p.id FROM shop_products p WHERE p.slug = s.slug AND p.deleted_at IS NULL), s.id) AS target_product_id
FROM seed_shop_products s;

DELETE FROM transaction_guards WHERE token = 'seed-shop-catalog-2026-07-25-v1';

INSERT INTO transaction_guards (token, valid)
SELECT 'seed-shop-catalog-2026-07-25-v1', CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM shop_categories c
    JOIN seed_shop_categories s ON s.slug = c.slug
    WHERE c.deleted_at IS NULL AND NOT (
      c.id = s.id AND c.status = 'active' AND c.sort_order = s.sort_order
      AND c.default_locale = 'vi'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_categories c
    JOIN seed_shop_categories s ON s.id = c.id
    WHERE c.deleted_at IS NULL AND c.slug <> s.slug
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_products p
    JOIN seed_shop_products s ON s.slug = p.slug
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM seed_shop_adopted_products a WHERE a.id = p.id)
      AND NOT (
        json_extract(p.metadata_json, '$.seedKey') = 'shop-catalog-2026-07-25-v1'
        AND p.status = 'active' AND p.product_type = 'digital_key'
        AND p.featured = 0 AND p.sort_order = s.sort_order AND p.default_locale = 'vi'
        AND json_extract(p.metadata_json, '$.categorySlug') = s.category_slug
        AND json_extract(p.metadata_json, '$.termMonths') = 1
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_products p
    JOIN seed_shop_products s ON s.id = p.id
    WHERE p.deleted_at IS NULL AND p.slug <> s.slug
  )
  AND NOT EXISTS (
    SELECT 1 FROM seed_shop_target_products t
    WHERE (SELECT COUNT(*) FROM shop_variants v
      WHERE v.product_id = t.target_product_id AND v.deleted_at IS NULL) > 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_variants v
    JOIN seed_shop_target_products t ON t.target_product_id = v.product_id
    WHERE v.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM seed_shop_adopted_variants a WHERE a.id = v.id)
      AND NOT (
        json_extract(v.metadata_json, '$.seedKey') = 'shop-catalog-2026-07-25-v1'
        AND v.sku = t.sku AND v.status = 'active'
        AND v.fulfillment_type = 'license_key' AND v.delivery_mode = 'automatic'
        AND v.inventory_policy = 'tracked' AND v.price_minor = t.price_minor
        AND v.compare_at_minor IS NULL AND v.currency = 'VND'
        AND v.low_stock_threshold = 3 AND v.max_per_order = 1
        AND json_extract(v.option_values_json, '$.duration') = '1-month'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_variants v
    JOIN seed_shop_target_products t ON t.sku = v.sku COLLATE NOCASE
    WHERE v.deleted_at IS NULL AND v.product_id <> t.target_product_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM shop_variants v
    JOIN seed_shop_products s ON s.variant_id = v.id
    WHERE v.deleted_at IS NULL
      AND v.product_id <> (SELECT target_product_id FROM seed_shop_target_products t WHERE t.slug = s.slug)
  )
  AND NOT EXISTS (
    SELECT 1 FROM seed_shop_adopted_products p
    WHERE NOT EXISTS (SELECT 1 FROM seed_shop_adopted_variants v WHERE v.slug = p.slug)
  )
THEN 1 ELSE 0 END;

INSERT INTO shop_categories
  (id, slug, status, sort_order, default_locale, version, created_by, updated_by, created_at, updated_at)
SELECT id, slug, 'active', sort_order, 'vi', 1,
  'seed:shop-catalog:2026-07-25:v1', 'seed:shop-catalog:2026-07-25:v1',
  '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
FROM seed_shop_categories s
WHERE NOT EXISTS (SELECT 1 FROM shop_categories c WHERE c.slug = s.slug AND c.deleted_at IS NULL);

INSERT OR IGNORE INTO shop_category_localizations (category_id, locale, title, description)
SELECT id, 'vi', title_vi, description_vi FROM seed_shop_categories
UNION ALL SELECT id, 'en', title_en, description_en FROM seed_shop_categories
UNION ALL SELECT id, 'ja', title_ja, description_ja FROM seed_shop_categories
UNION ALL SELECT id, 'zh', title_zh, description_zh FROM seed_shop_categories;

INSERT INTO shop_products
  (id, slug, status, product_type, featured, sort_order, default_locale, cover_media_id,
   metadata_json, version, published_at, created_by, updated_by, created_at, updated_at)
SELECT s.id, s.slug, 'active', 'digital_key', 0, s.sort_order, 'vi', NULL,
  json_object(
    'categorySlug', s.category_slug,
    'category', s.category_vi,
    'termMonths', 1,
    'referenceUsdLabel', s.reference_usd,
    'badges', json_array('1 tháng', 'Giao key tự động'),
    'seedKey', 'shop-catalog-2026-07-25-v1'
  ),
  1, '2026-07-25T00:00:00.000Z',
  'seed:shop-catalog:2026-07-25:v1', 'seed:shop-catalog:2026-07-25:v1',
  '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
FROM seed_shop_products s
WHERE NOT EXISTS (SELECT 1 FROM shop_products p WHERE p.slug = s.slug AND p.deleted_at IS NULL);

UPDATE shop_products
SET status = 'active', product_type = 'digital_key', featured = 0,
    sort_order = (SELECT s.sort_order FROM seed_shop_products s WHERE s.slug = shop_products.slug),
    default_locale = 'vi', cover_media_id = NULL,
    metadata_json = (
      SELECT json_object(
        'categorySlug', s.category_slug,
        'category', s.category_vi,
        'termMonths', 1,
        'referenceUsdLabel', s.reference_usd,
        'badges', json_array('1 tháng', 'Giao key tự động'),
        'seedKey', 'shop-catalog-2026-07-25-v1'
      )
      FROM seed_shop_products s WHERE s.slug = shop_products.slug
    ),
    version = version + 1,
    published_at = '2026-07-25T00:00:00.000Z',
    updated_by = 'seed:shop-catalog:2026-07-25:v1',
    updated_at = '2026-07-25T00:00:00.000Z'
WHERE id IN (SELECT id FROM seed_shop_adopted_products);

CREATE TABLE seed_shop_product_copy AS
SELECT target_product_id AS product_id, 'vi' AS locale, title,
  'Gói 1 tháng' AS eyebrow,
  'Gói ' || title || ' thời hạn 1 tháng, giao dưới dạng sản phẩm số.' AS short_description,
  'Thời hạn: 1 tháng. Thông tin nhận hàng và hướng dẫn kích hoạt được cung cấp sau khi thanh toán được xác nhận.'
    || char(10) || char(10) || 'Tính năng nổi bật: ' || feature_vi
    || char(10) || char(10) || 'Lưu ý: quyền lợi có thể thay đổi theo chính sách nhà cung cấp; vui lòng kiểm tra mô tả gói và tình trạng kho trước khi mua.' AS description,
  title || ' 1 tháng | DigiStore' AS seo_title,
  'Mua gói ' || title || ' 1 tháng tại DigiStore. Xem giá, tính năng, tình trạng hàng và hướng dẫn nhận sản phẩm số.' AS seo_description
FROM seed_shop_target_products
UNION ALL
SELECT target_product_id, 'en', title, '1-month package',
  'A one-month ' || title || ' digital package.',
  'Duration: one month. Delivery details and activation guidance are provided after payment is confirmed.'
    || char(10) || char(10) || 'Key features: ' || feature_en
    || char(10) || char(10) || 'Note: entitlements may change under the provider''s policy; review the package description and stock status before purchase.',
  title || ' 1-Month Package | DigiStore',
  'Buy a one-month ' || title || ' package from DigiStore. Check pricing, features, availability, and digital delivery guidance.'
FROM seed_shop_target_products
UNION ALL
SELECT target_product_id, 'ja', title, '1か月パッケージ',
  title || 'を1か月利用するデジタル商品です。',
  '期間：1か月。支払い確認後に受取情報と有効化手順をご案内します。'
    || char(10) || char(10) || '主な機能：' || feature_ja
    || char(10) || char(10) || '注意：特典は提供元のポリシーにより変更される場合があります。購入前に商品説明と在庫状況をご確認ください。',
  title || ' 1か月パッケージ | DigiStore',
  'DigiStoreで' || title || 'の1か月パッケージを購入。価格、機能、在庫状況、デジタル商品の受取方法を確認できます。'
FROM seed_shop_target_products
UNION ALL
SELECT target_product_id, 'zh', title, '一个月套餐',
  title || ' 一个月数字套餐。',
  '期限：一个月。付款确认后提供领取信息与激活说明。'
    || char(10) || char(10) || '主要功能：' || feature_zh
    || char(10) || char(10) || '注意：权益可能随服务提供方政策变化；购买前请确认商品说明与库存状态。',
  title || ' 一个月套餐 | DigiStore',
  '在 DigiStore 购买 ' || title || ' 一个月套餐，查看价格、功能、库存状态和数字商品领取说明。'
FROM seed_shop_target_products;

DELETE FROM shop_product_localizations
WHERE product_id IN (SELECT id FROM seed_shop_adopted_products);

INSERT OR IGNORE INTO shop_product_localizations
  (product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description)
SELECT product_id, locale, title, eyebrow, short_description, description, seo_title, seo_description
FROM seed_shop_product_copy;

INSERT INTO shop_variants
  (id, product_id, sku, status, fulfillment_type, delivery_mode, inventory_policy,
   price_minor, compare_at_minor, currency, low_stock_threshold, max_per_order,
   option_values_json, metadata_json, version, created_at, updated_at)
SELECT t.variant_id, t.target_product_id, t.sku, 'active', 'license_key', 'automatic', 'tracked',
  t.price_minor, NULL, 'VND', 3, 1,
  json_object('duration', '1-month'),
  json_object('termMonths', 1, 'referenceUsdLabel', t.reference_usd, 'seedKey', 'shop-catalog-2026-07-25-v1'),
  1, '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
FROM seed_shop_target_products t
WHERE NOT EXISTS (
  SELECT 1 FROM shop_variants v
  WHERE v.product_id = t.target_product_id AND v.deleted_at IS NULL
);

UPDATE shop_variants
SET sku = (SELECT t.sku FROM seed_shop_target_products t WHERE t.slug = 'chatgpt-plus'),
    status = 'active', fulfillment_type = 'license_key', delivery_mode = 'automatic',
    inventory_policy = 'tracked',
    price_minor = (SELECT t.price_minor FROM seed_shop_target_products t WHERE t.slug = 'chatgpt-plus'),
    compare_at_minor = NULL, currency = 'VND', low_stock_threshold = 3, max_per_order = 1,
    option_values_json = json_object('duration', '1-month'),
    metadata_json = json_object('termMonths', 1, 'referenceUsdLabel', '1.5', 'seedKey', 'shop-catalog-2026-07-25-v1'),
    version = version + 1,
    updated_at = '2026-07-25T00:00:00.000Z'
WHERE id IN (SELECT id FROM seed_shop_adopted_variants);

CREATE TABLE seed_shop_variant_copy AS
SELECT v.id AS variant_id, p.title, locale.locale,
  CASE locale.locale
    WHEN 'vi' THEN p.title || ' - 1 tháng'
    WHEN 'en' THEN p.title || ' - 1 month'
    WHEN 'ja' THEN p.title || ' - 1か月'
    ELSE p.title || ' - 1个月'
  END AS title,
  CASE locale.locale
    WHEN 'vi' THEN 'Thời hạn: 1 tháng'
    WHEN 'en' THEN 'Duration: 1 month'
    WHEN 'ja' THEN '期間：1か月'
    ELSE '期限：1个月'
  END AS option_summary
FROM seed_shop_target_products p
JOIN shop_variants v ON v.product_id = p.target_product_id AND v.deleted_at IS NULL
CROSS JOIN (
  SELECT 'vi' AS locale UNION ALL SELECT 'en' UNION ALL SELECT 'ja' UNION ALL SELECT 'zh'
) locale;

DELETE FROM shop_variant_localizations
WHERE variant_id IN (SELECT id FROM seed_shop_adopted_variants);

INSERT OR IGNORE INTO shop_variant_localizations (variant_id, locale, title, option_summary)
SELECT variant_id, locale, title, option_summary FROM seed_shop_variant_copy;

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-catalog-2026-07-25-v1',
  'seed:shop-catalog:2026-07-25:v1',
  'shop.catalog.seeded',
  'shop_catalog',
  'shop-catalog-2026-07-25-v1',
  NULL,
  json_object('products', 13, 'categories', 4, 'termMonths', 1, 'inventoryCreated', 0),
  '2026-07-25T00:00:00.000Z'
);

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
SELECT
  'audit-shop-catalog-chatgpt-adopted-2026-07-25-v1',
  'seed:shop-catalog:2026-07-25:v1',
  'shop.product.seed_adopted',
  'shop_product',
  id,
  NULL,
  json_object('slug', slug, 'previousVersion', 1, 'newVersion', 2),
  '2026-07-25T00:00:00.000Z'
FROM seed_shop_adopted_products;

DELETE FROM transaction_guards WHERE token = 'seed-shop-catalog-2026-07-25-v1';

DROP TABLE seed_shop_variant_copy;
DROP TABLE seed_shop_product_copy;
DROP TABLE seed_shop_target_products;
DROP TABLE seed_shop_adopted_variants;
DROP TABLE seed_shop_adopted_products;
DROP TABLE seed_shop_products;
DROP TABLE seed_shop_categories;
