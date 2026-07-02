// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that transitively load the
// mocked modules so Vitest's hoisting picks them up first.
// ---------------------------------------------------------------------------

const { mockUseBrands } = vi.hoisted(() => ({
  mockUseBrands: vi.fn(),
}));

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return { ...actual, useBrands: mockUseBrands };
});

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: vi.fn(() => ({ countryCode: "LB", cityId: "beirut" })),
}));

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
}));

vi.mock("@/components/ShimmerImage", () => ({
  ShimmerImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { TrustpilotBrandsRow } from "../TrustpilotBrandsRow";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockBrand = {
  id: number;
  slug: string;
  name: string;
  image?: string | null;
};

function makeBrands(count: number, withImage = true): MockBrand[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    slug: `brand-${i + 1}`,
    name: `Brand ${i + 1}`,
    image: withImage ? `https://example.com/brand-${i + 1}.jpg` : null,
  }));
}

function renderLoading() {
  mockUseBrands.mockReturnValue({ data: undefined, isLoading: true });
  return renderWithProviders(<TrustpilotBrandsRow />);
}

function renderLoaded(brands: MockBrand[]) {
  mockUseBrands.mockReturnValue({ data: { brands }, isLoading: false });
  return renderWithProviders(<TrustpilotBrandsRow />);
}

// ---------------------------------------------------------------------------
// Snapshot — loading state
//
// Locks down the two-part skeleton structure (logo square + text bar per
// tile). Any regression that collapses the skeleton back to a single square
// or removes the text bar will produce a snapshot diff.
// ---------------------------------------------------------------------------

describe("TrustpilotBrandsRow — snapshot (loading state)", () => {
  it("matches the loading skeleton snapshot", () => {
    const { container } = renderLoading();
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Snapshot — loaded state with name labels
//
// Locks down the brand tile structure: link, image, and name span. Any
// regression that removes the name label, changes the span class, or alters
// tile count will produce a snapshot diff.
// ---------------------------------------------------------------------------

describe("TrustpilotBrandsRow — snapshot (loaded state)", () => {
  it("matches the loaded brands snapshot (with images)", () => {
    const { container } = renderLoaded(makeBrands(3, true));
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches the loaded brands snapshot (text fallback, no images)", () => {
    const { container } = renderLoaded(makeBrands(2, false));
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Loading state — skeleton structure (explicit assertions)
// ---------------------------------------------------------------------------

describe("TrustpilotBrandsRow — loading state (skeleton)", () => {
  it("renders 8 skeleton tiles while data is loading", () => {
    renderLoading();
    const pulseEls = document.querySelectorAll(".animate-pulse");
    // Each skeleton tile has 2 pulse elements (logo square + text bar)
    expect(pulseEls.length).toBe(16);
  });

  it("renders a logo-square skeleton (w-24 h-24) and a text-bar skeleton per tile", () => {
    renderLoading();
    const logoSquares = document.querySelectorAll(".w-24.h-24.rounded-xl.animate-pulse");
    const textBars = document.querySelectorAll(".h-3.w-16.rounded.animate-pulse");
    expect(logoSquares.length).toBe(8);
    expect(textBars.length).toBe(8);
  });

  it("does not render any brand links while loading", () => {
    renderLoading();
    expect(document.querySelectorAll("a").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Loaded state — name labels (explicit assertions)
// ---------------------------------------------------------------------------

describe("TrustpilotBrandsRow — loaded state (name labels)", () => {
  it("renders a visible name label for every brand tile", () => {
    const brands = makeBrands(4);
    renderLoaded(brands);
    for (const brand of brands) {
      const nameEls = screen.getAllByText(brand.name);
      expect(nameEls.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("each brand link has a data-testid containing the brand slug", () => {
    const brands = makeBrands(3);
    renderLoaded(brands);
    for (const brand of brands) {
      const el = document.querySelector(`[data-testid="trustpilot-brand-${brand.slug}"]`);
      expect(el).not.toBeNull();
    }
  });

  it("name label is a <span> inside the brand link", () => {
    renderLoaded(makeBrands(2));
    const links = document.querySelectorAll("a[data-testid^='trustpilot-brand-']");
    for (const link of links) {
      const nameSpan = link.querySelector("span.text-xs.text-muted-foreground");
      expect(nameSpan).not.toBeNull();
      expect(nameSpan!.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("caps displayed brands at 8 even when more are returned", () => {
    renderLoaded(makeBrands(12));
    const links = document.querySelectorAll("a[data-testid^='trustpilot-brand-']");
    expect(links.length).toBe(8);
  });

  it("renders an image element for brands that have an image URL", () => {
    renderLoaded(makeBrands(2, true));
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
  });

  it("renders a text fallback (no <img>) for brands without an image", () => {
    renderLoaded(makeBrands(2, false));
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Empty / no-data state
// ---------------------------------------------------------------------------

describe("TrustpilotBrandsRow — empty state", () => {
  it("renders nothing when brands list is empty and not loading", () => {
    renderLoaded([]);
    expect(document.body.querySelector(".flex.items-center.justify-center")).toBeNull();
  });
});
