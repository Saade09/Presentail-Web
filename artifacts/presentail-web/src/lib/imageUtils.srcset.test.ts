import { describe, it, expect } from "vitest";
import { buildSrcSet, buildCatalogImageSrcset, buildCatalogHeroImageSrcset } from "./imageUtils";

describe("buildSrcSet", () => {
  it("emits variant widths first, then the original at its intrinsic width", () => {
    const result = buildSrcSet("/blog/post.webp", [480, 768], 1408);
    expect(result).toBe(
      "/blog/post-480.webp 480w, /blog/post-768.webp 768w, /blog/post.webp 1408w",
    );
  });

  it("keeps the original url unchanged as the largest descriptor", () => {
    const result = buildSrcSet("/blog/spring.webp", [768], 1408);
    expect(result).toBe("/blog/spring-768.webp 768w, /blog/spring.webp 1408w");
  });

  it("skips variant widths that are >= the intrinsic width (no upscaling)", () => {
    const result = buildSrcSet("/blog/post.webp", [480, 768, 1408, 2000], 1408);
    expect(result).toBe(
      "/blog/post-480.webp 480w, /blog/post-768.webp 768w, /blog/post.webp 1408w",
    );
  });

  it("returns only the original when no variant width is smaller", () => {
    const result = buildSrcSet("/blog/post.webp", [1600], 1408);
    expect(result).toBe("/blog/post.webp 1408w");
  });

  it("handles uppercase .WEBP extensions when deriving the base name", () => {
    const result = buildSrcSet("/blog/post.WEBP", [480], 1408);
    expect(result).toBe("/blog/post-480.webp 480w, /blog/post.WEBP 1408w");
  });
});

// ---------------------------------------------------------------------------
// buildCatalogImageSrcset
// ---------------------------------------------------------------------------

describe("buildCatalogImageSrcset", () => {
  it("returns null for a non-catalog URL", () => {
    expect(buildCatalogImageSrcset("https://example.com/image.jpg")).toBeNull();
  });

  it("returns null for an absolute OS storage URL", () => {
    expect(buildCatalogImageSrcset("https://os.presentail.com/api/storage/img.jpg")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(buildCatalogImageSrcset("")).toBeNull();
  });

  it("generates a srcset at 144w, 288w, and 480w for an occasion-image proxy URL", () => {
    const url = "/api/catalog/occasion-image/mothers-day";
    const result = buildCatalogImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/occasion-image/mothers-day?w=144&f=webp 144w, " +
        "/api/catalog/occasion-image/mothers-day?w=288&f=webp 288w, " +
        "/api/catalog/occasion-image/mothers-day?w=480&f=webp 480w",
    );
  });

  it("generates a srcset at 144w, 288w, and 480w for a category-image proxy URL", () => {
    const url = "/api/catalog/category-image/flowers";
    const result = buildCatalogImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/category-image/flowers?w=144&f=webp 144w, " +
        "/api/catalog/category-image/flowers?w=288&f=webp 288w, " +
        "/api/catalog/category-image/flowers?w=480&f=webp 480w",
    );
  });

  it("generates a srcset at 144w, 288w, and 480w for a brand-image proxy URL", () => {
    const url = "/api/catalog/brand-image/acme";
    const result = buildCatalogImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/brand-image/acme?w=144&f=webp 144w, " +
        "/api/catalog/brand-image/acme?w=288&f=webp 288w, " +
        "/api/catalog/brand-image/acme?w=480&f=webp 480w",
    );
  });

  it("sets src to the 288w proxy URL as the non-srcset fallback", () => {
    const url = "/api/catalog/brand-image/acme";
    const result = buildCatalogImageSrcset(url);
    expect(result!.src).toBe("/api/catalog/brand-image/acme?w=288&f=webp");
  });

  it("uses the default card sizes hint when no sizes argument is provided", () => {
    const result = buildCatalogImageSrcset("/api/catalog/occasion-image/birthday");
    expect(result!.sizes).toBe("(max-width: 768px) 25vw, 300px");
  });

  it("accepts a custom sizes hint override", () => {
    const result = buildCatalogImageSrcset("/api/catalog/brand-image/luxe", "50vw");
    expect(result!.sizes).toBe("50vw");
  });
});

// ---------------------------------------------------------------------------
// buildCatalogHeroImageSrcset
// ---------------------------------------------------------------------------

describe("buildCatalogHeroImageSrcset", () => {
  it("returns null for a non-catalog URL", () => {
    expect(buildCatalogHeroImageSrcset("https://example.com/hero.jpg")).toBeNull();
  });

  it("returns null for an absolute OS storage URL", () => {
    expect(buildCatalogHeroImageSrcset("https://os.presentail.com/api/storage/hero.jpg")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(buildCatalogHeroImageSrcset("")).toBeNull();
  });

  it("generates a srcset at 800w, 1200w, and 1600w for an occasion-image proxy URL", () => {
    const url = "/api/catalog/occasion-image/valentines-day";
    const result = buildCatalogHeroImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/occasion-image/valentines-day?w=800&f=webp 800w, " +
        "/api/catalog/occasion-image/valentines-day?w=1200&f=webp 1200w, " +
        "/api/catalog/occasion-image/valentines-day?w=1600&f=webp 1600w",
    );
  });

  it("generates a srcset at 800w, 1200w, and 1600w for a category-image proxy URL", () => {
    const url = "/api/catalog/category-image/seasonal";
    const result = buildCatalogHeroImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/category-image/seasonal?w=800&f=webp 800w, " +
        "/api/catalog/category-image/seasonal?w=1200&f=webp 1200w, " +
        "/api/catalog/category-image/seasonal?w=1600&f=webp 1600w",
    );
  });

  it("generates a srcset at 800w, 1200w, and 1600w for a brand-image proxy URL", () => {
    const url = "/api/catalog/brand-image/prestige";
    const result = buildCatalogHeroImageSrcset(url);
    expect(result).not.toBeNull();
    expect(result!.srcset).toBe(
      "/api/catalog/brand-image/prestige?w=800&f=webp 800w, " +
        "/api/catalog/brand-image/prestige?w=1200&f=webp 1200w, " +
        "/api/catalog/brand-image/prestige?w=1600&f=webp 1600w",
    );
  });

  it("sets src to the 1200w proxy URL as the non-srcset fallback", () => {
    const url = "/api/catalog/brand-image/prestige";
    const result = buildCatalogHeroImageSrcset(url);
    expect(result!.src).toBe("/api/catalog/brand-image/prestige?w=1200&f=webp");
  });

  it("uses the default hero sizes hint when no sizes argument is provided", () => {
    const result = buildCatalogHeroImageSrcset("/api/catalog/occasion-image/birthday");
    expect(result!.sizes).toBe("(max-width: 1280px) 100vw, 1280px");
  });

  it("accepts a custom sizes hint override", () => {
    const result = buildCatalogHeroImageSrcset("/api/catalog/brand-image/luxe", "75vw");
    expect(result!.sizes).toBe("75vw");
  });
});
