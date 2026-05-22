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
