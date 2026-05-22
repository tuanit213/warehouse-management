DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transactions_status'
  ) THEN
    ALTER TABLE stock_transactions DROP CONSTRAINT chk_stock_transactions_status;
  END IF;

  ALTER TABLE stock_transactions
    ADD CONSTRAINT chk_stock_transactions_status
    CHECK (status IN ('DRAFT', 'CONFIRMING', 'CONFIRM_FAILED', 'CONFIRMED', 'CANCELLED'));
END $$;

ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_stock_transactions_status_updated
  ON stock_transactions(status, updated_at);
