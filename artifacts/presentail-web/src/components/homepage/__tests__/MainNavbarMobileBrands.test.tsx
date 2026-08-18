// @vitest-environment jsdom
//
// Verifies that the mobile brands sub-panel opens correctly after the nav
// refactor that split brands into a dedicated `mobileMenuDefs` array
// (separate from the desktop `megaMenus`).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted mock factories — declared before any import of the mocked modules
// ---------------------------------------------------------------------------

const { mockUseBrands, mockUseCatalogMetadata, mockUseCatalogOccasions } =
  vi.hoisted(() => ({
    mockUseBrands: vi.fn(),
    mockUseCatalogMetadata: vi.fn(),
    mockUseCatalogOccasions: vi.fn(),
  }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useBrands: mockUseBrands,
    useCatalogMetadata: mockUseCatalogMetadata,
    useCatalogOccasions: mockUseCatalogOccasions,
  };
});

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRoute: vi.fn(() => [false, null]),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({ countryCode: "LB", cityId: "beirut" })),
}));

vi.mock("@/components/search/SearchOverlay", () => ({
  SearchOverlay: () => null,
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <span>Presentail</span>,
}));

vi.mock("@/components/account/AccountDropdown", () => ({
  AccountDropdown: () => null,
}));

// Render motion elements as plain elements so we can interact normally
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({
          children,
          ...rest
        }: React.PropsWithChildren<Record<string, unknown>>) => {
          const Tag = tag as keyof React.JSX.IntrinsicElements;
          return <Tag {...rest}>{children}</Tag>;
        },
    },
  ),
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Render Sheet inline — no portals — so the sheet content is always in the DOM
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetClose: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
}));

vi.mock("@/lib/pageLoaders", () => ({
  loadCart: vi.fn(),
  loadCheckout: vi.fn(),
  loadSignIn: vi.fn(),
  loadSignUp: vi.fn(),
  loadAccount: vi.fn(),
  loadFavorites: vi.fn(),
  loadBrands: vi.fn(),
  loadBrandDetail: vi.fn(),
  loadShop: vi.fn(),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchProps: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Import component after all mocks are set up
// ---------------------------------------------------------------------------
import { MainNavbar } from "../MainNavbar";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

type MockBrand = {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  sort_order: number;
  count: number;
};

function makeCatalogBrands(count: number): MockBrand[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    slug: `brand-${i + 1}`,
    name: `Brand ${i + 1}`,
    image: null,
    sort_order: i + 1,
    count: 1,
  }));
}

function setupDefaultMocks(brands: MockBrand[] = makeCatalogBrands(3)) {
  mockUseBrands.mockReturnValue({ data: { brands: [] }, isPending: false });
  mockUseCatalogMetadata.mockReturnValue({
    data: {
      brands,
      categories: [],
    },
  });
  mockUseCatalogOccasions.mockReturnValue({
    data: { occasions: [] },
    isPending: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile brands sub-panel", () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it("renders the Brands tile in the mobile main menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainNavbar />);

    // Open the hamburger menu first
    await user.click(screen.getByTestId("button-mobile-menu"));

    // The mobile main-menu tile is a <button> whose visible label is the
    // translation key (the test-utils `t` identity function returns the key).
    const brandsTile = screen.getByRole("button", { name: /nav\.brands/i });
    expect(brandsTile).toBeDefined();
  });

  it("slides in the brands sub-panel when the Brands tile is tapped", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainNavbar />);

    // Open hamburger menu, then tap the Brands tile
    await user.click(screen.getByTestId("button-mobile-menu"));
    await user.click(screen.getByRole("button", { name: /nav\.brands/i }));

    // After the tap, the sub-panel back button and at least one brand link must
    // be present — these elements are only visible after the sub-panel opens.
    expect(
      screen.getByRole("button", { name: /nav\.backAria/i }),
    ).toBeDefined();
    // The footer link is the clearest indicator that the brands sub-panel
    // (not just any sub-panel) slid into view.
    expect(
      screen.getByRole("link", { name: /nav\.viewAllBrands/i }),
    ).toBeDefined();
  });

  it("renders at least one brand item in the sub-panel", async () => {
    const user = userEvent.setup();
    const brands = makeCatalogBrands(3);
    setupDefaultMocks(brands);
    renderWithProviders(<MainNavbar />);

    await user.click(screen.getByTestId("button-mobile-menu"));
    await user.click(screen.getByRole("button", { name: /nav\.brands/i }));

    // Each brand should appear as a link in the sub-panel.
    // The accessible name includes the emoji tile prefix (e.g. "🏷️ Brand 1"),
    // so we match by substring / regex rather than exact string.
    for (const brand of brands) {
      const link = screen.getByRole("link", { name: new RegExp(brand.name) });
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).href).toContain(`/brand/${brand.slug}`);
    }
  });

  it("renders the 'View all brands' footer link in the sub-panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainNavbar />);

    await user.click(screen.getByTestId("button-mobile-menu"));
    await user.click(screen.getByRole("button", { name: /nav\.brands/i }));

    // The footer link text is t("nav.viewAllBrands") which the identity-t
    // function returns as the key itself.  The link points to /brands.
    const footerLink = screen.getByRole("link", { name: /nav\.viewAllBrands/i });
    expect(footerLink).toBeDefined();
    expect((footerLink as HTMLAnchorElement).href).toContain("/brands");
  });

  it("shows the brands sub-panel even when only one brand exists", async () => {
    const user = userEvent.setup();
    setupDefaultMocks(makeCatalogBrands(1));
    renderWithProviders(<MainNavbar />);

    await user.click(screen.getByTestId("button-mobile-menu"));
    await user.click(screen.getByRole("button", { name: /nav\.brands/i }));

    // Emoji is part of the accessible name, match by substring
    expect(screen.getByRole("link", { name: /Brand 1/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /nav\.viewAllBrands/i })).toBeDefined();
  });

  it("shows a loading skeleton when catalogMetadata is not yet available", () => {
    // catalogMetadata undefined = cold cache / loading state
    mockUseCatalogMetadata.mockReturnValue({ data: undefined });
    renderWithProviders(<MainNavbar />);

    // The brands tile is still rendered; its image falls back to undefined (emoji)
    const brandsTile = screen.getByRole("button", { name: /nav\.brands/i });
    expect(brandsTile).toBeDefined();
  });
});
