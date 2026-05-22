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

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON stock_movements(reference_type, reference_id);
