/**
 * Pure helpers for the web checkout's payment-method picker. Extracted from
 * `Checkout.tsx` so the visibility / label / auto-fallback rules can be unit
 * tested without rendering the React Native–adjacent checkout screen.
 *
 * The underlying compatibility table lives in `@workspace/pay-methods` and is
 * shared with the mobile checkout — these helpers only encode the *web*
 * subset (no Western Union) and the web-specific label flip (Mamo tile is
 * relabelled to "Pay by card" in AED).
 */

import {
  isPayMethodSupported,
  nextPayMethodForCurrency,
  type PayMethodId,
} from "@workspace/pay-methods";

export type WebPaymentMethodId = Extract<
  PayMethodId,
  "card" | "paypal" | "whish" | "mamo" | "apple_pay" | "google_pay" | "western"
>;

export const WEB_PAY_METHODS: readonly WebPaymentMethodId[] = [
  "apple_pay",
  "google_pay",
  "card",
  "paypal",
  "mamo",
  "whish",
] as const;

export type WebPayMethodCtx = {
  activeCurrency: string;
  countryCode?: string | null;
  /**
   * Whether the browser is running on an Apple platform (iOS, iPadOS, macOS).
   * When `true`  → `google_pay` tile is hidden (Apple Pay is the native wallet).
   * When `false` → `apple_pay` tile is hidden (e.g. Windows / Android / Linux).
   * When `undefined` (SSR / tests that don't set it) → both tiles remain visible
   * (graceful fallback; the existing `canMakePayment()` probe is the safety net).
   */
  isApplePlatform?: boolean;
};

/**
 * Detect whether the current browser supports Apple Pay. Returns `true` only
 * when the browser is running on an Apple platform (iOS, iPadOS, macOS) **and**
 * the browser itself is Safari or Chrome on iOS (which runs on WebKit and
 * supports Apple Pay). Chrome/Chromium on macOS is excluded — it does not
 * support Apple Pay and instead opens Google Pay when the Stripe
 * PaymentRequest API is invoked, creating a confusing label mismatch.
 *
 * Detection logic:
 * - Chrome on iOS carries `"CriOS"` in the UA and is WebKit-backed → Apple Pay.
 * - Desktop Chrome / Chromium carries `"Chrome"` in the UA → not Apple Pay.
 * - Safari (Mac + iOS) carries `"Safari"` but not `"Chrome"` in the UA → Apple Pay.
 * - Firefox, Edge, and other non-Safari Mac browsers are also excluded.
 *
 * Safe to call in SSR / test environments — guards with
 * `typeof navigator !== "undefined"` before accessing browser globals.
 */
export function isApplePayBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // userAgentData.platform is available in Chromium but not Safari.
  // Fall back to the (deprecated-but-still-reliable) navigator.platform.
  const platform: string =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";

  // Step 1: must be on an Apple platform.
  const isApple =
    // iOS / iPadOS (pre-13): "iPhone", "iPad", "iPod" in platform
    /iP(hone|ad|od)/.test(platform) ||
    // iOS in UA (belt-and-suspenders)
    /iP(hone|ad|od)/.test(ua) ||
    // macOS: platform starts with "Mac"
    /^Mac/.test(platform) ||
    // iPadOS 13+ reports as "MacIntel" but includes "iPad" in the UA
    (platform === "MacIntel" && /iPad/.test(ua));

  if (!isApple) return false;

  // Step 2: require a browser that actually supports Apple Pay.
  // Chrome on iOS uses the "CriOS" token, runs on WebKit, and supports Apple Pay.
  if (/CriOS/.test(ua)) return true;
  // Desktop Chrome / Chromium on macOS carry "Chrome" in the UA but do NOT
  // support Apple Pay — they open Google Pay instead.
  if (/Chrome/.test(ua)) return false;
  // Safari (Mac + iOS) includes "Safari" in the UA without "Chrome".
  // Firefox, Gecko-based browsers, and other non-WebKit engines on macOS do
  // NOT include "Safari" — they are excluded here so only real Safari passes.
  if (/Safari/.test(ua)) return true;
  return false;
}

/** @deprecated Use `isApplePayBrowser()` instead. */
export const isApplePlatform = isApplePayBrowser;

/**
 * The i18n label key for a payment method in the active currency. Mamo
 * carries a context-sensitive label: when the active currency is AED the
 * Mamo tile *is* the card option (Stripe doesn't settle in AED), so it is
 * renamed to "Pay by card" — mirrors the mobile checkout copy.
 */
export function webPaymentMethodLabelKey(
  id: WebPaymentMethodId,
  activeCurrency: string,
): string {
  if (id === "mamo") {
    return activeCurrency === "AED"
      ? "checkout.pay.payByCard"
      : "checkout.pay.mamo";
  }
  switch (id) {
    case "card":
      return "checkout.pay.card";
    case "apple_pay":
      return "checkout.pay.apple_pay";
    case "google_pay":
      return "checkout.pay.google_pay";
    case "paypal":
      return "checkout.pay.paypal";
    case "whish":
      return "checkout.pay.whish";
    case "western":
      return "checkout.pay.western";
    default:
      return "checkout.pay.card";
  }
}

/**
 * Visible payment-method tiles for the active currency + country + platform.
 * Methods the shared compatibility table excludes are hidden entirely so
 * shoppers only see real choices. Platform gating:
 *   - Non-Apple (Windows / Android): `apple_pay` is hidden.
 *   - Apple (iOS / macOS): `google_pay` is hidden.
 *   - Unknown / SSR: both tiles remain (existing `canMakePayment()` probe
 *     is the secondary safety net for "no wallet configured").
 * A defensive fallback to `["card"]` keeps the picker from ever being empty.
 */
export function webVisiblePayMethods(
  ctx: WebPayMethodCtx,
): WebPaymentMethodId[] {
  const country = ctx.countryCode ?? undefined;
  const visible = WEB_PAY_METHODS.filter((id) => {
    if (!isPayMethodSupported(id, ctx.activeCurrency, { country })) return false;
    if (ctx.isApplePlatform !== undefined) {
      if (id === "apple_pay" && !ctx.isApplePlatform) return false;
      if (id === "google_pay" && ctx.isApplePlatform) return false;
    }
    return true;
  });
  return visible.length > 0 ? [...visible] : ["card"];
}

/**
 * Auto-fallback selection when the currently selected method becomes hidden
 * (e.g. shopper flips display currency to AED and Stripe `card` disappears,
 * or the platform flag rules out the active wallet tile).
 * Wraps the shared `nextPayMethodForCurrency` and narrows the result to the
 * web subset + platform gate, falling back to the first visible method (or
 * `"card"`) when the shared default picks a hidden tile.
 */
export function webNextPaymentMethod(
  current: WebPaymentMethodId,
  ctx: WebPayMethodCtx,
): WebPaymentMethodId {
  const country = ctx.countryCode ?? undefined;
  const next = nextPayMethodForCurrency(current, ctx.activeCurrency, {
    country,
  });
  const webNext = (WEB_PAY_METHODS as readonly PayMethodId[]).includes(next)
    ? (next as WebPaymentMethodId)
    : "card";

  // If the resolved method is hidden by the platform gate, fall back to the
  // first visible tile in this context instead.
  if (ctx.isApplePlatform !== undefined) {
    const platformHidden =
      (webNext === "apple_pay" && !ctx.isApplePlatform) ||
      (webNext === "google_pay" && ctx.isApplePlatform);
    if (platformHidden) {
      const visible = webVisiblePayMethods(ctx);
      return visible[0] ?? "card";
    }
  }

  return webNext;
}
