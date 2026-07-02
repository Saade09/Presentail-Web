import { describe, it, expect } from "vitest";
import {
  buildOccasionHeroSrcset,
  OCCASION_HERO_SIZES,
} from "./imageUtils";

// ---------------------------------------------------------------------------
// buildOccasionHeroSrcset — the heroSrcsetResult logic from Shop.tsx
// ---------------------------------------------------------------------------
//
// This suite locks down the three-branch decision tree that runs for the
// occasion and category detail page hero banner in Shop.tsx.  If the layout
// changes and the sizes hint needs to be updated the test will catch any
// accidental regression in which URL types get which srcset strategy.

const OCCASION_CATALOG_URL = "/api/catalog/occasion-image/birthday";
const CATEGORY_CATALOG_URL = "/api/catalog/category-image/hand-bouquets";
const OS_URL = "https://os.presentail.com/api/storage/occasions/birthday.webp";
const STATIC_URL = "/assets/occasion-birthday.png";
const ENCODED_OS = encodeURIComponent(OS_URL);

describe("buildOccasionHeroSrcset", () => {
  // ── Branch 1: catalog proxy URL ─────────────────────────────────────────

  describe("catalog proxy URL → buildCatalogHeroImageSrcset with occasion hero sizes", () => {
    it("returns a non-null result for an occasion-image URL", () => {
      expect(buildOccasionHeroSrcset(OCCASION_CATALOG_URL)).not.toBeNull();
    });

    it("returns a non-null result for a category-image URL", () => {
      expect(buildOccasionHeroSrcset(CATEGORY_CATALOG_URL)).not.toBeNull();
    });

    it("srcset contains 800w, 1200w, and 1600w entries (catalog hero widths)", () => {
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL)!;
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
      expect(result.srcset).toContain("1600w");
    });

    it("srcset entries use ?w=…&f=webp (catalog proxy params)", () => {
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("f=webp");
        expect(entry.startsWith(OCCASION_CATALOG_URL)).toBe(true);
      }
    });

    it("src is the 1200w proxy URL", () => {
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL)!;
      expect(result.src).toBe(`${OCCASION_CATALOG_URL}?w=1200&f=webp`);
    });

    it("sizes defaults to OCCASION_HERO_SIZES", () => {
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL)!;
      expect(result.sizes).toBe(OCCASION_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 100vw, 900px";
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for an occasion-image URL", () => {
      const result = buildOccasionHeroSrcset(OCCASION_CATALOG_URL)!;
      expect(result.srcset).toBe(
        `${OCCASION_CATALOG_URL}?w=800&f=webp 800w, ` +
          `${OCCASION_CATALOG_URL}?w=1200&f=webp 1200w, ` +
          `${OCCASION_CATALOG_URL}?w=1600&f=webp 1600w`,
      );
    });

    it("produces the exact srcset string for a category-image URL", () => {
      const result = buildOccasionHeroSrcset(CATEGORY_CATALOG_URL)!;
      expect(result.srcset).toBe(
        `${CATEGORY_CATALOG_URL}?w=800&f=webp 800w, ` +
          `${CATEGORY_CATALOG_URL}?w=1200&f=webp 1200w, ` +
          `${CATEGORY_CATALOG_URL}?w=1600&f=webp 1600w`,
      );
    });
  });

  // ── Branch 2: OS storage URL ─────────────────────────────────────────────

  describe("OS storage URL → buildOsImageSrcset with occasion hero sizes", () => {
    it("returns a non-null result", () => {
      expect(buildOccasionHeroSrcset(OS_URL)).not.toBeNull();
    });

    it("srcset contains 400w, 800w, and 1200w entries (OS proxy widths)", () => {
      const result = buildOccasionHeroSrcset(OS_URL)!;
      expect(result.srcset).toContain("400w");
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
    });

    it("srcset entries point to /api/img/proxy with the encoded OS URL", () => {
      const result = buildOccasionHeroSrcset(OS_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("/api/img/proxy");
        expect(entry).toContain(ENCODED_OS);
      }
    });

    it("src is the 800w OS proxy URL", () => {
      const result = buildOccasionHeroSrcset(OS_URL)!;
      expect(result.src).toContain("/api/img/proxy");
      expect(result.src).toContain("w=800");
      expect(result.src).toContain(ENCODED_OS);
    });

    it("sizes defaults to OCCASION_HERO_SIZES", () => {
      const result = buildOccasionHeroSrcset(OS_URL)!;
      expect(result.sizes).toBe(OCCASION_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 100vw, 1000px";
      const result = buildOccasionHeroSrcset(OS_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for an OS storage URL", () => {
      const result = buildOccasionHeroSrcset(OS_URL)!;
      expect(result.srcset).toBe(
        `/api/img/proxy?url=${ENCODED_OS}&w=400&f=webp 400w, ` +
          `/api/img/proxy?url=${ENCODED_OS}&w=800&f=webp 800w, ` +
          `/api/img/proxy?url=${ENCODED_OS}&w=1200&f=webp 1200w`,
      );
    });
  });

  // ── Branch 3: static asset / fallback URL → null ────────────────────────

  describe("static / fallback URL → null (no srcset)", () => {
    it("returns null for a bundled static PNG path", () => {
      expect(buildOccasionHeroSrcset(STATIC_URL)).toBeNull();
    });

    it("returns null for an arbitrary external image URL", () => {
      expect(buildOccasionHeroSrcset("https://cdn.example.com/occasion.jpg")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(buildOccasionHeroSrcset("")).toBeNull();
    });

    it("returns null for a data: URI", () => {
      expect(buildOccasionHeroSrcset("data:image/png;base64,abc")).toBeNull();
    });

    it("returns null for a non-catalog-proxy /api/ path", () => {
      expect(buildOccasionHeroSrcset("/api/img/proxy?url=https://example.com/img.jpg")).toBeNull();
    });

    it("returns null for a catalog asset path (not a proxy URL)", () => {
      expect(buildOccasionHeroSrcset("/catalog/occasions/birthday.webp")).toBeNull();
    });
  });

  // ── OCCASION_HERO_SIZES constant ─────────────────────────────────────────

  describe("OCCASION_HERO_SIZES", () => {
    it("matches the full-width hero layout constraint (content cap at 1280px)", () => {
      expect(OCCASION_HERO_SIZES).toBe("(max-width: 1280px) 100vw, 1280px");
    });
  });
});
