-- One-time production seed for the user-supplied Bybit USDT receiving methods.
-- Keep this separate from migrations so changing an address is an explicit admin action.
INSERT OR IGNORE INTO shop_crypto_payment_methods
  (id, storefront_scope, provider, rail, asset, network, destination_type,
   destination_value, memo_or_tag, display_name, status, min_confirmations,
   expiry_minutes, sort_order, version, public_config_json, created_by,
   updated_by, created_at, updated_at)
VALUES
  ('glb-bybit-usdt-ethereum', 'glb', 'bybit', 'onchain_deposit', 'USDT',
   'ETHEREUM', 'wallet_address',
   '0x9d0746304734bd6e657d9d24e2fffb6de44ecafe', '',
   'Bybit - USDT - Ethereum (ERC20)', 'active', 1, 30, 10, 1,
   '{"qrUrl":"/payment-qr/bybit-usdt-erc20.png"}',
   'manual-setup', 'manual-setup', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('glb-bybit-usdt-bsc', 'glb', 'bybit', 'onchain_deposit', 'USDT',
   'BSC', 'wallet_address',
   '0x9d0746304734bd6e657d9d24e2fffb6de44ecafe', '',
   'Bybit - USDT - BNB Chain (BEP20)', 'active', 1, 30, 20, 1,
   '{"qrUrl":"/payment-qr/bybit-usdt-bep20.png"}',
   'manual-setup', 'manual-setup', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('glb-bybit-usdt-polygon', 'glb', 'bybit', 'onchain_deposit', 'USDT',
   'POLYGON', 'wallet_address',
   '0x9d0746304734bd6e657d9d24e2fffb6de44ecafe', '',
   'Bybit - USDT - Polygon', 'active', 1, 30, 30, 1,
   '{"qrUrl":"/payment-qr/bybit-usdt-polygon.png"}',
   'manual-setup', 'manual-setup', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('glb-bybit-usdt-tron', 'glb', 'bybit', 'onchain_deposit', 'USDT',
   'TRON', 'wallet_address',
   'TSqMrYKYw5ZYUqR5vqLW6xsXGsuhKgPn1p', '',
   'Bybit - USDT - TRON (TRC20)', 'active', 1, 30, 40, 1,
   '{"qrUrl":"/payment-qr/bybit-usdt-trc20.png"}',
   'manual-setup', 'manual-setup', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('glb-bybit-usdt-internal-uid', 'glb', 'bybit', 'internal_uid', 'USDT',
   '', 'uid', '389068072', '', 'Bybit - USDT - Internal UID', 'active', 0, 30, 5, 1,
   '{"accountUid":"389068072"}', 'manual-setup', 'manual-setup',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- UID is exposed only by the dedicated internal transfer method. Preserve
-- wallet QR settings while removing any legacy UID metadata from on-chain rows.
UPDATE shop_crypto_payment_methods
SET public_config_json = json_remove(public_config_json, '$.accountUid'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE storefront_scope = 'glb'
  AND rail = 'onchain_deposit'
  AND destination_type = 'wallet_address';
