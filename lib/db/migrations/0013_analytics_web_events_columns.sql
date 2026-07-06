ALTER TABLE "analytics_events"
  ADD COLUMN IF NOT EXISTS "items_json" text,
  ADD COLUMN IF NOT EXISTS "properties_json" text;
