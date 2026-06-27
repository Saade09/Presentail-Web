/**
 * E2e test: PaymentMethods no horizontal overflow at phone width (375 px)
 *
 * Verifies that the PaymentMethods component (which uses flex-wrap) does not
 * cause a horizontal scrollbar or page-level overflow on either of its two
 * render sites:
 *   1. Footer — present on the homepage
 *   2. ProductDetail — present on the product detail page
 *
 * All tests run at a 375 × 812 viewport (iPhone SE / standard phone width).
 * API endpoints are stubbed so the checks are hermetic and do not require a
 * live backend.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

const PHONE = { width: 375, height: 812 };

// ---------------------------------------------------------------------------
// API stubs (minimal — just enough for the pages to render)
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
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

const STUB_FX_RATES = {
  ok: true,
  base: "USD",
  rates: { USD: 1 },
};

const STUB_PRODUCTS = {
  ok: true,
  products: [
    {
      id: "rose-bouquet",
      name: "Rose Bouquet",
      slug: "rose-bouquet",
      priceValue: 65,
      image: { uri: "https://example.com/rose.jpg" },
      category: "flowers",
      description: "A beautiful rose bouquet",
    },
  ],
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_PRODUCTS),
    }),
  );
  // Stub OS product endpoints too (direct browser fetches)
  await page.route("**/os.presentail.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: STUB_PRODUCTS.products }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Overflow helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the page has a horizontal scrollbar — i.e. when the
 * rendered content is wider than the viewport.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth >
      document.documentElement.clientWidth;
  });
}

/**
 * Returns the bounding rect of an element relative to the viewport.
 * Used to assert the component itself doesn't bleed past the right edge.
 */
async function elementOverflowsViewport(
  page: Page,
  testId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.right > window.innerWidth;
  }, testId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("PaymentMethods — no horizontal overflow at 375 px (phone)", () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await page.addInitScript(
      ({ location }) => {
        window.localStorage.setItem(
          "presentail_location_v1",
          JSON.stringify(location),
        );
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { location: LOCATION },
    );
  });

  // -------------------------------------------------------------------------
  // 1. Footer (homepage)
  // -------------------------------------------------------------------------

  test("Footer: PaymentMethods does not overflow horizontally", async ({
    page,
  }) => {
    await page.goto("/");

    // Scroll to the bottom so the footer and its PaymentMethods are rendered
    // and in the normal document flow.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for the payment-methods component inside the footer to be visible.
    const footerPayment = page
      .locator("footer [data-testid='payment-methods']")
      .first();
    await expect(footerPayment).toBeVisible({ timeout: 10_000 });

    // Assert no page-level horizontal scrollbar.
    const pageOverflows = await hasHorizontalOverflow(page);
    expect(pageOverflows, "page should have no horizontal scrollbar").toBe(
      false,
    );

    // Assert the component itself doesn't bleed past the viewport right edge.
    const componentOverflows = await elementOverflowsViewport(
      page,
      "payment-methods",
    );
    expect(
      componentOverflows,
      "payment-methods component should not bleed past the right viewport edge",
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. ProductDetail page
  // -------------------------------------------------------------------------

  test("ProductDetail: PaymentMethods does not overflow horizontally", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/product/rose-bouquet");

    // Wait for the product to render (the payment-methods testid is present
    // inside the ProductDetail layout).
    const pdpPayment = page.getByTestId("payment-methods").first();
    await expect(pdpPayment).toBeVisible({ timeout: 15_000 });

    // Assert no page-level horizontal scrollbar.
    const pageOverflows = await hasHorizontalOverflow(page);
    expect(pageOverflows, "page should have no horizontal scrollbar").toBe(
      false,
    );

    // Assert the component itself is fully within the viewport width.
    const componentOverflows = await elementOverflowsViewport(
      page,
      "payment-methods",
    );
    expect(
      componentOverflows,
      "payment-methods component should not bleed past the right viewport edge",
    ).toBe(false);
  });
});
