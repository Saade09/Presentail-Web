import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Durable ownership and low-cardinality execution metrics for recurring API
 * jobs. One row is reused per named job; `windowStart` identifies the cadence
 * window currently represented by the row.
 */
export const backgroundJobLeasesTable = pgTable("background_job_leases", {
  jobName: text("job_name").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  ownerToken: text("owner_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  generation: integer("generation").notNull().default(0),
  status: text("status").notNull().default("idle"),
  runCount: integer("run_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  skipCount: integer("skip_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  lastDurationMs: integer("last_duration_ms"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BackgroundJobLease =
  typeof backgroundJobLeasesTable.$inferSelect;

export const backgroundJobSnapshotsTable = pgTable(
  "background_job_snapshots",
  {
    snapshotName: text("snapshot_name").primaryKey(),
    payload: jsonb("payload").notNull(),
    sourceWindowStart: timestamp("source_window_start", {
      withTimezone: true,
    }).notNull(),
    sourceGeneration: integer("source_generation").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);