import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useFxRates } from "./queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  currencyForStoreCountry,
  formatPriceInCurrency,
} from "./currency";

const DETECTED_CURRENCY_KEY = "presentail_display_currency_v1";

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

/**
 * Resolves the currency the visitor should see prices in.
 *
 * Priority:
 *   1. If the visitor has explicitly selected a delivery country, that
 *      country's native currency is used so cart, storefront and checkout
 *      stay consistent (no FX conversion — `priceValue` already reflects
 *      that store's currency).
 *   2. Otherwise, an IP-based detected currency from `/api/geo/currency` is
 *      used (cached in `localStorage`). `priceValue` then comes from the
 *      default Lebanon (USD) store and is FX-converted on the fly.
 *   3. While detection is in flight, the last-known cached value (or USD)
 *      is used so first paint never blocks on the network.
 */
export function useDisplayCurrency(): {
  currencyCode: string;
  isDetected: boolean;
  formatPrice: (storeCurrencyValue: number) => string;
} {
  const { countryCode } = useLocationSelection();
  const hasSelectedCountry = !!countryCode;
  const storeCurrency = currencyForStoreCountry(countryCode);

  const [detected, setDetected] = useState<string | null>(() =>
    readDetectedCurrency(),
  );

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

  const currencyCode = hasSelectedCountry ? storeCurrency : (detected ?? "USD");

  const formatPrice = (storeCurrencyValue: number) => {
    const v = Number(storeCurrencyValue) || 0;
    if (hasSelectedCountry) {
      // Value is already in the store's (= display) currency — show as-is.
      return formatPriceInCurrency(v, currencyCode);
    }
    // Default Lebanon store: priceValue is USD. Convert to the detected
    // display currency using the same live FX rates the server uses.
    const rate =
      currencyCode === "USD" ? 1 : Number(rates?.[currencyCode] ?? 0);
    const converted = rate > 0 ? v * rate : v;
    return formatPriceInCurrency(converted, currencyCode);
  };

  return {
    currencyCode,
    isDetected: !hasSelectedCountry,
    formatPrice,
  };
}
