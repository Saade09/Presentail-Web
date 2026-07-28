import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tracks CyberSource 3DS payer-authentication attempts so the backend can
 * complete the validate → authorize → order-create chain server-side, even
 * when the shopper's browser tab is closed mid-challenge.
 *
 * Lifecycle:
 *   "CREATED"          — attempt row created; cart_snapshot stored.
 *   "ENROLLED"         — enrollment check done; cs_authentication_transaction_id set.
 *   "CHALLENGE_OPENED" — challenge iframe/tab opened.
 *   "VALIDATED"        — validate step completed successfully.
 *   "AUTHORIZED"       — authorize+capture succeeded; cs_request_id set.
 *   "ORDER_CREATED"    — Presentail / WC order created.
 *   "OS_SYNCED"        — OS order created (best-effort; may stay at ORDER_CREATED).
 *   "COMPLETED"        — order_id set; ready for redirect.
 *   "FAILED"           — terminal failure; error_details populated.
 *
 * Idempotency: unique DB constraints on attempt_id, cs_authentication_transaction_id,
 * and cs_request_id prevent duplicate authorizations when the complete endpoint
 * is called more than once.
 */
export const csPaymentAttemptsTable = pgTable(
  "cs_payment_attempts",
  {
    // Opaque UUID returned to the client — the only handle stored client-side.
    attemptId: text("attempt_id").primaryKey(),
    // Presentail order ID (e.g. "LB-1042"). Set during order creation.
    orderId: text("order_id"),
    // Presentail OS order UUID. Set after OS sync.
    osOrderId: text("os_order_id"),
    /**
     * Full checkout payload needed to re-create the order server-side,
     * plus the transient CyberSource Microform JWT for the authorize call.
     * Shape: CsAttemptCartSnapshot (see types below).
     * Stored as JSONB so it can be queried and updated atomically.
     */
    cartSnapshot: jsonb("cart_snapshot"),
    // FK to customers table (nullable for guest orders).
    customerId: text("customer_id"),
    // Guest session identifier (nullable for authenticated orders).
    guestSessionId: text("guest_session_id"),
    // Server-authoritative amount in "45.00" format.
    amount: text("amount").notNull(),
    // ISO 4217 currency code, always "USD" for CyberSource LB flow.
    currency: text("currency").notNull(),
    // Cardinal Commerce / CyberSource authentication transaction ID.
    // Set during enrollment; used to look up the attempt from the return URL.
    csAuthenticationTransactionId: text("cs_authentication_transaction_id"),
    // CyberSource requestId from the authorize+capture response.
    csRequestId: text("cs_request_id"),
    // See lifecycle states above.
    status: text("status").notNull().default("CREATED"),
    // Serialised error info on FAILED attempts.
    errorDetails: jsonb("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // attemptId is already the PK; the index is implicit.
    csAuthTxnIdx: uniqueIndex("cs_payment_attempts_cs_auth_txn_idx").on(
      t.csAuthenticationTransactionId,
    ),
    csRequestIdx: uniqueIndex("cs_payment_attempts_cs_request_id_idx").on(
      t.csRequestId,
    ),
    statusIdx: index("cs_payment_attempts_status_idx").on(t.status),
    createdAtIdx: index("cs_payment_attempts_created_at_idx").on(t.createdAt),
  }),
);

export type CsPaymentAttempt = typeof csPaymentAttemptsTable.$inferSelect;
export type InsertCsPaymentAttempt = typeof csPaymentAttemptsTable.$inferInsert;

/**
 * Shape of the cartSnapshot JSONB column.
 * Contains everything the backend needs to re-run the full charge + order
 * creation chain without any further client interaction.
 */
export type CsAttemptCartSnapshot = {
  // Short-lived CyberSource Microform JWT (stored server-side only).
  transientTokenJwt: string;
  // Server-computed charge amount (mirrors the charge endpoint).
  totalAmount: string;
  currency: string;

  // Full WooOrderPayload-compatible order fields ──────────────────────────
  appOrderId: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    wcId?: number;
    osSlug?: string;
    customInput?: string;
  }>;
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  recipient: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  district: string;
  cityId?: string;
  districtFee: number;
  expressFee: number;
  slotFee?: number;
  noAddress?: boolean;
  billingCountry?: string;
  shippingCountry?: string;
  deliveryDetails: string;
  deliveryDate: string;
  deliverySlot: string;
  deliverySlotId?: string;
  cardMessage?: string;
  cardFrom?: string;
  cardTo?: string;
  qrLink?: string;
  orderNotes?: string;
  /** Shopper's "keep my identity secret" preference — must round-trip faithfully. */
  identitySecret?: boolean;
  paymentMethod: string;
  currencyCode?: string;
  couponCode?: string;
  occasion_ref?: string;
  marketing_attribution?: Record<string, unknown>;
  platform?: string;
};
