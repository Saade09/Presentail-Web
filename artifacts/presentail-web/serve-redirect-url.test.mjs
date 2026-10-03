// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  stripDefaultPort,
  buildRequestOrigin,
  normalizeOrigin,
  filterLegacyRedirectSearch,
  LEGACY_REDIRECT_ALLOWED_PARAMS,
} from "./serve-redirect-url.mjs";

describe("stripDefaultPort", () => {
  it.each([
    ["www.presentail.com:443", "www.presentail.com"],
    ["presentail.com:443", "presentail.com"],
    ["presentail.com:80", "presentail.com"],
    ["presentail.com", "presentail.com"],
    ["localhost:24188", "localhost:24188"],
    ["127.0.0.1:4430", "127.0.0.1:4430"],
  ])("%s → %s", (input, expected) => {
    expect(stripDefaultPort(input)).toBe(expected);
  });
});

describe("buildRequestOrigin", () => {
  it("drops :443 from a proxied host", () => {
    expect(buildRequestOrigin("https", "presentail.com:443")).toBe("https://presentail.com");
  });

  it("drops :443 even when the request arrived over http", () => {
    expect(buildRequestOrigin("http", "www.presentail.com:443")).toBe("http://www.presentail.com");
  });

  it("keeps non-default dev ports", () => {
    expect(buildRequestOrigin("http", "localhost:24188")).toBe("http://localhost:24188");
  });
});

describe("normalizeOrigin", () => {
  it.each([
    ["https://presentail.com:443", "https://presentail.com"],
    ["https://presentail.com", "https://presentail.com"],
    [" https://presentail.com/ ", "https://presentail.com"],
    ["http://localhost:24188", "http://localhost:24188"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });
});

describe("filterLegacyRedirectSearch", () => {
  it("ships with an empty allow-list", () => {
    expect(LEGACY_REDIRECT_ALLOWED_PARAMS.size).toBe(0);
  });

  it.each([
    "?nsl_bypass_cache=6a1f",
    "?_cr=1",
    "?utm_source=google&utm_medium=cpc",
    "?gclid=x&gbraid=y&wbraid=z",
    "?orderby=price&min_price=10&max_price=99",
    "?filter_color=red&sort=asc&currency=AED",
    "?ref=newsletter",
    "",
  ])("drops everything from %j by default", (search) => {
    expect(filterLegacyRedirectSearch(search)).toBe("");
  });

  it("keeps only allow-listed params when an allow-list is supplied", () => {
    expect(
      filterLegacyRedirectSearch("?nsl_bypass_cache=1&keep=a&utm_source=x", new Set(["keep"])),
    ).toBe("?keep=a");
  });
});
