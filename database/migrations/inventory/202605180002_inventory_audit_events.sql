CREATE TABLE IF NOT EXISTS inventory_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_events_event_created
  ON inventory_audit_events(event, created_at DESC);
