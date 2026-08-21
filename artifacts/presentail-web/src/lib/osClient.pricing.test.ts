import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOsProductPricing, isValidOsNumericId } from "./osClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OS product pricing identifiers", () => {
  it.each([123, "123", "000123"])("accepts numeric OS IDs (%s)", (id) => {
    expect(isValidOsNumericId(id)).toBe(true);
  });

  it.each(["floral-sun", "123.0", "123/other", "", -1, 1.5])(
    "rejects a public slug or malformed ID (%s)",
    (id) => {
      expect(isValidOsNumericId(id)).toBe(false);
    },
  );

  it("does not issue a pricing request for a public product slug", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOsProductPricing("floral-sun")).rejects.toThrow(
      "numeric OS ID",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the numeric OS ID in the proxy request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        regularPriceUsd: 90,
        discountPriceUsd: 75,
        discountPriceAed: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOsProductPricing(123)).resolves.toEqual({
      regularPriceUsd: 90,
      discountPriceUsd: 75,
      discountPriceAed: null,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/woo/product-pricing/123");
  });
});