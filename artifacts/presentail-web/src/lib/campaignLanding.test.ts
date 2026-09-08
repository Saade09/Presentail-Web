import { describe, expect, it } from "vitest";
import type { CampaignCatalogProduct } from "./campaignLanding";
import {
  buildCampaignSupportUrl,
  computeCountdownMinutes,
  filterCampaignProducts,
  getCampaignActiveSellingPrice,
  getCampaignMarket,
  isTargetCampaignCity,
  parseCampaignQuickFilter,
  resolveCampaignAvailability,
  serializeCampaignQuickFilter,
  selectCampaignCatalogSections,
} from "./campaignLanding";

function product(
  id: string,
  categories: string[],
  overrides: Partial<CampaignCatalogProduct> = {},
): CampaignCatalogProduct {
  return {
    id,
    name: id,
    price: "$100",
    priceValue: 100,
    image: { uri: `https://example.com/${id}.jpg` },
    images: [{ uri: `https://example.com/${id}.jpg` }],
    categories,
    inStock: true,
    popularity: 0,
    ...overrides,
  };
}

describe("CPC flower campaign market gating", () => {
  it.each(["lb-beirut", "ae-dubai", "ae-abu-dhabi"])(
    "enables the redesign for %s",
    (cityId) => {
      expect(isTargetCampaignCity(cityId)).toBe(true);
      expect(getCampaignMarket(cityId)?.cityId).toBe(cityId);
    },
  );

  it.each(["lb-tripoli", "ae-sharjah", "cy-nicosia", null])(
    "leaves non-target city %s on the legacy page",
    (cityId) => {
      expect(isTargetCampaignCity(cityId)).toBe(false);
      expect(getCampaignMarket(cityId)).toBeNull();
    },
  );
});

describe("CPC flower campaign catalog filtering", () => {
  it("keeps floral stock, separates luxury, excludes gifts, and removes duplicates", () => {
    const sections = selectCampaignCatalogSections([
      product("standard", ["flowers"], { popularity: 5 }),
      product("best", ["roses-bouquets"], { isBestSeller: true, popularity: 1 }),
      product("luxury", ["flowers", "lux-arrangements"], { popularity: 9 }),
      product("luxury", ["flowers", "lux-arrangements"], { popularity: 9 }),
      product("cake-bundle", ["flowers", "cakes"], { popularity: 99 }),
      product("gift-basket", ["flower-baskets", "gift-baskets"]),
      product("sold-out", ["flowers"], { inStock: false }),
      product("unrelated", ["balloons"]),
    ]);

    expect(sections.flowers.map(({ id }) => id)).toEqual(["best", "standard"]);
    expect(sections.luxury.map(({ id }) => id)).toEqual(["luxury"]);
    expect(new Set([...sections.flowers, ...sections.luxury].map(({ id }) => id)).size).toBe(3);
  });

  it("sorts each rail with explicit best sellers first, then popularity", () => {
    const sections = selectCampaignCatalogSections([
      product("popular", ["flowers"], { popularity: 50 }),
      product("best-low-sales", ["flowers"], { isBestSeller: true, popularity: 1 }),
      product("less-popular", ["flowers"], { popularity: 4 }),
    ]);

    expect(sections.flowers.map(({ id }) => id)).toEqual([
      "best-low-sales",
      "popular",
      "less-popular",
    ]);
  });

  it("uses the active sale price with strict and inclusive price boundaries", () => {
    const sale = product("sale", ["flowers"], {
      priceValue: 75,
      discountPriceValue: 59,
    });
    expect(getCampaignActiveSellingPrice(sale)).toBe(59);
    expect(filterCampaignProducts([sale], "under-60")).toHaveLength(1);

    const exactlySixty = product("sixty", ["flowers"], {
      priceValue: 80,
      discountPriceValue: 60,
    });
    expect(filterCampaignProducts([exactlySixty], "under-60")).toHaveLength(0);

    const rangeProducts = [
      product("fifty", ["flowers"], { priceValue: 50 }),
      product("hundred", ["flowers"], { priceValue: 100 }),
      product("over", ["flowers"], { priceValue: 100.01 }),
    ];
    expect(filterCampaignProducts(rangeProducts, "50-100").map((p) => p.id)).toEqual([
      "fifty",
      "hundred",
    ]);
  });

  it("uses category aliases, collection metadata, ranking metadata, and location eligibility", () => {
    const products = [
      product("rose-alias", ["roses-lebanon"], { deliverableCities: ["beirut"] }),
      product("luxury", ["lux-arrangements"], { deliverableCities: ["lb-beirut"] }),
      product("best", ["flowers"], { isBestSeller: true, deliverableCountries: ["LB"] }),
      product("wrong-city", ["roses"], { deliverableCities: ["tripoli"] }),
      product("sold-out", ["roses"], { inStock: false }),
      product("not-today", ["roses"], { sameDayEnabled: false }),
    ];

    expect(filterCampaignProducts(products, "roses", {
      countryCode: "LB",
      cityId: "lb-beirut",
    }).map((p) => p.id)).toEqual(["rose-alias"]);
    expect(filterCampaignProducts(products, "luxury", {
      countryCode: "LB",
      cityId: "lb-beirut",
    }).map((p) => p.id)).toEqual(["luxury"]);
    expect(filterCampaignProducts(products, "best-sellers", {
      countryCode: "LB",
      cityId: "lb-beirut",
    }).map((p) => p.id)).toEqual(["best"]);
    expect(filterCampaignProducts(products, "available-today", {
      countryCode: "LB",
      cityId: "lb-beirut",
    }).map((p) => p.id)).toEqual(["rose-alias", "luxury", "best"]);
  });
});

describe("CPC flower campaign quick-filter URL state", () => {
  it("defaults safely and preserves every unrelated query parameter", () => {
    expect(parseCampaignQuickFilter("?utm_campaign=beirut")).toBe("available-today");
    expect(parseCampaignQuickFilter("?quick_filter=unknown")).toBe("available-today");
    const next = serializeCampaignQuickFilter(
      "?utm_campaign=beirut&gclid=test&currency=USD",
      "50-100",
    );
    const params = new URLSearchParams(next);
    expect(params.get("quick_filter")).toBe("50-100");
    expect(params.get("utm_campaign")).toBe("beirut");
    expect(params.get("gclid")).toBe("test");
    expect(params.get("currency")).toBe("USD");
  });
});

describe("CPC flower campaign delivery messaging state", () => {
  it("computes countdown minutes in the campaign timezone", () => {
    expect(
      computeCountdownMinutes(
        new Date("2026-08-19T15:48:00.000Z"),
        "Asia/Beirut",
        23,
      ),
    ).toBe(252);
    expect(
      computeCountdownMinutes(
        new Date("2026-08-19T19:59:00.000Z"),
        "Asia/Beirut",
        23,
      ),
    ).toBe(1);
  });

  it("returns zero after cutoff and null for invalid configuration", () => {
    expect(
      computeCountdownMinutes(
        new Date("2026-08-19T20:01:00.000Z"),
        "Asia/Beirut",
        23,
      ),
    ).toBe(0);
    expect(computeCountdownMinutes(new Date(), "Invalid/Timezone", 23)).toBeNull();
    expect(computeCountdownMinutes(new Date(), "Asia/Beirut", 24)).toBeNull();
  });

  it("uses the market timezone when evaluating the live same-day cutoff", () => {
    expect(
      resolveCampaignAvailability({
        now: new Date("2026-08-19T15:59:00.000Z"),
        timeZone: "Asia/Dubai",
        cutoffHour: 20,
        cityIsActive: true,
        operationsConfigVerified: true,
      }),
    ).toBe("same-day");

    expect(
      resolveCampaignAvailability({
        now: new Date("2026-08-19T16:01:00.000Z"),
        timeZone: "Asia/Dubai",
        cutoffHour: 20,
        cityIsActive: true,
        operationsConfigVerified: true,
      }),
    ).toBe("next-available");
  });

  it("falls back to neutral availability when live cutoff data is missing or inactive", () => {
    expect(
      resolveCampaignAvailability({
        now: new Date("2026-08-19T12:00:00.000Z"),
        timeZone: "Asia/Beirut",
        cityIsActive: true,
        operationsConfigVerified: true,
      }),
    ).toBe("unverified");
    expect(
      resolveCampaignAvailability({
        now: new Date("2026-08-19T12:00:00.000Z"),
        timeZone: "Asia/Beirut",
        cutoffHour: 22,
        cityIsActive: false,
        operationsConfigVerified: true,
      }),
    ).toBe("unverified");
  });

  it("falls back to neutral availability for fallback-derived operations data", () => {
    expect(
      resolveCampaignAvailability({
        now: new Date("2026-08-19T12:00:00.000Z"),
        timeZone: "Asia/Dubai",
        cutoffHour: 22,
        cityIsActive: true,
        operationsConfigVerified: false,
      }),
    ).toBe("unverified");
  });
});

describe("CPC flower campaign support link", () => {
  it("preserves the selected city in the WhatsApp prefill", () => {
    const url = buildCampaignSupportUrl(
      "Hi! I need help choosing flowers for delivery in Abu Dhabi.",
    );
    expect(url).toContain("wa.me/9613136532");
    expect(decodeURIComponent(url)).toContain("Abu Dhabi");
  });
});