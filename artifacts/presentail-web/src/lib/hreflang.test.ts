import { describe, it, expect } from "vitest";
import { buildHreflangSet, CANONICAL_CITY, ALL_COUNTRIES } from "./hreflang.mjs";

describe("buildHreflangSet — full set", () => {
  it("emits 10 entries for all three countries (9 locales + x-default)", () => {
    const result = buildHreflangSet("product/roses", ["lb", "ae", "cy"], "https://presentail.com");
    expect(result).toHaveLength(10);
  });

  it("emits entries in lb → ae → cy language order (en, ar, fr per country)", () => {
    const result = buildHreflangSet("product/roses", ["lb", "ae", "cy"], "https://presentail.com");
    const codes = result.map((e) => e.hreflang);
    expect(codes).toEqual([
      "en-LB", "ar-LB", "fr-LB",
      "en-AE", "ar-AE", "fr-AE",
      "en-CY", "ar-CY", "fr-CY",
      "x-default",
    ]);
  });

  it("uses canonical cities (not the requesting city)", () => {
    const result = buildHreflangSet("product/roses", ["lb", "ae", "cy"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    const enAE = result.find((e) => e.hreflang === "en-AE")!;
    const enCY = result.find((e) => e.hreflang === "en-CY")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/product/roses");
    expect(enAE.href).toBe("https://presentail.com/en-ae/dubai/product/roses");
    expect(enCY.href).toBe("https://presentail.com/en-cy/limassol/product/roses");
  });

  it("x-default always points to en-lb/beirut regardless of which countries are requested", () => {
    const result = buildHreflangSet("product/roses", ["lb", "ae", "cy"], "https://presentail.com");
    const xDefault = result.find((e) => e.hreflang === "x-default")!;
    expect(xDefault.href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });
});

describe("buildHreflangSet — availability gating", () => {
  it("emits 7 entries when CY is excluded (no CY alternates)", () => {
    const result = buildHreflangSet("product/roses", ["lb", "ae"], "https://presentail.com");
    expect(result).toHaveLength(7);
    const codes = result.map((e) => e.hreflang);
    expect(codes).toEqual([
      "en-LB", "ar-LB", "fr-LB",
      "en-AE", "ar-AE", "fr-AE",
      "x-default",
    ]);
    expect(codes.some((c) => c.includes("CY"))).toBe(false);
  });

  it("emits 4 entries when only LB is available (3 LB + x-default)", () => {
    const result = buildHreflangSet("shop", ["lb"], "https://presentail.com");
    expect(result).toHaveLength(4);
    const codes = result.map((e) => e.hreflang);
    expect(codes).toEqual(["en-LB", "ar-LB", "fr-LB", "x-default"]);
  });

  it("returns empty array when availableCountries is empty", () => {
    const result = buildHreflangSet("shop", [], "https://presentail.com");
    expect(result).toHaveLength(0);
  });

  it("preserves lb → ae → cy order even when input order differs", () => {
    const result = buildHreflangSet("shop", ["cy", "lb", "ae"], "https://presentail.com");
    const codes = result.map((e) => e.hreflang);
    expect(codes.slice(0, 3)).toEqual(["en-LB", "ar-LB", "fr-LB"]);
    expect(codes.slice(3, 6)).toEqual(["en-AE", "ar-AE", "fr-AE"]);
    expect(codes.slice(6, 9)).toEqual(["en-CY", "ar-CY", "fr-CY"]);
  });
});

describe("buildHreflangSet — home / empty entityPath", () => {
  it("produces paths without a trailing slash for empty entityPath", () => {
    const result = buildHreflangSet("", ["lb", "ae", "cy"], "https://presentail.com");
    const xDefault = result.find((e) => e.hreflang === "x-default")!;
    expect(xDefault.href).toBe("https://presentail.com/en-lb/beirut");
    expect(xDefault.href).not.toMatch(/\/$/);
  });

  it("emits 10 entries for the home route", () => {
    const result = buildHreflangSet("", ["lb", "ae", "cy"], "https://presentail.com");
    expect(result).toHaveLength(10);
  });

  it("uses canonical city in locale hrefs for home", () => {
    const result = buildHreflangSet("", ["lb"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut");
  });
});

describe("buildHreflangSet — input normalisation", () => {
  it("strips a leading slash from entityPath", () => {
    const result = buildHreflangSet("/product/roses", ["lb"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });

  it("strips a query string from entityPath", () => {
    const result = buildHreflangSet("product/roses?orderby=price", ["lb", "ae", "cy"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/product/roses");
  });

  it("strips a fragment from entityPath", () => {
    const result = buildHreflangSet("shop#section", ["lb"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("strips a trailing slash from entityPath", () => {
    const result = buildHreflangSet("shop/", ["lb"], "https://presentail.com");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("strips a trailing slash from origin", () => {
    const result = buildHreflangSet("shop", ["lb"], "https://presentail.com/");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/en-lb/beirut/shop");
  });

  it("returns empty array when origin is empty", () => {
    const result = buildHreflangSet("shop", ["lb", "ae", "cy"], "");
    expect(result).toHaveLength(0);
  });
});

describe("buildHreflangSet — base path prefix", () => {
  it("prepends the base path prefix from origin when provided", () => {
    const result = buildHreflangSet("shop", ["lb"], "https://presentail.com/web");
    const enLB = result.find((e) => e.hreflang === "en-LB")!;
    expect(enLB.href).toBe("https://presentail.com/web/en-lb/beirut/shop");
  });
});

describe("CANONICAL_CITY", () => {
  it("has the correct canonical city for each country", () => {
    expect(CANONICAL_CITY.lb).toBe("beirut");
    expect(CANONICAL_CITY.ae).toBe("dubai");
    expect(CANONICAL_CITY.cy).toBe("limassol");
  });
});

describe("ALL_COUNTRIES", () => {
  it("contains all three supported countries in lb → ae → cy order", () => {
    expect(ALL_COUNTRIES).toEqual(["lb", "ae", "cy"]);
  });
});
