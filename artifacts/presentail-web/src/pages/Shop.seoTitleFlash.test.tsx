// @vitest-environment jsdom
//
// Guards against the city-switch title flash on the Shop page
// (category route). The SEO useEffect has a guard that skips writing
// document.title when cityId is set but city hasn't resolved yet
// (post-city-switch transition). Without the guard, switching cities briefly
// shows a "no-city" title while the delivery-locations query re-fetches.

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

// Simulate /category/hand-bouquets so isCategoryRoute=true and entityName resolves.
vi.mock("wouter", () => ({
  useSearch: vi.fn(() => ""),
  useLocation: vi.fn(() => ["/category/hand-bouquets", vi.fn()]),
  useParams: vi.fn(() => ({ slug: "hand-bouquets" })),
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProducts: vi.fn(() => ({ data: { products: [] }, isLoading: false })),
    useCategoryProducts: vi.fn(() => ({ data: { products: [] }, isLoading: false })),
    useOccasionProducts: vi.fn(() => ({ data: { products: [] }, isLoading: false })),
    useBrandProducts: vi.fn(() => ({ data: { products: [], brandName: "" }, isLoading: false })),
    useCatalogMetadata: vi.fn(() => ({
      data: { categories: [{ id: "hand-bouquets", name: "Hand Bouquets" }], occasions: [] },
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

vi.mock("@/components/ProductCard", () => ({ ProductCard: () => null }));
vi.mock("@/components/PageBreadcrumb", () => ({ PageBreadcrumb: () => null }));
vi.mock("@/components/ShopFilters", () => ({ ShopFilters: () => null }));

// Component under test — imported after mocks so they take effect.
import Shop from "./Shop";

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
// Tests — category route
// ---------------------------------------------------------------------------

describe("Shop (category route) — city-switch SEO title flash guard", () => {
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
      renderWithProviders(<Shop />);
    });

    // Title must contain "Beirut" and must not have double spaces.
    expect(document.title).toContain("Beirut");
    expect(document.title).not.toMatch(/  /);
    // Must never match the "blank city" pattern (two+ spaces before |).
    expect(document.title).not.toMatch(/ {2,}\|/);
  });

  it("does NOT update document.title during city-switch transition (cityId set, city null)", async () => {
    // Phase 1: Beirut fully resolved → title written with "Beirut".
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    let utils!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      utils = renderWithProviders(<Shop />);
    });

    const titleAfterBeirut = document.title;
    expect(titleAfterBeirut).toContain("Beirut");

    // Phase 2: User selects Dubai — delivery-locations not yet re-fetched.
    // city and country are null — the guard must prevent overwriting document.title.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );

    await act(async () => {
      utils.rerender(<Shop />);
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
      utils = renderWithProviders(<Shop />);
    });

    expect(document.title).toContain("Beirut");

    // Phase 2: Transition — guard keeps Beirut title.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );
    await act(async () => {
      utils.rerender(<Shop />);
    });

    // Phase 3: Dubai fully resolved → title must update.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: DUBAI_CITY, country: DUBAI_COUNTRY }),
    );
    await act(async () => {
      utils.rerender(<Shop />);
    });

    expect(document.title).toContain("Dubai");
    expect(document.title).not.toMatch(/  /);
    expect(document.title).not.toMatch(/ {2,}\|/);
  });
});
