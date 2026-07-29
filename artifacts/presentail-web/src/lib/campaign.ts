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

/** Reserved code for the campaign first-order promotion (see api-server couponValidation). */
export const FIRST_ORDER_COUPON_CODE = "FIRST10";

const PROMO_FLAG_KEY = "@presentail/campaign_first10_v1";
const HAS_ORDERED_KEY = "@presentail/has_ordered_v1";
const PROMO_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
