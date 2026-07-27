// @vitest-environment jsdom
//
// Timeout guard tests for the Apple Pay / Google Pay wallet pre-creation flow.
//
// The wallet PI pre-creation effect in Checkout.tsx wraps two operations with
// deadline guards to prevent the UI from hanging indefinitely on Chrome iOS:
//
//   1. tryCanMakePayment() uses withTimeoutAsNull(pr.canMakePayment(), 5_000):
//      a never-settling canMakePayment() promise resolves as null after 5 s,
//      feeding the same retry path as a real null result.
//
//   2. The PaymentIntent fetch uses withTimeout(createPaymentIntent.mutateAsync(…), 15_000):
//      a never-settling mutation rejects with Error("timeout") after 15 s,
//      falling into the catch block.
//
// These tests verify:
//   a. The component passes the CORRECT deadline to each helper (5_000 for
//      canMakePayment, 15_000 for PI creation) by asserting on the mocked
//      helpers' call arguments.
//   b. When withTimeoutAsNull resolves null (deadline fired) the component
//      follows the normal null-retry path — the submit button eventually becomes
//      enabled without firing a failure toast.
//   c. When withTimeout rejects (deadline fired) the catch block runs —
//      walletPrepareFailed is set, the destructive toast fires, and the spinner
//      clears so the submit button is no longer disabled.
//
// The withTimeout / withTimeoutAsNull helpers are mocked at the module level.
// Their deadline mechanics are exercised independently in withTimeout.test.ts,
// so no fake timers are needed here — tests run at real speed.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// withTimeout / withTimeoutAsNull module mock — must be declared before the
// Checkout import so the module is intercepted when Checkout.tsx is resolved.
// ---------------------------------------------------------------------------

const mockWithTimeout = vi.fn();
const mockWithTimeoutAsNull = vi.fn();

vi.mock("@/lib/withTimeout", () => ({
  withTimeout: (promise: Promise<unknown>, ms: number) =>
    mockWithTimeout(promise, ms),
  withTimeoutAsNull: (promise: Promise<unknown> | null, ms: number) =>
    mockWithTimeoutAsNull(promise, ms),
}));

// ---------------------------------------------------------------------------
// Stripe JS mocks — hoisted so Checkout.tsx module-level loadStripe() and
// Elements/useStripe hooks are intercepted. Mirrors walletPiFail.test.tsx.
// ---------------------------------------------------------------------------

const mockConfirmCardPayment = vi.fn();
const mockHandleNextAction = vi.fn();

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

const mockUseIsMobile = vi.fn().mockReturnValue(true);
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

const mockIsApplePayBrowser = vi.fn().mockReturnValue(false);
vi.mock("./checkoutPayMethods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./checkoutPayMethods")>();
  return {
    ...actual,
    isApplePayBrowser: () => mockIsApplePayBrowser(),
  };
});

const mockCardElement = {};

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
const mockCreatePaymentIntentReset = vi.fn();
const mockCreateOrderMutateAsync = vi.fn();
const mockCreateOrderMutateSync = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateCheckoutPaymentIntent: () => ({
    mutateAsync: mockCreatePaymentIntentMutate,
    reset: mockCreatePaymentIntentReset,
    isPending: false,
  }),
}));

vi.mock("@/lib/queries", () => ({
  useCreateOrder: () => ({
    mutateAsync: mockCreateOrderMutateAsync,
    mutate: mockCreateOrderMutateSync,
    isPending: false,
  }),
  useStripeCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMamoPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePaypalPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTabbyPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCybersourceCaptureContext: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCybersourceCharge: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCybersourceApplePaySession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCybersourceWalletCharge: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // available: false → csAvailable is false → card tile shown → StripeCheckoutSection
  // renders → onStripeReady sets stripe → probe fires → canMakePayment called.
  // available: undefined would be interpreted as "optimistically true" and hide the
  // card tile for LB+USD, preventing StripeCheckoutSection from ever mounting.
  useCybersourceAvailable: () => ({ data: { available: false }, isLoading: false }),
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
const mockUseSearch = vi.fn().mockReturnValue("");
vi.mock("wouter", () => ({
  useLocation: () => ["/checkout", mockSetLocation],
  useSearch: () => mockUseSearch(),
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

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackWebEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/lib/fbPixel", () => ({
  trackFbEvent: vi.fn(),
  trackFbPageView: vi.fn(),
  initPixel: vi.fn(),
}));

vi.mock("react-phone-number-input", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-phone-number-input")>();
  return {
    ...original,
    isValidPhoneNumber: () => true,
  };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, orderId: "LB-TIMEOUT-1", addresses: [] }),
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
// Component stubs — mirrors walletPiFail.test.tsx
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Checkout from "./Checkout";
import type { ShimUser } from "@/contexts/AuthContext";
import type { CartItem } from "@/contexts/CartContext";

// ---------------------------------------------------------------------------
// Fixtures
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

const PAYMENT_INTENT_RES = {
  ok: true,
  clientSecret: "pi_test_secret_timeout",
  orderId: "web-order-timeout",
  amount: 5000,
  currency: "USD",
};

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

// ---------------------------------------------------------------------------
// Helper: drive to payment step with Google Pay selected and wait for the
// wallet PI pre-creation effect to run (debounced 400 ms). Returns after
// createPaymentIntentMutate has been called once.
// ---------------------------------------------------------------------------

async function driveToWalletPaymentStep(user: ReturnType<typeof userEvent.setup>) {
  renderCheckout();

  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);
  await user.type(screen.getByTestId("input-recipient-first-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
  await user.click(screen.getByTestId("button-continue-to-payment"));

  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();

  // google_pay is visible in jsdom (non-Apple platform, apple_pay is hidden).
  await user.click(await screen.findByTestId("option-payment-google_pay"));

  // The probe canMakePayment() fires on wallet init (withTimeout-wrapped,
  // now mocked at module level).
  await waitFor(() => expect(mockCanMakePayment).toHaveBeenCalled());

  // Wait for the debounced PI pre-creation to fire.
  await waitFor(
    () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
    { timeout: 3000 },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout wallet timeout guards", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUseIsMobile.mockReturnValue(true);
    mockIsApplePayBrowser.mockReturnValue(false);
    mockCanMakePayment.mockResolvedValue(null);
    mockPrShow.mockImplementation(() => {});
    for (const key of Object.keys(mockPrEventHandlers)) {
      delete mockPrEventHandlers[key];
    }
    mockUseSearch.mockReturnValue("");

    // Default withTimeout behaviour: pass the promise through (no artificial
    // timeout). Individual tests override this for the path under test.
    // The probe call uses ms=5_000; the PI creation call uses ms=15_000.
    mockWithTimeout.mockImplementation(
      (promise: Promise<unknown>, _ms: number) => promise,
    );
    // Default withTimeoutAsNull behaviour: pass the promise through.
    mockWithTimeoutAsNull.mockImplementation(
      (promise: Promise<unknown | null>, _ms: number) => promise,
    );

    user = userEvent.setup();
  });

  afterEach(() => {
    sessionStorage.clear();
    mockUseIsMobile.mockReturnValue(false);
  });

  // ── Test 1: canMakePayment() timed out (withTimeoutAsNull resolves null)
  //
  // When withTimeoutAsNull wraps a never-settling canMakePayment(), the 5 s
  // deadline resolves it as null. The component must pass 5_000 ms to
  // withTimeoutAsNull and handle the null result via the normal retry path:
  // retry up to 3 times, then set walletReadySig so the button is enabled.
  //
  // We simulate the deadline firing by making withTimeoutAsNull resolve null
  // immediately. The retry path (1 s delays + up to 3 attempts) is tested in
  // full in Checkout.wallet.test.tsx; here we verify the correct deadline is
  // passed and that walletPrepareFailed is NOT set (timeout → null ≠ hard fail).

  it("canMakePayment() timeout: withTimeoutAsNull is called with the 5 s deadline and the button eventually becomes enabled without a failure toast", async () => {
    // Simulate: withTimeoutAsNull fires the 5 s deadline → resolves null.
    // All calls (probe + pre-creation attempts) resolve null immediately.
    mockWithTimeoutAsNull.mockResolvedValue(null);

    // PI creation resolves successfully so the retry loop can run.
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    // canMakePayment() itself returns a never-settling promise (the timeout
    // guard is what converts it to null in production; in this test the mock
    // does that directly).
    mockCanMakePayment.mockImplementation(() => new Promise<null>(() => {}));

    await driveToWalletPaymentStep(user);

    // Verify the correct 5 s deadline was passed to withTimeoutAsNull.
    // (The probe uses withTimeout with 5_000 ms; tryCanMakePayment uses
    // withTimeoutAsNull with 5_000 ms.)
    const calls = mockWithTimeoutAsNull.mock.calls;
    const canMakePaymentCalls = calls.filter(([, ms]) => ms === 5_000);
    expect(canMakePaymentCalls.length).toBeGreaterThanOrEqual(1);

    // After all auto-retries exhaust (canMakePayment always null), the
    // component sets walletReadySig so the button stops being disabled.
    // Use a generous timeout to accommodate the 1 s retry delays (real timers).
    await waitFor(
      () => {
        const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 6000 },
    );

    // A null from a timeout is NOT a hard failure — walletPrepareFailed stays
    // false and no walletPrepareFailTitle toast fires.
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "checkout.toast.walletPrepareFailTitle" }),
    );
  }, 15_000);

  // ── Test 2: PaymentIntent creation timed out (withTimeout rejects)
  //
  // When withTimeout wraps createPaymentIntent.mutateAsync, the 15 s deadline
  // causes a rejection which falls into the catch block. The component must:
  //   1. Pass 15_000 ms to withTimeout (verified via mock call args).
  //   2. Fire the destructive walletPrepareFailTitle toast.
  //   3. Call createPaymentIntent.reset() so isPending clears.
  //   4. Enable the submit button again (walletPrepareFailed stops the spinner).
  //
  // We simulate the deadline firing by making withTimeout reject with
  // Error("timeout") immediately, bypassing the need for real or fake 15 s.

  it("createPaymentIntent() timeout: withTimeout is called with the 15 s deadline and the catch block fires the error toast", async () => {
    // Default pass-through for the probe (ms=5_000); reject for PI (ms=15_000).
    mockWithTimeout.mockImplementation(
      (promise: Promise<unknown>, ms: number) => {
        if (ms === 15_000) return Promise.reject(new Error("timeout"));
        return promise; // probe: pass through
      },
    );

    // The underlying mutation never needs to settle — withTimeout intercepts it.
    mockCreatePaymentIntentMutate.mockImplementation(
      () => new Promise<never>(() => {}),
    );

    // canMakePayment resolves null immediately so the probe completes without
    // blocking the payment step transition.
    mockCanMakePayment.mockResolvedValue(null);

    await driveToWalletPaymentStep(user);

    // The catch block must have fired: toast with the failure title.
    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "checkout.toast.walletPrepareFailTitle",
            variant: "destructive",
          }),
        );
      },
      { timeout: 3000 },
    );

    // Verify the 15 s deadline was passed to withTimeout.
    const piTimeoutCalls = mockWithTimeout.mock.calls.filter(
      ([, ms]) => ms === 15_000,
    );
    expect(piTimeoutCalls.length).toBeGreaterThanOrEqual(1);

    // reset() must be called so isPending clears and isProcessing can drop.
    expect(mockCreatePaymentIntentReset).toHaveBeenCalledTimes(1);

    // Submit button must become enabled — the shopper shouldn't be stuck.
    await waitFor(
      () => {
        const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
  });
});
