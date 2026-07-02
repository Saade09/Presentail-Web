/**
 * Integration-level tests for <BrandsCarousel />.
 *
 * These tests verify the carousel's full fetch lifecycle by mocking
 * `useQuery` from @tanstack/react-query to control the three states
 * the component can be in:
 *
 *   1. Loading  — skeleton placeholders visible, no real brand names rendered
 *   2. Loaded   — one BrandTile per brand, each name present in the tree
 *   3. Error / empty — component returns null (no crash, nothing rendered)
 *
 * Covered scenarios
 * -----------------
 * BrandsCarousel — loading state
 *   - Renders a non-null tree while isLoading=true (skeleton present)
 *   - No real brand names appear in the skeleton output
 *   - Six skeleton placeholder groups are rendered (the hardcoded skeleton count)
 *
 * BrandsCarousel — loaded state
 *   - Each brand's name is visible in the tree
 *   - One Pressable tile per brand (via BrandTile)
 *   - A section heading is rendered (SectionTitle)
 *
 * BrandsCarousel — error / empty state
 *   - Returns null when isLoading=false and brands is empty
 *   - Returns null when the API responds with a malformed payload
 *   - Does not throw when brands is undefined
 *
 * Mocking strategy
 * ----------------
 * - `@tanstack/react-query`'s `useQuery` is mocked at the module level so
 *   we can drive `{ isLoading, data }` without a real network or QueryClient.
 * - `expo-router` is mocked to supply a no-op `useRouter`.
 * - `@/hooks/useT` is mocked to return translation stubs.
 * - `@/hooks/useDeliveryLocation` is mocked to return no selected location.
 * - `@/hooks/useColors`, `expo-image`, `@/components/ShimmerPlaceholder`,
 *   and `@/components/Brand` are mocked to avoid native-module dependencies.
 */

import React, { act } from "react";
import * as RTR from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { BrandsCarousel } from "@/components/BrandsCarousel";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/useT", () => ({
  useT: () => ({
    brandsEyebrow: "Our Brands",
    brandsTitleHome: "Top Brands",
  }),
}));

vi.mock("@/hooks/useDeliveryLocation", () => ({
  useDeliveryLocation: () => ({
    selectedCountry: null,
    selectedCity: null,
  }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#2b1a0e",
    border: "#e0d6cc",
    muted: "#f5f0eb",
    mutedForeground: "#9e8977",
    gold: "#b8860b",
    goldSoft: "#f0d9b5",
    background: "#ffffff",
  }),
}));

vi.mock("expo-image", () => ({
  Image: ({ source, onLoad, onError, ...rest }: Record<string, unknown>) =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "Image",
      { ...rest, src: (source as { uri?: string })?.uri, onLoad, onError },
    ),
}));

vi.mock("@/components/ShimmerPlaceholder", () => ({
  ShimmerPlaceholder: () =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "ShimmerPlaceholder",
      {},
    ),
}));

vi.mock("@/components/Brand", () => ({
  SectionTitle: ({ eyebrow, title }: { eyebrow?: string; title?: string }) =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "SectionTitle",
      { eyebrow, title },
    ),
}));

vi.mock("@/lib/stripe", () => ({
  API_BASE: "https://api.test",
}));

vi.mock("@/components/BrandTile", () => ({
  BrandTile: ({ item, onPress }: { item: { name: string; slug: string }; onPress: () => void }) =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "Pressable",
      { onPress },
      (React.createElement as (...a: unknown[]) => React.ReactElement)(
        "Text",
        {},
        item.name,
      ),
    ),
}));

vi.mock("@/hooks/useTypography", () => ({
  useTypography: () => ({
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    body: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semibold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
    display: {
      regular: "PlayfairDisplay_400Regular",
      medium: "PlayfairDisplay_500Medium",
      semibold: "PlayfairDisplay_600SemiBold",
      bold: "PlayfairDisplay_700Bold",
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
const mockUseQuery = useQuery as ReturnType<typeof vi.fn>;

function textContent(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textContent).join("");
  const n = node as { children?: unknown[] };
  if (!n.children) return "";
  return n.children.map(textContent).join("");
}

function findAllNodes(node: unknown, type: string): unknown[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((c) => findAllNodes(c, type));
  const n = node as { type?: string; children?: unknown[] };
  const here = n.type === type ? [n] : [];
  if (n.children) return [...here, ...n.children.flatMap((c) => findAllNodes(c, type))];
  return here;
}

function renderCarousel(): RTR.ReactTestRenderer {
  let renderer!: RTR.ReactTestRenderer;
  act(() => {
    renderer = RTR.create(React.createElement(BrandsCarousel));
  });
  return renderer;
}

const SAMPLE_BRANDS = [
  { id: "1", name: "Rose Salon", slug: "rose-salon", image: "https://cdn.example.com/rose.jpg" },
  { id: "2", name: "Petals & Co", slug: "petals-co", image: null },
  { id: "3", name: "Orchid House", slug: "orchid-house", image: "https://cdn.example.com/orchid.jpg" },
];

// ---------------------------------------------------------------------------
// Tests — loading state
// ---------------------------------------------------------------------------

describe("BrandsCarousel — loading state", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ isLoading: true, data: undefined });
  });

  it("renders a non-null tree while isLoading is true", () => {
    const renderer = renderCarousel();
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("renders ShimmerPlaceholder elements (skeleton) while loading", () => {
    const renderer = renderCarousel();
    const shimmers = findAllNodes(renderer.toJSON(), "ShimmerPlaceholder");
    expect(shimmers.length).toBeGreaterThan(0);
  });

  it("does not render any real brand names while loading", () => {
    const renderer = renderCarousel();
    const allText = textContent(renderer.toJSON());
    for (const brand of SAMPLE_BRANDS) {
      expect(allText).not.toContain(brand.name);
    }
  });

  it("renders exactly 6 skeleton tile groups while loading", () => {
    const renderer = renderCarousel();
    // Each skeleton tile is a View > View containing a ShimmerPlaceholder;
    // the outer row has two ShimmerPlaceholders (circle + label).
    // We count top-level shimmer containers by finding all shimmers and
    // asserting 12 total (6 tiles × 2 shimmers each).
    const shimmers = findAllNodes(renderer.toJSON(), "ShimmerPlaceholder");
    expect(shimmers).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// Tests — loaded state
// ---------------------------------------------------------------------------

describe("BrandsCarousel — loaded state", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: { brands: SAMPLE_BRANDS },
    });
  });

  it("renders each brand's name when brands are loaded", () => {
    const renderer = renderCarousel();
    const allText = textContent(renderer.toJSON());
    for (const brand of SAMPLE_BRANDS) {
      expect(allText).toContain(brand.name);
    }
  });

  it("renders one Pressable tile per brand", () => {
    const renderer = renderCarousel();
    const pressables = findAllNodes(renderer.toJSON(), "Pressable");
    expect(pressables).toHaveLength(SAMPLE_BRANDS.length);
  });

  it("renders a SectionTitle heading", () => {
    const renderer = renderCarousel();
    const headings = findAllNodes(renderer.toJSON(), "SectionTitle");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("renders no ShimmerPlaceholders when loaded", () => {
    const renderer = renderCarousel();
    const shimmers = findAllNodes(renderer.toJSON(), "ShimmerPlaceholder");
    expect(shimmers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — error / empty state
// ---------------------------------------------------------------------------

describe("BrandsCarousel — error and empty state", () => {
  it("returns null when isLoading=false and brands array is empty", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: { brands: [] },
    });
    const renderer = renderCarousel();
    expect(renderer.toJSON()).toBeNull();
  });

  it("returns null when data is undefined (fetch not yet resolved, not loading)", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, data: undefined });
    const renderer = renderCarousel();
    expect(renderer.toJSON()).toBeNull();
  });

  it("returns null when the API returns a malformed payload (no brands key)", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: { ok: false },
    });
    const renderer = renderCarousel();
    expect(renderer.toJSON()).toBeNull();
  });

  it("returns null when the API returns brands as a non-array", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: { brands: "not-an-array" },
    });
    const renderer = renderCarousel();
    expect(renderer.toJSON()).toBeNull();
  });

  it("does not crash when data is null", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, data: null });
    expect(() => renderCarousel()).not.toThrow();
  });
});
