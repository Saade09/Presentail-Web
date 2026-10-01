// @vitest-environment jsdom
//
// Express upgrade card in Delivery Summary — pricing/delta math, upgrade
// action + analytics, double-click guard, ETA fallback, and total
// reconciliation across paid-Standard / free-Standard / Express scenarios.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, DEFAULT_LOCALE } from "@/test-utils";
import { LocaleContext } from "@/contexts/LocaleContext";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackEvent: vi.fn(),
    trackWebEvent: vi.fn(),
    umamiTrack: vi.fn(),
  });
});

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", vi.fn()]),
  Link: ({ children, href, onClick, ...rest }: React.PropsWithChildren<{ href: string; onClick?: React.MouseEventHandler; [k: string]: unknown }>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: vi.fn(() => ({
    freeDeliveryEnabled: true,
    freeDeliveryThreshold: "$90",
    freeDeliveryThresholdUsd: 90,
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    currency: "USD",
    cityFeeUsd: 10,
    expressSurchargeUsd: 15,
    isLoaded: true,
  })),
}));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: vi.fn(() => ({
      countryCode: "LB",
      city: null,
      country: null,
      cityId: null,
      countries: [],
      isLoadingCountries: false,
      isPickerOpen: false,
      pickerForceCountryStep: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
      clearLocation: vi.fn(),
    })),
  };
});

vi.mock("@/components/cart/CartUpsells", () => ({ CartUpsells: () => null }));
vi.mock("@/components/delivery/DeliveryDateRow", () => ({ DeliveryDateRow: () => null }));
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({ CheckoutLoginDialog: () => null }));

// Freeze "now" at 12:00 UTC (15:00 Beirut) — inside the 8–22 express window.
vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date("2026-08-14T12:00:00Z"),
}));

const { mockUseDeliverySelection } = vi.hoisted(() => ({
  mockUseDeliverySelection: vi.fn(() => ({
    mode: null as string | null,
    date: null as string | null,
    slotLabel: null as string | null,
    slotId: null as string | null,
    source: null as string | null,
    hasSelection: false,
    setSelection: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: mockUseDeliverySelection,
  DeliverySelectionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import Cart from "./Cart";
import { ExpressUpgradeCard } from "@/components/delivery/ExpressUpgradeCard";
import { trackWebEvent } from "@/lib/analytics";

const FAKE_ITEM = {
  product: {
    id: "p1",
    name: "Red Roses Bouquet",
    priceValue: 75,
    price: "75",
    image: null,
    category: "flowers",
    categories: ["flowers"],
    inStock: true,
    occasions: [],
    wcId: 1,
    slug: "red-roses-bouquet",
  },
  quantity: 1,
};

const CART_BELOW = { items: [FAKE_ITEM], subtotal: 75, itemCount: 1, isHydrated: true };
const CART_ABOVE = { items: [FAKE_ITEM], subtotal: 95, itemCount: 1, isHydrated: true };
const AUTH_OUT = { user: null, isLoading: false, token: null };
const CURRENCY_FIXTURE = { formatPrice: (v: number) => `$${v}` };
// Raw-key t, except the delta template resolves to its real "+ {amount}" shape
// so buildFeeNode substitutes a FormattedPrice for the amount.
const LOCALE_WITH_DELTA = {
  t: (key: string) => (key === "cart.expressDelta" ? "+\u00A0{amount}" : key),
};

const standardSelection = (setSelection = vi.fn()) => ({
  mode: "today_slot" as const,
  date: "2026-08-14",
  source: "user_selected" as const,
  slotLabel: null,
  slotId: null,
  hasSelection: true,
  setSelection,
  clear: vi.fn(),
});

const webEventsOf = (type: string) =>
  vi.mocked(trackWebEvent).mock.calls.map(([e]) => e).filter((e) => e.type === type);

beforeEach(() => {
  vi.mocked(trackWebEvent).mockClear();
  mockUseDeliverySelection.mockReturnValue({
    mode: null,
    date: null,
    slotLabel: null,
    slotId: null,
    source: null,
    hasSelection: false,
    setSelection: vi.fn(),
    clear: vi.fn(),
  });
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("Express upgrade card — visibility", () => {
  it("hidden when no delivery selection exists", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
  });

  it("shown under the Delivery Summary when a standard selection exists", () => {
    mockUseDeliverySelection.mockReturnValue(standardSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });
    expect(screen.getByTestId("card-express-upgrade")).toBeTruthy();
    expect(screen.getByTestId("button-express-upgrade").textContent).toContain(
      "cart.expressUpgradeCta",
    );
    // Impression fired exactly once
    expect(webEventsOf("express_upgrade_impression")).toHaveLength(1);
  });

  it("hidden when express is already selected", () => {
    mockUseDeliverySelection.mockReturnValue({
      ...standardSelection(),
      mode: "express" as const,
    });
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
  });
});

describe("Express upgrade card — delta pricing", () => {
  it("paid Standard → delta equals surcharge (express total − applied standard fee): 25 − 10 = 15", () => {
    mockUseDeliverySelection.mockReturnValue(standardSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE, locale: LOCALE_WITH_DELTA });
    // (10 + 15) − (10 + 0) = 15
    const delta = screen.getByTestId("text-express-upgrade-delta");
    expect(delta.textContent).toContain("$15");
    // "+" must stay glued to the amount: non-breaking space join + nowrap span
    expect(delta.textContent).toContain("+\u00A0");
    expect(delta.textContent).not.toContain("+ ");
    expect(delta.className).toContain("whitespace-nowrap");
    const impression = webEventsOf("express_upgrade_impression")[0];
    expect(impression.properties).toMatchObject({
      effective_standard_fee_usd: 10,
      express_fee_usd: 25,
      displayed_delta_usd: 15,
      free_delivery_eligible: false,
    });
  });

  it("free Standard → delta equals the full express fee (base waived): 15 − 0 = 15", () => {
    mockUseDeliverySelection.mockReturnValue(standardSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE, locale: LOCALE_WITH_DELTA });
    expect(screen.getByTestId("text-express-upgrade-delta").textContent).toContain("$15");
    const impression = webEventsOf("express_upgrade_impression")[0];
    expect(impression.properties).toMatchObject({
      effective_standard_fee_usd: 0,
      express_fee_usd: 15,
      displayed_delta_usd: 15,
      free_delivery_eligible: true,
    });
    // Free-standard summary copy present
    expect(screen.getByTestId("text-free-delivery-saved").textContent).toContain(
      "cart.freeDeliveryApplied",
    );
  });
});

describe("Express upgrade card — Upgrade action", () => {
  it("selects express via shared delivery-selection state and emits clicked analytics", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(standardSelection(setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-upgrade"));

    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "express", slotLabel: null, slotId: null }),
    );
    expect(webEventsOf("express_upgrade_clicked")).toHaveLength(1);
    expect(webEventsOf("express_upgrade_failed")).toHaveLength(0);
  });

  it("double-click is guarded — setSelection fires only once", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(standardSelection(setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });

    const button = screen.getByTestId("button-express-upgrade");
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(webEventsOf("express_upgrade_clicked")).toHaveLength(1);
  });

  it("rapid full-card clicks use the same guard as the Upgrade control", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(standardSelection(setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });

    const card = screen.getByTestId("card-express-upgrade");
    await userEvent.click(card);
    await userEvent.click(card);
    await userEvent.click(card);

    expect(setSelection).toHaveBeenCalledOnce();
    expect(webEventsOf("express_upgrade_clicked")).toHaveLength(1);
  });

  it("emits express_upgrade_failed when setSelection throws", async () => {
    const setSelection = vi.fn(() => {
      throw new Error("boom");
    });
    mockUseDeliverySelection.mockReturnValue(standardSelection(setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-upgrade"));

    const failed = webEventsOf("express_upgrade_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].properties).toMatchObject({ reason: "selection_error" });
  });
});

describe("Method-change analytics + total reconciliation", () => {
  it("switching standard → express emits delivery_method_changed and the Total change equals the displayed delta", () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(standardSelection(setSelection));
    const { unmount } = renderWithProviders(<Cart />, {
      auth: AUTH_OUT,
      cart: CART_BELOW,
      currency: CURRENCY_FIXTURE,
      locale: LOCALE_WITH_DELTA,
    });
    // Standard: total = 75 + 10 = 85; displayed delta = 15
    expect(screen.getByTestId("text-cart-total").textContent).toContain("$85");
    expect(screen.getByTestId("text-express-upgrade-delta").textContent).toContain("$15");

    unmount();
    vi.mocked(trackWebEvent).mockClear();
    mockUseDeliverySelection.mockReturnValue({ ...standardSelection(setSelection), mode: "express" as const });
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_BELOW, currency: CURRENCY_FIXTURE });

    // Express: total = 75 + 25 = 100 → change (+15) equals the delta shown before.
    expect(screen.getByTestId("text-cart-total").textContent).toContain("$100");
    // Single express row in the summary; standard row gone
    expect(screen.getByTestId("row-express-delivery").textContent).toContain("$25");
    expect(screen.queryByTestId("row-standard-delivery")).toBeNull();
    // ETA supporting copy present (raw-key t mock renders the arrivesBy key)
    expect(screen.getByTestId("text-express-delivery-eta").textContent).toContain(
      "delivery.promise.arrivesBy",
    );
  });
});

describe("ExpressUpgradeCard — ETA fallback", () => {
  const wrap = (ui: React.ReactElement) => (
    <LocaleContext.Provider value={DEFAULT_LOCALE}>{ui}</LocaleContext.Provider>
  );

  it("shows the exact arrival promise when available", () => {
    render(
      wrap(
        <ExpressUpgradeCard arrival="Arrives by 1:30 PM" deltaUsd={15} onUpgrade={() => {}} />,
      ),
    );
    expect(screen.getByTestId("text-express-upgrade-arrival").textContent).toBe(
      "Arrives by 1:30 PM",
    );
  });

  it("falls back to 'Within 90 minutes' when no exact ETA is available", () => {
    render(wrap(<ExpressUpgradeCard arrival={null} deltaUsd={15} onUpgrade={() => {}} />));
    expect(screen.getByTestId("text-express-upgrade-arrival").textContent).toBe(
      "delivery.promise.within90",
    );
  });

  it("disables the Upgrade button while upgrading", () => {
    render(
      wrap(<ExpressUpgradeCard arrival={null} deltaUsd={15} onUpgrade={() => {}} upgrading />),
    );
    expect((screen.getByTestId("button-express-upgrade") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("ExpressUpgradeCard — full-card interaction", () => {
  const renderCard = (onUpgrade = vi.fn(), upgrading = false) => {
    render(
      <LocaleContext.Provider value={DEFAULT_LOCALE}>
        <ExpressUpgradeCard
          arrival="Arrives by 1:30 PM"
          deltaUsd={15}
          onUpgrade={onUpgrade}
          upgrading={upgrading}
        />,
      </LocaleContext.Provider>,
    );
    return { card: screen.getByTestId("card-express-upgrade"), onUpgrade };
  };

  it("activates from non-control content across the whole card", async () => {
    const user = userEvent.setup();
    const { card, onUpgrade } = renderCard();

    await user.click(screen.getByTestId("text-express-upgrade-arrival"));
    await user.click(screen.getByTestId("text-express-upgrade-delta"));
    await user.click(card);

    expect(onUpgrade).toHaveBeenCalledTimes(3);
  });

  it("keeps the nested Upgrade button as one independent action", async () => {
    const user = userEvent.setup();
    const { onUpgrade } = renderCard();

    await user.click(screen.getByTestId("button-express-upgrade"));

    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("keeps keyboard activation on the nested Upgrade button to one action", async () => {
    const user = userEvent.setup();
    const { onUpgrade } = renderCard();
    const button = screen.getByTestId("button-express-upgrade");

    button.focus();
    await user.keyboard("{Enter}");

    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it.each(["Enter", " "])("activates with %s", async (key) => {
    const user = userEvent.setup();
    const { card, onUpgrade } = renderCard();

    card.focus();
    await user.keyboard(`{${key}}`);

    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("does not activate or focus the card while upgrading", async () => {
    const user = userEvent.setup();
    const { card, onUpgrade } = renderCard(vi.fn(), true);

    expect((card as HTMLButtonElement).disabled).toBe(true);
    expect(card.querySelector("button")).toBeNull();

    await user.click(screen.getByTestId("text-express-upgrade-arrival"));
    expect(onUpgrade).not.toHaveBeenCalled();
  });
});
