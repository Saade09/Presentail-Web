import { integer, json, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const seoAuditRunsTable = pgTable("seo_audit_runs", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  triggeredBy: text("triggered_by").notNull(),
  durationMs: integer("duration_ms"),
  totalChecks: integer("total_checks"),
  criticalCount: integer("critical_count").default(0),
  warnCount: integer("warn_count").default(0),
  passCount: integer("pass_count").default(0),
  summaryJson: json("summary_json"),
});

export type SeoAuditRunRow = typeof seoAuditRunsTable.$inferSelect;
export type InsertSeoAuditRun = typeof seoAuditRunsTable.$inferInsert;
