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
  last_movement_at TIMESTAMPTZ,
  UNIQUE (product_id, warehouse_id, location_id)
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
ON CONFLICT (product_id, warehouse_id, location_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  min_quantity = EXCLUDED.min_quantity,
  last_movement_at = EXCLUDED.last_movement_at;
