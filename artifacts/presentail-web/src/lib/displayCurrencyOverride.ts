import { createContext, useContext } from "react";

export type DisplayCurrencyOverrideValue = {
  currencyCode?: string;
  isDetected?: boolean;
  isManual?: boolean;
  isManualPersistent?: boolean;
  setCurrencyCode?: (code: string, options?: { persist?: boolean }) => void;
  setManualPersistent?: (persistent: boolean) => void;
  clearManualCurrency?: () => void;
  supportedCurrencies?: { code: string; name: string }[];
  formatPrice?: (usdValue: number) => string;
};

export const DisplayCurrencyOverrideContext =
  createContext<DisplayCurrencyOverrideValue | null>(null);

export function useDisplayCurrencyOverride(): DisplayCurrencyOverrideValue | null {
  return useContext(DisplayCurrencyOverrideContext);
}
