import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  countryFromLocale,
  resolveDisplayCurrency,
} from "@workspace/display-currency";
import { apiFetch } from "./api";
import { useFxRates } from "./queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  currencyForStoreCountry,
  formatPriceInCurrency,
} from "./currency";

// Legacy localStorage key for the auto-detected currency. We no longer write
// to it (auto-detection runs fresh on every page load now), and on first
// hook mount we proactively clear any leftover value so existing visitors
// stop seeing a stale currency from a previous visit / location.
const LEGACY_DETECTED_CURRENCY_KEY = "presentail_display_currency_v1";
const MANUAL_CURRENCY_KEY = "presentail_display_currency_manual_v1";

/**
 * Currencies the product-page switcher offers. Kept to a small, on-brand
 * set; all of these are also formattable via `formatPriceInCurrency` and
 * have rates in the server-side FX pipeline.
 */
export const SUPPORTED_DISPLAY_CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound Sterling" },
];

const SUPPORTED_CODES = new Set(
  SUPPORTED_DISPLAY_CURRENCIES.map((c) => c.code),
);

// Country → currency mapping that matches the server-side
// `geoCurrency.ts`/mobile `data/currencies.ts` table. Anything not listed
// here falls through to the next signal in the precedence chain (and
// eventually to USD).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AE: "AED",
  US: "USD",
  GB: "GBP",
  IM: "GBP",
  JE: "GBP",
  GG: "GBP",
  CA: "CAD",
  AU: "AUD",
  QA: "QAR",
  SA: "SAR",
  KW: "KWD",
  OM: "OMR",
  CH: "CHF",
  LI: "CHF",
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  AD: "EUR",
  MC: "EUR",
  SM: "EUR",
  VA: "EUR",
  ME: "EUR",
  XK: "EUR",
};

function countryToCurrency(country: string): string | null {
  return COUNTRY_TO_CURRENCY[country] ?? null;
}

// The web formatter knows how to render any code in `CURRENCY_FORMAT`
// (`currency.ts`); but the user-facing switcher only exposes a small set.
// For auto-detected currencies we want the broader list (so e.g. an AE
// visitor whose IP resolves to AED still sees AED), but the manual
// override stays restricted to the picker's options. This single predicate
// covers both: any currency the formatter can render is "supported".
function isFormattable(currency: string): boolean {
  // formatPriceInCurrency falls back to USD for unknown codes; keep the
  // resolver strict to the codes we actively support so unknowns surface
  // as USD instead of being silently re-mapped.
  const known = new Set([
    "USD",
    "AED",
    "EUR",
    "GBP",
    "CAD",
    "AUD",
    "QAR",
    "SAR",
    "KWD",
    "OMR",
    "CHF",
  ]);
  return known.has(currency);
}

type GeoCurrencyResponse = {
  countryCode: string | null;
  currencyCode: string;
};

function readManualCurrency(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(MANUAL_CURRENCY_KEY);
    return v && SUPPORTED_CODES.has(v) ? v : null;
  } catch {
    return null;
  }
}

function writeManualCurrency(code: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (code) {
      window.sessionStorage.setItem(MANUAL_CURRENCY_KEY, code);
    } else {
      window.sessionStorage.removeItem(MANUAL_CURRENCY_KEY);
    }
  } catch {
    // best-effort persistence
  }
}

function clearLegacyDetectedCurrency(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_DETECTED_CURRENCY_KEY);
  } catch {
    // best-effort
  }
}

function readBrowserLocaleCountry(): string | null {
  if (typeof navigator === "undefined") return null;
  const langs: string[] = [];
  if (Array.isArray(navigator.languages)) langs.push(...navigator.languages);
  if (typeof navigator.language === "string") langs.push(navigator.language);
  for (const tag of langs) {
    const c = countryFromLocale(tag);
    if (c) return c;
  }
  return null;
}

/**
 * Resolves the currency the visitor should see prices in.
 *
 * Precedence (single source of truth in `@workspace/display-currency`):
 *   1. Manual session-scoped override (the product-page currency picker).
 *   2. Selected delivery country (storefront lock — keeps cart/checkout
 *      consistent with the store's native currency).
 *   3. IP-detected country from `/api/geo/currency`.
 *   4. Browser-locale country (e.g. `en-AE` → `AE`).
 *   5. USD fallback.
 *
 * The auto-detected currency is **not** persisted across loads — opening
 * the site from a different country now picks up that country's currency
 * on first paint instead of replaying whatever was cached from a previous
 * visit.
 */
export function useDisplayCurrency(): {
  currencyCode: string;
  isDetected: boolean;
  isManual: boolean;
  setCurrencyCode: (code: string) => void;
  supportedCurrencies: { code: string; name: string }[];
  formatPrice: (storeCurrencyValue: number) => string;
} {
  const { countryCode } = useLocationSelection();
  const hasSelectedCountry = !!countryCode;
  const storeCurrency = currencyForStoreCountry(countryCode);

  const [manual, setManual] = useState<string | null>(() => readManualCurrency());

  // One-shot cleanup of the legacy persisted value so existing visitors
  // don't keep seeing a stale auto-detected currency from a previous visit.
  useEffect(() => {
    clearLegacyDetectedCurrency();
  }, []);

  // Always re-detect on every load (no localStorage cache). Skip the geo
  // call only when the visitor has locked a delivery country — that fully
  // determines display currency.
  const { data } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<GeoCurrencyResponse>("/geo/currency"),
    enabled: !hasSelectedCountry,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  const { data: fxData } = useFxRates();
  const rates = fxData?.rates ?? {};

  const localeCountry = useMemo(() => readBrowserLocaleCountry(), []);

  const resolved = useMemo(
    () =>
      resolveDisplayCurrency({
        manualOverride: manual,
        savedCountry: hasSelectedCountry ? countryCode : null,
        gpsCountry: null,
        ipCountry: data?.countryCode ?? null,
        localeCountry,
        countryToCurrency,
        isSupported: isFormattable,
        fallback: "USD",
      }),
    [manual, hasSelectedCountry, countryCode, data?.countryCode, localeCountry],
  );

  const currencyCode = resolved.finalCurrency;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.log("[display-currency:web]", {
      savedCountry: hasSelectedCountry ? countryCode : null,
      gpsCountry: null,
      ipCountry: data?.countryCode ?? null,
      localeCountry,
      manualOverride: manual,
      chosenSource: resolved.chosenSource,
      chosenCountry: resolved.chosenCountry,
      mappedCurrency: resolved.mappedCurrency,
      finalCurrency: resolved.finalCurrency,
    });
  }, [
    hasSelectedCountry,
    countryCode,
    data?.countryCode,
    localeCountry,
    manual,
    resolved.chosenSource,
    resolved.chosenCountry,
    resolved.mappedCurrency,
    resolved.finalCurrency,
  ]);

  const setCurrencyCode = useCallback((code: string) => {
    if (!SUPPORTED_CODES.has(code)) return;
    setManual(code);
    writeManualCurrency(code);
  }, []);

  const formatPrice = useCallback(
    (storeCurrencyValue: number) => {
      const v = Number(storeCurrencyValue) || 0;
      // The currency `priceValue` is denominated in: when the visitor has
      // picked a delivery country, that's the store's native currency;
      // otherwise the default Lebanon store is used (USD).
      const sourceCurrency = hasSelectedCountry ? storeCurrency : "USD";

      if (currencyCode === sourceCurrency) {
        return formatPriceInCurrency(v, currencyCode);
      }

      // Convert source -> USD -> target using live FX rates (server-supplied,
      // same rates the mobile app and server use for billing).
      const sourceRate =
        sourceCurrency === "USD" ? 1 : Number(rates?.[sourceCurrency] ?? 0);
      const targetRate =
        currencyCode === "USD" ? 1 : Number(rates?.[currencyCode] ?? 0);
      if (sourceRate > 0 && targetRate > 0) {
        const usd = v / sourceRate;
        return formatPriceInCurrency(usd * targetRate, currencyCode);
      }
      // FX rates not yet available — fall back to native source formatting
      // rather than show a misleading converted number.
      return formatPriceInCurrency(v, sourceCurrency);
    },
    [currencyCode, hasSelectedCountry, rates, storeCurrency],
  );

  return {
    currencyCode,
    isDetected: !hasSelectedCountry && manual === null,
    isManual: manual !== null,
    setCurrencyCode,
    supportedCurrencies: SUPPORTED_DISPLAY_CURRENCIES,
    formatPrice,
  };
}
