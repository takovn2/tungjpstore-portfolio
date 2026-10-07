-- Align public shop metadata with the tung.codes brand.
-- Historical order snapshots are intentionally left unchanged for auditability.

UPDATE shop_product_localizations
SET title = replace(title, 'DigiStore', 'TUNG Shop'),
    eyebrow = replace(eyebrow, 'DigiStore', 'TUNG Shop'),
    short_description = replace(short_description, 'DigiStore', 'TUNG Shop'),
    description = replace(description, 'DigiStore', 'TUNG Shop'),
    seo_title = replace(seo_title, 'DigiStore', 'TUNG Shop'),
    seo_description = replace(seo_description, 'DigiStore', 'TUNG Shop')
WHERE title LIKE '%DigiStore%'
   OR eyebrow LIKE '%DigiStore%'
   OR short_description LIKE '%DigiStore%'
   OR description LIKE '%DigiStore%'
   OR seo_title LIKE '%DigiStore%'
   OR seo_description LIKE '%DigiStore%';

UPDATE shop_product_media
SET alt = replace(replace(alt, ' — DigiStore', ''), 'DigiStore', '')
WHERE alt LIKE '%DigiStore%';

UPDATE shop_products
SET metadata_json = replace(metadata_json, 'DigiStore', 'TUNG Shop'),
    version = version + 1,
    updated_by = 'migration:0032_tung_shop_brand',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE metadata_json LIKE '%DigiStore%';

UPDATE shop_variants
SET metadata_json = replace(metadata_json, 'DigiStore', 'TUNG Shop'),
    option_values_json = replace(option_values_json, 'DigiStore', 'TUNG Shop'),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE metadata_json LIKE '%DigiStore%'
   OR option_values_json LIKE '%DigiStore%';

UPDATE shop_variant_localizations
SET title = replace(title, 'DigiStore', 'TUNG Shop'),
    option_summary = replace(option_summary, 'DigiStore', 'TUNG Shop')
WHERE title LIKE '%DigiStore%'
   OR option_summary LIKE '%DigiStore%';
