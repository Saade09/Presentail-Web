import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const phoneOtpsTable = pgTable("phone_otps", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PhoneOtp = typeof phoneOtpsTable.$inferSelect;
export type InsertPhoneOtp = typeof phoneOtpsTable.$inferInsert;
