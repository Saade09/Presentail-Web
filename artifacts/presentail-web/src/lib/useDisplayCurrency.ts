import { useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  countryFromLocale,
  resolveDisplayCurrency,
} from "@workspace/display-currency";
import { apiFetch } from "./api";
import { useCurrenciesData, useFxRates } from "./queries";
import { LocationContext } from "@/contexts/LocationContext";
import {
  DisplayCurrencyOverrideContext,
} from "./displayCurrencyOverride";
import {
  formatPriceInCurrency,
  getCurrencySnapshot,
  subscribeCurrencySnapshot,
} from "./currency";
import {
  readManualCurrency,
  writeManualCurrency,
  subscribeManualCurrency,
} from "./displayCurrencyStorage";

export {
  readManualCurrency,
  writeManualCurrency,
  MANUAL_CURRENCY_KEY,
  MANUAL_CURRENCY_PERSISTENT_KEY,
} from "./displayCurrencyStorage";
export { DisplayCurrencyOverrideContext } from "./displayCurrencyOverride";
export type { DisplayCurrencyOverrideValue } from "./displayCurrencyOverride";

function useCurrencyTables() {
  return useSyncExternalStore(
    subscribeCurrencySnapshot,
    getCurrencySnapshot,
    getCurrencySnapshot,
  );
}

// Legacy localStorage key for the auto-detected currency. We no longer write
// to it (auto-detection runs fresh on every page load now), and on first
// hook mount we proactively clear any leftover value so existing visitors
// stop seeing a stale currency from a previous visit / location.
const LEGACY_DETECTED_CURRENCY_KEY = "presentail_display_currency_v1";

/**
 * All currencies supported by the mobile app (sourced from
 * `@workspace/catalog-data`). The picker display names come from the
 * runtime currency snapshot (i.e. the API's `/currencies` payload).
 */
const PICKER_CURRENCY_CODES = [
  "USD",
  "AED",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "QAR",
  "SAR",
  "CHF",
] as const;

const SUPPORTED_CODES = new Set<string>(PICKER_CURRENCY_CODES);

type GeoCurrencyResponse = {
  countryCode: string | null;
  currencyCode: string;
};

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
const DEFAULT_NOOP = () => {};

export function useDisplayCurrency(): {
  currencyCode: string;
  isDetected: boolean;
  isManual: boolean;
  isManualPersistent: boolean;
  setCurrencyCode: (code: string, options?: { persist?: boolean }) => void;
  setManualPersistent: (persistent: boolean) => void;
  clearManualCurrency: () => void;
  supportedCurrencies: { code: string; name: string }[];
  formatPrice: (usdValue: number) => string;
} {
  // Test override: when a DisplayCurrencyOverrideContext.Provider wraps the
  // component, return the injected value directly. All other hooks below are
  // still called unconditionally (React rules of hooks); their results are
  // simply ignored when the override is active.
  const override = useContext(DisplayCurrencyOverrideContext);

  // Use LocationContext directly (non-throwing) so this hook can run in test
  // environments that don't mount a full LocationProvider.
  const locationCtx = useContext(LocationContext);
  const countryCode = locationCtx?.countryCode ?? null;
  const hasSelectedCountry = !!countryCode;
  const snapshot = useCurrencyTables();
  useCurrenciesData();

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

  const countryToCurrency = useCallback(
    (country: string): string | null => {
      const upper = country.toUpperCase();
      // Prefer the server's pre-computed currency for the IP-detected country.
      // The server-side map covers all supported regions (Eurozone, CHF, etc.)
      // while the web snapshot only ships the picker's ~10 entries.
      if (
        data?.countryCode &&
        upper === data.countryCode.toUpperCase() &&
        typeof data.currencyCode === "string"
      ) {
        return data.currencyCode;
      }
      return snapshot.countryToCurrency[upper] ?? null;
    },
    [snapshot, data?.countryCode, data?.currencyCode],
  );
  const isFormattable = useCallback(
    (currency: string): boolean =>
      snapshot.currencies.some((c) => c.code === currency),
    [snapshot],
  );
  const supportedCurrencies = useMemo<{ code: string; name: string }[]>(
    () =>
      PICKER_CURRENCY_CODES.map((code) => {
        const c = snapshot.currencies.find((cc) => cc.code === code);
        return { code, name: c?.name ?? code };
      }),
    [snapshot],
  );

  // Shared external store — all useDisplayCurrency callers across the tree
  // re-render together when any one of them (e.g. the footer switcher) writes a
  // new manual currency. Without this, each caller has its own useState copy
  // and writing in one component is invisible to the others.
  const manual = useSyncExternalStore(
    subscribeManualCurrency,
    readManualCurrency,
    () => null, // SSR snapshot — no storage available server-side
  );

  // One-shot cleanup of the legacy persisted value so existing visitors
  // don't keep seeing a stale auto-detected currency from a previous visit.
  useEffect(() => {
    clearLegacyDetectedCurrency();
  }, []);

  const { data: fxData } = useFxRates();
  const rates = fxData?.rates ?? {};

  const localeCountry = useMemo(() => readBrowserLocaleCountry(), []);

  const manualCode = manual?.code ?? null;
  const resolved = useMemo(
    () =>
      resolveDisplayCurrency({
        manualOverride: manualCode,
        savedCountry: hasSelectedCountry ? countryCode : null,
        gpsCountry: null,
        ipCountry: data?.countryCode ?? null,
        localeCountry,
        countryToCurrency,
        isSupported: isFormattable,
        fallback: "USD",
      }),
    [manualCode, hasSelectedCountry, countryCode, data?.countryCode, localeCountry, countryToCurrency, isFormattable],
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

  // After all hooks are called (rules of hooks satisfied), return the test
  // override if one was injected via DisplayCurrencyOverrideContext.
  if (override) {
    return {
      currencyCode: "USD",
      isDetected: true,
      isManual: false,
      isManualPersistent: false,
      setCurrencyCode: DEFAULT_NOOP,
      setManualPersistent: DEFAULT_NOOP,
      clearManualCurrency: DEFAULT_NOOP,
      supportedCurrencies: [],
      formatPrice: (v: number) => `$${v}`,
      ...override,
    };
  }

  const setCurrencyCode = useCallback(
    (code: string, options?: { persist?: boolean }) => {
      if (!SUPPORTED_CODES.has(code)) return;
      const prev = readManualCurrency();
      const persistent =
        typeof options?.persist === "boolean"
          ? options.persist
          : prev?.persistent ?? false;
      writeManualCurrency({ code, persistent });
    },
    [],
  );

  const setManualPersistent = useCallback((persistent: boolean) => {
    const prev = readManualCurrency();
    if (!prev) return;
    if (prev.persistent === persistent) return;
    writeManualCurrency({ code: prev.code, persistent });
  }, []);

  const clearManualCurrency = useCallback(() => {
    writeManualCurrency(null);
  }, []);

  const formatPrice = useCallback(
    (usdValue: number) => {
      const v = Number(usdValue) || 0;
      // All product prices from the Presentail OS API are denominated in USD
      // regardless of the delivery country or WooCommerce store. Always
      // convert from USD → the visitor's display currency using live FX rates.
      if (currencyCode === "USD") {
        return formatPriceInCurrency(v, "USD");
      }

      // Convert USD -> display currency using live FX rates (server-supplied,
      // same rates the mobile app and server use for billing).
      const targetRate = Number(rates?.[currencyCode] ?? 0);
      if (targetRate > 0) {
        return formatPriceInCurrency(v * targetRate, currencyCode);
      }
      // FX rates not yet available — show USD as fallback rather than a
      // misleading converted number.
      return formatPriceInCurrency(v, "USD");
    },
    [currencyCode, rates],
  );

  return {
    currencyCode,
    isDetected: !hasSelectedCountry && manual === null,
    isManual: manual !== null,
    isManualPersistent: manual?.persistent === true,
    setCurrencyCode,
    setManualPersistent,
    clearManualCurrency,
    supportedCurrencies,
    formatPrice,
  };
}
