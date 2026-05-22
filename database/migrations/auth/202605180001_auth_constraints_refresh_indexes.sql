DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON refresh_tokens(user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expires
  ON refresh_tokens(user_id, expires_at DESC);
