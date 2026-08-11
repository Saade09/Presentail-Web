-- Add password reset token columns for the local-only auth flow.
-- These are used by POST /auth/reset/request and POST /auth/reset/confirm
-- when WC_AUTH_ENABLED=false (the default for new deployments). The WP reset
-- proxy has no effect for locally-registered accounts, so we need a
-- self-contained token + expiry stored here.
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "password_reset_token" text,
  ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" timestamptz;
