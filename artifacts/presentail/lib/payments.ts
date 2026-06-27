import { API_BASE, type StoreContext } from "./stripe";

type PayResult = { ok: true; url: string; id: string } | { ok: false; code?: string; message: string };

type CartItem = { wcId: number; quantity: number };

// Redirect-based payments (Mamo / PayPal / the Stripe hosted-checkout fallback)
// hand control to an external browser. A backgrounded app can resume the
// `WebBrowser.openAuthSessionAsync` session and return "success" long after the
// shopper actually abandoned it. Without a max-age guard that stale return would
// be turned into a real WooCommerce order. Anything older than this window (from
// the moment the redirect was opened) is treated as stale and must NOT create an
// order — the shopper is routed to the failure screen instead. Inline flows
// (card / native wallet / Whish / Western Union) settle synchronously and pass
// no `startedAt`, so they are never gated.
export const DEFERRED_PAYMENT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns true when a deferred (redirect) payment that began at `startedAt`
 * is too old to be safely finalised into an order.
 *
 * Pure and time-injectable so it can be unit-tested without mocking the clock.
 * A missing / non-finite / non-positive `startedAt` is treated as stale (fail
 * closed) so a corrupted timestamp can never replay an abandoned payment.
 */
export function isDeferredPaymentStale(
  startedAt: number,
  now: number = Date.now(),
  maxAgeMs: number = DEFERRED_PAYMENT_MAX_AGE_MS,
): boolean {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return true;
  return now - startedAt > maxAgeMs;
}

/**
 * Single source of truth for finalising a payment into an order.
 *
 * - For a deferred (redirect) payment, `deferredStartedAt` is the timestamp
 *   captured right before the hosted browser opened. If that deferred payment
 *   is stale (the app was backgrounded and resumed much later), `createOrder`
 *   is NEVER called and `onStale` runs instead — this is what stops an
 *   abandoned redirect from silently becoming a real order.
 * - Otherwise `createOrder` runs and `onSettled(ok)` is invoked with its result.
 * - Inline flows pass `deferredStartedAt === undefined` and are therefore never
 *   gated — they always reach `createOrder`.
 *
 * Kept here (rather than inline in the checkout screen) so the gate is a pure,
 * unit-testable unit that the screen consumes verbatim.
 */
export async function finalizeHostedPayment(opts: {
  deferredStartedAt?: number;
  createOrder: () => Promise<boolean>;
  onSettled: (ok: boolean) => void | Promise<void>;
  onStale: () => void | Promise<void>;
  now?: number;
  maxAgeMs?: number;
}): Promise<void> {
  const { deferredStartedAt, createOrder, onSettled, onStale, now, maxAgeMs } = opts;
  if (
    deferredStartedAt != null &&
    isDeferredPaymentStale(deferredStartedAt, now, maxAgeMs)
  ) {
    await onStale();
    return;
  }
  const ok = await createOrder();
  await onSettled(ok);
}

function storeHeadersFromCtx(ctx?: StoreContext): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx?.countryCode) h["x-store-country"] = ctx.countryCode;
  if (ctx?.cityId) h["x-store-city"] = ctx.cityId;
  return h;
}

export async function createMamoPayment(payload: {
  items: CartItem[];
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  currency?: string;
  title?: string;
  description?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  returnUrl: string;
  failureReturnUrl: string;
  storeContext?: StoreContext;
}): Promise<PayResult> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/payment/mamo`, {
      method: "POST",
      headers: storeHeadersFromCtx(storeContext),
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}

export async function createPayPalOrder(payload: {
  items: CartItem[];
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  storeContext?: StoreContext;
}): Promise<PayResult> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/payment/paypal`, {
      method: "POST",
      headers: storeHeadersFromCtx(storeContext),
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}
