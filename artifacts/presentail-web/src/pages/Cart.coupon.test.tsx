// @vitest-environment jsdom
//
// Unit tests for Cart.tsx's handleCouponApply:
//   (a) valid code → couponApplied becomes true, discount stored in localStorage, row shown
//   (b) 422 from server → couponError shows the server's message, not the generic fallback

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks — hoisted by Vitest before any import.
// vi.hoisted ensures the mock function is created before vi.mock factories run.
// ---------------------------------------------------------------------------

const { mockApiFetch } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: mockApiFetch,
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", vi.fn()]),
  Link: ({
    children,
    href,
    onClick,
    ...rest
  }: React.PropsWithChildren<{
    href: string;
    onClick?: React.MouseEventHandler;
    [k: string]: unknown;
  }>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => (
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
    cityFeeUsd: 0,
    expressSurchargeUsd: 15,
    isLoaded: true,
  })),
}));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/contexts/LocationContext")>();
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
  CheckoutLoginDialog: () => null,
}));

vi.mock("@/components/checkout/SuggestedMessagesDialog", () => ({
  SuggestedMessagesDialog: () => null,
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: vi.fn(() => ({
    mode: null as string | null,
    date: null,
    slotLabel: null,
    hasSelection: false,
    setSelection: vi.fn(),
    clear: vi.fn(),
  })),
  DeliverySelectionProvider: ({
    children,
  }: React.PropsWithChildren) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Cart, { COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY } from "./Cart";

// ---------------------------------------------------------------------------
// Shared fixture — sale product so we can assert effectivePrice is used
// ---------------------------------------------------------------------------

const FAKE_ITEM = {
  product: {
    id: "p1",
    name: "Red Roses Bouquet",
    priceValue: 75,
    discountPriceValue: 60, // sale price — effectivePrice(product) = 60
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
  subtotal: 60,
  itemCount: 1,
};

const CURRENCY_FIXTURE = {
  formatPrice: (v: number) => `$${v}`,
};

// ---------------------------------------------------------------------------
// Tests: handleCouponApply — happy path and sad path
// ---------------------------------------------------------------------------

describe("Cart — handleCouponApply", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("(a) valid code → couponApplied shown, discount stored in localStorage, discount row visible", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      discountAmountUsd: 10,
      finalTotalUsd: 50,
    });

    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    // Open the desktop promo accordion
    const promoToggle = await screen.findByTestId("button-promo-toggle");
    await user.click(promoToggle);

    const input = screen.getByTestId("input-promo-code");
    await user.type(input, "SAVE10");

    await user.click(screen.getByTestId("button-promo-apply"));

    // Discount row must appear
    await waitFor(() =>
      expect(screen.getByTestId("row-cart-coupon-discount")).toBeTruthy(),
    );

    // localStorage must be written with the code and amount
    expect(localStorage.getItem(COUPON_STORAGE_KEY)).toBe("SAVE10");
    expect(localStorage.getItem(COUPON_DISCOUNT_KEY)).toBe("10");

    // No error shown
    expect(screen.queryByTestId("text-promo-error")).toBeNull();

    // apiFetch must have been called with effectivePrice (60), not the full price (75)
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/coupons/validate",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"priceUsd":60'),
      }),
    );
  });

  it("(b) 422 from server → shows the server's message, not the generic fallback", async () => {
    const serverMessage = "Coupon not found";
    const err = Object.assign(new Error(serverMessage), { status: 422 });
    mockApiFetch.mockRejectedValue(err);

    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    const promoToggle = await screen.findByTestId("button-promo-toggle");
    await user.click(promoToggle);

    await user.type(screen.getByTestId("input-promo-code"), "BADCODE");
    await user.click(screen.getByTestId("button-promo-apply"));

    // Server's specific message must appear
    await waitFor(() =>
      expect(screen.getByTestId("text-promo-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("text-promo-error").textContent).toContain(
      serverMessage,
    );

    // Generic i18n fallback string must NOT appear
    expect(screen.getByTestId("text-promo-error").textContent).not.toContain(
      "cart.promoCodeError",
    );

    // localStorage must stay clean
    expect(localStorage.getItem(COUPON_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(COUPON_DISCOUNT_KEY)).toBeNull();
  });

  it("(b2) minimum-order message from server is displayed verbatim", async () => {
    const serverMessage = "This coupon requires a minimum order of $50";
    const err = Object.assign(new Error(serverMessage), { status: 422 });
    mockApiFetch.mockRejectedValue(err);

    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    const promoToggle = await screen.findByTestId("button-promo-toggle");
    await user.click(promoToggle);

    await user.type(screen.getByTestId("input-promo-code"), "MINCODE");
    await user.click(screen.getByTestId("button-promo-apply"));

    await waitFor(() =>
      expect(screen.getByTestId("text-promo-error").textContent).toContain(
        serverMessage,
      ),
    );
  });

  it("(b3) network-only failure shows an error (not silent)", async () => {
    mockApiFetch.mockRejectedValue(new Error("Failed to fetch"));

    const user = userEvent.setup();
    renderWithProviders(<Cart />, {
      auth: { user: null, isLoading: false, token: null },
      cart: CART_WITH_ITEM,
      currency: CURRENCY_FIXTURE,
    });

    const promoToggle = await screen.findByTestId("button-promo-toggle");
    await user.click(promoToggle);

    await user.type(screen.getByTestId("input-promo-code"), "NETFAIL");
    await user.click(screen.getByTestId("button-promo-apply"));

    // Something must show — no silent failure
    await waitFor(() =>
      expect(screen.getByTestId("text-promo-error")).toBeTruthy(),
    );
  });
});
