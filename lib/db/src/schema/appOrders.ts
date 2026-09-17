import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const appOrdersTable = pgTable(
  "app_orders",
  {
    id: serial("id").primaryKey(),
    appOrderId: text("app_order_id").notNull(),
    wcOrderId: integer("wc_order_id"),
    userId: integer("user_id"),
    customerId: integer("customer_id").references(() => customersTable.id, {
      onDelete: "set null",
    }),
    deviceId: text("device_id"),
    recipientName: text("recipient_name"),
    deliveryDate: text("delivery_date"),
    deliverySlot: text("delivery_slot"),
    state: text("state").notNull().default("confirmed"),
    // Source platform that placed the order ("ios" / "android" / "web" / null
    // for legacy rows). Used to break revenue down per platform on the admin
    // funnel dashboard alongside the analytics-event counts.
    platform: text("platform"),
    // Authoritative order total in USD cents (catalog subtotal + delivery fee
    // + express surcharge + non-catalog fee items). Retained for USD-based
    // revenue reporting and cross-currency comparisons.
    // Nullable for legacy rows created before the column existed.
    totalUsdCents: integer("total_usd_cents"),
    // Order total in the currency the customer actually paid (minor units —
    // cents for SAR/AED/USD, fils for KWD). Paired with currency_code.
    // Null for legacy rows or orders where currency could not be determined.
    totalPaymentCents: integer("total_payment_cents"),
    // Canonical store key the order was placed against
    // (lebanon|dubai|abudhabi|cyprus). Required for loyalty crediting because
    // Dubai and Abu Dhabi share country code AE — using the country alone
    // would let their wcOrderIds collide. Nullable for legacy rows.
    storeKey: text("store_key"),
    // Billing phone (E.164) of the person who placed the order. Stored so
    // the SMS/WhatsApp delivery-update notifier can reach the sender without
    // a round-trip to WooCommerce. Nullable for legacy rows and guest orders
    // where no phone was captured.
    senderPhone: text("sender_phone"),
    // Presentail OS order id (UUID) returned by POST /api/orders. Nullable for
    // legacy rows created before OS order submission was wired up, and for rows
    // created during the startup window before OS is available.
    osOrderId: text("os_order_id"),
    // JSON-serialised snapshot of order line items at the time of placement.
    // Shape: [{name: string, quantity: number, priceUsdCents: number}]
    // Populated for OS-path orders (mobile + web checkout since Phase 3).
    // Null for legacy rows created before this column existed.
    lineItemsJson: text("line_items_json"),
    // ── Extended fields (added for full order audit trail) ──────────────────
    // Full name of the person who placed the order (billing first + last name).
    senderName: text("sender_name"),
    // Email address of the sender (billing email). Used for order confirmation
    // emails and customer lookup.
    senderEmail: text("sender_email"),
    // Phone number of the recipient (E.164 when available). Stored separately
    // from recipientName so delivery ops can contact the recipient directly.
    recipientPhone: text("recipient_phone"),
    // Delivery district / area name (e.g. "Beirut", "Hamra"). Kept separate
    // from deliveryAddress so reports can group orders by district.
    deliveryDistrict: text("delivery_district"),
    // Free-text delivery address as entered by the shopper. Null when the
    // shopper ticked "I don't know the address".
    deliveryAddress: text("delivery_address"),
    // Payment method used: card | wallet | whish | western | mamo | paypal.
    paymentMethod: text("payment_method"),
    // ISO 4217 currency code the shopper actually paid in (e.g. "SAR", "AED",
    // "USD"). Taken from the Stripe / Mamo / PayPal charge record rather than
    // the store default so mixed-currency orders (a LB shopper paying in SAR
    // via Apple Pay) are recorded correctly. Nullable for legacy rows.
    currencyCode: text("currency_code"),
    // Whether the sender opted in to transactional WhatsApp order/delivery
    // updates at checkout ("Get order updates on WhatsApp"). The target number
    // is sender_phone. Null for legacy rows / clients that never sent the flag
    // (mobile app); false when the shopper explicitly unchecked the box.
    whatsappOptIn: boolean("whatsapp_opt_in"),
    // Coupon code applied at checkout (trimmed, uppercase). Null when no coupon
    // was applied.
    couponCode: text("coupon_code"),
    // Card / gift message text. Null when the shopper left it blank.
    cardMessage: text("card_message"),
    // JSON-serialised marketing attribution snapshot at order placement time.
    // Stored as a local fallback so attribution is never lost even if the OS
    // rejects or ignores the metadata field. Shape mirrors MarketingAttribution
    // from openapi.yaml: { source, first_touch, last_touch, conversion }.
    marketingAttributionJson: text("marketing_attribution_json"),
    // Occasion slug that triggered this order journey, set when the shopper
    // navigated to /occasion/:slug before reaching checkout. Read from the
    // client-side sessionStorage key ps_occasion_ref (cleared after checkout).
    // Null for orders where no occasion link was followed, or legacy rows.
    occasionRef: text("occasion_ref"),
    // Timestamp of the first Google Ads click-conversion upload attempt for
    // this order. Set to NOW() after the first upload attempt (success or
    // failure) to prevent duplicate uploads when OS sends the confirmed
    // webhook more than once (retry, re-confirmation, or order edit).
    // Null for orders placed before this column existed or orders with no
    // Google Ads click ID in their attribution.
    gadsConversionUploadedAt: timestamp("gads_conversion_uploaded_at", {
      withTimezone: true,
    }),
    // Stripe PaymentIntent id (pi_…) for orders paid via Stripe (card, Apple
    // Pay, Google Pay, Klarna). Null for non-Stripe payment methods (Mamo,
    // PayPal, Whish, Western Union) and legacy rows.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // Stripe Charge id (ch_…) for orders paid via Stripe. Populated from
    // the PI's latest_charge field when the webhook fires. Null for non-Stripe
    // payment methods, uncaptured PIs, and legacy rows.
    stripeChargeId: text("stripe_charge_id"),
    // Timestamp of the first Meta Conversions API Purchase event sent for this
    // order. Set to NOW() before the CAPI call so that concurrent or replayed
    // webhooks that produce the same appOrderId can detect the already-claimed
    // slot and skip sending — preventing duplicate Purchase events on Meta.
    // Null for orders placed before this column existed.
    capiPurchaseSentAt: timestamp("capi_purchase_sent_at", {
      withTimezone: true,
    }),
    // ── Premium Midnight Delivery fields (task 3943) ─────────────────────────
    // Canonical city identifier for the delivery (e.g. "lb-beirut", "lb-metn").
    // Stored separately from deliveryDistrict (district name) so midnight
    // eligibility and per-city fee rules can be enforced without string parsing.
    // Null for legacy rows and orders where cityId was not captured.
    deliveryCityId: text("delivery_city_id"),
    // ISO 3166-1 alpha-2 uppercase country code (e.g. "LB", "AE").
    // Normalised from shippingCountry at order creation. Null for legacy rows.
    deliveryCountryCode: text("delivery_country_code"),
    // Stable OS-assigned slot identifier (e.g. "midnight-2300-0100").
    // Required for Midnight premium service; used for audit and billing checks.
    // Null for standard slots, express delivery, and legacy rows.
    deliverySlotId: text("delivery_slot_id"),
    // Fulfillment service marker: "midnight" or null for standard/express.
    // Never inferred from label — set only when serviceType="midnight" from OS.
    deliveryServiceType: text("delivery_service_type"),
    // Midnight slot surcharge in USD cents. Exactly 2000 ($20.00) for every
    // Midnight order; 0 or null for standard slots (slotFee waived by free
    // delivery never removes this when the OS slot has an explicit extraFee).
    // Null for legacy rows created before this column existed.
    deliverySlotFeeCents: integer("delivery_slot_fee_cents"),
    // UTC ISO timestamp for the start of the delivery window
    // (e.g. "2026-06-18T21:00:00.000Z" for a 23:00 Beirut Midnight window).
    // For Midnight: 23:00 on deliveryDate in Asia/Beirut.
    // Null for express orders, standard slots without hours, and legacy rows.
    deliveryWindowStart: timestamp("delivery_window_start", {
      withTimezone: true,
    }),
    // UTC ISO timestamp for the end of the delivery window
    // (e.g. "2026-06-18T22:00:00.000Z" for a Midnight 01:00 Beirut window).
    // Null for express orders and legacy rows.
    deliveryWindowEnd: timestamp("delivery_window_end", {
      withTimezone: true,
    }),
    // ── Policy acceptance audit fields ──────────────────────────────────────
    // UTC timestamp of when the shopper accepted the applicable policy at
    // checkout. Server-stamped at payment-session creation; never client-supplied.
    // Null for historical rows placed before this column was added.
    policyAcceptedAt: timestamp("policy_accepted_at", { withTimezone: true }),
    // Real client IP derived from the trusted x-forwarded-for chain at
    // payment-session creation. Null for historical rows.
    policyAcceptedIp: text("policy_accepted_ip"),
    // Explicit policy version string (e.g. "cy-v1") agreed to by the shopper.
    // Null for historical rows placed before policy acceptance was required.
    policyVersion: text("policy_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appOrderIdx: uniqueIndex("app_orders_app_order_idx").on(t.appOrderId),
    wcOrderIdx: index("app_orders_wc_order_idx").on(t.wcOrderId),
    userIdx: index("app_orders_user_idx").on(t.userId),
    customerIdx: index("app_orders_customer_idx").on(t.customerId),
  }),
);

export type AppOrder = typeof appOrdersTable.$inferSelect;
export type InsertAppOrder = typeof appOrdersTable.$inferInsert;
