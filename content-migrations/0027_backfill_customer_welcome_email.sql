-- Queue the welcome message for accounts activated before the welcome topic existed.
INSERT OR IGNORE INTO transactional_email_outbox
  (id, topic, aggregate_type, aggregate_id, dedupe_key, status, available_at, created_at, updated_at)
SELECT
  'customer-welcome-' || id,
  'shop.customer.welcome',
  'shop_customer',
  id,
  'customer-welcome:' || id,
  'pending',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM shop_customers
WHERE account_activated_at IS NOT NULL
  AND email_normalized IS NOT NULL
  AND length(trim(email_normalized)) > 0;
