ALTER TABLE "analytics_events"
  ADD COLUMN IF NOT EXISTS "metric_value" double precision;
