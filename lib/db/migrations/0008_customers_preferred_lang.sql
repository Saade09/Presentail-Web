ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "preferred_lang" text NOT NULL DEFAULT 'en';
