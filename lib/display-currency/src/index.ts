// Shared display-currency resolver used by the Presentail web storefront and
// Expo mobile app. The single source of truth for the precedence chain:
//
//   manualOverride → savedCountry → gpsCountry → ipCountry → localeCountry
//
// The chosen country is mapped to a currency via the caller-supplied
// `countryToCurrency` function (each app owns its own mapping table). The
// resulting currency is then validated against the caller-supplied
// `isSupported` predicate; anything unsupported (or any failed lookup)
// cleanly falls back to `fallback` (USD by default).

export type DisplayCurrencySource =
  | "manual"
  | "saved"
  | "gps"
  | "ip"
  | "locale"
  | "fallback";

export type ResolveDisplayCurrencyInput = {
  /** Explicit, session-scoped manual pick. Always wins when supported. */
  manualOverride?: string | null;
  /** Country the visitor explicitly selected as their delivery country. */
  savedCountry?: string | null;
  /** Country derived from a GPS fix (mobile only). */
  gpsCountry?: string | null;
  /** Country derived from the visitor's IP address. */
  ipCountry?: string | null;
  /** Country derived from the device/browser locale (e.g. `en-AE` → `AE`). */
  localeCountry?: string | null;
  /** Maps an ISO country code → currency code, or null if unknown. */
  countryToCurrency: (country: string) => string | null;
  /** Whether a currency is renderable by the caller's formatter. */
  isSupported: (currency: string) => boolean;
  /** Currency to use when nothing in the chain resolves to a supported one. */
  fallback?: string;
};

export type ResolveDisplayCurrencyResult = {
  /** Final currency code the caller should display in. Always supported. */
  finalCurrency: string;
  /** Currency the picked country mapped to before supported-list validation. */
  mappedCurrency: string | null;
  /** ISO country code that drove the decision (null if fallback). */
  chosenCountry: string | null;
  /** Where the chosen country came from in the precedence chain. */
  chosenSource: DisplayCurrencySource;
};

const SOURCE_ORDER: ReadonlyArray<{
  source: Exclude<DisplayCurrencySource, "fallback">;
  key: keyof Pick<
    ResolveDisplayCurrencyInput,
    "manualOverride" | "savedCountry" | "gpsCountry" | "ipCountry" | "localeCountry"
  >;
}> = [
  { source: "manual", key: "manualOverride" },
  { source: "saved", key: "savedCountry" },
  { source: "gps", key: "gpsCountry" },
  { source: "ip", key: "ipCountry" },
  { source: "locale", key: "localeCountry" },
];

function normalizeCountry(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Manual override is special: it is supplied as a *currency* code, not a
 * country, since the in-app currency picker offers currencies directly.
 * If the manual currency is supported, return it immediately.
 */
function resolveManualOverride(
  manualOverride: string | null | undefined,
  isSupported: (currency: string) => boolean,
): string | null {
  if (typeof manualOverride !== "string") return null;
  const code = manualOverride.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return isSupported(code) ? code : null;
}

export function resolveDisplayCurrency(
  input: ResolveDisplayCurrencyInput,
): ResolveDisplayCurrencyResult {
  const fallback = input.fallback ?? "USD";

  const manual = resolveManualOverride(input.manualOverride, input.isSupported);
  if (manual) {
    return {
      finalCurrency: manual,
      mappedCurrency: manual,
      chosenCountry: null,
      chosenSource: "manual",
    };
  }

  // Pick the FIRST non-null country in the precedence chain. Lower-priority
  // signals are only consulted when a higher-priority one is genuinely
  // absent — never to "rescue" a higher-priority country whose currency is
  // unknown or unsupported. That kind of cross-source fallback would, for
  // example, let an IP-detected Lebanon visitor pick up EUR from a French
  // browser locale instead of cleanly settling on USD.
  for (const { source, key } of SOURCE_ORDER) {
    if (key === "manualOverride") continue;
    const country = normalizeCountry(input[key] as string | null | undefined);
    if (!country) continue;
    const mapped = input.countryToCurrency(country);
    const upper = typeof mapped === "string" ? mapped.trim().toUpperCase() : null;
    if (upper && input.isSupported(upper)) {
      return {
        finalCurrency: upper,
        mappedCurrency: upper,
        chosenCountry: country,
        chosenSource: source,
      };
    }
    // Country present but its currency isn't supported here — settle on
    // the fallback rather than keep walking the chain.
    return {
      finalCurrency: fallback,
      mappedCurrency: upper,
      chosenCountry: country,
      chosenSource: "fallback",
    };
  }

  return {
    finalCurrency: fallback,
    mappedCurrency: null,
    chosenCountry: null,
    chosenSource: "fallback",
  };
}

/**
 * Calculate the reward points a shopper earns for a product.
 *
 * Single source of truth used by both the mobile app and the web storefront
 * so shoppers see identical point totals regardless of platform.
 *
 * Rate: 0.4 points per USD, minimum 1 point.
 */
export function calcRewardPoints(priceValue: number): number {
  if (!Number.isFinite(priceValue) || priceValue <= 0) return 1;
  return Math.max(1, Math.round(priceValue * 0.4));
}

/**
 * Parse an ISO 3166-1 alpha-2 country code out of a BCP-47 locale tag like
 * `en-AE`, `fr_CH`, or `ar-SA`. Returns null when the tag has no region
 * subtag (e.g. plain `en`) or the region is not exactly two letters.
 */
export function countryFromLocale(locale: string | null | undefined): string | null {
  if (typeof locale !== "string" || !locale) return null;
  const parts = locale.replace(/_/g, "-").split("-");
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stripe smallest-unit conversion — SINGLE SOURCE OF TRUTH
// ---------------------------------------------------------------------------
//
// The number of decimals a currency is charged in, and the conversion of a
// already-converted amount into Stripe's smallest unit, live here so the
// Expo mobile app, the Vite web storefront, AND the Express API server all
// share one implementation. Previously these were duplicated in
// `artifacts/api-server/src/lib/fx.ts` (server) and
// `artifacts/presentail-web/src/lib/stripeMinorUnits.ts` (web), which meant the
// Apple Pay / Google Pay wallet sheet total (computed client-side) could drift
// from the server-created PaymentIntent amount whenever one map was edited and
// the other was not. Both now re-export from here, so they can never diverge.

/** Decimals each currency is charged/displayed in. Falls back to 2 for unknown codes. */
export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  AED: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  QAR: 2,
  SAR: 2,
  CHF: 2,
  LBP: 0,
};

/** Decimals for a currency code (case-insensitive); defaults to 2 for unknown codes. */
export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Round a display-currency amount to the nearest whole number so the Stripe
 * charge matches the whole-number price shown to the shopper. LBP is already
 * zero-decimal and is unaffected (Math.round of an integer is a no-op).
 */
export function roundToWholeUnit(amount: number): number {
  return Math.round(amount);
}

/**
 * Convert an amount already expressed in `currency` into the smallest unit
 * Stripe expects. Handles zero-decimal currencies (LBP) and standard
 * two-decimal currencies.
 */
export function toStripeMinorUnits(convertedAmount: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  if (decimals === 0) {
    return Math.round(convertedAmount);
  }
  return Math.round(convertedAmount * 100);
}
