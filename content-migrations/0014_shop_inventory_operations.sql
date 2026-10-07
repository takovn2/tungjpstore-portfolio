-- Additive inventory operations layer. Plaintext license keys never enter
-- these tables; preview/import rows retain only keyed fingerprints and status.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_inventory_import_batches (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
  source_format TEXT NOT NULL DEFAULT 'json' CHECK (source_format IN ('json', 'csv', 'txt')),
  source_name TEXT,
  source_hash TEXT,
  idempotency_key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  total_rows INTEGER NOT NULL CHECK (total_rows >= 0 AND total_rows <= 500),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  duplicate_in_file_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_in_file_count >= 0),
  duplicate_in_stock_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_in_stock_count >= 0),
  invalid_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (variant_id, idempotency_key_hash),
  CHECK (valid_rows + duplicate_in_file_count + duplicate_in_stock_count + invalid_count = total_rows)
);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_import_batches_variant
  ON shop_inventory_import_batches (variant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_import_batches_status
  ON shop_inventory_import_batches (status, updated_at, id)
  WHERE status IN ('ready', 'processing', 'partial', 'failed');

CREATE TABLE IF NOT EXISTS shop_inventory_import_chunks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES shop_inventory_import_batches(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0 AND chunk_index < 20),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  request_hash TEXT,
  first_line_number INTEGER NOT NULL CHECK (first_line_number >= 1 AND first_line_number <= 500),
  row_count INTEGER NOT NULL CHECK (row_count >= 1 AND row_count <= 25),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 1000),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (batch_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_import_chunks_batch
  ON shop_inventory_import_chunks (batch_id, chunk_index, status);

CREATE TABLE IF NOT EXISTS shop_inventory_import_rows (
  batch_id TEXT NOT NULL REFERENCES shop_inventory_import_batches(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number >= 1 AND line_number <= 500),
  chunk_index INTEGER CHECK (chunk_index IS NULL OR (chunk_index >= 0 AND chunk_index < 20)),
  status TEXT NOT NULL
    CHECK (status IN ('valid', 'invalid', 'duplicate_in_file', 'already_in_stock', 'imported', 'failed')),
  key_fingerprint TEXT,
  inventory_unit_id TEXT REFERENCES shop_inventory_units(id) ON DELETE SET NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, line_number),
  CHECK (key_fingerprint IS NULL OR length(key_fingerprint) = 43),
  CHECK (status != 'valid' OR (key_fingerprint IS NOT NULL AND chunk_index IS NOT NULL)),
  CHECK (status != 'imported' OR inventory_unit_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_import_rows_batch_status
  ON shop_inventory_import_rows (batch_id, status, line_number);

ALTER TABLE shop_inventory_units ADD COLUMN import_batch_id TEXT
  REFERENCES shop_inventory_import_batches(id) ON DELETE SET NULL;
ALTER TABLE shop_inventory_units ADD COLUMN import_line_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_import_line
  ON shop_inventory_units (import_batch_id, import_line_number)
  WHERE import_batch_id IS NOT NULL AND import_line_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS shop_inventory_movements (
  id TEXT PRIMARY KEY,
  inventory_unit_id TEXT NOT NULL REFERENCES shop_inventory_units(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES shop_variants(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('imported', 'reserved', 'released', 'fulfilled', 'quarantined', 'revoked', 'restored', 'adjusted')),
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('available', 'reserved', 'fulfilled', 'quarantined', 'revoked')),
  reservation_id TEXT REFERENCES shop_inventory_reservations(id) ON DELETE SET NULL,
  allocation_id TEXT REFERENCES shop_inventory_allocations(id) ON DELETE SET NULL,
  import_batch_id TEXT REFERENCES shop_inventory_import_batches(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  reason_code TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_movements_unit
  ON shop_inventory_movements (inventory_unit_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_movements_variant
  ON shop_inventory_movements (variant_id, created_at DESC, id DESC);

-- Existing schema indexes lead with reservation_id/status-expiry. These cover
-- the actual payment-conversion and fulfillment-claim access paths.
CREATE INDEX IF NOT EXISTS idx_shop_inventory_reservations_order_status
  ON shop_inventory_reservations (order_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_allocations_item_status
  ON shop_inventory_allocations (order_item_id, status, created_at, id);
