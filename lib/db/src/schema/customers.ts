import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Canonical customer record for the project. This is the source of truth for
// identity going forward; WooCommerce is treated as a downstream sync target
// (see `wcCustomerId`). Email is stored lowercased and trimmed and is unique.
// Phone is normalized best-effort to E.164 and used as a secondary lookup.
export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    phoneE164: text("phone_e164"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    country: text("country"),
    city: text("city"),
    wcCustomerId: integer("wc_customer_id"),
    authProvider: text("auth_provider"),
    authUserId: text("auth_user_id"),
    source: text("source").notNull().default("presentail.com"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("customers_email_idx").on(t.email),
    phoneIdx: index("customers_phone_idx").on(t.phoneE164),
    wcIdx: uniqueIndex("customers_wc_customer_idx").on(t.wcCustomerId),
    authIdx: index("customers_auth_idx").on(t.authProvider, t.authUserId),
  }),
);

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
