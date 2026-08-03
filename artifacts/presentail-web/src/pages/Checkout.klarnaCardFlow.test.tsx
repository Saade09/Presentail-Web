// @vitest-environment jsdom
//
// Tests for the card payment branch of handleSubmit when Klarna is enabled
// (usePaymentElement / PaymentElement mode — "Path A" in Checkout.tsx).
//
// Covers the PaymentElement mounting fix (usePaymentElement={klarnaEnabled}):
//
//   1. Happy path (PaymentElement fired onReady): submit calls
//      elements.submit() then stripe.confirmPayment(); the pending-order
//      payload is stashed in sessionStorage BEFORE confirmPayment runs (so it
//      survives a Klarna redirect) with the PaymentIntent id as paymentRef;
//      a succeeded card PI finalizes the order and redirects — no
//      "elements should have a mounted Payment Element" error.
//
//   2. Guard path (PaymentElement NOT ready): submit while
//      isPaymentElementReady=false must show the inline card error and must
//      NOT call elements.submit(), stripe.confirmPayment(), or create an
//      order — instead of throwing the mounted-Payment-Element error.
//
//   3. elements.submit() validation error: shows the inline error without
//      creating a PaymentIntent.
//
//   4. confirmPayment error (e.g. declined in PaymentElement mode): shows the
//      inline error and does NOT create an order.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks
// ---------------------------------------------------------------------------

const mockConfirmCardPayment = vi.fn();
const mockHandleNextAction = vi.fn();
const mockConfirmPayment = vi.fn();
const mockElementsSubmit = vi.fn();

const mockCanMakePayment = vi.fn().mockResolvedValue(null);
const mockPaymentRequest = vi.fn(() => ({
  canMakePayment: mockCanMakePayment,
  update: vi.fn(),
  show: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));

const mockStripe = {
  confirmCardPayment: mockConfirmCardPayment,
  handleNextAction: mockHandleNextAction,
  confirmPayment: mockConfirmPayment,
  paymentRequest: mockPaymentRequest,
};
const mockCardElement = {};
const mockElements = {
  getElement: () => mockCardElement,
  submit: mockElementsSubmit,
};

const mockUseIsMobile = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useStripe: () => mockStripe,
  useElements: () => mockElements,
  CardNumberElement: "div",
  CardExpiryElement: "div",
  CardCvcElement: "div",
  PaymentElement: "div",
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
  useTabbyPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeliveryLocations: () => ({
    data: { countries: [], cities: [] },
    isLoading: false,
  }),
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
    date: "2025-06-06",
    mode: "schedule",
    slotLabel: null,
    hasSelection: true,
    setSelection: vi.fn(),
    clear: vi.fn(),
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
  trackWebEvent: vi.fn(),
}));

vi.mock("react-phone-number-input", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-phone-number-input")>();
  return {
    ...original,
    isValidPhoneNumber: () => true,
  };
});

// apiFetch: the Klarna rollout probe returns enabled=true so the checkout
// renders in PaymentElement (Path A) mode; every other endpoint (addresses,
// payment methods, fee checks) returns a benign empty response.
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn((url: string) => {
    if (typeof url === "string" && url.includes("/checkout/klarna-status")) {
      return Promise.resolve({ ok: true, enabled: true, payerCountry: "LB" });
    }
    return Promise.resolve({ ok: true, addresses: [], paymentMethods: [] });
  }),
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
// Component stubs
// ---------------------------------------------------------------------------

// Controls whether the StripeCheckoutSection stub fires onPaymentElementReady.
// true  → simulates a fully-mounted PaymentElement (onReady fired).
// false → simulates a submit before the lazy Stripe iframe finished rendering.
let firePaymentElementReady = true;

vi.mock("@/components/StripeCheckoutSection", () => ({
  StripeCheckoutSection: ({
    onStripeReady,
    showCardFields,
    cardError,
    usePaymentElement,
    onPaymentElementReady,
  }: {
    onStripeReady: (stripe: unknown, elements: unknown) => void;
    showCardFields: boolean;
    cardError: string | null;
    usePaymentElement?: boolean;
    onPaymentElementReady?: (ready: boolean) => void;
  }) => {
    React.useEffect(() => {
      onStripeReady(mockStripe, mockElements);
    }, [onStripeReady]);
    React.useEffect(() => {
      if (usePaymentElement && firePaymentElementReady) {
        onPaymentElementReady?.(true);
      }
    }, [usePaymentElement, onPaymentElementReady]);
    if (!showCardFields) return null;
    return (
      <div
        data-testid="stripe-card-fields"
        data-payment-element={usePaymentElement ? "true" : "false"}
      >
        {cardError ? <p data-testid="stripe-card-error">{cardError}</p> : null}
      </div>
    );
  },
}));

vi.mock("@/components/StripeCardFields", () => ({
  StripeCardFields: ({ error }: { error?: string | null }) => (
    <div data-testid="stripe-card-fields">
      {error ? <p data-testid="stripe-card-error">{error}</p> : null}
    </div>
  ),
}));

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

vi.mock("@/components/LazyWebPhoneField", () => ({
  LazyWebPhoneField: ({
    value,
    onChange,
    onValidityChange,
    "data-testid": testId,
  }: {
    value: string;
    onChange: (v: string) => void;
    onValidityChange?: (valid: boolean) => void;
    "data-testid"?: string;
    [k: string]: unknown;
  }) => (
    <input
      data-testid={testId ?? "input-recipient-phone"}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
        onValidityChange?.(e.target.value.trim().length > 0);
      }}
    />
  ),
}));

vi.mock("@/components/Logo", () => ({ Logo: () => <div data-testid="logo" /> }));
vi.mock("@/components/cart/FreeDeliveryBanner", () => ({ FreeDeliveryBanner: () => null }));
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({ CheckoutLoginDialog: () => null }));
vi.mock("@/components/skeletons/CheckoutSkeleton", () => ({
  CheckoutSkeleton: () => <div data-testid="checkout-skeleton" />,
}));
vi.mock("@/components/delivery/DeliveryDateRow", () => ({ DeliveryDateRow: () => null }));
vi.mock("@/components/delivery/DeliveryPickerModal", () => ({ DeliveryPickerModal: () => null }));
vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => <span>${usdValue}</span>,
}));
vi.mock("@/components/product/ScheduleInlinePanel", () => ({ ScheduleInlinePanel: () => null }));

vi.mock("./Cart", () => ({
  CARD_MESSAGE_KEY: "presentail_card_message_v1",
  CARD_TO_KEY: "presentail_card_to_v1",
  CARD_FROM_KEY: "presentail_card_from_v1",
  COUPON_STORAGE_KEY: "presentail_coupon_v1",
}));

vi.mock("@/assets/payment-logos/applepay.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/googlepay.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/visa.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/mastercard.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/amex.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/whish.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/paypal.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/western-union.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/tabby.svg", () => ({ default: "" }));
vi.mock("@/assets/payment-logos/klarna.svg", () => ({ default: "" }));

// ---------------------------------------------------------------------------
// Import AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Checkout from "./Checkout";
import type { ShimUser } from "@/contexts/AuthContext";
import type { CartItem } from "@/contexts/CartContext";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const PENDING_ORDER_KEY = "presentail_pending_order_v1"; // i18n-ignore

const FAKE_ITEM: CartItem = {
  product: {
    id: "p1",
    name: "Red Roses",
    priceValue: 50,
    price: "50",
    image: null,
    category: "flowers",
    categories: ["flowers"],
    inStock: true,
    occasions: [],
    wcId: 99,
  },
  quantity: 1,
};

const SIGNED_IN_USER: ShimUser = {
  id: "1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "+12125551234",
};

const PAYMENT_INTENT_RES = {
  ok: true,
  clientSecret: "pi_klarna_test_secret_xyz",
  orderId: "web-order-test",
  amount: 5000,
  currency: "USD",
};

function renderCheckout() {
  return renderWithProviders(<Checkout />, {
    auth: { user: SIGNED_IN_USER, token: "fake-token", isLoading: false },
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

async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);

  await user.type(screen.getByTestId("input-recipient-first-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");

  await user.click(screen.getByTestId("button-continue-to-payment"));
  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();

  await user.click(await screen.findByTestId("option-payment-card"));
  await screen.findByTestId("stripe-card-fields");
}

/** Wait until the Klarna probe has flipped the checkout into PaymentElement mode. */
async function waitForPaymentElementMode() {
  await waitFor(() => {
    expect(
      screen.getByTestId("stripe-card-fields").getAttribute("data-payment-element"),
    ).toBe("true");
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout — card payment with Klarna enabled (PaymentElement / Path A)", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    firePaymentElementReady = true;
    mockUseIsMobile.mockReturnValue(false);
    mockElementsSubmit.mockResolvedValue({});
    mockCreateOrderMutate.mockResolvedValue({
      ok: true,
      wcOrderId: 42,
      orderKey: "wc_order_key_42",
      couponDiscount: 0,
    });
    user = userEvent.setup();
  });

  // ── 1. Happy path: PaymentElement ready, card succeeds via confirmPayment ──

  it("card payment completes via elements.submit() + confirmPayment when the PaymentElement has fired onReady", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    // Capture the sessionStorage stash at confirmPayment time — the pending
    // order payload must already be written BEFORE confirmPayment runs so it
    // survives a Klarna redirect away from the page.
    let stashAtConfirmTime: string | null = null;
    mockConfirmPayment.mockImplementation(async () => {
      stashAtConfirmTime = sessionStorage.getItem(PENDING_ORDER_KEY);
      return { paymentIntent: { id: "pi_klarna_test", status: "succeeded" } };
    });

    renderCheckout();
    await navigateToStep2(user);
    await waitForPaymentElementMode();

    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      // Path A validated the Elements form before creating the PI.
      expect(mockElementsSubmit).toHaveBeenCalled();
      expect(mockConfirmPayment).toHaveBeenCalledTimes(1);
    });

    // confirmPayment received the Elements instance (new-card path) and the
    // clientSecret from the server-created PI, with redirect only if required.
    const confirmArgs = mockConfirmPayment.mock.calls[0][0];
    expect(confirmArgs.elements).toBe(mockElements);
    expect(confirmArgs.clientSecret).toBe(PAYMENT_INTENT_RES.clientSecret);
    expect(confirmArgs.redirect).toBe("if_required");

    // The Klarna-redirect stash was written before confirmPayment ran, with
    // the PI id (derived from the clientSecret) as the paymentRef.
    expect(stashAtConfirmTime).toBeTruthy();
    const stashed = JSON.parse(stashAtConfirmTime!);
    expect(stashed.payload.paymentRef).toBe("pi_klarna_test");

    // The legacy split-fields path must NOT run in PaymentElement mode.
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
    expect(mockHandleNextAction).not.toHaveBeenCalled();

    await waitFor(() => {
      // Order finalized + redirected — no mounted-Payment-Element error.
      expect(mockCreateOrderMutate).toHaveBeenCalled();
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/order-confirmed"),
      );
    });
    expect(screen.queryByTestId("stripe-card-error")).toBeNull();
  });

  // ── 2. Guard: submit before the PaymentElement is ready ────────────────

  it("submit while isPaymentElementReady=false shows the inline card error instead of calling elements.submit()", async () => {
    firePaymentElementReady = false; // PaymentElement never fires onReady
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    renderCheckout();
    await navigateToStep2(user);
    await waitForPaymentElementMode();

    await user.click(screen.getByTestId("button-submit-payment"));

    // The guard shows the inline "card unavailable" error (t() is identity in
    // tests, so the raw key is rendered).
    await waitFor(() => {
      expect(screen.getByTestId("stripe-card-error").textContent).toContain(
        "checkout.toast.cardUnavailable",
      );
    });

    // Nothing downstream runs — this is exactly the "mounted Payment Element"
    // throw the guard prevents.
    expect(mockElementsSubmit).not.toHaveBeenCalled();
    expect(mockCreatePaymentIntentMutate).not.toHaveBeenCalled();
    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  // ── 3. elements.submit() validation error ───────────────────────────────

  it("elements.submit() validation error shows inline error and does NOT create a PaymentIntent", async () => {
    mockElementsSubmit.mockResolvedValue({
      error: { message: "Your card number is incomplete." },
    });

    renderCheckout();
    await navigateToStep2(user);
    await waitForPaymentElementMode();

    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(screen.getByTestId("stripe-card-error").textContent).toContain(
        "Your card number is incomplete.",
      );
    });

    expect(mockCreatePaymentIntentMutate).not.toHaveBeenCalled();
    expect(mockConfirmPayment).not.toHaveBeenCalled();
    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
  });

  // ── 4. confirmPayment error (declined) ──────────────────────────────────

  it("confirmPayment error shows the inline card error and does NOT create an order", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmPayment.mockResolvedValue({
      error: { message: "Your card was declined.", code: "card_declined" },
    });

    renderCheckout();
    await navigateToStep2(user);
    await waitForPaymentElementMode();

    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(screen.getByTestId("stripe-card-error").textContent).toContain(
        "Your card was declined.",
      );
    });

    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});
