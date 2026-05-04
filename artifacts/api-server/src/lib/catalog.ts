// Authoritative server-side pricing data.
// The client is never trusted as the source of truth for prices or fees.

import { resolveStore, wooAuthHeader, type WooStoreConfig } from "./wooStore";

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
  Jbail: 19,
  Jezzine: 29,
  Kasserwan: 11,
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
  Zghorta: 39,
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

export function freeDeliveryThresholdUsd(countryCode?: string): number {
  if (countryCode === "AE") return 89.84;
  return 130;
}

// Returns the base district fee (before applying the free-delivery threshold).
export function baseDistrictFeeUsd(district: string): number {
  // Unknown districts default to the highest tier so we never under-charge.
  return DISTRICT_FEES[district] ?? 39;
}

// Returns the effective district fee after applying the free-delivery threshold.
export function computeDistrictFeeUsd(district: string, subtotalUsd: number): number {
  const country = countryForDistrict(district);
  const threshold = freeDeliveryThresholdUsd(country);
  return subtotalUsd >= threshold ? 0 : baseDistrictFeeUsd(district);
}

type CatalogProduct = { price: number; name: string };

// Fetch the WooCommerce catalog price (USD) for a single product by WC ID.
// Returns null if the product is not found or WC is unreachable.
export async function fetchWcProductPrice(wcId: number, store?: WooStoreConfig): Promise<CatalogProduct | null> {
  const s = store ?? resolveStore();
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
  name: string;
  priceUsd: number;
  quantity: number;
  description?: string;
  image?: string;
};

// Resolve catalog prices for a list of cart items.
// Each item must have a wcId so the server can verify its price.
// Enforces positive integer quantities — fractional or zero quantities would
// silently distort the computed total.
// Returns an error if any wcId cannot be found in the WC catalog.
export async function resolveCartItems(
  items: { wcId: number; quantity: number; name?: string; description?: string; image?: string }[],
  store?: WooStoreConfig,
): Promise<{ ok: true; items: ResolvedCartItem[]; subtotalUsd: number } | { ok: false; message: string }> {
  const s = store ?? resolveStore();
  if (!s.consumerKey) {
    return { ok: false, message: "Product catalog unavailable — WooCommerce is not configured" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Cart is empty" };
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        message: `Invalid quantity for product ${item.wcId}: must be a positive integer (got ${item.quantity})`,
      };
    }
  }
  const resolved: ResolvedCartItem[] = [];
  for (const item of items) {
    const catalog = await fetchWcProductPrice(item.wcId, s);
    if (!catalog) {
      return { ok: false, message: `Product ${item.wcId} not found in catalog` };
    }
    resolved.push({
      wcId: item.wcId,
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
export async function verifyStripePayment(
  sessionId: string,
  expectedOrderId: string,
): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY;
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
