import { describe, expect, it } from "vitest";
import { parseLocaleOnlyCheckoutPath } from "./locale-route";

describe("parseLocaleOnlyCheckoutPath", () => {
  it("recognizes the locale-only Cyprus GMC checkout path", () => {
    expect(parseLocaleOnlyCheckoutPath("/en-cy/checkout", "?item_id=rose")).toEqual({
      lang: "en",
      country: "cy",
    });
    expect(parseLocaleOnlyCheckoutPath("/el-cy/checkout/", "?ITEM_ID=rose")).toEqual({
      lang: "el",
      country: "cy",
    });
  });

  it("does not treat a city-scoped checkout as locale-only", () => {
    expect(parseLocaleOnlyCheckoutPath("/en-cy/nicosia/checkout", "?item_id=rose")).toBeNull();
    expect(parseLocaleOnlyCheckoutPath("/en-cy/shop", "?item_id=rose")).toBeNull();
  });

  it("does not change ordinary or non-Cyprus locale-only routes", () => {
    expect(parseLocaleOnlyCheckoutPath("/en-cy/checkout")).toBeNull();
    expect(parseLocaleOnlyCheckoutPath("/en-ae/checkout", "?item_id=rose")).toBeNull();
    expect(parseLocaleOnlyCheckoutPath("/en-lb/checkout", "?item_id=rose")).toBeNull();
  });
});