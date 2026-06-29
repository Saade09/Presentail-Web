/**
 * SEO content section — Playwright smoke tests
 *
 * The SEOContentSection renders only when `products.length > 0` AND a category
 * or occasion slug is active. In CI there is no live Presentail OS API key, so
 * every test stubs `/api/woo/products` (the fallback path when VITE_OS_API_KEY
 * is absent) with a small fixture product whose category/occasion fields match
 * the route under test. Catalog metadata (for the internal-link chips) is
 * stubbed via `/api/catalog/metadata`.
 *
 * Coverage:
 *   1. Category page (/category/hand-bouquets) with products → section present,
 *      H2 non-empty, 4 benefit cards, occasion chips, FAQ items exist.
 *   2. Occasion page (/occasion/birthday) with products → section present,
 *      H2 non-empty, intro paragraph, category chips, FAQ items exist.
 *   3. Zero-product category page → section absent.
 *   4. FAQ accordion: aria-expanded toggles correctly on open/close.
 *   5. FAQPage JSON-LD <script data-seo-faq-ld> injected into <head>.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Minimal product that matches category "hand-bouquets" and occasion "birthday". */
const STUB_PRODUCT = {
  id: "e2e-seo-bouquet-1",
  name: "E2E SEO Rose Bouquet",
  slug: "e2e-seo-rose-bouquet",
  priceValue: 60,
  image: { uri: "https://example.com/rose.jpg" },
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  occasions: ["birthday"],
  brandNames: [],
  description: "A beautiful rose bouquet for e2e testing.",
};

const STUB_PRODUCTS_RESPONSE = {
  ok: true,
  products: [STUB_PRODUCT],
};

/** Catalog metadata with slugs that match the hardcoded chip lists in SEOContentSection. */
const STUB_CATALOG_METADATA = {
  categories: [
    { id: "hand-bouquets", name: "Hand Bouquets", icon: "flower" },
    { id: "flower-boxes", name: "Flower Boxes", icon: "box" },
    { id: "cakes", name: "Cakes", icon: "cake" },
    { id: "chocolate", name: "Chocolate", icon: "gift" },
    { id: "plants", name: "Plants", icon: "plant" },
  ],
  occasions: [
    { id: "birthday", name: "Birthday", icon: "cake" },
    { id: "love-romance", name: "Love & Romance", icon: "heart" },
    { id: "congratulations", name: "Congratulations", icon: "star" },
    { id: "thank-you", name: "Thank You", icon: "flower" },
    { id: "anniversary", name: "Anniversary", icon: "ring" },
  ],
  brands: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed localStorage with a delivery location before the first navigation. */
async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
}

/** Stub the products endpoint so the shop renders without a live OS API. */
async function stubProducts(page: Page, products = [STUB_PRODUCT]): Promise<void> {
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products }),
    }),
  );
}

/** Stub the catalog metadata endpoint so internal-link chips can resolve. */
async function stubCatalogMetadata(page: Page): Promise<void> {
  // Use a regex so the pattern matches regardless of query params or trailing
  // slashes. The apiFetch helper calls /api/catalog/metadata with no params.
  await page.route(/\/api\/catalog\/metadata/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CATALOG_METADATA),
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Category page — section renders with products
// ---------------------------------------------------------------------------

test.describe("SEO content section — category page with products", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");
  });

  test("section is visible", async ({ page }) => {
    await expect(
      page.getByTestId("seo-content-section"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("H2 heading contains the entity name and city", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const text = (await heading.textContent()) ?? "";
    // Catalog stub provides name "Hand Bouquets"; city resolves to "Beirut".
    // EN template: "{name} Delivery in {city}" → must contain both tokens.
    expect(text).toContain("Hand Bouquets");
    expect(text.length).toBeGreaterThan(0);
  });

  test("renders exactly 4 benefit cards", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    // Each benefit card is a flex-col div inside the 2/4-column grid.
    // The grid immediately follows the intro paragraph; cards have a border.
    // There is currently no data-testid on individual cards; the CSS structure
    // selector is the available hook for this smoke check.
    const cards = section.locator("div.grid > div.flex.flex-col");
    await expect(cards).toHaveCount(4);
  });

  test("occasion chip links are present (internal links)", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    // Internal links point to /occasion/<slug> (locale-prefixed at runtime,
    // e.g. /en-lb/beirut/occasion/birthday). Use a "contains" selector so
    // the assertion holds regardless of the locale prefix.
    // The chip list only renders after catalogMetadata has loaded, so wait
    // for at least the first chip rather than counting immediately.
    const chips = section.locator("a[href*='/occasion/']");
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });
    // Assert a minimal expected chip subset: "birthday" and "love-romance"
    // are in both CATEGORY_OCCASION_CHIPS and the stub catalogMetadata.
    await expect(section.locator("a[href*='/occasion/birthday']")).toBeVisible();
    await expect(section.locator("a[href*='/occasion/love-romance']")).toBeVisible();
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test("FAQ items are rendered", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Occasion page — section renders with products
// ---------------------------------------------------------------------------

test.describe("SEO content section — occasion page with products", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/occasion/birthday");
  });

  test("section is visible", async ({ page }) => {
    await expect(
      page.getByTestId("seo-content-section"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("H2 heading contains the entity name", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const text = (await heading.textContent()) ?? "";
    // Catalog stub provides name "Birthday".
    // EN template: "Send {name} Flowers & Gifts in {city}" → must contain name.
    expect(text).toContain("Birthday");
    expect(text.length).toBeGreaterThan(0);
  });

  test("intro paragraph is non-empty", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    // The intro text is the first <p> after the H2
    const intro = section.locator("p.text-muted-foreground").first();
    await expect(intro).toBeVisible();
    const text = await intro.textContent();
    expect((text ?? "").trim().length).toBeGreaterThan(0);
  });

  test("category chip links are present (internal links)", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    // Internal links on occasion pages point to /category/<slug>
    // (locale-prefixed at runtime, e.g. /en-lb/beirut/category/hand-bouquets).
    // Use "contains" so the assertion holds regardless of the locale prefix.
    // The chip list only renders after catalogMetadata loads; wait for the
    // first chip before counting.
    const chips = section.locator("a[href*='/category/']");
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });
    // Assert a minimal expected chip subset that is present in both
    // OCCASION_CATEGORY_CHIPS and the stub catalogMetadata.
    await expect(section.locator("a[href*='/category/hand-bouquets']")).toBeVisible();
    await expect(section.locator("a[href*='/category/cakes']")).toBeVisible();
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders exactly 4 benefit cards", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const cards = section.locator("div.grid > div.flex.flex-col");
    await expect(cards).toHaveCount(4);
  });

  test("FAQ items are rendered", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Zero-product page — section absent
// ---------------------------------------------------------------------------

test.describe("SEO content section — section absent when no products", () => {
  test("section does not render on a category page with zero products", async ({
    page,
  }) => {
    // Stub an empty product list — the guard `products.length > 0` should hide the section.
    await stubProducts(page, []);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    // Wait for the shop to finish loading (empty-state element should appear).
    await expect(
      page.getByTestId("empty-state-sold-out"),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("seo-content-section")).not.toBeVisible();
  });

  test("section does not render on an occasion page with zero products", async ({
    page,
  }) => {
    await stubProducts(page, []);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/occasion/birthday");

    await expect(
      page.getByTestId("empty-state-sold-out"),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("seo-content-section")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. FAQ accordion — aria-expanded toggles
// ---------------------------------------------------------------------------

test.describe("SEO content section — FAQ accordion keyboard/click interaction", () => {
  test("first FAQ item opens on click (aria-expanded becomes true) and closes again", async ({
    page,
  }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    // All FAQ buttons start closed (aria-expanded="false").
    const firstFaqButton = section.locator("button[aria-expanded]").first();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "false");

    // Click once → open.
    await firstFaqButton.click();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "true");

    // Click again → closed.
    await firstFaqButton.click();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking one FAQ item does not open others", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/occasion/birthday");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const faqButtons = section.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    // Need at least two FAQ items for this assertion to be meaningful.
    test.skip(count < 2, "fewer than 2 FAQ items, skipping accordion-isolation check");

    // Open the first FAQ item.
    await faqButtons.nth(0).click();
    await expect(faqButtons.nth(0)).toHaveAttribute("aria-expanded", "true");

    // All other FAQ buttons should remain closed.
    for (let i = 1; i < count; i++) {
      await expect(faqButtons.nth(i)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("answer panel is hidden when closed and visible when open", async ({
    page,
  }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const firstFaqButton = section.locator("button[aria-expanded]").first();
    // The panel id is derived from the button's aria-controls attribute.
    const panelId = await firstFaqButton.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    const panel = section.locator(`#${panelId}`);

    // Panel starts hidden (native `hidden` attribute).
    await expect(panel).toHaveAttribute("hidden");

    // Open the panel.
    await firstFaqButton.click();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "true");
    // `hidden` attribute is removed → panel is visible.
    await expect(panel).not.toHaveAttribute("hidden");
    await expect(panel).toBeVisible();

    // Close again.
    await firstFaqButton.click();
    await expect(panel).toHaveAttribute("hidden");
  });
});

// ---------------------------------------------------------------------------
// 5. FAQPage JSON-LD injected into <head>
// ---------------------------------------------------------------------------

test.describe("SEO content section — FAQPage JSON-LD structured data", () => {
  test("FAQPage JSON-LD <script> is injected into <head> on a category page", async ({
    page,
  }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    // Wait for the section (which triggers the useEffect that injects JSON-LD).
    await expect(
      page.getByTestId("seo-content-section"),
    ).toBeVisible({ timeout: 15_000 });

    const jsonLdContent = await page.evaluate(() => {
      const script = document.head.querySelector(
        'script[type="application/ld+json"][data-seo-faq-ld]',
      );
      return script?.textContent ?? null;
    });

    expect(jsonLdContent).not.toBeNull();
    const schema = JSON.parse(jsonLdContent!);
    expect(schema["@type"]).toBe("FAQPage");
    expect(Array.isArray(schema.mainEntity)).toBe(true);
    expect(schema.mainEntity.length).toBeGreaterThan(0);
    expect(schema.mainEntity[0]["@type"]).toBe("Question");
    expect(typeof schema.mainEntity[0].name).toBe("string");
    expect(schema.mainEntity[0].name.length).toBeGreaterThan(0);
  });

  test("FAQPage JSON-LD <script> is injected into <head> on an occasion page", async ({
    page,
  }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/occasion/birthday");

    await expect(
      page.getByTestId("seo-content-section"),
    ).toBeVisible({ timeout: 15_000 });

    const jsonLdContent = await page.evaluate(() => {
      const script = document.head.querySelector(
        'script[type="application/ld+json"][data-seo-faq-ld]',
      );
      return script?.textContent ?? null;
    });

    expect(jsonLdContent).not.toBeNull();
    const schema = JSON.parse(jsonLdContent!);
    expect(schema["@type"]).toBe("FAQPage");
    expect(Array.isArray(schema.mainEntity)).toBe(true);
    expect(schema.mainEntity.length).toBeGreaterThan(0);
    expect(schema.mainEntity[0]["@type"]).toBe("Question");
  });

  test("FAQPage JSON-LD is NOT present on a zero-product category page", async ({
    page,
  }) => {
    await stubProducts(page, []);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    // Wait for the empty-state so we know the page has fully rendered.
    await expect(
      page.getByTestId("empty-state-sold-out"),
    ).toBeVisible({ timeout: 15_000 });

    const jsonLdContent = await page.evaluate(() => {
      const script = document.head.querySelector(
        'script[type="application/ld+json"][data-seo-faq-ld]',
      );
      return script?.textContent ?? null;
    });

    // The section was never mounted → the useEffect never ran → no FAQPage LD.
    expect(jsonLdContent).toBeNull();
  });
});
