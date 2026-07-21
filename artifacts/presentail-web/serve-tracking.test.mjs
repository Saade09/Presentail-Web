// @vitest-environment node
/**
 * Unit tests for serve-tracking.mjs — tracking-parameter stripping helpers
 * used by serve.mjs before emitting any server-side 301/302 Location header.
 *
 * Regression target: any change to TRACKING_EXACT, TRACKING_PREFIXES, or the
 * stripping logic that would allow utm_*, srsltid, or other tracking params to
 * survive into a redirect Location header.
 */

import { describe, it, expect } from "vitest";
import {
  isTrackingParam,
  stripTrackingParams,
  stripTrackingParamsFromReqUrl,
} from "./serve-tracking.mjs";

// ---------------------------------------------------------------------------
// isTrackingParam
// ---------------------------------------------------------------------------
describe("isTrackingParam", () => {
  it("identifies utm_source as a tracking param", () => {
    expect(isTrackingParam("utm_source")).toBe(true);
  });

  it("identifies all utm_ prefixed params as tracking", () => {
    const utmKeys = [
      "utm_source", "utm_medium", "utm_campaign",
      "utm_content", "utm_term", "utm_id",
    ];
    for (const key of utmKeys) {
      expect(isTrackingParam(key), `expected ${key} to be a tracking param`).toBe(true);
    }
  });

  it("identifies exact-match tracking params", () => {
    const exact = [
      "srsltid", "fbclid", "gclid", "gad_source", "ttclid",
      "msclkid", "twclid", "igshid", "mc_cid", "mc_eid",
      "dclid", "wbraid", "gbraid",
    ];
    for (const key of exact) {
      expect(isTrackingParam(key), `expected ${key} to be a tracking param`).toBe(true);
    }
  });

  it("does not flag ordinary query params as tracking", () => {
    const safe = ["page", "category", "ref", "q", "sort", "color", "size", "lang"];
    for (const key of safe) {
      expect(isTrackingParam(key), `expected ${key} NOT to be a tracking param`).toBe(false);
    }
  });

  it("does not flag params that merely contain 'utm' without the prefix", () => {
    expect(isTrackingParam("utm")).toBe(false);
    expect(isTrackingParam("autm_source")).toBe(false);
    expect(isTrackingParam("notutm_campaign")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripTrackingParams — search-string inputs
// ---------------------------------------------------------------------------
describe("stripTrackingParams", () => {
  it("returns empty string for empty / missing input", () => {
    expect(stripTrackingParams("")).toBe("");
    expect(stripTrackingParams(null)).toBe("");
    expect(stripTrackingParams(undefined)).toBe("");
  });

  it("strips a standalone utm_source param", () => {
    expect(stripTrackingParams("?utm_source=google")).toBe("");
  });

  it("strips srsltid (Google Shopping click id)", () => {
    expect(stripTrackingParams("?srsltid=AItRSTMVXvH2cJkD")).toBe("");
  });

  it("strips all utm_* params", () => {
    expect(
      stripTrackingParams("?utm_source=google&utm_medium=cpc&utm_campaign=spring"),
    ).toBe("");
  });

  it("preserves non-tracking params when tracking params are present", () => {
    expect(stripTrackingParams("?utm_source=google&page=2")).toBe("?page=2");
    expect(stripTrackingParams("?page=2&utm_source=google")).toBe("?page=2");
    expect(stripTrackingParams("?category=roses&utm_medium=cpc&sort=asc")).toBe(
      "?category=roses&sort=asc",
    );
  });

  it("preserves all params when none are tracking params", () => {
    expect(stripTrackingParams("?page=2&sort=asc&category=roses")).toBe(
      "?page=2&sort=asc&category=roses",
    );
  });

  it("strips mixed tracking and non-tracking params (utm_ + srsltid)", () => {
    expect(
      stripTrackingParams("?utm_source=google&srsltid=abc&ref=newsletter"),
    ).toBe("?ref=newsletter");
  });

  it("strips fbclid and gclid", () => {
    expect(stripTrackingParams("?fbclid=IwAR123&gclid=Cj0KCQ")).toBe("");
    expect(stripTrackingParams("?q=roses&fbclid=IwAR123")).toBe("?q=roses");
  });

  it("accepts input without a leading '?' (bare query string)", () => {
    expect(stripTrackingParams("utm_source=google")).toBe("");
    expect(stripTrackingParams("page=2&utm_source=google")).toBe("?page=2");
  });

  it("returns empty string when only a '?' is given", () => {
    expect(stripTrackingParams("?")).toBe("");
  });

  it("preserves URL-encoded param values unchanged", () => {
    expect(stripTrackingParams("?q=red+roses&utm_source=email")).toBe("?q=red+roses");
  });

  it("strips gad_source, msclkid, ttclid, twclid", () => {
    const allTracking =
      "?gad_source=1&msclkid=abc&ttclid=123&twclid=xyz&wbraid=wb&gbraid=gb&dclid=dc";
    expect(stripTrackingParams(allTracking)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// stripTrackingParamsFromReqUrl — Node req.url inputs
// ---------------------------------------------------------------------------
describe("stripTrackingParamsFromReqUrl", () => {
  it("returns '/' for null/undefined input", () => {
    expect(stripTrackingParamsFromReqUrl(null)).toBe("/");
    expect(stripTrackingParamsFromReqUrl(undefined)).toBe("/");
  });

  it("returns path unchanged when there is no query string", () => {
    expect(stripTrackingParamsFromReqUrl("/en-lb/beirut/shop")).toBe(
      "/en-lb/beirut/shop",
    );
    expect(stripTrackingParamsFromReqUrl("/")).toBe("/");
  });

  it("strips utm_* from a locale path — trailing-slash redirect scenario", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-lb/beirut/shop/?utm_source=google&utm_medium=cpc"),
    ).toBe("/en-lb/beirut/shop/");
  });

  it("strips srsltid from a product path — www/new-subdomain redirect scenario", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-lb/beirut/product/red-roses?srsltid=AItRSTMVXvH2cJkD"),
    ).toBe("/en-lb/beirut/product/red-roses");
  });

  it("preserves non-tracking params while stripping tracking ones", () => {
    expect(
      stripTrackingParamsFromReqUrl("/shop?category=roses&utm_source=email&sort=asc"),
    ).toBe("/shop?category=roses&sort=asc");
  });

  it("removes query string entirely when all params are tracking params", () => {
    expect(
      stripTrackingParamsFromReqUrl("/about?utm_source=google&utm_campaign=summer&srsltid=abc"),
    ).toBe("/about");
  });

  it("handles root path with only tracking params", () => {
    expect(
      stripTrackingParamsFromReqUrl("/?utm_source=google&fbclid=IwAR123"),
    ).toBe("/");
  });

  it("keeps the path intact including the trailing slash", () => {
    expect(
      stripTrackingParamsFromReqUrl("/en-ae/dubai/?gclid=Cj0K&page=2"),
    ).toBe("/en-ae/dubai/?page=2");
  });
});

// ---------------------------------------------------------------------------
// End-to-end scenario: simulate the three redirect locations in serve.mjs
// ---------------------------------------------------------------------------
describe("redirect Location header scenarios (serve.mjs)", () => {
  const apexOrigin = "https://presentail.com";

  it("www-redirect: srsltid does not appear in Location header", () => {
    const reqUrl = "/en-lb/beirut/product/bouquet?srsltid=AItRSTM&utm_source=google";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-lb/beirut/product/bouquet");
    expect(location).not.toContain("srsltid");
    expect(location).not.toContain("utm_");
  });

  it("www-redirect: non-tracking params survive in Location header", () => {
    const reqUrl = "/en-lb/beirut/shop?category=roses&utm_source=google&page=2";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-lb/beirut/shop?category=roses&page=2");
    expect(location).not.toContain("utm_");
  });

  it("www-redirect: path-only URL (no query) is unchanged", () => {
    const reqUrl = "/en-ae/dubai/shop";
    const location = `${apexOrigin}${stripTrackingParamsFromReqUrl(reqUrl)}`;
    expect(location).toBe("https://presentail.com/en-ae/dubai/shop");
  });

  it("trailing-slash redirect: utm_* removed from Location header", () => {
    const cleanPath = "/en-lb/beirut/shop";
    const urlSearch = "?utm_source=google&utm_campaign=spring";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/shop");
    expect(location).not.toContain("utm_");
  });

  it("trailing-slash redirect: srsltid removed from Location header", () => {
    const cleanPath = "/en-lb/beirut/faqs";
    const urlSearch = "?srsltid=AItRSTMVXvH2&ref=home";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/faqs?ref=home");
    expect(location).not.toContain("srsltid");
  });

  it("trailing-slash redirect: no query string produces no '?' in Location", () => {
    const cleanPath = "/en-lb/beirut/brands";
    const urlSearch = "";
    const location = cleanPath + stripTrackingParams(urlSearch);
    expect(location).toBe("/en-lb/beirut/brands");
  });
});
