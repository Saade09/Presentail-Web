import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Maps OS products to internal identifiers so the ranking service can
 * correlate OS sales data with local analytics rows.
 *
 * Matching priority (highest to lowest):
 *   1. Stored os_product_id (authoritative once verified)
 *   2. SKU exact match
 *   3. Normalised-SKU match
 * Never matches by title alone.
 *
 * mapping_status:
 *   matched   — a reliable cross-reference has been established
 *   unmatched — no match could be found; ranked using website-only metrics
 *   pending   — not yet verified (initial state)
 */
export const productDataSourceMappingTable = pgTable(
  "product_data_source_mapping",
  {
    id: serial("id").primaryKey(),
    /** Canonical OS product ID (string UUID or slug as returned by OS API). */
    osProductId: text("os_product_id").notNull(),
    /** Numeric OS database PK (osNumericId), when known. Nullable for pending rows. */
    osNumericId: text("os_numeric_id"),
    /** SKU from OS, for cross-referencing with local analytics events. */
    sku: text("sku"),
    /** Normalised SKU (lowercase, no punctuation) for fuzzy matching. */
    normalizedSku: text("normalized_sku"),
    /** Human-readable product name from OS, stored for WARN logging on mismatch. */
    osProductName: text("os_product_name"),
    /** Current match status for this mapping row. */
    mappingStatus: text("mapping_status").notNull().default("pending").$type<
      "matched" | "unmatched" | "pending"
    >(),
    /** Timestamp of the most recent successful OS verification round-trip. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    osProductIdUniq: uniqueIndex("product_dsm_os_product_id_uniq").on(t.osProductId),
    statusIdx: index("product_dsm_status_idx").on(t.mappingStatus),
    skuIdx: index("product_dsm_sku_idx").on(t.sku),
  }),
);

export type ProductDataSourceMappingRow = typeof productDataSourceMappingTable.$inferSelect;
export type InsertProductDataSourceMapping = typeof productDataSourceMappingTable.$inferInsert;
