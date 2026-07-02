import { describe, it, expect } from "vitest";
import {
  buildCategoryHeroSrcset,
  CATEGORY_CARD_HERO_SIZES,
} from "./imageUtils";

// ---------------------------------------------------------------------------
// buildCategoryHeroSrcset — the heroSrcsetResult logic from CategoriesGrid
// ---------------------------------------------------------------------------
//
// This suite locks down the three-branch decision tree that runs for the first
// (hero) category card.  If the layout changes and the sizes hint needs to be
// updated the test will catch any accidental regression in which URL types get
// which srcset strategy.

const CATALOG_URL = "/api/catalog/category-image/hand-bouquets";
const OS_URL = "https://os.presentail.com/api/storage/categories/bouquets.webp";
const STATIC_URL = "/assets/category-bouquets.png";  // bundled static asset
const ENCODED_OS = encodeURIComponent(OS_URL);

describe("buildCategoryHeroSrcset", () => {
  // ── Branch 1: catalog proxy URL ─────────────────────────────────────────

  describe("catalog proxy URL → buildCatalogHeroImageSrcset with hero sizes", () => {
    it("returns a non-null result", () => {
      expect(buildCategoryHeroSrcset(CATALOG_URL)).not.toBeNull();
    });

    it("srcset contains 800w, 1200w, and 1600w entries (catalog hero widths)", () => {
      const result = buildCategoryHeroSrcset(CATALOG_URL)!;
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
      expect(result.srcset).toContain("1600w");
    });

    it("srcset entries use ?w=…&f=webp (catalog proxy params)", () => {
      const result = buildCategoryHeroSrcset(CATALOG_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("f=webp");
        expect(entry.startsWith(CATALOG_URL)).toBe(true);
      }
    });

    it("src is the 1200w proxy URL", () => {
      const result = buildCategoryHeroSrcset(CATALOG_URL)!;
      expect(result.src).toBe(`${CATALOG_URL}?w=1200&f=webp`);
    });

    it("sizes defaults to CATEGORY_CARD_HERO_SIZES", () => {
      const result = buildCategoryHeroSrcset(CATALOG_URL)!;
      expect(result.sizes).toBe(CATEGORY_CARD_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 50vw, 800px";
      const result = buildCategoryHeroSrcset(CATALOG_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for a category-image URL", () => {
      const result = buildCategoryHeroSrcset(CATALOG_URL)!;
      expect(result.srcset).toBe(
        `${CATALOG_URL}?w=800&f=webp 800w, ` +
          `${CATALOG_URL}?w=1200&f=webp 1200w, ` +
          `${CATALOG_URL}?w=1600&f=webp 1600w`,
      );
    });
  });

  // ── Branch 2: OS storage URL ─────────────────────────────────────────────

  describe("OS storage URL → buildOsImageSrcset with hero sizes", () => {
    it("returns a non-null result", () => {
      expect(buildCategoryHeroSrcset(OS_URL)).not.toBeNull();
    });

    it("srcset contains 400w, 800w, and 1200w entries (OS proxy widths)", () => {
      const result = buildCategoryHeroSrcset(OS_URL)!;
      expect(result.srcset).toContain("400w");
      expect(result.srcset).toContain("800w");
      expect(result.srcset).toContain("1200w");
    });

    it("srcset entries point to /api/img/proxy with the encoded OS URL", () => {
      const result = buildCategoryHeroSrcset(OS_URL)!;
      for (const entry of result.srcset.split(", ")) {
        expect(entry).toContain("/api/img/proxy");
        expect(entry).toContain(ENCODED_OS);
      }
    });

    it("src is the 800w OS proxy URL", () => {
      const result = buildCategoryHeroSrcset(OS_URL)!;
      expect(result.src).toContain("/api/img/proxy");
      expect(result.src).toContain("w=800");
      expect(result.src).toContain(ENCODED_OS);
    });

    it("sizes defaults to CATEGORY_CARD_HERO_SIZES", () => {
      const result = buildCategoryHeroSrcset(OS_URL)!;
      expect(result.sizes).toBe(CATEGORY_CARD_HERO_SIZES);
    });

    it("passes a custom sizes override through to the result", () => {
      const custom = "(max-width: 640px) 100vw, 1000px";
      const result = buildCategoryHeroSrcset(OS_URL, custom)!;
      expect(result.sizes).toBe(custom);
    });

    it("produces the exact srcset string for an OS storage URL", () => {
      const result = buildCategoryHeroSrcset(OS_URL)!;
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
      expect(buildCategoryHeroSrcset(STATIC_URL)).toBeNull();
    });

    it("returns null for an arbitrary external image URL", () => {
      expect(buildCategoryHeroSrcset("https://cdn.example.com/flowers.jpg")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(buildCategoryHeroSrcset("")).toBeNull();
    });

    it("returns null for a data: URI", () => {
      expect(buildCategoryHeroSrcset("data:image/png;base64,abc")).toBeNull();
    });

    it("returns null for an Unsplash URL (not a catalog proxy or OS storage URL)", () => {
      expect(buildCategoryHeroSrcset("https://images.unsplash.com/photo?w=800")).toBeNull();
    });
  });

  // ── CATEGORY_CARD_HERO_SIZES constant ───────────────────────────────────

  describe("CATEGORY_CARD_HERO_SIZES", () => {
    it("matches the sizes string used for the first card in the grid layout", () => {
      expect(CATEGORY_CARD_HERO_SIZES).toBe("(max-width: 768px) 25vw, 600px");
    });
  });
});
