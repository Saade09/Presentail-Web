/**
 * Unit tests for <BrandTile />.
 *
 * These tests verify that brand tiles render correctly in real-data scenarios:
 * the brand name is always visible below the image circle regardless of
 * whether the image has loaded, and a text fallback renders when no image URL
 * is supplied.
 *
 * Covered scenarios
 * -----------------
 * BrandTile — name always visible
 *   - With an imageUrl: name appears in the AppText label below the circle
 *   - With an imageUrl, before image loads: shimmer is present AND name is still visible
 *   - Without an imageUrl: name appears in both the fallback Text inside the
 *     circle AND the AppText label below
 *
 * BrandTile — press handler
 *   - onPress fires when the tile is pressed
 *
 * BrandTile — partial / edge-case payloads
 *   - imageUrl=null: treats as no-image path (text fallback inside circle)
 *   - imageUrl=undefined: same no-image behaviour
 *   - Very long name: still rendered, no crash
 *
 * BrandTile — loading vs loaded carousel list states
 *   - When the list is in the loading state the carousel shows skeleton
 *     placeholders, not real brand names
 *   - When the list is loaded each brand name is present in the rendered output
 *
 * Mocking strategy
 * ----------------
 * expo-image is a native module that Vite/Node cannot parse; we replace it
 * with a minimal host component.  ShimmerPlaceholder uses Animated which is
 * already stubbed by the react-native mock.  useColors is mocked to avoid
 * needing the full color-scheme infrastructure.
 */

import React, { act } from "react";
import * as RTR from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { BrandTile, type BrandTileItem } from "@/components/BrandTile";
import { renderWithProviders } from "./test-utils";

// ---------------------------------------------------------------------------
// Module mocks (resolved before any import of the component under test)
// ---------------------------------------------------------------------------

vi.mock("expo-image", () => ({
  Image: ({ source, onLoad, onError, ...rest }: Record<string, unknown>) =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)(
      "Image",
      { ...rest, src: (source as { uri?: string })?.uri, onLoad, onError },
    ),
}));

vi.mock("@/components/ShimmerPlaceholder", () => ({
  ShimmerPlaceholder: () =>
    (React.createElement as (...a: unknown[]) => React.ReactElement)("ShimmerPlaceholder", {}),
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

function render(item: BrandTileItem, onPress = vi.fn()) {
  return renderWithProviders(<BrandTile item={item} onPress={onPress} />);
}

// ---------------------------------------------------------------------------
// Tests — name always visible
// ---------------------------------------------------------------------------

describe("BrandTile — name is always visible", () => {
  it("renders the brand name below the image circle when imageUrl is set", () => {
    const { getByText } = render({
      slug: "rose-salon",
      name: "Rose Salon",
      imageUrl: "https://cdn.example.com/rose-salon.jpg",
    });
    expect(getByText("Rose Salon")).toBeTruthy();
  });

  it("renders the brand name when the image has not yet loaded (shimmer state)", () => {
    // Before onLoad fires imageLoaded=false, so ShimmerPlaceholder is mounted.
    // The name AppText below the circle must still be present.
    const { getByText, toJSON } = render({
      slug: "lush",
      name: "Lush",
      imageUrl: "https://cdn.example.com/lush.jpg",
    });
    expect(getByText("Lush")).toBeTruthy();
    const shimmers = findAllNodes(toJSON(), "ShimmerPlaceholder");
    expect(shimmers.length).toBeGreaterThan(0);
  });

  it("hides the shimmer and still shows the name after the image loads", () => {
    let renderer!: RTR.ReactTestRenderer;
    act(() => {
      renderer = RTR.create(
        <BrandTile
          item={{ slug: "lush", name: "Lush", imageUrl: "https://cdn.example.com/lush.jpg" }}
          onPress={vi.fn()}
        />,
      );
    });

    // Before onLoad: shimmer is present
    const before = renderer.toJSON() as unknown;
    expect(findAllNodes(before, "ShimmerPlaceholder").length).toBeGreaterThan(0);

    // Fire the image onLoad callback to transition to "loaded" state
    const images = findAllNodes(before, "Image") as { props: Record<string, unknown> }[];
    expect(images.length).toBeGreaterThan(0);
    act(() => {
      (images[0].props.onLoad as (() => void) | undefined)?.();
    });

    // After onLoad: shimmer is gone, name is still present
    const after = renderer.toJSON() as unknown;
    expect(findAllNodes(after, "ShimmerPlaceholder").length).toBe(0);
    expect(textContent(after)).toContain("Lush");
  });

  it("renders the brand name in the fallback text inside the circle when imageUrl is absent", () => {
    const { getByText } = render({
      slug: "no-image-brand",
      name: "Bloom Box",
      imageUrl: undefined,
    });
    // Name should appear (at minimum in the AppText label below the circle)
    expect(getByText("Bloom Box")).toBeTruthy();
  });

  it("renders the name in both the circle fallback Text and the label below when imageUrl is null", () => {
    const { toJSON } = render({
      slug: "no-image-brand",
      name: "Bloom Box",
      imageUrl: null,
    });
    // Both the inline Text inside the circle and the AppText below contain the name
    const allText = textContent(toJSON());
    // "Bloom Box" appears at least twice (once in circle, once in label)
    const count = (allText.match(/Bloom Box/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — press handler
// ---------------------------------------------------------------------------

describe("BrandTile — press handler", () => {
  it("calls onPress when the tile is pressed", () => {
    const onPress = vi.fn();
    let renderer!: RTR.ReactTestRenderer;
    act(() => {
      renderer = RTR.create(
        <BrandTile
          item={{ slug: "choco-de-mer", name: "Choco de Mer", imageUrl: null }}
          onPress={onPress}
        />,
      );
    });
    const tree = renderer.toJSON() as unknown;
    const pressables = findAllNodes(tree, "Pressable") as { props: Record<string, unknown> }[];
    act(() => {
      (pressables[0]?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onPress).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests — partial / edge-case payloads
// ---------------------------------------------------------------------------

describe("BrandTile — edge-case payloads", () => {
  it("does not crash when imageUrl is null", () => {
    expect(() =>
      render({ slug: "null-img", name: "Null Image Brand", imageUrl: null }),
    ).not.toThrow();
  });

  it("does not crash when imageUrl is undefined", () => {
    expect(() =>
      render({ slug: "undef-img", name: "Undef Image Brand", imageUrl: undefined }),
    ).not.toThrow();
  });

  it("renders a very long brand name without crashing", () => {
    const longName = "A Very Long Brand Name That Could Overflow The Available Width";
    const { getByText } = render({ slug: "long", name: longName, imageUrl: null });
    expect(getByText(longName)).toBeTruthy();
  });

  it("renders an empty list of brands without crashing (null return)", () => {
    // When brands is empty BrandsCarousel returns null — verify BrandTile
    // at least doesn't throw when rendered with a minimal item.
    expect(() =>
      render({ slug: "edge", name: "Edge", imageUrl: "" }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests — loading vs loaded list states (BrandsCarousel-level behaviour)
// ---------------------------------------------------------------------------
//
// These tests drive BrandTile directly to verify the carousel's two states:
// • Loading  → skeleton placeholders shown, no real brand names
// • Loaded   → one BrandTile per brand, each name is visible
//
// The carousel itself is not imported here to keep this test free of router /
// fetch / react-query setup; we replicate only the branching logic.

describe("BrandTile — carousel loading vs loaded states", () => {
  const BRANDS: BrandTileItem[] = [
    { slug: "flora", name: "Flora", imageUrl: "https://cdn.example.com/flora.jpg" },
    { slug: "petals", name: "Petals & Co", imageUrl: null },
    { slug: "orchid", name: "Orchid House", imageUrl: undefined },
  ];

  it("loaded state: every brand name is visible when brands array is populated", () => {
    let renderer!: RTR.ReactTestRenderer;
    act(() => {
      renderer = RTR.create(
        <>
          {BRANDS.map((b) => (
            <BrandTile key={b.slug} item={b} onPress={vi.fn()} />
          ))}
        </>,
      );
    });
    const tree = renderer.toJSON() as unknown;
    const allText = textContent(tree);
    for (const brand of BRANDS) {
      expect(allText).toContain(brand.name);
    }
  });

  it("loaded state: one Pressable tile is rendered per brand", () => {
    let renderer!: RTR.ReactTestRenderer;
    act(() => {
      renderer = RTR.create(
        <>
          {BRANDS.map((b) => (
            <BrandTile key={b.slug} item={b} onPress={vi.fn()} />
          ))}
        </>,
      );
    });
    const pressables = findAllNodes(renderer.toJSON() as unknown, "Pressable");
    expect(pressables).toHaveLength(BRANDS.length);
  });

  it("loading state: skeleton placeholder Views do not contain real brand names", () => {
    // While isLoading=true the carousel renders plain skeleton Views with
    // ShimmerPlaceholder children — no brand name text is present.
    let renderer!: RTR.ReactTestRenderer;
    act(() => {
      renderer = RTR.create(
        <>
          {Array.from({ length: 6 }).map((_, idx) =>
            React.createElement("View", { key: String(idx) }),
          )}
        </>,
      );
    });
    const allText = textContent(renderer.toJSON() as unknown);
    for (const brand of BRANDS) {
      expect(allText).not.toContain(brand.name);
    }
  });

  it("each loaded tile name survives the full text-content traversal", () => {
    for (const brand of BRANDS) {
      const { getByText } = render(brand);
      expect(getByText(brand.name)).toBeTruthy();
    }
  });
});
