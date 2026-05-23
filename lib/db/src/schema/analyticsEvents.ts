import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    surface: text("surface"),
    action: text("action"),
    platform: text("platform"),
    appVersion: text("app_version"),
    errorCode: text("error_code"),
    productId: text("product_id"),
    userId: text("user_id"),
    signedIn: boolean("signed_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameCreatedIdx: index("analytics_events_name_created_idx").on(
      t.name,
      t.createdAt,
    ),
    createdIdx: index("analytics_events_created_idx").on(t.createdAt),
  }),
);

export type AnalyticsEventRow = typeof analyticsEventsTable.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEventsTable.$inferInsert;
