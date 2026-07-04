/**
 * Unit tests for <ProductCard /> — image sizing
 *
 * The mobile ProductCard renders a square image container via `aspectRatio: 1`
 * on the imageWrap View.  The Image itself fills that container with
 * `width: "100%"` / `height: "100%"`.  The outer Animated.View and Pressable
 * both receive the `width` prop as their explicit pixel dimension so the grid
 * layout stays correct on every screen width.
 *
 * These tests pin those values so a future layout change that accidentally
 * breaks the image dimensions is caught before shipping.
 *
 * Covered scenarios
 * -----------------
 * ProductCard — image dimensions
 *   - Image style has width "100%" and height "100%"
 *   - imageWrap View style includes aspectRatio: 1
 *   - Outer AnimatedView style.width equals the width prop
 *   - Dimensions update when a different width prop is supplied
 *
 * ProductCard — basic rendering
 *   - Product name is visible
 *   - Does not crash when image is null
 *   - Does not crash when image is a URI string
 *   - Does not crash when image is undefined
 *
 * Mocking strategy
 * ----------------
 * expo-image is a native module; we replace it with a host-component stub
 * that faithfully forwards all non-event props (including `style`).
 * expo-router, useColors, useTypography, useHeadingFont, useT,
 * useDeliveryConfig, ShimmerPlaceholder, prefetchScreens, and
 * salePriceHelpers are all stubbed to keep the test free of native-module
 * and network dependencies.  CurrencyContext, LanguageContext, and
 * CartContext are injected via renderWithProviders from test-utils.
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/data/catalog";
import { renderWithProviders } from "../tests/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("expo-image", () => ({
  Image: ({ source: _source, onLoad, onError, ...rest }: Record<string, unknown>) =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "Image",
      { ...rest, onLoad, onError },
    ),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#0a5663",
    border: "#e0d6cc",
    muted: "#f5f0eb",
    mutedForeground: "#9e8977",
    imagePlaceholder: "#f0ebe5",
    gold: "#b8860b",
    radius: 12,
  }),
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

vi.mock("@/hooks/useHeadingFont", () => ({
  useHeadingFont: () => "PlayfairDisplay_500Medium",
}));

vi.mock("@/hooks/useT", () => ({
  useT: () =>
    new Proxy({} as Record<string, string>, {
      get: (_t, prop) => String(prop),
    }),
}));

vi.mock("@/hooks/useDeliveryConfig", () => ({
  useDeliveryConfig: () => ({
    freeDeliveryEnabled: false,
    freeDeliveryThresholdNative: 99999,
  }),
}));

vi.mock("@/lib/prefetchScreens", () => ({
  loadProductDetailScreen: () => Promise.resolve(),
  prefetchOnInteraction: () => ({ onPressIn: vi.fn() }),
}));

vi.mock("@/components/ShimmerPlaceholder", () => ({
  ShimmerPlaceholder: () =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "ShimmerPlaceholder",
      {},
    ),
}));

vi.mock("@/lib/salePriceHelpers", () => ({
  isDiscountActive: () => false,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyNode = {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
} | string;

function findAllNodes(node: unknown, type: string): AnyNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((c) => findAllNodes(c, type));
  const n = node as AnyNode;
  if (typeof n === "string") return [];
  const here = n.type === type ? [n] : [];
  if (n.children) return [...here, ...n.children.flatMap((c) => findAllNodes(c, type))];
  return here;
}

/** Flatten a React Native style (object or array) into a single plain object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...(style as unknown[]).map(flattenStyle));
  }
  if (typeof style === "object") return style as Record<string, unknown>;
  return {};
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRODUCT: Product = {
  id: "red-roses-bouquet",
  name: "Red Roses Bouquet",
  price: "$45",
  priceValue: 45,
  image: { uri: "https://cdn.example.com/red-roses.jpg" },
  category: "flowers",
};

function render(overrides: Partial<Product> = {}, width = 160) {
  return renderWithProviders(
    <ProductCard product={{ ...PRODUCT, ...overrides }} width={width} />,
  );
}

// ---------------------------------------------------------------------------
// Tests — image dimensions
// ---------------------------------------------------------------------------

describe("ProductCard — image dimensions", () => {
  it("Image style has width '100%' and height '100%'", () => {
    const { toJSON } = render();
    const images = findAllNodes(toJSON(), "Image") as { props: Record<string, unknown> }[];
    expect(images.length).toBeGreaterThan(0);
    const style = flattenStyle(images[0].props.style);
    expect(style.width).toBe("100%");
    expect(style.height).toBe("100%");
  });

  it("imageWrap View style includes aspectRatio: 1", () => {
    const { toJSON } = render();
    const views = findAllNodes(toJSON(), "View") as { props: Record<string, unknown> }[];
    const hasAspectRatio1 = views.some((v) => flattenStyle(v.props.style).aspectRatio === 1);
    expect(hasAspectRatio1).toBe(true);
  });

  it("outer AnimatedView style.width equals the width prop", () => {
    const { toJSON } = render({}, 160);
    const root = toJSON() as unknown as { type: string; props: Record<string, unknown> };
    expect(root.type).toBe("AnimatedView");
    expect(flattenStyle(root.props.style).width).toBe(160);
  });

  it("outer AnimatedView width updates when a different width prop is supplied", () => {
    for (const width of [120, 160, 200]) {
      const { toJSON } = render({}, width);
      const root = toJSON() as unknown as { type: string; props: Record<string, unknown> };
      expect(
        flattenStyle(root.props.style).width,
        `width prop ${width} should appear on AnimatedView`,
      ).toBe(width);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — basic rendering
// ---------------------------------------------------------------------------

describe("ProductCard — basic rendering", () => {
  it("renders the product name", () => {
    const { getByText } = render();
    expect(getByText("Red Roses Bouquet")).toBeTruthy();
  });

  it("does not crash when image is null", () => {
    expect(() => render({ image: null })).not.toThrow();
  });

  it("does not crash when image is a plain URI string", () => {
    expect(() =>
      render({ image: "https://cdn.example.com/roses.jpg" }),
    ).not.toThrow();
  });

  it("does not crash when image is undefined", () => {
    expect(() => render({ image: undefined })).not.toThrow();
  });
});
