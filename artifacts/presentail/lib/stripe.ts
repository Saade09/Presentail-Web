import Constants from "expo-constants";

// Production API base — used by all native (TestFlight / App Store) builds.
// Hardcoded so OTA updates never end up with an empty URL even when
// EXPO_PUBLIC_API_BASE_URL isn't passed during `eas update` bundling.
const PRODUCTION_API_BASE =
  "https://ecc66d74-6d2e-48a6-9649-831b70a47b53-00-2a2fua6i2o0no.riker.replit.dev";

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

export async function createStripeCheckoutSession(payload: {
  items: CheckoutLineItem[];
  // orderId is REQUIRED so the server can bind the payment intent to this
  // specific order and prevent replay attacks (paid session reused for a
  // different, higher-value order).
  orderId: string;
  currency?: string;
  email?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<
  | { ok: true; url: string; id: string }
  | { ok: false; code?: string; message: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/checkout/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
