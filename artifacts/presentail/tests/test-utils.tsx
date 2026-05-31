/**
 * Mobile test utilities — mirrors `artifacts/presentail-web/src/test-utils.tsx`.
 *
 * Usage
 * -----
 * Import `renderWithProviders` instead of `@testing-library/react-native`'s
 * plain `render` in any component test that touches auth, language, currency,
 * or cart state.
 *
 *   import { renderWithProviders } from "../test-utils";
 *
 *   it("shows sign-in button for guests", () => {
 *     const { getByText } = renderWithProviders(<MyComponent />);
 *     expect(getByText("Sign in")).toBeTruthy();
 *   });
 *
 * Override individual context values via the options object:
 *
 *   renderWithProviders(<MyComponent />, {
 *     auth: { user: { id: 1, email: "a@b.com", firstName: "A", lastName: "B" }, ready: true, token: "tok" },
 *     language: { lang: "AR", isRTL: true },
 *     currency: { currencyCode: "LBP", formatPrice: (v) => `LBP ${v}` },
 *     cart: { items: [{ productId: "abc", qty: 2 }], count: 2 },
 *   });
 *
 * All four stubs default to a sensible "guest / EN / USD / empty cart" baseline,
 * so tests only need to supply the fields that are relevant to the scenario.
 *
 * The wrapper bypasses the real providers (which depend on AsyncStorage,
 * expo-secure-store, etc.) by injecting context values directly, keeping
 * component tests fast and free of native-module errors.
 */

import React, { type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthContext } from "@/contexts/AuthContext";
import type { AuthState } from "@/contexts/AuthContext";
import { LanguageContext } from "@/contexts/LanguageContext";
import { CurrencyContext } from "@/contexts/CurrencyContext";
import { CartContext } from "@/contexts/CartContext";
import type { CartContextValue } from "@/contexts/CartContext";
import type { Currency, CurrencyCode } from "@/data/currencies";

const USD_CURRENCY: Currency = {
  code: "USD",
  name: "US Dollar",
  flag: "🇺🇸",
  symbol: "$",
  symbolPosition: "left",
  spaceBetween: false,
  rate: 1,
  decimals: 2,
};

export const DEFAULT_AUTH: AuthState = {
  ready: true,
  user: null,
  token: null,
  login: async () => ({ ok: false, message: "mocked" }),
  register: async () => ({ ok: false, message: "mocked" }),
  applySession: async () => {},
  logout: async () => {},
  deleteAccount: async () => ({ ok: false, message: "mocked" }),
  updateProfile: async () => ({ ok: false, message: "mocked" }),
};

export const DEFAULT_LANGUAGE = {
  lang: "EN" as const,
  setLang: () => {},
  isRTL: false,
  isReady: true,
};

export const DEFAULT_CURRENCY = {
  currency: USD_CURRENCY,
  currencyCode: "USD" as CurrencyCode,
  isManualOverride: false,
  setCurrency: () => {},
  clearManualCurrency: () => {},
  formatPrice: (usd: number) => `$${usd.toFixed(2)}`,
  formatNative: (amount: number) => `$${amount.toFixed(2)}`,
  convert: (usd: number) => usd,
  list: [USD_CURRENCY],
};

export const DEFAULT_CART: CartContextValue = {
  items: [],
  count: 0,
  total: 0,
  add: () => {},
  remove: () => {},
  setQty: () => {},
  clear: () => {},
  onClear: () => () => {},
  detailed: [],
  isCartOpen: false,
  openCart: () => {},
  closeCart: () => {},
  pendingNavigation: null,
  requestNavigation: () => {},
  clearPendingNavigation: () => {},
  cartMessage: null,
  setCartMessage: () => {},
};

type AuthOverride = Partial<AuthState>;
type LanguageOverride = Partial<typeof DEFAULT_LANGUAGE>;
type CurrencyOverride = Partial<typeof DEFAULT_CURRENCY>;
type CartOverride = Partial<CartContextValue>;

type ProviderOptions = {
  auth?: AuthOverride;
  language?: LanguageOverride;
  currency?: CurrencyOverride;
  cart?: CartOverride;
};

function createWrapper({ auth, language, currency, cart }: ProviderOptions = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const authValue = { ...DEFAULT_AUTH, ...auth };
  const languageValue = { ...DEFAULT_LANGUAGE, ...language };
  const currencyValue = { ...DEFAULT_CURRENCY, ...currency };
  const cartValue = { ...DEFAULT_CART, ...cart };

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={authValue}>
          <LanguageContext.Provider value={languageValue}>
            <CurrencyContext.Provider value={currencyValue}>
              <CartContext.Provider value={cartValue}>
                {children}
              </CartContext.Provider>
            </CurrencyContext.Provider>
          </LanguageContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
): RenderResult {
  const { auth, language, currency, cart, ...renderOptions } = options;
  return render(ui, { wrapper: createWrapper({ auth, language, currency, cart }), ...renderOptions });
}
