-- Attach product-related cover images for the DigiStore catalog.
-- Static assets live under /images/shop/{slug}.webp on the Worker/static host.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO shop_product_media
  (id, product_id, variant_id, media_id, media_type, asset_url, alt, sort_order, created_at)
SELECT
  'catalog-media-' || p.slug,
  p.id,
  NULL,
  NULL,
  'image',
  '/images/shop/' || p.slug || '.webp',
  CASE p.slug
    WHEN 'chatgpt-plus' THEN 'Ảnh bìa ChatGPT Plus — gói digital key 1 tháng'
    WHEN 'gemini-pro' THEN 'Ảnh bìa Gemini Pro — gói digital key 1 tháng'
    WHEN 'canva' THEN 'Ảnh bìa Canva — gói digital key 1 tháng'
    WHEN 'capcut-pro' THEN 'Ảnh bìa CapCut Pro — gói digital key 1 tháng'
    WHEN 'super-grok' THEN 'Ảnh bìa Super Grok — gói digital key 1 tháng'
    WHEN 'netflix' THEN 'Ảnh bìa Netflix — gói digital key 1 tháng'
    WHEN 'cursor-pro' THEN 'Ảnh bìa Cursor Pro — gói digital key 1 tháng'
    WHEN 'microsoft' THEN 'Ảnh bìa Microsoft — gói digital key 1 tháng'
    WHEN 'elevenlab' THEN 'Ảnh bìa ElevenLabs — gói digital key 1 tháng'
    WHEN 'ytb-premium' THEN 'Ảnh bìa YouTube Premium — gói digital key 1 tháng'
    WHEN 'veo3-anti' THEN 'Ảnh bìa Veo 3 — gói digital key 1 tháng'
    WHEN 'xbox' THEN 'Ảnh bìa Xbox — gói digital key 1 tháng'
    WHEN 'adobe' THEN 'Ảnh bìa Adobe — gói digital key 1 tháng'
    ELSE 'Ảnh bìa sản phẩm số DigiStore'
  END,
  0,
  '2026-07-25T12:00:00.000Z'
FROM shop_products p
WHERE p.slug IN (
  'chatgpt-plus', 'gemini-pro', 'canva', 'capcut-pro', 'super-grok',
  'netflix', 'cursor-pro', 'microsoft', 'elevenlab', 'ytb-premium',
  'veo3-anti', 'xbox', 'adobe'
)
AND p.deleted_at IS NULL
AND NOT EXISTS (
  SELECT 1 FROM shop_product_media m
  WHERE m.product_id = p.id AND m.asset_url = '/images/shop/' || p.slug || '.webp'
);

-- Prefer these covers when a product still has no cover media assigned.
UPDATE shop_products
SET cover_media_id = NULL
WHERE slug IN (
  'chatgpt-plus', 'gemini-pro', 'canva', 'capcut-pro', 'super-grok',
  'netflix', 'cursor-pro', 'microsoft', 'elevenlab', 'ytb-premium',
  'veo3-anti', 'xbox', 'adobe'
)
AND cover_media_id IS NOT NULL
AND cover_media_id NOT LIKE 'catalog-media-%';

INSERT OR IGNORE INTO audit_logs
  (id, actor, action, entity_type, entity_id, request_id, details_json, created_at)
VALUES (
  'audit-shop-product-covers-2026-07-25-v1',
  'seed:shop-covers:v1',
  'shop.product.covers_seeded',
  'shop_product_media',
  'catalog',
  NULL,
  json_object('products', 13, 'pathPrefix', '/images/shop/', 'format', 'webp'),
  '2026-07-25T12:00:00.000Z'
);
