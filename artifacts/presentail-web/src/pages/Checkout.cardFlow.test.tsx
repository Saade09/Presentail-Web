// @vitest-environment jsdom
//
// Tests for the card payment branch of handleSubmit in CheckoutForm.
//
// Covers three critical scenarios that the production code must handle
// correctly so shoppers are never charged without an order, or an order
// created without payment:
//
//   1. Happy path (no 3DS / 4000000000003220 card):
//      confirmCardPayment resolves with status="succeeded" immediately →
//      order is created, shopper is redirected to the confirmation page.
//
//   2. 3DS required path (4000002760003184 card):
//      confirmCardPayment returns status="requires_action" →
//      handleNextAction is called → resolves with status="succeeded" →
//      order is created.
//
//   3. Failure paths (3DS cancelled, card declined, network error):
//      An error in any step must set the visible card error message and
//      must NOT create a WooCommerce order.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks — must be hoisted so Checkout.tsx's module-level
// `loadStripe(...)` call and `Elements`/`useStripe` hooks are intercepted.
// ---------------------------------------------------------------------------

const mockConfirmCardPayment = vi.fn();
const mockHandleNextAction = vi.fn();
const mockStripe = {
  confirmCardPayment: mockConfirmCardPayment,
  handleNextAction: mockHandleNextAction,
  // In jsdom there is no Apple Pay / Google Pay, so canMakePayment returns null.
  // This causes the checkout's wallet-availability effect to fall back to "card"
  // as the selected payment method, matching the original test intent.
  paymentRequest: vi.fn(() => ({
    canMakePayment: vi.fn().mockResolvedValue(null),
  })),
};
const mockCardElement = {}; // opaque card element reference

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useStripe: () => mockStripe,
  useElements: () => ({
    getElement: () => mockCardElement,
  }),
  CardNumberElement: "div",
  CardExpiryElement: "div",
  CardCvcElement: "div",
}));

// ---------------------------------------------------------------------------
// API / mutation mocks
// ---------------------------------------------------------------------------

const mockCreatePaymentIntentMutate = vi.fn();
const mockCreateOrderMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateCheckoutPaymentIntent: () => ({
    mutateAsync: mockCreatePaymentIntentMutate,
    isPending: false,
  }),
}));

vi.mock("@/lib/queries", () => ({
  useCreateOrder: () => ({
    mutateAsync: mockCreateOrderMutate,
    isPending: false,
  }),
  useStripeCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMamoPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePaypalPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeliveryLocations: () => ({
    data: { countries: [], cities: [] },
    isLoading: false,
  }),
  // useDisplayCurrency calls useCurrenciesData() for a background refetch
  // and useFxRates() for live FX conversion — both are side-effect-only hooks
  // that are safe to stub as no-ops in tests.
  useCurrenciesData: () => ({ data: undefined, isLoading: false }),
  useFxRates: () => ({ data: undefined, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Context / hook mocks
// ---------------------------------------------------------------------------

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: () => ({
      countryCode: "LB",
      country: { name: "Lebanon", code: "LB", flag: "🇱🇧" },
      city: { name: "Beirut", id: "beirut", fee: 8 },
      activeCities: [{ name: "Beirut", id: "beirut", fee: 8 }],
      selectedCityData: { name: "Beirut", id: "beirut", fee: 8, freeDeliveryEnabled: false },
    }),
    LocationProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({
    date: "",
    mode: "schedule",
    slotLabel: null,
    setDate: vi.fn(),
    setMode: vi.fn(),
    setSlotLabel: vi.fn(),
  }),
  DeliverySelectionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/checkout", mockSetLocation],
  Link: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useHeadingFont", () => ({
  useHeadingFont: () => "serif",
}));

vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date("2025-06-05T10:00:00Z"),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("react-phone-number-input", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-phone-number-input")>();
  return {
    ...original,
    // Always pass validation so tests can use any non-empty phone string.
    isValidPhoneNumber: () => true,
  };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, addresses: [] }),
}));

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: () => ({
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
    freeDeliveryThreshold: "$90",
    freeDeliveryThresholdUsd: 90,
    currency: "USD",
    freeDeliveryEnabled: false,
    cityFeeUsd: 8,
    expressSurchargeUsd: 15,
  }),
}));

// ---------------------------------------------------------------------------
// Component stubs — replace heavy sub-components with lightweight test doubles
// ---------------------------------------------------------------------------

// StripeCardFields renders the error so the test can assert it is visible.
vi.mock("@/components/StripeCardFields", () => ({
  StripeCardFields: ({ error }: { error?: string | null }) => (
    <div data-testid="stripe-card-fields">
      {error ? <p data-testid="stripe-card-error">{error}</p> : null}
    </div>
  ),
}));

// WebPhoneField exposed as a simple text input so tests can type into it.
vi.mock("@/components/WebPhoneField", () => ({
  WebPhoneField: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
    [k: string]: unknown;
  }) => (
    <input
      data-testid="input-recipient-phone"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

vi.mock("@/components/cart/FreeDeliveryBanner", () => ({
  FreeDeliveryBanner: () => null,
}));

vi.mock("@/components/cart/CheckoutLoginDialog", () => ({
  CheckoutLoginDialog: () => null,
}));

vi.mock("@/components/skeletons/CheckoutSkeleton", () => ({
  CheckoutSkeleton: () => <div data-testid="checkout-skeleton" />,
}));

vi.mock("@/components/delivery/DeliveryDateRow", () => ({
  DeliveryDateRow: () => null,
}));

vi.mock("@/components/delivery/DeliveryPickerModal", () => ({
  DeliveryPickerModal: () => null,
}));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => (
    <span>${usdValue}</span>
  ),
}));

vi.mock("@/components/product/ScheduleInlinePanel", () => ({
  ScheduleInlinePanel: () => null,
}));

// Cart.tsx is imported by Checkout.tsx only for its exported string constants.
// Mocking it prevents Cart.tsx (which imports a non-existent attached_asset)
// from being resolved during the test transform step.
vi.mock("./Cart", () => ({
  CARD_MESSAGE_KEY: "presentail_card_message_v1",
  CARD_TO_KEY: "presentail_card_to_v1",
  CARD_FROM_KEY: "presentail_card_from_v1",
  COUPON_STORAGE_KEY: "presentail_coupon_v1",
}));

// Payment logo SVGs — imported as URL strings but irrelevant to the tests.
vi.mock("@/assets/payment-logos/applepay.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/googlepay.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/visa.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/mastercard.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/amex.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/whish.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/paypal.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/western-union.svg", () => ({ default: "" }));

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Checkout from "./Checkout";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_ITEM = {
  product: {
    id: "p1",
    name: "Red Roses",
    priceValue: 50,
    price: "50",
    image: null,
    category: "flowers",
    inStock: true,
    occasions: [],
    wcId: 99,
    slug: "red-roses",
  },
  quantity: 1,
};

const SIGNED_IN_USER = {
  id: 1,
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "+12125551234",
};

// Default createPaymentIntent response — server created the PI and returned
// the clientSecret the browser needs to confirm the card.
const PAYMENT_INTENT_RES = {
  ok: true,
  clientSecret: "pi_test_abc_secret_xyz",
  orderId: "web-order-test",
  amount: 5000,
  currency: "USD",
};

// Default createOrder response — WC accepted the order.
const ORDER_SUCCESS_RES = {
  ok: true,
  wcOrderId: 42,
  orderKey: "wc_order_key",
  couponDiscount: 0,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Render the full Checkout page as a signed-in shopper with one cart item. */
function renderCheckout() {
  return renderWithProviders(<Checkout />, {
    auth: {
      user: SIGNED_IN_USER as any,
      token: "fake-token",
      isLoading: false,
    },
    cart: {
      items: [FAKE_ITEM],
      subtotal: 50,
      itemCount: 1,
      isHydrated: true,
      clearCart: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      updateQuantity: vi.fn(),
    },
  });
}

/**
 * Fill the minimum required Step 1 fields and click Continue to reach Step 2.
 *
 * Uses noAddress mode to avoid the delivery-address input.
 * The signed-in user already has a phone, so the sender section is hidden.
 */
async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
  // Enable "Ask recipient for address" so the street-address field is not required.
  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);

  // Recipient first name (required).
  const firstNameInput = screen.getByTestId("input-recipient-first-name");
  await user.type(firstNameInput, "John");

  // Recipient phone (required, validated via mocked isValidPhoneNumber → always true).
  const phoneInput = screen.getByTestId("input-recipient-phone");
  await user.type(phoneInput, "+12125550000");

  // Proceed to the payment step.
  const continueBtn = screen.getByTestId("button-continue-to-payment");
  await user.click(continueBtn);

  // Verify we reached step 2 (the submit button is visible).
  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout — card payment flow (handleSubmit)", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    user = userEvent.setup();
  });

  // ── 1. Happy path: card charged directly (no 3DS) ──────────────────────

  it("happy path (no 3DS, like 4000000000003220): creates order and redirects on succeeded PI", async () => {
    // confirmCardPayment resolves immediately with status="succeeded".
    // This mirrors the 4000000000003220 test card which does not trigger 3DS.
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_direct_abc", status: "succeeded" },
    });
    mockCreateOrderMutate.mockResolvedValue(ORDER_SUCCESS_RES);

    renderCheckout();
    await navigateToStep2(user);

    // Card tile is selected: wallet is the optimistic default but the
    // canMakePayment mock returns null (no wallet in jsdom) so the checkout
    // effect silently falls back to card before the shopper interacts.
    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    await waitFor(() => {
      // PaymentIntent was created server-side.
      expect(mockCreatePaymentIntentMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: [{ wcId: 99, osSlug: "p1", quantity: 1 }],
            currency: "USD",
          }),
        }),
      );
    });

    await waitFor(() => {
      // handleNextAction must NOT be called for a direct charge.
      expect(mockHandleNextAction).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      // Order was created with the PI id as the paymentRef.
      expect(mockCreateOrderMutate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentRef: "pi_direct_abc" }),
      );
    });

    await waitFor(() => {
      // Shopper redirected to the order confirmed page.
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/order-confirmed"),
      );
    });
  });

  // ── 2. 3DS required path: requires_action → auth succeeds ──────────────

  it("3DS path (like 4000002760003184): calls handleNextAction and creates order when auth succeeds", async () => {
    // confirmCardPayment returns requires_action first (3DS challenge needed).
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_abc", status: "requires_action" },
    });
    // handleNextAction simulates the shopper completing the 3DS dialog.
    mockHandleNextAction.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_abc", status: "succeeded" },
    });
    mockCreateOrderMutate.mockResolvedValue(ORDER_SUCCESS_RES);

    renderCheckout();
    await navigateToStep2(user);

    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    await waitFor(() => {
      // handleNextAction must be called with the clientSecret.
      expect(mockHandleNextAction).toHaveBeenCalledWith({
        clientSecret: PAYMENT_INTENT_RES.clientSecret,
      });
    });

    await waitFor(() => {
      // Order was created after 3DS succeeded.
      expect(mockCreateOrderMutate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentRef: "pi_3ds_abc" }),
      );
    });

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/order-confirmed"),
      );
    });
  });

  // ── 3a. Failure path: card declined ────────────────────────────────────

  it("failure path (card declined): shows error and does NOT create an order", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    // Simulate a declined card — stripe.confirmCardPayment returns an error.
    mockConfirmCardPayment.mockResolvedValue({
      error: { message: "Your card was declined." },
    });

    renderCheckout();
    await navigateToStep2(user);

    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    // The error message must appear in the card fields area.
    await waitFor(() => {
      const el = screen.getByTestId("stripe-card-error");
      expect(el.textContent).toContain("Your card was declined.");
    });

    // No order must be submitted.
    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    // No redirect.
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  // ── 3b. Failure path: 3DS cancelled ────────────────────────────────────

  it("failure path (3DS cancelled / auth failed): shows error and does NOT create an order", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_cancel", status: "requires_action" },
    });
    // The shopper cancelled the 3DS popup or the issuer rejected the auth.
    mockHandleNextAction.mockResolvedValue({
      error: { message: "Authentication cancelled." },
    });

    renderCheckout();
    await navigateToStep2(user);

    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    await waitFor(() => {
      const el = screen.getByTestId("stripe-card-error");
      expect(el.textContent).toContain("Authentication cancelled.");
    });

    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  // ── 3c. Failure path: PI remains in non-succeeded state after 3DS ──────

  it("failure path (PI not succeeded after 3DS): shows generic error and does NOT create an order", async () => {
    // Issuer hard-declined after the 3DS challenge (rare but possible).
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_declined", status: "requires_action" },
    });
    mockHandleNextAction.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_declined", status: "requires_payment_method" },
    });

    renderCheckout();
    await navigateToStep2(user);

    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    await waitFor(() => {
      // The generic "payment failed" key is the t() result in tests (identity function).
      expect(screen.getByTestId("stripe-card-error")).toBeTruthy();
    });

    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  // ── 3d. Failure path: PaymentIntent creation fails (server error) ───────

  it("failure path (server cannot create PI): shows an inline card error and does NOT call stripe", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue({
      ok: false,
      message: "Stripe is not configured.",
    });

    renderCheckout();
    await navigateToStep2(user);

    const submitBtn = screen.getByTestId("button-submit-payment");
    await user.click(submitBtn);

    await waitFor(() => {
      // The error must appear inline in the card fields area, not as a toast.
      const el = screen.getByTestId("stripe-card-error");
      expect(el.textContent).toContain("Stripe is not configured.");
    });

    // No toast should be shown for card-path errors.
    expect(mockToast).not.toHaveBeenCalled();

    // Neither Stripe nor the order route should be called.
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
  });
});
