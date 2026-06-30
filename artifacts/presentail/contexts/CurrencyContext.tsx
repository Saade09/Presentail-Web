import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { countryFromLocale, resolveDisplayCurrency } from "@workspace/display-currency";

import {
  CURRENCIES,
  COUNTRY_TO_CURRENCY_MAP,
  FALLBACK_CURRENCY_CODE,
  getCurrency,
  isSupportedCurrencyCode,
  type Currency,
  type CurrencyCode,
} from "@/data/currencies";
import {
  convertCurrency,
  formatCurrencyPrice,
  formatNativeAmount,
} from "@/lib/currencyFormatting";
import {
  detectGeoFromDeviceLocation,
  detectGeoFromLocation,
} from "@/services/locationCurrencyService";
import { hydrateFxRatesFromCache, refreshFxRates } from "@/services/fxRatesService";
import { useOnboarding } from "@/contexts/OnboardingContext";

const MANUAL_OVERRIDE_KEY = "@presentail/currency-manual-v1";

type CurrencyContextValue = {
  currency: Currency;
  currencyCode: CurrencyCode;
  /** Whether the active currency was picked manually by the shopper. */
  isManualOverride: boolean;
  /** Persist a manual currency pick — takes precedence over GPS/IP detection. */
  setCurrency: (code: CurrencyCode) => void;
  /** Clear the manual pick so GPS/IP detection takes over again. */
  clearManualCurrency: () => void;
  /** Convert a USD amount into the active currency, formatted with symbol/position. */
  formatPrice: (usdValue: number) => string;
  /** Format an amount that is already in the active currency (no FX conversion). */
  formatNative: (amount: number) => string;
  /** Convert a USD amount into the active currency as a number (no symbol). */
  convert: (usdValue: number) => number;
  list: Currency[];
};

export const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Display currency precedence: manual pick (persisted across launches) →
  // device-GPS country → IP-based detection → USD fallback.
  const [currencyCode, setCurrencyCodeState] = useState<CurrencyCode>(FALLBACK_CURRENCY_CODE);
  const [manualOverride, setManualOverrideState] = useState<CurrencyCode | null>(null);
  const manualOverrideRef = useRef<CurrencyCode | null>(null);
  const [manualHydrated, setManualHydrated] = useState(false);
  // Bumped after live FX rates are applied so memoized convert/formatPrice
  // recompute against the refreshed CURRENCIES table.
  const [ratesVersion, setRatesVersion] = useState(0);

  useEffect(() => {
    // Stale-while-revalidate: apply last-known cached rates immediately so the
    // first render reflects live values (not the static fallback) on warm
    // starts, then revalidate against the server in the background. Both
    // steps bump ratesVersion so memoized convert/format pick up new values.
    let cancelled = false;
    (async () => {
      const hydrated = await hydrateFxRatesFromCache();
      if (cancelled) return;
      if (hydrated) setRatesVersion((v) => v + 1);
      const refreshed = await refreshFxRates({ applyCacheFirst: false });
      if (cancelled) return;
      if (refreshed) setRatesVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate the persisted manual override eagerly so the very first paint
  // honours the shopper's earlier pick instead of flashing the auto-detected
  // currency.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(MANUAL_OVERRIDE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw && isSupportedCurrencyCode(raw)) {
          manualOverrideRef.current = raw;
          setManualOverrideState(raw);
          setCurrencyCodeState(raw);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setManualHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { needsOnboarding, hydrated: onboardingHydrated } = useOnboarding();

  useEffect(() => {
    // Don't trigger the device-location prompt before the first-run country
    // picker (Task #286) has been completed.
    if (!onboardingHydrated || needsOnboarding) return;
    if (!manualHydrated) return;
    // Skip GPS/IP detection entirely when a manual pick is already active —
    // the override is authoritative, so there's no reason to issue a
    // location prompt or hit the IP-geo upstream on launch.
    if (manualOverrideRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Gather every signal independently so the shared resolver — not
        // this hook — owns the precedence rule.
        const deviceResult = await detectGeoFromDeviceLocation();
        if (cancelled) return;
        const ipResult = await detectGeoFromLocation();
        if (cancelled) return;

        // Try to read the device locale as the lowest-priority soft signal.
        // expo-localization is imported dynamically and wrapped in try/catch so
        // a missing native module (e.g. older binary) never crashes the app.
        let localeCountry: string | null = null;
        try {
          const Localization = await import("expo-localization");
          const locales = Localization.getLocales?.() ?? [];
          const tag = locales[0]?.languageTag ?? null;
          localeCountry = countryFromLocale(tag);
        } catch {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.debug("[display-currency:mobile] expo-localization unavailable, skipping locale signal");
          }
        }

        const resolved = resolveDisplayCurrency({
          manualOverride: manualOverrideRef.current,
          savedCountry: null,
          gpsCountry: deviceResult?.countryCode ?? null,
          ipCountry: ipResult?.countryCode ?? null,
          localeCountry,
          countryToCurrency: (c) => COUNTRY_TO_CURRENCY_MAP[c] ?? null,
          isSupported: (c) => isSupportedCurrencyCode(c),
          fallback: FALLBACK_CURRENCY_CODE,
        });

        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log("[display-currency:mobile]", {
            manualOverride: manualOverrideRef.current,
            savedCountry: null,
            gpsCountry: deviceResult?.countryCode ?? null,
            ipCountry: ipResult?.countryCode ?? null,
            localeCountry,
            chosenSource: resolved.chosenSource,
            chosenCountry: resolved.chosenCountry,
            mappedCurrency: resolved.mappedCurrency,
            finalCurrency: resolved.finalCurrency,
          });
        }

        // Don't overwrite a manual pick that may have been set while
        // detection was in flight.
        if (manualOverrideRef.current) return;

        const next = isSupportedCurrencyCode(resolved.finalCurrency)
          ? (resolved.finalCurrency as CurrencyCode)
          : FALLBACK_CURRENCY_CODE;
        setCurrencyCodeState(next);
      } catch {
        // Already initialized to USD fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onboardingHydrated, needsOnboarding, manualHydrated]);

  const setCurrency = useCallback((code: CurrencyCode) => {
    if (!isSupportedCurrencyCode(code)) return;
    manualOverrideRef.current = code;
    setManualOverrideState(code);
    setCurrencyCodeState(code);
    AsyncStorage.setItem(MANUAL_OVERRIDE_KEY, code).catch(() => {});
  }, []);

  const clearManualCurrency = useCallback(() => {
    manualOverrideRef.current = null;
    setManualOverrideState(null);
    AsyncStorage.removeItem(MANUAL_OVERRIDE_KEY).catch(() => {});
    // Re-run detection so the resolved currency reverts to GPS/IP without
    // requiring an app restart. Best-effort — falls back to USD on error.
    (async () => {
      try {
        const deviceResult = await detectGeoFromDeviceLocation();
        const ipResult = await detectGeoFromLocation();
        let localeCountry: string | null = null;
        try {
          const Localization = await import("expo-localization");
          const locales = Localization.getLocales?.() ?? [];
          const tag = locales[0]?.languageTag ?? null;
          localeCountry = countryFromLocale(tag);
        } catch {
          // missing native module — locale signal skipped
        }
        const resolved = resolveDisplayCurrency({
          manualOverride: null,
          savedCountry: null,
          gpsCountry: deviceResult?.countryCode ?? null,
          ipCountry: ipResult?.countryCode ?? null,
          localeCountry,
          countryToCurrency: (c) => COUNTRY_TO_CURRENCY_MAP[c] ?? null,
          isSupported: (c) => isSupportedCurrencyCode(c),
          fallback: FALLBACK_CURRENCY_CODE,
        });
        if (manualOverrideRef.current) return;
        const next = isSupportedCurrencyCode(resolved.finalCurrency)
          ? (resolved.finalCurrency as CurrencyCode)
          : FALLBACK_CURRENCY_CODE;
        setCurrencyCodeState(next);
      } catch {
        if (!manualOverrideRef.current) setCurrencyCodeState(FALLBACK_CURRENCY_CODE);
      }
    })();
  }, []);

  // Re-derive when live FX rates land so display amounts pick up the new rate.
  const currency = useMemo(() => getCurrency(currencyCode), [currencyCode, ratesVersion]);

  const convert = useCallback(
    (usdValue: number) => convertCurrency(currency, usdValue),
    [currency],
  );

  const formatNative = useCallback(
    (amount: number) => formatNativeAmount(currency, amount),
    [currency],
  );

  const formatPrice = useCallback(
    (usdValue: number) => formatCurrencyPrice(currency, usdValue),
    [currency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      currencyCode,
      isManualOverride: manualOverride != null,
      setCurrency,
      clearManualCurrency,
      formatPrice,
      formatNative,
      convert,
      list: CURRENCIES,
    }),
    [currency, currencyCode, manualOverride, setCurrency, clearManualCurrency, formatPrice, formatNative, convert],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
