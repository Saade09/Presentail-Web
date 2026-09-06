import { describe, expect, it } from "vitest";
import {
  buildCatalogProductImageUrl,
  CATALOG_CARD_IMAGE_WIDTH,
  PRODUCT_GALLERY_IMAGE_WIDTH,
} from "./catalogProductImagePolicy";

const RAW =
  "https://os.presentail.com/api/storage/public-objects/products/318/main image.png";

describe("catalog product image policy", () => {
  it("uses bounded WebP defaults for cards and product galleries", () => {
    const card = buildCatalogProductImageUrl(RAW, CATALOG_CARD_IMAGE_WIDTH);
    const gallery = buildCatalogProductImageUrl(RAW, PRODUCT_GALLERY_IMAGE_WIDTH);

    expect(card).toContain("/api/img/proxy?");
    expect(card).toContain("w=400");
    expect(card).toContain("f=webp");
    expect(gallery).toContain("w=1200");
    expect(gallery).toContain("f=webp");
    expect(card).not.toBe(RAW);
    expect(gallery).not.toBe(RAW);
  });

  it("rewrites an existing proxy without nesting it or retaining an oversized width", () => {
    const existing = buildCatalogProductImageUrl(RAW, 1600);
    const card = buildCatalogProductImageUrl(existing, CATALOG_CARD_IMAGE_WIDTH);
    const params = new URLSearchParams(card.split("?")[1]);

    expect(params.get("w")).toBe("400");
    expect(params.get("f")).toBe("webp");
    expect(params.get("url")).toBe(new URL(RAW).toString());
  });

  it("leaves static fallbacks and non-OS CDN images unchanged", () => {
    expect(buildCatalogProductImageUrl("/products/fallback.webp", 400)).toBe(
      "/products/fallback.webp",
    );
    expect(buildCatalogProductImageUrl("https://cdn.example.com/photo.jpg", 400)).toBe(
      "https://cdn.example.com/photo.jpg",
    );
  });
});