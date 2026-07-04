import { describe, it, expect } from "vitest";
import { computeCartTotal } from "../index";

describe("computeCartTotal", () => {
  it("returns subtotal + delivery fee when there is no coupon", () => {
    expect(computeCartTotal(50, 5, 0)).toBe(55);
  });

  it("subtracts the coupon discount from the total", () => {
    expect(computeCartTotal(50, 5, 10)).toBe(45);
  });

  it("returns 0 when the coupon exactly matches the order value", () => {
    expect(computeCartTotal(50, 5, 55)).toBe(0);
  });

  it("clamps to 0 when the coupon exceeds the order value (never negative)", () => {
    expect(computeCartTotal(50, 5, 100)).toBe(0);
  });

  it("handles a zero delivery fee (delivery not yet known)", () => {
    expect(computeCartTotal(30, 0, 5)).toBe(25);
  });

  it("handles a zero delivery fee with an oversized coupon", () => {
    expect(computeCartTotal(10, 0, 20)).toBe(0);
  });

  it("handles no coupon and no delivery fee (subtotal only)", () => {
    expect(computeCartTotal(75, 0, 0)).toBe(75);
  });

  it("handles fractional USD amounts without floating-point surprises", () => {
    expect(computeCartTotal(19.99, 3.5, 1.99)).toBeCloseTo(21.5, 5);
  });

  it("handles a coupon that is one cent less than the total", () => {
    expect(computeCartTotal(50, 5, 54.99)).toBeCloseTo(0.01, 5);
  });
});
