-- 0047: relative shop media URLs for cute asset refresh + thumb rewrite
-- Rewrite absolute R2 media hosts to /images/shop/{file}

UPDATE shop_product_media
SET asset_url = '/images/shop/' || replace(
  replace(
    replace(asset_url, 'https://media.tung.codes/shop/', ''),
    'https://media.tungjpstore.net/shop/',
    ''
  ),
  'http://media.tung.codes/shop/',
  ''
)
WHERE asset_url LIKE 'https://media.tung.codes/shop/%'
   OR asset_url LIKE 'https://media.tungjpstore.net/shop/%'
   OR asset_url LIKE 'http://media.tung.codes/shop/%';

-- Strip cache-bust query from relative shop paths
UPDATE shop_product_media
SET asset_url = substr(asset_url, 1, instr(asset_url, '?') - 1)
WHERE asset_url LIKE '/images/shop/%?%';
