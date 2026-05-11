import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  CURRENCIES,
  FALLBACK_CURRENCY_CODE,
  getCurrency,
  type Currency,
  type CurrencyCode,
} from "@/data/currencies";
import {
  detectCurrencyFromLocation,
  detectGeoFromDeviceLocation,
} from "@/services/locationCurrencyService";
import { hydrateFxRatesFromCache, refreshFxRates } from "@/services/fxRatesService";

type CurrencyContextValue = {
  currency: Currency;
  currencyCode: CurrencyCode;
  /** Convert a USD amount into the active currency, formatted with symbol/position. */
  formatPrice: (usdValue: number) => string;
  /** Format an amount that is already in the active currency (no FX conversion). */
  formatNative: (amount: number) => string;
  /** Convert a USD amount into the active currency as a number (no symbol). */
  convert: (usdValue: number) => number;
  list: Currency[];
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Display currency is derived from the user's location every launch — never
  // persisted and never manually overridable. Precedence: device-GPS country
  // → IP-based detection → USD fallback.
  const [currencyCode, setCurrencyCodeState] = useState<CurrencyCode>(FALLBACK_CURRENCY_CODE);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let detected: CurrencyCode = FALLBACK_CURRENCY_CODE;
        const deviceResult = await detectGeoFromDeviceLocation();
        if (cancelled) return;
        if (deviceResult) {
          detected = deviceResult.currencyCode;
        } else {
          detected = await detectCurrencyFromLocation();
          if (cancelled) return;
        }
        setCurrencyCodeState(detected);
      } catch {
        // Already initialized to USD fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-derive when live FX rates land so display amounts pick up the new rate.
  const currency = useMemo(() => getCurrency(currencyCode), [currencyCode, ratesVersion]);

  const convert = useCallback(
    (usdValue: number) => {
      const v = Number(usdValue) || 0;
      return v * currency.rate;
    },
    [currency.rate],
  );

  const formatNative = useCallback(
    (amount: number) => {
      const v = Number(amount) || 0;
      const fixed = currency.decimals > 0 ? v.toFixed(currency.decimals) : Math.round(v).toString();
      const [intPart, decPart] = fixed.split(".");
      const withSep = Number(intPart).toLocaleString();
      const numStr = decPart != null ? `${withSep}.${decPart}` : withSep;
      const sep = currency.spaceBetween ? " " : "";
      if (currency.symbolPosition === "left") {
        return `${currency.symbol}${sep}${numStr}`;
      }
      return `${numStr}${sep}${currency.symbol}`;
    },
    [currency],
  );

  const formatPrice = useCallback(
    (usdValue: number) => {
      const v = convert(usdValue);
      return formatNative(v);
    },
    [convert, formatNative],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      currencyCode,
      formatPrice,
      formatNative,
      convert,
      list: CURRENCIES,
    }),
    [currency, currencyCode, formatPrice, formatNative, convert],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
