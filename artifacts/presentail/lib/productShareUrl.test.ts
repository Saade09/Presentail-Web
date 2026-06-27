import { describe, expect, it } from "vitest";

import { buildProductShareUrl, PRODUCT_SHARE_WEB_BASE_URL } from "./productShareUrl";

describe("buildProductShareUrl", () => {
  it("builds the exact canonical URL: https://presentail.com/product/<slug>", () => {
    const url = buildProductShareUrl("gold-chrome-balloons");
    expect(url).toBe("https://presentail.com/product/gold-chrome-balloons");
  });

  it("WEB_BASE_URL constant is https://presentail.com", () => {
    expect(PRODUCT_SHARE_WEB_BASE_URL).toBe("https://presentail.com");
  });

  it("uses https://presentail.com as the origin (never the old new. subdomain)", () => {
    const url = buildProductShareUrl("roses");
    expect(url.startsWith("https://presentail.com/")).toBe(true);
    expect(url).not.toContain("://new.presentail.com"); // allow-legacy-domain
  });

  it("always includes /product/ path segment — no locale or city prefix", () => {
    const url = buildProductShareUrl("my-product");
    const parsed = new URL(url);
    // pathname must be exactly /product/<slug> with no leading locale segment
    expect(parsed.pathname.startsWith("/product/")).toBe(true);
    // must NOT contain locale/city segments like /en-lb/beirut/
    expect(parsed.pathname).not.toMatch(/^\/en-[a-z]{2}\//);
  });

  it("does not embed a locale prefix in the URL", () => {
    const url = buildProductShareUrl("tulips");
    expect(url).not.toContain("/en-");
  });

  it("does not embed a city segment in the URL", () => {
    const url = buildProductShareUrl("orchids");
    expect(url).not.toMatch(/\/beirut\//);
    expect(url).not.toMatch(/\/dubai\//);
  });

  it("URL-encodes slugs that contain special characters", () => {
    const url = buildProductShareUrl("bouquet & roses");
    expect(url).toBe("https://presentail.com/product/bouquet%20%26%20roses");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("&");
  });

  // Slug-array coercion guard — useLocalSearchParams may return string[]
  it("coerces a slug array to the first element", () => {
    const url = buildProductShareUrl(["gold-chrome-balloons", "other"]);
    expect(url).toBe("https://presentail.com/product/gold-chrome-balloons");
  });

  it("coerces a single-element slug array", () => {
    const url = buildProductShareUrl(["luxury-box"]);
    expect(url).toBe("https://presentail.com/product/luxury-box");
  });

  it("returns a URL with empty slug when the array is empty", () => {
    const url = buildProductShareUrl([]);
    expect(url).toBe("https://presentail.com/product/");
  });

  // Null / undefined robustness
  it("handles null slug gracefully (defaults to empty string)", () => {
    const url = buildProductShareUrl(null);
    expect(url).toBe("https://presentail.com/product/");
  });

  it("handles undefined slug gracefully (defaults to empty string)", () => {
    const url = buildProductShareUrl(undefined);
    expect(url).toBe("https://presentail.com/product/");
  });

  it("the returned value is a valid URL", () => {
    const url = buildProductShareUrl("red-roses");
    expect(() => new URL(url)).not.toThrow();
  });
});
