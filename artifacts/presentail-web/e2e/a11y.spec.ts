/**
 * Accessibility regression scan — axe-core via @axe-core/playwright
 *
 * Scans the five most-trafficked pages (landing, shop, product detail, cart,
 * checkout) for WCAG violations at "critical" and "serious" impact levels.
 * Any new violation blocks the CI run with a clear error message.
 *
 * API calls are stubbed so the suite runs in CI without a live backend.
 */

import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import type { Result, NodeResult } from "axe-core";

// ---------------------------------------------------------------------------
// API stubs (same shape as currency-persistence.spec.ts stubs)
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
  rates: { USD: 1, AED: 3.67, EUR: 0.92 },
};

const STUB_PRODUCT = {
  id: "rose-bouquet",
  name: "Rose Bouquet",
  slug: "rose-bouquet",
  priceValue: 65,
  image: { uri: "https://example.com/rose.jpg" },
  category: "flowers",
  description: "A beautiful bouquet of fresh roses.",
};

const STUB_PRODUCTS = { ok: true, products: [STUB_PRODUCT] };

const STUB_BRANDS = { ok: true, brands: [] };

const STUB_CATEGORIES = { ok: true, categories: [] };

const STUB_OCCASIONS = { ok: true, occasions: [] };

const STUB_BANNERS = { ok: true, banners: [] };

const STUB_GEO = { countryCode: "LB", source: "ip" };

const CART_ITEM = {
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

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Install route stubs that cover the full API surface the web app needs. */
async function installStubs(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
  );
  await page.route("**/api/geo**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_GEO) }),
  );
  await page.route("**/api/woo/products**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_PRODUCTS) }),
  );
  await page.route("**/api/brands**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_BRANDS) }),
  );
  await page.route("**/api/categories**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CATEGORIES) }),
  );
  await page.route("**/api/occasions**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_OCCASIONS) }),
  );
  await page.route("**/api/banners**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_BANNERS) }),
  );
  // Absorb any remaining /api/* calls so they don't cause network errors.
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
}

/**
 * Run axe on the current page and assert zero critical/serious violations.
 *
 * Only "critical" and "serious" impact violations are checked — this avoids
 * flaky failures from "moderate" colour-contrast rules that depend on exact
 * rendering conditions that differ across environments.
 */
async function assertNoA11yViolations(
  page: import("@playwright/test").Page,
  pageName: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v: Result) => v.impact === "critical" || v.impact === "serious",
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map((v: Result) => {
        const nodes = v.nodes
          .slice(0, 3)
          .map((n: NodeResult) => `    • ${n.target.join(", ")}: ${n.failureSummary?.split("\n")[0] ?? ""}`)
          .join("\n");
        return `[${v.impact?.toUpperCase()}] ${v.id} — ${v.description}\n${nodes}`;
      })
      .join("\n\n");

    throw new Error(
      `Accessibility violations on "${pageName}" (${blocking.length} critical/serious):\n\n${summary}`,
    );
  }

  // Non-blocking: log minor/moderate violations so developers can see them.
  const minor = results.violations.filter(
    (v: Result) => v.impact !== "critical" && v.impact !== "serious",
  );
  if (minor.length > 0) {
    console.warn(
      `[a11y] ${minor.length} minor/moderate violation(s) on "${pageName}" (non-blocking):`,
      minor.map((v: Result) => `${v.id} (${v.impact})`).join(", "),
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Accessibility — no critical/serious WCAG violations", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);

    // Pre-seed cart and delivery location so cart/checkout pages render.
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: DELIVERY_LOCATION },
    );
  });

  test("Landing / Home page", async ({ page }) => {
    await page.goto("/");
    // Wait for the main content area to mount before running axe.
    await page.waitForSelector("main, #root > *", { timeout: 15_000 });
    await assertNoA11yViolations(page, "Landing / Home");
  });

  test("Partner application page", async ({ page }) => {
    // Registered after the broad fallback so this route wins for this scan.
    await page.route("**/api/currencies**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_CURRENCIES),
      }),
    );
    await page.route("**/api/catalog/metadata**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ categories: [], occasions: [], brands: [] }),
      }),
    );
    await page.goto("/partner");
    await page.waitForSelector("[data-testid='partner-page']", { timeout: 15_000 });

    const categories = page.getByRole("group", {
      name: /Category.*This field is required/i,
    });
    await expect(categories).toBeVisible();
    await expect(categories).toHaveAttribute("aria-describedby", "partner-categories-hint");
    expect(await categories.getAttribute("aria-required")).toBeNull();

    const ariaResults = await new AxeBuilder({ page })
      .withRules(["aria-allowed-attr"])
      .analyze();
    expect(ariaResults.violations).toEqual([]);
  });

  test("Shop page", async ({ page }) => {
    await page.goto("/shop");
    await page.waitForSelector("main, #root > *", { timeout: 15_000 });
    await assertNoA11yViolations(page, "Shop");
  });

  test("Product detail page", async ({ page }) => {
    await page.goto("/product/rose-bouquet");
    await page.waitForSelector("main, #root > *", { timeout: 15_000 });
    await assertNoA11yViolations(page, "Product Detail");
  });

  test("Cart page", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForSelector("main, #root > *", { timeout: 15_000 });
    await assertNoA11yViolations(page, "Cart");
  });

  test("Checkout page", async ({ page }) => {
    // Pass ?guest=1 so the checkout page sets guestAcked=true immediately from
    // the URL param — the login gate never appears, regardless of how long the
    // auth check takes to resolve (avoids flaky guest-dialog timing).
    await page.goto("/checkout?guest=1");
    await page.waitForSelector("main, #root > *", { timeout: 15_000 });
    await assertNoA11yViolations(page, "Checkout");
  });
});
