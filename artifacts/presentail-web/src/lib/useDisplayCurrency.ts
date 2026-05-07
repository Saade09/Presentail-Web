import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useFxRates } from "./queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  currencyForStoreCountry,
  formatPriceInCurrency,
} from "./currency";

const DETECTED_CURRENCY_KEY = "presentail_display_currency_v1";
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

type GeoCurrencyResponse = {
  countryCode: string | null;
  currencyCode: string;
};

function readDetectedCurrency(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(DETECTED_CURRENCY_KEY);
    return v && /^[A-Z]{3}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function writeDetectedCurrency(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DETECTED_CURRENCY_KEY, code);
  } catch {
    // best-effort persistence
  }
}

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

/**
 * Resolves the currency the visitor should see prices in.
 *
 * Priority:
 *   1. A manual session-scoped override (e.g. the product-page currency
 *      switcher). Always wins so the visitor's explicit pick sticks while
 *      they browse.
 *   2. If the visitor has explicitly selected a delivery country, that
 *      country's native currency is used so cart, storefront and checkout
 *      stay consistent (no FX conversion — `priceValue` already reflects
 *      that store's currency).
 *   3. Otherwise, an IP-based detected currency from `/api/geo/currency` is
 *      used (cached in `localStorage`). `priceValue` then comes from the
 *      default Lebanon (USD) store and is FX-converted on the fly.
 *   4. While detection is in flight, the last-known cached value (or USD)
 *      is used so first paint never blocks on the network.
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

  const [detected, setDetected] = useState<string | null>(() =>
    readDetectedCurrency(),
  );
  const [manual, setManual] = useState<string | null>(() => readManualCurrency());

  // Only call the geo endpoint when we don't have a manually-selected country
  // — the country picker fully determines display currency in that case.
  const { data } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<GeoCurrencyResponse>("/geo/currency"),
    enabled: !hasSelectedCountry,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  useEffect(() => {
    const next = data?.currencyCode;
    if (typeof next === "string" && /^[A-Z]{3}$/.test(next) && next !== detected) {
      setDetected(next);
      writeDetectedCurrency(next);
    }
  }, [data?.currencyCode, detected]);

  const { data: fxData } = useFxRates();
  const rates = fxData?.rates ?? {};

  const baseCurrency = hasSelectedCountry ? storeCurrency : (detected ?? "USD");
  const currencyCode = manual ?? baseCurrency;

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
