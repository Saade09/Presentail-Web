// @vitest-environment jsdom
//
// Tests for the "Get order updates on WhatsApp" opt-in checkbox in checkout:
//
//   1. Default state: checked on a fresh checkout; whatsapp_updates_default_shown
//      fires once with defaultChecked (never a raw phone number).
//   2. Unchecking fires whatsapp_updates_disabled; re-checking fires nothing extra.
//   3. The choice persists across Delivery Details ↔ Payment navigation.
//   4. The order payload carries whatsappOptIn true/false, and
//      checkout_completed_with_whatsapp_updates fires with the final state.
//   5. The anonymous-gift checkbox stays independent of the WhatsApp toggle.
//   6. The mobile (≤767px) switch rows mirror the same whatsappOptIn /
//      identitySecret state as the md+ checkboxes, expose switch semantics,
//      and fire the same analytics exactly once.
//
// The mock harness is copied from Checkout.cardFlow.test.tsx (same rendering
// and step-navigation requirements), with trackWebEvent captured.

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
  useTabbyPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

const mockTrackEvent = vi.fn();
const mockTrackWebEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  // Wrap in a thunk so the factory (hoisted to the top of the file) does not
  // read mockTrackEvent before its const initialiser has run.
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackWebEvent: (...args: unknown[]) => mockTrackWebEvent(...args),
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

describe("Checkout — WhatsApp order-updates opt-in", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    mockUseIsMobile.mockReturnValue(false);
    mockCreatePaymentIntentMutate.mockResolvedValue(PAYMENT_INTENT_RES);
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_wa_test", status: "succeeded" },
    });
    mockCreateOrderMutate.mockResolvedValue(ORDER_SUCCESS_RES);
    // The card path POSTs the order payload to /api/checkout/klarna-pending
    // (charged-but-lost-order protection) with raw fetch before confirming the
    // card; stub it to succeed so the flow reaches finalizeOrderNow.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    );
    user = userEvent.setup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("is checked by default and fires whatsapp_updates_default_shown once, without a phone number", async () => {
    renderCheckout();

    const checkbox = (await screen.findByTestId("check-whatsapp-updates")) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    // Accessible description is wired up.
    expect(checkbox.getAttribute("aria-describedby")).toBe("whatsapp-updates-hint");
    // Tests render raw locale keys — assert the hint element is wired to the
    // right key rather than the English copy.
    expect(screen.getByTestId("whatsapp-updates-hint").textContent).toContain(
      "checkout.whatsappUpdatesHint",
    );

    const shown = mockTrackWebEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "whatsapp_updates_default_shown",
    );
    expect(shown.length).toBe(1);
    expect(JSON.stringify(shown[0])).not.toContain("+1212");
  });

  it("unchecking fires whatsapp_updates_disabled and the state persists across step navigation", async () => {
    renderCheckout();

    const checkbox = (await screen.findByTestId("check-whatsapp-updates")) as HTMLInputElement;
    await user.click(checkbox);
    expect(checkbox.checked).toBe(false);

    const disabled = mockTrackWebEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "whatsapp_updates_disabled",
    );
    expect(disabled.length).toBe(1);

    // Navigate Delivery Details → Payment, then back — choice must persist.
    await navigateToStep2(user);
    const editBtn = await screen.findByTestId("link-edit-delivery");
    await user.click(editBtn);
    const checkboxAgain = (await screen.findByTestId("check-whatsapp-updates")) as HTMLInputElement;
    expect(checkboxAgain.checked).toBe(false);
    // No duplicate default-shown event on re-render of step 1.
    const shown = mockTrackWebEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "whatsapp_updates_default_shown",
    );
    expect(shown.length).toBe(1);
  });

  it("default-checked order: payload carries whatsappOptIn=true and completion event fires with optedIn=true", async () => {
    renderCheckout();
    await navigateToStep2(user);

    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(mockCreateOrderMutate).toHaveBeenCalledWith(
        expect.objectContaining({ whatsappOptIn: true }),
      );
    });
    await waitFor(() => {
      const completed = mockTrackWebEvent.mock.calls.filter(
        ([e]) => (e as { type: string }).type === "checkout_completed_with_whatsapp_updates",
      );
      expect(completed.length).toBe(1);
      expect((completed[0][0] as { properties: { optedIn: boolean } }).properties.optedIn).toBe(true);
    });
  });

  it("opted-out order: payload carries whatsappOptIn=false and completion event fires with optedIn=false", async () => {
    renderCheckout();

    const checkbox = (await screen.findByTestId("check-whatsapp-updates")) as HTMLInputElement;
    await user.click(checkbox);
    expect(checkbox.checked).toBe(false);

    await navigateToStep2(user);
    await user.click(screen.getByTestId("button-submit-payment"));

    await waitFor(() => {
      expect(mockCreateOrderMutate).toHaveBeenCalledWith(
        expect.objectContaining({ whatsappOptIn: false }),
      );
    });
    await waitFor(() => {
      const completed = mockTrackWebEvent.mock.calls.filter(
        ([e]) => (e as { type: string }).type === "checkout_completed_with_whatsapp_updates",
      );
      expect(completed.length).toBe(1);
      expect((completed[0][0] as { properties: { optedIn: boolean } }).properties.optedIn).toBe(false);
    });
  });

  it("anonymous-gift checkbox stays independent of the WhatsApp toggle", async () => {
    renderCheckout();

    const whatsapp = (await screen.findByTestId("check-whatsapp-updates")) as HTMLInputElement;
    const anonymous = (await screen.findByTestId("check-anonymous-gift")) as HTMLInputElement;
    for (const variant of ["mobile", "tablet", "desktop"]) {
      const icon = screen.getByTestId(`identity-secret-icon-${variant}`);
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("focusable")).toBe("false");
    }

    expect(whatsapp.checked).toBe(true);
    expect(anonymous.checked).toBe(false);

    await user.click(anonymous);
    expect(anonymous.checked).toBe(true);
    expect(whatsapp.checked).toBe(true);

    await user.click(whatsapp);
    expect(whatsapp.checked).toBe(false);
    expect(anonymous.checked).toBe(true);
  });

  it("mobile switch rows expose switch semantics, mirror the checkbox state, and fire the same analytics once", async () => {
    // isMobile gates the mobile_checkout_anonymous_toggled event.
    mockUseIsMobile.mockReturnValue(true);
    renderCheckout();

    // WhatsApp switch: default ON, proper role/name/description wiring.
    const waSwitch = await screen.findByTestId("switch-whatsapp-updates");
    expect(waSwitch.getAttribute("role")).toBe("switch");
    expect(waSwitch.getAttribute("aria-checked")).toBe("true");
    expect(waSwitch.getAttribute("aria-labelledby")).toBe("whatsapp-updates-switch-title");
    expect(waSwitch.getAttribute("aria-describedby")).toBe("whatsapp-updates-switch-hint");
    // New mobile copy comes from the locale system (tests render raw keys).
    expect(screen.getByTestId("switch-whatsapp-updates-hint").textContent).toContain(
      "checkout.whatsappUpdatesShortHint",
    );

    // Toggling the switch updates the shared state (checkbox mirrors it) and
    // fires whatsapp_updates_disabled exactly once.
    await user.click(waSwitch);
    expect(waSwitch.getAttribute("aria-checked")).toBe("false");
    expect((screen.getByTestId("check-whatsapp-updates") as HTMLInputElement).checked).toBe(false);
    const disabled = mockTrackWebEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "whatsapp_updates_disabled",
    );
    expect(disabled.length).toBe(1);
    // Re-enabling fires nothing extra.
    await user.click(waSwitch);
    expect(waSwitch.getAttribute("aria-checked")).toBe("true");
    expect(
      mockTrackWebEvent.mock.calls.filter(
        ([e]) => (e as { type: string }).type === "whatsapp_updates_disabled",
      ).length,
    ).toBe(1);

    // Anonymous switch: default OFF, independent of the WhatsApp toggle,
    // fires mobile_checkout_anonymous_toggled once per change.
    const anonSwitch = screen.getByTestId("switch-identity-secret");
    expect(anonSwitch.getAttribute("role")).toBe("switch");
    expect(anonSwitch.getAttribute("aria-checked")).toBe("false");
    await user.click(anonSwitch);
    expect(anonSwitch.getAttribute("aria-checked")).toBe("true");
    expect((screen.getByTestId("check-identity-secret") as HTMLInputElement).checked).toBe(true);
    expect(waSwitch.getAttribute("aria-checked")).toBe("true");
    const anonEvents = mockTrackWebEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "mobile_checkout_anonymous_toggled",
    );
    expect(anonEvents.length).toBe(1);
    expect((anonEvents[0][0] as { properties: { enabled: boolean } }).properties.enabled).toBe(true);
  });
});
