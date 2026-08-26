import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — seo-inject is an intentionally server-only ESM module.
import { injectSeoTagsAsync } from "../../seo-inject.mjs";

const HTML = "<!doctype html><html><head><title>Old</title></head><body><div id=\"root\"></div></body></html>";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SEO cold-request coalescing", () => {
  it("shares one product fetch across concurrent requests for the same entity", async () => {
    let productFetches = 0;
    let releaseFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        productFetches += 1;
        await gate;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            product: {
              name: "Coalesced Product",
              description: "Concurrent requests share one upstream call.",
              image: null,
              priceValue: 25,
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const opts = {
      apiBaseUrl: "https://api.coalescing-product.test",
      origin: "https://presentail.test",
      basePath: "",
    };
    const first = injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/coalescing-product-unique",
      opts,
    );
    const second = injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/coalescing-product-unique",
      opts,
    );
    await vi.waitFor(() => expect(productFetches).toBe(1));
    releaseFetch?.();
    const [firstHtml, secondHtml] = await Promise.all([first, second]);

    expect(productFetches).toBe(1);
    expect(firstHtml).toContain("Coalesced Product");
    expect(secondHtml).toContain("Coalesced Product");
  });

  it("shares city and parent listing work across concurrent category requests", async () => {
    let categoryFetches = 0;
    let listingFetches = 0;
    let releaseListings: (() => void) | undefined;
    const listingGate = new Promise<void>((resolve) => {
      releaseListings = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const value = String(url);
      if (value.includes("/api/woo/category?")) {
        categoryFetches += 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            category: { name: "Coalesced Category", description: "", image: null },
          }),
        };
      }
      if (value.includes("/api/woo/category-products?")) {
        listingFetches += 1;
        await listingGate;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, products: [], count: 0 }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const opts = {
      apiBaseUrl: "https://api.coalescing-listing.test",
      origin: "https://presentail.test",
      basePath: "",
    };
    const first = injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/category/coalescing-category-unique",
      opts,
    );
    const second = injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/category/coalescing-category-unique",
      opts,
    );
    await vi.waitFor(() => expect(listingFetches).toBe(2));
    releaseListings?.();
    await Promise.all([first, second]);

    expect(categoryFetches).toBe(1);
    expect(listingFetches).toBe(2);
  });

  it("reuses listing data within the bounded TTL and refreshes after expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"));
    let listingFetches = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const value = String(url);
      if (value.includes("/api/woo/category?")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            category: { name: "TTL Category", description: "", image: null },
          }),
        };
      }
      if (value.includes("/api/woo/category-products?")) {
        listingFetches += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, products: [], count: 0 }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
    const opts = {
      apiBaseUrl: "https://api.listing-ttl.test",
      origin: "https://presentail.test",
      basePath: "",
    };
    const pathname = "/en-lb/beirut/category/listing-ttl-category-unique";

    await injectSeoTagsAsync(HTML, pathname, opts);
    expect(listingFetches).toBe(2);
    await injectSeoTagsAsync(HTML, pathname, opts);
    expect(listingFetches).toBe(2);

    vi.advanceTimersByTime(15_001);
    await injectSeoTagsAsync(HTML, pathname, opts);
    expect(listingFetches).toBe(4);
  });
});