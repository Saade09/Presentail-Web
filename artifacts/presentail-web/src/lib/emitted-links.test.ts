import { describe, expect, it, vi } from "vitest";
// This is a plain Node ESM audit helper, intentionally without a TS facade.
// @ts-ignore -- script modules have no declaration file
import {
  crawlEmittedLinks,
  sameOriginAnchorTargets,
} from "../../scripts/seo-checks/emitted-links.mjs";

describe("emitted sitemap-page anchors", () => {
  it("keeps only same-origin HTTP anchors and strips fragments", () => {
    expect(
      sameOriginAnchorTargets(
        '<a href="/en-lb/beirut/category/cakes#top">Cakes</a><a href="https://other.example/x">Offsite</a><a href="mailto:x@example.com">Mail</a>',
        "https://presentail.com/en-lb/beirut/",
        "https://presentail.com",
      ),
    ).toEqual(["https://presentail.com/en-lb/beirut/category/cakes"]);
  });

  it("reports a retired emitted product target after bounded HTTP validation", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: !url.includes("retired-product"),
      status: url.includes("retired-product") ? 410 : 200,
      url,
    }));
    const report = await crawlEmittedLinks({
      baseUrl: "https://presentail.com",
      limit: 1,
      pages: [{
        url: "https://presentail.com/en-lb/beirut/blog",
        html: '<a href="/en-lb/beirut/product/retired-product">Old product</a><a href="/en-lb/beirut/category/cakes">Cakes</a>',
      }],
      fetchImpl,
    });

    expect(report.checked).toBe(1);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: "emitted-link-failed",
        url: "https://presentail.com/en-lb/beirut/product/retired-product",
      }),
    ]);
  });
});