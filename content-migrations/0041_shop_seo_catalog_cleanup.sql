-- Normalize high-intent Vietnamese catalog names and replace generic SEO copy.
-- Product descriptions and historical order snapshots remain unchanged.
PRAGMA foreign_keys = ON;

UPDATE shop_product_localizations
SET title = CASE (
  SELECT p.slug FROM shop_products p WHERE p.id = shop_product_localizations.product_id
)
  WHEN 'chatgpt-plus' THEN 'ChatGPT Plus 1 tháng'
  WHEN 'gemini-pro' THEN 'Gemini Pro 1 tháng'
  WHEN 'canva' THEN 'Canva Pro 1 tháng'
  WHEN 'capcut-pro' THEN 'CapCut Pro'
  WHEN 'super-grok' THEN 'Super Grok'
  WHEN 'elevenlab' THEN 'ElevenLabs'
  WHEN 'ytb-premium' THEN 'YouTube Premium'
  ELSE trim(replace(replace(replace(title, ' Trial ! tháng KBH', ''), ' trial 7days', ''), ' KBH', ''))
END
WHERE locale = 'vi'
  AND product_id IN (
    SELECT id FROM shop_products
    WHERE status = 'active' AND deleted_at IS NULL
  );

UPDATE shop_product_localizations
SET seo_title = 'Mua ' || title || ' giá rẻ, giao nhanh | TUNG Shop',
    seo_description = 'Mua ' || title || ' giá tốt tại TUNG Shop. Xem giá, phiên bản, thời hạn, tồn kho, cách bàn giao và thanh toán VietQR trước khi đặt hàng.'
WHERE locale = 'vi'
  AND product_id IN (
    SELECT id FROM shop_products
    WHERE status = 'active' AND deleted_at IS NULL
  );

UPDATE shop_products
SET version = version + 1,
    updated_by = 'migration:0041_shop_seo_catalog_cleanup',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'active' AND deleted_at IS NULL;
