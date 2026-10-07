-- 0060_restore_chatgpt_plus_name.sql
-- Restore original ChatGPT Plus title as configured by user

UPDATE shop_product_localizations
SET
  title = 'ChatGPT Plus hàng GPAY đuổi gmail Siêu trâu BH5H thẻ riêng',
  eyebrow = 'Gói 1 tháng · GPAY Siêu trâu',
  seo_title = 'Mua ChatGPT Plus Hàng GPAY Đuổi Gmail Siêu Trâu BH5H Thẻ Riêng | TUNG Shop',
  seo_description = 'Mua ChatGPT Plus hàng GPAY đuổi gmail siêu trâu BH5H thẻ riêng tại TUNG Shop. Bảo hành uy tín, giao tự động 24/7, thanh toán VietQR & Ví số dư.'
WHERE product_id = 'a7747d12-66c2-4a18-b1cd-54c2f57bbf97' AND locale = 'vi';

UPDATE shop_variant_localizations
SET
  title = 'ChatGPT Plus hàng GPAY đuổi gmail Siêu trâu BH5H thẻ riêng'
WHERE variant_id = '0fae287b-a044-490d-9ed4-1bd35bce2e8c' AND locale = 'vi';
