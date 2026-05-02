import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  CURRENCIES,
  FALLBACK_CURRENCY_CODE,
  getCurrency,
  isSupportedCurrencyCode,
  type Currency,
  type CurrencyCode,
} from "@/data/currencies";
import { detectCurrencyFromLocation } from "@/services/locationCurrencyService";

const STORAGE_KEY = "@presentail/currency-v1";
const SOURCE_KEY = "@presentail/currency-source-v1";

type CurrencySource = "manual" | "auto";

type CurrencyContextValue = {
  currency: Currency;
  currencyCode: CurrencyCode;
  source: CurrencySource;
  setCurrencyCode: (code: CurrencyCode) => void;
  /** Convert a USD amount into the active currency, formatted with symbol/position. */
  formatPrice: (usdValue: number) => string;
  /** Convert a USD amount into the active currency as a number (no symbol). */
  convert: (usdValue: number) => number;
  list: Currency[];
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencyCode, setCurrencyCodeState] = useState<CurrencyCode>(FALLBACK_CURRENCY_CODE);
  const [source, setSource] = useState<CurrencySource>("auto");
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [savedCode, savedSource] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SOURCE_KEY),
        ]);

        if (cancelled) return;

        // Manual selection always wins — never overwrite with auto-detection.
        if (savedSource === "manual" && isSupportedCurrencyCode(savedCode)) {
          setCurrencyCodeState(savedCode);
          setSource("manual");
          hydrated.current = true;
          return;
        }

        // Otherwise: detect from IP. Use the previously detected value as a
        // fast first paint while detection runs (avoids flicker on cold start).
        if (isSupportedCurrencyCode(savedCode)) {
          setCurrencyCodeState(savedCode);
        }

        const detected = await detectCurrencyFromLocation();
        if (cancelled) return;

        setCurrencyCodeState(detected);
        setSource("auto");
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEY, detected),
          AsyncStorage.setItem(SOURCE_KEY, "auto"),
        ]).catch(() => {});
      } catch {
        // Fall through with the default fallback already in state.
      } finally {
        hydrated.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrencyCode = useCallback((code: CurrencyCode) => {
    setCurrencyCodeState(code);
    setSource("manual");
    Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, code),
      AsyncStorage.setItem(SOURCE_KEY, "manual"),
    ]).catch(() => {});
  }, []);

  const currency = useMemo(() => getCurrency(currencyCode), [currencyCode]);

  const convert = useCallback(
    (usdValue: number) => {
      const v = Number(usdValue) || 0;
      return v * currency.rate;
    },
    [currency.rate],
  );

  const formatPrice = useCallback(
    (usdValue: number) => {
      const v = convert(usdValue);
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
    [convert, currency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      currencyCode,
      source,
      setCurrencyCode,
      formatPrice,
      convert,
      list: CURRENCIES,
    }),
    [currency, currencyCode, source, setCurrencyCode, formatPrice, convert],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
