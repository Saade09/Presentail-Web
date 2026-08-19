import { describe, expect, it } from "vitest";
import type { CampaignCatalogProduct } from "./campaignLanding";
import {
  buildCampaignSupportUrl,
  getCampaignMarket,
  isTargetCampaignCity,
  resolveCampaignAvailability,
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
});

describe("CPC flower campaign delivery messaging state", () => {
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