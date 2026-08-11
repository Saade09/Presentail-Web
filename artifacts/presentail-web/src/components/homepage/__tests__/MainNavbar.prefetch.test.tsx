// @vitest-environment jsdom
//
// Wiring tests: verify that the intent-based prefetch loaders are attached to
// the correct nav elements in MainNavbar.  These tests render the real
// component (with heavy dependencies mocked out) and fire mouseenter / focus
// events to assert that the correct page-chunk loaders are invoked.
//
// Also covers the blog-shell routing fix: when MainNavbar is mounted inside a
// non-city-scoped shell (e.g. /en/blog), all nav links must use wouter's "~"
// absolute-path prefix so they resolve to the correct city-scoped URL
// regardless of the nested router base.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any module imports so
// Vitest's static hoisting picks them up.
// ---------------------------------------------------------------------------

const {
  mockLoadBrands,
  mockLoadBrandDetail,
  mockLoadSignIn,
  mockLoadSignUp,
  mockLoadCart,
  mockLoadCheckout,
  mockLoadAccount,
  mockLoadFavorites,
  mockLoadShop,
} = vi.hoisted(() => ({
  mockLoadBrands: vi.fn().mockResolvedValue({}),
  mockLoadBrandDetail: vi.fn().mockResolvedValue({}),
  mockLoadSignIn: vi.fn().mockResolvedValue({}),
  mockLoadSignUp: vi.fn().mockResolvedValue({}),
  mockLoadCart: vi.fn().mockResolvedValue({}),
  mockLoadCheckout: vi.fn().mockResolvedValue({}),
  mockLoadAccount: vi.fn().mockResolvedValue({}),
  mockLoadFavorites: vi.fn().mockResolvedValue({}),
  mockLoadShop: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Replace every page loader with a tracked spy so we can assert invocations.
vi.mock("@/lib/pageLoaders", () => ({
  loadBrands: mockLoadBrands,
  loadBrandDetail: mockLoadBrandDetail,
  loadSignIn: mockLoadSignIn,
  loadSignUp: mockLoadSignUp,
  loadCart: mockLoadCart,
  loadCheckout: mockLoadCheckout,
  loadAccount: mockLoadAccount,
  loadFavorites: mockLoadFavorites,
  loadShop: mockLoadShop,
  loadAllOccasions: vi.fn().mockResolvedValue({}),
  loadHomepageHeader: vi.fn().mockResolvedValue({}),
  loadFooter: vi.fn().mockResolvedValue({}),
  loadHome: vi.fn().mockResolvedValue({}),
  loadProductDetail: vi.fn().mockResolvedValue({}),
}));

// Replace `prefetchProps` with a synchronous implementation so loaders fire
// immediately on hover/focus without the module-level dedup Set getting in
// the way across tests.  The `onMouseEnter` and `onFocus` props are wired to
// the same loaders as in production — we're only removing the dedup guard.
vi.mock("@/lib/prefetch", () => ({
  prefetchProps: (...loaders: Array<() => Promise<unknown>>) => ({
    onMouseEnter: () => { for (const l of loaders) void l().catch(() => {}); },
    onFocus:      () => { for (const l of loaders) void l().catch(() => {}); },
  }),
  prefetchOnIdle: (_loaders: unknown[]) => () => {},
}));

// Context / hook dependencies.
// useLocationSelection returns a city-selected state (LB / lb-beirut) so that
// toCityHref() builds a real cityBase.  cityIdToSlug("lb-beirut") → "beirut",
// countryCodeToSlug("LB") → "lb", so cityBase = "/en-lb/beirut".
vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({
    countryCode: "LB",
    cityId: "lb-beirut",
    countries: [],
    isLoadingCountries: false,
  })),
}));

vi.mock("@/lib/queries", () => ({
  useBrands: vi.fn(() => ({ data: undefined, isPending: false })),
  useCatalogMetadata: vi.fn(() => ({ data: undefined })),
  useCatalogOccasions: vi.fn(() => ({ data: undefined, isPending: false })),
}));

// Wouter: render Link as a plain anchor; useRoute always returns "not matched".
// This lets us inspect the exact href value the component passes to Link —
// including the "~" absolute-path prefix used by the blog-shell routing fix.
vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRoute: vi.fn(() => [false, null]),
}));

// Heavy sub-components
vi.mock("@/components/search/SearchOverlay", () => ({
  SearchOverlay: () => null,
}));

vi.mock("@/components/search/LazySearchOverlay", () => ({
  LazySearchOverlay: () => null,
}));

vi.mock("@/components/account/AccountDropdown", () => ({
  AccountDropdown: () => <span data-testid="account-dropdown" />,
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <span data-testid="logo" />,
}));

// ---------------------------------------------------------------------------
// Component under test (imported after all mocks are declared)
// ---------------------------------------------------------------------------

import { MainNavbar } from "../MainNavbar";

// ---------------------------------------------------------------------------
// Shared constant: the expected city-scoped base for LB / lb-beirut / en
// ---------------------------------------------------------------------------
// countryCodeToSlug("LB") = "lb"
// cityIdToSlug("lb-beirut") = "beirut"
// buildLocalePath({ lang: "en", country: "lb", city: "beirut" }) = "/en-lb/beirut"
const CITY_BASE = "/en-lb/beirut";

// ---------------------------------------------------------------------------
// Tests: intent-based prefetch wiring
// ---------------------------------------------------------------------------

describe("MainNavbar — account/sign-in icon intent-based prefetch wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a sign-in link when the user is unauthenticated", () => {
    renderWithProviders(<MainNavbar />);
    // With the blog-shell routing fix, the sign-in link uses a wouter-absolute
    // href ("~" prefix + city base) so it works from any nested router.
    const signInLink = document.querySelector(`a[href="~${CITY_BASE}/sign-in"]`);
    expect(signInLink).not.toBeNull();
  });

  it("mouseenter on the sign-in link fires loadSignIn and loadSignUp", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector(`a[href="~${CITY_BASE}/sign-in"]`)!;
    expect(signInLink).not.toBeNull();
    fireEvent.mouseEnter(signInLink);
    expect(mockLoadSignIn).toHaveBeenCalledOnce();
    expect(mockLoadSignUp).toHaveBeenCalledOnce();
  });

  it("focus on the sign-in link fires loadSignIn and loadSignUp", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector(`a[href="~${CITY_BASE}/sign-in"]`)!;
    expect(signInLink).not.toBeNull();
    fireEvent.focus(signInLink);
    expect(mockLoadSignIn).toHaveBeenCalledOnce();
    expect(mockLoadSignUp).toHaveBeenCalledOnce();
  });

  it("mouseenter on the sign-in link does NOT fire the Brands loaders", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector(`a[href="~${CITY_BASE}/sign-in"]`)!;
    expect(signInLink).not.toBeNull();
    fireEvent.mouseEnter(signInLink);
    expect(mockLoadBrands).not.toHaveBeenCalled();
    expect(mockLoadBrandDetail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: blog-shell routing fix — nav links must use wouter-absolute hrefs
// ---------------------------------------------------------------------------
//
// When MainNavbar is rendered inside a wouter Router with base="/en" (i.e. the
// blog shell), plain hrefs like "/category/flower-boxes" would resolve to
// "/en/category/flower-boxes" — wrong.  The fix uses wouter's "~" prefix so
// the href bypasses the nested base entirely and always points to the correct
// city-scoped URL.

describe("MainNavbar — nav links use city-scoped wouter-absolute hrefs (blog-shell routing fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logo link uses city-absolute href so it works from non-city-scoped shells", () => {
    renderWithProviders(<MainNavbar />);
    // Logo should navigate to the city home page, not just "/".
    const logo = document.querySelector(`a[href="~${CITY_BASE}/"]`);
    expect(logo).not.toBeNull();
  });

  it("cart link uses city-absolute href", () => {
    renderWithProviders(<MainNavbar />);
    const cartLink = document.querySelector(`a[href="~${CITY_BASE}/cart"]`);
    expect(cartLink).not.toBeNull();
  });

  it("sign-in link uses city-absolute href", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector(`a[href="~${CITY_BASE}/sign-in"]`);
    expect(signInLink).not.toBeNull();
  });

  it("mega-menu category links use city-absolute hrefs", () => {
    renderWithProviders(<MainNavbar />);
    // Open the Flowers & Plants mega menu so the items render.
    const flowersTrigger = document.querySelector('[data-testid="nav-trigger-flowers"]');
    expect(flowersTrigger).not.toBeNull();
    fireEvent.click(flowersTrigger!);

    // Flower Boxes is the first item in the Flowers & Plants menu.
    const flowerBoxes = document.querySelector(
      `a[href="~${CITY_BASE}/category/flower-boxes"]`,
    );
    expect(flowerBoxes).not.toBeNull();
  });

  it("mega-menu footer 'All Flowers & Plants' link uses city-absolute href", () => {
    renderWithProviders(<MainNavbar />);
    const flowersTrigger = document.querySelector('[data-testid="nav-trigger-flowers"]');
    fireEvent.click(flowersTrigger!);

    const allFlowers = document.querySelector(
      `a[href="~${CITY_BASE}/category/flowers"]`,
    );
    expect(allFlowers).not.toBeNull();
  });

  it("no nav link produces a /lang/category/... double-prefix path", () => {
    renderWithProviders(<MainNavbar />);
    // Open all menus so items render.
    const triggers = document.querySelectorAll("[data-testid^='nav-trigger-']");
    triggers.forEach((t) => fireEvent.click(t));

    // Collect every anchor href in the navbar.
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const hrefs = anchors.map((a) => a.getAttribute("href") ?? "");

    // The bug produced paths like /en-lb/beirut/en/category/..., which would
    // happen if a plain href ("/en/category/...") were appended to the city
    // base by UnprefixedRedirect.  The symptom in the rendered anchor would be
    // an href that starts with "/en/" or "~/en-lb/beirut/en/" — both indicate
    // the language segment was double-stacked.
    const doublePrefixed = hrefs.filter(
      (h) =>
        /^\/en\//.test(h) ||   // bare /en/... leaks out of blog shell
        /~.*\/en\//.test(h),   // ~/{city}/en/... double-stacked
    );
    expect(doublePrefixed).toEqual([]);
  });
});
