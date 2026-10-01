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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks — must be hoisted so Checkout.tsx's module-level
// `loadStripe(...)` call and `Elements`/`useStripe` hooks are intercepted.
// ---------------------------------------------------------------------------

const mockConfirmCardPayment = vi.fn();
const mockHandleNextAction = vi.fn();

// Controllable Stripe PaymentRequest (Apple Pay / Google Pay) mock.
// canMakePayment resolves null by default so:
//   • desktop card-flow tests keep auto-advancing to "card", and
//   • the upfront wallet probe leaves paymentRequestRef empty — on mobile,
//     handleSubmit then builds a fresh PaymentRequest on demand, which is the
//     real wallet path the wallet suite below exercises.
// pr.on(...) handlers are captured in mockPrEventHandlers so wallet tests can
// fire the native sheet's "paymentmethod" / "cancel" events synthetically;
// show()/update() are spies a test can configure (e.g. make show() throw).
type PrHandler = (ev?: unknown) => void | Promise<void>;
const mockCanMakePayment = vi.fn().mockResolvedValue(null);
const mockPrShow = vi.fn();
const mockPrUpdate = vi.fn();
const mockPrEventHandlers: Record<string, PrHandler> = {};
const mockPrOn = vi.fn((event: string, handler: PrHandler) => {
  mockPrEventHandlers[event] = handler;
});
const mockPrOff = vi.fn((event: string) => {
  delete mockPrEventHandlers[event];
});
const mockPaymentRequest = vi.fn(() => ({
  canMakePayment: mockCanMakePayment,
  update: mockPrUpdate,
  show: mockPrShow,
  on: mockPrOn,
  off: mockPrOff,
}));
const mockStripe = {
  confirmCardPayment: mockConfirmCardPayment,
  handleNextAction: mockHandleNextAction,
  paymentRequest: mockPaymentRequest,
};

// useIsMobile is used by the pre-creation wallet effect and related logic.
// Default: false (desktop). The card-flow tests explicitly click the Card
// tile via navigateToStep2() so they work regardless of wallet visibility.
const mockUseIsMobile = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));
const mockCardElement = {}; // opaque card element reference

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue(mockStripe),
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

vi.mock("@/lib/queries", () => {
  const deliveryLocations = {
    countries: [{
      code: "LB",
      cities: [{
        name: "Beirut",
        id: "beirut",
        fee: 8,
        expressAvailable: true,
        timeSlots: [{ label: "10:00 AM – 1:00 PM", cutoffHour: 23 }],
      }],
    }],
    cities: [],
  };
  return {
    useCreateOrder: () => ({
      mutateAsync: mockCreateOrderMutate,
      isPending: false,
    }),
    useStripeCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useMamoPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePaypalPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useTabbyPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeliveryLocations: () => ({
      data: deliveryLocations,
      isLoading: false,
    }),
    // useDisplayCurrency calls useCurrenciesData() for a background refetch
    // and useFxRates() for live FX conversion — both are side-effect-only hooks
    // that are safe to stub as no-ops in tests.
    useCurrenciesData: () => ({ data: undefined, isLoading: false }),
    useFxRates: () => ({ data: undefined, isLoading: false }),
  };
});

// ---------------------------------------------------------------------------
// Context / hook mocks
// ---------------------------------------------------------------------------

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  const country = { name: "Lebanon", code: "LB", flag: "🇱🇧" };
  const city = { name: "Beirut", id: "beirut", fee: 8, expressAvailable: true };
  const activeCities = [city];
  const selectedCityData = {
    ...city,
    freeDeliveryEnabled: false,
  };
  const selection = {
    countryCode: "LB",
    country,
    city,
    activeCities,
    selectedCityData,
  };
  return {
    ...actual,
    useLocationSelection: () => selection,
    LocationProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({
    date: "2025-06-06",
    mode: "express",
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

const mockTrackEvent = vi.hoisted(() => vi.fn());
const mockTrackFunnelEvent = vi.hoisted(() => vi.fn());
const mockTrackFunnelEventOnce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({
  // Wrap in a thunk so the factory (hoisted to the top of the file) does not
  // read mockTrackEvent before its const initialiser has run.
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackWebEvent: vi.fn(),
  trackFunnelEvent: (...args: unknown[]) => mockTrackFunnelEvent(...args),
  trackFunnelEventOnce: (...args: unknown[]) => mockTrackFunnelEventOnce(...args),
  funnelValueBucket: () => "under_50",
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

// StripeCheckoutSection is the lazy-loaded wrapper that provides the Elements
// context.  We mock it here so the test:
//   1. Immediately calls onStripeReady with the mockStripe/mockCardElement so
//      CheckoutForm.stripe / CheckoutForm.elements state is populated (no async
//      Suspense boundary needed in jsdom).
//   2. Renders a lightweight stand-in for the card fields when showCardFields=true.
vi.mock("@/components/StripeCheckoutSection", () => ({
  StripeCheckoutSection: ({
    onStripeReady,
    showCardFields,
    cardError,
  }: {
    onStripeReady: (
      stripe: typeof mockStripe | null,
      elements: { getElement: () => typeof mockCardElement } | null,
    ) => void;
    showCardFields: boolean;
    cardError: string | null;
    disabled: boolean;
    stripePromise: unknown;
  }) => {
    React.useEffect(() => {
      onStripeReady(mockStripe, { getElement: () => mockCardElement });
    }, [onStripeReady]);
    if (!showCardFields) return null;
    return (
      <div data-testid="stripe-card-fields">
        {cardError ? <p data-testid="stripe-card-error">{cardError}</p> : null}
      </div>
    );
  },
}));

// StripeCardFields is imported by StripeCheckoutSection (real code path), but
// since StripeCheckoutSection itself is mocked above, this stub is only needed
// to satisfy vitest's module resolution during transform — it is never rendered.
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

// LazyWebPhoneField bypasses Suspense in tests and exposes the same simple
// text input. Also fires onValidityChange(true) for any non-empty value so
// the parent's validity state (which replaced the static isValidPhoneNumber
// call) reflects a valid phone without needing the real libphonenumber-js.
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
import type { ShimUser } from "@/contexts/AuthContext";
import type { CartItem } from "@/contexts/CartContext";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

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

// Default createPaymentIntent response — server created the PI and returned
// the clientSecret the browser needs to confirm the card.
const PAYMENT_INTENT_RES = {
  ok: true,
  clientSecret: "pi_test_abc_secret_xyz",
  orderId: "web-order-test",
  amount: 5000,
  currency: "USD",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Render the full Checkout page as a signed-in shopper with one cart item. */
function renderCheckout() {
  return renderWithProviders(<Checkout />, {
    auth: {
      user: SIGNED_IN_USER,
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
 * Fill the minimum required Step 1 fields and click Continue to reach Step 2,
 * then explicitly click the Card tile.
 *
 * Uses noAddress mode to avoid the delivery-address input.
 * The signed-in user already has a phone, so the sender section is hidden.
 *
 * Clicking Card ensures Stripe is lazily loaded (triggerStripeLoad →
 * LazyStripeSection mounts → onStripeReady fires with the mock Stripe
 * instance) so the stripe instance is non-null before handleSubmit runs.
 * Card flow tests use this helper; wallet flow tests have their own helper
 * that clicks the wallet tile instead.
 */
async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
  // Enable "Ask recipient for address" so the street-address field is not required.
  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);

  // Recipient first name (required).
  const firstNameInput = screen.getByTestId("input-recipient-name");
  await user.type(firstNameInput, "John");

  // Recipient phone (required, validated via mocked isValidPhoneNumber → always true).
  const phoneInput = screen.getByTestId("input-recipient-phone");
  await user.type(phoneInput, "+12125550000");

  // Proceed to the payment step.
  const continueBtn = screen.getByTestId("button-continue-to-payment");
  await user.click(continueBtn);

  // Verify we reached step 2 (the submit button is visible).
  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();

  // Click the Card payment tile.  This calls setPaymentMethod("card") →
  // triggerStripeLoad() which sets stripeNeeded=true, causing LazyStripeSection
  // to mount.  The StripeCheckoutSection mock then fires onStripeReady with
  // the mockStripe instance so stripe is non-null before handleSubmit runs.
  const cardTile = await screen.findByTestId("option-payment-card");
  await user.click(cardTile);

  // Wait until the stripe card fields stub is visible — this confirms that
  // LazyStripeSection has mounted and onStripeReady has been called (stripe ≠ null).
  await screen.findByTestId("stripe-card-fields");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockTrackFunnelEvent.mockClear();
  mockTrackFunnelEventOnce.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/checkout/fees")
        ? {
            ok: true,
            subtotalUsd: 50,
            districtFeeUsd: 0,
            expressFeeUsd: 0,
            slotFeeUsd: 0,
            couponDiscountUsd: 0,
          }
        : { ok: true };
      return {
        ok: true,
        json: vi.fn().mockResolvedValue(body),
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Checkout — card payment flow (handleSubmit)", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    // Default to desktop so the null canMakePayment probe auto-advances to card.
    mockUseIsMobile.mockReturnValue(false);
    // Card success path calls finalizeOrderNow() which calls createOrder.mutateAsync
    // to submit the order then navigates to /order-confirmed.  Without a valid
    // response the mutateAsync call returns undefined, res.ok throws TypeError,
    // and handleSubmit's catch block shows a toast instead of navigating.
    mockCreateOrderMutate.mockResolvedValue({
      ok: true,
      wcOrderId: 42,
      orderKey: "wc_order_key_42",
      couponDiscount: 0,
    });
    user = userEvent.setup();
  });

  // ── 1. Happy path: card charged directly (no 3DS) ──────────────────────

  it("happy path (no 3DS, like 4000000000003220): creates order and redirects on succeeded PI", async () => {
    // confirmCardPayment resolves immediately with status="succeeded".
    // This mirrors the 4000000000003220 test card which does not trigger 3DS.
    //
    // The card path calls finalizeOrderNow() which calls createOrder.mutateAsync
    // to submit the order to the server, then navigates to /order-confirmed.
    // mockCreateOrderMutate is set up in beforeEach.
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_direct_abc", status: "succeeded" },
    });

    renderCheckout();
    await navigateToStep2(user);

    // navigateToStep2() explicitly clicked the Card tile, so the card path
    // is active regardless of what canMakePayment returns.
    const submitBtn = screen.getByTestId("button-submit-payment");
    expect(mockTrackFunnelEvent.mock.calls.some(([name]) => name === "payment_attempted")).toBe(false);
    await user.click(submitBtn);
    await waitFor(() =>
      expect(mockTrackFunnelEvent.mock.calls.some(([name]) => name === "payment_attempted")).toBe(true),
    );

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
      // Shopper redirected to the order confirmed page (order is finalised there).
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/order-confirmed"),
      );
    });
    await waitFor(() => {
      expect(mockTrackFunnelEventOnce).toHaveBeenCalledWith(
        "payment_completed",
        expect.any(String),
        expect.any(Object),
      );
      expect(mockTrackFunnelEventOnce).toHaveBeenCalledWith(
        "order_confirmed",
        expect.any(String),
        expect.any(Object),
      );
    });
    for (const [, data] of mockTrackFunnelEvent.mock.calls) {
      expect(data).not.toHaveProperty("email");
      expect(data).not.toHaveProperty("name");
      expect(data).not.toHaveProperty("address");
    }
  });

  // ── 2. 3DS required path: requires_action → auth succeeds ──────────────

  it("3DS path (like 4000002760003184): calls handleNextAction and redirects when auth succeeds", async () => {
    // confirmCardPayment returns requires_action first (3DS challenge needed).
    //
    // After 3DS succeeds finalizeOrderNow() submits the order via
    // createOrder.mutateAsync (mocked in beforeEach) and navigates to /order-confirmed.
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_abc", status: "requires_action" },
    });
    // handleNextAction simulates the shopper completing the 3DS dialog.
    mockHandleNextAction.mockResolvedValue({
      paymentIntent: { id: "pi_3ds_abc", status: "succeeded" },
    });

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
      // Shopper redirected to the order confirmed page (order is finalised there).
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
    expect(mockTrackFunnelEvent.mock.calls.some(([name]) => name === "payment_failed")).toBe(true);
    expect(mockTrackFunnelEvent.mock.calls.some(([name]) => name === "payment_attempted")).toBe(true);
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

// ---------------------------------------------------------------------------
// Wallet tile visibility tests
//
// Apple Pay and Google Pay tiles must remain visible even when Stripe's
// canMakePayment() probe returns null, on BOTH mobile and desktop. The initial
// probe can return null transiently (e.g. Mac Safari hasn't finished querying
// the Keychain yet) so hiding tiles based on it would incorrectly remove them
// for the entire page load. The definitive gate is the submit-time
// canMakePayment() call in the wallet intent pre-creation effect.
// ---------------------------------------------------------------------------

describe("Checkout — wallet tile visibility", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    user = userEvent.setup();
  });

  afterEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

  it("keeps the platform-appropriate wallet tile visible on mobile when canMakePayment returns null", async () => {
    // canMakePayment returns null (no pre-configured wallet in the test
    // environment) but the checkout must NOT hide the tiles on mobile.
    // In the jsdom test environment navigator.platform is empty/non-Apple, so
    // isApplePlatform() returns false: apple_pay is platform-hidden and
    // google_pay is the visible wallet tile. On real Apple devices the inverse
    // applies (apple_pay visible, google_pay hidden).
    mockUseIsMobile.mockReturnValue(true);
    renderCheckout();
    await navigateToStep2(user);

    // Google Pay tile must be present (the non-Apple wallet tile in jsdom).
    expect(screen.getByTestId("option-payment-google_pay")).toBeTruthy();
    // Apple Pay is platform-hidden in the non-Apple jsdom environment.
    expect(screen.queryByTestId("option-payment-apple_pay")).toBeNull();
  });

  it("keeps the platform-appropriate wallet tile visible on desktop when canMakePayment returns null", async () => {
    // The initial canMakePayment() probe can return null transiently on Mac
    // (e.g. Safari Keychain not yet resolved). Tiles must stay visible so the
    // shopper can still tap Apple Pay / Google Pay. The submit-time probe in
    // the wallet intent pre-creation effect is the definitive gate.
    mockUseIsMobile.mockReturnValue(false);
    renderCheckout();
    await navigateToStep2(user);

    // Google Pay tile must be present in the non-Apple jsdom environment.
    // (apple_pay is platform-hidden because isApplePlatform() returns false.)
    expect(screen.getByTestId("option-payment-google_pay")).toBeTruthy();
    expect(screen.queryByTestId("option-payment-apple_pay")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Step-1 sender email validation
//
// Guest checkout must reject malformed email addresses before advancing to
// payment. This protects non-Stripe methods, which otherwise only surface the
// malformed payload after the order request reaches the backend.
// ---------------------------------------------------------------------------

describe("Checkout — sender email validation", () => {
  const EMAIL_ERROR = "Enter a valid email address to continue.";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    window.history.replaceState(null, "", "/checkout?guest=1");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/checkout");
    const prototype = HTMLElement.prototype as unknown as { scrollIntoView?: unknown };
    delete prototype.scrollIntoView;
  });

  async function fillRequiredGuestFields(
    user: ReturnType<typeof userEvent.setup>,
    email: string,
  ) {
    // Skip the address fields so this test isolates sender-email validation.
    await user.click(await screen.findByTestId("check-no-address"));
    await user.type(screen.getByTestId("input-recipient-name"), "John");
    await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
    await user.type(screen.getByTestId("input-sender-first-name"), "Jane");
    if (email) {
      await user.type(screen.getByTestId("input-sender-email"), email);
    }
    await user.type(screen.getByTestId("input-sender-phone"), "+12125551111");
  }

  it.each([
    ["an empty email", ""],
    ["an email without a TLD", "user@domain"],
  ])("shows an inline error and stays on step 1 for %s", async (_label, email) => {
    const user = userEvent.setup();
    renderWithProviders(<Checkout />, {
      locale: {
        t: (key) => key === "checkout.error.senderEmail" ? EMAIL_ERROR : key,
      },
      auth: {
        user: null,
        token: null,
        isLoading: false,
      },
      cart: {
        items: [FAKE_ITEM],
        subtotal: 50,
        itemCount: 1,
        isHydrated: true,
      },
    });

    await fillRequiredGuestFields(user, email);
    await user.click(screen.getByTestId("button-continue-to-payment"));

    expect(screen.getByTestId("error-sender-email").textContent).toBe(EMAIL_ERROR);
    expect(screen.queryByTestId("button-submit-payment")).toBeNull();
  });

  it("advances to payment for a well-formed email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Checkout />, {
      locale: {
        t: (key) => key === "checkout.error.senderEmail" ? EMAIL_ERROR : key,
      },
      auth: {
        user: null,
        token: null,
        isLoading: false,
      },
      cart: {
        items: [FAKE_ITEM],
        subtotal: 50,
        itemCount: 1,
        isHydrated: true,
      },
    });

    await fillRequiredGuestFields(user, "user@example.com");

    await user.click(screen.getByTestId("button-continue-to-payment"));

    expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
    expect(screen.queryByTestId("error-sender-email")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wallet (Apple Pay / Google Pay) native-sheet flow tests
//
// These cover the walletViaNativeSheet=true branch of handleSubmit — the path
// the inline card suite above never reaches.  A regression here would silently
// strand a mobile shopper after they tap the Apple Pay / Google Pay button:
//
//   1. Happy path: pr.paymentmethod fires → PaymentIntent created →
//      confirmCardPayment succeeds → ev.complete("success") → redirect.
//   2. Cancel: pr.cancel fires → no PI, no redirect, no error toast.
//   3. PI failure: server returns ok:false → ev.complete("fail"), no card
//      confirmation, no redirect.
//   4. pr.show() throws → wallet state is reset and the selected method falls
//      back to card so the shopper can retry.
//
// The wallet path only runs on mobile viewports (mockUseIsMobile=true).
// canMakePayment returns a truthy non-null result so the wallet pre-creation
// effect sets paymentRequestRef.current = submitPr, enabling walletViaNativeSheet=true
// and pr.show() in handleSubmit.
// ---------------------------------------------------------------------------

describe("Checkout — wallet (Apple Pay / Google Pay) native sheet flow", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    // Wallet sheets only ever appear on mobile viewports.
    mockUseIsMobile.mockReturnValue(true);
    // Reset the controllable PaymentRequest mock to its default healthy state.
    // vi.clearAllMocks() clears call history but not implementations, so we
    // re-assert canMakePayment and a non-throwing show() here, and clear
    // any handlers captured by a previous test.
    // Return a truthy non-null result so the wallet pre-creation effect sets
    // paymentRequestRef.current = submitPr (required for walletViaNativeSheet=true
    // and pr.show() to be called in handleSubmit).
    mockCanMakePayment.mockResolvedValue({ applePay: false });
    mockPrShow.mockImplementation(() => {});
    for (const key of Object.keys(mockPrEventHandlers)) {
      delete mockPrEventHandlers[key];
    }
    user = userEvent.setup();
  });

  afterEach(() => {
    // Restore desktop default so other describe blocks are unaffected.
    mockUseIsMobile.mockReturnValue(false);
  });

  /**
   * Reach Step 2 with Apple Pay selected and Stripe ready.
   *
   * Clicking the Apple Pay tile calls triggerStripeLoad(), mounting the mocked
   * StripeCheckoutSection which fires onStripeReady (stripe ≠ null).  The wallet
   * probe runs only after stripe is set, so waiting for a canMakePayment call
   * proves stripe is ready before we submit.
   */
  async function gotoWalletStep2() {
    const noAddressSwitch = await screen.findByTestId("check-no-address");
    await user.click(noAddressSwitch);
    await user.type(screen.getByTestId("input-recipient-name"), "John");
    await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
    // In jsdom (non-Apple platform) apple_pay is platform-hidden; use google_pay.
    await user.click(await screen.findByTestId("option-payment-google_pay"));
    await waitFor(() => expect(mockCanMakePayment).toHaveBeenCalled());
  }

  // ── 1. Wallet happy path ───────────────────────────────────────────────

  it("happy path: pr.paymentmethod fires → PI created → confirmCardPayment succeeds → redirect", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_wallet_ok", status: "succeeded" },
    });

    renderCheckout();
    await gotoWalletStep2();

    // The wallet sheet only opens once the PaymentIntent has been pre-created
    // for the current cart, so wait for the debounced pre-creation to run.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("button-submit-payment"));

    // The native sheet was opened and the paymentmethod handler registered.
    await waitFor(() => {
      expect(mockPrShow).toHaveBeenCalled();
      expect(typeof mockPrEventHandlers.paymentmethod).toBe("function");
    });

    // Simulate the shopper authorising the wallet: Stripe fires paymentmethod
    // with a generated PaymentMethod id.
    const ev = { paymentMethod: { id: "pm_wallet_123" }, complete: vi.fn() };
    await act(async () => {
      await mockPrEventHandlers.paymentmethod(ev);
    });

    // The pre-created PaymentIntent is reused (no second creation) and confirmed
    // with the wallet's PaymentMethod id (no 3DS for a succeeded intent).
    expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1);
    expect(mockConfirmCardPayment).toHaveBeenCalledWith(
      PAYMENT_INTENT_RES.clientSecret,
      { payment_method: "pm_wallet_123" },
      { handleActions: false },
    );
    // The sheet is dismissed as a success and the shopper is redirected.
    expect(ev.complete).toHaveBeenCalledWith("success");
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/order-confirmed"),
      );
    });
  });

  // ── 1b. Pre-created PaymentIntent: sheet shows server amount, intent reused ─

  it("pre-creates the PaymentIntent, builds the sheet with the server amount, and reuses the intent on tap", async () => {
    // The server amount agrees with the client-computed total (the submit-time
    // parity guard requires this — a divergent amount refuses to open the
    // sheet; see the next test). The clientSecret is unique so we can prove
    // the PRE-CREATED intent is the one confirmed, not a second creation.
    const SERVER_PI = {
      ok: true,
      clientSecret: "pi_prefetched_secret",
      orderId: "web-order-prefetched",
      amount: 5000,
      currency: "USD",
    };
    mockCreatePaymentIntentMutate.mockResolvedValue(SERVER_PI);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_wallet_ok", status: "succeeded" },
    });

    renderCheckout();
    await gotoWalletStep2();

    // Selecting the wallet method triggers the debounced pre-creation effect,
    // which creates the PaymentIntent ahead of the tap.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("button-submit-payment"));

    // The PaymentRequest used for the native sheet was built with the server's
    // exact amount and currency.
    await waitFor(() => expect(mockPrShow).toHaveBeenCalled());
    expect(mockPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "usd",
        total: expect.objectContaining({ amount: 5000 }),
      }),
    );

    const ev = { paymentMethod: { id: "pm_wallet_123" }, complete: vi.fn() };
    await act(async () => {
      await mockPrEventHandlers.paymentmethod(ev);
    });

    // The pre-created intent is reused: confirmCardPayment uses its clientSecret
    // and NO second PaymentIntent is created in the handler.
    expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1);
    expect(mockConfirmCardPayment).toHaveBeenCalledWith(
      "pi_prefetched_secret",
      { payment_method: "pm_wallet_123" },
      { handleActions: false },
    );
    expect(ev.complete).toHaveBeenCalledWith("success");
  });

  it("refuses to open the sheet when the pre-created PI amount diverges from the client total (FX drift)", async () => {
    // Server returns an amount that differs from the client-computed total
    // (e.g. FX rates drifted since PI creation). The submit-time parity guard
    // must NOT open the sheet with a divergent amount: it clears the cached
    // intent, shows the "prices updated" toast, and returns.
    const SERVER_PI = {
      ok: true,
      clientSecret: "pi_prefetched_secret",
      orderId: "web-order-prefetched",
      amount: 5137,
      currency: "USD",
    };
    mockCreatePaymentIntentMutate.mockResolvedValue(SERVER_PI);

    renderCheckout();
    await gotoWalletStep2();

    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("button-submit-payment"));

    // The sheet never opens and the shopper is told prices were refreshed.
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "checkout.toast.pricesUpdatedTitle" }),
      );
    });
    expect(mockPrShow).not.toHaveBeenCalled();
    // No charge was attempted with the stale intent.
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
  });

  // ── 2. Wallet cancelled ────────────────────────────────────────────────

  it("cancel: pr.cancel fires → no charge, no redirect, no error toast", async () => {
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    renderCheckout();
    await gotoWalletStep2();

    // The PaymentIntent is pre-created so the sheet shows the exact total.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(mockPrShow).toHaveBeenCalled();
      expect(typeof mockPrEventHandlers.cancel).toBe("function");
    });

    // The shopper dismissed the native sheet without paying.
    await act(async () => {
      await mockPrEventHandlers.cancel();
    });

    // A cancel is not a failure: no card confirmation, no order, no redirect,
    // and no error toast. The pre-created intent is left orphaned (safe — it is
    // paymentRef-keyed and expires server-side) and no SECOND intent is created.
    expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1);
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockTrackFunnelEvent.mock.calls.some(([name]) => name === "payment_failed")).toBe(false);
  });

  // ── 3. Wallet PaymentIntent creation fails server-side ─────────────────

  it("PI pre-creation fails: wallet stays disabled and the sheet never opens with an estimate", async () => {
    // The server could not pre-create a PaymentIntent (e.g. Stripe
    // misconfigured). Because the sheet must NEVER open with a client estimate,
    // the wallet button stays disabled and the native sheet is never shown.
    mockCreatePaymentIntentMutate.mockResolvedValue({
      ok: false,
      message: "Stripe is not configured.",
    });

    renderCheckout();
    await gotoWalletStep2();

    // The debounced pre-creation runs and fails (server ok:false).
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    // The wallet submit button is disabled while the (failed) intent prep keeps
    // it in the "preparing" state, so it cannot open the sheet.
    const submitBtn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Even if a click is dispatched, the native sheet is never opened and no
    // card confirmation or redirect happens — exactness is preserved over
    // falling back to an estimated total.
    await user.click(submitBtn);
    expect(mockPrShow).not.toHaveBeenCalled();
    expect(mockConfirmCardPayment).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  // ── 4. pr.show() throws → fall back to card ────────────────────────────

  it("pr.show() throws → resets wallet state and falls back to the card path", async () => {
    // The device refused to open the native sheet (e.g. another sheet already
    // showing).  handleSubmit must reset wallet state, switch the selected
    // method to card, record a fallback analytics event, and RETURN so the
    // shopper can re-submit via the card fields.
    mockPrShow.mockImplementation(() => {
      throw new Error("cannot show payment sheet");
    });
    // Guard against the historical bug this fix closes: if execution fell
    // through after the failed sheet it would reach finalizeOrderNow() and call
    // createOrder, placing an UNPAID order. We resolve createOrder so that, if
    // it were ever (incorrectly) reached, the test would catch a real redirect
    // rather than silently swallowing the bug behind a rejected promise.
    mockCreateOrderMutate.mockResolvedValue({ ok: true, orderId: "should-not-happen" });
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    renderCheckout();
    await gotoWalletStep2();

    // The PaymentIntent is pre-created so the button becomes ready and the sheet
    // can be opened with the exact total.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("button-submit-payment"));

    // The sheet was attempted but threw.
    await waitFor(() => expect(mockPrShow).toHaveBeenCalled());

    // The selected method fell back to card, so the inline card fields appear.
    await waitFor(() => {
      expect(screen.getByTestId("stripe-card-fields")).toBeTruthy();
    });

    // A fallback analytics event was recorded.
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payment_wallet_fallback",
        errorCode: "show_failed",
      }),
    );

    // Critical: handleSubmit must NOT fall through to the default order path.
    // Only the pre-creation intent exists (called once); no order is finalised
    // and there is no redirect to the confirmation page. The shopper is simply
    // shown the card fields to complete payment.
    expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateOrderMutate).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});
