import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Stores Klarna checkout sessions so the Stripe webhook can drive order state
 * transitions and create the WooCommerce order authoritatively when the
 * shopper's browser is no longer open.
 *
 * Lifecycle:
 *   "pending"           — record created by POST /checkout/klarna-pending just
 *                         before the frontend calls stripe.confirmPayment and
 *                         the user is redirected to Klarna. The orderPayload is
 *                         persisted here so the webhook can finalize the order
 *                         even after a server restart or browser close.
 *   "payment_succeeded" — payment_intent.succeeded webhook received; the
 *                         webhook handler has also submitted the WC order and
 *                         written wooOrderRef.
 *   "payment_failed"    — payment_intent.payment_failed webhook received.
 *   "payment_canceled"  — payment_intent.canceled webhook received.
 *
 * The record is keyed by orderId (PK) with a unique index on piId so the
 * webhook handler can look it up by Stripe PaymentIntent ID efficiently.
 */
export const klarnaPendingCheckoutsTable = pgTable(
  "klarna_pending_checkouts",
  {
    orderId: text("order_id").primaryKey(),
    piId: text("pi_id").notNull(),
    status: text("status").notNull().default("pending"),
    /**
     * Serialised order payload from buildOrderPayload() on the frontend.
     * Saved at POST /checkout/klarna-pending time so the webhook can call
     * /api/woo/order without needing the shopper's browser session.
     */
    orderPayload: jsonb("order_payload"),
    /**
     * WooCommerce / OS order reference written by the payment_intent.succeeded
     * webhook handler after it successfully creates the WC order. The
     * GET /stripe/payment-status polling endpoint returns this field so the
     * browser can transition to the success state without calling /woo/order
     * client-side.
     */
    wooOrderRef: varchar("woo_order_ref", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    piIdIdx: uniqueIndex("klarna_pending_checkouts_pi_id_idx").on(t.piId),
    statusIdx: index("klarna_pending_checkouts_status_idx").on(t.status),
    createdAtIdx: index("klarna_pending_checkouts_created_at_idx").on(t.createdAt),
  }),
);

export type KlarnaPendingCheckout = typeof klarnaPendingCheckoutsTable.$inferSelect;
export type InsertKlarnaPendingCheckout = typeof klarnaPendingCheckoutsTable.$inferInsert;
