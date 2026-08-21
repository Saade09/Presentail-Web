import { describe, expect, it } from "vitest";
import { cityHref } from "./cityHref";

describe("cityHref", () => {
  it("keeps Lebanon utility and category links in the current locale/city shell", () => {
    const context = { language: "fr" as const, countryCode: "LB", cityId: "lb-beirut" };
    expect(cityHref("/terms", context)).toBe("~/fr-lb/beirut/terms");
    expect(cityHref("/category/hand-bouquets", context)).toBe(
      "~/fr-lb/beirut/category/hand-bouquets",
    );
  });

  it("keeps UAE links in the UAE city shell instead of falling back to Lebanon", () => {
    const context = { language: "en" as const, countryCode: "AE", cityId: "ae-dubai" };
    expect(cityHref("/shop", context)).toBe("~/en-ae/dubai/shop");
    expect(cityHref("/brand/flower-scent", context)).toBe(
      "~/en-ae/dubai/brand/flower-scent",
    );
  });

  it("uses a hub city for utility links from bare language blog shells", () => {
    expect(
      cityHref("/privacy", {
        language: "fr",
        countryCode: "LB",
        fallbackToHub: true,
      }),
    ).toBe("~/fr-lb/beirut/privacy");
  });

  it("always uses Wouter's root escape, preventing nested double prefixes", () => {
    const href = cityHref("/cart", {
      language: "en",
      countryCode: "LB",
      cityId: "lb-beirut",
    });
    expect(href).toBe("~/en-lb/beirut/cart");
    expect(href).not.toContain("/en/en-lb");
  });
});