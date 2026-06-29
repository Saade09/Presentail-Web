import React, { type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleContext, type Language } from "@/contexts/LocaleContext";
import { CartContext, type CartContextType } from "@/contexts/CartContext";
import { AuthOverrideContext, type AuthContextValue } from "@/contexts/AuthContext";
import {
  DisplayCurrencyOverrideContext,
  type DisplayCurrencyOverrideValue,
} from "@/lib/displayCurrencyOverride";

export const DEFAULT_LOCALE: {
  language: Language;
  setLanguage: (l: Language) => void;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  countryName: (_code: string, fallback: string) => string;
  cityName: (_id: string, fallback: string) => string;
} = {
  language: "en",
  setLanguage: () => {},
  dir: "ltr",
  t: (key: string) => key,
  countryName: (_code: string, fallback: string) => fallback,
  cityName: (_id: string, fallback: string) => fallback,
};

export const DEFAULT_AUTH: AuthContextValue = {
  user: null,
  token: null,
  isLoading: false,
  logout: async () => {},
  deleteAccount: async () => ({ ok: false, message: "Not signed in" }),
  getToken: async () => null,
  userType: null,
  provider: null,
  login: () => {},
  updateUser: () => {},
};

export const DEFAULT_CART: CartContextType = {
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  updateCustomNote: () => {},
  clearCart: () => {},
  subtotal: 0,
  itemCount: 0,
  isHydrated: true,
};

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

function createWrapper({ locale, auth, cart, currency }: ProviderOptions = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const localeValue = { ...DEFAULT_LOCALE, ...locale };
  const authValue = { ...DEFAULT_AUTH, ...auth };
  const cartValue = { ...DEFAULT_CART, ...cart };
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
