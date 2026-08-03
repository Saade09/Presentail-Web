// @vitest-environment jsdom
//
// Stale-wallet integration test for the Apple Pay / Google Pay native-sheet
// finalize path.
//
// Task #2443 proved a stale *hosted redirect* payment (Mamo / PayPal / Stripe)
// can't silently create an abandoned order on the OrderConfirmed page. The web
// wallet (Apple Pay / Google Pay) native-sheet branch in Checkout.tsx finalizes
// down a different code path: on a successful in-sheet payment it does NOT call
// createOrder directly — it stashes the order payload (with a `createdAt`
// timestamp) to sessionStorage and redirects to /order-confirmed, which creates
// the WooCommerce order behind the same stash-expiry guard.
//
// These tests drive the REAL wallet finalize path end-to-end (Checkout wallet
// sheet → stash → OrderConfirmed) using the actual stash the wallet path writes,
// rather than a hand-rolled payload, so they prove that:
//
//   1. Stale wallet return: a shopper who authorised the wallet sheet but only
//      lands on /order-confirmed hours later (backgrounded tab) does NOT get the
//      expired payload replayed into createOrder — they see the failure state.
//   2. Fresh wallet return: the same stash, still inside the expiry window, IS
//      finalized into a WooCommerce order normally.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks — must be hoisted so Checkout.tsx's module-level
// `loadStripe(...)` call and `Elements`/`useStripe` hooks are intercepted.
// (Mirrors Checkout.cardFlow.test.tsx.)
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
//
// useCreateOrder must expose BOTH `mutateAsync` (Checkout's non-wallet path,
// unused here) and `mutate` (OrderConfirmed's finalize path). The wallet
// success branch in Checkout never calls createOrder — it stashes and
// redirects — so mockCreateOrderMutateSync is the assertion surface for
// "did the order get created server-side?".
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

// wouter is shared by both Checkout (useLocation) and OrderConfirmed
// (useSearch + useLocation + Link). mockUseSearch is controllable so the
// OrderConfirmed render can simulate the post-redirect URL.
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

// OrderConfirmed fires Facebook pixel events; stub them out.
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
// Import the components AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Checkout from "./Checkout";
import type { ShimUser } from "@/contexts/AuthContext";
import type { CartItem } from "@/contexts/CartContext";
import OrderConfirmed from "./OrderConfirmed";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PENDING_ORDER_KEY = "presentail_pending_order_v1";
// Must match PENDING_ORDER_MAX_AGE_MS in OrderConfirmed.tsx.
const PENDING_ORDER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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
  orderId: "web-order-test",
  amount: 5000,
  currency: "USD",
};

const mockClearCart = vi.fn();

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
// Drive the wallet native sheet all the way to a successful in-sheet payment.
// Returns the unmount handle for the Checkout render so the caller can tear it
// down before rendering OrderConfirmed. After this resolves the REAL pending
// stash the wallet path writes is present in sessionStorage.
// ---------------------------------------------------------------------------

async function driveWalletSuccess(user: ReturnType<typeof userEvent.setup>) {
  mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
  mockConfirmCardPayment.mockResolvedValue({
    paymentIntent: { id: "pi_wallet_ok", status: "succeeded" },
  });

  const view = renderCheckout();

  const noAddressSwitch = await screen.findByTestId("check-no-address");
  await user.click(noAddressSwitch);
  await user.type(screen.getByTestId("input-recipient-first-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
  await user.click(screen.getByTestId("button-continue-to-payment"));
  expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
  // In jsdom (non-Apple platform) apple_pay is platform-hidden; use google_pay.
  await user.click(await screen.findByTestId("option-payment-google_pay"));
  await waitFor(() => expect(mockCanMakePayment).toHaveBeenCalled());

  // The wallet sheet only opens once the PaymentIntent has been pre-created for
  // the current cart (so the native sheet shows the server's exact total), so
  // wait for the debounced pre-creation to run before tapping the button.
  await waitFor(
    () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1),
    { timeout: 3000 },
  );

  await user.click(screen.getByTestId("button-submit-payment"));
  await waitFor(() => {
    expect(mockPrShow).toHaveBeenCalled();
    expect(typeof mockPrEventHandlers.paymentmethod).toBe("function");
  });

  // Shopper authorises the wallet sheet → Stripe fires paymentmethod.
  const ev = { paymentMethod: { id: "pm_wallet_123" }, complete: vi.fn() };
  await act(async () => {
    await mockPrEventHandlers.paymentmethod(ev);
  });

  // The wallet path confirmed the payment, stashed the order, and "redirected".
  expect(ev.complete).toHaveBeenCalledWith("success");
  await waitFor(() => {
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/order-confirmed"),
    );
  });

  return view;
}

/** Read and parse the raw pending-order stash the wallet path wrote. */
function readStash(): { payload: Record<string, unknown>; createdAt: number } {
  const raw = sessionStorage.getItem(PENDING_ORDER_KEY);
  expect(raw).not.toBeNull();
  return JSON.parse(raw as string);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout wallet finalize → OrderConfirmed staleness guard", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Wallet sheets only appear on mobile viewports.
    mockUseIsMobile.mockReturnValue(true);
    // vi.clearAllMocks() wipes call history but not implementations — re-assert.
    // Return a truthy non-null result so the wallet pre-creation effect sets
    // paymentRequestRef.current = submitPr (required for walletViaNativeSheet=true
    // and pr.show() to be called in handleSubmit).  A null result would leave
    // paymentRequestRef=null and the wallet sheet branch would never execute.
    mockCanMakePayment.mockResolvedValue({ applePay: false });
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

  // ── The wallet success path produces a wallet-shaped, paid stash ─────────

  it("the wallet success path stashes a wallet payload with the PaymentIntent ref (no direct order)", async () => {
    const view = await driveWalletSuccess(user);

    // Checkout itself must NOT create the WooCommerce order — it only stashes.
    expect(mockCreateOrderMutateAsync).not.toHaveBeenCalled();
    expect(mockCreateOrderMutateSync).not.toHaveBeenCalled();

    const stash = readStash();
    expect(stash.payload).toMatchObject({
      // driveWalletSuccess selects google_pay in jsdom (non-Apple platform).
      paymentMethod: "google_pay",
      paymentRef: "pi_wallet_ok",
      currencyCode: "USD",
    });
    expect(typeof stash.createdAt).toBe("number");

    view.unmount();
  });

  // ── 1. Stale wallet return: must NOT create an abandoned order ───────────

  it("stale return: an expired wallet stash is not replayed into an order and shows the failure state", async () => {
    const view = await driveWalletSuccess(user);
    view.unmount();

    // Simulate the shopper authorising the sheet then backgrounding the tab:
    // the wallet stash is real but OrderConfirmed only loads hours later, past
    // the expiry window. Keep the exact payload, age the timestamp one ms past.
    const stash = readStash();
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({
        payload: stash.payload,
        createdAt: Date.now() - PENDING_ORDER_MAX_AGE_MS - 1,
      }),
    );

    // Wallet returns land on /order-confirmed?status=success with no inline ref.
    mockUseSearch.mockReturnValue("?status=success");

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER as any, token: "fake-token", isLoading: false },
      cart: { clearCart: mockClearCart },
    });

    // The shopper lands on the graceful failure screen.
    await screen.findByTestId("icon-failed");

    // Crucially: the WooCommerce order is never (re)created and the cart stays.
    expect(mockCreateOrderMutateSync).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  // ── 2. Fresh wallet return: finalizes the order normally ─────────────────

  it("fresh return: an in-window wallet stash is finalized into an order normally", async () => {
    const view = await driveWalletSuccess(user);
    view.unmount();

    // Same real wallet stash, still inside the expiry window.
    const stash = readStash();
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({
        payload: stash.payload,
        createdAt: Date.now() - PENDING_ORDER_MAX_AGE_MS + 60_000,
      }),
    );

    mockCreateOrderMutateSync.mockImplementation(
      (_payload: unknown, { onSuccess }: { onSuccess: (res: unknown) => void }) => {
        onSuccess({ ok: true, wcOrderId: 77777 });
      },
    );

    mockUseSearch.mockReturnValue("?status=success");

    renderWithProviders(<OrderConfirmed />, {
      auth: { user: SIGNED_IN_USER as any, token: "fake-token", isLoading: false },
      cart: { clearCart: mockClearCart },
    });

    // createOrder runs once with the wallet payload (paid via the PaymentIntent).
    await waitFor(() => {
      expect(mockCreateOrderMutateSync).toHaveBeenCalledTimes(1);
    });
    const submittedPayload = mockCreateOrderMutateSync.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(submittedPayload).toMatchObject({
      // driveWalletSuccess selects google_pay in jsdom (non-Apple platform).
      paymentMethod: "google_pay",
      paymentRef: "pi_wallet_ok",
      currencyCode: "USD",
    });

    // Success screen, and the stash is cleared so it cannot be replayed.
    // OrderConfirmed prefers the payload's reserved orderId for the reference.
    await screen.findByTestId("icon-success");
    expect(screen.getByTestId("text-order-ref").textContent).toContain("LB-WALLET-1");
    expect(sessionStorage.getItem(PENDING_ORDER_KEY)).toBeNull();
    expect(mockClearCart).toHaveBeenCalledTimes(1);
  });
});
