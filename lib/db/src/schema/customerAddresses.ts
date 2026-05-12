import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";

// Saved delivery addresses scoped to a customer. The book is recipient-only
// (mirrors what today's checkout collects) and lives in our own DB — it is
// never synced to / from WooCommerce billing & shipping.
export const customerAddressesTable = pgTable(
  "customer_addresses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("home"),
    nickname: text("nickname"),
    countryCode: text("country_code").notNull(),
    district: text("district").notNull(),
    addressLine: text("address_line").notNull(),
    apartment: text("apartment"),
    building: text("building"),
    directions: text("directions"),
    recipientFirstName: text("recipient_first_name"),
    recipientLastName: text("recipient_last_name"),
    recipientPhoneCountryCode: text("recipient_phone_country_code"),
    recipientPhone: text("recipient_phone"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customerIdx: index("customer_addresses_customer_idx").on(t.customerId),
    // Enforce at most one default per customer at the DB level.
    defaultIdx: uniqueIndex("customer_addresses_default_idx")
      .on(t.customerId)
      .where(sql`${t.isDefault} = true`),
  }),
);

export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
export type InsertCustomerAddress = typeof customerAddressesTable.$inferInsert;
