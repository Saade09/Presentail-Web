/**
 * Breadcrumb regression tests — PageBreadcrumb renders the correct trail on
 * all 16+ pages that have breadcrumbs.
 *
 * Guards against silent breadcrumb removal that would suppress Google's
 * BreadcrumbList JSON-LD rich results without any failing test.
 *
 * Pages covered:
 *   Shop (no-filter), Shop (category), Shop (occasion),
 *   ProductDetail,
 *   AllOccasions,
 *   Blog, BlogPost,
 *   Faqs, Contact, Weddings, Corporate, Careers, Partner,
 *   Terms, Privacy, ShippingPolicy, ReturnPolicy
 *
 * Approach:
 *   - Product-dependent pages (Shop, ProductDetail) stub /api/woo/products so
 *     they render deterministically without a live OS API key.
 *   - All tests pre-seed localStorage with a Beirut delivery location so the
 *     ShopShell renders immediately instead of showing the country-picker.
 *   - Breadcrumb assertion: nav[aria-label="breadcrumb"] is visible, the Home
 *     link is present, and the current-page crumb (aria-current="page")
 *     contains the expected label text.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };
const BASE = "/en-lb/beirut";

const STUB_PRODUCT = {
  id: "bc-breadcrumb-rose",
  name: "BC Breadcrumb Rose",
  slug: "bc-breadcrumb-rose",
  priceValue: 55,
  image: { uri: "https://example.com/rose.jpg" },
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  occasions: ["birthday"],
  brandNames: [],
  description: "E2E stub product for breadcrumb regression tests.",
};

const STUB_CATALOG_METADATA = {
  categories: [
    { id: "hand-bouquets", name: "Hand Bouquets", icon: "flower" },
    { id: "flower-boxes", name: "Flower Boxes", icon: "box" },
  ],
  occasions: [{ id: "birthday", name: "Birthday", icon: "cake" }],
  brands: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed localStorage with a delivery location before the first navigation so
 * the ShopShell renders immediately instead of the country-picker.
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
 * Stub /api/woo/products so shop and product-detail pages render
 * deterministically without a live Presentail OS API key.
 */
async function stubProducts(page: Page): Promise<void> {
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [STUB_PRODUCT] }),
    }),
  );
}

/**
 * Stub /api/catalog/metadata so category names resolve correctly on
 * ProductDetail and category/occasion pages.
 */
async function stubCatalogMetadata(page: Page): Promise<void> {
  await page.route(/\/api\/catalog\/metadata/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CATALOG_METADATA),
    }),
  );
}

/**
 * Assert the PageBreadcrumb trail:
 *   1. nav[aria-label="breadcrumb"] is visible.
 *   2. A "Home" link exists inside the nav.
 *   3. The current-page crumb (aria-current="page") contains `currentLabel`.
 */
async function assertBreadcrumb(
  page: Page,
  currentLabel: string | RegExp,
): Promise<void> {
  const nav = page.locator('nav[aria-label="breadcrumb"]');
  await expect(nav).toBeVisible({ timeout: 15_000 });
  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toContainText(
    currentLabel,
    { ignoreCase: true },
  );
}

// ---------------------------------------------------------------------------
// 1. Shop — no filter  (Home > All Collection)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Shop (no filter)", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await seedLocation(page);
    await page.goto(`${BASE}/shop`);
  });

  test('shows "Home > All Collection" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "All Collection");
  });
});

// ---------------------------------------------------------------------------
// 2. Shop — category filter  (Home > Hand Bouquets)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Shop (category: hand-bouquets)", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await seedLocation(page);
    await page.goto(`${BASE}/category/hand-bouquets`);
  });

  test('shows "Home > Hand Bouquets" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "Hand Bouquets");
  });
});

// ---------------------------------------------------------------------------
// 3. Shop — occasion filter  (Home > Birthday)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Shop (occasion: birthday)", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await seedLocation(page);
    await page.goto(`${BASE}/occasion/birthday`);
  });

  test('shows "Home > Birthday" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "Birthday");
  });
});

// ---------------------------------------------------------------------------
// 4. ProductDetail  (Home > All Collection > Hand Bouquets > Product Name)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — ProductDetail", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto(`${BASE}/product/${STUB_PRODUCT.slug}`);
  });

  test("shows product name as the current crumb", async ({ page }) => {
    await assertBreadcrumb(page, STUB_PRODUCT.name);
  });

  test('shows a navigable "All Collection" link before the product name', async ({
    page,
  }) => {
    const nav = page.locator('nav[aria-label="breadcrumb"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });
    // Wait for the product data to resolve so the full trail is rendered.
    await expect(nav.locator('[aria-current="page"]')).toContainText(
      STUB_PRODUCT.name,
      { timeout: 15_000 },
    );
    await expect(nav.getByRole("link", { name: "All Collection" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. AllOccasions  (Home > Shop by Occasion)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — AllOccasions", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/catalog\/metadata/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_CATALOG_METADATA),
      }),
    );
    await seedLocation(page);
    await page.goto(`${BASE}/occasions`);
  });

  test('shows "Home > Shop by Occasion" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /shop by occasion/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Blog  (Home > The Atelier Journal)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Blog", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/blog`);
  });

  test('shows "Home > The Atelier Journal" breadcrumb trail', async ({
    page,
  }) => {
    await assertBreadcrumb(page, "Atelier Journal");
  });
});

// ---------------------------------------------------------------------------
// 7. BlogPost  (Home > Blog > Article title)
// ---------------------------------------------------------------------------

const BLOG_POST_SLUG = "inside-spring-sourcing-trip";
// Partial match on the English title so the test is not brittle to minor copy edits.
const BLOG_POST_TITLE_FRAGMENT = /spring sourcing/i;

test.describe("Breadcrumb — BlogPost", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/blog/${BLOG_POST_SLUG}`);
  });

  test('shows "Home > Blog > Article title" breadcrumb trail with three crumbs', async ({
    page,
  }) => {
    const nav = page.locator('nav[aria-label="breadcrumb"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });
    // Home and Blog are navigable links (non-last crumbs).
    await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Blog" })).toBeVisible();
    // Article title is the current (last) crumb.
    await expect(nav.locator('[aria-current="page"]')).toContainText(
      BLOG_POST_TITLE_FRAGMENT,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. FAQs  (Home > FAQs)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — FAQs", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/faqs`);
  });

  test('shows "Home > FAQs" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "FAQs");
  });
});

// ---------------------------------------------------------------------------
// 9. Contact  (Home > Contact Us)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Contact", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/contact`);
  });

  test('shows "Home > Contact Us" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "Contact Us");
  });
});

// ---------------------------------------------------------------------------
// 10. Weddings  (Home > Weddings & Events)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Weddings", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/weddings`);
  });

  test('shows "Home > Weddings & Events" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /weddings/i);
  });
});

// ---------------------------------------------------------------------------
// 11. Corporate  (Home > Corporate Gifts)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Corporate", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/corporate`);
  });

  test('shows "Home > Corporate Gifts" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, "Corporate Gifts");
  });
});

// ---------------------------------------------------------------------------
// 12. Careers  (Home > Careers at Presentail)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Careers", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/careers`);
  });

  test('shows "Home > Careers…" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /careers/i);
  });
});

// ---------------------------------------------------------------------------
// 13. Partner  (Home > Partner With Us)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Partner", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/partner`);
  });

  test('shows "Home > Partner With Us" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /partner/i);
  });
});

// ---------------------------------------------------------------------------
// 14. Terms  (Home > Terms of Use)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Terms", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/terms`);
  });

  test('shows "Home > Terms of Use" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /terms/i);
  });
});

// ---------------------------------------------------------------------------
// 15. Privacy  (Home > Privacy Policy)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — Privacy", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/privacy`);
  });

  test('shows "Home > Privacy Policy" breadcrumb trail', async ({ page }) => {
    await assertBreadcrumb(page, /privacy/i);
  });
});

// ---------------------------------------------------------------------------
// 16. ShippingPolicy  (Home > Shipping & Delivery Policy)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — ShippingPolicy", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/shipping-policy`);
  });

  test('shows "Home > Shipping & Delivery Policy" breadcrumb trail', async ({
    page,
  }) => {
    await assertBreadcrumb(page, /shipping/i);
  });
});

// ---------------------------------------------------------------------------
// 17. ReturnPolicy  (Home > Return & Refund Policy)
// ---------------------------------------------------------------------------

test.describe("Breadcrumb — ReturnPolicy", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/return-policy`);
  });

  test('shows "Home > Return & Refund Policy" breadcrumb trail', async ({
    page,
  }) => {
    await assertBreadcrumb(page, /return/i);
    await expect(page.getByTestId("return-policy-page")).not.toContainText(
      "Perishable goods and statutory withdrawal",
    );
  });
});

// ---------------------------------------------------------------------------
// 18. Cyprus ShippingPolicy + shared footer
// ---------------------------------------------------------------------------

test.describe("Cyprus shipping policy and footer", () => {
  test("renders the Cyprus policy copy and legacy footer link", async ({ page }) => {
    await page.addInitScript((loc) => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(loc),
      );
    }, { countryCode: "CY", cityId: "cy-larnaca" });

    await page.goto("/en-cy/larnaca/shipping-policy");

    await expect(page.getByTestId("shipping-policy-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("shipping-policy-page")).toContainText(
      "before 9:00 AM Cyprus local time",
    );
    await expect(page.getByTestId("shipping-policy-page")).toContainText(
      "9:00 AM to 6:00 PM Cyprus local time",
    );
    await expect(page.getByTestId("shipping-policy-page")).toContainText(
      "postal services or air freight",
    );
    await expect(page.getByTestId("shipping-policy-page")).toContainText(
      "address-based",
    );
    await expect(page.getByTestId("shipping-policy-page")).toContainText(
      "cannot be reached",
    );

    const shippingLink = page.getByTestId("footer-link-shipping-policy");
    await expect(shippingLink).toBeVisible();
    // Footer links directly to the city-scoped URL so Larnaca shoppers are
    // not routed through the Nicosia hub. /cyprus/shipping-policy/ stays as
    // a server-side fallback for external/direct-entry links.
    await expect(shippingLink).toHaveAttribute("href", "/en-cy/larnaca/shipping-policy");
  });

  test("does not add the Cyprus Policies section to the Lebanon footer", async ({
    page,
  }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/`);
    await expect(page.getByTestId("footer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("footer-link-shipping-policy")).toHaveCount(0);
    await expect(page.getByText("Policies", { exact: true })).toHaveCount(0);
  });

  test("renders the Cyprus returns and refund policy with the Cyprus-only footer link", async ({
    page,
  }) => {
    await page.addInitScript((loc) => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(loc),
      );
    }, { countryCode: "CY", cityId: "cy-larnaca" });

    await page.goto("/en-cy/larnaca/return-policy");

    const policy = page.getByTestId("return-policy-page");
    await expect(policy).toBeVisible({ timeout: 15_000 });
    await expect(policy).toContainText("Fresh flowers");
    await expect(policy).toContainText("deteriorate or expire rapidly");
    await expect(policy).toContainText("statutory right of withdrawal");
    await expect(policy).toContainText("within 24 hours after delivery");
    await expect(policy).toContainText("clear photographs");
    await expect(policy).toContainText("replacement, redelivery");
    await expect(policy).toContainText("refund is not automatic");
    await expect(policy).toContainText("before the order has been dispatched");
    await expect(policy).toContainText("preparation or fulfilment has started");
    await expect(policy).toContainText("original payment method or card");
    await expect(policy).toContainText("Bank and card processing times may vary");
    await expect(policy).toContainText("hello@presentail.com");

    const refundLink = page.getByTestId("footer-link-refund-policy");
    await expect(refundLink).toBeVisible();
    // Footer links directly to the city-scoped URL, not the legacy public entry.
    await expect(refundLink).toHaveAttribute("href", "/en-cy/larnaca/return-policy");
  });

  test("redirects the public Cyprus refund URL to the canonical policy page", async ({
    page,
  }) => {
    await page.goto("/cyprus/refund-policy/");

    await expect(page).toHaveURL(/\/en-cy\/nicosia\/return-policy$/);
    await expect(page.getByTestId("return-policy-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("return-policy-page")).toContainText(
      "Perishable goods and statutory withdrawal",
    );
  });

  test("does not add the Cyprus refund link to the Lebanon footer", async ({ page }) => {
    await seedLocation(page);
    await page.goto(`${BASE}/`);
    await expect(page.getByTestId("footer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("footer-link-refund-policy")).toHaveCount(0);
  });
});
