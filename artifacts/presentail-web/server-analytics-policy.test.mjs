// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  WindowedKeyRateLimiter,
  buildProductLifecycle410Event,
} from "./server-analytics-policy.mjs";

describe("WindowedKeyRateLimiter", () => {
  it("allows once per key and intentionally suppresses repeats in the window", () => {
    const limiter = new WindowedKeyRateLimiter(1_000);

    expect(limiter.shouldAllow("product", 1_000)).toBe(true);
    expect(limiter.shouldAllow("product", 1_100)).toBe(false);
    expect(limiter.shouldAllow("product", 1_200)).toBe(false);
    expect(limiter.shouldAllow("product", 2_001)).toBe(true);
  });

  it("tracks independent keys independently", () => {
    const limiter = new WindowedKeyRateLimiter(1_000);

    expect(limiter.shouldAllow("product", 10)).toBe(true);
    expect(limiter.shouldAllow("brand", 11)).toBe(true);
  });
});

describe("buildProductLifecycle410Event", () => {
  it("uses only schema-valid lifecycle fields", () => {
    const event = buildProductLifecycle410Event("retired-product");
    expect(event).toEqual({
      name: "product_lifecycle_410",
      productId: "retired-product",
      platform: "web",
    });
    expect(event).not.toHaveProperty("surface");
  });
});