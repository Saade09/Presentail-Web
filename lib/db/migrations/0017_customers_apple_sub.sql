-- Migration: add apple_sub column to customers
-- Stores the stable Apple ID sub (subject) claim so we can resolve accounts
-- by Apple identity when the email claim is absent.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS apple_sub text;
