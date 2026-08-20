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

const STUB_CATALOG_METADATA = {
  categories: [],
  occasions: [],
  brands: [],
};

const STUB_OCCASIONS = {
  occasions: Array.from({ length: 18 }, (_, index) => ({
    slug: `occasion-${index + 1}`,
    name: `Occasion ${index + 1}`,
    image: null,
    count: 1,
    featured: true,
  })),
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
  await page.route("**/api/catalog/metadata**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CATALOG_METADATA),
    }),
  );
  await page.route("**/api/catalog/occasions**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_OCCASIONS),
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
// Logo clipping helper
// ---------------------------------------------------------------------------

/**
 * Returns true when any logo image inside `[data-testid="payment-methods"]`
 * is clipped or has zero visible area. Checks are relative to both the
 * viewport and the container bounds so logos hidden by `overflow: hidden` on
 * an ancestor are also caught.
 */
async function anyLogoIsClipped(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const TOLERANCE = 2; // px — avoids false positives from sub-pixel rounding
    const containers = document.querySelectorAll(
      '[data-testid="payment-methods"]',
    );
    for (const container of containers) {
      const containerRect = container.getBoundingClientRect();
      const imgs = container.querySelectorAll("img");
      for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        // Clipped if rendered with no visible size
        if (rect.width === 0 || rect.height === 0) return true;
        // Clipped if the right edge overflows the viewport
        if (rect.right > window.innerWidth + TOLERANCE) return true;
        // Clipped if the right edge overflows the container (overflow:hidden)
        if (rect.right > containerRect.right + TOLERANCE) return true;
        // Clipped if the bottom edge overflows the container
        if (rect.bottom > containerRect.bottom + TOLERANCE) return true;
      }
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const NARROW = { width: 320, height: 568 };

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
    // Use a locale-prefixed path so the shop shell with footer renders instead
    // of the Landing country-picker (which has no footer).
    await page.goto("/en-lb/beirut/");

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

// ---------------------------------------------------------------------------
// 320 px — very small / legacy phone (e.g. iPhone SE 1st gen)
// ---------------------------------------------------------------------------

test.describe(
  "PaymentMethods — logos not clipped at 320 px (very small screen)",
  () => {
    test.use({ viewport: NARROW });

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

    test("Footer: no logo is clipped or overflowing at 320 px", async ({
      page,
    }) => {
      await page.goto("/en-lb/beirut/");

      // Scroll to the bottom so the footer renders in the normal flow.
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );

      const footerPayment = page
        .locator("footer [data-testid='payment-methods']")
        .first();
      await expect(footerPayment).toBeVisible({ timeout: 10_000 });

      // No page-level horizontal scrollbar.
      const pageOverflows = await hasHorizontalOverflow(page);
      expect(
        pageOverflows,
        "page should have no horizontal scrollbar at 320 px",
      ).toBe(false);

      // The component itself must not bleed past the viewport right edge.
      const componentOverflows = await elementOverflowsViewport(
        page,
        "payment-methods",
      );
      expect(
        componentOverflows,
        "payment-methods should not bleed past the right viewport edge at 320 px",
      ).toBe(false);

      // No individual logo image should be clipped.
      const logosClipped = await anyLogoIsClipped(page);
      expect(
        logosClipped,
        "no payment logo should be clipped or have zero size at 320 px",
      ).toBe(false);
    });

    test("ProductDetail: no logo is clipped or overflowing at 320 px", async ({
      page,
    }) => {
      await page.goto("/en-lb/beirut/product/rose-bouquet");

      const pdpPayment = page.getByTestId("payment-methods").first();
      await expect(pdpPayment).toBeVisible({ timeout: 15_000 });

      // No page-level horizontal scrollbar.
      const pageOverflows = await hasHorizontalOverflow(page);
      expect(
        pageOverflows,
        "page should have no horizontal scrollbar at 320 px",
      ).toBe(false);

      // The component itself must not bleed past the viewport right edge.
      const componentOverflows = await elementOverflowsViewport(
        page,
        "payment-methods",
      );
      expect(
        componentOverflows,
        "payment-methods should not bleed past the right viewport edge at 320 px",
      ).toBe(false);

      // No individual logo image should be clipped.
      const logosClipped = await anyLogoIsClipped(page);
      expect(
        logosClipped,
        "no payment logo should be clipped or have zero size at 320 px",
      ).toBe(false);
    });
  },
);

// ---------------------------------------------------------------------------
// Mobile occasions panel — CTA remains pinned above the scrollable tile grid
// ---------------------------------------------------------------------------

for (const viewport of [NARROW, PHONE]) {
  test.describe(
    `Mobile occasions CTA remains visible at ${viewport.width}×${viewport.height}`,
    () => {
      test.use({ viewport });

      test("is visible before scrolling and closes the menu after routing", async ({
        page,
      }) => {
        // The shared Playwright projects supply their own device settings, so
        // set the exact regression viewport on the page as well.
        await page.setViewportSize(viewport);
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

        await page.goto("/en-lb/beirut/");
        await page.getByTestId("button-mobile-menu").click();

        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await sheet.getByRole("button", { name: "Occasions" }).click();

        const panel = page.getByTestId("mobile-sub-panel-occasions");
        const scrollArea = page.getByTestId("mobile-sub-panel-scroll");
        const cta = page.getByTestId("mobile-sub-panel-footer").getByRole("link", {
          name: "View all Occasions",
        });
        await expect(panel).toBeVisible();
        await expect(cta).toBeVisible();
        await expect
          .poll(async () => (await panel.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
          .toBeLessThanOrEqual(1);

        const browserViewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        expect(browserViewport).toEqual(viewport);

        const ctaBox = await cta.boundingBox();
        expect(ctaBox, "occasions CTA should have visible bounds").not.toBeNull();
        expect(ctaBox!.x).toBeGreaterThanOrEqual(0);
        expect(ctaBox!.y).toBeGreaterThanOrEqual(0);
        expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(browserViewport.width);
        expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(browserViewport.height);

        await expect
          .poll(() =>
            cta.evaluate(
              (element) =>
                !element.closest('[data-testid="mobile-sub-panel-scroll"]'),
            ),
          )
          .toBe(true);

        // Scrolling the grid must not move the CTA out of the viewport.
        await scrollArea.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(cta).toBeVisible();
        const pinnedCtaBox = await cta.boundingBox();
        expect(pinnedCtaBox!.y + pinnedCtaBox!.height).toBeLessThanOrEqual(browserViewport.height);

        await cta.click();
        await expect(page).toHaveURL(/\/en-lb\/beirut\/occasions$/);
        await expect(sheet).toBeHidden();
      });
    },
  );
}
