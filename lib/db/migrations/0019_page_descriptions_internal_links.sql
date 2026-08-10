-- Add admin-curated internal links to page contextual descriptions.
-- This column stores an array of { label, href } objects that override the
-- auto-generated chip list in SEOContentSection when present.
ALTER TABLE page_contextual_descriptions
  ADD COLUMN IF NOT EXISTS internal_links jsonb;
