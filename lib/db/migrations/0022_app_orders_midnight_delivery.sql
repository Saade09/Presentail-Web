ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_city_id" text;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_country_code" text;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_slot_id" text;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_service_type" text;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_slot_fee_cents" integer;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_window_start" timestamp with time zone;
ALTER TABLE "app_orders" ADD COLUMN IF NOT EXISTS "delivery_window_end" timestamp with time zone;