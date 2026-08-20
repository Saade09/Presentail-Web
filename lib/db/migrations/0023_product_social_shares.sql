-- Product social-share card editorial controls. The source asset remains in
-- object storage or the OS catalog; no image bytes are persisted here.
CREATE TABLE IF NOT EXISTS product_social_shares (
  product_slug text PRIMARY KEY NOT NULL,
  custom_image_url text,
  preferred_image_url text,
  layout text NOT NULL DEFAULT 'product',
  focal_x real,
  focal_y real,
  scale real,
  position_x real,
  position_y real,
  source_version text NOT NULL DEFAULT '1',
  template_version text NOT NULL DEFAULT 'ivory-v1',
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_social_shares_layout_check
    CHECK (layout IN ('product', 'portrait', 'photo', 'custom'))
);