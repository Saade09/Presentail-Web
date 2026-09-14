import { describe, expect, it } from "vitest";
import type { CampaignCatalogProduct } from "./campaignLanding";
import {
  buildCampaignSupportUrl,
  computeCountdownMinutes,
  filterCampaignProducts,
  getCampaignActiveDisplayPrice,
  getCampaignActiveSellingPrice,
  getCampaignMarket,
  getPriceBandConfig,
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

describe("getPriceBandConfig", () => {
  it("returns correct AED thresholds", () => {
    const config = getPriceBandConfig("AED");
    expect(config.low).toBeDefined();
    expect(config.low?.max).toBe(250);
    expect(config.mid).toBeDefined();
    expect(config.mid?.min).toBe(250);
    expect(config.mid?.max).toBe(500);
  });

  it("returns correct USD thresholds", () => {
    const config = getPriceBandConfig("USD");
    expect(config.low).toBeDefined();
    expect(config.low?.max).toBe(60);
    expect(config.mid).toBeDefined();
    expect(config.mid?.min).toBe(60);
    expect(config.mid?.max).toBe(100);
  });

  it("returns empty config for EUR (no approved thresholds)", () => {
    const config = getPriceBandConfig("EUR");
    expect(config.low).toBeUndefined();
    expect(config.mid).toBeUndefined();
  });

  it("returns empty config for LBP (no approved thresholds)", () => {
    const config = getPriceBandConfig("LBP");
    expect(config.low).toBeUndefined();
    expect(config.mid).toBeUndefined();
  });
});

describe("getCampaignActiveDisplayPrice", () => {
  it("returns native AED sale price when it is lower than the AED regular price", () => {
    const p = product("p", ["flowers"], { priceAed: 300, discountPriceAed: 240 });
    expect(getCampaignActiveDisplayPrice(p, "AED")).toBe(240);
  });

  it("returns native AED regular price when there is no AED sale", () => {
    const p = product("p", ["flowers"], { priceAed: 365, discountPriceAed: null });
    expect(getCampaignActiveDisplayPrice(p, "AED")).toBe(365);
  });

  it("returns null for AED when no native AED price exists", () => {
    const p = product("p", ["flowers"], { priceValue: 50 }); // no priceAed
    expect(getCampaignActiveDisplayPrice(p, "AED")).toBeNull();
  });

  it("returns USD-based price for USD currency", () => {
    const p = product("p", ["flowers"], { priceValue: 75, discountPriceValue: 59 });
    expect(getCampaignActiveDisplayPrice(p, "USD")).toBe(59);
  });

  it("ignores discountPriceAed when it is not genuinely lower than priceAed", () => {
    const p = product("p", ["flowers"], { priceAed: 300, discountPriceAed: 300 });
    expect(getCampaignActiveDisplayPrice(p, "AED")).toBe(300);
  });

  it("uses the native AED sale value for filtering at an exact lower boundary", () => {
    const p = product("p", ["flowers"], {
      priceAed: 300,
      priceAedExact: "300.000",
      discountPriceAed: 250,
      discountPriceAedExact: "250.000",
      priceValue: 82,
      discountPriceValue: 57,
    });
    expect(getCampaignActiveDisplayPrice(p, "AED")).toBe(250);
    expect(
      filterCampaignProducts([p], "price_low", {
        currencyCode: "AED",
        bandConfig: getPriceBandConfig("AED"),
      }),
    ).toHaveLength(0);
    expect(
      filterCampaignProducts([p], "price_mid", {
        currencyCode: "AED",
        bandConfig: getPriceBandConfig("AED"),
      }),
    ).toHaveLength(1);
  });
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

  it("USD price_low: uses USD priceValue — sale price at $59 matches, exactly $60 does not", () => {
    const usdBand = getPriceBandConfig("USD");
    const sale = product("sale", ["flowers"], {
      priceValue: 75,
      discountPriceValue: 59,
    });
    expect(getCampaignActiveSellingPrice(sale)).toBe(59);
    expect(
      filterCampaignProducts([sale], "price_low", { currencyCode: "USD", bandConfig: usdBand }),
    ).toHaveLength(1);

    const exactlyAtCeiling = product("sixty", ["flowers"], {
      priceValue: 80,
      discountPriceValue: 60,
    });
    expect(
      filterCampaignProducts([exactlyAtCeiling], "price_low", { currencyCode: "USD", bandConfig: usdBand }),
    ).toHaveLength(0);
  });

  it("AED price_low: uses native priceAed — AED 210 matches, AED 250 does not", () => {
    const aedBand = getPriceBandConfig("AED");
    const cheap = product("cheap", ["flowers"], { priceAed: 210, priceValue: 57 });
    const atBoundary = product("boundary", ["flowers"], { priceAed: 250, priceValue: 68 });
    const expensive = product("expensive", ["flowers"], { priceAed: 300, priceValue: 82 });

    const lowResults = filterCampaignProducts(
      [cheap, atBoundary, expensive],
      "price_low",
      { currencyCode: "AED", bandConfig: aedBand },
    );
    expect(lowResults.map((p) => p.id)).toEqual(["cheap"]);
  });

  it("AED price_low: uses native discountPriceAed when it is the active sale price", () => {
    const aedBand = getPriceBandConfig("AED");
    // Regular AED 300, on sale at AED 210 — should match price_low (< 250)
    const onSale = product("on-sale", ["flowers"], {
      priceAed: 300,
      discountPriceAed: 210,
      priceValue: 82,
      discountPriceValue: 57,
    });
    expect(
      filterCampaignProducts([onSale], "price_low", { currencyCode: "AED", bandConfig: aedBand }),
    ).toHaveLength(1);
  });

  it("AED price_mid: AED 250 qualifies, AED 210 does not, AED 501 does not", () => {
    const aedBand = getPriceBandConfig("AED");
    const cheap = product("cheap", ["flowers"], { priceAed: 210, priceValue: 57 });
    const atLowerBound = product("at-lower", ["flowers"], { priceAed: 250, priceValue: 68 });
    const mid = product("mid", ["flowers"], { priceAed: 400, priceValue: 109 });
    const atUpperBound = product("at-upper", ["flowers"], { priceAed: 500, priceValue: 136 });
    const expensive = product("expensive", ["flowers"], { priceAed: 501, priceValue: 137 });

    const midResults = filterCampaignProducts(
      [cheap, atLowerBound, mid, atUpperBound, expensive],
      "price_mid",
      { currencyCode: "AED", bandConfig: aedBand },
    );
    expect(midResults.map((p) => p.id)).toEqual(["at-lower", "mid", "at-upper"]);
  });

  it("USD price_mid: $60–$100 inclusive", () => {
    const usdBand = getPriceBandConfig("USD");
    const rangeProducts = [
      product("sixty", ["flowers"], { priceValue: 60 }),
      product("hundred", ["flowers"], { priceValue: 100 }),
      product("over", ["flowers"], { priceValue: 100.01 }),
      product("under", ["flowers"], { priceValue: 59 }),
    ];
    expect(
      filterCampaignProducts(rangeProducts, "price_mid", { currencyCode: "USD", bandConfig: usdBand }).map(
        (p) => p.id,
      ),
    ).toEqual(["sixty", "hundred"]);
  });

  it("excludes products without native AED prices from AED price band filters", () => {
    const aedBand = getPriceBandConfig("AED");
    // Product has USD price that would match if incorrectly compared to AED thresholds,
    // but no priceAed — it must be excluded, not included with a wrong comparison.
    const noAedPrice = product("usd-only", ["flowers"], { priceValue: 50 });
    expect(
      filterCampaignProducts([noAedPrice], "price_low", { currencyCode: "AED", bandConfig: aedBand }),
    ).toHaveLength(0);
    expect(
      filterCampaignProducts([noAedPrice], "price_mid", { currencyCode: "AED", bandConfig: aedBand }),
    ).toHaveLength(0);
  });

  it("non-price filters (roses, luxury, best-sellers) are unaffected by an empty bandConfig", () => {
    const emptyBand = getPriceBandConfig("EUR");
    const products = [
      product("rose-a", ["roses-bouquets"]),
      product("rose-b", ["roses-lebanon"]),
      product("non-rose", ["flowers"]),
    ];
    // price filters with no band config produce 0 results
    expect(
      filterCampaignProducts(products, "price_low", { currencyCode: "EUR", bandConfig: emptyBand }),
    ).toHaveLength(0);
    // non-price filter is unaffected
    expect(
      filterCampaignProducts(products, "roses", { currencyCode: "EUR", bandConfig: emptyBand }),
    ).toHaveLength(2);
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
      "price_mid",
    );
    const params = new URLSearchParams(next);
    expect(params.get("quick_filter")).toBe("price_mid");
    expect(params.get("utm_campaign")).toBe("beirut");
    expect(params.get("gclid")).toBe("test");
    expect(params.get("currency")).toBe("USD");
  });

  it("maps legacy under-60 URL value to price_low semantic key", () => {
    expect(parseCampaignQuickFilter("?quick_filter=under-60")).toBe("price_low");
  });

  it("maps legacy 50-100 URL value to price_mid semantic key", () => {
    expect(parseCampaignQuickFilter("?quick_filter=50-100")).toBe("price_mid");
  });

  it("serializes new semantic keys into the URL", () => {
    const params = new URLSearchParams(
      serializeCampaignQuickFilter("", "price_low"),
    );
    expect(params.get("quick_filter")).toBe("price_low");

    const params2 = new URLSearchParams(
      serializeCampaignQuickFilter("", "price_mid"),
    );
    expect(params2.get("quick_filter")).toBe("price_mid");
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
