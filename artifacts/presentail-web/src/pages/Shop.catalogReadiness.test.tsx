// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";

const {
  mockUseProducts,
  mockUseCategoryProducts,
  mockUseOccasionProducts,
  mockUseBrandProducts,
  mockUseLocationSelection,
} = vi.hoisted(() => ({
  mockUseProducts: vi.fn(),
  mockUseCategoryProducts: vi.fn(),
  mockUseOccasionProducts: vi.fn(),
  mockUseBrandProducts: vi.fn(),
  mockUseLocationSelection: vi.fn(),
}));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return { ...actual, useLocationSelection: mockUseLocationSelection };
});

vi.mock("wouter", () => ({
  useSearch: vi.fn(() => ""),
  useLocation: vi.fn(() => ["/occasion/summer", vi.fn()]),
  useParams: vi.fn(() => ({ slug: "summer" })),
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProducts: mockUseProducts,
    useCategoryProducts: mockUseCategoryProducts,
    useOccasionProducts: mockUseOccasionProducts,
    useBrandProducts: mockUseBrandProducts,
    useCatalogMetadata: vi.fn(() => ({
      data: { categories: [], occasions: [{ id: "summer", name: "Summer" }] },
    })),
    useCurrenciesData: vi.fn(() => ({ data: null })),
    useFxRates: vi.fn(() => ({ data: null })),
    useCatalogOccasions: vi.fn(() => ({ data: null })),
    usePageDescription: vi.fn(() => ({ data: null, isError: false })),
  };
});

vi.mock("@/lib/colorExtractor", () => ({
  extractColor: vi.fn(() => null),
  useProductColorHints: vi.fn(() => ({})),
}));

vi.mock("@/components/ProductCard", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => (
    <div data-testid="product-card">{product.name}</div>
  ),
}));
vi.mock("@/components/PageBreadcrumb", () => ({ PageBreadcrumb: () => null }));
vi.mock("@/components/ShopFilters", () => ({ ShopFilters: () => null }));

import Shop from "./Shop";

const SUMMER_PRODUCT = {
  id: "summer-bouquet",
  wcId: 1,
  name: "Summer Bouquet",
  price: "$45",
  priceValue: 45,
  image: { uri: "https://example.com/summer.jpg" },
  category: "flowers",
  categories: ["flowers"],
  inStock: true,
  occasions: ["summer"],
};

const READY_EMPTY = { data: { ok: true, products: [], count: 0 }, isLoading: false };

function locationFixture() {
  const city = { id: "lb-beirut", name: "Beirut", fee: 5, isExpress: false };
  return {
    countryCode: "LB",
    cityId: "lb-beirut",
    country: { code: "LB", name: "Lebanon", cities: [city] },
    city,
    countries: [],
    isLoadingCountries: false,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
    isPickerOpen: false,
    pickerForceCountryStep: false,
    openPicker: vi.fn(),
    closePicker: vi.fn(),
  };
}

describe("Shop catalog readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocationSelection.mockReturnValue(locationFixture());
    mockUseProducts.mockReturnValue({ data: { ok: true, products: [SUMMER_PRODUCT] }, isLoading: false });
    mockUseCategoryProducts.mockReturnValue(READY_EMPTY);
    mockUseBrandProducts.mockReturnValue({ ...READY_EMPTY, data: { ...READY_EMPTY.data, brandName: "" } });
  });

  it("keeps the loading state visible while the catalog query is retrying", () => {
    mockUseOccasionProducts.mockReturnValue({ data: undefined, isLoading: true });

    const { queryByTestId } = renderWithProviders(<Shop />);

    expect(queryByTestId("empty-state-sold-out")).toBeNull();
  });

  it("renders Summer products once the ready catalog response arrives", () => {
    mockUseOccasionProducts.mockReturnValue({
      data: {
        ok: true,
        groups: [{ slug: "flowers", label: "Flowers", count: 1, products: [SUMMER_PRODUCT] }],
        total: 1,
      },
      isLoading: false,
    });

    const { getByTestId, queryByTestId } = renderWithProviders(<Shop />);

    expect(getByTestId("product-card").textContent).toContain("Summer Bouquet");
    expect(queryByTestId("empty-state-sold-out")).toBeNull();
  });

  it("renders the normal sold-out state for a ready, genuinely empty Summer collection", () => {
    mockUseOccasionProducts.mockReturnValue({
      data: { ok: true, groups: [], total: 0 },
      isLoading: false,
    });

    const { getByTestId } = renderWithProviders(<Shop />);

    expect(getByTestId("empty-state-sold-out")).not.toBeNull();
  });
});