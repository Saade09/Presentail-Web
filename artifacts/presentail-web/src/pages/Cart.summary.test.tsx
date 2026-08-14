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

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
}));

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

import Cart, { COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY } from "./Cart";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
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
