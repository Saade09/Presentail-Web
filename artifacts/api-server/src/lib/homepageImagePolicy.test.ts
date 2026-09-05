import { describe, expect, it } from "vitest";
import {
  buildHomepageCatalogImageUrl,
  buildHomepageOsImageUrl,
  buildHomepageProductImages,
} from "./homepageImagePolicy";

describe("homepage image policy", () => {
  it("emits bounded WebP proxy URLs and safely nests special characters", () => {
    const source = "https://os.presentail.com/api/storage/public-objects/categories/ورد + 50% & more.png?label=a+b";
    const result = buildHomepageOsImageUrl(source, "category");
    const parsed = new URL(result, "https://presentail.com");

    expect(parsed.pathname).toBe("/api/img/proxy");
    expect(parsed.searchParams.get("w")).toBe("480");
    expect(parsed.searchParams.get("f")).toBe("webp");
    const nested = parsed.searchParams.get("url") ?? "";
    expect(decodeURIComponent(new URL(nested).pathname)).toContain("ورد + 50% & more.png");
    expect(new URL(nested).searchParams.get("label")).toBe("a b");
  });

  it("uses mobile-safe defaults for each homepage section", () => {
    const source = "https://os.presentail.com/api/storage/public-objects/a.png";
    expect(buildHomepageOsImageUrl(source, "hero")).toContain("w=1200");
    expect(buildHomepageOsImageUrl(source, "product")).toContain("w=400");
    expect(buildHomepageCatalogImageUrl("category", "cat 1")).toBe(
      "/api/catalog/category-image/cat%201?w=480&f=webp",
    );
    expect(buildHomepageCatalogImageUrl("occasion", 42)).toBe(
      "/api/catalog/occasion-image/42?w=288&f=webp",
    );
  });

  it("preserves empty, local, video/CDN fallbacks, and existing proxy URLs", () => {
    expect(buildHomepageOsImageUrl("", "hero")).toBe("");
    expect(buildHomepageOsImageUrl("/assets/category.png", "category")).toBe("/assets/category.png");
    expect(buildHomepageOsImageUrl("https://cdn.example.com/banner.jpg", "hero")).toBe(
      "https://cdn.example.com/banner.jpg",
    );
    const proxied = "/api/img/proxy?url=x&w=400&f=webp";
    expect(buildHomepageOsImageUrl(proxied, "product")).toBe(proxied);
  });

  it("removes raw OS storage URLs from homepage product image arrays", () => {
    const images = buildHomepageProductImages([
      { url: "https://os.presentail.com/api/storage/public-objects/products/rose 1.png" },
      { url: "" },
    ]);
    expect(images).toHaveLength(1);
    expect(images[0].uri).toMatch(/^\/api\/img\/proxy\?/);
    expect(images[0].uri).toContain("w=400");
    expect(images[0].uri).toContain("f=webp");
    expect(images[0].uri).not.toContain("https://os.presentail.com/api/storage/public-objects/");
  });
});