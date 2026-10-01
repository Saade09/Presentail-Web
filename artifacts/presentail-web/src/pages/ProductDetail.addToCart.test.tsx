// @vitest-environment jsdom
//
// Guards against the "Add to Cart no-op on second item" bug: with an item
// already in the cart and a delivery selection inherited from it, the PDP
// renders the compact inherited-delivery summary — the schedule panel never
// mounts, so nothing re-commits windowCommittedRef. The old guard bailed
// silently in that state. The fix makes the guard also trust a complete,
// valid selection in DeliverySelectionContext.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted shared mocks
// ---------------------------------------------------------------------------

const { mockUseLocationSelection, mockUseDeliverySelection, mockPanelBehavior } =
  vi.hoisted(() => ({
    mockUseLocationSelection: vi.fn(),
    mockUseDeliverySelection: vi.fn(),
    // Controls the stubbed ScheduleInlinePanel: when `emitOnMount` is set the
    // stub calls onChange on mount, simulating the real panel's automatic
    // initial selection emit.
    mockPanelBehavior: { emitOnMount: null as null | {
      mode: "today_slot" | "schedule";
      date: string;
      slotLabel: string;
      slotId?: string;
    } },
  }));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return { ...actual, useLocationSelection: mockUseLocationSelection };
});

vi.mock("wouter", () => ({
  useRoute: vi.fn(() => [true, { slug: "test-product" }]),
  useLocation: vi.fn(() => ["/product/test-product", vi.fn()]),
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const MOCK_PRODUCT = {
  id: "test-product",
  name: "Test Product",
  slug: "test-product",
  price: "$50",
  priceValue: 50,
  description: "A wonderful gift",
  image: null,
  images: [],
  category: "hand-bouquets",
  categories: [],
  occasions: [],
  occasion: null,
  brand: null,
  tags: [],
  isNew: false,
  isBestseller: false,
  inStock: true,
  wcId: 123,
  osId: null,
  osSlug: null,
  osNumericId: null,
};

vi.mock("@/lib/queries", () => ({
  useProducts: vi.fn(() => ({ data: { products: [MOCK_PRODUCT] }, isLoading: false })),
  useCatalogMetadata: vi.fn(() => ({
    data: { categories: [{ id: "hand-bouquets", name: "Hand Bouquets" }], occasions: [] },
  })),
  useCurrenciesData: vi.fn(() => ({ data: null, isLoading: false })),
  useFxRates: vi.fn(() => ({ data: null })),
  useOsProductPricing: vi.fn(() => ({ data: null })),
  useProductAvailability: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: mockUseDeliverySelection,
}));

vi.mock("@/contexts/FavoritesContext", () => ({
  useFavorites: vi.fn(() => ({
    favorites: new Set(),
    isFavorited: vi.fn(() => false),
    toggleFavorite: vi.fn(),
    isLoaded: true,
  })),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: vi.fn(() => ({ toast: vi.fn() })) }));

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: vi.fn(() => ({
    freeDeliveryEnabled: true,
    freeDeliveryThreshold: "$90",
    freeDeliveryThresholdUsd: 90,
    expressDeliveryTimeLabel: "Arrives in 90 min",
    cityFeeUsd: 5,
    isLoaded: true,
    currency: "USD",
  })),
}));

vi.mock("@/lib/fbPixel", () => ({ trackFbEvent: vi.fn() }));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, { trackWebEvent: vi.fn(), trackEvent: vi.fn() });
});

vi.mock("@/lib/useNow", () => ({
  useNow: vi.fn(() => new Date("2026-06-28T10:00:00Z")),
}));

// Heavy sub-components — lightweight stubs.
vi.mock("@/components/product/ProductGallery", () => ({ ProductGallery: () => null }));
vi.mock("@/components/product/ProductInfo", () => ({ ProductInfo: () => null }));
vi.mock("@/components/product/DeliveryOptions", () => ({ DeliveryOptions: () => null }));
vi.mock("@/components/product/InheritedDeliverySummary", () => ({
  InheritedDeliverySummary: ({ onChangeDelivery }: { onChangeDelivery: () => void }) => (
    <button data-testid="inherited-summary-change" onClick={onChangeDelivery}>
      Change
    </button>
  ),
}));
vi.mock("@/components/product/ProductBenefits", () => ({ ProductBenefits: () => null }));
vi.mock("@/components/product/PaymentMethods", () => ({ PaymentMethods: () => null }));
vi.mock("@/components/product/TrustpilotMicroWidget", () => ({ TrustpilotMicroWidget: () => null }));
vi.mock("@/components/product/SecurePaymentsTrustpilotCard", () => ({ SecurePaymentsTrustpilotCard: () => null }));
vi.mock("@/components/product/ProductTabs", () => ({ ProductTabs: () => null }));
vi.mock("@/components/product/CompleteYourGift", () => ({ CompleteYourGift: () => null }));
vi.mock("@/components/cart/AddToCartUpsellModal", () => ({ AddToCartUpsellModal: () => null }));
vi.mock("@/components/PageBreadcrumb", () => ({ PageBreadcrumb: () => null }));
vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => <span>{usdValue}</span>,
}));

// Stub schedule panel: renders a marker and optionally emits onChange on
// mount (mirrors the real panel's automatic initial-selection emit).
vi.mock("@/components/product/ScheduleInlinePanel", () => ({
  ScheduleInlinePanel: ({
    onChange,
  }: {
    onChange: (args: { mode: "today_slot" | "schedule"; date: string; slotLabel: string; slotId?: string }) => void;
  }) => {
    React.useEffect(() => {
      if (mockPanelBehavior.emitOnMount) onChange(mockPanelBehavior.emitOnMount);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="schedule-panel-stub" />;
  },
}));

vi.mock("@/components/product/productViewModel", () => ({
  buildProductViewModel: vi.fn((p) => ({ ...p, galleryImages: [], inStock: true })),
}));

import ProductDetail from "./ProductDetail";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BEIRUT_CITY = { id: "lb-beirut", name: "Beirut", fee: 5, expressAvailable: true };
const BEIRUT_COUNTRY = { code: "LB", name: "Lebanon", cities: [BEIRUT_CITY] };

function makeLoc(overrides: Record<string, unknown> = {}) {
  return {
    countryCode: "LB",
    cityId: "lb-beirut",
    country: BEIRUT_COUNTRY,
    city: BEIRUT_CITY,
    countries: [BEIRUT_COUNTRY],
    isLoadingCountries: false,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
    isPickerOpen: false,
    pickerForceCountryStep: false,
    openPicker: vi.fn(),
    closePicker: vi.fn(),
    ...overrides,
  };
}

const EMPTY_SELECTION = {
  mode: null,
  date: null,
  slotLabel: null,
  slotId: null,
  source: null,
  hasSelection: false,
  setSelection: vi.fn(),
  clear: vi.fn(),
};

function makeSelection(overrides: Record<string, unknown> = {}) {
  return { ...EMPTY_SELECTION, setSelection: vi.fn(), clear: vi.fn(), ...overrides };
}

const CART_ITEM = {
  product: { ...MOCK_PRODUCT, id: "other-product", osNumericId: undefined } as never,
  quantity: 1,
};

function clickAdd() {
  fireEvent.click(screen.getByTestId("button-add-to-cart"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProductDetail — Add to Cart guard with inherited delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPanelBehavior.emitOnMount = null;
    mockUseLocationSelection.mockReturnValue(makeLoc());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("adds immediately when the cart's inherited SCHEDULED selection exists (no date change needed)", async () => {
    mockUseDeliverySelection.mockReturnValue(
      makeSelection({
        mode: "schedule",
        date: "2026-07-01",
        slotLabel: "Morning",
        slotId: "slot-1",
        source: "user_selected",
        hasSelection: true,
      }),
    );
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, {
        cart: { addItem, items: [CART_ITEM], itemCount: 1, subtotal: 50 },
      });
    });

    // Inherited summary is shown; the schedule panel is NOT mounted.
    expect(screen.queryByTestId("schedule-panel-stub")).toBeNull();

    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0][3]).toMatchObject({ deliveryMethod: "standard" });
  });

  it("adds immediately when the cart's inherited EXPRESS selection exists", async () => {
    mockUseDeliverySelection.mockReturnValue(
      makeSelection({
        mode: "express",
        date: "2026-06-28",
        source: "user_selected",
        hasSelection: true,
      }),
    );
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, {
        cart: { addItem, items: [CART_ITEM], itemCount: 1, subtotal: 50 },
      });
    });

    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(1);
    // Item joins the cart's express delivery, not the local (default) radio.
    expect(addItem.mock.calls[0][3]).toMatchObject({ deliveryMethod: "express" });
  });

  it("adding the same flow twice keeps working", async () => {
    mockUseDeliverySelection.mockReturnValue(
      makeSelection({
        mode: "today_slot",
        date: "2026-06-28",
        slotLabel: "Evening",
        source: "restored_user_selection",
        hasSelection: true,
      }),
    );
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, {
        cart: { addItem, items: [CART_ITEM], itemCount: 1, subtotal: 50 },
      });
    });
    clickAdd();
    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(2);
  });

  it("first visit with NO selection: Add does not add; it scrolls to the scheduler", async () => {
    mockUseDeliverySelection.mockReturnValue(makeSelection());
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, { cart: { addItem } });
    });

    // Schedule panel wrapper is mounted (no inherited summary).
    expect(screen.getByTestId("schedule-panel-stub")).toBeTruthy();

    clickAdd();
    expect(addItem).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("first visit: add works after the panel emits a selection (auto-pick / user pick)", async () => {
    // Panel emits its automatic initial selection on mount — the ref commits.
    mockPanelBehavior.emitOnMount = {
      mode: "today_slot",
      date: "2026-06-28",
      slotLabel: "Evening",
      slotId: "slot-9",
    };
    mockUseDeliverySelection.mockReturnValue(makeSelection());
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, { cart: { addItem } });
    });

    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  it("add works after using Change on the inherited summary and the panel re-emits", async () => {
    const selection = makeSelection({
      mode: "schedule",
      date: "2026-07-01",
      slotLabel: "Morning",
      slotId: "slot-1",
      source: "user_selected",
      hasSelection: true,
    });
    mockUseDeliverySelection.mockReturnValue(selection);
    mockPanelBehavior.emitOnMount = {
      mode: "schedule",
      date: "2026-07-02",
      slotLabel: "Afternoon",
      slotId: "slot-2",
    };
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, {
        cart: { addItem, items: [CART_ITEM], itemCount: 1, subtotal: 50 },
      });
    });

    // Open the editor (inherited summary → full selector + panel).
    await act(async () => {
      fireEvent.click(screen.getByTestId("inherited-summary-change"));
    });
    expect(screen.getByTestId("schedule-panel-stub")).toBeTruthy();
    expect(selection.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-02", slotLabel: "Afternoon" }),
    );

    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  it("add works with an inherited scheduled selection that has NO slot label (express→scheduled fallback shape)", async () => {
    // Regression: cart's inherited selection can be a scheduled mode with
    // slotLabel null (e.g. after the express→scheduled system fallback).
    // hasValidContextSelection is false in that state, but the item still
    // joins the cart's delivery — the guard must not silently block the add.
    mockUseDeliverySelection.mockReturnValue(
      makeSelection({
        mode: "today_slot",
        date: "2026-06-28",
        slotLabel: null,
        slotId: null,
        source: "system_reselected",
        hasSelection: true,
      }),
    );
    const addItem = vi.fn();
    await act(async () => {
      renderWithProviders(<ProductDetail />, {
        cart: { addItem, items: [CART_ITEM], itemCount: 1, subtotal: 50 },
      });
    });

    clickAdd();
    expect(addItem).toHaveBeenCalledTimes(1);
  });
});
