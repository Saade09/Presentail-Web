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
  // Delivery context — only meaningful for Mamo/PayPal which include the
  // delivery fee in the charged total. Stripe sessions only cover product
  // subtotals; district/expressDelivery are still stored for audit purposes.
  district: string;
  expressDelivery: boolean;
  // True when the customer ticked the "I don't know the address" checkbox at
  // checkout. The charged delivery fee is the flat NO_ADDRESS_DELIVERY_FEE_USD
  // instead of the per-district fee. Stored so the WC order route can verify
  // the submitted order doesn't switch this flag after paying.
  noAddress?: boolean;
};

export type PaymentIntent = {
  orderId: string;
  paymentRef: string;
  provider: "stripe" | "mamo" | "paypal";
  // Which Stripe account was used to create this session/intent. "gulf" means
  // STRIPE_SECRET_KEY_GULF (used for KWD, OMR, AED); "main" means
  // STRIPE_SECRET_KEY. Undefined for non-Stripe providers.
  stripeAccount?: "main" | "gulf";
  // Canonical total in USD that the provider was instructed to charge.
  // For Stripe: product subtotal only (delivery is outside the session).
  // For Mamo/PayPal: product subtotal + district fee + express surcharge.
  totalUsd: number;
  // Authoritative cart snapshot from the catalog lookup at session-creation
  // time. The WC order route compares the submitted cart against this snapshot
  // before accepting the intent as proof of payment.
  snapshot: CartSnapshot;
  expiresAt: number; // ms
  consumed: boolean;
};

// keyed by paymentRef (provider session/link/order ID)
const store = new Map<string, PaymentIntent>();

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Remove entries that have expired. Called lazily on write.
function sweep(): void {
  const now = Date.now();
  for (const [key, intent] of store) {
    if (intent.expiresAt < now) store.delete(key);
  }
}

// Record a new payment intent. Called by the payment session creation routes
// immediately after the provider returns a session/link/order ID.
export function storePaymentIntent(params: {
  orderId: string;
  paymentRef: string;
  provider: "stripe" | "mamo" | "paypal";
  stripeAccount?: "main" | "gulf";
  totalUsd: number;
  snapshot: CartSnapshot;
}): void {
  sweep();
  store.set(params.paymentRef, {
    ...params,
    expiresAt: Date.now() + TTL_MS,
    consumed: false,
  });
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

// Options for snapshot verification. `deliveryContext` is required for
// providers that include delivery fees in the charged total (Mamo, PayPal).
// Stripe sessions cover product subtotals only, so delivery context is
// not applicable there.
export type SnapshotVerifyOptions = {
  // When true, also verify district and expressDelivery match the snapshot.
  // Set this for Mamo/PayPal where the full total (products + delivery) was
  // charged. Leave false for Stripe where delivery is billed separately.
  checkDelivery?: boolean;
  submittedDistrict?: string;
  submittedExpressDelivery?: boolean; // derived from body.expressFee > 0
  submittedNoAddress?: boolean;
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

  const snapshotMap = new Map<string, number>();
  for (const si of snapshot.items) {
    const key = si.wcId > 0 ? String(si.wcId) : (si.osSlug ?? String(si.wcId));
    snapshotMap.set(key, si.quantity);
  }

  for (const item of submitted) {
    const expected = snapshotMap.get(item.key);
    if (expected === undefined) {
      return `Product ${item.key} was not part of the paid-for cart`; // i18n-ignore
    }
    if (item.quantity !== expected) {
      return `Quantity mismatch for product ${item.key}: submitted ${item.quantity}, paid for ${expected}`; // i18n-ignore
    }
  }

  // For Mamo/PayPal the full total (including delivery) is charged up front.
  // Verify the delivery context matches so the customer cannot pay for a cheap
  // delivery zone (e.g., Beirut/no express) and then finalise the order with
  // an expensive one (e.g., Akkar/express) while still getting set_paid: true.
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
  }

  return null;
}

// Peek without consuming — used only in tests / diagnostics.
export function peekPaymentIntent(paymentRef: string): PaymentIntent | undefined {
  return store.get(paymentRef);
}
