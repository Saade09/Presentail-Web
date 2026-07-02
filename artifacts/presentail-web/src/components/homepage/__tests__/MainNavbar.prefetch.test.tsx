// @vitest-environment jsdom
//
// Wiring tests: verify that the intent-based prefetch loaders are attached to
// the correct nav elements in MainNavbar.  These tests render the real
// component (with heavy dependencies mocked out) and fire mouseenter / focus
// events to assert that the correct page-chunk loaders are invoked.

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

// Context / hook dependencies
vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({ countryCode: "LB", cityId: "beirut" })),
}));

vi.mock("@/lib/queries", () => ({
  useBrands: vi.fn(() => ({ data: undefined, isPending: false })),
  useCatalogMetadata: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetCatalogOccasions: vi.fn(() => ({ data: undefined, isPending: false })),
  getGetCatalogOccasionsQueryKey: vi.fn(() => ["catalog", "occasions"]),
}));

// Wouter: render Link as a plain anchor; useRoute always returns "not matched"
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
// Tests
// ---------------------------------------------------------------------------

describe("MainNavbar — Brands link intent-based prefetch wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders [data-testid=nav-link-brands]", () => {
    renderWithProviders(<MainNavbar />);
    expect(document.querySelector('[data-testid="nav-link-brands"]')).not.toBeNull();
  });

  it("mouseenter on [data-testid=nav-link-brands] fires loadBrands and loadBrandDetail", () => {
    renderWithProviders(<MainNavbar />);
    const brandsLink = document.querySelector('[data-testid="nav-link-brands"]')!;
    fireEvent.mouseEnter(brandsLink);
    expect(mockLoadBrands).toHaveBeenCalledOnce();
    expect(mockLoadBrandDetail).toHaveBeenCalledOnce();
  });

  it("focus on [data-testid=nav-link-brands] fires loadBrands and loadBrandDetail", () => {
    renderWithProviders(<MainNavbar />);
    const brandsLink = document.querySelector('[data-testid="nav-link-brands"]')!;
    fireEvent.focus(brandsLink);
    expect(mockLoadBrands).toHaveBeenCalledOnce();
    expect(mockLoadBrandDetail).toHaveBeenCalledOnce();
  });

  it("mouseenter on the Brands link does NOT fire unrelated loaders (SignIn, SignUp)", () => {
    renderWithProviders(<MainNavbar />);
    const brandsLink = document.querySelector('[data-testid="nav-link-brands"]')!;
    fireEvent.mouseEnter(brandsLink);
    expect(mockLoadSignIn).not.toHaveBeenCalled();
    expect(mockLoadSignUp).not.toHaveBeenCalled();
  });
});

describe("MainNavbar — account/sign-in icon intent-based prefetch wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a sign-in link when the user is unauthenticated", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector('a[href="/sign-in"]');
    expect(signInLink).not.toBeNull();
  });

  it("mouseenter on the sign-in link fires loadSignIn and loadSignUp", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector('a[href="/sign-in"]')!;
    fireEvent.mouseEnter(signInLink);
    expect(mockLoadSignIn).toHaveBeenCalledOnce();
    expect(mockLoadSignUp).toHaveBeenCalledOnce();
  });

  it("focus on the sign-in link fires loadSignIn and loadSignUp", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector('a[href="/sign-in"]')!;
    fireEvent.focus(signInLink);
    expect(mockLoadSignIn).toHaveBeenCalledOnce();
    expect(mockLoadSignUp).toHaveBeenCalledOnce();
  });

  it("mouseenter on the sign-in link does NOT fire the Brands loaders", () => {
    renderWithProviders(<MainNavbar />);
    const signInLink = document.querySelector('a[href="/sign-in"]')!;
    fireEvent.mouseEnter(signInLink);
    expect(mockLoadBrands).not.toHaveBeenCalled();
    expect(mockLoadBrandDetail).not.toHaveBeenCalled();
  });
});
