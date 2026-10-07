-- Invalidate Telegram Mini App sessions independently from optimistic config
-- versions. This is a forward migration because 0037 may already be recorded
-- as applied in environments created before auth revisions were introduced.
ALTER TABLE shop_telegram_bot_configs
  ADD COLUMN auth_revision INTEGER NOT NULL DEFAULT 1 CHECK (auth_revision >= 1);
