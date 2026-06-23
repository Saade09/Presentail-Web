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

// Gulf Stripe account publishable key — used for KWD and OMR payments.
// Register via:
//   eas secret:create --scope project \
//     --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_GULF --value pk_live_...
// Falls back to the main key when unset so the app keeps working without it.
export const STRIPE_PUBLISHABLE_KEY_GULF =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_GULF ?? "";

// Currencies routed to the Gulf Stripe account.
const GULF_STRIPE_CURRENCIES = ["KWD", "OMR"] as const;

/**
 * Return the Stripe publishable key to use for the given display currency.
 * KWD and OMR are charged through the Gulf account; everything else uses
 * the main account. Falls back to the main key if the Gulf key is unset.
 */
export function getStripePublishableKey(currency: string): string {
  if ((GULF_STRIPE_CURRENCIES as readonly string[]).includes(currency)) {
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
}): Promise<
  | { ok: true; clientSecret: string; orderId: string; amount: number; currency: string }
  | { ok: false; code?: string; message: string }
> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/checkout/payment-intent`, {
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

export async function createStripeCheckoutSession(payload: {
  items: CheckoutLineItem[];
  orderId: string;
  currency?: string;
  email?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  storeContext?: StoreContext;
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
