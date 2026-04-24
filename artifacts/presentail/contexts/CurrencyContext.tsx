import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { CURRENCIES, getCurrency, type Currency, type CurrencyCode } from "@/data/currencies";

const STORAGE_KEY = "@presentail/currency-v1";

type CurrencyContextValue = {
  currency: Currency;
  currencyCode: CurrencyCode;
  setCurrencyCode: (code: CurrencyCode) => void;
  /** Convert a USD amount into the active currency, formatted with symbol/position. */
  formatPrice: (usdValue: number) => string;
  /** Convert a USD amount into the active currency as a number (no symbol). */
  convert: (usdValue: number) => number;
  list: Currency[];
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencyCode, setCurrencyCodeState] = useState<CurrencyCode>("USD");
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw && CURRENCIES.some((c) => c.code === raw)) {
          setCurrencyCodeState(raw as CurrencyCode);
        }
        hydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) hydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrencyCode = useCallback((code: CurrencyCode) => {
    setCurrencyCodeState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
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
      setCurrencyCode,
      formatPrice,
      convert,
      list: CURRENCIES,
    }),
    [currency, currencyCode, setCurrencyCode, formatPrice, convert],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
