// @vitest-environment jsdom
//
// Context-aware Express upsell gating — the offer branches on the *source* of
// the delivery selection: full upgrade card for same-day, complete suppression
// for user-chosen future dates, quiet "Need it today?" prompt (with the
// "Deliver earlier?" confirmation) for system-assigned future dates.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

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

const DELIVERY_CONFIG = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "$90",
  freeDeliveryThresholdUsd: 90,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10 as number | null,
  expressSurchargeUsd: 15,
  isLoaded: true,
};
const { mockUseDeliveryConfig } = vi.hoisted(() => ({
  mockUseDeliveryConfig: vi.fn(),
}));
vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: mockUseDeliveryConfig,
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
// Destination-local today is 2026-08-14.
vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date("2026-08-14T12:00:00Z"),
}));

const { mockUseDeliverySelection } = vi.hoisted(() => ({
  mockUseDeliverySelection: vi.fn(),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: mockUseDeliverySelection,
  DeliverySelectionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import Cart, { EXPRESS_PROMPT_DISMISSED_KEY } from "./Cart";
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

const CART = { items: [FAKE_ITEM], subtotal: 75, itemCount: 1, isHydrated: true };
const AUTH_OUT = { user: null, isLoading: false, token: null };
const CURRENCY_FIXTURE = { formatPrice: (v: number) => `$${v}` };

type Source = "system_default" | "user_selected" | "restored_user_selection" | "system_reselected";

const selection = (
  overrides: Partial<{ mode: string; date: string; source: Source | null }> = {},
  setSelection = vi.fn(),
) => ({
  mode: "schedule" as const,
  date: "2026-08-15",
  slotLabel: null,
  slotId: null,
  source: "system_default" as Source | null,
  hasSelection: true,
  setSelection,
  clear: vi.fn(),
  ...overrides,
});

const webEventsOf = (type: string) =>
  vi.mocked(trackWebEvent).mock.calls.map(([e]) => e).filter((e) => e.type === type);

beforeEach(() => {
  vi.mocked(trackWebEvent).mockClear();
  mockUseDeliveryConfig.mockReset();
  mockUseDeliveryConfig.mockReturnValue(DELIVERY_CONFIG);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("Gating — same-day standard selection", () => {
  it("shows the full upgrade card, never the quiet prompt", () => {
    mockUseDeliverySelection.mockReturnValue(
      selection({ mode: "today_slot", date: "2026-08-14", source: "user_selected" }),
    );
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.getByTestId("card-express-upgrade")).toBeTruthy();
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(webEventsOf("express_offer_impression")[0].properties).toMatchObject({
      variant: "upgrade_card",
      same_calendar_date: true,
    });
  });
});

describe("Gating — user-chosen future date", () => {
  it.each([
    ["user_selected", "explicit_future_date"],
    ["restored_user_selection", "restored_future_selection"],
  ] as const)("suppresses all upsell UI for %s and records %s", (source, reason) => {
    mockUseDeliverySelection.mockReturnValue(selection({ source }));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    const suppressed = webEventsOf("express_offer_suppressed");
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].properties).toMatchObject({
      suppression_reason: reason,
      delivery_selection_source: source,
      same_calendar_date: false,
    });
    expect(webEventsOf("express_offer_impression")).toHaveLength(0);
  });
});

describe("Gating — system-assigned future date", () => {
  it.each(["system_default", "system_reselected"] as const)(
    "shows the quiet prompt (not the card) for %s",
    (source) => {
      mockUseDeliverySelection.mockReturnValue(selection({ source }));
      renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
      expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
      expect(screen.getByTestId("card-express-quiet-prompt")).toBeTruthy();
      expect(screen.getByTestId("text-express-prompt-title").textContent).toBe(
        "cart.expressPrompt.title",
      );
      expect(webEventsOf("express_offer_impression")[0].properties).toMatchObject({
        variant: "quiet_prompt",
        delivery_selection_source: source,
      });
    },
  );

  it("still emits express_offer_eligible", () => {
    mockUseDeliverySelection.mockReturnValue(selection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(webEventsOf("express_offer_eligible")).toHaveLength(1);
  });

  it("suppresses the prompt when the delivery fee is not final (price_unavailable)", () => {
    mockUseDeliveryConfig.mockReturnValue({ ...DELIVERY_CONFIG, cityFeeUsd: null });
    mockUseDeliverySelection.mockReturnValue(selection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(webEventsOf("express_offer_suppressed")[0].properties).toMatchObject({
      suppression_reason: "price_unavailable",
    });
  });
});

describe("Quiet prompt — dismissal", () => {
  it("dismiss marks the selection user-selected and persists per-cart-state suppression", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(selection({}, setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-prompt-dismiss"));

    expect(setSelection).toHaveBeenCalledWith({ source: "user_selected" });
    expect(localStorage.getItem(EXPRESS_PROMPT_DISMISSED_KEY)).toBe("2026-08-15|");
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
  });

  it("stored dismissal for the same cart state suppresses the prompt on a fresh render", () => {
    localStorage.setItem(EXPRESS_PROMPT_DISMISSED_KEY, "2026-08-15|");
    mockUseDeliverySelection.mockReturnValue(selection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(webEventsOf("express_offer_suppressed")[0].properties).toMatchObject({
      suppression_reason: "customer_dismissed",
    });
  });

  it("dismissal stored for a different cart state does NOT suppress the prompt", () => {
    localStorage.setItem(EXPRESS_PROMPT_DISMISSED_KEY, "2026-08-20|");
    mockUseDeliverySelection.mockReturnValue(selection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.getByTestId("card-express-quiet-prompt")).toBeTruthy();
  });
});

describe("Quiet prompt — 'Deliver earlier?' confirmation", () => {
  it("'See option' opens the confirmation and never changes the date directly", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(selection({}, setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-prompt-see-option"));

    expect(setSelection).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialog-deliver-earlier")).toBeTruthy();
    expect(webEventsOf("express_offer_clicked")).toHaveLength(1);
    expect(webEventsOf("earlier_delivery_confirmation_shown")).toHaveLength(1);
    // Exact total change shown (delta = (10+15) − (10+0) = 15)
    expect(screen.getByTestId("text-deliver-earlier-total-change").textContent).toContain("15");
  });

  it("confirm commits express as a user selection and emits earlier_delivery_confirmed", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(selection({}, setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-prompt-see-option"));
    await userEvent.click(screen.getByTestId("button-deliver-earlier-confirm"));

    expect(webEventsOf("earlier_delivery_confirmed")).toHaveLength(1);
    expect(setSelection).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "express", source: "user_selected" }),
    );
  });

  it("cancel preserves the original selection, marks it user-selected, and dismisses", async () => {
    const setSelection = vi.fn();
    mockUseDeliverySelection.mockReturnValue(selection({}, setSelection));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    await userEvent.click(screen.getByTestId("button-express-prompt-see-option"));
    await userEvent.click(screen.getByTestId("button-deliver-earlier-keep"));

    expect(webEventsOf("earlier_delivery_canceled")).toHaveLength(1);
    // Original date/slot untouched — only the source flips to user_selected.
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith({ source: "user_selected" });
    expect(localStorage.getItem(EXPRESS_PROMPT_DISMISSED_KEY)).toBe("2026-08-15|");
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
  });
});

describe("Mixed-cart ineligibility", () => {
  it("suppresses both offers when an item is express-ineligible", () => {
    const cart = {
      ...CART,
      items: [
        FAKE_ITEM,
        {
          product: { ...FAKE_ITEM.product, id: "p2", expressEligible: false },
          quantity: 1,
        },
      ],
      itemCount: 2,
    };
    mockUseDeliverySelection.mockReturnValue(
      selection({ mode: "today_slot", date: "2026-08-14", source: "user_selected" }),
    );
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(webEventsOf("express_offer_suppressed")[0].properties).toMatchObject({
      suppression_reason: "mixed_cart_ineligible",
    });
  });
});
