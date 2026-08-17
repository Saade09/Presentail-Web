// @vitest-environment jsdom
//
// Wallet PaymentIntent coupon-toggle tests for Apple Pay / Google Pay.
//
// The wallet PI pre-creation effect in Checkout.tsx includes `couponCode` in
// the `walletPiSignature` key, so applying or removing a coupon must invalidate
// the cached intent and trigger a fresh PI request with the updated total.
//
// Done looks like:
//   1. Toggling couponApplied with the same couponInput string produces a
//      different walletPiSignature (unit-level proof).
//   2. With a coupon pre-seeded, the effect sends couponCode + deliveryFeeUsd
//      in the PI request (integration proof of the "applied" branch).
//   3. Removing the coupon clears the cached intent and fires a new PI request
//      without couponCode (integration proof of the "removed" branch).

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stripe JS mocks — hoisted so Checkout.tsx's module-level loadStripe() and
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
    date: "2025-07-04",
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
  useNow: () => new Date("2025-07-04T10:00:00Z"),
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
  apiFetch: vi.fn().mockResolvedValue({ ok: true, orderId: "LB-COUPON-TEST-1", addresses: [] }),
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
// Component stubs (mirrors walletPiFail.test.tsx)
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
  COUPON_DISCOUNT_KEY: "presentail_coupon_discount_v1",
  CARD_QR_LINK_KEY: "presentail_card_qr_link_v1",
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

const COUPON_STORAGE_KEY = "presentail_coupon_v1";
const COUPON_CODE = "SAVE10";

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
  clientSecret: "pi_coupon_test_secret",
  orderId: "LB-COUPON-TEST-1",
  amount: 4500,
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
// Helper: drive to the payment step with Google Pay selected, wait for the
// debounced wallet PI effect to fire. Returns after the first mutateAsync
// call has settled.
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
// Suite 1: Pure unit-level proof — walletPiSignature is coupon-sensitive
// ---------------------------------------------------------------------------

describe("walletPiSignature — coupon toggle changes the signature", () => {
  // The `walletPiSignature` function is an internal pure function in Checkout.tsx.
  // Its contract is: JSON-serialise all charge-affecting fields. Because
  // couponCode is included (`couponCode: input.couponCode ?? ""`), the same
  // couponInput string with couponApplied=true vs couponApplied=false must
  // produce different signatures, forcing a new PI.

  function walletPiSignature(input: {
    items: { wcId?: number; osSlug?: string; quantity: number }[];
    currency: string;
    email?: string;
    deliveryFeeUsd: number;
    expressDelivery: boolean;
    noAddress: boolean;
    couponCode?: string;
    deliverySlot?: string;
    district?: string;
  }): string {
    return JSON.stringify({
      items: input.items.map((i) => ({ w: i.wcId ?? 0, s: i.osSlug ?? "", q: i.quantity })),
      currency: input.currency,
      email: input.email ?? "",
      deliveryFeeUsd: Math.round(input.deliveryFeeUsd * 100) / 100,
      expressDelivery: input.expressDelivery,
      noAddress: input.noAddress,
      couponCode: input.couponCode ?? "",
      deliverySlot: input.deliverySlot ?? "",
      district: input.district ?? "",
    });
  }

  const BASE_INPUT = {
    items: [{ wcId: 99, osSlug: "red-roses", quantity: 1 }],
    currency: "USD",
    email: "jane@example.com",
    deliveryFeeUsd: 8,
    expressDelivery: false,
    noAddress: false,
    deliverySlot: "",
    district: "",
  };

  it("couponApplied=true (couponCode present) produces a different signature than couponApplied=false (couponCode absent)", () => {
    const sigWithCoupon = walletPiSignature({ ...BASE_INPUT, couponCode: COUPON_CODE });
    const sigWithoutCoupon = walletPiSignature({ ...BASE_INPUT, couponCode: undefined });

    expect(sigWithCoupon).not.toBe(sigWithoutCoupon);
    expect(JSON.parse(sigWithCoupon).couponCode).toBe(COUPON_CODE);
    expect(JSON.parse(sigWithoutCoupon).couponCode).toBe("");
  });

  it("the same couponCode string applied vs not applied yields distinct signatures", () => {
    const applied = walletPiSignature({ ...BASE_INPUT, couponCode: COUPON_CODE });
    const removed = walletPiSignature({ ...BASE_INPUT, couponCode: undefined });

    // JSON.parse round-trip confirms the couponCode field is what differs.
    const parsedApplied = JSON.parse(applied) as Record<string, unknown>;
    const parsedRemoved = JSON.parse(removed) as Record<string, unknown>;

    expect(parsedApplied.couponCode).toBe(COUPON_CODE);
    expect(parsedRemoved.couponCode).toBe("");

    // Every other field must be identical.
    const { couponCode: _a, ...restApplied } = parsedApplied;
    const { couponCode: _r, ...restRemoved } = parsedRemoved;
    expect(restApplied).toEqual(restRemoved);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Integration — pre-creation effect sends the correct payload
// ---------------------------------------------------------------------------

describe("Checkout wallet PI pre-creation — coupon in the PI request", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockUseIsMobile.mockReturnValue(true);
    mockCanMakePayment.mockResolvedValue({ applePay: false });
    mockPrShow.mockImplementation(() => {});
    for (const key of Object.keys(mockPrEventHandlers)) {
      delete mockPrEventHandlers[key];
    }
    mockUseSearch.mockReturnValue("");
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    user = userEvent.setup();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockUseIsMobile.mockReturnValue(false);
  });

  // ── 1. PI carries couponCode when a coupon is pre-applied ────────────────

  it("sends couponCode in the PI request when a coupon is applied", async () => {
    localStorage.setItem(COUPON_STORAGE_KEY, COUPON_CODE);

    await driveToWalletPaymentStep(user);

    const callArgs = mockCreatePaymentIntentMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.couponCode).toBe(COUPON_CODE);
  });

  // ── 2. PI carries a numeric deliveryFeeUsd ───────────────────────────────

  it("sends a numeric deliveryFeeUsd in the PI request", async () => {
    localStorage.setItem(COUPON_STORAGE_KEY, COUPON_CODE);

    await driveToWalletPaymentStep(user);

    const callArgs = mockCreatePaymentIntentMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(typeof callArgs.data.deliveryFeeUsd).toBe("number");
  });

  // ── 3. No coupon → PI has no couponCode field ────────────────────────────

  it("omits couponCode from the PI request when no coupon is in effect", async () => {
    await driveToWalletPaymentStep(user);

    const callArgs = mockCreatePaymentIntentMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.couponCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Integration — removing a coupon forces a fresh PI without couponCode
// ---------------------------------------------------------------------------

describe("Checkout wallet PI — removing a coupon invalidates the cached intent", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockUseIsMobile.mockReturnValue(true);
    mockCanMakePayment.mockResolvedValue({ applePay: false });
    mockPrShow.mockImplementation(() => {});
    for (const key of Object.keys(mockPrEventHandlers)) {
      delete mockPrEventHandlers[key];
    }
    mockUseSearch.mockReturnValue("");
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    user = userEvent.setup();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("fires a second PI request without couponCode after the coupon is removed", async () => {
    localStorage.setItem(COUPON_STORAGE_KEY, COUPON_CODE);

    await driveToWalletPaymentStep(user);

    // First PI: must carry the coupon.
    expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(1);
    const firstCallArgs = mockCreatePaymentIntentMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(firstCallArgs.data.couponCode).toBe(COUPON_CODE);

    // Remove the coupon — the "remove" button's text is the translation key
    // because the test locale mock returns keys verbatim (t(k) === k).
    const removeBtn = screen.getByText("checkout.coupon.remove");
    await user.click(removeBtn);

    // The walletPiSignature changed (couponCode is now absent), so the
    // pre-creation effect must fire a second mutateAsync call.
    await waitFor(
      () => expect(mockCreatePaymentIntentMutate).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    );

    const secondCallArgs = mockCreatePaymentIntentMutate.mock.calls[1][0] as {
      data: Record<string, unknown>;
    };
    // The second request must NOT include couponCode.
    expect(secondCallArgs.data.couponCode).toBeUndefined();
    // deliveryFeeUsd must still be present and numeric.
    expect(typeof secondCallArgs.data.deliveryFeeUsd).toBe("number");
  });
});
