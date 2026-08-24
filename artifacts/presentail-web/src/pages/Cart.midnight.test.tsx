// @vitest-environment jsdom
//
// Midnight Delivery in the cart's Delivery Summary — a deliberately selected
// Midnight slot renders the distinctive cream Midnight card (crescent icon,
// dynamic arrival promise, resolved fee, Change action), suppresses every
// Express upsell surface, labels the sticky bar, and counts the surcharge
// exactly once in the Order Summary / sticky total.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackWebEvent: vi.fn(),
  trackWebEventOnce: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", vi.fn()]),
  Link: ({ children, href, onClick, ...rest }: React.PropsWithChildren<{ href: string; onClick?: React.MouseEventHandler; [k: string]: unknown }>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

const DELIVERY_CONFIG = {
  freeDeliveryEnabled: true,
  freeDeliveryThreshold: "$90",
  freeDeliveryThresholdUsd: 90,
  expressDeliveryTimeLabel: "Arrives in 90 minutes",
  currency: "USD",
  cityFeeUsd: 10 as number | null,
  expressSurchargeUsd: 15,
  isLoaded: true,
};
const { mockUseDeliveryConfig } = vi.hoisted(() => ({
  mockUseDeliveryConfig: vi.fn(),
}));
vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: mockUseDeliveryConfig,
}));

// Beirut city with a live OS Midnight slot alongside a standard evening slot.
const MIDNIGHT_SLOT = {
  label: "11:00 PM – 1:00 AM",
  slotId: "mid-1",
  cutoffHour: 21,
  startHour: 23,
  endHour: 1,
  serviceType: "midnight",
  extraFee: 20,
  sameDayEnabled: true,
  nextDayEnabled: true,
};
const STANDARD_SLOT = {
  label: "2:00 PM – 5:00 PM",
  slotId: "std-1",
  cutoffHour: 14,
  startHour: 14,
  endHour: 17,
  sameDayEnabled: true,
  nextDayEnabled: true,
};
const BEIRUT = {
  id: "lb-beirut",
  name: "Beirut",
  expressAvailable: true,
  timeSlots: [STANDARD_SLOT, MIDNIGHT_SLOT],
};

const { mockUseLocationSelection } = vi.hoisted(() => ({
  mockUseLocationSelection: vi.fn(),
}));

const locationFixture = (city: unknown) => ({
  countryCode: "LB",
  city,
  country: null,
  cityId: "lb-beirut",
  countries: [],
  isLoadingCountries: false,
  isPickerOpen: false,
  pickerForceCountryStep: false,
  openPicker: vi.fn(),
  closePicker: vi.fn(),
  setLocation: vi.fn(),
  clearLocation: vi.fn(),
});

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: mockUseLocationSelection,
  };
});

vi.mock("@/components/cart/CartUpsells", () => ({ CartUpsells: () => null }));
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({ CheckoutLoginDialog: () => null }));
// Keep the real DeliveryDateRow (the surface under test) but stub the heavy
// picker modal, exposing its open state for the "Change" round-trip check.
vi.mock("@/components/delivery/DeliveryPickerModal", () => ({
  DeliveryPickerModal: ({ open }: { open: boolean }) => (
    <div data-testid="delivery-picker-modal" data-open={open ? "true" : "false"} />
  ),
}));

// Freeze "now" at 12:00 UTC (15:00 Beirut) — destination-local today is 2026-08-14.
vi.mock("@/lib/useNow", () => ({
  useNow: () => new Date("2026-08-14T12:00:00Z"),
}));

const { mockUseDeliverySelection } = vi.hoisted(() => ({
  mockUseDeliverySelection: vi.fn(),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: mockUseDeliverySelection,
  DeliverySelectionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import Cart from "./Cart";
import { trackWebEvent } from "@/lib/analytics";

const FAKE_ITEM = {
  product: {
    id: "p1",
    name: "Red Roses Bouquet",
    priceValue: 75,
    price: "75",
    image: null,
    category: "flowers",
    categories: ["flowers"],
    inStock: true,
    occasions: [],
    wcId: 1,
    slug: "red-roses-bouquet",
  },
  quantity: 1,
};

const CART = { items: [FAKE_ITEM], subtotal: 75, itemCount: 1, isHydrated: true };
const AUTH_OUT = { user: null, isLoading: false, token: null };
const CURRENCY_FIXTURE = { formatPrice: (v: number) => `$${v}` };

const midnightSelection = (overrides: Partial<Record<string, unknown>> = {}) => ({
  mode: "today_slot" as const,
  date: "2026-08-14",
  slotLabel: MIDNIGHT_SLOT.label,
  slotId: MIDNIGHT_SLOT.slotId,
  serviceType: "midnight" as const,
  cityId: "lb-beirut",
  source: "user_selected" as const,
  hasSelection: true,
  setSelection: vi.fn(),
  clear: vi.fn(),
  ...overrides,
});

const webEventsOf = (type: string) =>
  vi.mocked(trackWebEvent).mock.calls.map(([e]) => e).filter((e) => e.type === type);

beforeEach(() => {
  vi.mocked(trackWebEvent).mockClear();
  mockUseDeliveryConfig.mockReset();
  mockUseDeliveryConfig.mockReturnValue(DELIVERY_CONFIG);
  mockUseLocationSelection.mockReset();
  mockUseLocationSelection.mockImplementation(() => locationFixture(BEIRUT));
  localStorage.clear();
});

describe("Midnight card — tonight selection", () => {
  it("renders the Midnight card with service label, promise, caption, fee, and Change", () => {
    mockUseDeliverySelection.mockReturnValue(midnightSelection());
    renderWithProviders(<Cart />, {
      auth: AUTH_OUT,
      cart: CART,
      currency: CURRENCY_FIXTURE,
      // Real template for the fee key so buildFeeNode substitutes the amount;
      // identity translation elsewhere.
      locale: { t: (key: string) => (key === "cart.expressDelta" ? "+ {amount}" : key) },
    });

    expect(screen.getByTestId("card-midnight-delivery")).toBeTruthy();
    expect(screen.getByTestId("text-delivery-service").textContent).toBe(
      "delivery.promise.midnightTitle",
    );
    // t() is the identity translator, so the arrival template key comes back
    // unfilled — the dynamic "tonight, 11 PM–1 AM" content is covered by the
    // buildMidnightPromise unit tests.
    expect(screen.getByTestId("text-delivery-arrival").textContent).toBe(
      "delivery.promise.arrives",
    );
    expect(screen.getByTestId("text-delivery-caption").textContent).toBe(
      "delivery.promise.midnightCaption",
    );
    // Resolved $20 slot fee (never hardcoded copy) rendered via the fee template.
    expect(screen.getByTestId("text-midnight-fee").textContent).toContain("$20");
    expect(screen.getByTestId("delivery-date-row").textContent).toContain("delivery.row.change");
  });

  it("suppresses the Express upgrade card and quiet prompt, recording midnight_selected", () => {
    mockUseDeliverySelection.mockReturnValue(midnightSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(webEventsOf("express_offer_impression")).toHaveLength(0);
    expect(webEventsOf("express_offer_suppressed")[0].properties).toMatchObject({
      suppression_reason: "midnight_selected",
    });
  });

  it("labels the sticky bar 'Midnight delivery tonight' and totals subtotal + base + fee once", () => {
    mockUseDeliverySelection.mockReturnValue(midnightSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    expect(screen.getByTestId("text-sticky-delivery-label").textContent).toContain(
      "cart.sticky.midnightTonight",
    );
    // Order Summary lists the Midnight surcharge exactly once…
    expect(screen.getAllByText("product.midnightDelivery")).toHaveLength(1);
    // …and the sticky total matches: 75 items + 10 base + 20 midnight = 105
    // (shown in both the summary row and the CTA).
    expect(screen.getAllByText("$105").length).toBeGreaterThanOrEqual(2);
  });

  it("'Change' (tapping the card) opens the delivery picker", async () => {
    mockUseDeliverySelection.mockReturnValue(midnightSelection());
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    expect(screen.getByTestId("delivery-picker-modal").getAttribute("data-open")).toBe("false");
    await userEvent.click(screen.getByTestId("delivery-date-row"));
    expect(screen.getByTestId("delivery-picker-modal").getAttribute("data-open")).toBe("true");
  });
});

describe("Midnight card — future-date selection", () => {
  it("keeps the card, suppresses Express, and shows the explicit-date sticky label", () => {
    mockUseDeliverySelection.mockReturnValue(
      midnightSelection({ mode: "schedule", date: "2026-08-16" }),
    );
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    expect(screen.getByTestId("card-midnight-delivery")).toBeTruthy();
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
    expect(screen.queryByTestId("card-express-quiet-prompt")).toBeNull();
    expect(screen.getByTestId("text-sticky-delivery-label").textContent).toContain(
      "cart.sticky.midnightOn",
    );
  });
});

describe("Midnight detection resilience", () => {
  it("still treats the selection as Midnight via serviceType when the slot list is empty (cold city data)", () => {
    mockUseDeliverySelection.mockReturnValue(midnightSelection());
    mockUseLocationSelection.mockImplementation(() =>
      locationFixture({ ...BEIRUT, timeSlots: [] }),
    );
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });
    expect(screen.queryByTestId("card-express-upgrade")).toBeNull();
    expect(screen.getByTestId("card-midnight-delivery")).toBeTruthy();
  });
});

describe("Non-midnight regression", () => {
  it("standard same-day selection keeps the plain row and the Express upgrade card", () => {
    mockUseDeliverySelection.mockReturnValue(
      midnightSelection({
        slotLabel: STANDARD_SLOT.label,
        slotId: STANDARD_SLOT.slotId,
        serviceType: null,
      }),
    );
    renderWithProviders(<Cart />, { auth: AUTH_OUT, cart: CART, currency: CURRENCY_FIXTURE });

    expect(screen.queryByTestId("card-midnight-delivery")).toBeNull();
    expect(screen.getByTestId("delivery-date-row")).toBeTruthy();
    expect(screen.getByTestId("card-express-upgrade")).toBeTruthy();
    expect(screen.getByTestId("text-sticky-delivery-label").textContent).toContain(
      "cart.sticky.standardToday",
    );
    expect(screen.queryByTestId("text-midnight-fee")).toBeNull();
  });
});
