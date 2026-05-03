CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('INBOUND', 'OUTBOUND')),
  code VARCHAR(50) UNIQUE NOT NULL,
  warehouse_id UUID NOT NULL,
  supplier_id UUID NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  note TEXT,
  total_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES stock_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  location_id UUID NULL,
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS total_value NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock_transaction_items ADD COLUMN IF NOT EXISTS location_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transactions_status') THEN
    ALTER TABLE stock_transactions ADD CONSTRAINT chk_stock_transactions_status CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transactions_type') THEN
    ALTER TABLE stock_transactions ADD CONSTRAINT chk_stock_transactions_type CHECK (type IN ('INBOUND', 'OUTBOUND'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transaction_items_unit_price') THEN
    ALTER TABLE stock_transaction_items ADD CONSTRAINT chk_stock_transaction_items_unit_price CHECK (unit_price >= 0);
  END IF;
END $$;

UPDATE stock_transactions SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, created_at) WHERE status = 'COMPLETED';

CREATE INDEX IF NOT EXISTS idx_stock_transactions_type ON stock_transactions(type);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_status ON stock_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_warehouse ON stock_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_supplier ON stock_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_product ON stock_transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_transaction ON stock_transaction_items(transaction_id);
