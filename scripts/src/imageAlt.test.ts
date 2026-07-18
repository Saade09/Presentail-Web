import { describe, it, expect } from "vitest";
import { buildProductImageAlt, buildCollectionImageAlt } from "../../artifacts/presentail-web/src/lib/imageAlt";

describe("buildProductImageAlt", () => {
  it("generates EN alt with category and city", () => {
    expect(
      buildProductImageAlt(
        { name: "Red Roses", categories: [{ name: "Flowers" }] },
        "en",
        "Beirut",
      ),
    ).toBe("Red Roses – Flowers – delivered in Beirut");
  });

  it("trims long alt text to 125 characters", () => {
    const result = buildProductImageAlt(
      { name: "X".repeat(200) },
      "en",
      "Beirut",
    );
    expect(result.length).toBeLessThanOrEqual(125);
  });

  it("generates AR alt with Arabic delivery phrase and city", () => {
    const result = buildProductImageAlt(
      { name: "Roses", categories: [] },
      "ar",
      "بيروت",
    );
    expect(result).toContain("بيروت");
    expect(result).toContain("توصيل");
  });

  it("generates FR alt with French delivery phrase", () => {
    const result = buildProductImageAlt(
      { name: "Roses", categories: [{ name: "Fleurs" }] },
      "fr",
      "Beyrouth",
    );
    expect(result).toContain("livraison à");
    expect(result).toContain("Beyrouth");
  });

  it("omits the category segment when categories is empty", () => {
    const result = buildProductImageAlt({ name: "Gift Box", categories: [] }, "en", "Dubai");
    expect(result).toBe("Gift Box – delivered in Dubai");
    expect(result).not.toContain(" – –");
  });

  it("omits the category segment when categories is undefined", () => {
    const result = buildProductImageAlt({ name: "Gift Box" }, "en", "Dubai");
    expect(result).toBe("Gift Box – delivered in Dubai");
  });

  it("returns empty string for decorative images", () => {
    expect(
      buildProductImageAlt(
        { name: "Red Roses", categories: [{ name: "Flowers" }] },
        "en",
        "Beirut",
        { decorative: true },
      ),
    ).toBe("");
  });

  it("falls back to EN for unknown locales", () => {
    const result = buildProductImageAlt({ name: "Cake", categories: [{ name: "Desserts" }] }, "it", "Nicosia");
    expect(result).toContain("delivered in");
  });
});

describe("buildCollectionImageAlt", () => {
  it("generates EN collection alt", () => {
    expect(buildCollectionImageAlt("Roses", "Flowers", "en", "Beirut")).toBe(
      "Roses Flowers – Presentail Beirut",
    );
  });

  it("includes the city name for AR locale", () => {
    const result = buildCollectionImageAlt("Birthday", "Occasions", "ar", "بيروت");
    expect(result).toContain("بيروت");
  });

  it("includes city name for FR locale", () => {
    const result = buildCollectionImageAlt("Anniversaire", "Occasions", "fr", "Beyrouth");
    expect(result).toContain("Beyrouth");
    expect(result).toContain("Presentail");
  });
});
