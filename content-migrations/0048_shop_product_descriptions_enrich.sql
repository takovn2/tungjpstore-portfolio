-- M7: Enrich short product descriptions for marketplace ProductSheet clarity (VI/EN where empty-ish).
-- Safe: only fills description when localization description is blank or equals short_description.

UPDATE shop_product_localizations
SET description = CASE locale
  WHEN 'vi' THEN 'Gói số chính hãng. Xem đúng thời hạn/phiên bản trên biến thể trước khi thanh toán. Sau khi backend xác minh thanh toán, key hoặc tài khoản được giao theo trạng thái đơn.'
  WHEN 'en' THEN 'Official digital package. Check plan duration and limits on the selected variant before paying. After payment is verified, keys or access are delivered according to order status.'
  WHEN 'ja' THEN '正規のデジタル商品です。支払い前にプラン期間と条件を確認してください。支払い確認後、注文状態に応じてキーまたはアクセス情報を交付します。'
  WHEN 'zh' THEN '正版数字商品。付款前请核对所选套餐的期限与权益。付款验证后，将按订单状态交付密钥或账号。'
  ELSE description
END
WHERE trim(coalesce(description, '')) = ''
   OR trim(coalesce(description, '')) = trim(coalesce(short_description, ''));
