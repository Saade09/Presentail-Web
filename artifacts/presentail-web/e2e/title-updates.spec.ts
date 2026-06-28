/**
 * Client-side title update regression tests
 *
 * Verifies that SPA navigation to product, category, occasion, and brand
 * pages updates document.title with the entity name. A regression in
 * SeoHead.tsx or the page components (the useEffect title hooks) would
 * otherwise go undetected until a shopper notices a stale tab title.
 *
 * These tests use a real browser context because document.title is set by a
 * React useEffect after the component mounts — not in the server-rendered
 * HTML — which means an APIRequestContext check would always miss it.
 *
 * Approach
 * --------
 * - Product / category / occasion pages derive products from /api/woo/products
 *   (the fallback path when VITE_OS_API_KEY is absent). We stub that endpoint
 *   so the tests are hermetic and fast.
 * - Category and occasion titles resolve from the bundled translation catalogue
 *   (the CATEGORIES / OCCASIONS arrays in Shop.tsx map known slugs to i18n
 *   keys); no catalog/metadata API stub is required.
 * - Brand title is derived from the /api/woo/brands response, so we stub that
 *   endpoint with a fixture brand.
 * - localStorage is pre-seeded with a delivery location so the shop shell
 *   renders immediately instead of showing the country-picker.
 *
 * The cross-page SPA navigation test (shop listing → product) loads the city
 * homepage first and then navigates via a real in-app anchor click, so the
 * wouter router performs a client-side transition rather than a full reload.
 * This guards against the title useEffect regressing only during SPA nav (e.g.
 * a missing dependency that caused it to run once on mount but not on route
 * change).
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

const STUB_PRODUCT = {
  id: "e2e-seo-rose",
  name: "E2E Seo Rose",
  slug: "e2e-seo-rose",
  priceValue: 50,
  image: { uri: "https://example.com/rose.jpg" },
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  occasions: ["birthday"],
  brandNames: [],
  description: "A beautiful rose for e2e testing.",
};

const STUB_PRODUCTS_RESPONSE = {
  ok: true,
  products: [STUB_PRODUCT],
};

const STUB_BRAND = {
  id: "e2e-brand-1",
  name: "E2E Luxury Roses",
  slug: "e2e-luxury-roses",
  image: null,
};

const STUB_BRANDS_RESPONSE = {
  ok: true,
  brands: [STUB_BRAND],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed localStorage with a delivery location before the first navigation so
 * the shop shell renders instead of the country-picker landing page. Must be
 * called before page.goto().
 */
async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
}

/**
 * Register a Playwright route handler that responds with the stub products
 * payload for any request matching the /api/woo/products path. Must be called
 * before page.goto() so the handler is active when React Query hydrates.
 */
async function stubProducts(page: Page): Promise<void> {
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_PRODUCTS_RESPONSE),
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Product page
// ---------------------------------------------------------------------------

test.describe("Client-side title — product page", () => {
  test("document.title contains the product name after navigating to a product page", async ({
    page,
  }) => {
    await stubProducts(page);
    await seedLocation(page);
    await page.goto(`/en-lb/beirut/product/${STUB_PRODUCT.slug}`);

    // document.title is set by a useEffect once the product data resolves.
    // toHaveTitle() auto-waits up to the configured Playwright timeout.
    await expect(page).toHaveTitle(new RegExp(STUB_PRODUCT.name));
  });
});

// ---------------------------------------------------------------------------
// 2. Category page
// ---------------------------------------------------------------------------

test.describe("Client-side title — category page", () => {
  test("document.title contains the category name after navigating to a category page", async ({
    page,
  }) => {
    // Stub products so the shop page renders without network errors; the title
    // itself resolves from the bundled translation (no API call required).
    await stubProducts(page);
    await seedLocation(page);

    // "hand-bouquets" is a hard-coded CATEGORIES entry whose English label is
    // "Hand Bouquets" — the title resolves from the bundled translation, so no
    // catalog/metadata stub is needed.
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    await expect(page).toHaveTitle(/Hand Bouquets/);
  });
});

// ---------------------------------------------------------------------------
// 3. Occasion page
// ---------------------------------------------------------------------------

test.describe("Client-side title — occasion page", () => {
  test("document.title contains the occasion name after navigating to an occasion page", async ({
    page,
  }) => {
    await stubProducts(page);
    await seedLocation(page);

    // "birthday" is a hard-coded OCCASIONS entry whose English label is
    // "Birthday" — resolves from the bundled translation, no API call needed.
    await page.goto("/en-lb/beirut/occasion/birthday");

    await expect(page).toHaveTitle(/Birthday/);
  });
});

// ---------------------------------------------------------------------------
// 4. Brand page
// ---------------------------------------------------------------------------

test.describe("Client-side title — brand page", () => {
  test("document.title contains the brand name after navigating to a brand page", async ({
    page,
  }) => {
    // BrandDetail fetches brand metadata from /woo/brands; stub it so the
    // brand resolves to a known display name. The brand-products endpoint is
    // also stubbed (empty list) to prevent the products query from throwing.
    await page.route("**/api/woo/brands**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_BRANDS_RESPONSE),
      }),
    );
    await page.route("**/api/woo/brand-products**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          products: [],
          count: 0,
          brandName: STUB_BRAND.name,
        }),
      }),
    );

    await seedLocation(page);
    await page.goto(`/en-lb/beirut/brand/${STUB_BRAND.slug}`);

    // document.title is set once useBrands resolves and brandName is available.
    await expect(page).toHaveTitle(new RegExp(STUB_BRAND.name));
  });
});

// ---------------------------------------------------------------------------
// 5. Cross-page SPA navigation: shop listing → product detail
//
// This test guards against a regression that only manifests during an in-app
// (wouter) route transition: if the ProductDetail useEffect's dependency array
// were wrong, the title could remain the listing page's title after navigating.
// ---------------------------------------------------------------------------

test.describe("Client-side title — SPA navigation from shop listing to product", () => {
  test("document.title updates to the product name after clicking through from the shop listing", async ({
    page,
  }) => {
    await stubProducts(page);
    await seedLocation(page);

    // Start on the city homepage (shop shell with product listing).
    await page.goto("/en-lb/beirut/");

    // Wait for the React app to mount and render at least one product card link.
    // The stub product has slug "e2e-seo-rose" so the card href ends with that.
    const productLink = page.locator(`a[href*="/product/${STUB_PRODUCT.slug}"]`).first();
    await expect(productLink).toBeVisible({ timeout: 15_000 });

    // Click the product card — this performs a client-side wouter navigation
    // (no full page reload), exactly the scenario we want to guard.
    await productLink.click();

    // After the SPA transition the ProductDetail useEffect fires and updates
    // document.title once the product is found in the already-cached query.
    await expect(page).toHaveTitle(new RegExp(STUB_PRODUCT.name));
  });
});
