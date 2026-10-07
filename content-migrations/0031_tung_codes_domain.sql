-- Move public content to tung.codes while legacy hosts remain active aliases.
UPDATE shop_product_media
SET asset_url = replace(asset_url, 'https://media.tungjpstore.net/', 'https://media.tung.codes/')
WHERE asset_url LIKE 'https://media.tungjpstore.net/%';

UPDATE localizations
SET data_json = replace(
  replace(
    replace(data_json, 'https://media.tungjpstore.net/', 'https://media.tung.codes/'),
    'https://tungjpstore.net',
    'https://tung.codes'
  ),
  'hello@tungjpstore.net',
  'hello@tung.codes'
)
WHERE data_json LIKE '%tungjpstore.net%';

UPDATE site_state
SET config_json = replace(
    replace(config_json, 'https://tungjpstore.net', 'https://tung.codes'),
    'hello@tungjpstore.net',
    'hello@tung.codes'
  ),
  version = version + 1,
  updated_by = 'migration:0031_tung_codes_domain',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE config_json LIKE '%tungjpstore.net%';
