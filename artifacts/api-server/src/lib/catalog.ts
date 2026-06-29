// Authoritative server-side pricing data.
// The client is never trusted as the source of truth for prices or fees.

import { resolveStore, wooAuthHeader, type WooStoreConfig } from "./wooStore";
import { getOsProductBySlug, getOsProductByWcId, hasOsProducts } from "./osProductsCache";
import {
  getOsCountryFreeDeliveryThresholdUsd,
  getOsCountryFreeDeliveryEnabled,
  getOsCityFreeDeliveryThresholdUsd,
  getOsCityFreeDeliveryEnabled,
} from "./osLocationsCache";

// District delivery fees in USD. Mirrors the client-side list but lives
// server-side so the client cannot manipulate the delivery fee.
export const DISTRICT_FEES: Record<string, number> = {
  Akkar: 39,
  Aley: 19,
  Baabda: 11,
  Baalbeck: 39,
  Batroun: 19,
  Bcharee: 39,
  Beirut: 8,
  "Bent Jbeil": 39,
  Chouf: 29,
  Hasbaya: 39,
  Hermel: 39,
  Jbeil: 19,
  Jezzine: 29,
  Kesserwan: 11,
  Koura: 29,
  Marjayoun: 39,
  Metn: 11,
  "Minnieh-Dennaya": 39,
  Nabatieh: 39,
  Rechaya: 39,
  Saida: 29,
  Tripoli: 29,
  Tyre: 39,
  "West Bekaa": 39,
  Zahle: 29,
  Zgharta: 39,
  Dubai: 13.61,
  "Ras Al Khaimah": 13.61,
  "Umm Al Quwain": 13.61,
  Fujairah: 13.61,
  Ajman: 13.61,
  Sharjah: 13.61,
  "Abu Dhabi": 13.61,
  Larnaca: 11,
  Limassol: 11,
  Nicosia: 11,
  Paphos: 11,
};

export const EXPRESS_SURCHARGE_USD = 15;
export const FREE_DELIVERY_THRESHOLD_USD = 130;

const UAE_DISTRICT_NAMES = new Set([
  "Dubai", "Ras Al Khaimah", "Umm Al Quwain", "Fujairah", "Ajman", "Sharjah", "Abu Dhabi",
]);
const CY_DISTRICT_NAMES = new Set(["Larnaca", "Limassol", "Nicosia", "Paphos"]);

export function countryForDistrict(district: string): string {
  if (UAE_DISTRICT_NAMES.has(district)) return "AE";
  if (CY_DISTRICT_NAMES.has(district)) return "CY";
  return "LB";
}

export function expressSurchargeUsd(countryCode?: string): number {
  if (countryCode === "AE") return 4.90;
  return 15;
}

/** Hardcoded fallback free-delivery thresholds (USD) used when the OS cache is empty. */
export function freeDeliveryThresholdUsd(countryCode?: string): number {
  if (countryCode === "AE") return 89.84;
  if (countryCode === "CY") return 120;
  return 90;
}

// Returns the base district fee (before applying the free-delivery threshold).
export function baseDistrictFeeUsd(district: string): number {
  // Unknown districts default to the highest tier so we never under-charge.
  return DISTRICT_FEES[district] ?? 39;
}

// Flat "contact the recipient" delivery fee (USD) used when the customer
// ticks the "I don't know the address" checkbox at checkout. The free-delivery
// threshold still applies — same behaviour as a regular district fee.
export const NO_ADDRESS_DELIVERY_FEE_USD = 35;

// Returns the effective district fee after applying the free-delivery threshold.
// When `noAddress` is true, the flat NO_ADDRESS_DELIVERY_FEE_USD is used instead
// of the per-district fee (still subject to the free-delivery threshold).
// City-level OS settings take precedence over country-level; both fall back to
// the hardcoded per-country defaults when the OS cache is empty.
export function computeDistrictFeeUsd(
  district: string,
  subtotalUsd: number,
  noAddress = false,
): number {
  const country = countryForDistrict(district);
  // City-level wins over country-level, country-level wins over hardcoded.
  const threshold =
    getOsCityFreeDeliveryThresholdUsd(country, district) ??
    getOsCountryFreeDeliveryThresholdUsd(country) ??
    freeDeliveryThresholdUsd(country);
  const freeDeliveryEnabled =
    getOsCityFreeDeliveryEnabled(country, district) ??
    getOsCountryFreeDeliveryEnabled(country) ??
    true;
  if (freeDeliveryEnabled && subtotalUsd >= threshold) return 0;
  return noAddress ? NO_ADDRESS_DELIVERY_FEE_USD : baseDistrictFeeUsd(district);
}

type CatalogProduct = { price: number; name: string };

// Fetch the authoritative catalog price (USD) for a single product by WC ID.
//
// Phase 2 price-verification hierarchy:
//   1. Presentail OS cache (primary, O(1) by wcId within the store's country).
//      When the OS cache is populated for this store, it is the sole authority
//      for prices — WooCommerce is NOT consulted on a miss. This prevents a
//      stale or mis-configured WC store from silently overriding OS prices and
//      closes the window where an attacker could manipulate prices by requesting
//      a WC product not yet in OS.
//   2. WooCommerce REST API (fallback) — consulted ONLY when the OS cache has
//      not yet been populated for this store (startup window before the first
//      successful OS poll). Once OS data is available, this path is bypassed.
//
// Returns null if the product is not found in the active source.
export async function fetchWcProductPrice(wcId: number, store?: WooStoreConfig): Promise<CatalogProduct | null> {
  const s = store ?? resolveStore();

  // Primary: Presentail OS cache (O(1) lookup by wcId, country-scoped).
  const osProduct = getOsProductByWcId(wcId, s.storeKey);
  if (osProduct) {
    if (osProduct.price > 0) {
      return { price: osProduct.price, name: osProduct.name };
    }
    // OS has the product but price is zero/invalid — treat as not orderable.
    return null;
  }

  // When OS is populated for this country, it is authoritative — do not fall
  // through to WooCommerce for products not yet mirrored in OS.
  if (hasOsProducts(s.storeKey)) return null;

  // Fallback: WooCommerce REST API — only reached before OS has first populated.
  if (!s.consumerKey) return null;
  try {
    const r = await fetch(`${s.baseUrl}/products/${wcId}`, {
      headers: {
        Authorization: wooAuthHeader(s),
        "Content-Type": "application/json",
        "User-Agent": "PresentailApp/1.0",
      },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { price?: string; name?: string };
    const price = parseFloat(data.price ?? "");
    if (isNaN(price) || price <= 0) return null;
    return { price, name: data.name ?? String(wcId) };
  } catch {
    return null;
  }
}

export type ResolvedCartItem = {
  wcId: number;
  osSlug?: string;
  name: string;
  priceUsd: number;
  quantity: number;
  description?: string;
  image?: string;
};

// Resolve catalog prices for a list of cart items.
// Each item must have a wcId > 0 OR an osSlug so the server can verify its price.
// Enforces positive integer quantities — fractional or zero quantities would
// silently distort the computed total.
// Returns an error if any item cannot be found in the catalog.
export async function resolveCartItems(
  items: { wcId: number; osSlug?: string; quantity: number; name?: string; description?: string; image?: string }[],
  store?: WooStoreConfig,
): Promise<{ ok: true; items: ResolvedCartItem[]; subtotalUsd: number } | { ok: false; message: string }> {
  const s = store ?? resolveStore();
  // Do not require WC credentials here — fetchWcProductPrice checks the OS
  // cache first (O(1), no network) and only falls back to the WC REST API
  // when the OS cache has no entry for that wcId. Failing early when WC is
  // unconfigured would break checkout for shops that are fully OS-backed.
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Cart is empty" }; // i18n-ignore
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        message: `Invalid quantity for product ${item.osSlug ?? item.wcId}: must be a positive integer (got ${item.quantity})`, // i18n-ignore
      };
    }
  }
  const resolved: ResolvedCartItem[] = [];
  for (const item of items) {
    let catalog: { price: number; name: string } | null = null;
    let resolvedSlug: string | undefined = item.osSlug;
    if (item.wcId > 0) {
      // Standard: look up by WooCommerce ID (also checks OS cache by wcId index).
      catalog = await fetchWcProductPrice(item.wcId, s);
      if (!resolvedSlug) {
        // Derive slug from the OS product entry when not provided by the client.
        const osProduct = getOsProductByWcId(item.wcId, s.storeKey);
        resolvedSlug = osProduct?.id;
      }
    } else if (item.osSlug) {
      // OS-native product (wcId === 0): look up directly by slug in the OS cache.
      // Fall back to any-store lookup when the store-specific cache is cold so
      // Whish/offline orders succeed even during transient cache population.
      const osProduct =
        getOsProductBySlug(item.osSlug, s.storeKey) ??
        getOsProductBySlug(item.osSlug);
      if (osProduct && osProduct.price > 0) {
        catalog = { price: osProduct.price, name: osProduct.name };
        resolvedSlug = osProduct.id;
      }
    }
    if (!catalog) {
      return { ok: false, message: `Product ${item.osSlug ?? item.wcId} not found in catalog` }; // i18n-ignore
    }
    resolved.push({
      wcId: item.wcId,
      osSlug: resolvedSlug,
      name: item.name ?? catalog.name,
      priceUsd: catalog.price,
      quantity: item.quantity,
      description: item.description,
      image: item.image,
    });
  }
  const subtotalUsd = resolved.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);
  return { ok: true, items: resolved, subtotalUsd };
}

// ── Payment verification helpers ──────────────────────────────────────────

// Verify a Stripe checkout session was paid AND that it was created for the
// expected orderId. The orderId is embedded in session.metadata by the server
// when creating the session; a matching value proves this session was not
// created for a different (cheaper) order and replayed here.
//
// stripeKey must be the secret key for the Stripe account that created the
// session — the main key for most currencies, the Gulf key for KWD/OMR/AED.
// Using the wrong key causes Stripe to return 404, making verification fail.
export async function verifyStripePayment(
  sessionId: string,
  expectedOrderId: string,
  stripeKey?: string,
): Promise<boolean> {
  const key = stripeKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key || !sessionId) return false;
  try {
    const encoded = Buffer.from(`${key}:`).toString("base64");
    const r = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Basic ${encoded}` } },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as { payment_status?: string; metadata?: Record<string, string> };
    if (data.payment_status !== "paid") return false;
    // Verify the session was created for this specific order.
    const sessionOrderId = data.metadata?.orderId ?? "";
    return sessionOrderId === expectedOrderId;
  } catch {
    return false;
  }
}

// Verify a Stripe PaymentIntent was successfully paid AND that it was created
// for the expected orderId (stored in metadata). Used by the inline Elements
// card flow (paymentRef starts with "pi_") in contrast to verifyStripePayment
// which checks hosted Checkout sessions (paymentRef starts with "cs_").
//
// stripeKey must be the secret key for the Stripe account that created the
// PaymentIntent — the main key for most currencies, the Gulf key for KWD/OMR/AED.
export async function verifyStripePaymentIntentPaid(
  paymentIntentId: string,
  expectedOrderId: string,
  stripeKey?: string,
): Promise<boolean> {
  const key = stripeKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key || !paymentIntentId) return false;
  try {
    const encoded = Buffer.from(`${key}:`).toString("base64");
    const r = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { headers: { Authorization: `Basic ${encoded}` } },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as { status?: string; metadata?: Record<string, string> };
    if (data.status !== "succeeded") return false;
    const piOrderId = data.metadata?.orderId ?? "";
    return piOrderId === expectedOrderId;
  } catch {
    return false;
  }
}

// Verify a Mamo payment link was paid. Returns true only if Mamo confirms
// the link is in a paid/completed state.
export async function verifyMamoPayment(linkId: string): Promise<boolean> {
  const key = process.env.MAMO_SECRET_KEY;
  if (!key || !linkId) return false;
  try {
    const r = await fetch(
      `https://business.mamopay.com/manage_api/v1/links/${encodeURIComponent(linkId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!r.ok) return false;
    const data = (await r.json()) as any;
    const status: string = (data.status ?? data.payment_status ?? "").toLowerCase();
    return status === "paid" || status === "completed";
  } catch {
    return false;
  }
}

const PAYPAL_BASE =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

async function getPayPalToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encoded}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = (await r.json()) as any;
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// Capture a PayPal order and verify it completed. Returns true only when
// the capture API responds with COMPLETED status. This is idempotent —
// calling it on an already-captured order returns the existing capture.
export async function captureAndVerifyPayPalOrder(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  const token = await getPayPalToken();
  if (!token) return false;
  try {
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return false;
    const data = (await r.json()) as any;
    return (
      data.status === "COMPLETED" ||
      data.purchase_units?.[0]?.payments?.captures?.[0]?.status === "COMPLETED"
    );
  } catch {
    return false;
  }
}
