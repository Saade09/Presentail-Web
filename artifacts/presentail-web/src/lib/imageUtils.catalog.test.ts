import { describe, it, expect } from "vitest";
import { buildCatalogImageSrcset, isCatalogProxyUrl } from "./imageUtils";

// ---------------------------------------------------------------------------
// isCatalogProxyUrl
// ---------------------------------------------------------------------------

describe("isCatalogProxyUrl", () => {
  it("returns true for occasion-image URLs", () => {
    expect(isCatalogProxyUrl("/api/catalog/occasion-image/123")).toBe(true);
  });

  it("returns true for brand-image URLs", () => {
    expect(isCatalogProxyUrl("/api/catalog/brand-image/brand-logo.jpg")).toBe(true);
  });

  it("returns false for /api/img/proxy", () => {
    expect(isCatalogProxyUrl("/api/img/proxy?url=https://example.com/img.jpg")).toBe(false);
  });

  it("returns false for absolute external URLs", () => {
    expect(isCatalogProxyUrl("https://os.presentail.com/api/storage/img.jpg")).toBe(false);
  });

  it("returns false for /api/catalog/brand-allowlist (not an image path)", () => {
    expect(isCatalogProxyUrl("/api/catalog/brand-allowlist")).toBe(false);
  });

  it("returns false for a bare /api/catalog/ prefix with no sub-path", () => {
    expect(isCatalogProxyUrl("/api/catalog/")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isCatalogProxyUrl("")).toBe(false);
  });

  it("returns false for a blog image path", () => {
    expect(isCatalogProxyUrl("/blog/post.webp")).toBe(false);
  });
});

describe("bounded catalog proxy URLs", () => {
  it("recognizes category images and replaces existing variant parameters", () => {
    const input = "/api/catalog/category-image/123?w=480&f=webp";
    expect(isCatalogProxyUrl(input)).toBe(true);
    const result = buildCatalogImageSrcset(input);
    expect(result?.src).toBe("/api/catalog/category-image/123?w=288&f=webp");
    expect(result?.srcset).not.toContain("?w=480&f=webp?w=");
  });
});

// ---------------------------------------------------------------------------
// buildCatalogImageSrcset — per-prefix coverage
// ---------------------------------------------------------------------------

const CATALOG_URLS = [
  "/api/catalog/occasion-image/123",
  "/api/catalog/brand-image/brand-logo.jpg",
] as const;

describe("buildCatalogImageSrcset", () => {
  for (const url of CATALOG_URLS) {
    describe(`prefix: ${url}`, () => {
      it("returns a non-null result", () => {
        expect(buildCatalogImageSrcset(url)).not.toBeNull();
      });

      it("srcset contains entries for 144w, 288w, and 480w", () => {
        const result = buildCatalogImageSrcset(url)!;
        expect(result.srcset).toContain("144w");
        expect(result.srcset).toContain("288w");
        expect(result.srcset).toContain("480w");
      });

      it("every srcset entry uses f=webp", () => {
        const result = buildCatalogImageSrcset(url)!;
        const entries = result.srcset.split(", ");
        expect(entries).toHaveLength(3);
        for (const entry of entries) {
          expect(entry).toContain("f=webp");
        }
      });

      it("each srcset entry w= param matches its width descriptor", () => {
        const result = buildCatalogImageSrcset(url)!;
        const entries = result.srcset.split(", ");
        expect(entries[0]).toMatch(/w=144.*\s144w$/);
        expect(entries[1]).toMatch(/w=288.*\s288w$/);
        expect(entries[2]).toMatch(/w=480.*\s480w$/);
      });

      it("src is the 288w WebP fallback URL", () => {
        const result = buildCatalogImageSrcset(url)!;
        expect(result.src).toBe(`${url}?w=288&f=webp`);
      });

      it("sizes uses the default card hint when not supplied", () => {
        const result = buildCatalogImageSrcset(url)!;
        expect(result.sizes).toBe("(max-width: 768px) 25vw, 300px");
      });

      it("sizes uses the caller-supplied hint when provided", () => {
        const customSizes = "(min-width: 640px) 50vw, 100vw";
        const result = buildCatalogImageSrcset(url, customSizes)!;
        expect(result.sizes).toBe(customSizes);
      });

      it("srcset entries are prefixed with the original proxy path", () => {
        const result = buildCatalogImageSrcset(url)!;
        for (const entry of result.srcset.split(", ")) {
          expect(entry.startsWith(url)).toBe(true);
        }
      });
    });
  }

  // ── Non-matching URLs must return null ──────────────────────────────────

  describe("non-catalog URLs return null", () => {
    const NON_CATALOG = [
      "/api/img/proxy?url=foo",
      "https://os.presentail.com/api/storage/img.jpg",
      "https://images.unsplash.com/photo?w=800",
      "/blog/post.webp",
      "",
      "/api/catalog/",
      "/api/catalog/brand-allowlist",
    ];

    for (const url of NON_CATALOG) {
      it(`returns null for "${url}"`, () => {
        expect(buildCatalogImageSrcset(url)).toBeNull();
      });
    }
  });

  // ── Srcset format matches the exact expected string ──────────────────────

  it("produces the exact srcset string for an occasion-image URL", () => {
    const url = "/api/catalog/occasion-image/42";
    const result = buildCatalogImageSrcset(url)!;
    expect(result.srcset).toBe(
      "/api/catalog/occasion-image/42?w=144&f=webp 144w, " +
      "/api/catalog/occasion-image/42?w=288&f=webp 288w, " +
      "/api/catalog/occasion-image/42?w=480&f=webp 480w",
    );
  });

  it("produces the exact srcset string for a brand-image URL", () => {
    const url = "/api/catalog/brand-image/roses-brand.jpg";
    const result = buildCatalogImageSrcset(url)!;
    expect(result.srcset).toBe(
      "/api/catalog/brand-image/roses-brand.jpg?w=144&f=webp 144w, " +
      "/api/catalog/brand-image/roses-brand.jpg?w=288&f=webp 288w, " +
      "/api/catalog/brand-image/roses-brand.jpg?w=480&f=webp 480w",
    );
  });
});
