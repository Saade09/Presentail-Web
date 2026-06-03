import {
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

// Saved occasions (birthdays, anniversaries, etc.) owned by a customer.
// month and day are stored as integers (1-12, 1-31) so querying upcoming
// dates is straightforward without a year column.
export const customerOccasionsTable = pgTable(
  "customer_occasions",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    personName: text("person_name"),
    label: text("label").notNull(),
    month: smallint("month").notNull(),
    day: smallint("day").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customerIdx: index("customer_occasions_customer_idx").on(t.customerId),
  }),
);

export type CustomerOccasion = typeof customerOccasionsTable.$inferSelect;
export type InsertCustomerOccasion = typeof customerOccasionsTable.$inferInsert;
