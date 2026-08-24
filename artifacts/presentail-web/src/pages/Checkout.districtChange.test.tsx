// @vitest-environment jsdom
//
// District-change revalidation (web checkout).
//
// When the shopper changes the Delivery District after a delivery slot is
// already picked, the checkout must:
//   • clear an invalid selection with a persistent amber notice + a
//     "Delivery selection required" card, and block payment until a valid
//     option is chosen (never auto-substituting a slot);
//   • keep a still-valid selection untouched (no notice);
//   • keep the selection but show a dismissible informational notice when
//     only the delivery fee changed;
//   • surface loading/error states (with Retry) while availability data for
//     the new district is unresolved, blocking payment meanwhile;
//   • never resurrect a cleared slot when returning to the original district;
//   • sanitize a persisted (refresh/back-nav) slot against the active
//     district's live schedule on load.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";
import { getLocalIso, type TimeSlot } from "@workspace/delivery";

// ---------------------------------------------------------------------------
// Fixtures — mutable holders so individual tests can vary the delivery
// locations payload and the persisted delivery selection before render.
// ---------------------------------------------------------------------------

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const TODAY = getLocalIso("LB");
const FUTURE = addDaysIso(TODAY, 3);

const MORNING = "9:00 AM – 2:00 PM";
const AFTERNOON = "2:00 PM – 6:00 PM";

const beirutSlots: TimeSlot[] = [
  { label: MORNING, cutoffHour: 9, slotId: "beirut-morning" },
  { label: AFTERNOON, cutoffHour: 14, slotId: "beirut-afternoon" },
];

function mkCities() {
  return [
    { id: "city-beirut", name: "Beirut", fee: 8, isActive: true, expressAvailable: true, timeSlots: beirutSlots },
    // Akkar offers a completely different schedule — invalidates the selection.
    {
      id: "city-akkar",
      name: "Akkar",
      fee: 12,
      isActive: true,
      expressAvailable: false,
      timeSlots: [{ label: "10:00 AM – 1:00 PM", cutoffHour: 10, slotId: "akkar-1" }] as TimeSlot[],
    },
    // Tripoli offers the same labels under its own slot ids, at a higher fee.
    {
      id: "city-tripoli",
      name: "Tripoli",
      fee: 15,
      isActive: true,
      expressAvailable: false,
      timeSlots: [
        { label: MORNING, cutoffHour: 9, slotId: "tripoli-morning" },
        { label: AFTERNOON, cutoffHour: 14, slotId: "tripoli-afternoon" },
      ] as TimeSlot[],
    },
    // Jounieh mirrors Beirut exactly (same labels + same fee) — silent keep.
    {
      id: "city-jounieh",
      name: "Jounieh",
      fee: 8,
      isActive: true,
      expressAvailable: true,
      timeSlots: [
        { label: MORNING, cutoffHour: 9, slotId: "jounieh-morning" },
        { label: AFTERNOON, cutoffHour: 14, slotId: "jounieh-afternoon" },
      ] as TimeSlot[],
    },
  ];
}

type LocationsHolder = {
  data: { countries: Array<Record<string, unknown>> } | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
};
const mockRefetchLocations = vi.fn();
const locationsHolder: LocationsHolder = {
  data: { countries: [{ code: "LB", name: "Lebanon", freeDeliveryEnabled: false, cities: mkCities() }] },
  isLoading: false,
  isError: false,
  isFetching: false,
};
function resetLocationsHolder() {
  locationsHolder.data = {
    countries: [{ code: "LB", name: "Lebanon", freeDeliveryEnabled: false, cities: mkCities() }],
  };
  locationsHolder.isLoading = false;
  locationsHolder.isError = false;
  locationsHolder.isFetching = false;
}

// Persisted delivery selection (shared context) — seeded per test.
const mockSetSelection = vi.fn();
const deliverySelectionHolder = {
  mode: "schedule" as string | null,
  date: FUTURE as string | null,
  slotLabel: MORNING as string | null,
  slotId: "beirut-morning" as string | null,
};
function resetDeliverySelectionHolder() {
  deliverySelectionHolder.mode = "schedule";
  deliverySelectionHolder.date = FUTURE;
  deliverySelectionHolder.slotLabel = MORNING;
  deliverySelectionHolder.slotId = "beirut-morning";
}

// ---------------------------------------------------------------------------
// Mocks (mirroring Checkout.cardFlow.test.tsx, minus the Stripe machinery)
// ---------------------------------------------------------------------------

const mockUseIsMobile = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useStripe: () => null,
  useElements: () => null,
  CardNumberElement: "div",
  CardExpiryElement: "div",
  CardCvcElement: "div",
}));

vi.mock("@workspace/api-client-react", () => ({
  useCreateCheckoutPaymentIntent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queries", () => ({
  useCreateOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStripeCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMamoPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePaypalPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTabbyPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeliveryLocations: () => ({
    data: locationsHolder.data,
    isLoading: locationsHolder.isLoading,
    isError: locationsHolder.isError,
    isFetching: locationsHolder.isFetching,
    refetch: mockRefetchLocations,
  }),
  useCurrenciesData: () => ({ data: undefined, isLoading: false }),
  useFxRates: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  const country = { name: "Lebanon", code: "LB", flag: "🇱🇧" };
  const city = { name: "Beirut", id: "city-beirut", fee: 8 };
  const selection = {
    countryCode: "LB",
    country,
    city,
    activeCities: [city],
    selectedCityData: { ...city, freeDeliveryEnabled: false },
  };
  return {
    ...actual,
    useLocationSelection: () => selection,
    LocationProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({
    mode: deliverySelectionHolder.mode,
    date: deliverySelectionHolder.date,
    slotLabel: deliverySelectionHolder.slotLabel,
    slotId: deliverySelectionHolder.slotId,
    serviceType: null,
    cityId: null,
    hasSelection: !!deliverySelectionHolder.slotLabel,
    setSelection: mockSetSelection,
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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useHeadingFont", () => ({
  useHeadingFont: () => "serif",
}));

vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
}));

vi.mock("react-phone-number-input", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-phone-number-input")>();
  return { ...original, isValidPhoneNumber: () => true };
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

// District combobox → flat buttons so tests can pick any city without cmdk.
// The extra "Zahle" button simulates picking a district the current
// delivery-locations payload does not (yet) contain — the pending/error path.
vi.mock("@/components/checkout/LocationCombobox", () => ({
  LocationCombobox: ({
    value,
    options,
    onSelect,
  }: {
    value: string;
    options: Array<{ id: string; name: string; isActive?: boolean }>;
    onSelect: (name: string) => void;
  }) => (
    <div data-testid="select-district" data-value={value}>
      {options.map((o) => (
        <button key={o.id} type="button" data-testid={`district-option-${o.name}`} onClick={() => onSelect(o.name)}>
          {o.name}
        </button>
      ))}
      <button type="button" data-testid="district-option-Zahle" onClick={() => onSelect("Zahle")}>
        Zahle
      </button>
    </div>
  ),
}));

// Delivery picker modal → stub exposing a confirm button wired to the city's
// first slot, so tests can resolve the required-action state like a shopper.
vi.mock("@/components/delivery/DeliveryPickerModal", () => ({
  DeliveryPickerModal: ({
    open,
    onConfirm,
    timeSlots,
  }: {
    open: boolean;
    onConfirm: (sel: { mode: "schedule"; date: string; slotLabel: string; slotId?: string }) => void;
    timeSlots: TimeSlot[];
  }) =>
    open ? (
      <div data-testid="delivery-picker-modal">
        <button
          type="button"
          data-testid="picker-confirm-first-slot"
          onClick={() => {
            const s = timeSlots[0]!;
            onConfirm({ mode: "schedule", date: FUTURE, slotLabel: s.label, slotId: s.slotId });
          }}
        >
          confirm
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/StripeCheckoutSection", () => ({
  StripeCheckoutSection: () => null,
}));
vi.mock("@/components/StripeCardFields", () => ({
  StripeCardFields: () => null,
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
vi.mock("@/components/WebPhoneField", () => ({
  WebPhoneField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="input-recipient-phone" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/Logo", () => ({ Logo: () => <div data-testid="logo" /> }));
vi.mock("@/components/cart/FreeDeliveryBanner", () => ({ FreeDeliveryBanner: () => null }));
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({ CheckoutLoginDialog: () => null }));
vi.mock("@/components/skeletons/CheckoutSkeleton", () => ({
  CheckoutSkeleton: () => <div data-testid="checkout-skeleton" />,
}));
vi.mock("@/components/delivery/DeliveryDateRow", () => ({ DeliveryDateRow: () => null }));
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

// ---------------------------------------------------------------------------
// Import AFTER all vi.mock declarations.
// ---------------------------------------------------------------------------

import Checkout from "./Checkout";
import { STRINGS } from "@/locales/index";
import type { ShimUser } from "@/contexts/AuthContext";
import type { CartItem } from "@/contexts/CartContext";

// Real English translator (the test-utils default `t` echoes raw keys, which
// would hide interpolation bugs in the district-change copy).
function realT(key: string, params?: Record<string, string | number>): string {
  const entry = (STRINGS as Record<string, { en?: string } | undefined>)[key];
  let out = entry?.en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

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

function renderCheckout() {
  return renderWithProviders(<Checkout />, {
    locale: { t: realT },
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

/** Fill name/phone/address so only the delivery gate can block Continue. */
async function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByTestId("input-recipient-name"), "John");
  await user.type(screen.getByTestId("input-recipient-phone"), "+12125550000");
  await user.type(screen.getByTestId("input-recipient-address"), "Main Street 1");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLocationsHolder();
  resetDeliverySelectionHolder();
  mockUseIsMobile.mockReturnValue(false);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => ({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checkout — district change revalidation", () => {
  it("clears an invalid selection, shows the persistent notice + required-action card, blocks payment, and resolves via the picker", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    // Beirut → Akkar: the persisted morning slot does not exist in Akkar.
    await user.click(screen.getByTestId("district-option-Akkar"));

    // Persistent amber notice under the district field, with the district name.
    const title = await screen.findByTestId("text-district-notice-title");
    expect(title.textContent).toContain("Akkar");
    // LB market terminology: governorate wording for the slot-unavailable body.
    expect(screen.getByTestId("text-district-notice-body").textContent).toMatch(/governorate/i);

    // Order Summary switches to the required-action card; CTA is aria-disabled.
    expect(screen.getByTestId("delivery-required-panel")).toBeTruthy();
    expect(screen.getByTestId("text-delivery-required-title").textContent).toMatch(/Delivery selection required/i);
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByTestId("button-continue-to-payment").getAttribute("aria-disabled"),
    ).toBe("true");
    // Mobile summary card mirrors the required state.
    expect(screen.getByTestId("mobile-delivery-required")).toBeTruthy();

    // The auto-pick effect must NOT silently substitute a slot: the required
    // state persists across effect flushes.
    await waitFor(() => {
      expect(screen.getByTestId("delivery-required-panel")).toBeTruthy();
    });

    // Payment cannot proceed while the selection is invalid.
    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(screen.queryByTestId("button-submit-payment")).toBeNull();

    // "Choose delivery time" opens the picker (filtered to Akkar's slots);
    // confirming a valid slot dismisses the notice and unblocks payment.
    await user.click(screen.getByTestId("button-choose-delivery-time"));
    await user.click(await screen.findByTestId("picker-confirm-first-slot"));

    await waitFor(() => {
      expect(screen.queryByTestId("text-district-notice-title")).toBeNull();
      expect(screen.queryByTestId("delivery-required-panel")).toBeNull();
    });
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBeNull();

    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
  });

  it("keeps a still-valid selection silently when the new district offers the same slot at the same fee", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    await user.click(screen.getByTestId("district-option-Jounieh"));

    // No notice, no required-action card, CTA stays enabled.
    expect(screen.queryByTestId("text-district-notice-title")).toBeNull();
    expect(screen.queryByTestId("delivery-required-panel")).toBeNull();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBeNull();

    // The same-label slot is re-pointed at Jounieh's slot id in the shared store.
    await waitFor(() => {
      expect(mockSetSelection).toHaveBeenCalledWith(
        expect.objectContaining({ slotId: "jounieh-morning" }),
      );
    });

    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(await screen.findByTestId("button-submit-payment")).toBeTruthy();
  });

  it("keeps the selection but shows a dismissible fee-updated notice when only the fee changed", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    // Beirut ($8) → Tripoli ($15): same slot labels, higher fee.
    await user.click(screen.getByTestId("district-option-Tripoli"));

    const title = await screen.findByTestId("text-district-notice-title");
    expect(title.textContent).toMatch(/Delivery fee updated/i);
    expect(title.textContent).toContain("Tripoli");
    // Old → new fee amounts rendered via FormattedPrice (mocked as $n).
    const body = screen.getByTestId("text-district-notice-body");
    expect(body.textContent).toContain("$8");
    expect(body.textContent).toContain("$15");

    // Informational only: no required-action card, payment stays enabled.
    expect(screen.queryByTestId("delivery-required-panel")).toBeNull();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBeNull();

    // The compact notice is dismissible.
    await user.click(screen.getByTestId("button-district-notice-dismiss"));
    expect(screen.queryByTestId("text-district-notice-title")).toBeNull();
  });

  it("does not resurrect a cleared slot when returning to the original district", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    await user.click(screen.getByTestId("district-option-Akkar"));
    await screen.findByTestId("text-district-notice-title");

    // Back to Beirut: the cleared slot must stay cleared and payment blocked.
    await user.click(screen.getByTestId("district-option-Beirut"));
    expect(await screen.findByTestId("text-district-notice-title")).toBeTruthy();
    expect(screen.getByTestId("delivery-required-panel")).toBeTruthy();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");

    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(screen.queryByTestId("button-submit-payment")).toBeNull();
  });

  it("sanitizes a persisted slot that is invalid for the active district on load", async () => {
    // Refresh/back-navigation restored a slot Beirut does not offer.
    deliverySelectionHolder.slotLabel = "6:00 PM – 9:00 PM";
    deliverySelectionHolder.slotId = "ghost-slot";

    renderCheckout();

    // The stale slot is dropped and the required-action state is shown
    // instead of silently keeping (or replacing) the old promise.
    expect(await screen.findByTestId("delivery-required-panel")).toBeTruthy();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps a persisted slot that is valid for the active district on load", async () => {
    renderCheckout();
    await screen.findByTestId("input-recipient-name");

    await waitFor(() => {
      expect(screen.queryByTestId("delivery-required-panel")).toBeNull();
    });
    expect(screen.queryByTestId("text-district-notice-title")).toBeNull();
  });

  it("blocks payment with an error + Retry when availability data failed, then resolves once data arrives", async () => {
    // Simulate a dead /api/delivery-locations: no data, errored.
    locationsHolder.data = undefined;
    locationsHolder.isError = true;

    const user = userEvent.setup();
    const view = renderCheckout();
    await fillStep1(user);

    // Pick a district that cannot be resolved without data → error state.
    await user.click(screen.getByTestId("district-option-Zahle"));

    const body = await screen.findByTestId("text-district-notice-body");
    expect(body.textContent).toMatch(/couldn't update delivery options/i);
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");

    // Payment cannot proceed while errored.
    await user.click(screen.getByTestId("button-continue-to-payment"));
    expect(screen.queryByTestId("button-submit-payment")).toBeNull();

    // Retry triggers a refetch and shows the loading state.
    await user.click(screen.getByTestId("button-district-notice-retry"));
    expect(mockRefetchLocations).toHaveBeenCalled();

    // Data arrives with Zahle available. The cold-load failure meant the
    // persisted slot could never be validated (it was already dropped), so
    // the checkout resolves to the explicit required-action state — it must
    // NOT silently pick a slot on the shopper's behalf.
    locationsHolder.data = {
      countries: [
        {
          code: "LB",
          name: "Lebanon",
          freeDeliveryEnabled: false,
          cities: [
            ...mkCities(),
            {
              id: "city-zahle",
              name: "Zahle",
              fee: 0,
              isActive: true,
              expressAvailable: false,
              timeSlots: [
                { label: MORNING, cutoffHour: 9, slotId: "zahle-morning" },
                { label: AFTERNOON, cutoffHour: 14, slotId: "zahle-afternoon" },
              ],
            },
          ],
        },
      ],
    };
    locationsHolder.isError = false;
    view.rerender(<Checkout />);

    const resolvedTitle = await screen.findByTestId("text-district-notice-title");
    expect(resolvedTitle.textContent).toContain("Zahle");
    expect(screen.getByTestId("delivery-required-panel")).toBeTruthy();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");

    // Explicitly choosing a Zahle slot clears the state and unblocks payment.
    await user.click(screen.getByTestId("button-choose-delivery-time"));
    await user.click(await screen.findByTestId("picker-confirm-first-slot"));
    await waitFor(() => {
      expect(screen.queryByTestId("text-district-notice-title")).toBeNull();
    });
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("only lets the latest district win when switching rapidly", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    // Beirut → Akkar (invalid) → Tripoli (valid labels, new fee) in quick
    // succession: the final state must reflect Tripoli, but since Akkar
    // already cleared the slot, Tripoli has nothing valid to keep — the
    // required-action state persists with Tripoli's name.
    await user.click(screen.getByTestId("district-option-Akkar"));
    await user.click(screen.getByTestId("district-option-Tripoli"));

    const title = await screen.findByTestId("text-district-notice-title");
    expect(title.textContent).toContain("Tripoli");
    expect(screen.getByTestId("delivery-required-panel")).toBeTruthy();
    expect(
      screen.getByTestId("button-continue-to-payment-sidebar").getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("announces the notice via a polite live region and moves focus to it when a selection is cleared", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStep1(user);

    await user.click(screen.getByTestId("district-option-Akkar"));

    const region = await screen.findByTestId("district-change-notice");
    // The always-mounted wrapper is the live region; the card sits inside it.
    expect(region.parentElement?.getAttribute("aria-live")).toBe("polite");
    expect(region.parentElement?.getAttribute("role")).toBe("status");

    // Focus lands on the notice card (after the short Radix-restore delay).
    await waitFor(
      () => {
        const active = document.activeElement as HTMLElement | null;
        expect(active?.closest('[data-testid="district-change-notice"]')).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });
});
