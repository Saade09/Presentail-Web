import { describe, it, expect } from "vitest";
import {
  parseLocalePath,
  buildLocalePath,
  switchLanguage,
  cityIdToSlug,
  citySlugToId,
  countrySlugToCode,
  countryCodeToSlug,
  isSupportedLang,
  isSupportedCountrySlug,
  isSupportedCity,
} from "./locale-route";

describe("isSupportedLang", () => {
  it("accepts supported langs and rejects others", () => {
    expect(isSupportedLang("en")).toBe(true);
    expect(isSupportedLang("ar")).toBe(true);
    expect(isSupportedLang("fr")).toBe(true);
    expect(isSupportedLang("de")).toBe(false);
    expect(isSupportedLang("")).toBe(false);
  });
});

describe("isSupportedCountrySlug", () => {
  it("accepts supported country slugs and rejects others", () => {
    expect(isSupportedCountrySlug("ae")).toBe(true);
    expect(isSupportedCountrySlug("lb")).toBe(true);
    expect(isSupportedCountrySlug("cy")).toBe(true);
    expect(isSupportedCountrySlug("us")).toBe(false);
  });
});

describe("isSupportedCity", () => {
  it("checks city membership for the given country", () => {
    expect(isSupportedCity("ae", "dubai")).toBe(true);
    expect(isSupportedCity("ae", "beirut")).toBe(false);
    expect(isSupportedCity("lb", "beirut")).toBe(true);
    expect(isSupportedCity("cy", "nicosia")).toBe(true);
    expect(isSupportedCity("cy", "dubai")).toBe(false);
  });
});

describe("parseLocalePath", () => {
  it("parses a full locale + city + rest path", () => {
    expect(parseLocalePath("/en-ae/dubai/product/x")).toEqual({
      hasLocalePrefix: true,
      lang: "en",
      country: "ae",
      city: "dubai",
      rest: "/product/x",
    });
  });

  it("parses a locale-only path", () => {
    expect(parseLocalePath("/en-ae")).toEqual({
      hasLocalePrefix: true,
      lang: "en",
      country: "ae",
      city: null,
      rest: "",
    });
  });

  it("parses a locale + city path with no rest", () => {
    expect(parseLocalePath("/ar-lb/beirut")).toEqual({
      hasLocalePrefix: true,
      lang: "ar",
      country: "lb",
      city: "beirut",
      rest: "",
    });
  });

  it("returns the second segment as city even if not a known city slug", () => {
    const parsed = parseLocalePath("/en-ae/unknown-city/foo");
    expect(parsed.hasLocalePrefix).toBe(true);
    expect(parsed.city).toBe("unknown-city");
    expect(parsed.rest).toBe("/foo");
  });

  it("treats paths without a locale prefix as no-locale", () => {
    expect(parseLocalePath("/shop")).toEqual({
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: "/shop",
    });
  });

  it("rejects unsupported language in the locale prefix", () => {
    const parsed = parseLocalePath("/de-ae/foo");
    expect(parsed.hasLocalePrefix).toBe(false);
    expect(parsed.rest).toBe("/de-ae/foo");
  });

  it("rejects unsupported country in the locale prefix", () => {
    const parsed = parseLocalePath("/en-us/foo");
    expect(parsed.hasLocalePrefix).toBe(false);
    expect(parsed.rest).toBe("/en-us/foo");
  });

  it("rejects malformed locale prefixes", () => {
    expect(parseLocalePath("/EN-AE/foo").hasLocalePrefix).toBe(false);
    expect(parseLocalePath("/en_ae/foo").hasLocalePrefix).toBe(false);
    expect(parseLocalePath("/en/foo").hasLocalePrefix).toBe(false);
  });

  it("returns rest='/' for an empty pathname", () => {
    expect(parseLocalePath("")).toEqual({
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: "/",
    });
  });

  it("treats '/' as no-locale with rest='/'", () => {
    expect(parseLocalePath("/")).toEqual({
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: "/",
    });
  });
});

describe("buildLocalePath", () => {
  it("builds a locale-only path", () => {
    expect(buildLocalePath({ lang: "en", country: "ae" })).toBe("/en-ae");
  });

  it("builds locale + city", () => {
    expect(
      buildLocalePath({ lang: "ar", country: "lb", city: "beirut" }),
    ).toBe("/ar-lb/beirut");
  });

  it("builds locale + city + rest with leading slash", () => {
    expect(
      buildLocalePath({
        lang: "en",
        country: "ae",
        city: "dubai",
        rest: "/product/x",
      }),
    ).toBe("/en-ae/dubai/product/x");
  });

  it("normalizes rest without a leading slash", () => {
    expect(
      buildLocalePath({
        lang: "en",
        country: "ae",
        city: "dubai",
        rest: "product/x",
      }),
    ).toBe("/en-ae/dubai/product/x");
  });

  it("ignores rest='/' and null/empty city", () => {
    expect(
      buildLocalePath({ lang: "en", country: "ae", city: null, rest: "/" }),
    ).toBe("/en-ae");
    expect(
      buildLocalePath({ lang: "en", country: "ae", rest: "" }),
    ).toBe("/en-ae");
  });

  it("round-trips with parseLocalePath", () => {
    const cases = [
      "/en-ae",
      "/en-ae/dubai",
      "/en-ae/dubai/product/x",
      "/ar-lb/beirut/cart",
      "/fr-cy/nicosia",
    ];
    for (const original of cases) {
      const parsed = parseLocalePath(original);
      expect(parsed.hasLocalePrefix).toBe(true);
      const rebuilt = buildLocalePath({
        lang: parsed.lang!,
        country: parsed.country!,
        city: parsed.city,
        rest: parsed.rest,
      });
      expect(rebuilt).toBe(original);
    }
  });
});

describe("switchLanguage", () => {
  it("replaces only the language segment", () => {
    expect(switchLanguage("/en-ae/dubai/product/x", "ar")).toBe(
      "/ar-ae/dubai/product/x",
    );
  });

  it("preserves the query string", () => {
    expect(switchLanguage("/en-ae/dubai?ref=home&x=1", "fr")).toBe(
      "/fr-ae/dubai?ref=home&x=1",
    );
  });

  it("preserves the hash", () => {
    expect(switchLanguage("/en-ae/dubai#section", "ar")).toBe(
      "/ar-ae/dubai#section",
    );
  });

  it("preserves both query string and hash", () => {
    expect(
      switchLanguage("/en-ae/dubai/product/x?a=1&b=2#frag", "fr"),
    ).toBe("/fr-ae/dubai/product/x?a=1&b=2#frag");
  });

  it("works with locale-only URLs", () => {
    expect(switchLanguage("/en-ae", "ar")).toBe("/ar-ae");
    expect(switchLanguage("/en-ae?x=1", "ar")).toBe("/ar-ae?x=1");
  });

  it("returns the URL unchanged when there is no locale prefix", () => {
    expect(switchLanguage("/shop?x=1#y", "ar")).toBe("/shop?x=1#y");
    expect(switchLanguage("/", "ar")).toBe("/");
  });

  it("handles a hash that contains a '?'", () => {
    expect(switchLanguage("/en-ae/dubai#frag?notquery", "ar")).toBe(
      "/ar-ae/dubai#frag?notquery",
    );
  });
});

describe("city slug helpers", () => {
  it("cityIdToSlug strips the country prefix", () => {
    expect(cityIdToSlug("ae-dubai")).toBe("dubai");
    expect(cityIdToSlug("lb-beirut")).toBe("beirut");
    expect(cityIdToSlug("ae-abu-dhabi")).toBe("abu-dhabi");
  });

  it("cityIdToSlug leaves ids without a 2-letter prefix unchanged", () => {
    expect(cityIdToSlug("dubai")).toBe("dubai");
    expect(cityIdToSlug("abc-dubai")).toBe("abc-dubai");
  });

  it("citySlugToId joins country and slug", () => {
    expect(citySlugToId("ae", "dubai")).toBe("ae-dubai");
    expect(citySlugToId("ae", "abu-dhabi")).toBe("ae-abu-dhabi");
    expect(citySlugToId("lb", "beirut")).toBe("lb-beirut");
  });

  it("city id <-> slug round trip", () => {
    const ids = ["ae-dubai", "ae-abu-dhabi", "lb-beirut", "cy-nicosia"] as const;
    for (const id of ids) {
      const country = id.slice(0, 2) as "ae" | "lb" | "cy";
      const slug = cityIdToSlug(id);
      expect(citySlugToId(country, slug)).toBe(id);
    }
  });
});

describe("country code helpers", () => {
  it("countrySlugToCode upper-cases", () => {
    expect(countrySlugToCode("ae")).toBe("AE");
    expect(countrySlugToCode("lb")).toBe("LB");
    expect(countrySlugToCode("cy")).toBe("CY");
  });

  it("countryCodeToSlug lower-cases", () => {
    expect(countryCodeToSlug("AE")).toBe("ae");
    expect(countryCodeToSlug("Lb")).toBe("lb");
  });
});
