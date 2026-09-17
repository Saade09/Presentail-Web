// Server-side payment intent store.
//
// When the server creates a payment session (Stripe, Mamo, PayPal), it records
// an intent that binds:
//   - the app's order ID to the provider's session/link/order ID (paymentRef)
//   - a canonical cart snapshot (resolved wcId+quantity+priceUsd pairs, district,
//     expressDelivery) that was used to compute the charged amount
//
// Before finalising a WooCommerce order the route handler calls
// `consumePaymentIntent` to:
//   1. Assert the paymentRef was legitimately created for this specific orderId
//   2. Return the stored snapshot so the route can verify the submitted cart
//      matches the paid-for cart exactly (closes the payment/order mismatch gap)
//   3. Enforce single-use semantics so a paid session cannot be replayed to
//      fulfil a second (higher-value) order
//
// Storage: in-memory map with a 2-hour TTL. This is sufficient for the
// single-instance deployment model; intents that survive a server restart
// will require the customer to re-initiate checkout (the payment session
// itself is still valid with the provider).

export type CartSnapshot = {
  // Resolved catalog items: wcId, quantity, and the catalog price at session-
  // creation time. The WC order route verifies the submitted cart's wcId+quantity
  // pairs match this snapshot exactly.
  items: { wcId: number; osSlug?: string; quantity: number; priceUsd: number }[];
  // Delivery context — all Stripe sessions (both PaymentIntent and hosted
  // Checkout Session) now include delivery fees in the charged total.
  // These fields are verified at finalization so delivery params cannot be
  // swapped after payment.
  district: string;
  expressDelivery: boolean;
  // True when the customer ticked the "I don't know the address" checkbox at
  // checkout. The delivery fee is the same as a regular order; the flag is
  // stored so the WC order route can verify the submitted order doesn't
  // switch it after paying.
  noAddress?: boolean;
  // The delivery slot label selected at checkout (e.g. "Morning 9am-1pm").
  // Non-empty only when the shopper picked a premium slot that has an extraFee.
  // Verified at finalization so a free-slot payment cannot be upgraded to a
  // fee-slot on the order submission.
  deliverySlot?: string;
  /** Canonical OS delivery identity bound to the paid amount. */
  deliveryCityId?: string;
  deliveryDate?: string;
  deliverySlotId?: string;
  deliveryServiceType?: "midnight";
  // Server-computed fee breakdown (USD) at payment-session creation time.
  // Stored so wooOrders.ts can use the exact same fees rather than re-computing
  // from the OS cache (which may have changed since the session was created).
  // Absent for snapshots written before this field was introduced — callers must
  // fall through to the OS-cache re-computation path when these are undefined.
  districtFeeUsd?: number;
  expressFeeUsd?: number;
  slotFeeUsd?: number;
  // Coupon applied at payment-session creation time. Stored so /woo/order can
  // include the exact coupon code and discount that was applied to the charge,
  // preventing over-charge on discounted orders (e.g. CyberSource).
  couponDiscountUsd?: number;
  couponCode?: string;
  /** OS-validated coupon ID. Absent for referral codes (no OS record), FIRST10 uses sentinel "first-order-10", and regular coupons carry the OS numeric ID. Snapshots written before this field was introduced will have it absent. */
  couponId?: string | number;
  // ── Policy acceptance audit snapshot ──────────────────────────────────────
  // Stored here so webhooks, redirect-return handlers, and idempotent replays
  // can finalize the same audit record without re-parsing the original request.
  /** Policy version string accepted by the shopper (e.g. "cy-v1"). Absent when not required. */
  policyVersion?: string;
  /** Server-derived client IP at payment-session creation. Absent when not required. */
  policyAcceptedIp?: string;
  /** Server-stamped ISO timestamp of policy acceptance. Absent when not required. */
  policyAcceptedAt?: string;
};

export type PaymentIntent = {
  orderId: string;
  paymentRef: string;
  provider: "stripe" | "mamo" | "paypal" | "tabby" | "cybersource";
  // Which Stripe account was used: "main" (CY) or "gulf" (AE).
  stripeAccount?: "main" | "gulf";
  // The exact currency the provider was instructed to charge (e.g. "QAR",
  // "AED", "USD"). For Stripe this is the currency passed to the PI/session
  // create call; for Mamo it is always "AED"; for PayPal it is the settled
  // currency returned by paypalCurrencyFor(). Used by the order route to
  // send the correct currencyCode to Presentail OS.
  currency: string;
  // Canonical total in USD that the provider was instructed to charge.
  // For Stripe: product subtotal only (delivery is outside the session).
  // For Mamo/PayPal: product subtotal + district fee + express surcharge.
  totalUsd: number;
  // Authoritative cart snapshot from the catalog lookup at session-creation
  // time. The WC order route compares the submitted cart against this snapshot
  // before accepting the intent as proof of payment.
  snapshot: CartSnapshot;
  // Optional provider-side payment metadata stored alongside the intent (and
  // therefore alongside the order it finalizes). Never card data or secrets.
  paymentMeta?: Record<string, string | number | boolean | null | undefined>;
  expiresAt: number; // ms
  consumed: boolean;
};

// keyed by paymentRef (provider session/link/order ID)
const store = new Map<string, PaymentIntent>();

// Secondary index: orderId → paymentRef, so we can look up the existing
// PaymentIntent for a given order without scanning the full store.
const orderIndex = new Map<string, string>();

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — long enough to survive most server restarts and cover slow shoppers

// Remove entries that have expired. Called lazily on write.
function sweep(): void {
  const now = Date.now();
  for (const [key, intent] of store) {
    if (intent.expiresAt < now) {
      store.delete(key);
      orderIndex.delete(intent.orderId);
    }
  }
}

// Record a new payment intent. Called by the payment session creation routes
// immediately after the provider returns a session/link/order ID.
export function storePaymentIntent(params: {
  orderId: string;
  paymentRef: string;
  provider: "stripe" | "mamo" | "paypal" | "tabby" | "cybersource";
  stripeAccount?: "main" | "gulf";
  /** The exact currency the provider was charged in (e.g. "QAR", "AED", "USD"). */
  currency: string;
  totalUsd: number;
  snapshot: CartSnapshot;
  /** Optional safe provider metadata persisted with the intent (see PaymentIntent.paymentMeta). */
  paymentMeta?: Record<string, string | number | boolean | null | undefined>;
}): void {
  sweep();
  // If there was a previous paymentRef for this orderId (e.g. the PI was
  // updated and Stripe issued a new id, or a prior intent is being replaced),
  // remove the old store entry before writing the new one.
  const prevRef = orderIndex.get(params.orderId);
  if (prevRef && prevRef !== params.paymentRef) {
    store.delete(prevRef);
  }
  store.set(params.paymentRef, {
    ...params,
    expiresAt: Date.now() + TTL_MS,
    consumed: false,
  });
  orderIndex.set(params.orderId, params.paymentRef);
}

// Return the paymentRef stored for a given orderId, or undefined when none
// exists. Used by the /checkout/payment-intent route to implement idempotency:
// if a PI was already created for this orderId, retrieve and potentially reuse
// it instead of unconditionally calling stripe.paymentIntents.create.
export function getPaymentIntentForOrder(orderId: string): string | undefined {
  const paymentRef = orderIndex.get(orderId);
  if (!paymentRef) return undefined;
  const intent = store.get(paymentRef);
  if (!intent || intent.expiresAt < Date.now()) {
    orderIndex.delete(orderId);
    if (intent) store.delete(paymentRef);
    return undefined;
  }
  return paymentRef;
}

// Verify and atomically consume a payment intent.
//
// Returns the intent (including the cart snapshot) on success; returns null when:
//   - no intent exists for this paymentRef
//   - the intent's orderId does not match the supplied orderId
//   - the intent has already been consumed (replay prevention)
//   - the intent has expired
//
// A consumed intent remains in the store (marked consumed) for the duration of
// its TTL so replays return null rather than "not found".
export function consumePaymentIntent(
  paymentRef: string,
  orderId: string,
): PaymentIntent | null {
  const intent = store.get(paymentRef);
  if (!intent) return null;
  if (intent.expiresAt < Date.now()) {
    store.delete(paymentRef);
    return null;
  }
  if (intent.consumed) return null;
  if (intent.orderId !== orderId) return null;
  intent.consumed = true;
  return intent;
}

// Options for snapshot verification. All Stripe and Mamo/PayPal flows now
// include delivery fees in the charged total, so checkDelivery should always
// be true. It remains a flag so legacy snapshots (district:"") can still be
// matched against submitted orders that also have no delivery context.
export type SnapshotVerifyOptions = {
  // When true, also verify district, expressDelivery, noAddress, and deliverySlot
  // match the snapshot. Set to true for all payment-verified flows.
  checkDelivery?: boolean;
  submittedDistrict?: string;
  submittedExpressDelivery?: boolean; // derived from body.expressFee > 0
  submittedNoAddress?: boolean;
  // The delivery slot label from the /woo/order body (body.deliverySlot).
  submittedDeliverySlot?: string;
  submittedDeliveryCityId?: string;
  submittedDeliveryDate?: string;
  submittedDeliverySlotId?: string;
  submittedDeliveryServiceType?: "midnight";
};

// Verify that a submitted cart (from the /woo/order body) matches the cart
// snapshot stored in the payment intent. This closes the payment/order mismatch
// gap: a client cannot pay for a cheap cart and then submit an expensive one.
//
// Comparison rules (always):
//   - Same set of products (keyed by wcId when > 0, otherwise by osSlug)
//   - Same quantity for each product
//
// Additional rules when checkDelivery is true:
//   - Same district (delivery zone)
//   - Same express-delivery flag
//
// Returns null on success, or a human-readable rejection reason on mismatch.
export function verifyCartMatchesSnapshot(
  submittedItems: { wcId?: number; osSlug?: string; quantity: number }[],
  snapshot: CartSnapshot,
  opts: SnapshotVerifyOptions = {},
): string | null {
  // Catalog items: those with wcId > 0 OR an osSlug (OS-native products).
  const submitted = submittedItems
    .filter((i) => (i.wcId != null && i.wcId > 0) || !!i.osSlug)
    .map((i) => ({
      key: i.wcId != null && i.wcId > 0 ? String(i.wcId) : i.osSlug!,
      quantity: i.quantity,
    }));

  if (submitted.length !== snapshot.items.length) {
    return `Cart item count mismatch: submitted ${submitted.length}, paid for ${snapshot.items.length}`; // i18n-ignore
  }

  // Keep every paid line for a key instead of collapsing the snapshot to one
  // value. A Map<string, number> lets the same paid line satisfy multiple
  // submitted lines, so [cheap, expensive] could incorrectly become
  // [expensive, expensive]. Matching consumes one quantity from the remaining
  // paid lines for each submitted item.
  const snapshotQuantities = new Map<string, number[]>();
  for (const si of snapshot.items) {
    const key = si.wcId > 0 ? String(si.wcId) : (si.osSlug ?? String(si.wcId));
    const quantities = snapshotQuantities.get(key);
    if (quantities) {
      quantities.push(si.quantity);
    } else {
      snapshotQuantities.set(key, [si.quantity]);
    }
  }

  for (const item of submitted) {
    const remainingQuantities = snapshotQuantities.get(item.key);
    if (!remainingQuantities) {
      return `Product ${item.key} was not part of the paid-for cart`; // i18n-ignore
    }
    if (remainingQuantities.length === 0) {
      return `Product ${item.key} was submitted more times than it was paid for`; // i18n-ignore
    }

    const matchingIndex = remainingQuantities.indexOf(item.quantity);
    if (matchingIndex === -1) {
      return `Quantity mismatch for product ${item.key}: submitted ${item.quantity}, paid for ${remainingQuantities.join(", ")}`; // i18n-ignore
    }
    remainingQuantities.splice(matchingIndex, 1);
  }

  // Delivery context is charged in full for all Stripe, Mamo, and PayPal flows.
  // Verify it matches so delivery cannot be swapped to a higher-cost option
  // after payment (e.g. cheap district → expensive one, no-slot → premium slot).
  if (opts.checkDelivery) {
    if (
      opts.submittedDistrict !== undefined &&
      opts.submittedDistrict !== snapshot.district
    ) {
      return `District mismatch: submitted "${opts.submittedDistrict}", paid for "${snapshot.district}"`; // i18n-ignore
    }
    if (
      opts.submittedExpressDelivery !== undefined &&
      opts.submittedExpressDelivery !== snapshot.expressDelivery
    ) {
      return `Express delivery mismatch: submitted ${opts.submittedExpressDelivery}, paid for ${snapshot.expressDelivery}`; // i18n-ignore
    }
    if (
      opts.submittedNoAddress !== undefined &&
      opts.submittedNoAddress !== (snapshot.noAddress === true)
    ) {
      return `No-address flag mismatch: submitted ${opts.submittedNoAddress}, paid for ${snapshot.noAddress === true}`; // i18n-ignore
    }
    // Verify the delivery slot: a shopper cannot pay for a free/cheap slot and
    // then submit an order with a premium slot (or vice versa).
    const snapshotSlot = snapshot.deliverySlot ?? "";
    const submittedSlot = opts.submittedDeliverySlot ?? "";
    if (snapshotSlot !== submittedSlot) {
      return `Delivery slot mismatch: submitted "${submittedSlot}", paid for "${snapshotSlot}"`; // i18n-ignore
    }
    if (
      snapshot.deliveryCityId !== undefined &&
      (opts.submittedDeliveryCityId ?? "") !== snapshot.deliveryCityId
    ) {
      return `Delivery city mismatch: submitted "${opts.submittedDeliveryCityId ?? ""}", paid for "${snapshot.deliveryCityId}"`; // i18n-ignore
    }
    if (
      snapshot.deliveryDate !== undefined &&
      (opts.submittedDeliveryDate ?? "") !== snapshot.deliveryDate
    ) {
      return `Delivery date mismatch: submitted "${opts.submittedDeliveryDate ?? ""}", paid for "${snapshot.deliveryDate}"`; // i18n-ignore
    }
    if (
      snapshot.deliverySlotId !== undefined &&
      (opts.submittedDeliverySlotId ?? "") !== snapshot.deliverySlotId
    ) {
      return `Delivery slot ID mismatch: submitted "${opts.submittedDeliverySlotId ?? ""}", paid for "${snapshot.deliverySlotId}"`; // i18n-ignore
    }
    if (
      snapshot.deliveryServiceType !== undefined &&
      opts.submittedDeliveryServiceType !== snapshot.deliveryServiceType
    ) {
      return `Delivery service mismatch: submitted "${opts.submittedDeliveryServiceType ?? ""}", paid for "${snapshot.deliveryServiceType}"`; // i18n-ignore
    }
  }

  return null;
}

// Peek without consuming — used only in tests / diagnostics.
export function peekPaymentIntent(paymentRef: string): PaymentIntent | undefined {
  return store.get(paymentRef);
}

// Validate a payment intent (orderId binding + consumed + expiry checks) but do
// NOT mark it consumed. Used by payment flows that want retry-safe finalization:
// the caller validates the intent before the downstream write, then calls
// markPaymentIntentConsumed after the write succeeds. If the write fails, the
// intent remains valid and the client can safely retry.
//
// Returns the intent on success; returns null using the same conditions as
// consumePaymentIntent (not found, orderId mismatch, already consumed, expired).
export function peekAndValidatePaymentIntent(
  paymentRef: string,
  orderId: string,
): PaymentIntent | null {
  const intent = store.get(paymentRef);
  if (!intent) return null;
  if (intent.expiresAt < Date.now()) {
    store.delete(paymentRef);
    return null;
  }
  if (intent.consumed) return null;
  if (intent.orderId !== orderId) return null;
  return intent;
}

// Mark a previously validated intent as consumed. Called after a successful
// order write so the single-use invariant is enforced without blocking retries
// on transient downstream failures. A no-op when the intent does not exist
// (already consumed or expired — both indicate the order already went through).
export function markPaymentIntentConsumed(paymentRef: string): void {
  const intent = store.get(paymentRef);
  if (intent && !intent.consumed) {
    intent.consumed = true;
  }
}

// Release a previously consumed intent back to an unconsumed state.
//
// Used exclusively by the CyberSource finalization path to enable retry-safe
// atomicity: `consumePaymentIntent` is called first to atomically claim the
// single-use slot (preventing concurrent duplicate submissions), then the
// downstream OS write is attempted. If the write fails with a retryable error,
// `releasePaymentIntent` un-claims the slot so the shopper can retry.
//
// Node.js's single-threaded event loop makes `consumePaymentIntent` an atomic
// synchronous claim: two concurrent requests cannot both see `consumed:false`
// in the synchronous check, so only one will get the intent. If that request
// later fails before the write, releasing allows the shopper to retry without
// starting the payment over.
//
// IMPORTANT: Call release ONLY when the downstream write has definitively
// failed (not on network-timeout ambiguity, where the write may have
// succeeded). For ambiguous failures, leave the intent consumed and rely on
// the pending-order reconciliation queue, matching the behavior for Stripe /
// Mamo / PayPal today.
export function releasePaymentIntent(paymentRef: string): void {
  const intent = store.get(paymentRef);
  if (intent && intent.consumed) {
    intent.consumed = false;
  }
}
