// @vitest-environment jsdom
//
// Auto-retry tests for the canMakePayment() null-probe path in Checkout.tsx.
//
// When Stripe's canMakePayment() returns null (common transiently on mobile
// before the Google Pay / Apple Pay service has fully initialised), the wallet
// PI pre-creation effect must automatically retry up to 3 times with a ~1 s
// delay between attempts before giving up. This file tests:
//
//   1. canMakePayment() null on first attempt, truthy on first retry →
//      paymentRequestRef is populated, no error toast is shown, and the
//      submit button opens the native wallet sheet normally.
//   2. canMakePayment() null on all attempts (initial + 3 retries) →
//      paymentRequestRef remains null, and tapping submit shows the
//      "wallet unavailable" toast exactly once.
//   3. The walletRetryNonce manual-retry path continues to work: after
//      all auto-retries are exhausted, bumping the nonce clears state and
//      re-arms the effect so a fresh round of auto-retries can run.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

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
const mockCreateOrderMutateAsync = vi.fn();
const mockCreateOrderMutateSync = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateCheckoutPaymentIntent: () => ({
    mutateAsync: mockCreatePaymentIntentMutate,
    reset: vi.fn(),
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
  apiFetch: vi.fn().mockResolvedValue({ ok: true, orderId: "LB-WALLET-1", addresses: [] }),
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
  clientSecret: "pi_test_abc_secret_xyz",
  orderId: "web-order-wallet-retry",
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
  await user.type(screen.getByTestId("input-recipient-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
  await user.click(screen.getByTestId("button-continue-to-payment"));

  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();

  await user.click(await screen.findByTestId("option-payment-google_pay"));
  await waitFor(() => expect(mockCanMakePayment).toHaveBeenCalled());

  await waitFor(
    () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
    { timeout: 3000 },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout wallet canMakePayment() auto-retry", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUseIsMobile.mockReturnValue(true);
    mockPrShow.mockImplementation(() => {});
    for (const key of Object.keys(mockPrEventHandlers)) {
      delete mockPrEventHandlers[key];
    }
    mockUseSearch.mockReturnValue("");
    user = userEvent.setup();
  });

  afterEach(() => {
    sessionStorage.clear();
    mockUseIsMobile.mockReturnValue(false);
  });

  // ── 1. Retry succeeds on first retry ─────────────────────────────────────
  //
  // canMakePayment() order of calls:
  //   call 1 — probe effect (runs on mount, result is discarded)
  //   call 2 — first pre-creation attempt → null → schedule retry
  //   call 3 — retry 1 → truthy → paymentRequestRef is populated
  //
  // Expected: submit button becomes enabled, pr.show() is called on submit,
  //           no "wallet unavailable" toast.

  it("retries canMakePayment() once and succeeds — submit button works without an error toast", async () => {
    mockCanMakePayment
      .mockResolvedValueOnce(null)            // probe (discarded)
      .mockResolvedValueOnce(null)            // first pre-creation attempt → null
      .mockResolvedValue({ applePay: false }); // retry 1 → truthy

    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    await driveToWalletPaymentStep(user);

    // Wait for canMakePayment to be called at least 3 times (probe + 2 pre-creation calls).
    await waitFor(
      () => expect(mockCanMakePayment.mock.calls.length).toBeGreaterThanOrEqual(3),
      { timeout: 5000 },
    );

    // The submit button must become enabled once the retry resolves.
    await waitFor(
      () => {
        const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 5000 },
    );

    // No wallet-unavailable toast must have fired.
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "checkout.toast.walletUnavailable" }),
    );

    // Tapping submit should call pr.show() (the wallet sheet opens normally).
    await user.click(screen.getByTestId("button-submit-payment"));
    await waitFor(() => expect(mockPrShow).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "checkout.toast.walletUnavailable" }),
    );
  }, 12000);

  // ── 2. All retries exhausted → wallet-unavailable toast on submit ─────────
  //
  // canMakePayment() order of calls:
  //   call 1 — probe (result discarded)
  //   calls 2-5 — initial attempt + 3 retries → all null
  //
  // Expected: after exhaustion, paymentRequestRef stays null. The submit
  //           button becomes enabled. Tapping it fires the walletUnavailable
  //           toast exactly once and switches the selection to card.

  it("shows walletUnavailable toast exactly once when all 3 retries return null", async () => {
    mockCanMakePayment.mockResolvedValue(null); // all calls return null

    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);

    await driveToWalletPaymentStep(user);

    // Wait for all 4 pre-creation calls (initial + 3 retries) plus the probe.
    await waitFor(
      () => expect(mockCanMakePayment.mock.calls.length).toBeGreaterThanOrEqual(5),
      { timeout: 6000 },
    );

    // Submit button must become enabled after retries are exhausted
    // (walletReadySig is set even when paymentRequestRef stays null).
    await waitFor(
      () => {
        const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 6000 },
    );

    // Tapping submit triggers the walletUnavailable error path.
    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "checkout.toast.walletUnavailable",
          variant: "destructive",
        }),
      );
    });

    // The toast should fire exactly once (not once per retry).
    expect(
      mockToast.mock.calls.filter(
        ([arg]: [{ title?: string }]) => arg?.title === "checkout.toast.walletUnavailable",
      ).length,
    ).toBe(1);

    // pr.show() must NOT have been called.
    expect(mockPrShow).not.toHaveBeenCalled();
  }, 15000);

  // ── 3. walletRetryNonce manual-retry + auto-retry together ──────────────────
  //
  // After a PI-creation failure (walletPrepareFailed=true), the shopper re-taps
  // the wallet tile. This bumps walletRetryNonce, re-arms the PI effect, and the
  // second PI creation succeeds. canMakePayment() returns null on the first
  // attempt but truthy on the first auto-retry (~1 s later). The submit button
  // should become enabled and pr.show() should be called without an error toast.
  //
  // This verifies that the walletRetryNonce path continues to work even when the
  // auto-retry logic is active underneath it.

  it("manual retry (walletRetryNonce) + auto-retry: button works after PI failure then canMakePayment retry", async () => {
    // First PI creation throws; second succeeds.
    mockCreatePaymentIntentMutate
      .mockRejectedValueOnce(new Error("transient network error"))
      .mockResolvedValue(PAYMENT_INTENT_RES);

    // canMakePayment sequence:
    //   call 1 — probe (result ignored)
    //   call 2 — first pre-creation attempt after re-tap → null → retry
    //   call 3 — auto-retry 1 → truthy → paymentRequestRef populated
    mockCanMakePayment
      .mockResolvedValueOnce(null)            // probe
      .mockResolvedValueOnce(null)            // first pre-creation attempt → null
      .mockResolvedValue({ applePay: false }); // retry → truthy

    await driveToWalletPaymentStep(user);

    // First PI creation threw — toast must fire.
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));

    // Re-tap the tile while walletPrepareFailed=true to bump walletRetryNonce.
    await user.click(screen.getByTestId("option-payment-google_pay"));

    // Second PI creation fires.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    );

    // Auto-retry should call canMakePayment at least 3 times (probe + 2 from effect).
    await waitFor(
      () => expect(mockCanMakePayment.mock.calls.length).toBeGreaterThanOrEqual(3),
      { timeout: 5000 },
    );

    // Submit button becomes enabled after the retry resolves.
    await waitFor(
      () => {
        const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 5000 },
    );

    // Only the original PI failure toast — no walletUnavailable toast.
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "checkout.toast.walletUnavailable" }),
    );

    // Tapping submit calls pr.show() normally.
    await user.click(screen.getByTestId("button-submit-payment"));
    await waitFor(() => expect(mockPrShow).toHaveBeenCalledTimes(1), { timeout: 3000 });
  }, 12000);
});
