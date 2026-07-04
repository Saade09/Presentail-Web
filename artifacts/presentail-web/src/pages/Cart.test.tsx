// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported so Vitest
// can hoist them before any other import in this file.
//
// NOTE: CartContext, AuthContext, LocaleContext, and useDisplayCurrency are
// intentionally NOT mocked here — renderWithProviders injects them all via
// context providers with sensible defaults. Only modules that have no
// provider equivalent (routing, animation, analytics, sub-components) still
// need per-file vi.mock declarations.
// ---------------------------------------------------------------------------

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

// Capture the mock setter so tests can assert it was called.
const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", mockSetLocation]),
  // Render as a plain <a> so userEvent.click works without real routing.
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

// Replace heavy sub-components with lightweight stubs so we only exercise Cart's logic.
// FreeDeliveryBanner renders a testid element so presence/absence can be asserted.
vi.mock("@/components/cart/FreeDeliveryBanner", () => ({
  FreeDeliveryBanner: () => <div data-testid="free-delivery-banner" />,
}));

// useDeliveryConfig — default returns freeDeliveryEnabled: true; individual tests
// can override this via vi.mocked().mockReturnValue().
vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: vi.fn(() => ({
    freeDeliveryEnabled: true,
    freeDeliveryThreshold: "$90",
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    currency: "USD",
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
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    })),
  };
});

vi.mock("@/components/cart/CartUpsells", () => ({
  CartUpsells: () => null,
}));

vi.mock("@/components/delivery/DeliveryDateRow", () => ({
  DeliveryDateRow: () => null,
}));

// Spy on the dialog open state via its `open` prop.
const mockDialogProps: { open: boolean } = { open: false };
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({
  CheckoutLoginDialog: (props: { open: boolean; onContinueAsGuest: () => void; onOpenChange: (v: boolean) => void; surface: string }) => {
    mockDialogProps.open = props.open;
    return props.open ? <div data-testid="mock-login-dialog" /> : null;
  },
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

// ---------------------------------------------------------------------------
// Import the component under test AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Cart, { COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY } from "./Cart";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

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

const CART_WITH_ITEM = {
  items: [FAKE_ITEM],
  subtotal: 75,
  itemCount: 1,
};

const CURRENCY_FIXTURE = {
  formatPrice: (v: number) => `$${v}`,
};

// ---------------------------------------------------------------------------
// Tests: "Proceed to Checkout" button navigation / dialog behaviour
// ---------------------------------------------------------------------------

describe("Cart — Proceed to Checkout button", () => {
  beforeEach(() => {
    mockDialogProps.open = false;
    mockSetLocation.mockClear();
  });

  it("navigates directly to /checkout when auth is still loading (authLoading=true)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: true, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // Should navigate without opening the login dialog.
    expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
    expect(mockDialogProps.open).toBe(false);
  });

  it("opens the login dialog when auth is loaded and shopper is signed out", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // setLocation must NOT be called — the dialog should open instead.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/checkout");

    // Rerender to pick up the updated loginOpen state reflected in the mock.
    rerender(<Cart />);
    expect(screen.getByTestId("mock-login-dialog")).toBeTruthy();
  });

  it("does NOT open the login dialog and does NOT call setLocation when shopper is signed in", async () => {
    const signedInUser = { id: "u1", email: "a@b.com", firstName: "Ada", lastName: "B" };
    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: signedInUser, isLoading: false, token: "clerk" },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // handleProceed returns early for signed-in users — neither branch fires.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/checkout");
    expect(mockDialogProps.open).toBe(false);
    expect(screen.queryByTestId("mock-login-dialog")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: free-delivery banner visibility based on freeDeliveryEnabled flag
// ---------------------------------------------------------------------------

describe("Cart — FreeDeliveryBanner visibility", () => {
  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue({
      freeDeliveryEnabled: true,
      freeDeliveryThreshold: "$90",
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      currency: "USD",
      cityFeeUsd: null,
      expressSurchargeUsd: 15,
    });
  });

  it("shows the banner when freeDeliveryEnabled is true (e.g. Beirut)", () => {
    vi.mocked(useDeliveryConfig).mockReturnValue({
      freeDeliveryEnabled: true,
      freeDeliveryThreshold: "$90",
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      currency: "USD",
      cityFeeUsd: null,
      expressSurchargeUsd: 15,
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByTestId("free-delivery-banner")).toBeTruthy();
  });

  it("hides the banner when freeDeliveryEnabled is false (e.g. Akkar)", () => {
    vi.mocked(useDeliveryConfig).mockReturnValue({
      freeDeliveryEnabled: false,
      freeDeliveryThreshold: "$90",
      expressDeliveryTimeLabel: "Arrives in 90 minutes",
      currency: "USD",
      cityFeeUsd: null,
      expressSurchargeUsd: 15,
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.queryByTestId("free-delivery-banner")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: delivery fee display states in the Order Summary sidebar
// Covers all four combinations of delivery mode (standard / express) ×
// whether the subtotal meets the free-delivery threshold.
// ---------------------------------------------------------------------------

const DELIVERY_CONFIG_WITH_FEE = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "$90",
  freeDeliveryThresholdUsd: 90,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10,
  expressSurchargeUsd: 15,
};

const CART_BELOW_THRESHOLD = {
  items: [FAKE_ITEM],
  subtotal: 75,
  itemCount: 1,
};

const CART_ABOVE_THRESHOLD = {
  items: [FAKE_ITEM],
  subtotal: 95,
  itemCount: 1,
};

describe("Cart — delivery fee display states", () => {
  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue(DELIVERY_CONFIG_WITH_FEE);
    mockUseDeliverySelection.mockReturnValue({
      mode: null,
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
  });

  it("standard + below threshold → shows city fee amount, no express row", () => {
    mockUseDeliverySelection.mockReturnValue({
      mode: "schedule",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("$10")).toBeTruthy();
    expect(screen.queryByText("cart.deliveryFree")).toBeNull();
    expect(screen.queryByText("cart.expressLabel")).toBeNull();
  });

  it("standard + above threshold → shows 'Free', no express row", () => {
    mockUseDeliverySelection.mockReturnValue({
      mode: "schedule",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.queryByText("$10")).toBeNull();
    expect(screen.queryByText("cart.expressLabel")).toBeNull();
  });

  it("express + below threshold → shows city fee amount and express surcharge row", () => {
    mockUseDeliverySelection.mockReturnValue({
      mode: "express",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("$10")).toBeTruthy();
    expect(screen.queryByText("cart.deliveryFree")).toBeNull();
    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("$15")).toBeTruthy();
  });

  it("express + above threshold → shows 'Free', express surcharge row; total = subtotal + surcharge only", () => {
    mockUseDeliverySelection.mockReturnValue({
      mode: "express",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.queryByText("$10")).toBeNull();
    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("$15")).toBeTruthy();
    const totals = screen.getAllByText("$110");
    expect(totals.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: coupon discount display and total calculation
// Covers the four scenarios called out in the task:
//   1. No coupon → discount row absent
//   2. Coupon applied → discount row shows correct amount
//   3. Coupon + free-delivery threshold met → total = subtotal - discount (no fee)
//   4. Coupon + express mode → total = subtotal + express surcharge - discount
//
// The coupon state is initialised from localStorage (same path Cart.tsx uses
// in its useState initialisers), so seeding localStorage before render is the
// minimal way to exercise these branches without touching internal state.
// ---------------------------------------------------------------------------

describe("Cart — coupon discount display and total calculation", () => {
  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue(DELIVERY_CONFIG_WITH_FEE);
    mockUseDeliverySelection.mockReturnValue({
      mode: "schedule",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("1. no coupon → discount row is absent", () => {
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.queryByTestId("row-cart-coupon-discount")).toBeNull();
  });

  it("2. coupon applied → discount row appears with the correct code and amount", () => {
    localStorage.setItem(COUPON_STORAGE_KEY, "SAVE10");
    localStorage.setItem(COUPON_DISCOUNT_KEY, "10");

    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    const row = screen.getByTestId("row-cart-coupon-discount");
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("SAVE10");
    expect(row.textContent).toContain("$10");
  });

  it("3. coupon + free-delivery threshold met → total = subtotal − discount (no delivery fee)", () => {
    // subtotal=95 ≥ threshold=90 → deliveryFeeUsd=0 (Free)
    // cartTotal = 95 + 0 − 10 = 85
    localStorage.setItem(COUPON_STORAGE_KEY, "SAVE10");
    localStorage.setItem(COUPON_DISCOUNT_KEY, "10");

    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByTestId("row-cart-coupon-discount")).toBeTruthy();
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    const totals = screen.getAllByText("$85");
    expect(totals.length).toBeGreaterThan(0);
  });

  it("4. coupon + express mode → total = subtotal + express surcharge − discount", () => {
    // subtotal=95 ≥ threshold=90 → deliveryFeeUsd=0 (Free), express surcharge=15
    // effectiveDeliveryFeeUsd = 0 + 15 = 15
    // cartTotal = 95 + 15 − 10 = 100
    localStorage.setItem(COUPON_STORAGE_KEY, "SAVE10");
    localStorage.setItem(COUPON_DISCOUNT_KEY, "10");

    mockUseDeliverySelection.mockReturnValue({
      mode: "express",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });

    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByTestId("row-cart-coupon-discount")).toBeTruthy();
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    const totals = screen.getAllByText("$100");
    expect(totals.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: UAE express surcharge ($4.90) — AE shopper sees the correct amount
// in both the below-threshold and above-threshold states.
// ---------------------------------------------------------------------------

const AE_DELIVERY_CONFIG = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "AED 330",
  freeDeliveryThresholdUsd: 89.84,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10,
  expressSurchargeUsd: 4.9,
};

// AE free-delivery threshold is ~$89.84 USD.
const AE_CART_BELOW_THRESHOLD = { items: [FAKE_ITEM], subtotal: 75, itemCount: 1 };
const AE_CART_ABOVE_THRESHOLD = { items: [FAKE_ITEM], subtotal: 95, itemCount: 1 };

describe("Cart — UAE express surcharge ($4.90)", () => {
  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue(AE_DELIVERY_CONFIG);
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "AE",
      city: null,
      country: null,
      cityId: null,
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    });
    mockUseDeliverySelection.mockReturnValue({
      mode: "express",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "LB",
      city: null,
      country: null,
      cityId: null,
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    });
  });

  it("express + below threshold → shows city fee and AE express surcharge ($4.9), not LB surcharge ($15)", () => {
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: AE_CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("$4.9")).toBeTruthy();
    expect(screen.getByText("$10")).toBeTruthy();
    expect(screen.queryByText("$15")).toBeNull();
  });

  it("express + above threshold → shows 'Free' delivery and AE express surcharge ($4.9); total = subtotal + surcharge only", () => {
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: AE_CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.getByText("$4.9")).toBeTruthy();
    expect(screen.queryByText("$15")).toBeNull();
    // Total = 95 (subtotal) + 4.9 (surcharge) = 99.9
    const totals = screen.getAllByText("$99.9");
    expect(totals.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Cyprus express surcharge ($15 — falls through to LB_EXPRESS_SURCHARGE)
// CY uses the same surcharge as LB. These tests pin that behaviour so a
// future CY-specific constant or expressSurchargeForCountry("CY") change
// would immediately surface here as a failing assertion.
// ---------------------------------------------------------------------------

const CY_DELIVERY_CONFIG = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "€120",
  freeDeliveryThresholdUsd: 120,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10,
  expressSurchargeUsd: 15, // expressSurchargeForCountry("CY") → LB_EXPRESS_SURCHARGE
};

// CY free-delivery threshold is $120 USD.
const CY_CART_BELOW_THRESHOLD = { items: [FAKE_ITEM], subtotal: 75, itemCount: 1 };
const CY_CART_ABOVE_THRESHOLD = { items: [FAKE_ITEM], subtotal: 130, itemCount: 1 };

describe("Cart — Cyprus express surcharge ($15, same as LB fallback)", () => {
  beforeEach(() => {
    vi.mocked(useDeliveryConfig).mockReturnValue(CY_DELIVERY_CONFIG);
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "CY",
      city: null,
      country: null,
      cityId: null,
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    });
    mockUseDeliverySelection.mockReturnValue({
      mode: "express",
      date: null,
      slotLabel: null,
      hasSelection: false,
      setSelection: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.mocked(useLocationSelection).mockReturnValue({
      countryCode: "LB",
      city: null,
      country: null,
      cityId: null,
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    });
  });

  it("express + below threshold → shows city fee and CY express surcharge ($15)", () => {
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CY_CART_BELOW_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("$15")).toBeTruthy();
    expect(screen.getByText("$10")).toBeTruthy();
    // AE-specific surcharge must not appear
    expect(screen.queryByText("$4.9")).toBeNull();
  });

  it("express + above threshold → shows 'Free' delivery and CY express surcharge ($15); total = subtotal + surcharge only", () => {
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CY_CART_ABOVE_THRESHOLD,
      currency: CURRENCY_FIXTURE,
    });

    expect(screen.getByText("cart.expressLabel")).toBeTruthy();
    expect(screen.getByText("cart.deliveryFree")).toBeTruthy();
    expect(screen.getByText("$15")).toBeTruthy();
    expect(screen.queryByText("$4.9")).toBeNull();
    // Total = 130 (subtotal) + 15 (surcharge) = 145
    const totals = screen.getAllByText("$145");
    expect(totals.length).toBeGreaterThan(0);
  });
});
