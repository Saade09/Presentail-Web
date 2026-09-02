import { describe, expect, it } from "vitest";
// @ts-expect-error Runtime server module intentionally has no TypeScript declarations.
import { resolveGmcLocaleOnlyCheckoutRedirect } from "../../gmc-checkout-route.mjs";

describe("GMC locale-only server redirect", () => {
  it("preserves the item, quantity, and attribution query", () => {
    expect(
      resolveGmcLocaleOnlyCheckoutRedirect(
        "/en-cy/checkout",
        "?ITEM_ID=gold-heart&quantity=2&utm_source=google",
        "",
      ),
    ).toBe(
      "/en-cy/nicosia/checkout?ITEM_ID=gold-heart&quantity=2&utm_source=google",
    );
  });

  it("supports Greek and a configured base path", () => {
    expect(
      resolveGmcLocaleOnlyCheckoutRedirect(
        "/el-cy/checkout/",
        "?item_id=313",
        "/presentail-web",
      ),
    ).toBe("/presentail-web/el-cy/nicosia/checkout?item_id=313");
  });

  it("leaves ordinary and non-Cyprus checkout routes unchanged", () => {
    expect(resolveGmcLocaleOnlyCheckoutRedirect("/en-cy/checkout", "")).toBeNull();
    expect(
      resolveGmcLocaleOnlyCheckoutRedirect(
        "/en-ae/checkout",
        "?item_id=gold-heart",
      ),
    ).toBeNull();
  });
});