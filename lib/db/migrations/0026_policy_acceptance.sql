-- Policy acceptance audit fields on app_orders.
-- All three columns are nullable so existing historical rows remain unchanged.
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "policy_accepted_at" timestamp with time zone;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "policy_accepted_ip" text;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "policy_version" text;
