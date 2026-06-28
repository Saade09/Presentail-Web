// @vitest-environment jsdom
//
// Guards against the city-switch title flash on the ProductDetail page.
// The SEO useEffect has a guard that skips writing document.title when
// cityId is set but city hasn't resolved yet (post-city-switch transition).
// Without the guard, switching cities briefly shows a "no-city" title while
// the delivery-locations query is still re-fetching.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables shared between hoisted vi.mock() factories and the
// test body. Regular `const` declarations are not yet initialised when
// vi.mock factories execute, so we use vi.hoisted() instead.
// ---------------------------------------------------------------------------

const { mockUseLocationSelection } = vi.hoisted(() => ({
  mockUseLocationSelection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — declared before component imports so Vitest can hoist them.
// ---------------------------------------------------------------------------

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: mockUseLocationSelection,
  };
});

// Route: /product/test-product
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
    data: {
      categories: [{ id: "hand-bouquets", name: "Hand Bouquets" }],
      occasions: [],
    },
  })),
  useCurrenciesData: vi.fn(() => ({ data: null, isLoading: false })),
  useFxRates: vi.fn(() => ({ data: null })),
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: vi.fn(() => ({
    selectedDate: null,
    selectedSlot: null,
    setDeliveryChoice: vi.fn(),
    isExpress: false,
  })),
}));

vi.mock("@/contexts/FavoritesContext", () => ({
  useFavorites: vi.fn(() => ({
    favorites: new Set(),
    isFavorited: vi.fn(() => false),
    toggleFavorite: vi.fn(),
    isLoaded: true,
  })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: vi.fn(() => ({
    freeDeliveryEnabled: true,
    freeDeliveryThreshold: "$90",
    expressDeliveryTimeLabel: "Arrives in 90 min",
    currency: "USD",
  })),
}));

vi.mock("@/lib/fbPixel", () => ({ trackFbEvent: vi.fn() }));

vi.mock("@/lib/useNow", () => ({
  useNow: vi.fn(() => new Date("2026-06-28T10:00:00Z")),
}));

// Heavy sub-components — replaced with lightweight stubs.
vi.mock("@/components/product/ProductGallery", () => ({ ProductGallery: () => null }));
vi.mock("@/components/product/ProductInfo", () => ({ ProductInfo: () => null }));
vi.mock("@/components/product/DeliveryOptions", () => ({ DeliveryOptions: () => null }));
vi.mock("@/components/product/ProductBenefits", () => ({ ProductBenefits: () => null }));
vi.mock("@/components/product/PaymentMethods", () => ({ PaymentMethods: () => null }));
vi.mock("@/components/product/TrustpilotMicroWidget", () => ({ TrustpilotMicroWidget: () => null }));
vi.mock("@/components/product/ProductTabs", () => ({ ProductTabs: () => null }));
vi.mock("@/components/product/ScheduleInlinePanel", () => ({ ScheduleInlinePanel: () => null }));
vi.mock("@/components/cart/AddToCartUpsellModal", () => ({ AddToCartUpsellModal: () => null }));
vi.mock("@/components/PageBreadcrumb", () => ({ PageBreadcrumb: () => null }));
vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ value }: { value: number }) => <span>{value}</span>,
}));

vi.mock("@workspace/delivery", () => ({
  dayLabels: vi.fn(() => []),
  expressSurchargeForCountry: vi.fn(() => 0),
  formatDeliveryRow: vi.fn(() => ""),
  isExpressDeliveryAvailable: vi.fn(() => false),
  slotTimeRangeForLabel: vi.fn(() => ""),
  timeSlotsForCountry: vi.fn(() => []),
}));

vi.mock("@/components/product/productViewModel", () => ({
  buildProductViewModel: vi.fn((p) => p),
}));

// Component under test — imported after mocks so they take effect.
import ProductDetail from "./ProductDetail";

// ---------------------------------------------------------------------------
// Shared location fixtures
// ---------------------------------------------------------------------------

const BEIRUT_CITY = { id: "lb-beirut", name: "Beirut", fee: 5, isExpress: false };
const BEIRUT_COUNTRY = { code: "LB", name: "Lebanon", cities: [BEIRUT_CITY] };

const DUBAI_CITY = { id: "ae-dubai", name: "Dubai", fee: 10, isExpress: false };
const DUBAI_COUNTRY = { code: "AE", name: "UAE", cities: [DUBAI_CITY] };

function makeLoc(overrides: Record<string, unknown> = {}) {
  return {
    countryCode: null,
    cityId: null,
    country: null,
    city: null,
    countries: [BEIRUT_COUNTRY, DUBAI_COUNTRY],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProductDetail — city-switch SEO title flash guard", () => {
  beforeEach(() => {
    document.title = "";
    document
      .querySelectorAll("[data-seo-managed]")
      .forEach((el) => el.parentElement?.removeChild(el));
    vi.clearAllMocks();
  });

  it("sets document.title with city when location is resolved — no double spaces", async () => {
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    await act(async () => {
      renderWithProviders(<ProductDetail />);
    });

    // Title must contain product name and city.
    expect(document.title).toContain("Test Product");
    expect(document.title).toContain("Beirut");
    // Must not contain two consecutive spaces (blank-city artefact).
    expect(document.title).not.toMatch(/  /);
    // Must not match the "in  |" blank-city pattern.
    expect(document.title).not.toMatch(/ {2,}\|/);
  });

  it("does NOT update document.title during city-switch transition (cityId set, city null)", async () => {
    // Phase 1: Beirut fully resolved → title written with "Beirut".
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    let utils!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      utils = renderWithProviders(<ProductDetail />);
    });

    const titleAfterBeirut = document.title;
    expect(titleAfterBeirut).toContain("Test Product");
    expect(titleAfterBeirut).toContain("Beirut");

    // Phase 2: User selects Dubai — delivery-locations hasn't re-fetched yet.
    // city and country are null — the guard must prevent overwriting document.title.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );

    await act(async () => {
      utils.rerender(<ProductDetail />);
    });

    // Title must NOT have changed during transition.
    expect(document.title).toBe(titleAfterBeirut);
    // Must never contain two consecutive spaces.
    expect(document.title).not.toMatch(/  /);
    expect(document.title).not.toMatch(/ {2,}\|/);
  });

  it("updates document.title correctly once the new city resolves", async () => {
    // Phase 1: Beirut resolved.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    let utils!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      utils = renderWithProviders(<ProductDetail />);
    });

    expect(document.title).toContain("Test Product");
    expect(document.title).toContain("Beirut");

    // Phase 2: Transition — guard keeps Beirut title.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );
    await act(async () => {
      utils.rerender(<ProductDetail />);
    });

    // Phase 3: Dubai fully resolved → title must update.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: DUBAI_CITY, country: DUBAI_COUNTRY }),
    );
    await act(async () => {
      utils.rerender(<ProductDetail />);
    });

    expect(document.title).toContain("Test Product");
    expect(document.title).toContain("Dubai");
    expect(document.title).not.toMatch(/  /);
    expect(document.title).not.toMatch(/ {2,}\|/);
  });
});
