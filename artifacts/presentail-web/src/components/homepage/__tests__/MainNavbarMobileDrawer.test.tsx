// @vitest-environment jsdom
//
// Verifies the improved mobile shopping menu per task #4913.
// Covers: exact row hierarchy, descriptions, utility separation, neutral Brands
// treatment, excluded controls, auth-conditional account destination, Contact Us
// WhatsApp destination, Shop All market-aware href, full-row interactions, and
// sub-panel link preservation.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const {
  mockUseBrands,
  mockUseCatalogMetadata,
  mockUseCatalogOccasions,
  mockUseLocationSelection,
} = vi.hoisted(() => ({
  mockUseBrands: vi.fn(),
  mockUseCatalogMetadata: vi.fn(),
  mockUseCatalogOccasions: vi.fn(),
  mockUseLocationSelection: vi.fn(),
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
  useLocation: vi.fn(() => ["/", vi.fn()]),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: mockUseLocationSelection,
}));

vi.mock("@/components/search/SearchOverlay", () => ({
  SearchOverlay: () => null,
}));

vi.mock("@/components/search/LazySearchOverlay", () => ({
  LazySearchOverlay: () => null,
}));

vi.mock("@/components/Logo", () => ({
  Logo: ({ className }: { className?: string }) => (
    <span className={className}>Presentail</span>
  ),
}));

vi.mock("@/components/account/AccountDropdown", () => ({
  AccountDropdown: () => null,
}));

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
  loadShop: vi.fn().mockResolvedValue(undefined),
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

function setupDefaultMocks() {
  mockUseLocationSelection.mockReturnValue({ countryCode: "LB", cityId: "lb-beirut" });
  mockUseBrands.mockReturnValue({ data: { brands: [] }, isPending: false });
  mockUseCatalogMetadata.mockReturnValue({
    data: {
      brands: [
        { id: 1, slug: "brand-a", name: "Brand A", image: null, sort_order: 1, count: 5 },
      ],
      categories: [],
    },
  });
  mockUseCatalogOccasions.mockReturnValue({
    data: { occasions: [] },
    isPending: false,
  });
}

const EXPECTED_SHOPPING_ROW_KEYS = [
  "occasions",
  "flowers",
  "balloons",
  "gifts",
  "brands",
  "shop-all",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders MainNavbar with the given provider overrides and opens the mobile
 * hamburger drawer. Returns the userEvent instance for follow-up interactions.
 */
async function renderAndOpen(
  overrides: Parameters<typeof renderWithProviders>[1] = {},
) {
  renderWithProviders(<MainNavbar />, overrides);
  const user = userEvent.setup();
  await user.click(screen.getByTestId("button-mobile-menu"));
  return user;
}

function getSheet() {
  return screen.getByTestId("sheet-content");
}

// ---------------------------------------------------------------------------
// Tests: exact row hierarchy
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: exact shopping row hierarchy", () => {
  beforeEach(setupDefaultMocks);

  it("renders all six approved shopping rows in order", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    for (const key of EXPECTED_SHOPPING_ROW_KEYS) {
      expect(
        within(sheet).getByTestId(`mobile-shopping-row-${key}`),
        `missing row: ${key}`,
      ).toBeDefined();
    }
  });

  it("presents rows in the approved order: Occasions → Flowers → Balloons → Gifts → Brands → Shop All", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const rows = EXPECTED_SHOPPING_ROW_KEYS.map((key) =>
      within(sheet).getByTestId(`mobile-shopping-row-${key}`),
    );

    // Verify DOM order via compareDocumentPosition
    for (let i = 0; i < rows.length - 1; i++) {
      const pos = rows[i].compareDocumentPosition(rows[i + 1]);
      // DOCUMENT_POSITION_FOLLOWING = 4
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING, `row ${i} must precede row ${i + 1}`).toBeGreaterThan(0);
    }
  });

  it("each shopping row has a label and a one-line description (two text nodes)", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const panelKeys = ["occasions", "flowers", "balloons", "gifts", "brands"] as const;
    for (const key of panelKeys) {
      const row = within(sheet).getByTestId(`mobile-shopping-row-${key}`);
      // Each row renders two <div>s for label + description inside the text container
      expect(
        row.querySelectorAll("div").length,
        `row ${key} should have multiple div descendants for label + description`,
      ).toBeGreaterThan(1);
    }
  });

  it("each shopping row has at least one SVG (chevron)", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    for (const key of EXPECTED_SHOPPING_ROW_KEYS) {
      const row = within(sheet).getByTestId(`mobile-shopping-row-${key}`);
      expect(row.querySelector("svg"), `row ${key} has no svg`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: circular artwork consistent sizing
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: circular artwork", () => {
  beforeEach(setupDefaultMocks);

  it("each shopping row icon container is a rounded-full w-12 circle", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    for (const key of EXPECTED_SHOPPING_ROW_KEYS) {
      const row = within(sheet).getByTestId(`mobile-shopping-row-${key}`);
      const iconContainer = row.querySelector("[class*='rounded-full'][class*='w-12']");
      expect(iconContainer, `row ${key} missing circular icon container`).not.toBeNull();
    }
  });

  it("Brands row renders an SVG icon rather than a brand-specific <img>", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const brandsRow = within(sheet).getByTestId("mobile-shopping-row-brands");
    // Must not use the first brand's image (brand-specific Apple-like approach)
    expect(brandsRow.querySelector("img")).toBeNull();
    // Must use a neutral icon SVG
    expect(brandsRow.querySelector("svg")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Shop All row
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: Shop All row", () => {
  beforeEach(setupDefaultMocks);

  it("Shop All row is a link pointing to the market-aware /shop destination", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const shopAllRow = within(sheet).getByTestId("mobile-shopping-row-shop-all");
    const anchor =
      shopAllRow.tagName === "A"
        ? (shopAllRow as HTMLAnchorElement)
        : shopAllRow.querySelector("a");
    expect(anchor, "shop-all row should be or contain an <a>").not.toBeNull();
    const href = anchor!.getAttribute("href") ?? (anchor as HTMLAnchorElement).href;
    expect(href).toContain("/shop");
  });

  it("Shop All does not open a sub-panel (main view stays on screen)", async () => {
    await renderAndOpen();

    // The main-menu view has a CSS translate that indicates it is visible.
    // When a sub-panel is active the main view gets -translate-x-full.
    // The main-menu div is the sibling before the sub-panel div.
    const sheetContent = getSheet();
    // The first absolutely-positioned child is the main menu
    const mainMenuView = sheetContent.querySelector<HTMLElement>(
      "[class*='translate-x-0']:not([class*='translate-x-full'])",
    );
    // Main menu view exists and is not translated away
    expect(mainMenuView).not.toBeNull();

    // The Shop All row is a link — clicking a link won't invoke setMobileSubPanel
    const shopAllRow = within(sheetContent).getByTestId("mobile-shopping-row-shop-all");
    expect(shopAllRow.tagName.toLowerCase()).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// Tests: secondary utility section
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: utility section", () => {
  beforeEach(setupDefaultMocks);

  it("renders My Account and Contact Us utilities", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    expect(within(sheet).getByTestId("mobile-utility-account")).toBeDefined();
    expect(within(sheet).getByTestId("mobile-utility-contact")).toBeDefined();
  });

  it("utility section appears below all six shopping rows in the DOM", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const lastShoppingRow = within(sheet).getByTestId("mobile-shopping-row-shop-all");
    const accountUtility = within(sheet).getByTestId("mobile-utility-account");

    const pos = lastShoppingRow.compareDocumentPosition(accountUtility);
    // DOCUMENT_POSITION_FOLLOWING = 4
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
  });

  it("utility section is visually separated by a border-t divider", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const accountEl = within(sheet).getByTestId("mobile-utility-account");
    const utilityWrapper = accountEl.closest("[class*='border-t']");
    expect(utilityWrapper, "utility section has no border-t divider parent").not.toBeNull();
  });

  it("unauthenticated: My Account row links to /sign-in", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const accountEl = within(sheet).getByTestId("mobile-utility-account");
    const anchor =
      accountEl.tagName === "A"
        ? (accountEl as HTMLAnchorElement)
        : accountEl.querySelector("a");
    expect(anchor).not.toBeNull();
    const href = anchor!.getAttribute("href") ?? (anchor as HTMLAnchorElement).href;
    expect(href).toContain("/sign-in");
  });

  it("authenticated: My Account row links to /account", async () => {
    await renderAndOpen({
      auth: {
        user: {
          id: "42",
          email: "shopper@example.com",
          firstName: "Sam",
          lastName: "Test",
        },
      },
    });
    const sheet = getSheet();

    const accountEl = within(sheet).getByTestId("mobile-utility-account");
    const anchor =
      accountEl.tagName === "A"
        ? (accountEl as HTMLAnchorElement)
        : accountEl.querySelector("a");
    expect(anchor).not.toBeNull();
    const href = anchor!.getAttribute("href") ?? (anchor as HTMLAnchorElement).href;
    expect(href).toContain("/account");
    // Must NOT link to /sign-in when authenticated
    expect(href).not.toContain("/sign-in");
  });

  it("Contact Us row links to the canonical Presentail WhatsApp URL", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const contactEl = within(sheet).getByTestId("mobile-utility-contact");
    const anchor =
      contactEl.tagName === "A"
        ? (contactEl as HTMLAnchorElement)
        : contactEl.querySelector("a");
    expect(anchor).not.toBeNull();
    const href = anchor!.getAttribute("href") ?? (anchor as HTMLAnchorElement).href;
    expect(href).toContain("wa.me/9613136532");
  });

  it("Contact Us link opens in a new tab", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    const contactEl = within(sheet).getByTestId("mobile-utility-contact");
    const anchor =
      contactEl.tagName === "A"
        ? (contactEl as HTMLAnchorElement)
        : contactEl.querySelector("a");
    expect((anchor as HTMLAnchorElement).target).toBe("_blank");
  });
});

// ---------------------------------------------------------------------------
// Tests: excluded controls
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: excluded controls", () => {
  beforeEach(setupDefaultMocks);

  it("contains no Track Order entry", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    expect(within(sheet).queryByText(/track order/i)).toBeNull();
    // The word "track" alone is unlikely in shopping context but also absent
    const trackNodes = within(sheet).queryAllByText(/\btrack\b/i);
    expect(trackNodes).toHaveLength(0);
  });

  it("contains no search input field inside the drawer", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    expect(
      sheet.querySelector("input[type='search'], input[type='text']"),
    ).toBeNull();
  });

  it("contains no language/currency/country selector in the drawer", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    // Language toggle labels (English, العربية, Français, Ελληνικά) must not appear
    expect(within(sheet).queryByText(/english|العربية|français|ελληνικά/i)).toBeNull();
  });

  it("contains no promotional banner element in the drawer", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    expect(sheet.querySelector('[role="banner"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: panel rows open sub-panels (regression: existing behavior preserved)
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: sub-panel preservation", () => {
  beforeEach(setupDefaultMocks);

  it("tapping Occasions row opens the occasions sub-panel", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-occasions"));
    expect(screen.getByTestId("mobile-sub-panel-occasions")).toBeDefined();
  });

  it("tapping Flowers row opens the flowers sub-panel", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-flowers"));
    expect(screen.getByTestId("mobile-sub-panel-flowers")).toBeDefined();
  });

  it("tapping Balloons row opens the balloons sub-panel", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-balloons"));
    expect(screen.getByTestId("mobile-sub-panel-balloons")).toBeDefined();
  });

  it("tapping Gifts row opens the gifts sub-panel", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-gifts"));
    expect(screen.getByTestId("mobile-sub-panel-gifts")).toBeDefined();
  });

  it("tapping Brands row opens the brands sub-panel", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-brands"));

    expect(screen.getByRole("button", { name: /nav\.backAria/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /nav\.viewAllBrands/i })).toBeDefined();
  });

  it("back button in sub-panel returns to the shopping rows", async () => {
    const user = await renderAndOpen();
    await user.click(within(getSheet()).getByTestId("mobile-shopping-row-brands"));
    expect(screen.getByRole("button", { name: /nav\.backAria/i })).toBeDefined();

    await user.click(screen.getByRole("button", { name: /nav\.backAria/i }));

    // Shopping rows must be visible again after going back
    expect(within(getSheet()).getByTestId("mobile-shopping-row-occasions")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: full-row touch targets
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: full-row touch targets", () => {
  beforeEach(setupDefaultMocks);

  it("each shopping row is a <button> or <a>, not a non-interactive <div>", async () => {
    await renderAndOpen();
    const sheet = getSheet();

    for (const key of EXPECTED_SHOPPING_ROW_KEYS) {
      const row = within(sheet).getByTestId(`mobile-shopping-row-${key}`);
      const tag = row.tagName.toLowerCase();
      expect(
        ["button", "a"].includes(tag),
        `row "${key}" renders as <${tag}> — expected <button> or <a>`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: RTL locale
// ---------------------------------------------------------------------------

describe("MainNavbar — mobile drawer: RTL layout", () => {
  beforeEach(setupDefaultMocks);

  it("renders all six shopping rows without error in RTL locale", async () => {
    await renderAndOpen({ locale: { language: "ar", dir: "rtl" } });
    const sheet = getSheet();

    for (const key of EXPECTED_SHOPPING_ROW_KEYS) {
      expect(
        within(sheet).getByTestId(`mobile-shopping-row-${key}`),
        `RTL: missing row ${key}`,
      ).toBeDefined();
    }
  });

  it("renders utility rows without error in RTL locale", async () => {
    await renderAndOpen({ locale: { language: "ar", dir: "rtl" } });
    const sheet = getSheet();

    expect(within(sheet).getByTestId("mobile-utility-account")).toBeDefined();
    expect(within(sheet).getByTestId("mobile-utility-contact")).toBeDefined();
  });
});
