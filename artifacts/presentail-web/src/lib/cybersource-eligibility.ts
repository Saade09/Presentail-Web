// Pure helper — CyberSource Microform eligibility.
//
// CyberSource is the card processor for Lebanon + USD only.
// Both conditions must be met:
//   1. The SENDER PHONE country — the country the sender phone field's
//      picker currently displays — is explicitly "LB" (no default fallback).
//   2. The active display currency is "USD".
//
// The country argument must come from the sender phone field state (or the
// parsed profile phone for signed-in users) — NEVER from the delivery
// country, IP geolocation, browser locale, persisted market, or currency.
// A null/undefined/unknown country routes to Stripe.
//
// All other country + currency combinations — including non-LB phone
// countries with a USD display currency — must route to Stripe.

export function isCyberSourceEligible(
  senderCountryCode: string | null | undefined,
  displayCurrency: string,
): boolean {
  return senderCountryCode?.trim().toUpperCase() === "LB" && displayCurrency?.trim().toUpperCase() === "USD";
}
