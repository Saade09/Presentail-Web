/**
 * Unit tests for buildCanonicalUrl — faceted-navigation crawl-budget controls.
 *
 * Tests that filter/utility and tracking parameters are stripped from canonical
 * URLs while keeping non-filter params and respecting CURATED_FILTER_PAGES.
 */

import { describe, it, expect } from "vitest";
import {
  buildCanonicalUrl,
  FILTER_PARAMS,
  CURATED_FILTER_PAGES,
  CuratedFilterPage,
} from "./canonicalNorm.js";

const ORIGIN = "https://presentail.com";

describe("buildCanonicalUrl — filter param stripping", () => {
  it("strips sort and page from a category URL", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/category/flowers?sort=price-asc&page=2",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/category/flowers`);
  });

  it("strips currency and utm_source from a shop URL", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?currency=usd&utm_source=google",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("returns an unchanged URL when no filter params are present", () => {
    const result = buildCanonicalUrl("/en-lb/beirut/category/flowers", {
      origin: ORIGIN,
    });
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/category/flowers`);
  });

  it("strips occasion from a shop URL (already redirected to path in canonical form)", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?occasion=birthday",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("strips category param from a shop URL", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?category=roses",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("strips delivery param", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?delivery=today",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("strips availability, price_min, price_max", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?availability=in-stock&price_min=10&price_max=100",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("strips ref, from, scroll", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/category/flowers?ref=homepage&from=banner&scroll=200",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/category/flowers`);
  });

  it("strips gclid and fbclid", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/product/roses?gclid=abc123&fbclid=xyz",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/product/roses`);
  });

  it("preserves non-filter params", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/shop?customParam=keep&sort=price-asc",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop?customParam=keep`);
  });

  it("strips multiple mixed params in one call", () => {
    const result = buildCanonicalUrl(
      "/en-lb/beirut/category/flowers?sort=price-asc&page=2&utm_source=google&currency=usd",
      { origin: ORIGIN },
    );
    expect(result).toBe(`${ORIGIN}/en-lb/beirut/category/flowers`);
  });
});

describe("buildCanonicalUrl — CURATED_FILTER_PAGES exemption", () => {
  it("preserves params for a curated filter page match", () => {
    const curated: CuratedFilterPage = {
      path: "/en-lb/beirut/shop",
      params: { delivery: "today" },
    };
    CURATED_FILTER_PAGES.push(curated);
    try {
      const result = buildCanonicalUrl(
        "/en-lb/beirut/shop?delivery=today&sort=price-asc",
        { origin: ORIGIN },
      );
      // delivery is curated — canonical preserves it; sort is stripped.
      expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop?delivery=today`);
    } finally {
      CURATED_FILTER_PAGES.pop();
    }
  });

  it("strips params normally when curated params don't match", () => {
    const curated: CuratedFilterPage = {
      path: "/en-lb/beirut/shop",
      params: { delivery: "today" },
    };
    CURATED_FILTER_PAGES.push(curated);
    try {
      const result = buildCanonicalUrl(
        "/en-lb/beirut/shop?delivery=tomorrow&sort=price-asc",
        { origin: ORIGIN },
      );
      expect(result).toBe(`${ORIGIN}/en-lb/beirut/shop`);
    } finally {
      CURATED_FILTER_PAGES.pop();
    }
  });
});

describe("buildCanonicalUrl — basePath prefix", () => {
  it("strips basePath from returned canonical and strips filter params", () => {
    const result = buildCanonicalUrl(
      "/app/en-lb/beirut/shop?sort=price-asc",
      { origin: ORIGIN, basePath: "/app" },
    );
    expect(result).toBe(`${ORIGIN}/app/en-lb/beirut/shop`);
  });
});

describe("FILTER_PARAMS constant", () => {
  const EXPECTED_FILTER_PARAMS = [
    "sort",
    "currency",
    "delivery",
    "availability",
    "price_min",
    "price_max",
    "page",
    "ref",
    "from",
    "scroll",
  ];

  for (const param of EXPECTED_FILTER_PARAMS) {
    it(`includes "${param}"`, () => {
      expect(FILTER_PARAMS.has(param)).toBe(true);
    });
  }

  it("does not include occasion, category, or recipient", () => {
    expect(FILTER_PARAMS.has("occasion")).toBe(false);
    expect(FILTER_PARAMS.has("category")).toBe(false);
    expect(FILTER_PARAMS.has("recipient")).toBe(false);
  });
});
