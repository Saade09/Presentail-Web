import {
  index,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Daily price snapshot for each Presentail OS product.
 *
 * One row per (product_id, snapshot_date). The composite unique index
 * enforces first-write-wins semantics for the day: subsequent writes
 * with the same (product_id, snapshot_date) are ignored via
 * `ON CONFLICT DO NOTHING`.
 *
 * Rows are pruned after 7 days by the wooSync worker so the table stays
 * small. The admin funnels dashboard uses the previous UTC day's rows as
 * the baseline to flag upsell products whose prices have changed since
 * then — a baseline that survives server restarts and deploys.
 */
export const osPriceSnapshotsTable = pgTable(
  "os_price_snapshots",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull(),
    /** UTC date string, YYYY-MM-DD, shared by all products written in the same daily pass. */
    snapshotDate: text("snapshot_date").notNull(),
    /** USD base price as stored in the Presentail OS response (`product.price`). */
    priceUsd: real("price_usd").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    productDateUniq: uniqueIndex("os_price_snapshots_product_date_uniq").on(
      t.productId,
      t.snapshotDate,
    ),
    snapshotDateIdx: index("os_price_snapshots_date_idx").on(t.snapshotDate),
  }),
);

export type OsPriceSnapshotRow = typeof osPriceSnapshotsTable.$inferSelect;
export type InsertOsPriceSnapshot = typeof osPriceSnapshotsTable.$inferInsert;
