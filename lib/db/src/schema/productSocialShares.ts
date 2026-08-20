import { jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Editorial controls for a product's generated social image.
 *
 * Catalog data remains the source of the product photo. This table only stores
 * deliberate presentation overrides made by an operator, never generated image
 * bytes. A private object-storage path may be used for a custom source image.
 */
export const productSocialSharesTable = pgTable("product_social_shares", {
  productSlug: text("product_slug").primaryKey(),
  customImageUrl: text("custom_image_url"),
  preferredImageUrl: text("preferred_image_url"),
  layout: text("layout")
    .notNull()
    .default("product")
    .$type<"product" | "portrait" | "photo" | "custom">(),
  focalX: real("focal_x"),
  focalY: real("focal_y"),
  scale: real("scale"),
  positionX: real("position_x"),
  positionY: real("position_y"),
  sourceVersion: text("source_version").notNull().default("1"),
  templateVersion: text("template_version").notNull().default("ivory-v1"),
  qualityFlags: jsonb("quality_flags").$type<string[]>().notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductSocialShareRow = typeof productSocialSharesTable.$inferSelect;
export type InsertProductSocialShare = typeof productSocialSharesTable.$inferInsert;