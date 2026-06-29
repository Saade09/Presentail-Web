// @vitest-environment jsdom
//
// Wallet PaymentIntent pre-creation failure tests for Apple Pay / Google Pay.
//
// The wallet PI effect in Checkout.tsx pre-creates a Stripe PaymentIntent
// (debounced 400 ms) so the native sheet always shows the server's exact total.
// When `createPaymentIntent.mutateAsync` throws, the component must:
//   1. Fire a destructive toast with the correct title/description.
//   2. Set walletPrepareFailed=true so walletPreparing becomes false — i.e. the
//      submit button stops spinning/disabled and the shopper isn't stuck.
//   3. Re-arm automatically when the shopper makes any input change (here: taps
//      the wallet tile again, which bumps walletRetryNonce via the same onClick
//      guard that already fires when walletPrepareFailed=true).

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks — hoisted so Checkout.tsx module-level loadStripe() and
// Elements/useStripe hooks are intercepted. Mirrors walletStale.test.tsx.
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_ITEM = {
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

// ---------------------------------------------------------------------------
// Helper: drive to the payment step with Apple Pay selected and wait for the
// wallet PI effect to fire (debounced 400 ms). Returns after the first
// mutateAsync call attempt has settled (resolved or rejected).
// ---------------------------------------------------------------------------

async function driveToWalletPaymentStep(user: ReturnType<typeof userEvent.setup>) {
  renderCheckout();

  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);
  await user.type(screen.getByTestId("input-recipient-first-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
  await user.click(screen.getByTestId("button-continue-to-payment"));

  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();

  // In jsdom (non-Apple platform) isApplePlatform() returns false, so
  // apple_pay is platform-hidden and google_pay is the visible wallet tile.
  await user.click(await screen.findByTestId("option-payment-google_pay"));
  await waitFor(() => expect(mockCanMakePayment).toHaveBeenCalled());

  // Wait for the debounced PI pre-creation to run.
  await waitFor(
    () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
    { timeout: 3000 },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout wallet PaymentIntent pre-creation failure", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUseIsMobile.mockReturnValue(true);
    mockCanMakePayment.mockResolvedValue(null);
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

  // ── 1. Toast is fired with the correct title/description ─────────────────

  it("fires a destructive toast with the correct title and description when PI creation throws", async () => {
    mockCreatePaymentIntentMutate.mockRejectedValue(new Error("network error"));

    await driveToWalletPaymentStep(user);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "checkout.toast.walletPrepareFailTitle",
          description: "checkout.toast.walletPrepareFailDesc",
          variant: "destructive",
        }),
      );
    });
  });

  // ── 2. walletPreparing becomes false — button is no longer disabled ───────

  it("clears the preparing spinner so the submit button is no longer disabled after a PI failure", async () => {
    mockCreatePaymentIntentMutate.mockRejectedValue(new Error("network error"));

    await driveToWalletPaymentStep(user);

    // After the throw, walletPrepareFailed=true → walletPreparing=false.
    // The button's `disabled` prop (isProcessing||walletPreparing) must also
    // be false — noAddress is true so the district guard doesn't block it.
    await waitFor(() => {
      const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  // ── 3. Re-tapping the wallet tile clears the error and re-arms the effect ─

  it("re-arms the PI preparation effect when the shopper taps the wallet tile again after a failure", async () => {
    // First attempt throws; second attempt resolves successfully.
    mockCreatePaymentIntentMutate
      .mockRejectedValueOnce(new Error("transient network error"))
      .mockResolvedValue({
        ok: true,
        clientSecret: "pi_test_abc_secret_xyz",
        orderId: "web-order-retry",
        amount: 5000,
        currency: "USD",
      });

    await driveToWalletPaymentStep(user);

    // Confirm the first failure settled.
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));

    // Tapping the same google_pay tile while walletPrepareFailed=true bumps
    // walletRetryNonce, which is a dep of the PI effect, causing it to re-run.
    // The effect clears walletPrepareFailed and fires mutateAsync again.
    // (In jsdom, isApplePlatform() is false so google_pay is the visible tile.)
    await user.click(screen.getByTestId("option-payment-google_pay"));

    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    );

    // The second attempt succeeded — button should now be enabled (not
    // preparing), and no additional toast should have been fired.
    await waitFor(() => {
      const btn = screen.getByTestId("button-submit-payment") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  // ── 4. Editing a form field (email) also clears the error and re-arms ────

  it("re-arms the PI preparation effect when the shopper changes a form field after a failure", async () => {
    // First attempt throws; second attempt resolves successfully.
    mockCreatePaymentIntentMutate
      .mockRejectedValueOnce(new Error("transient network error"))
      .mockResolvedValue({
        ok: true,
        clientSecret: "pi_test_abc_secret_xyz",
        orderId: "web-order-input-retry",
        amount: 5000,
        currency: "USD",
      });

    await driveToWalletPaymentStep(user);

    // Wait for the first failure to settle.
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));

    // Go back to step 1, then toggle the "no address" switch. The noAddress
    // boolean is a dep of the wallet PI effect — flipping it produces a
    // different signature, which causes the effect to clear walletPrepareFailed
    // and start a fresh pre-creation attempt. This simulates the general
    // "any input change re-arms the preparation" behaviour. (The sender email
    // field is not editable for signed-in users, so the address toggle is the
    // most accessible dep that's visible on step 1.)
    await user.click(screen.getByTestId("button-back-to-sender"));
    await user.click(screen.getByTestId("check-no-address"));

    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    );

    // No extra toast should have been fired (second attempt resolved).
    expect(mockToast).toHaveBeenCalledTimes(1);
  });
});
