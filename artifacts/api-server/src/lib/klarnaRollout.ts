import { createHash } from "node:crypto";

/**
 * Klarna payment method rollout control.
 *
 * Modes (set via KLARNA_ROLLOUT env var, default "off"):
 *   off        — Klarna never surfaced (safe default; full rollout waits for approval).
 *   test       — Klarna surfaced only when the request uses the Stripe test key
 *                (STRIPE_SECRET_KEY starts with sk_test_). Safe for QA in prod infra.
 *   percentage — Klarna surfaced for KLARNA_ROLLOUT_PCT % of sessions (deterministic
 *                hash of sessionId so the same shopper stays in/out for the session).
 *   on         — Klarna surfaced for all eligible payer countries.
 *
 * Country gate: Klarna requires the *payer's* country (from IP geolocation, NOT
 * the delivery address) to be in one of its supported markets. This is a hard
 * requirement from Klarna's terms — delivery address cannot substitute.
 *
 * Web-only: Klarna is not offered on the mobile app (BNPL flows require a redirect
 * that Expo's in-app WebView cannot handle reliably via stripe-react-native).
 *
 * Stripe remains the sole authority on final Klarna eligibility: even in "on"
 * mode, Stripe will not present Klarna to shoppers whose billing country or
 * currency combination is unsupported.
 */

export type KlarnaRolloutMode = "off" | "test" | "percentage" | "on";
export type KlarnaCohort = "exposed" | "excluded" | "off";

/**
 * Internal helper to read rollout mode.
 */
function getRolloutMode(): KlarnaRolloutMode {
  const raw = (process.env.KLARNA_ROLLOUT ?? "off").trim().toLowerCase();
  if (raw === "off" || raw === "test" || raw === "percentage" || raw === "on") {
    return raw as KlarnaRolloutMode;
  }
  return "off";
}

/**
 * Exported version of getRolloutMode (aliased for compatibility).
 */
export function getKlarnaRolloutMode(): KlarnaRolloutMode {
  return getRolloutMode();
}

/**
 * Internal helper to read rollout percentage from KLARNA_ROLLOUT_PCT.
 */
function getRolloutPct(): number {
  const raw = process.env.KLARNA_ROLLOUT_PCT;
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Exported version to read percentage from KLARNA_ROLLOUT_PERCENTAGE.
 */
export function getKlarnaRolloutPercentage(): number {
  const raw = process.env.KLARNA_ROLLOUT_PERCENTAGE ?? "";
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

/**
 * Supported payer countries for Klarna as of 2026-07.
 * Source: https://stripe.com/docs/payments/klarna
 * Klarna is NOT available in Lebanon (LB), UAE (AE), or Cyprus (CY) — these are
 * Presentail's delivery markets, but Klarna is only relevant when the *payer*
 * (usually a diaspora customer) is browsing from a supported country.
 */
export const KLARNA_PAYER_COUNTRIES = new Set([
  "AT",
  "BE",
  "DK",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "NL",
  "NO",
  "PL",
  "PT",
  "ES",
  "SE",
  "CH",
  "GB",
  "US",
  "CA",
  "AU",
  "NZ",
]);

/** Returns true when `countryCode` is a Klarna-supported payer country. */
export function isKlarnaEligibleCountry(
  countryCode: string | null | undefined,
): boolean {
  if (!countryCode) return false;
  return KLARNA_PAYER_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Deterministic per-session cohort for percentage rollout.
 * Maps a `sessionId` string to a bucket 0–99. Same input → same bucket,
 * so the same shopper is consistently in or out of the rollout.
 */
export function cohortBucket(sessionId: string): number {
  const hash = createHash("sha256").update(sessionId).digest("hex");
  return parseInt(hash.slice(0, 8), 16) % 100;
}

/**
 * Exported alias for cohortBucket, using checkoutId.
 */
export function klarnaHashBucket(checkoutId: string): number {
  return cohortBucket(checkoutId);
}

/**
 * Returns true when Klarna should be surfaced for this request.
 *
 * @param sessionId    Stable per-session identifier (e.g. orderId or analytics sessionId).
 *                     Used only in "percentage" mode for deterministic cohort bucketing.
 * @param payerCountry ISO 3166-1 alpha-2 code from IP geolocation (NOT delivery address).
 * @param isTestMode   True when the active Stripe key is a test key (sk_test_…).
 */
export function isKlarnaEnabled({
  sessionId,
  payerCountry,
  isTestMode,
}: {
  sessionId: string;
  payerCountry: string | null | undefined;
  isTestMode: boolean;
}): boolean {
  if (!isKlarnaEligibleCountry(payerCountry)) return false;

  const mode = getRolloutMode();
  switch (mode) {
    case "off":
      return false;
    case "on":
      return true;
    case "test":
      return isTestMode;
    case "percentage": {
      // Check both potential env vars for percentage mode
      const pct = Math.max(getRolloutPct(), getKlarnaRolloutPercentage());
      if (pct <= 0) return false;
      if (pct >= 100) return true;
      return cohortBucket(sessionId) < pct;
    }
    default:
      return false;
  }
}

/**
 * Compatibility wrapper for klarnaRolloutAllowed.
 * Note: This version does not have payerCountry info, so it only checks the rollout gate.
 * Stripe will still perform the final country check if this returns true.
 */
export function klarnaRolloutAllowed(
  checkoutId: string,
  stripeKey?: string | null,
): boolean {
  const mode = getRolloutMode();

  if (mode === "off") return false;

  if (mode === "test") {
    return typeof stripeKey === "string" && stripeKey.startsWith("sk_test_");
  }

  if (mode === "on") return true;

  // mode === "percentage"
  const pct = Math.max(getRolloutPct(), getKlarnaRolloutPercentage());
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return klarnaHashBucket(checkoutId) < pct;
}

/**
 * Returns the Klarna cohort label for Stripe metadata.
 */
export function klarnaCohortLabel(
  checkoutId: string,
  stripeKey?: string | null,
): KlarnaCohort {
  const mode = getRolloutMode();
  if (mode === "off") return "off";
  return klarnaRolloutAllowed(checkoutId, stripeKey) ? "exposed" : "excluded";
}

