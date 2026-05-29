import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Deduplication table for price-change Slack alerts.
 *
 * One row per product. The `alertedAt` column records the most recent time a
 * price-change alert was sent for that product. On startup, the server reads
 * rows with `alerted_at > now() - 24h` and uses them to re-populate the
 * in-memory `priceAlertedAt` map, preventing duplicate alerts across restarts
 * and deploys.
 *
 * Rows are upserted (not inserted) each time an alert fires, so the table
 * stays small (one row per product that has ever had a price alert).
 */
export const osPriceAlertsTable = pgTable(
  "os_price_alerts",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull().unique(),
    /** UTC timestamp of the most recent price-change alert for this product. */
    alertedAt: timestamp("alerted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    productIdIdx: index("os_price_alerts_product_id_idx").on(t.productId),
    alertedAtIdx: index("os_price_alerts_alerted_at_idx").on(t.alertedAt),
  }),
);

export type OsPriceAlertRow = typeof osPriceAlertsTable.$inferSelect;
export type InsertOsPriceAlert = typeof osPriceAlertsTable.$inferInsert;
