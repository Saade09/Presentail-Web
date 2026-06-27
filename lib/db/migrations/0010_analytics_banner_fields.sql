ALTER TABLE "analytics_events"
  ADD COLUMN IF NOT EXISTS "banner_id" text,
  ADD COLUMN IF NOT EXISTS "link_kind" text,
  ADD COLUMN IF NOT EXISTS "link_slug" text,
  ADD COLUMN IF NOT EXISTS "link_url" text;
