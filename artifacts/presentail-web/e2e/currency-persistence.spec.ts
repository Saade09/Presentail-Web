import { test, expect, type Page } from "@playwright/test";

const PERSISTENT_KEY = "presentail_display_currency_manual_persistent_v1";
const SESSION_KEY = "presentail_display_currency_manual_v1";

async function openCurrencySwitcher(page: Page) {
  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
}

async function pickCurrency(page: Page, code: string) {
  const item = page.getByTestId(`button-currency-${code.toLowerCase()}`);
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
}

async function enableRemember(page: Page) {
  const toggle = page.locator("#currency-remember");
  const checked = await toggle.isChecked();
  if (!checked) {
    await toggle.click();
  }
}

async function disableRemember(page: Page) {
  const toggle = page.locator("#currency-remember");
  const checked = await toggle.isChecked();
  if (checked) {
    await toggle.click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Clear any leftover currency overrides before each test.
  await page.evaluate((keys) => {
    for (const k of keys) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  }, [PERSISTENT_KEY, SESSION_KEY]);
});

test("currency persists across page reload when 'Remember my choice' is on", async ({
  page,
}) => {
  // Open the switcher, pick AED with "Remember my choice" toggled on.
  await openCurrencySwitcher(page);
  await enableRemember(page);
  await pickCurrency(page, "AED");

  // Confirm the trigger now shows AED.
  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toContainText("AED");

  // Verify the choice was written to localStorage.
  const persisted = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persisted).toBe("AED");

  // Reload the page (simulates a new visit / tab).
  await page.reload();

  // The currency switcher should still display AED after reload.
  const triggerAfterReload = page.getByTestId("currency-switcher");
  await expect(triggerAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(triggerAfterReload).toContainText("AED");
});

test("currency does NOT persist across reload when 'Remember my choice' is off", async ({
  page,
}) => {
  // Pick AED with persistence disabled.
  await openCurrencySwitcher(page);
  await disableRemember(page);
  await pickCurrency(page, "AED");

  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toContainText("AED");

  // Should be in sessionStorage only, not localStorage.
  const persisted = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persisted).toBeNull();

  const sessionVal = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_KEY,
  );
  expect(sessionVal).toBe("AED");
});

test("toggling 'Remember my choice' off removes the value from localStorage", async ({
  page,
}) => {
  // Start with a persistent choice.
  await openCurrencySwitcher(page);
  await enableRemember(page);
  await pickCurrency(page, "GBP");

  const persistedBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persistedBefore).toBe("GBP");

  // Re-open the switcher and toggle remember off.
  await openCurrencySwitcher(page);
  await disableRemember(page);

  // localStorage should be cleared; sessionStorage should now hold the value.
  const persistedAfter = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persistedAfter).toBeNull();

  const sessionVal = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_KEY,
  );
  expect(sessionVal).toBe("GBP");
});

// ---------------------------------------------------------------------------
// Web checkout flow — currency propagation
//
// These tests verify that a currency chosen by the visitor is reflected
// in the price displayed on the product detail page and in the checkout
// order summary.
//
// To exercise real currency-formatting logic without a live API server,
// each test in this describe block:
//   1. Installs Playwright route handlers that stub the three key API
//      endpoints (/api/currencies, /api/fx/rates, /api/woo/products)
//      BEFORE the first page.goto() call.  This ensures React Query's
//      fresh in-memory cache picks up the EUR config on first load.
//   2. Seeds the cart and delivery location via addInitScript so that
//      the checkout page has items to render without hitting the API.
//   3. Asserts on the rendered price text (symbol "€", absence of "$")
//      rather than just on storage keys.
// ---------------------------------------------------------------------------

// Minimal currency snapshot that includes EUR so the switcher can offer it
// and formatPriceInCurrency can emit the "€" symbol.
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
      code: "EUR",
      name: "Euro",
      symbol: "€",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
    {
      code: "GBP",
      name: "British Pound",
      symbol: "£",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
  fallbackCode: "USD",
  // LB maps to USD so the seeded delivery-country doesn't force-override the
  // manual EUR choice (manual override wins per resolveDisplayCurrency).
  countryToCurrency: { AE: "AED", LB: "USD", CY: "EUR" },
};

// EUR rate: 1 USD = 0.92 EUR.
// priceValue 65 USD × 0.92 → 59.80 EUR → formatted as "€59.80".
const STUB_FX_RATES = {
  ok: true,
  base: "USD",
  rates: { USD: 1, EUR: 0.92, GBP: 0.79 },
};

// Fake product matching the slug used in the PDP navigation below.
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

// Cart item that matches the stub product so checkout totals are consistent.
const CHECKOUT_CART_ITEM = {
  product: {
    id: "rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const CHECKOUT_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

// Regex that matches any EUR-formatted price (e.g. "€59.80", "€65").
// We don't assert the exact converted amount to avoid brittleness from
// rounding, but we require the EUR symbol and at least one digit.
const EUR_PRICE_RE = /€\d/;

async function installApiStubs(page: Page): Promise<void> {
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
  // Intercept all product-list requests regardless of query-string params.
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_PRODUCTS),
    }),
  );
}

test.describe("Currency propagates through the product and checkout flow", () => {
  test.beforeEach(async ({ page }) => {
    // Route stubs MUST be installed before the first page.goto() so that
    // React Query's fresh (empty) cache is populated with the EUR snapshot
    // rather than the USD-only fallback.  Routes registered here persist
    // for all subsequent page.goto() calls within the test.
    await installApiStubs(page);

    // Seed the cart and delivery location before every navigation so the
    // product and checkout pages have deterministic data to render.
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem(
          "presentail_cart_v1",
          JSON.stringify(cart),
        );
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CHECKOUT_CART_ITEM], location: CHECKOUT_LOCATION },
    );

    // Navigate so the init script seeds localStorage and the stubbed currency
    // endpoints fire.  This page load happens after the outer beforeEach has
    // already cleared any leftover currency overrides.
    await page.goto("/");
  });

  test("currency selected on the homepage is shown in EUR on the product detail page", async ({
    page,
  }) => {
    // Pick EUR from the currency switcher on the homepage.  EUR is now an
    // option because the stubbed /api/currencies response includes it.
    await openCurrencySwitcher(page);
    await pickCurrency(page, "EUR");

    const homeTrigger = page.getByTestId("currency-switcher");
    await expect(homeTrigger).toContainText("EUR");

    // Navigate to the product detail page.  The stub product "rose-bouquet"
    // (priceValue: 65 USD) is served from the mocked /api/woo/products
    // endpoint, and the EUR rate (0.92) is served from /api/fx/rates.
    await page.goto("/en-lb/beirut/product/rose-bouquet");

    // The navbar currency switcher must still display EUR after navigation.
    const pdpTrigger = page.getByTestId("currency-switcher");
    await expect(pdpTrigger).toBeVisible({ timeout: 10_000 });
    await expect(pdpTrigger).toContainText("EUR");

    // The product price element must exist and show a EUR-formatted amount.
    // 65 USD × 0.92 = 59.80 EUR → "€59.80".
    const priceEl = page.getByTestId("product-price");
    await expect(priceEl).toBeVisible({ timeout: 10_000 });
    const priceText = await priceEl.textContent();
    expect(priceText).toMatch(EUR_PRICE_RE);
    // Must NOT fall back to the USD dollar sign.
    expect(priceText).not.toMatch(/\$/);
  });

  test("currency selected on the homepage is reflected in EUR in the checkout order summary", async ({
    page,
  }) => {
    // Pick EUR on the homepage.
    await openCurrencySwitcher(page);
    await pickCurrency(page, "EUR");

    const homeTrigger = page.getByTestId("currency-switcher");
    await expect(homeTrigger).toContainText("EUR");

    // Navigate directly to checkout; the cart is already seeded in localStorage
    // by addInitScript so the summary renders without an API round-trip.
    await page.goto("/checkout");

    // Dismiss the guest-checkout login prompt if it appears.
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // The navbar currency switcher must show EUR throughout the checkout.
    const checkoutTrigger = page.getByTestId("currency-switcher");
    await expect(checkoutTrigger).toBeVisible({ timeout: 10_000 });
    await expect(checkoutTrigger).toContainText("EUR");

    // Both the subtotal and grand total in the order summary sidebar must
    // be rendered in EUR (symbol "€", no USD "$" sign).
    // subtotal: 65 USD × 0.92 = 59.80 EUR → "€59.80"
    // total:    subtotal + any delivery fee, also EUR-formatted.
    const subtotalEl = page.getByTestId("text-subtotal");
    const totalEl = page.getByTestId("text-total");
    await expect(subtotalEl).toBeVisible({ timeout: 10_000 });
    await expect(totalEl).toBeVisible({ timeout: 10_000 });

    const subtotalText = await subtotalEl.textContent();
    const totalText = await totalEl.textContent();

    expect(subtotalText).toMatch(EUR_PRICE_RE);
    expect(subtotalText).not.toMatch(/\$/);

    expect(totalText).toMatch(EUR_PRICE_RE);
    expect(totalText).not.toMatch(/\$/);
  });

  test("currency pre-seeded as persistent choice renders EUR prices on first paint", async ({
    page,
  }) => {
    // Write the EUR override into localStorage before the page loads so the
    // currency is active from the very first render — no switcher interaction.
    await page.addInitScript(
      ({ persistKey, code }) => {
        window.localStorage.setItem(persistKey, code);
      },
      { persistKey: PERSISTENT_KEY, code: "EUR" },
    );

    // Navigate directly to the product detail page.
    await page.goto("/en-lb/beirut/product/rose-bouquet");

    // Switcher must reflect the pre-seeded EUR choice.
    const trigger = page.getByTestId("currency-switcher");
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await expect(trigger).toContainText("EUR");

    // Product price must appear in EUR, not USD.
    const priceEl = page.getByTestId("product-price");
    await expect(priceEl).toBeVisible({ timeout: 10_000 });
    const priceText = await priceEl.textContent();
    expect(priceText).toMatch(EUR_PRICE_RE);
    expect(priceText).not.toMatch(/\$/);
  });
});
