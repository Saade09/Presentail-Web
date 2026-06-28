// @vitest-environment jsdom
//
// Guards against the city-switch title flash on the BrandDetail page.
// The SEO useEffect has a guard that skips writing document.title / meta tags
// when cityId is set but city hasn't resolved yet (post-city-switch transition).
// Without the guard, switching cities briefly resets meta tags to the
// "no-city" variant while the delivery-locations query is still re-fetching.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables shared between the hoisted vi.mock() factories and
// the test body. Regular `const` declarations are not yet initialised when
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

vi.mock("wouter", () => ({
  useRoute: vi.fn(() => [true, { slug: "bloomThis" }]),
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("@/lib/queries", () => ({
  useBrands: vi.fn(() => ({
    data: {
      brands: [{ slug: "bloomThis", name: "Bloom This", image: null, description: "" }],
    },
    isLoading: false,
  })),
  useBrandProducts: vi.fn(() => ({
    data: { products: [], brandName: "Bloom This" },
    isLoading: false,
  })),
}));

vi.mock("@/components/ProductCard", () => ({ ProductCard: () => null }));
vi.mock("@/components/PageBreadcrumb", () => ({ PageBreadcrumb: () => null }));

// Component under test — imported after mocks so they take effect.
import BrandDetail from "./BrandDetail";

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

/** Returns the content of the first matching SEO-managed meta tag. */
function getMetaContent(attr: string, value: string): string | null {
  const el = document.querySelector<HTMLMetaElement>(
    `meta[${attr}="${value}"][data-seo-managed]`,
  );
  return el?.getAttribute("content") ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BrandDetail — city-switch SEO title flash guard", () => {
  beforeEach(() => {
    document.title = "";
    document
      .querySelectorAll("[data-seo-managed]")
      .forEach((el) => el.parentElement?.removeChild(el));
    vi.clearAllMocks();
  });

  it("sets document.title once brand resolves — no double spaces", async () => {
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    await act(async () => {
      renderWithProviders(<BrandDetail />);
    });

    expect(document.title).toBe("Bloom This | Presentail");
    expect(document.title).not.toMatch(/  /);
  });

  it("does NOT update document.title during city-switch transition (cityId set, city null)", async () => {
    // Phase 1: Beirut fully resolved → title and description written with city.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    let utils!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      utils = renderWithProviders(<BrandDetail />);
    });

    const titleAfterBeirut = document.title;
    const descAfterBeirut = getMetaContent("name", "description");
    // Description must mention Beirut (city is in description template).
    expect(descAfterBeirut).toContain("Beirut");

    // Phase 2: User switches to Dubai — delivery-locations hasn't re-fetched yet.
    // city and country are null — the guard must prevent WRITING a new (blank-city)
    // document.title. The SEO effect cleanup removes the old meta tags, but the
    // title must remain unchanged (cleanup only removes <meta> nodes, not title).
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );

    await act(async () => {
      utils.rerender(<BrandDetail />);
    });

    // document.title must NOT have changed — guard blocked the title update.
    expect(document.title).toBe(titleAfterBeirut);
    // Must never contain two consecutive spaces (blank-city artefact).
    expect(document.title).not.toMatch(/  /);
  });

  it("updates description correctly once the new city resolves", async () => {
    // Phase 1: Beirut resolved.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "LB", cityId: "lb-beirut", city: BEIRUT_CITY, country: BEIRUT_COUNTRY }),
    );

    let utils!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      utils = renderWithProviders(<BrandDetail />);
    });

    expect(getMetaContent("name", "description")).toContain("Beirut");

    // Phase 2: Transition — guard keeps Beirut description.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: null, country: null }),
    );
    await act(async () => {
      utils.rerender(<BrandDetail />);
    });

    // Phase 3: Dubai fully resolved → description must update.
    mockUseLocationSelection.mockReturnValue(
      makeLoc({ countryCode: "AE", cityId: "ae-dubai", city: DUBAI_CITY, country: DUBAI_COUNTRY }),
    );
    await act(async () => {
      utils.rerender(<BrandDetail />);
    });

    const descAfterDubai = getMetaContent("name", "description");
    expect(descAfterDubai).toContain("Dubai");
    expect(descAfterDubai).not.toMatch(/  /);
    expect(document.title).toBe("Bloom This | Presentail");
    expect(document.title).not.toMatch(/  /);
  });
});
