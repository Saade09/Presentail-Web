import { describe, expect, it } from "vitest";

import type { OSProduct } from "@workspace/presentail-os";

import { buildFeedData, buildRssFeed, canonicalProductSlug } from "./merchantFeed";

describe("merchantFeed canonical product links", () => {
  it.each([
    ["red-roses", "red-roses"],
    ["/red-roses/", "red-roses"],
    ["red-roses?utm_source=merchant&gclid=blocked", "red-roses"],
    ["red-roses#details", "red-roses"],
  ])("normalizes %s to a clean canonical path component", (input, expected) => {
    expect(canonicalProductSlug(input)).toBe(expected);
  });

  it("emits a locale/city-aware feed link without blocked tracking parameters", () => {
    const product = {
      id: "/red-roses?utm_source=merchant&gclid=blocked#details",
      name: "Red Roses",
      description: "Fresh roses.",
      inStock: true,
      price: 25,
      images: [{ url: "https://cdn.test/red-roses.jpg" }],
      categories: [],
      occasions: [],
      brands: [],
    } as unknown as OSProduct;
    const { items } = buildFeedData(
      "lb",
      "LB",
      "en-lb",
      "beirut",
      [product],
      "USD",
    );
    const xml = buildRssFeed(items, "lb");
    expect(xml).toContain(
      "<g:link>https://presentail.com/en-lb/beirut/product/red-roses</g:link>",
    );
    expect(xml).not.toContain("utm_");
    expect(xml).not.toContain("gclid");
    expect(xml).not.toContain("%3F");
    expect(xml).not.toContain("%23");
  });
});