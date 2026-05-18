CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS categories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, parent_id UUID NULL REFERENCES categories(id));
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit VARCHAR(50) NOT NULL,
  category_id UUID REFERENCES categories(id),
  cost_price NUMERIC(14,2) DEFAULT 0,
  barcode VARCHAR(120),
  color VARCHAR(80),
  size VARCHAR(80),
  sale_price NUMERIC(14,2) DEFAULT 0,
  warehouse_id UUID,
  location_id UUID,
  quantity_imported NUMERIC(14,2) DEFAULT 0,
  supplier_id UUID,
  imported_at DATE,
  note TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
