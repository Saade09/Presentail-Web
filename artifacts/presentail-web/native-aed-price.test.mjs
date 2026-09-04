import { describe, expect, it } from "vitest";
import { resolveExactAedPrice } from "./native-aed-price.mjs";

describe("native AED decimal grammar parity", () => {
  it("preserves positive leading and trailing zero decimal strings", () => {
    expect(resolveExactAedPrice("000241.7500", "000140.1250")).toEqual({
      regular: "000241.7500", sale: "000140.1250", selling: "000140.1250",
    });
  });
  it("rejects malformed/whitespace values and non-lower sales", () => {
    expect(resolveExactAedPrice(" 241.75", "140.00")).toBeNull();
    expect(resolveExactAedPrice("241.75", "241.750")).toEqual({
      regular: "241.75", sale: null, selling: "241.75",
    });
  });
});