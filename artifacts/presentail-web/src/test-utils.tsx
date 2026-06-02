import React, { type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleContext } from "@/contexts/LocaleContext";
import { CartContext, type CartContextType } from "@/contexts/CartContext";
import { AuthOverrideContext, type AuthContextValue } from "@/contexts/AuthContext";
import {
  DisplayCurrencyOverrideContext,
  type DisplayCurrencyOverrideValue,
} from "@/lib/displayCurrencyOverride";

// ---------------------------------------------------------------------------
// Default locale
// ---------------------------------------------------------------------------

export const DEFAULT_LOCALE = {
  language: "en" as const,
  setLanguage: () => {},
  dir: "ltr" as const,
  t: (key: string) => key,
  countryName: (_code: string, fallback: string) => fallback,
  cityName: (_id: string, fallback: string) => fallback,
};

// ---------------------------------------------------------------------------
// Default auth — signed-out, not loading
// ---------------------------------------------------------------------------

export const DEFAULT_AUTH: AuthContextValue = {
  user: null,
  token: null,
  isLoading: false,
  logout: async () => {},
  getToken: async () => null,
  userType: null,
};

// ---------------------------------------------------------------------------
// Default cart — empty basket
// ---------------------------------------------------------------------------

export const DEFAULT_CART: CartContextType = {
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  subtotal: 0,
  itemCount: 0,
  isHydrated: true,
};

// ---------------------------------------------------------------------------
// Default currency — USD, simple formatter
// ---------------------------------------------------------------------------

export const DEFAULT_CURRENCY: DisplayCurrencyOverrideValue = {
  currencyCode: "USD",
  isDetected: true,
  isManual: false,
  isManualPersistent: false,
  setCurrencyCode: () => {},
  setManualPersistent: () => {},
  clearManualCurrency: () => {},
  supportedCurrencies: [],
  formatPrice: (v: number) => `$${v}`,
};

// ---------------------------------------------------------------------------
// Provider option types
// ---------------------------------------------------------------------------

type LocaleOverride = Partial<typeof DEFAULT_LOCALE>;
type AuthOverride = Partial<AuthContextValue>;
type CartOverride = Partial<CartContextType>;
type CurrencyOverride = Partial<DisplayCurrencyOverrideValue>;

export type ProviderOptions = {
  locale?: LocaleOverride;
  auth?: AuthOverride;
  cart?: CartOverride;
  currency?: CurrencyOverride;
};

// ---------------------------------------------------------------------------
// Wrapper factory
// ---------------------------------------------------------------------------

function createWrapper({ locale, auth, cart, currency }: ProviderOptions = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const localeValue = { ...DEFAULT_LOCALE, ...locale };
  const authValue = { ...DEFAULT_AUTH, ...auth };
  const cartValue = { ...DEFAULT_CART, ...cart };
  // Only inject the currency override context when explicitly requested.
  // When undefined, the real useDisplayCurrency hook runs (hook returns its
  // own fallback if no DisplayCurrencyOverrideContext is present).
  const currencyValue: DisplayCurrencyOverrideValue | null =
    currency !== undefined ? { ...DEFAULT_CURRENCY, ...currency } : DEFAULT_CURRENCY;

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthOverrideContext.Provider value={authValue}>
          <CartContext.Provider value={cartValue}>
            <DisplayCurrencyOverrideContext.Provider value={currencyValue}>
              <LocaleContext.Provider value={localeValue}>
                {children}
              </LocaleContext.Provider>
            </DisplayCurrencyOverrideContext.Provider>
          </CartContext.Provider>
        </AuthOverrideContext.Provider>
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
): RenderResult {
  const { locale, auth, cart, currency, ...renderOptions } = options;
  return render(ui, {
    wrapper: createWrapper({ locale, auth, cart, currency }),
    ...renderOptions,
  });
}
