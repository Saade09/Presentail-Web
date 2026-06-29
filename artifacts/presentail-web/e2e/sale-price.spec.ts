/**
 * E2E tests: sale prices on the shop / product-listing page.
 *
 * Verifies that a product with a discount shows:
 *   - a "Sale" badge on the card image
 *   - the discounted price prominently
 *   - the regular price with a strikethrough beside it
 *
 * Product data is fully mocked so the test never hits the real OS API or API
 * server. Both the OS-direct path (os.presentail.com) and the API-server
 * fallback path (/api/woo/products) are stubbed so the test is immune to
 * whichever path the running Vite build takes.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 0 },
    { code: "AED", name: "UAE Dirham", symbol: "AED", symbolPosition: "right", spaceBetween: true, decimals: 0 },
    { code: "EUR", name: "Euro", symbol: "€", symbolPosition: "left", spaceBetween: false, decimals: 0 },
  ],
  fallbackCode: "USD",
  countryToCurrency: { AE: "AED", LB: "USD", CY: "EUR" },
};

const STUB_FX_RATES = {
  ok: true,
  base: "USD",
  rates: { USD: 1, EUR: 0.92, AED: 3.67 },
};

// A single product with a USD discount. priceValue=65, discountPriceValue=40.
// The OS-direct product shape: id, name, price, discount_price_usd, discount_price_aed,
// images, categories (via catalog_categories), inStock, occasions, brands.
const STUB_OS_PRODUCT = {
  id: 101,
  slug: "sale-bouquet",
  wcId: 101,
  name: "Sale Bouquet",
  price: 65,
  discount_price_usd: "40",
  discount_price_aed: null,
  images: [{ url: "https://example.com/sale-bouquet.jpg" }],
  catalog_categories: [{ slug: "hand-bouquets", name: "Hand Bouquets" }],
  inStock: true,
  description: "A discounted bouquet",
  featured: false,
  occasions: [],
  brands: [],
  totalSales: 10,
  has_input_field: false,
  deliverableCountries: [],
  deliverableCities: [],
};

// API-server fallback shape (already mapped to Product):
const STUB_WOO_PRODUCT = {
  id: "sale-bouquet",
  wcId: 101,
  name: "Sale Bouquet",
  slug: "sale-bouquet",
  priceValue: 65,
  discountPriceValue: 40,
  discountPriceAed: null,
  image: { uri: "https://example.com/sale-bouquet.jpg" },
  images: [{ uri: "https://example.com/sale-bouquet.jpg" }],
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  inStock: true,
  description: "A discounted bouquet",
  popularity: 10,
  occasions: [],
  brandNames: [],
  hasInputField: false,
};

// ---------------------------------------------------------------------------
// Helper: install all API stubs before the first page.goto()
// ---------------------------------------------------------------------------

async function installStubs(page: Page): Promise<void> {
  // Currency snapshot
  await page.route("**/api/currencies", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  // FX rates
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
  );
  // OS direct-fetch path (VITE_OS_API_KEY is set in the env)
  await page.route("**/os.presentail.com/api/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [STUB_OS_PRODUCT], totalPages: 1 }),
    }),
  );
  // API-server fallback path
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [STUB_WOO_PRODUCT] }),
    }),
  );
  // Brand allowlist — return null so no brand filtering is applied
  await page.route("**/api/catalog/brand-allowlist", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  // Geo currency — return LB → USD so delivery lock stays neutral
  await page.route("**/api/geo/currency", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currencyCode: "USD" }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Sale price on the shop listing page", () => {
  test.beforeEach(async ({ page }) => {
    // Stubs must be registered before the first navigation so React Query's
    // empty cache picks up the mocked responses on the first load.
    await installStubs(page);

    // Seed the delivery location so the shop shell renders instead of the
    // country-picker landing gate.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });

    await page.goto("/en-lb/beirut/");
  });

  test("product card shows a 'Sale' badge when a discount is present", async ({ page }) => {
    // Wait for the product card to appear — the grid is rendered once the
    // stubbed products response resolves.
    const card = page.getByTestId("card-product-sale-bouquet");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // The "Sale" badge is conditionally rendered inside the card image area.
    const saleBadge = card.getByText(/sale/i);
    await expect(saleBadge).toBeVisible();
  });

  test("product card shows the discounted price and the strikethrough regular price", async ({
    page,
  }) => {
    const card = page.getByTestId("card-product-sale-bouquet");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // The card must show both the sale price and the regular price.
    // We don't assert the exact formatted value (FX conversion may round
    // differently), but both the sale amount (≈40) and regular amount (≈65)
    // must be present somewhere inside the card.
    const cardText = await card.textContent();
    expect(cardText).toBeTruthy();

    // Both price values must appear in the card text.
    expect(cardText).toMatch(/40/);
    expect(cardText).toMatch(/65/);
  });

  test("the regular price inside the card has a strikethrough class", async ({ page }) => {
    const card = page.getByTestId("card-product-sale-bouquet");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // The line-through element is the regular (non-discounted) price.
    const strikethrough = card.locator(".line-through");
    await expect(strikethrough).toBeVisible();

    // It must contain the regular price (65), not the discounted price (40).
    const strikethroughText = await strikethrough.textContent();
    expect(strikethroughText).toMatch(/65/);
    expect(strikethroughText).not.toMatch(/^40$/);
  });

  test("switching currency still shows both sale price and strikethrough regular price", async ({
    page,
  }) => {
    // Confirm the sale card is rendered at the default currency (USD).
    const card = page.getByTestId("card-product-sale-bouquet");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Open the currency switcher (in the footer) and switch to EUR.
    const trigger = page.getByTestId("currency-switcher");
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await trigger.click();
    const eurButton = page.getByTestId("button-currency-eur");
    await expect(eurButton).toBeVisible({ timeout: 5_000 });
    await eurButton.click();

    // After the currency switch the switcher label must update.
    await expect(trigger).toContainText("EUR");

    // The product card must still have a Sale badge.
    const saleBadge = card.getByText(/sale/i);
    await expect(saleBadge).toBeVisible();

    // The strikethrough regular price must still be visible.
    const strikethrough = card.locator(".line-through");
    await expect(strikethrough).toBeVisible();

    // Both prices (discount and regular) must still appear in some form.
    // After EUR conversion (rate 0.92): 40×0.92≈37, 65×0.92≈60.
    // We only assert that numeric content is present inside the card.
    const cardText = await card.textContent();
    expect(cardText).toMatch(/\d+/);
  });

  test("after a page reload the sale price is still displayed correctly", async ({ page }) => {
    const card = page.getByTestId("card-product-sale-bouquet");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Record the initial card text so we can compare after reload.
    const textBefore = await card.textContent();
    expect(textBefore).toMatch(/40/);

    // Reload the page — stubs registered with page.route() survive a reload.
    await page.reload();

    // The card must still render with the same sale layout.
    const cardAfterReload = page.getByTestId("card-product-sale-bouquet");
    await expect(cardAfterReload).toBeVisible({ timeout: 15_000 });

    const textAfter = await cardAfterReload.textContent();
    expect(textAfter).toMatch(/40/);
    expect(textAfter).toMatch(/65/);
    expect(cardAfterReload.locator(".line-through")).toBeVisible();
  });
});
