import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error - plain ESM module (no bundled types)
import {
  BLOG_HERO_VARIANT_WIDTHS,
  isVariantFile,
  listHeroSlugs,
  variantFileName,
  variantSuffixRegex,
} from "../../blog-hero-variants.mjs";

describe("blog-hero-variants shared module", () => {
  it("exposes the 480/768 variant widths used by buildSrcSet callers", () => {
    expect(BLOG_HERO_VARIANT_WIDTHS).toEqual([480, 768]);
  });

  it("identifies generated variant files by their known-width suffix", () => {
    expect(isVariantFile("spring-480.webp")).toBe(true);
    expect(isVariantFile("spring-768.webp")).toBe(true);
    expect(isVariantFile("spring.webp")).toBe(false);
    // A slug ending in an unrelated number is NOT a variant.
    expect(isVariantFile("top-10-gifts.webp")).toBe(false);
    // A width not in the set is NOT treated as a variant.
    expect(isVariantFile("spring-1200.webp")).toBe(false);
  });

  it("derives the variant filename for a slug + width", () => {
    expect(variantFileName("spring", 480)).toBe("spring-480.webp");
    expect(variantFileName("spring", 768)).toBe("spring-768.webp");
  });

  it("matches case-insensitively on the .webp extension", () => {
    expect(variantSuffixRegex().test("spring-480.WEBP")).toBe(true);
  });

  it("lists only original heroes (skipping width variants) sorted by name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-heroes-"));
    const blog = path.join(dir, "blog");
    fs.mkdirSync(blog);
    for (const name of [
      "b-hero.webp",
      "b-hero-480.webp",
      "b-hero-768.webp",
      "a-hero.webp",
      "a-hero-480.webp",
      "notes.txt",
    ]) {
      fs.writeFileSync(path.join(blog, name), "x");
    }
    expect(listHeroSlugs(blog)).toEqual(["a-hero", "b-hero"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty list for a missing directory", () => {
    expect(listHeroSlugs("/no/such/dir/blog")).toEqual([]);
  });
});
