// @vitest-environment jsdom
//
// Tests for the redesigned cart Order Summary (Task: cart sidebar redesign):
//   - "Items (count)" pluralization
//   - free-delivery "Free" label with saved-amount supporting copy + fallback
//   - CTA "Checkout securely · total" consistency with the summary total
//   - promo discount row label ("Promo · CODE")
//   - analytics: order_summary_viewed (once), checkout_clicked, promo events

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
    trackWebEventOnce: vi.fn(),
    umamiTrack: vi.fn(),
  });
});

const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", mockSetLocation]),
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

vi.mock("@/components/cart/FreeDeliveryBanner", () => ({
  FreeDeliveryBanner: () => <div data-testid="free-delivery-banner" />,
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

vi.mock("@/components/cart/CartUpsells", () => ({
  CartUpsells: () => null,
}));

vi.mock("@/components/delivery/DeliveryDateRow", () => ({
  DeliveryDateRow: () => null,
}));

vi.mock("@/components/cart/CheckoutLoginDialog", () => ({
  CheckoutLoginDialog: (props: { open: boolean }) => (props.open ? <div data-testid="mock-login-dialog" /> : null),
}));

const { mockUseDeliverySelection } = vi.hoisted(() => ({
  mockUseDeliverySelection: vi.fn(() => ({
    mode: null as string | null,
    date: null,
    slotLabel: null,
    hasSelection: false,
    setSelection: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: mockUseDeliverySelection,
  DeliverySelectionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date("2026-09-08T10:00:00Z"),
}));

import Cart, { COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY } from "./Cart";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";
import { trackWebEvent } from "@/lib/analytics";

const makeItem = (id: string) => ({
  product: {
    id,
    name: `Product ${id}`,
    priceValue: 40,
    price: "40",
    image: null,
    category: "flowers",
    categories: ["flowers"],
    inStock: true,
    occasions: [],
    wcId: 1,
    slug: `product-${id}`,
  },
  quantity: 1,
});

const CART_ONE = { items: [makeItem("p1")], subtotal: 40, itemCount: 1 };
const CART_TWO = { items: [makeItem("p1"), makeItem("p2")], subtotal: 80, itemCount: 2 };
const CART_ABOVE = { items: [makeItem("p1"), makeItem("p2"), makeItem("p3")], subtotal: 120, itemCount: 3 };

const CURRENCY_FIXTURE = { formatPrice: (v: number) => `$${v}` };
const AUTH_OUT = { user: null, isLoading: false, token: null };

const BASE_CONFIG = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "$90",
  freeDeliveryThresholdUsd: 90,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10,
  expressSurchargeUsd: 15,
  isLoaded: true,
};

const standardSelection = (mode: string | null = "schedule") => ({
  mode,
  date: null,
  slotLabel: null,
  hasSelection: false,
  setSelection: vi.fn(),
  clear: vi.fn(),
});

beforeEach(() => {
  vi.mocked(useDeliveryConfig).mockReturnValue(BASE_CONFIG);
  mockUseDeliverySelection.mockReturnValue(standardSelection());
  vi.mocked(trackWebEvent).mockClear();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("Cart summary — items row pluralization", () => {
  it("shows the singular items label for one item", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    expect(screen.getByText("cart.items_one")).toBeTruthy();
    expect(screen.queryByText("cart.items_other")).toBeNull();
    // No generic "Subtotal" row anymore
    expect(screen.queryByText("cart.subtotal")).toBeNull();
  });

  it("shows the plural items label for multiple items", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_TWO, currency: CURRENCY_FIXTURE });
    expect(screen.getByText("cart.items_other")).toBeTruthy();
    expect(screen.queryByText("cart.items_one")).toBeNull();
  });
});

describe("Cart summary — free delivery presentation", () => {
  it("above threshold → 'Free' label with 'Free delivery applied' supporting copy", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    const saved = screen.getByTestId("text-free-delivery-saved");
    expect(saved.textContent).toContain("cart.freeDeliveryApplied");
    // No $0 delivery amount anywhere
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("above threshold with unknown city fee → same 'Free delivery applied' copy", () => {
    vi.mocked(useDeliveryConfig).mockReturnValue({ ...BASE_CONFIG, cityFeeUsd: 0 });
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.getByTestId("text-free-delivery-saved").textContent).toContain(
      "cart.freeDeliveryApplied",
    );
  });

  it("below threshold → 'Base delivery charge' supporting copy, no free copy", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    expect(screen.getByText("cart.baseDeliveryCharge")).toBeTruthy();
    expect(screen.queryByTestId("text-free-delivery-saved")).toBeNull();
  });

  it("free standard + express → free-delivery banner is suppressed, single express row still charged", () => {
    mockUseDeliverySelection.mockReturnValue(standardSelection("express"));
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("free-delivery-banner")).toBeNull();
    const row = screen.getByTestId("row-express-delivery");
    expect(row.textContent).toContain("$15");
    expect(row.textContent).toContain("delivery.promise.expressTitle");
    expect(screen.queryByTestId("row-standard-delivery")).toBeNull();
  });
});

describe("Cart summary — CTA and total consistency", () => {
  it("CTA reads 'Checkout securely' with the same amount as the summary total", () => {
    // subtotal 120, free delivery (>=90) → total 120
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    const cta = screen.getByTestId("link-proceed-to-checkout");
    expect(cta.textContent).toContain("cart.checkoutSecurely");
    expect(cta.textContent).toContain("$120");
    expect(screen.getByTestId("text-cart-total").textContent).toContain("$120");
    // Sticky mobile CTA shows the same copy + amount
    const sticky = screen.getByTestId("link-proceed-to-checkout-sticky");
    expect(sticky.textContent).toContain("cart.checkoutSecurely");
    expect(sticky.textContent).toContain("$120");
  });
});

describe("Cart summary — promo discount row", () => {
  it("shows 'Promo · CODE' with the negative amount when a coupon is applied", () => {
    localStorage.setItem(COUPON_STORAGE_KEY, "FLOWERS10");
    localStorage.setItem(COUPON_DISCOUNT_KEY, "10");
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    const row = screen.getByTestId("row-cart-coupon-discount");
    expect(row.textContent).toContain("cart.promoLabel");
    expect(row.textContent).toContain("FLOWERS10");
    expect(row.textContent).toContain("−");
    expect(row.textContent).toContain("$10");
  });
});

// ---------------------------------------------------------------------------
// Midnight delivery — unified Order Summary row
//
// Before the fix, Midnight delivery produced TWO rows in the Order Summary:
//   1. "Standard delivery" (city base fee)
//   2. "Midnight Delivery / Late night fee" (upgrade fee separately)
//
// This caused an AED 5 rounding discrepancy: each USD amount was independently
// converted and rounded to the nearest 5 AED, which can differ by up to 5 AED
// from rounding the combined USD total once (the path cartTotal uses).
//
// After the fix, a single "row-midnight-delivery" shows the combined total.
// ---------------------------------------------------------------------------

describe("Cart summary — midnight delivery unified row", () => {
  // Fixture: a city with a midnight time slot. Must use an ID from
  // MIDNIGHT_ELIGIBLE_CITY_IDS ("lb-beirut") so displayedSlotsForDate includes the slot.
  const MIDNIGHT_CITY = {
    id: "lb-beirut",
    timeSlots: [
      {
        label: "11 PM – 1 AM",
        startHour: 23,
        endHour: 1,
        cutoffHour: 21,
        serviceType: "midnight" as const,
        sameDayEnabled: true,
        nextDayEnabled: false,
        // extraFee intentionally absent — displayedSlotsForDate injects MIDNIGHT_FEE_USD (20)
      },
    ],
    expressAvailable: false,
    freeDeliveryThresholdUsd: 90,
  };

  const midnightSelection = {
    mode: "schedule" as const,
    date: "2026-09-08",      // matches mocked useNow date (LB = UTC+3 → 2026-09-08)
    slotLabel: "11 PM – 1 AM",
    slotId: null,
    serviceType: "midnight" as const,
    hasSelection: true,
    setSelection: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue({
      ...BASE_CONFIG,
      cityFeeUsd: 15, // non-zero base fee to exercise the component breakdown
    });
    mockUseDeliverySelection.mockReturnValue(midnightSelection as any);
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "LB",
      city: MIDNIGHT_CITY as any,
      country: null,
      cityId: "lb-beirut",
      countries: [],
      isLoadingCountries: false,
      isPickerOpen: false,
      pickerForceCountryStep: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
      clearLocation: vi.fn(),
    });
  });

  it("shows a single row-midnight-delivery, not row-standard-delivery", () => {
    // subtotal $40 (CART_ONE) < threshold $90 → city fee $15 applies
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    expect(screen.getByTestId("row-midnight-delivery")).toBeTruthy();
    expect(screen.queryByTestId("row-standard-delivery")).toBeNull();
  });

  it("(AED-5 regression) combined midnight fee amount equals base + upgrade as one value", () => {
    // base = $15, upgrade = $20 → combined = $35
    // With CURRENCY_FIXTURE formatPrice: v => `$${v}`, FormattedPrice shows "$35".
    // If the two amounts were shown separately (the old pattern), the row amounts
    // would be "$15" + "$20" = individually rounded, which can diverge from "$35"
    // by 5 AED in the AED market due to roundToNearestFive applied twice.
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    const row = screen.getByTestId("row-midnight-delivery");
    // The combined $35 must appear in the row — not the split $15 and $20.
    expect(row.textContent).toContain("$35");
    expect(row.textContent).not.toContain("$15");
    expect(row.textContent).not.toContain("$20");
  });

  it("shows the component breakdown sub-text when base and upgrade are both paid", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    // The muted sub-text testid is present when both fees are non-zero.
    expect(screen.getByTestId("text-midnight-components")).toBeTruthy();
  });

  it("no separate slot-fee row exists — midnight label lives only inside the combined row", () => {
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    // product.midnightDelivery IS expected to appear — it's the label of the unified row.
    // The old pattern added a SECOND standalone row with no testid alongside row-standard-delivery.
    // After the fix there must be exactly one midnight row and no standard-delivery row.
    const midnightRows = screen.getAllByTestId("row-midnight-delivery");
    expect(midnightRows).toHaveLength(1);
    // No separate late-night-fee label anywhere (that was the old secondary row's text).
    expect(screen.queryByText("cart.lateNightFee")).toBeNull();
    // No standard delivery row coexisting with the midnight row.
    expect(screen.queryByTestId("row-standard-delivery")).toBeNull();
  });

  it("midnight with free standard delivery (above threshold) shows upgrade fee only, no sub-text", () => {
    // CART_ABOVE subtotal $120 ≥ threshold $90 → base fee $0
    // Combined = $0 + $20 = $20; no breakdown sub-text since base is free.
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    const row = screen.getByTestId("row-midnight-delivery");
    expect(row.textContent).toContain("$20");
    // No component breakdown sub-text when base is free.
    expect(screen.queryByTestId("text-midnight-components")).toBeNull();
  });

  it("cart total matches the combined midnight fee (not separately summed components)", () => {
    // subtotal $40 + combined delivery $35 = $75 total
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    expect(screen.getByTestId("text-cart-total").textContent).toContain("$75");
  });
});

describe("Cart summary — late-night slot (non-midnight) unified row", () => {
  it("shows a single row-standard-delivery with combined base+slot fee amount", () => {
    // mode=schedule, slotLabel set → IIFE finds the night slot → slotFeeUsd=$5
    // base=$10, slotFee=$5 → combined=$15 in one row
    mockUseDeliverySelection.mockReturnValue({
      mode: "schedule" as const,
      date: "2026-09-08",
      slotLabel: "9 PM – 11 PM",
      slotId: null,
      serviceType: null,   // not midnight
      hasSelection: true,
      setSelection: vi.fn(),
      clear: vi.fn(),
    } as any);
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "LB",
      city: {
        id: "beirut",
        timeSlots: [
          // A same-day night slot with no extraFee → $5 same-day fallback
          { label: "9 PM – 11 PM", startHour: 21, endHour: 23, cutoffHour: 19, sameDayEnabled: true, nextDayEnabled: false },
        ],
        expressAvailable: false,
        freeDeliveryThresholdUsd: 90,
      } as any,
      country: null,
      cityId: "beirut",
      countries: [],
      isLoadingCountries: false,
      isPickerOpen: false,
      pickerForceCountryStep: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
      clearLocation: vi.fn(),
    });

    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });

    const row = screen.getByTestId("row-standard-delivery");
    // Combined: base $10 + slot $5 = $15
    expect(row.textContent).toContain("$15");
    // Component breakdown sub-text present
    expect(screen.getByTestId("text-slot-components")).toBeTruthy();
  });
});

describe("Cart summary — analytics", () => {
  it("fires order_summary_viewed exactly once after hydration with items", () => {
    const { rerender } = renderWithProviders(<Cart />, {
      auth: AUTH_OUT,
      cart: CART_ONE,
      currency: CURRENCY_FIXTURE,
    });
    rerender(<Cart />);
    const calls = vi
      .mocked(trackWebEvent)
      .mock.calls.filter((c) => (c[0] as { type: string }).type === "order_summary_viewed");
    expect(calls.length).toBe(1);
    const props = (calls[0][0] as { properties: Record<string, unknown> }).properties;
    expect(props.selectedDeliveryType).toBe("standard");
    expect(props.promoApplied).toBe(false);
  });

  it("fires promo_code_expanded when the promo row is expanded", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    await user.click(screen.getByTestId("button-promo-toggle"));
    const types = vi.mocked(trackWebEvent).mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("promo_code_expanded");
  });

  it("fires promo_code_removed when an applied coupon is removed", async () => {
    localStorage.setItem(COUPON_STORAGE_KEY, "FLOWERS10");
    localStorage.setItem(COUPON_DISCOUNT_KEY, "10");
    const user = userEvent.setup();
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ONE, currency: CURRENCY_FIXTURE });
    await user.click(screen.getByTestId("button-promo-remove"));
    const types = vi.mocked(trackWebEvent).mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("promo_code_removed");
    expect(screen.queryByTestId("row-cart-coupon-discount")).toBeNull();
  });

  it("fires checkout_clicked with pricing-state properties when the CTA is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART_ABOVE, currency: CURRENCY_FIXTURE });
    await user.click(screen.getByTestId("link-proceed-to-checkout"));
    const call = vi
      .mocked(trackWebEvent)
      .mock.calls.find((c) => (c[0] as { type: string }).type === "checkout_clicked");
    expect(call).toBeTruthy();
    const payload = call![0] as { value: number; properties: Record<string, unknown> };
    expect(payload.value).toBe(120);
    expect(payload.properties.standardDeliveryFree).toBe(true);
    expect(payload.properties.selectedDeliveryType).toBe("standard");
  });
});
