// Smoke-check: normaliseProduct() correctly maps snake_case availability fields
// from the OS wire format into OSProduct.deliverableCountries/deliverableCities.
//
// normaliseProduct() is not exported, so we test it via fetchOsProducts() with
// a mocked fetch — the same pattern used in client.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOsProducts } from "./client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const config = { apiKey: "test-key" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normaliseProduct — snake_case availability field extraction", () => {
  it("maps deliverable_countries (snake_case) to deliverableCountries (uppercase)", async () => {
    const rawProduct = {
      id: 313,
      name: "Single Red Rose",
      price: 25,
      images: [],
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
      deliverable_countries: ["cy"],          // snake_case, lowercase
      deliverable_cities: ["cy-nicosia"],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    expect(product).toBeDefined();
    expect(product!.deliverableCountries).toEqual(["CY"]);     // normalised to uppercase
    expect(product!.deliverableCities).toEqual(["cy-nicosia"]);
  });

  it("maps deliverableCountries (camelCase) when snake_case is absent", async () => {
    const rawProduct = {
      id: 314,
      name: "Gold Heart Balloon",
      price: 18,
      images: [],
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
      deliverableCountries: ["LB", "AE"],    // camelCase form
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    expect(product!.deliverableCountries).toEqual(["LB", "AE"]);
  });

  it("leaves deliverableCountries undefined when the field is absent on the wire", async () => {
    const rawProduct = {
      id: 315,
      name: "Velvet Rose Bouquet",
      price: 50,
      images: [],
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    expect(product!.deliverableCountries).toBeUndefined();
    expect(product!.deliverableCities).toBeUndefined();
  });

  it("maps image_public_url (snake_case) to imagePublicUrl on each image object", async () => {
    const rawProduct = {
      id: 313,
      name: "Elegant Lily",
      price: 45,
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
      images: [
        {
          url: "https://os.presentail.com/api/storage/products/private-elegant-lily.jpg",
          image_public_url: "https://os.presentail.com/api/storage/public-objects/products/elegant-lily.jpg",
        },
        {
          url: "https://os.presentail.com/api/storage/products/private-elegant-lily-2.jpg",
          // No image_public_url — imagePublicUrl should be null
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    expect(product).toBeDefined();
    expect(product!.images).toHaveLength(2);
    // First image: image_public_url mapped to imagePublicUrl
    expect(product!.images[0]!.imagePublicUrl).toBe(
      "https://os.presentail.com/api/storage/public-objects/products/elegant-lily.jpg",
    );
    expect(product!.images[0]!.url).toBe(
      "https://os.presentail.com/api/storage/products/private-elegant-lily.jpg",
    );
    // Second image: no image_public_url → imagePublicUrl is null
    expect(product!.images[1]!.imagePublicUrl).toBeNull();
  });

  it("preserves camelCase imagePublicUrl when already normalised by the OS", async () => {
    const rawProduct = {
      id: 314,
      name: "Gold Heart Balloon",
      price: 18,
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
      images: [
        {
          url: "https://os.presentail.com/api/storage/products/private-balloon.jpg",
          imagePublicUrl:
            "https://os.presentail.com/api/storage/public-objects/products/balloon.jpg",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    expect(product!.images[0]!.imagePublicUrl).toBe(
      "https://os.presentail.com/api/storage/public-objects/products/balloon.jpg",
    );
  });

  it("leaves deliverableCountries undefined when the wire sends an empty array", async () => {
    const rawProduct = {
      id: 316,
      name: "Balloon Box",
      price: 35,
      images: [],
      inStock: true,
      catalog_categories: [],
      catalog_brands: [],
      occasions: [],
      deliverable_countries: [],             // empty = unrestricted
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ products: [rawProduct], totalPages: 1 }),
        ),
      ),
    );

    const result = await fetchOsProducts(config);
    const product = result.products[0];
    // Empty list → treated as unrestricted → undefined (not [])
    expect(product!.deliverableCountries).toBeUndefined();
  });
});
