/**
 * Unit tests for local-SEO enrichment functions:
 *   - buildLocalBusinessSchema  (enriched with LOCATION_DATA fields)
 *   - buildCityFaqSchema        (city-specific FAQ per locale)
 *   - LOCATION_DATA             (service areas for all 3 countries)
 *
 * These functions live in seo-inject.mjs (plain ESM) so we import them
 * dynamically, matching the pattern used in seo-inject.test.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";

// ── types shared between test helpers ──────────────────────────────────────
type BuildLocalBusinessFn = (args: {
  siteUrl: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  cityUrl?: string;
}) => Record<string, unknown>;

type BuildCityFaqFn = (
  cityName: string,
  countryCode: string,
  locale: string,
) => { question: string; answer: string }[];

// ── module handles loaded once ──────────────────────────────────────────────
let buildLocalBusinessSchema: BuildLocalBusinessFn;
let buildCityFaqSchema: BuildCityFaqFn;
let LOCATION_DATA: Record<string, {
  phone: string;
  email: string;
  openingHours: string[];
  priceRange: string;
  mapUrl: string;
  serviceAreas: string[];
  currenciesAccepted: string;
  paymentAccepted: string;
}>;

beforeAll(async () => {
  // @ts-expect-error — plain .mjs imports have no .d.ts; types are inlined above
  const seoInject = await import("../../artifacts/presentail-web/seo-inject.mjs");
  buildLocalBusinessSchema = seoInject.buildLocalBusinessSchema;
  buildCityFaqSchema = seoInject.buildCityFaqSchema;

  const locData = await import("../../artifacts/presentail-web/src/lib/locationData.mjs");
  LOCATION_DATA = locData.LOCATION_DATA;
});

// ── LOCATION_DATA ───────────────────────────────────────────────────────────
describe("LOCATION_DATA", () => {
  it("has entries for lb, ae, cy", () => {
    expect(LOCATION_DATA).toHaveProperty("lb");
    expect(LOCATION_DATA).toHaveProperty("ae");
    expect(LOCATION_DATA).toHaveProperty("cy");
  });

  it("lb.serviceAreas includes Tripoli and Beirut", () => {
    const areas = LOCATION_DATA.lb.serviceAreas;
    expect(areas).toContain("Tripoli");
    expect(areas).toContain("Beirut");
  });

  it("lb.serviceAreas has 26 areas (one per LB district/caza)", () => {
    expect(LOCATION_DATA.lb.serviceAreas).toHaveLength(26);
  });

  it("ae.serviceAreas includes Dubai and Abu Dhabi", () => {
    const areas = LOCATION_DATA.ae.serviceAreas;
    expect(areas).toContain("Dubai");
    expect(areas).toContain("Abu Dhabi");
  });

  it("cy.serviceAreas includes Limassol and Nicosia", () => {
    const areas = LOCATION_DATA.cy.serviceAreas;
    expect(areas).toContain("Limassol");
    expect(areas).toContain("Nicosia");
  });

  it("lb phone is E.164 format", () => {
    expect(LOCATION_DATA.lb.phone).toMatch(/^\+\d{7,15}$/);
  });

  it("lb currenciesAccepted includes LBP", () => {
    expect(LOCATION_DATA.lb.currenciesAccepted).toContain("LBP");
  });

  it("ae currenciesAccepted is AED", () => {
    expect(LOCATION_DATA.ae.currenciesAccepted).toBe("AED");
  });

  it("cy currenciesAccepted is EUR", () => {
    expect(LOCATION_DATA.cy.currenciesAccepted).toBe("EUR");
  });

  it("lb paymentAccepted includes Cash on Delivery", () => {
    expect(LOCATION_DATA.lb.paymentAccepted).toContain("Cash on Delivery");
  });

  it("ae paymentAccepted does NOT include Cash on Delivery", () => {
    expect(LOCATION_DATA.ae.paymentAccepted).not.toContain("Cash on Delivery");
  });
});

// ── buildLocalBusinessSchema ────────────────────────────────────────────────
describe("buildLocalBusinessSchema", () => {
  const OPTS = {
    siteUrl: "https://presentail.com",
    cityName: "Tripoli",
    countryName: "Lebanon",
    countryCode: "lb",
    cityUrl: "https://presentail.com/en-lb/tripoli",
  };

  // LocalBusiness, deliberately not Florist or OnlineStore: OnlineStore (an
  // Organization subtype) made openingHours/hasMap/priceRange/
  // currenciesAccepted/paymentAccepted invalid, and Florist was dropped because
  // Presentail has no walk-in storefronts. Keep in sync with
  // artifacts/presentail-web/src/lib/seo-inject.test.ts,
  // artifacts/presentail-web/scripts/check-nonproduct-jsonld-schema.mjs and
  // artifacts/presentail-web/e2e-serve/jsonld-schema.spec.ts.
  it("returns @type LocalBusiness", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema["@type"]).toBe("LocalBusiness");
  });

  it("includes telephone from LOCATION_DATA", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.telephone).toBe(LOCATION_DATA.lb.phone);
  });

  it("includes email from LOCATION_DATA", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.email).toBe(LOCATION_DATA.lb.email);
  });

  it("includes openingHours from LOCATION_DATA", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.openingHours).toEqual(LOCATION_DATA.lb.openingHours);
  });

  it("includes hasMap from LOCATION_DATA", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(typeof schema.hasMap).toBe("string");
    expect((schema.hasMap as string).length).toBeGreaterThan(0);
  });

  it("includes priceRange", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.priceRange).toBe("$$$");
  });

  it("uses cityUrl as the schema url", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.url).toBe("https://presentail.com/en-lb/tripoli");
  });

  it("falls back to siteUrl when cityUrl is omitted", () => {
    const { cityUrl: _unused, ...rest } = OPTS;
    const schema = buildLocalBusinessSchema(rest);
    expect(schema.url).toBe("https://presentail.com");
  });

  // A single country-level string: the former 26-entry AdministrativeArea
  // array, repeated across city pages, read as a false multi-location claim.
  it("areaServed is a single country-level string, not an AdministrativeArea array", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(Array.isArray(schema.areaServed)).toBe(false);
    expect(typeof schema.areaServed).toBe("string");
  });

  it("areaServed for a Tripoli (lb) page is the country, not the city", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    expect(schema.areaServed).toBe("Lebanon");
  });

  it("address contains addressLocality and addressCountry", () => {
    const schema = buildLocalBusinessSchema(OPTS);
    const addr = schema.address as { "@type": string; addressLocality: string; addressCountry: string };
    expect(addr["@type"]).toBe("PostalAddress");
    expect(addr.addressLocality).toBe("Tripoli");
    expect(addr.addressCountry).toBe("Lebanon");
  });

  it("AE schema has AED currency and no Cash on Delivery", () => {
    const schema = buildLocalBusinessSchema({
      siteUrl: "https://presentail.com",
      cityName: "Dubai",
      countryName: "United Arab Emirates",
      countryCode: "ae",
    });
    expect(schema.currenciesAccepted).toBe("AED");
    expect(schema.paymentAccepted as string).not.toContain("Cash on Delivery");
  });

  it("CY schema has EUR currency", () => {
    const schema = buildLocalBusinessSchema({
      siteUrl: "https://presentail.com",
      cityName: "Limassol",
      countryName: "Cyprus",
      countryCode: "cy",
    });
    expect(schema.currenciesAccepted).toBe("EUR");
  });
});

// ── buildCityFaqSchema ──────────────────────────────────────────────────────
describe("buildCityFaqSchema", () => {
  // City FAQ JSON-LD mirrors the six visible homepage FAQ rows
  // (HOMEPAGE_FAQ_COUNT in src/lib/homepageFaqs.mjs).
  it("returns 6 FAQ items for Beirut EN", () => {
    const faqs = buildCityFaqSchema("Beirut", "LB", "en");
    expect(faqs).toHaveLength(6);
  });

  it("each item has question and answer strings", () => {
    const faqs = buildCityFaqSchema("Beirut", "LB", "en");
    for (const faq of faqs) {
      expect(typeof faq.question).toBe("string");
      expect(faq.question.length).toBeGreaterThan(5);
      expect(typeof faq.answer).toBe("string");
      expect(faq.answer.length).toBeGreaterThan(5);
    }
  });

  it("EN question 1 mentions the city name", () => {
    const faqs = buildCityFaqSchema("Tripoli", "LB", "en");
    expect(faqs[0].question).toContain("Tripoli");
  });

  it("AR output is in Arabic script", () => {
    const faqs = buildCityFaqSchema("طرابلس", "LB", "ar");
    expect(faqs[0].question).toMatch(/[\u0600-\u06FF]/);
  });

  it("FR output contains French text", () => {
    const faqs = buildCityFaqSchema("Beyrouth", "LB", "fr");
    expect(faqs[0].question).toMatch(/livre|fleurs|Presentail/i);
  });

  // The homepage FAQ no longer has a payment question (FAQPage schema must
  // match the visible FAQ rows). LB Cash on Delivery is advertised through
  // LocalBusiness.paymentAccepted instead.
  it("LB Cash on Delivery is carried by LocalBusiness.paymentAccepted", () => {
    const schema = buildLocalBusinessSchema({
      siteUrl: "https://presentail.com",
      cityName: "Sidon",
      countryName: "Lebanon",
      countryCode: "lb",
    });
    expect(schema.paymentAccepted as string).toContain("Cash on Delivery");
  });

  it("AE FAQ answers do NOT mention Cash on Delivery", () => {
    const faqs = buildCityFaqSchema("Dubai", "AE", "en");
    expect(faqs.length).toBeGreaterThan(0);
    for (const faq of faqs) {
      expect(faq.answer).not.toContain("Cash on Delivery");
    }
  });

  it("different city names produce different questions", () => {
    const beirut = buildCityFaqSchema("Beirut", "LB", "en");
    const tripoli = buildCityFaqSchema("Tripoli", "LB", "en");
    expect(beirut[0].question).not.toBe(tripoli[0].question);
  });

  it("unknown locale falls back to EN", () => {
    const faqs = buildCityFaqSchema("Dubai", "AE", "zh");
    expect(faqs[0].question).toMatch(/Presentail|deliver/i);
  });
});
