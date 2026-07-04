// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
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

import Cart from "./Cart";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";

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
