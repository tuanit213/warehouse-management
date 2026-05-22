CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name VARCHAR(255), role VARCHAR(50) NOT NULL DEFAULT 'WAREHOUSE_STAFF', status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS refresh_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), token_hash TEXT NOT NULL, family_id UUID, replaced_by UUID NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, reuse_detected_at TIMESTAMPTZ NULL);
CREATE TABLE IF NOT EXISTS auth_audit_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event VARCHAR(80) NOT NULL, user_id UUID NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by UUID NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS reuse_detected_at TIMESTAMPTZ NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expires ON refresh_tokens(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by ON refresh_tokens(replaced_by);
CREATE INDEX IF NOT EXISTS idx_auth_audit_events_event_created ON auth_audit_events(event, created_at DESC);
