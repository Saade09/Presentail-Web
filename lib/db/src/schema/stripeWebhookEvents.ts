import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Idempotency log for Stripe webhook events. Each event is inserted once
 * (keyed on stripeEventId) so re-delivered events are silently skipped.
 * Covers both Stripe accounts (main LB/CY and gulf AE).
 *
 * DB-backed deduplication survives server restarts — required now that
 * handlers perform state transitions (klarna_pending_checkouts updates).
 *
 * Retention: rows older than 72 hours can be purged (Stripe's retry window).
 */
export const stripeWebhookEventsTable = pgTable(
  "stripe_webhook_events",
  {
    id: serial("id").primaryKey(),
    // Stripe's unique event identifier (evt_…). Used as the idempotency key.
    stripeEventId: text("stripe_event_id").notNull().unique(),
    // Which Stripe account received this event: "main" or "gulf".
    stripeAccount: text("stripe_account").notNull(),
    // e.g. payment_intent.succeeded, charge.dispute.created
    eventType: text("event_type").notNull(),
    // pi_… identifier when present in the event object.
    paymentIntentId: text("payment_intent_id"),
    // ch_… identifier when present (from charge events or PI's latest_charge).
    chargeId: text("charge_id"),
    // App order id (app_orders.app_order_id) extracted from PI metadata.orderId.
    appOrderId: text("app_order_id"),
    // ISO 8601 timestamp of when we finished processing the event.
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Error message when processing failed — null on success.
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    eventIdIdx: index("swe_event_id_idx").on(t.stripeEventId),
    orderIdx: index("swe_order_id_idx").on(t.appOrderId),
    createdAtIdx: index("swe_created_at_idx").on(t.createdAt),
  }),
);

export type StripeWebhookEvent = typeof stripeWebhookEventsTable.$inferSelect;
export type InsertStripeWebhookEvent =
  typeof stripeWebhookEventsTable.$inferInsert;
