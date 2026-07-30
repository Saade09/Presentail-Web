import { describe, it, expect } from "vitest";
import {
  buildHreflangSet,
  remapPathnameToHubCity,
  HUB_CITY,
  ALL_COUNTRIES,
} from "./hreflang.mjs";

describe("buildHreflangSet — intra-city cluster", () => {
  it("emits 4 entries (en, ar, fr + x-default) for a single city", () => {
    const result = buildHreflangSet(
      "product/roses",
      { country: "lb", city: "beirut" },
      "https://presentail.com",
    );
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.hreflang)).toEqual(["en-LB", "ar-LB", "fr-LB", "x-default"]);
  });

  it("uses the passed city — never a different city or country", () => {
    const result = buildHreflangSet(
      "product/roses",
      { country: "lb", city: "tripoli" },
      "https://presentail.com",
    );
    expect(result.map((e) => e.href)).toEqual([
      "https://presentail.com/en-lb/tripoli/product/roses",
      "https://presentail.com/ar-lb/tripoli/product/roses",
      "https://presentail.com/fr-lb/tripoli/product/roses",
      "https://presentail.com/en-lb/tripoli/product/roses",
    ]);
  });

  it("never emits cross-country alternates", () => {
    const result = buildHreflangSet(
      "shop",
      { country: "ae", city: "dubai" },
      "https://presentail.com",
    );
    const codes = result.map((e) => e.hreflang);
    expect(codes).toEqual(["en-AE", "ar-AE", "fr-AE", "x-default"]);
    expect(codes.some((c) => c.includes("LB") || c.includes("CY"))).toBe(false);
  });

  it("x-default points at the en variant of the SAME city", () => {
    const result = buildHreflangSet(
      "shop",
      { country: "cy", city: "larnaca" },
      "https://presentail.com",
    );
    const xDefault = result.find((e) => e.hreflang === "x-default")!;
    expect(xDefault.href).toBe("https://presentail.com/en-cy/larnaca/shop");
  });

  it("the cluster contains the page itself (self-reference)", () => {
    // An ar-AE page for /ar-ae/sharjah/shop must appear in its own cluster.
    const result = buildHreflangSet(
      "shop",
      { country: "ae", city: "sharjah" },
      "https://presentail.com",
    );
    const arAE = result.find((e) => e.hreflang === "ar-AE")!;
    expect(arAE.href).toBe("https://presentail.com/ar-ae/sharjah/shop");
  });
});

describe("buildHreflangSet — suppression / invalid input", () => {
  it("returns empty array when origin is empty", () => {
    expect(buildHreflangSet("shop", { country: "lb", city: "beirut" }, "")).toHaveLength(0);
  });

  it("returns empty array when country is missing", () => {
    expect(
      buildHreflangSet("shop", { country: undefined, city: "beirut" }, "https://presentail.com"),
    ).toHaveLength(0);
  });

  it("returns empty array when country is unsupported", () => {
    expect(
      buildHreflangSet("shop", { country: "us", city: "nyc" }, "https://presentail.com"),
    ).toHaveLength(0);
  });

  it("returns empty array when city is missing", () => {
    expect(
      buildHreflangSet("shop", { country: "lb", city: "" }, "https://presentail.com"),
    ).toHaveLength(0);
  });
});

describe("buildHreflangSet — home / empty entityPath", () => {
  it("produces paths without a trailing slash for empty entityPath", () => {
    const result = buildHreflangSet("", { country: "lb", city: "beirut" }, "https://presentail.com");
    const xDefault = result.find((e) => e.hreflang === "x-default")!;
    expect(xDefault.href).toBe("https://presentail.com/en-lb/beirut");
    expect(xDefault.href).not.toMatch(/\/$/);
  });

  it("emits 4 entries for the home route", () => {
    const result = buildHreflangSet("", { country: "lb", city: "beirut" }, "https://presentail.com");
    expect(result).toHaveLength(4);
  });
});

describe("buildHreflangSet — input normalisation", () => {
  const LOC = { country: "lb", city: "beirut" };

  it("strips a leading slash from entityPath", () => {
    const result = buildHreflangSet("/product/roses", LOC, "https://presentail.com");
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });

  it("strips a query string from entityPath", () => {
    const result = buildHreflangSet("product/roses?orderby=price", LOC, "https://presentail.com");
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });

  it("strips a fragment from entityPath", () => {
    const result = buildHreflangSet("shop#section", LOC, "https://presentail.com");
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("strips a trailing slash from entityPath", () => {
    const result = buildHreflangSet("shop/", LOC, "https://presentail.com");
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("strips a trailing slash from origin", () => {
    const result = buildHreflangSet("shop", LOC, "https://presentail.com/");
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/shop");
  });
});

describe("buildHreflangSet — base path prefix", () => {
  it("prepends the base path prefix from origin when provided", () => {
    const result = buildHreflangSet(
      "shop",
      { country: "lb", city: "beirut" },
      "https://presentail.com/web",
    );
    expect(result[0].href).toBe("https://presentail.com/web/en-lb/beirut/shop");
  });
});

describe("buildHreflangSet — tracking params in entityPath", () => {
  it("strips srsltid/utm_source from alternate hrefs", () => {
    const result = buildHreflangSet(
      "product/roses?srsltid=test123&utm_source=google",
      { country: "lb", city: "beirut" },
      "https://presentail.com",
    );
    expect(result).toHaveLength(4);
    for (const { href } of result) {
      expect(href).not.toContain("srsltid");
      expect(href).not.toContain("utm_source");
      expect(href).toContain("/product/roses");
    }
  });

  it("strips gclid and fbclid from alternate hrefs", () => {
    const result = buildHreflangSet(
      "product/roses?gclid=Cj0abc&fbclid=xyz",
      { country: "lb", city: "beirut" },
      "https://presentail.com",
    );
    expect(result[0].href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });
});

describe("HUB_CITY", () => {
  it("has the correct hub city for each country (matches SITEMAP_CANONICAL_CITIES)", () => {
    expect(HUB_CITY.lb).toBe("beirut");
    expect(HUB_CITY.ae).toBe("dubai");
    expect(HUB_CITY.cy).toBe("nicosia");
  });
});

describe("ALL_COUNTRIES", () => {
  it("contains all three supported countries in lb → ae → cy order", () => {
    expect(ALL_COUNTRIES).toEqual(["lb", "ae", "cy"]);
  });
});

describe("remapPathnameToHubCity", () => {
  it("remaps a non-hub city to the hub city, preserving the rest", () => {
    expect(remapPathnameToHubCity("/en-lb/tripoli/product/roses")).toBe(
      "/en-lb/beirut/product/roses",
    );
    expect(remapPathnameToHubCity("/ar-ae/sharjah/brand/patchi")).toBe(
      "/ar-ae/dubai/brand/patchi",
    );
    expect(remapPathnameToHubCity("/fr-cy/limassol/category/roses")).toBe(
      "/fr-cy/nicosia/category/roses",
    );
  });

  it("leaves hub-city paths unchanged", () => {
    expect(remapPathnameToHubCity("/en-lb/beirut/product/roses")).toBe(
      "/en-lb/beirut/product/roses",
    );
    expect(remapPathnameToHubCity("/en-ae/dubai/occasion/birthday")).toBe(
      "/en-ae/dubai/occasion/birthday",
    );
  });

  it("leaves city-only paths at the hub city (no trailing rest)", () => {
    expect(remapPathnameToHubCity("/en-lb/tripoli")).toBe("/en-lb/beirut");
  });

  it("passes through non-locale paths unchanged", () => {
    expect(remapPathnameToHubCity("/")).toBe("/");
    expect(remapPathnameToHubCity("/cart")).toBe("/cart");
    expect(remapPathnameToHubCity("/favorites/share/abc12345")).toBe(
      "/favorites/share/abc12345",
    );
  });

  it("passes through unknown-country locale paths unchanged", () => {
    expect(remapPathnameToHubCity("/en-us/nyc/product/roses")).toBe(
      "/en-us/nyc/product/roses",
    );
  });
});
