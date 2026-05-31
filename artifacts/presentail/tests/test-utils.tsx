/**
 * Mobile test utilities.
 *
 * Usage
 * -----
 * Import `renderWithProviders` instead of a plain `render` call in any
 * component test that touches auth, language, currency, or cart state.
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
 * Implementation note
 * -------------------
 * This helper uses react-test-renderer (plain CJS, works in Node.js without any
 * native modules) rather than @testing-library/react-native. RNTL's compiled
 * build internally requires the real react-native package via CJS, which in turn
 * has Flow-typed source that Node.js/Vite cannot parse. react-test-renderer has
 * no such dependency and renders the same component tree faithfully.
 *
 * The wrapper bypasses the real providers (which depend on AsyncStorage,
 * expo-secure-store, etc.) by injecting context values directly, keeping
 * component tests fast and free of native-module errors.
 */

import React, { act, type ReactNode } from "react";
import * as ReactTestRenderer from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthContext } from "@/contexts/AuthContext";
import type { AuthState } from "@/contexts/AuthContext";
import { LanguageContext } from "@/contexts/LanguageContext";
import { CurrencyContext } from "@/contexts/CurrencyContext";
import { CartContext } from "@/contexts/CartContext";
import type { CartContextValue } from "@/contexts/CartContext";
import type { Currency, CurrencyCode } from "@/data/currencies";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider wrapper
// ---------------------------------------------------------------------------

type AuthOverride = Partial<AuthState>;
type LanguageOverride = Partial<typeof DEFAULT_LANGUAGE>;
type CurrencyOverride = Partial<typeof DEFAULT_CURRENCY>;
type CartOverride = Partial<CartContextValue>;

export type ProviderOptions = {
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

// ---------------------------------------------------------------------------
// Text-search utilities over react-test-renderer's toJSON() output
// ---------------------------------------------------------------------------

type JsonNode = ReactTestRenderer.ReactTestRendererJSON;
type JsonChild = JsonNode | string;

function getTextContent(node: JsonChild | null | undefined): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (!node.children) return "";
  return node.children.map((c: JsonChild) => getTextContent(c)).join("");
}

function findNodeByText(
  node: JsonChild | JsonChild[] | null | undefined,
  search: string | RegExp,
): JsonChild | null {
  if (!node) return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeByText(child, search);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof node === "string") {
    return (search instanceof RegExp ? search.test(node) : node === search) ? node : null;
  }

  const text = getTextContent(node);
  if (text !== "") {
    const matches = search instanceof RegExp ? search.test(text) : text === search;
    if (matches) return node;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByText(child as JsonChild, search);
      if (found !== null) return found;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// RenderResult — subset of @testing-library/react-native's API
// ---------------------------------------------------------------------------

export type RenderResult = {
  /** Find the first element whose full text content equals or matches `text`. Throws if not found. */
  getByText(text: string | RegExp): JsonChild;
  /** Same as getByText but returns null instead of throwing when not found. */
  queryByText(text: string | RegExp): JsonChild | null;
  /** Returns the raw react-test-renderer JSON for custom assertions. */
  toJSON(): JsonNode | JsonNode[] | null;
};

// ---------------------------------------------------------------------------
// renderWithProviders
// ---------------------------------------------------------------------------

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions = {},
): RenderResult {
  const { auth, language, currency, cart } = options;
  const Wrapper = createWrapper({ auth, language, currency, cart });

  let instance!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    instance = ReactTestRenderer.create(
      React.createElement(Wrapper, null, ui),
    );
  });

  function getRootJSON() {
    return instance.toJSON() as JsonNode | JsonNode[] | null;
  }

  return {
    getByText(text: string | RegExp): JsonChild {
      const json = getRootJSON();
      const found = findNodeByText(json as JsonChild[] | null, text);
      if (found === null) {
        throw new Error(
          `Unable to find an element with the text: ${String(text)}\n\n` +
          `Rendered output:\n${JSON.stringify(getRootJSON(), null, 2)}`,
        );
      }
      return found;
    },
    queryByText(text: string | RegExp): JsonChild | null {
      return findNodeByText(getRootJSON() as JsonChild[] | null, text);
    },
    toJSON(): JsonNode | JsonNode[] | null {
      return getRootJSON();
    },
  };
}
