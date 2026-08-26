import { describe, it, expect } from "vitest";
import {
  buildBrandHeroSrcset,
  BRAND_HERO_SIZES,
} from "./imageUtils";

// ---------------------------------------------------------------------------
// buildBrandHeroSrcset — the heroSrcsetResult logic from BrandDetail.tsx
// ---------------------------------------------------------------------------
//
// This suite locks down the three-branch decision tree that runs for the brand
// detail page hero banner.  If the layout changes and the sizes hint needs to
// be updated the test will catch any accidental regression in which URL types
// get which srcset strategy.

const CATALOG_URL = "/api/catalog/brand-image/hallab-1881";
const OS_URL = "https://os.presentail.com/api/storage/public-objects/brands/hallab-cover.webp";
const STATIC_URL = "/brand-covers/hallab-1881.webp";
const ENCODED_OS = encodeURIComponent(OS_URL);

describe("buildBrandHeroSrcset", () => {
  // ── Branch 1: catalog proxy URL ─────────────────────────────────────────

  describe("catalog proxy URL → buildCatalogHeroImageSrcset with brand hero sizes", () => {
    it("returns a non-null result", () => {
      expect(buildBrandHeroSrcset(CATALOG_URL)).not.toBeNull();
    });

    it("srcset contains 800w, 1200w, and 1600w entries (catalog hero widths)", () => {
      const result = buildBrandHeroSrcset(CATALOG_URL)!;
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
      expect(result.srcset).toContain("1600w");
    });

    it("srcset entries use ?w=…&f=webp (catalog proxy params)", () => {
      const result = buildBrandHeroSrcset(CATALOG_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("f=webp");
        expect(entry.startsWith(CATALOG_URL)).toBe(true);
      }
    });

    it("src is the 1200w proxy URL", () => {
      const result = buildBrandHeroSrcset(CATALOG_URL)!;
      expect(result.src).toBe(`${CATALOG_URL}?w=1200&f=webp`);
    });

    it("sizes defaults to BRAND_HERO_SIZES", () => {
      const result = buildBrandHeroSrcset(CATALOG_URL)!;
      expect(result.sizes).toBe(BRAND_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 100vw, 900px";
      const result = buildBrandHeroSrcset(CATALOG_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for a brand-image URL", () => {
      const result = buildBrandHeroSrcset(CATALOG_URL)!;
      expect(result.srcset).toBe(
        `${CATALOG_URL}?w=800&f=webp 800w, ` +
          `${CATALOG_URL}?w=1200&f=webp 1200w, ` +
          `${CATALOG_URL}?w=1600&f=webp 1600w`,
      );
    });

    it("works for occasion-image proxy URLs too", () => {
      const occasionUrl = "/api/catalog/occasion-image/birthday";
      expect(buildBrandHeroSrcset(occasionUrl)).not.toBeNull();
    });
  });

  // ── Branch 2: OS storage URL ─────────────────────────────────────────────

  describe("OS storage URL → buildOsImageSrcset with brand hero sizes", () => {
    it("returns a non-null result", () => {
      expect(buildBrandHeroSrcset(OS_URL)).not.toBeNull();
    });

    it("srcset contains 400w, 800w, and 1200w entries (OS proxy widths)", () => {
      const result = buildBrandHeroSrcset(OS_URL)!;
      expect(result.srcset).toContain("400w");
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
    });

    it("srcset entries point to /api/img/proxy with the encoded OS URL", () => {
      const result = buildBrandHeroSrcset(OS_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("/api/img/proxy");
        expect(entry).toContain(ENCODED_OS);
      }
    });

    it("src is the 800w OS proxy URL", () => {
      const result = buildBrandHeroSrcset(OS_URL)!;
      expect(result.src).toContain("/api/img/proxy");
      expect(result.src).toContain("w=800");
      expect(result.src).toContain(ENCODED_OS);
    });

    it("sizes defaults to BRAND_HERO_SIZES", () => {
      const result = buildBrandHeroSrcset(OS_URL)!;
      expect(result.sizes).toBe(BRAND_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 100vw, 1000px";
      const result = buildBrandHeroSrcset(OS_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for an OS storage URL", () => {
      const result = buildBrandHeroSrcset(OS_URL)!;
      expect(result.srcset).toBe(
        `/api/img/proxy?url=${ENCODED_OS}&w=400&f=webp 400w, ` +
          `/api/img/proxy?url=${ENCODED_OS}&w=800&f=webp 800w, ` +
          `/api/img/proxy?url=${ENCODED_OS}&w=1200&f=webp 1200w`,
      );
    });
  });

  // ── Branch 3: static asset / fallback URL → null ────────────────────────

  describe("static / fallback URL → null (no srcset)", () => {
    it("returns null for a bundled static PNG path (AI-generated cover image)", () => {
      expect(buildBrandHeroSrcset(STATIC_URL)).toBeNull();
    });

    it("returns null for an arbitrary external image URL", () => {
      expect(buildBrandHeroSrcset("https://cdn.example.com/brand-cover.jpg")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(buildBrandHeroSrcset("")).toBeNull();
    });

    it("returns null for a data: URI", () => {
      expect(buildBrandHeroSrcset("data:image/png;base64,abc")).toBeNull();
    });

    it("returns null for a non-catalog-proxy /api/ path", () => {
      expect(buildBrandHeroSrcset("/api/img/proxy?url=https://example.com/img.jpg")).toBeNull();
    });
  });

  // ── BRAND_HERO_SIZES constant ────────────────────────────────────────────

  describe("BRAND_HERO_SIZES", () => {
    it("matches the full-width hero layout constraint (content cap at 1280px)", () => {
      expect(BRAND_HERO_SIZES).toBe("(max-width: 1280px) 100vw, 1280px");
    });
  });
});
