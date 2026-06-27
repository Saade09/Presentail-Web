/**
 * Retained order payload for post-payment retry.
 *
 * After a card / wallet / hosted payment settles, the WooCommerce order is
 * created from the checkout screen. If that creation fails the shopper has
 * already been charged, so we stash the exact order payload here and route to
 * the failure screen, which can replay it through `createWooOrder` without
 * forcing the shopper to rebuild their cart and pay again.
 *
 * Mirrors the web app's `presentail_pending_order_v1` sessionStorage stash
 * (see `artifacts/presentail-web/src/pages/OrderConfirmed.tsx`). On native we
 * use AsyncStorage because the failure screen is a separate route and cannot
 * read the checkout component's in-memory state.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WooOrderPayload } from "@/lib/woo";

const PENDING_ORDER_KEY = "@presentail/pending_order_v1";

// A stashed pending-order payload older than this is treated as missing. This
// stops a stale stash — left on the device after the shopper closed the app on
// the failure screen, or a deep-linked /order-confirmed route opened hours
// later — from being replayed into `createWooOrder` with an outdated delivery
// date/slot. Mirrors the web app's 6-hour window. The stash carries a
// `createdAt` timestamp written by `savePendingOrder` at every write site.
const PENDING_ORDER_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export type PendingOrder = {
  payload: WooOrderPayload;
  authToken?: string | null;
  filter?: { countryCode?: string | null; cityId?: string | null };
  createdAt: number;
};

export async function savePendingOrder(
  entry: Omit<PendingOrder, "createdAt">,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({ ...entry, createdAt: Date.now() } satisfies PendingOrder),
    );
  } catch {
    // Best-effort — if storage is full the shopper simply falls back to the
    // contact-support CTA on the failure screen.
  }
}

export async function loadPendingOrder(): Promise<PendingOrder | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrder;
    if (!parsed?.payload) return null;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > PENDING_ORDER_MAX_AGE_MS) {
      // Stale (or timestamp-less) stash — drop it so it is never replayed and
      // the failure screen falls back to the contact-support CTA.
      await clearPendingOrder();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingOrder(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_ORDER_KEY);
  } catch {
    // Best-effort.
  }
}
