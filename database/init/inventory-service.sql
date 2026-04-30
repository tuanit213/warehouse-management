CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS warehouses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, address TEXT);
CREATE TABLE IF NOT EXISTS warehouse_locations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id UUID REFERENCES warehouses(id), code VARCHAR(50) NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS stock_levels (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL, warehouse_id UUID REFERENCES warehouses(id), location_id UUID REFERENCES warehouse_locations(id), quantity NUMERIC(14,2) NOT NULL DEFAULT 0, min_quantity NUMERIC(14,2) DEFAULT 0, last_movement_at TIMESTAMPTZ);
