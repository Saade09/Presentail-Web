import { describe, expect, it } from "vitest";
import { getFallbackUri } from "@/utils/imageUrl";
import { resolveWcBrandImageUrl, resolveWooProductImageUrls } from "./woo";

describe("getFallbackUri", () => {
  it("never unwraps a bounded image proxy to raw OS storage", () => {
    const proxy =
      "https://api.example.com/api/img/proxy?url=https%3A%2F%2Fos.presentail.com%2Fapi%2Fstorage%2Fpublic-objects%2Fp.jpg&w=1200&f=webp";
    expect(getFallbackUri(proxy)).toBe(proxy);
  });
});

describe("mobile API image URL resolution", () => {
  it("makes bounded product proxy URLs absolute for native image loading", () => {
    const product = resolveWooProductImageUrls({
      id: "rose",
      wcId: 1,
      name: "Rose",
      price: "$10",
      priceValue: 10,
      image: { uri: "/api/img/proxy?url=x&w=400&f=webp" },
      images: [{ uri: "/api/img/proxy?url=x&w=1200&f=webp" }],
      category: "flowers",
      inStock: true,
      occasions: [],
    });

    expect(product.image?.uri).toMatch(/^https?:\/\/.+\/api\/img\/proxy\?/);
    expect(product.image?.uri).toContain("w=400");
    expect(product.images?.[0]?.uri).toContain("w=1200");
  });

  it("makes the independently fetched brand-list proxy absolute", () => {
    const brand = resolveWcBrandImageUrl({
      id: "roses",
      name: "Roses",
      slug: "roses",
      count: 1,
      image: "/api/img/proxy?url=x&w=400&f=webp",
    });

    expect(brand.image).toMatch(/^https?:\/\/.+\/api\/img\/proxy\?/);
    expect(brand.image).toContain("w=400");
  });
});