import { describe, expect, it } from "vitest";
import {
  buildCollectionInternalLinks,
  buildInternalLinks,
} from "./internalLinks";

describe("contextual internal-link route hardening", () => {
  it("does not author a category anchor for non-routable room-deco inventory", () => {
    const links = buildInternalLinks(
      {
        id: "balloon",
        name: "Balloon",
        category: "room-deco",
        categories: ["room-deco"],
        occasions: [],
      },
      { lang: "en", country: "lb", city: "beirut" },
      { categories: [{ id: "room-deco", name: "Room Deco" }] },
    );

    expect(links.some((link) => link.href.includes("/category/room-deco"))).toBe(false);
  });

  it.each([
    ["en", "lb", "beirut"],
    ["ar", "lb", "beirut"],
    ["fr", "lb", "beirut"],
    ["en", "ae", "dubai"],
    ["en", "cy", "nicosia"],
  ])("uses the %s-%s canonical city home when city is absent", (lang, country, city) => {
    const links = buildCollectionInternalLinks(
      { slug: "cakes", name: "Cakes", type: "category" },
      { lang, country, city: null },
    );
    const cityHome = links.find((link) => /flower delivery|توصيل|livraison/.test(link.anchorText));

    expect(cityHome?.href).toBe(`/${lang}-${country}/${city}/`);
    expect(cityHome?.href).not.toBe(`/${lang}-${country}/`);
  });
});