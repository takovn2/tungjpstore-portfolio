-- Allow the legacy Vietnam bot and the independent GLB Store bot to be
-- activated at the same time. Existing rows remain in the legacy scope.
PRAGMA foreign_keys = OFF;

ALTER TABLE shop_telegram_bot_configs
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'legacy'
  CHECK (scope IN ('legacy', 'glb'));

DROP INDEX IF EXISTS uq_shop_telegram_bot_active;
DROP INDEX IF EXISTS uq_shop_telegram_bot_previous;
DROP INDEX IF EXISTS uq_shop_telegram_bot_activating;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_scope_active
  ON shop_telegram_bot_configs (scope, status) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_scope_previous
  ON shop_telegram_bot_configs (scope, status) WHERE status = 'previous';

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_telegram_bot_scope_activating
  ON shop_telegram_bot_configs (scope, status) WHERE status = 'activating';

CREATE INDEX IF NOT EXISTS idx_shop_telegram_bot_scope_status
  ON shop_telegram_bot_configs (scope, status, updated_at DESC);

PRAGMA foreign_keys = ON;
