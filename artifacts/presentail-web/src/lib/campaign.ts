/**
 * campaign.ts — client-side helpers for ad-campaign landing pages
 * (currently the "Flower Delivery" Google Ads landing page).
 *
 * Owns:
 *  • Per-market configuration (price-pill threshold in USD, converted to the
 *    shopper's display currency at render time).
 *  • The first-order promo flag: set when the "10% off your first order"
 *    promo is shown to an eligible visitor; checkout reads it to auto-apply
 *    the virtual FIRST10 coupon. The server re-validates eligibility at
 *    coupon application AND at order creation — these flags are UX hints,
 *    never the enforcement point.
 */

export const CAMPAIGN_SECTION_KEY = "campaign-flower-delivery";
export const LATE_NIGHT_CAMPAIGN_SECTION_KEY = "campaign-beirut-late-night";

/** Reserved code for the campaign first-order promotion (see api-server couponValidation). */
export const FIRST_ORDER_COUPON_CODE = "FIRST10";

/**
 * Coupon code shown on the flower-delivery landing page hero badge.
 * Clicking the badge copies this code to the clipboard and marks it as
 * pending so the checkout auto-apply effect pre-validates and applies it.
 */
export const BIENVENUE_DIX_CODE = "bienvenueDIX"; /* i18n-ignore */

const PENDING_COUPON_KEY = "@presentail/campaign_pending_coupon_v1";

const PROMO_FLAG_KEY = "@presentail/campaign_first10_v1";
const HAS_ORDERED_KEY = "@presentail/has_ordered_v1";
const CAMPAIGN_IDENTITY_KEY = "@presentail/campaign_identity_v1";
const PROMO_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CAMPAIGN_IDENTITY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // Match attribution TTL.

type StoredCampaignIdentity = {
  key: string;
  touchedAt: number;
};

/**
 * Persist the paid landing identity so the existing add-to-cart, checkout and
 * purchase events can be attributed without emitting a second funnel event.
 */
export function markCampaignIdentity(key: string): void {
  try {
    const value: StoredCampaignIdentity = { key, touchedAt: Date.now() };
    localStorage.setItem(CAMPAIGN_IDENTITY_KEY, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

export function readCampaignIdentity(): string | null {
  try {
    const raw = localStorage.getItem(CAMPAIGN_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCampaignIdentity>;
    if (
      typeof parsed.key !== "string" ||
      typeof parsed.touchedAt !== "number" ||
      Date.now() - parsed.touchedAt > CAMPAIGN_IDENTITY_TTL_MS
    ) {
      localStorage.removeItem(CAMPAIGN_IDENTITY_KEY);
      return null;
    }
    return parsed.key;
  } catch {
    return null;
  }
}

/**
 * Per-market "Shop Under …" price-pill threshold, in USD.
 * AE: 68 USD ≈ AED 250 (rounds to 250 via roundToNearestFive at 3.6725).
 * Fallback for unlisted markets: 50 USD.
 */
const MARKET_THRESHOLD_USD: Record<string, number> = {
  AE: 68,
  QA: 68,
  KW: 65,
  LB: 50,
  CY: 50,
};
const DEFAULT_THRESHOLD_USD = 50;

export function getCampaignThresholdUsd(countryCode: string | null | undefined): number {
  if (!countryCode) return DEFAULT_THRESHOLD_USD;
  return MARKET_THRESHOLD_USD[countryCode.toUpperCase()] ?? DEFAULT_THRESHOLD_USD;
}

/** Store a coupon code from the landing page so checkout auto-applies it. */
export function markPendingCampaignCoupon(code: string): void {
  try {
    localStorage.setItem(PENDING_COUPON_KEY, code);
  } catch {
    /* best-effort */
  }
}

/**
 * Write the coupon directly into the cart coupon input storage so that
 * checkout pre-fills and shows it applied immediately on load, without
 * waiting for the background validation effect to fire.
 * Uses the same key as Cart.tsx COUPON_STORAGE_KEY = "presentail_coupon_v1".
 */
export function setDirectCouponForCheckout(code: string): void {
  try {
    localStorage.setItem("presentail_coupon_v1", code);
  } catch {
    /* best-effort */
  }
}

/** Returns the pending campaign coupon code, or null if none. */
export function getPendingCampaignCoupon(): string | null {
  try {
    return localStorage.getItem(PENDING_COUPON_KEY) || null;
  } catch {
    return null;
  }
}

/** Clear the pending campaign coupon after it has been applied or rejected. */
export function clearPendingCampaignCoupon(): void {
  try {
    localStorage.removeItem(PENDING_COUPON_KEY);
  } catch {
    /* best-effort */
  }
}

/** Record that the first-order promo was shown to this visitor. */
export function markFirstOrderPromoShown(): void {
  try {
    localStorage.setItem(PROMO_FLAG_KEY, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

/** True when the promo was shown within the TTL window (checkout auto-apply hint). */
export function isFirstOrderPromoActive(): boolean {
  try {
    const raw = localStorage.getItem(PROMO_FLAG_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || Date.now() - ts > PROMO_TTL_MS) {
      localStorage.removeItem(PROMO_FLAG_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearFirstOrderPromo(): void {
  try {
    localStorage.removeItem(PROMO_FLAG_KEY);
  } catch {
    /* best-effort */
  }
}

/** Set after any successful order on this browser — hides the promo for repeat shoppers. */
export function markHasOrdered(): void {
  try {
    localStorage.setItem(HAS_ORDERED_KEY, "1");
  } catch {
    /* best-effort */
  }
}

export function hasOrderedLocally(): boolean {
  try {
    return localStorage.getItem(HAS_ORDERED_KEY) === "1";
  } catch {
    return false;
  }
}
