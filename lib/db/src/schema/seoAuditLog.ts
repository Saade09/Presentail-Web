import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Rolling log of daily SEO audit results.
 *
 * One row is appended per completed audit run (both scheduled daily runs and
 * on-demand `/api/admin/seo-audit/run` calls). Only aggregate counts are stored
 * — per-page detail is not persisted here to keep the table small.
 *
 * Rows older than 90 days are pruned by the monitor on each scheduled run.
 */
export const seoAuditLogTable = pgTable(
  "seo_audit_log",
  {
    id: serial("id").primaryKey(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
    /** "scheduled" (daily cron) or "on_demand" (manual trigger) */
    runType: text("run_type").notNull().default("scheduled"),
    total: integer("total").notNull(),
    failing: integer("failing").notNull(),
    warned: integer("warned").notNull(),
    passing: integer("passing").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ranAtIdx: index("seo_audit_log_ran_at_idx").on(t.ranAt),
  }),
);

export type SeoAuditLogRow = typeof seoAuditLogTable.$inferSelect;
export type InsertSeoAuditLog = typeof seoAuditLogTable.$inferInsert;
