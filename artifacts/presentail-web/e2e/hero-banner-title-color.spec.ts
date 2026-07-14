/**
 * HeroBannerSlide title-colour regression test
 *
 * Guards against the dark-on-dark banner regression where the h2 title colour
 * was accidentally overridden so dark text appeared on a dark photo background.
 *
 * The HeroBannerSlide component uses `!text-white` (Tailwind !important) to
 * force the title to #ffffff regardless of any theme or cascade.  This test
 * verifies that the computed colour of the h2 element is white on both
 * desktop and mobile viewports (the suite runs under both "chromium" and
 * "Mobile Chrome" projects per playwright.config.ts).
 *
 * All external API calls that could cause a runtime crash are stubbed.
 * The test navigates to the locale-prefixed URL `/en-lb/beirut/` (same
 * pattern used by currency-persistence.spec.ts) so the LocaleContext and
 * LocationContext initialise correctly from localStorage.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
    {
      code: "AED",
      name: "UAE Dirham",
      symbol: "AED",
      symbolPosition: "left",
      spaceBetween: true,
      decimals: 2,
    },
    {
      code: "EUR",
      name: "Euro",
      symbol: "€",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

const STUB_FX_RATES = {
  ok: true,
  base: "USD",
  rates: { USD: 1, AED: 3.67, EUR: 0.92 },
};

const STUB_BANNER = {
  id: "test-banner-001",
  title: "Fresh Flowers for Every Moment",
  subtitle: "Same-day delivery across Lebanon",
  mediaType: "image",
  mediaUrl: "https://images.unsplash.com/photo-stub/banner.jpg",
  sortOrder: 0,
};

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/**
 * A minimal 1×1 transparent PNG, base64-encoded.
 * Returned for the banner image so the <img> element stays in the DOM
 * (a 404 triggers the onError handler which removes the element).
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pre-seed delivery location in localStorage so the homepage renders fully. */
async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
}

/**
 * Install the API stubs required by the homepage.
 *
 * NOTE: Playwright processes routes in LIFO order (last registered = first
 * matched).  Stubs are registered most-specific first so that a later
 * catch-all does not shadow them.  We avoid a broad /api/** catch-all here
 * and let unhandled requests fail naturally — the page renders gracefully
 * with loading/empty states for unresolved data.
 */
async function installStubs(page: Page): Promise<void> {
  // The key stub: return one banner with a title so HeroBannerSlide renders.
  // Register BEFORE the less-specific geo/currency stubs so it is not shadowed.
  await page.route("**/api/homepage/banners**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ banners: [STUB_BANNER] }),
    }),
  );

  await page.route("**/api/currencies**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );

  await page.route("**/api/fx/rates**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );

  await page.route("**/api/geo**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currencyCode: "USD", source: "ip" }),
    }),
  );

  // Empty catalog metadata so the Navbar renders without crashing.
  await page.route("**/api/catalog/metadata**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ categories: [], occasions: [], brands: [] }),
    }),
  );

  // Serve a tiny transparent PNG for the banner image so the <img> stays
  // in the DOM and the carousel renders the slide content.
  await page.route("**/images.unsplash.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
  );

  // OS proxy URL (used by buildOsProxyUrl when the image is an OS-storage URL).
  await page.route("**/api/catalog/proxy-image**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("HeroBannerSlide — title colour", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedLocation(page);
  });

  test("banner h2 title has computed colour #ffffff (white)", async ({ page }) => {
    // Navigate to the locale-prefixed URL matching the seeded location.
    // Using `/en-lb/beirut/` (same pattern as currency-persistence.spec.ts)
    // ensures the LocaleContext and LocationContext initialise from localStorage.
    await page.goto("/en-lb/beirut/");

    // Wait for the slide to appear in the DOM.
    const slide = page.locator(`[data-testid="slide-${STUB_BANNER.id}"]`);
    await expect(slide).toBeVisible({ timeout: 15_000 });

    // Locate the h2 title inside the slide.
    const title = slide.locator("h2").first();
    await expect(title).toBeVisible({ timeout: 10_000 });
    await expect(title).toHaveText(STUB_BANNER.title);

    // Assert the computed colour is white.  The component uses `!text-white`
    // (Tailwind's forced-white utility).  A regression that removes or
    // overrides it would produce a different rgb() value here and fail the test.
    const color = await title.evaluate(
      (el) => window.getComputedStyle(el).color,
    );

    // Both "rgb(255, 255, 255)" and "rgba(255, 255, 255, 1)" are acceptable.
    expect(color, `h2 title color must be white but got: ${color}`).toMatch(
      /^rgba?\(255,\s*255,\s*255/,
    );
  });

  test("banner slide renders at mobile viewport width", async ({ page, viewport }) => {
    // This test is most meaningful under the "Mobile Chrome" project
    // (390 × 844) but passes on desktop too since the slide renders at all
    // widths.  If a future responsive-layout change hides the slide on mobile,
    // this test will catch it.
    await page.goto("/en-lb/beirut/");

    const slide = page.locator(`[data-testid="slide-${STUB_BANNER.id}"]`);
    await expect(slide).toBeVisible({ timeout: 15_000 });

    // On a genuine mobile viewport (≤ 430 px) confirm the slide is
    // visible within the viewport without scrolling.
    if (viewport && viewport.width <= 430) {
      await expect(slide).toBeInViewport();
    }
  });
});
