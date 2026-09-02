import { describe, expect, it } from "vitest";
import {
  getCaseInsensitiveParam,
  getGmcCartMutation,
  normalizeGmcQuantity,
  removeGmcParams,
} from "./gmcCheckoutDeepLink";

describe("GMC checkout deep-link helpers", () => {
  it("reads item_id and quantity regardless of parameter casing", () => {
    const params = new URLSearchParams("ITEM_ID=gold-heart&QuAnTiTy=3");
    expect(getCaseInsensitiveParam(params, "item_id")).toBe("gold-heart");
    expect(getCaseInsensitiveParam(params, "quantity")).toBe("3");
  });

  it("clamps valid quantities and defaults malformed values to one", () => {
    expect(normalizeGmcQuantity(undefined)).toBeUndefined();
    expect(normalizeGmcQuantity("0")).toBe(1);
    expect(normalizeGmcQuantity("-4")).toBe(1);
    expect(normalizeGmcQuantity("3.9")).toBe(3);
    expect(normalizeGmcQuantity("1000")).toBe(99);
    expect(normalizeGmcQuantity("not-a-number")).toBe(1);
  });

  it("removes only deep-link parameters", () => {
    const url = new URL(
      "https://presentail.com/en-ae/dubai/checkout?ITEM_ID=x&quantity=2&utm_source=gmc&foo=keep",
    );
    removeGmcParams(url);
    expect(url.searchParams.get("utm_source")).toBe("gmc");
    expect(url.searchParams.get("foo")).toBe("keep");
    expect(url.search).not.toMatch(/item_id|quantity/i);
  });

  it("adds only the delta required by an explicit quantity", () => {
    expect(getGmcCartMutation(undefined, undefined)).toEqual({ kind: "add", quantity: 1 });
    expect(getGmcCartMutation(undefined, 4)).toEqual({ kind: "add", quantity: 4 });
    expect(getGmcCartMutation(2, 5)).toEqual({ kind: "add", quantity: 3 });
    expect(getGmcCartMutation(5, 2)).toEqual({ kind: "none" });
  });

  it("does not duplicate an existing line when quantity is omitted", () => {
    expect(getGmcCartMutation(1, undefined)).toEqual({ kind: "none" });
    expect(getGmcCartMutation(99, 99)).toEqual({ kind: "none" });
  });
});