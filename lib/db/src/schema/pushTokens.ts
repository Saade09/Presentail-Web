import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    userId: integer("user_id"),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("push_tokens_token_idx").on(t.token),
    userIdx: index("push_tokens_user_idx").on(t.userId),
    deviceIdx: index("push_tokens_device_idx").on(t.deviceId),
  }),
);

export type PushToken = typeof pushTokensTable.$inferSelect;
export type InsertPushToken = typeof pushTokensTable.$inferInsert;
