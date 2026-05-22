CREATE TABLE IF NOT EXISTS transaction_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NULL,
  event VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_audit_events_transaction_created
  ON transaction_audit_events(transaction_id, created_at DESC);
