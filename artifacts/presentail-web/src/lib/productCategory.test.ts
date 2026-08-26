import { describe, expect, it } from "vitest";
import { resolveProductBreadcrumbCategory } from "./productCategory";

describe("resolveProductBreadcrumbCategory", () => {
  const categories = [
    { id: "bundles", name: "Gift Bundles" },
    { id: "balloon-arrangements", name: "Balloon Arrangements" },
  ];

  it("prefers the source category list over a stale singular bundles fallback", () => {
    expect(
      resolveProductBreadcrumbCategory(
        {
          category: "bundles",
          categories: ["balloon-arrangements"],
        },
        categories,
      ),
    ).toEqual({
      id: "balloon-arrangements",
      name: "Balloon Arrangements",
    });
  });

  it("uses the singular compatibility category when no source list is present", () => {
    expect(
      resolveProductBreadcrumbCategory(
        {
          category: "bundles",
          categories: [],
        },
        categories,
      )?.id,
    ).toBe("bundles");
  });
});