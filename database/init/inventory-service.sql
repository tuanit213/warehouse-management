CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  last_movement_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('INBOUND', 'OUTBOUND', 'ADJUSTMENT')),
  quantity_delta NUMERIC(14,2) NOT NULL,
  quantity_after NUMERIC(14,2) NOT NULL CHECK (quantity_after >= 0),
  reference_type VARCHAR(50),
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_quantity_nonnegative') THEN
    ALTER TABLE stock_levels ADD CONSTRAINT chk_stock_quantity_nonnegative CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_min_quantity_nonnegative') THEN
    ALTER TABLE stock_levels ADD CONSTRAINT chk_stock_min_quantity_nonnegative CHECK (min_quantity >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse ON warehouse_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_warehouse ON stock_levels(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_location ON stock_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_last_movement ON stock_levels(last_movement_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
WITH duplicate_stock AS (
  SELECT
    MIN(id::text)::uuid AS keep_id,
    product_id,
    warehouse_id,
    location_id,
    SUM(quantity) AS quantity,
    MAX(min_quantity) AS min_quantity,
    MAX(last_movement_at) AS last_movement_at
  FROM stock_levels
  GROUP BY product_id, warehouse_id, location_id
  HAVING COUNT(*) > 1
),
merged AS (
  UPDATE stock_levels s
  SET
    quantity = d.quantity,
    min_quantity = d.min_quantity,
    last_movement_at = d.last_movement_at
  FROM duplicate_stock d
  WHERE s.id = d.keep_id
  RETURNING s.id
)
DELETE FROM stock_levels s
USING duplicate_stock d
WHERE s.product_id = d.product_id
  AND s.warehouse_id = d.warehouse_id
  AND s.location_id IS NOT DISTINCT FROM d.location_id
  AND s.id <> d.keep_id;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_levels_product_warehouse_location
  ON stock_levels(product_id, warehouse_id, location_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_transaction_reference
  ON stock_movements(reference_type, reference_id, product_id, warehouse_id, location_id)
  NULLS NOT DISTINCT
  WHERE reference_type = 'transaction' AND reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_events_event_created ON inventory_audit_events(event, created_at DESC);

CREATE TABLE IF NOT EXISTS stocktake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'CANCELLED')),
  note TEXT,
  approved_reason TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stocktake_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  system_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_quantity NUMERIC(14,2) NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stocktake_lines_stock_product_location
  ON stocktake_lines(stocktake_id, product_id, location_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_warehouse_created ON stocktake_sessions(warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake ON stocktake_lines(stocktake_id);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'RELEASED', 'CONSUMED')),
  reference_type VARCHAR(50),
  reference_id UUID,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  release_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_stock_status ON stock_reservations(product_id, warehouse_id, location_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_reference ON stock_reservations(reference_type, reference_id);

INSERT INTO warehouses (id, code, name, address) VALUES
  ('11111111-1111-1111-1111-111111111111', 'WH-HCM', 'Kho Hồ Chí Minh', 'Khu công nghiệp Tân Bình, TP.HCM'),
  ('22222222-2222-2222-2222-222222222222', 'WH-HN', 'Kho Hà Nội', 'Khu công nghiệp Thăng Long, Hà Nội')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address;

INSERT INTO warehouse_locations (id, warehouse_id, code, description) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'A-01', 'Kệ A, tầng 01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'B-02', 'Kệ B, hàng dễ lấy'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'HN-01', 'Khu nhận hàng Hà Nội')
ON CONFLICT (warehouse_id, code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO stock_levels (id, product_id, warehouse_id, location_id, quantity, min_quantity, last_movement_at) VALUES
  ('33333333-3333-3333-3333-333333333331', '00000000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 12, 20, NOW() - INTERVAL '45 days'),
  ('33333333-3333-3333-3333-333333333332', '00000000-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 80, 15, NOW() - INTERVAL '5 days'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000103', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 6, 10, NOW() - INTERVAL '70 days')
ON CONFLICT (id) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  warehouse_id = EXCLUDED.warehouse_id,
  location_id = EXCLUDED.location_id,
  quantity = EXCLUDED.quantity,
  min_quantity = EXCLUDED.min_quantity,
  last_movement_at = EXCLUDED.last_movement_at;
