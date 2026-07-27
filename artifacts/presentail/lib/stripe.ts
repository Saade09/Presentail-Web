import Constants from "expo-constants";

// Production API base — used by all native (TestFlight / App Store) builds.
// Hardcoded so OTA updates never end up with an empty URL even when
// EXPO_PUBLIC_API_BASE_URL isn't passed during `eas update` bundling.
const PRODUCTION_API_BASE = "https://lebanon-luxury-showcase.replit.app";

// Stripe publishable key for inline card payments via @stripe/stripe-react-native.
//
// For development / Expo Go: set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…)
// as a Replit secret. It is inlined into the JS bundle at Metro bundling time.
//
// For TestFlight / App Store binaries: register the live key (pk_live_…) as an
// EAS project-level secret so it is inlined at EAS build time, not OTA update
// time. Run once per Expo project:
//
//   eas secret:create \
//     --scope project \
//     --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY \
//     --value pk_live_... \
//     --type string
//
// Falls back to an empty string so StripeProvider renders without crashing;
// confirmPayment will fail with a clear Stripe error if the key is absent.
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

// Gulf Stripe publishable key — used for AED (UAE) payments.
// Register as an EAS project-level secret (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_GULF)
// so it is inlined at EAS build time for TestFlight / App Store binaries.
export const STRIPE_PUBLISHABLE_KEY_GULF =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_GULF ?? "";

/**
 * Return the Stripe publishable key for the given currency.
 * AED (UAE) orders are routed to the Gulf Stripe account; all other
 * currencies use the main CY account.
 */
export function getStripePublishableKey(currency?: string): string {
  if (currency === "AED") {
    return STRIPE_PUBLISHABLE_KEY_GULF || STRIPE_PUBLISHABLE_KEY;
  }
  return STRIPE_PUBLISHABLE_KEY;
}

const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
const domain = process.env.EXPO_PUBLIC_DOMAIN;

const inferred = (() => {
  if (explicit) return explicit;
  if (domain) return `https://${domain}`;
  const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest?.hostUri;
  if (hostUri) {
    const host = String(hostUri).split(":")[0];
    return `http://${host}:3000`;
  }
  // Fall back to the production API for any non-dev native bundle so OTA
  // updates without env vars don't break.
  return PRODUCTION_API_BASE;
})();

export const API_BASE = inferred;

// Emit a loud warning at startup so a missing or mismatched key is caught
// immediately in the Expo logs — before a shopper reaches the payment screen.
// Uses the resolved API_BASE (not just the raw env var) so the check is
// accurate even when EXPO_PUBLIC_API_BASE_URL is unset in a production build.
if (!STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "[Stripe] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. " +
      "Card payments will fail. " +
      "Set pk_test_… as a Replit secret for dev builds, " +
      "and register pk_live_… via `eas secret:create` for production builds.", // i18n-ignore
  );
} else if (
  STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_") &&
  !API_BASE.includes("replit.app")
) {
  console.warn(
    "[Stripe] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY looks like a test key (pk_test_…) " +
      "but this build is targeting a non-Replit API (" + API_BASE + "). " + // i18n-ignore
      "Register the live key (pk_live_…) via `eas secret:create` " +
      "so TestFlight and App Store binaries accept real card payments.", // i18n-ignore
  );
}

// Item passed to the Stripe checkout endpoint. Prices are resolved server-side
// from the WooCommerce catalog using wcId — never trust a client-supplied amount.
export type CheckoutLineItem = {
  wcId: number;
  quantity: number;
  // Display-only fields forwarded to Stripe; ignored for pricing.
  name?: string;
  description?: string;
  image?: string;
};

export type StoreContext = {
  countryCode?: string | null;
  cityId?: string | null;
};

function storeHeadersFromCtx(ctx?: StoreContext): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx?.countryCode) h["x-store-country"] = ctx.countryCode;
  if (ctx?.cityId) h["x-store-city"] = ctx.cityId;
  return h;
}

export async function createPaymentIntent(payload: {
  items: CheckoutLineItem[];
  orderId: string;
  currency?: string;
  email?: string;
  metadata?: Record<string, string>;
  storeContext?: StoreContext;
  /** When true, asks the server to attach this payment to a Stripe Customer so
   *  the card is saved for future checkouts. Only effective for authenticated
   *  shoppers (the server reads the Authorization header to look up the
   *  customer). Silently ignored for guests. */
  saveCard?: boolean;
  /** Bearer token for authenticated requests. Required when saveCard is true. */
  authToken?: string | null;
  /** Selected delivery time-slot label. Pass empty string or omit for express
   *  delivery or when no slot has been selected yet. Stored in the PI snapshot
   *  so the order-finalization guard can compare it to the submitted slot. */
  deliverySlot?: string;
  /** OS city ID — used server-side to look up the slot's extraFee from the
   *  locations cache. Required when deliverySlot is non-empty and a slot
   *  surcharge applies. */
  cityId?: string;
  /** Applied promo/coupon code. Only included when the shopper pressed Apply
   *  and the code was validated client-side. The server re-validates it and
   *  deducts the discount from the PaymentIntent amount. */
  couponCode?: string;
  /** Delivery district name — used server-side to compute the authoritative
   *  delivery fee. When omitted the server defaults to "Beirut". */
  district?: string;
  /** True when the shopper chose express delivery. */
  expressDelivery?: boolean;
  /** True when the shopper chose the no-address (pick-up / to-be-confirmed)
   *  option; the server applies the flat no-address delivery fee instead of
   *  the per-district fee. */
  noAddress?: boolean;
}): Promise<
  | { ok: true; clientSecret: string; orderId: string; amount: number; currency: string }
  | { ok: false; code?: string; message: string }
> {
  try {
    const { storeContext, authToken, ...body } = payload;
    const headers = storeHeadersFromCtx(storeContext);
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}/api/checkout/payment-intent`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}

/**
 * Fetch the server-authoritative fee breakdown for the given cart/delivery
 * context. Call this before opening the payment sheet to detect any mismatch
 * between the displayed total and what the server would charge (FX tick,
 * newly-activated slot surcharge, cache refresh, etc.).
 */
export async function fetchCheckoutFees(payload: {
  items: CheckoutLineItem[];
  currency?: string;
  email?: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  deliverySlot?: string;
  /** ISO date (YYYY-MM-DD) of the selected delivery date. Required for correct
   * same-day/night slot surcharge computation on the server. */
  deliveryDate?: string;
  cityId?: string;
  couponCode?: string;
  storeContext?: StoreContext;
}): Promise<
  | {
      ok: true;
      subtotalUsd: number;
      districtFeeUsd: number;
      expressFeeUsd: number;
      slotFeeUsd: number;
      couponDiscountUsd: number;
      totalUsd: number;
      currency: string;
      subtotal: number;
      districtFee: number;
      expressFee: number;
      slotFee: number;
      couponDiscount: number;
      total: number;
      totalMinorUnits: number;
    }
  | { ok: false; message: string }
> {
  try {
    const { storeContext, ...body } = payload;
    const headers = storeHeadersFromCtx(storeContext);
    const res = await fetch(`${API_BASE}/api/checkout/fees`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}

/** Fetch saved Stripe payment methods for the authenticated customer. */
export async function fetchSavedPaymentMethods(authToken: string): Promise<
  { id: string; brand: string; last4: string; expMonth: number; expYear: number }[]
> {
  try {
    const res = await fetch(`${API_BASE}/api/checkout/payment-methods`, {
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    });
    const json = await res.json();
    return json.paymentMethods ?? [];
  } catch {
    return [];
  }
}

/** Detach a saved Stripe payment method from the authenticated customer. */
export async function deleteSavedPaymentMethod(pmId: string, authToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/checkout/payment-methods/${pmId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    });
    const json = await res.json();
    return json.ok === true;
  } catch {
    return false;
  }
}

export async function createStripeCheckoutSession(payload: {
  items: CheckoutLineItem[];
  orderId: string;
  currency?: string;
  email?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  storeContext?: StoreContext;
  // Delivery context — must be provided so the server includes the delivery fee
  // in the Stripe charge and validates delivery params at order finalization.
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  // Slot context — required when the shopper selected a premium delivery slot.
  deliverySlot?: string;
  cityId?: string;
  /** Applied promo/coupon code. Only included when the shopper pressed Apply. */
  couponCode?: string;
}): Promise<
  | { ok: true; url: string; id: string }
  | { ok: false; code?: string; message: string }
> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/checkout/session`, {
      method: "POST",
      headers: storeHeadersFromCtx(storeContext),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}
