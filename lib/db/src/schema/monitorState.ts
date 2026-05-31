import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Key/value store for durable monitor state.
 *
 * Each row holds the serialised state for one monitor (e.g. the last SEO
 * audit result), keyed by a short, stable string identifier.  The `value`
 * column is JSONB so callers can store any JSON-serialisable shape without
 * schema migrations every time the payload evolves.
 *
 * Rows are upserted (INSERT … ON CONFLICT DO UPDATE) so there is always at
 * most one row per key.
 */
export const monitorStateTable = pgTable("monitor_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MonitorStateRow = typeof monitorStateTable.$inferSelect;
