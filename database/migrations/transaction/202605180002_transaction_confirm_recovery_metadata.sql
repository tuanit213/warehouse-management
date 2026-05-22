ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirm_error TEXT;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirm_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirming_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_status_confirming_started
  ON stock_transactions(status, confirming_started_at);
