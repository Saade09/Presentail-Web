import { bigint, pgTable, text } from "drizzle-orm/pg-core";

export const orderIdSequencesTable = pgTable("order_id_sequences", {
  prefix: text("prefix").primaryKey(),
  nextVal: bigint("next_val", { mode: "number" }).notNull().default(1000),
});

export type OrderIdSequence = typeof orderIdSequencesTable.$inferSelect;
