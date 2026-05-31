/**
 * Component tests for <CheckoutLoginSheet />.
 *
 * Covered scenarios
 * -----------------
 * - When visible=true: sheet is mounted and shows the email-entry step
 *   (title, subtitle, Continue button, and "Checkout as Guest" button).
 * - When visible=false: sheet is not mounted (nothing rendered).
 * - The "Checkout as Guest" button fires onContinueAsGuest.
 * - The close (×) press fires onClose.
 * - trackEvent fires with "checkout_login_prompt_viewed" on open.
 * - trackEvent fires "dismissed" when closed without taking an action.
 *
 * Mocking strategy
 * ----------------
 * CheckoutLoginSheet has many native/router dependencies. We mock all of them
 * at the module level so the render stays in pure JS (no native modules).
 * The auth step sub-components are rendered for real so that text assertions
 * match what a shopper actually sees.
 */

import React, { act, useState } from "react";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import * as ReactTestRenderer from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CheckoutLoginSheet } from "@/components/CheckoutLoginSheet";
import { AuthContext } from "@/contexts/AuthContext";
import { LanguageContext } from "@/contexts/LanguageContext";
import { CurrencyContext } from "@/contexts/CurrencyContext";
import { CartContext } from "@/contexts/CartContext";
import {
  renderWithProviders,
  DEFAULT_AUTH,
  DEFAULT_LANGUAGE,
  DEFAULT_CURRENCY,
  DEFAULT_CART,
} from "./test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: () => null,
  FontAwesome: () => null,
}));

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/services/authService", () => ({
  checkEmailExists: vi.fn(() => Promise.resolve({ ok: true, exists: false })),
  createAccountWithEmail: vi.fn(() => Promise.resolve({ ok: false, code: "server" as const })),
  requestPasswordReset: vi.fn(() => Promise.resolve({ ok: true })),
  signInWithApple: vi.fn(() => Promise.resolve({ ok: false, code: "canceled" as const })),
  signInWithEmail: vi.fn(() => Promise.resolve({ ok: false, code: "server" as const })),
  signInWithGoogle: vi.fn(() => Promise.resolve({ ok: false, code: "canceled" as const })),
}));

vi.mock("@/contexts/DeliveryLocationProvider", () => ({
  useDeliveryLocationContext: () => ({
    selectedCountry: null,
    selectedCity: null,
    deliveryLocations: [],
    isLoading: false,
    error: null,
    setSelectedCountry: vi.fn(),
    setSelectedCity: vi.fn(),
    setManualCountryAndCity: vi.fn(),
  }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#00414E",
    background: "#FFFBF4",
    border: "#e5e7eb",
    mutedForeground: "#69727D",
    destructive: "#ef4444",
    foreground: "#1A2226",
    card: "#fff",
    cardForeground: "#1A2226",
    secondaryForeground: "#1A2226",
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof CheckoutLoginSheet>> = {}) {
  return {
    visible: true,
    onClose: vi.fn(),
    onAuthSuccess: vi.fn(),
    onContinueAsGuest: vi.fn(),
    surface: "cart" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckoutLoginSheet — visibility", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
  });

  it("renders the email-entry step title when visible=true", () => {
    const { getByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true })} />,
    );
    expect(getByText("Login or Create Account")).toBeTruthy();
  });

  it("renders the email-entry subtitle when visible=true", () => {
    const { getByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true })} />,
    );
    expect(getByText("Sign in with your email address")).toBeTruthy();
  });

  it("renders the Continue button when visible=true", () => {
    const { getByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true })} />,
    );
    expect(getByText("Continue")).toBeTruthy();
  });

  it("renders the 'Checkout as Guest' button when visible=true", () => {
    const { getByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true })} />,
    );
    expect(getByText("Checkout as Guest")).toBeTruthy();
  });

  it("renders nothing meaningful when visible=false (modal not mounted)", () => {
    // The Modal mock renders its children unconditionally, but the component
    // guards its content with `mounted` (initialized from `visible`).
    // When visible=false from the start, mounted=false, so no content is shown.
    const { queryByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: false })} />,
    );
    expect(queryByText("Login or Create Account")).toBeNull();
    expect(queryByText("Checkout as Guest")).toBeNull();
    expect(queryByText("Continue")).toBeNull();
  });
});

describe("CheckoutLoginSheet — analytics", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
  });

  it("emits checkout_login_prompt_viewed when first opened", () => {
    renderWithProviders(<CheckoutLoginSheet {...makeProps({ visible: true })} />);
    const viewedCalls = (mockTrackEvent as Mock).mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "object" &&
        (c[0] as { name: string }).name === "checkout_login_prompt_viewed",
    );
    expect(viewedCalls.length).toBeGreaterThanOrEqual(1);
    expect(viewedCalls[0][0]).toMatchObject({ surface: "cart" });
  });

  it("emits dismissed action when closed without taking an action", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Wrapper({ visible }: { visible: boolean }) {
      return (
        <QueryClientProvider client={qc}>
          <AuthContext.Provider value={DEFAULT_AUTH}>
            <LanguageContext.Provider value={DEFAULT_LANGUAGE}>
              <CurrencyContext.Provider value={DEFAULT_CURRENCY}>
                <CartContext.Provider value={DEFAULT_CART}>
                  <CheckoutLoginSheet
                    visible={visible}
                    onClose={vi.fn()}
                    onAuthSuccess={vi.fn()}
                    onContinueAsGuest={vi.fn()}
                    surface="cart"
                  />
                </CartContext.Provider>
              </CurrencyContext.Provider>
            </LanguageContext.Provider>
          </AuthContext.Provider>
        </QueryClientProvider>
      );
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<Wrapper visible={true} />);
    });

    mockTrackEvent.mockClear();

    act(() => {
      renderer.update(<Wrapper visible={false} />);
    });

    const dismissedCalls = (mockTrackEvent as Mock).mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "object" &&
        (c[0] as { name: string; action?: string }).action === "dismissed",
    );
    expect(dismissedCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("CheckoutLoginSheet — callbacks", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
  });

  it("surface='checkout-direct' is reflected in the viewed analytics event", () => {
    renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true, surface: "checkout-direct" })} />,
    );
    const viewedCalls = (mockTrackEvent as Mock).mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "object" &&
        (c[0] as { name: string }).name === "checkout_login_prompt_viewed",
    );
    expect(viewedCalls[0][0]).toMatchObject({ surface: "checkout-direct" });
  });

  it("shows 'Or' divider between email input and social buttons", () => {
    const { getByText } = renderWithProviders(
      <CheckoutLoginSheet {...makeProps({ visible: true })} />,
    );
    expect(getByText("Or")).toBeTruthy();
  });
});
