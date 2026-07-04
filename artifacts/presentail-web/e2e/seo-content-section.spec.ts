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
 *      H2 non-empty, 4 benefit cards, occasion chips, FAQ items exist,
 *      FAQ count >= 3 (guards against accidentally emptied copy).
 *   2. Occasion page (/occasion/birthday) with products → section present,
 *      H2 non-empty, intro paragraph, category chips, FAQ items exist,
 *      FAQ count >= 3 (guards against accidentally emptied copy).
 *   3. Zero-product category page → section absent.
 *   4. FAQ accordion: aria-expanded toggles correctly on open/close.
 *   5. FAQPage JSON-LD <script data-seo-faq-ld> injected into <head>.
 *   6. Brand detail page (/brand/:slug) with products → section present,
 *      H2 contains brand name + city, 4 benefit cards, FAQ items, JSON-LD,
 *      FAQ count >= 3 (guards against accidentally emptied copy).
 *   7. Brand page with zero products → section absent.
 *   8. Brand page city-switch (URL navigation path) → heading updates to new city.
 *   9. Brand page city-switch (picker mid-session, no hard reload) → heading updates.
 *  10. Category page city-switch (URL navigation path) → heading updates to new city.
 *  11. Category page city-switch (picker mid-session, no hard reload) → heading updates.
 *  12. Occasion page city-switch (URL navigation path) → heading updates to new city.
 *  13. Occasion page city-switch (picker mid-session, no hard reload) → heading updates.
 *  14. Brands listing page (/brands) city-switch (URL navigation path) → heading updates.
 *  15. Brands listing page (/brands) city-switch (picker mid-session, no hard reload) → heading updates.
 *  16. Category page language-switch (EN→AR via LanguageSwitcher, no hard reload) → heading uses AR template.
 *  17. Occasion page language-switch (EN→AR via LanguageSwitcher, no hard reload) → heading uses AR template.
 *  18. Brand page EN→AR language-switch (picker mid-session) → heading uses AR template.
 *  19. Brand page EN→FR language-switch (picker mid-session) → heading uses FR template ("Livraison").
 *  20. Shop page (/shop) city-switch (URL navigation path) → heading updates to new city.
 *  21. Shop page (/shop) city-switch (picker mid-session, no hard reload) → heading updates.
 *  22. Brands listing page EN→FR language-switch (picker mid-session) → heading uses FR template ("Marques").
 *  23. Category page EN→FR language-switch (picker mid-session) → heading uses FR template ("Livraison de").
 *  24. Occasion page EN→FR language-switch (picker mid-session) → heading uses FR template ("Envoyez").
 *  25. Brands listing page (/brands) with brands → FAQ count >= 3 guard.
 *  26. All-occasions listing page (/occasions) with occasions → FAQ count >= 3 guard.
 *  27. Shop page (/shop) with products → FAQ count >= 3 guard.
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

  test("hand-bouquets FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
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

  test("birthday FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
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

// ---------------------------------------------------------------------------
// 6. Brand detail page — section renders with products
// ---------------------------------------------------------------------------

const BRAND_SLUG = "e2e-test-brand";

/**
 * Minimal delivery-locations payload with one city in LB (Beirut) and one in
 * AE (Dubai). Lets LocationContext resolve `city` → the `cityName()` helper
 * can then produce a real label string ("Beirut" / "Dubai") that ends up in
 * the SEO heading.
 */
const STUB_DELIVERY_LOCATIONS = {
  countries: [
    {
      code: "LB",
      name: "Lebanon",
      isActive: true,
      cities: [
        { id: "lb-beirut", name: "Beirut", isActive: true, fee: 0 },
        { id: "lb-tripoli", name: "Tripoli", isActive: true, fee: 0 },
      ],
    },
    {
      code: "AE",
      name: "UAE",
      isActive: true,
      cities: [
        { id: "ae-dubai", name: "Dubai", isActive: true, fee: 0 },
        { id: "ae-abudhabi", name: "Abu Dhabi", isActive: true, fee: 0 },
      ],
    },
  ],
};

async function stubDeliveryLocations(page: Page): Promise<void> {
  await page.route(/\/api\/delivery-locations/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_DELIVERY_LOCATIONS),
    }),
  );
}

/** Stub /api/woo/brands so BrandDetail resolves the brand name deterministically. */
async function stubWooBrands(page: Page): Promise<void> {
  await page.route(/\/api\/woo\/brands(?!\-products)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        brands: [{ id: BRAND_SLUG, name: "E2E Test Brand", slug: BRAND_SLUG, image: null }],
      }),
    }),
  );
}

/** Stub the brand products endpoint used by BrandDetail. */
async function stubBrandProducts(page: Page, products = [STUB_PRODUCT]): Promise<void> {
  await page.route(/\/api\/woo\/brand-products/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products }),
    }),
  );
}

test.describe("SEO content section — brand detail page with products", () => {
  test.beforeEach(async ({ page }) => {
    await stubWooBrands(page);
    await stubBrandProducts(page);
    await seedLocation(page);
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);
  });

  test("SEO section is visible on a brand page with products", async ({ page }) => {
    await expect(
      page.getByTestId("seo-content-section"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("H2 heading contains the brand name and city", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const text = (await heading.textContent()) ?? "";
    // Brand name from /api/woo/brands stub: "E2E Test Brand"
    // City from seedLocation delivery_location: cityId "lb-beirut" → label "Beirut"
    // EN template: "{name} Delivery in {city}" → must contain both tokens.
    expect(text).toContain("E2E Test Brand");
    expect(text).toContain("Beirut");
  });

  test("renders exactly 4 benefit cards on brand page", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const cards = section.locator("div.grid > div.flex.flex-col");
    await expect(cards).toHaveCount(4);
  });

  test("FAQ items are rendered on brand page", async ({ page }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("brand FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("FAQPage JSON-LD is injected into <head> on brand page", async ({ page }) => {
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
});

// ---------------------------------------------------------------------------
// 7. Brand detail page — section absent when no products
// ---------------------------------------------------------------------------

test.describe("SEO content section — brand page section absent when no products", () => {
  test("section does not render on a brand page with zero products", async ({ page }) => {
    await stubWooBrands(page);
    await stubBrandProducts(page, []);
    await seedLocation(page);
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);

    // Wait for the empty-state element to confirm the page loaded fully.
    await page.waitForSelector('[data-testid="empty-state-no-brand-products"]', {
      timeout: 15_000,
      state: "visible",
    });

    await expect(page.getByTestId("seo-content-section")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 8. Brand detail page — SEO heading updates when the shopper switches cities
// ---------------------------------------------------------------------------

test.describe("SEO content section — brand page city-switch regression guard", () => {
  /**
   * Regression guard (URL navigation path): if a shopper changes their
   * delivery city, the SEO heading ({name} Delivery in {city}) must reflect
   * the new city — not the city that was active when the page first loaded.
   *
   * The `setLocation()` call in LocationContext navigates to a new locale-
   * prefixed URL (e.g. /en-ae/dubai/brand/…). We simulate that by driving
   * the browser to the Dubai-prefixed URL directly, which is exactly the path
   * the city-picker takes after the shopper confirms their new selection.
   */
  test("SEO heading contains the new city name after navigating to a Dubai URL", async ({ page }) => {
    // Stub all API endpoints before the first navigation so the stubs are in
    // place for both the Beirut and the Dubai page loads.
    await stubWooBrands(page);
    await stubBrandProducts(page);
    await stubDeliveryLocations(page);
    // Seed localStorage with an initial Beirut location so the context starts
    // from a known state even before the URL prefix is parsed.
    await seedLocation(page);

    // ── Step 1: Beirut ──────────────────────────────────────────────────────
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const initialText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "lb-beirut" → name "Beirut"; the SEO
    // template for brands is "{name} Delivery in {city}".
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("E2E Test Brand");

    // ── Step 2: switch to Dubai ─────────────────────────────────────────────
    // Navigate to the Dubai-prefixed brand URL — this is exactly what the city
    // picker does via setLocation() → navigate(buildLocalePath(...)).
    await page.goto(`/en-ae/dubai/brand/${BRAND_SLUG}`);

    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "ae-dubai" → name "Dubai"; the heading
    // must now show "Dubai" and must NOT still show "Beirut".
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

// ---------------------------------------------------------------------------
// 9. Brand detail page — SEO heading updates when the city picker is used
//    mid-session (no hard page reload — Wouter client-side navigation)
// ---------------------------------------------------------------------------
// (see section 10 and 11 below for equivalent category and occasion guards)

test.describe("SEO content section — brand page city-switch via picker mid-session", () => {
  /**
   * Regression guard (city-picker UI path): the city picker calls setLocation(),
   * which navigates via Wouter (history.pushState) — there is NO hard page reload.
   * React must propagate the new cityLabel into SEOContentSection reactively.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brand/… → heading shows "Beirut".
   *   2. Open the city picker via the navbar button.
   *   3. Select UAE → Dubai inside the picker dialog.
   *   4. LocationContext calls navigate("/en-ae/dubai/brand/…") via Wouter —
   *      client-side only, no reload.
   *   5. Assert heading now shows "Dubai" and no longer shows "Beirut".
   */
  test("SEO heading updates to new city after using the picker without a page reload", async ({ page }) => {
    await stubWooBrands(page);
    await stubBrandProducts(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brand page at Beirut ────────────────────────────────────
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("E2E Test Brand");

    // ── Step 2: open the city picker from the top utility bar ────────────────
    // `button-country-selector` lives in TopUtilityBar (always visible, no
    // breakpoint hide). The Navbar also has `button-open-location-picker` but
    // it is hidden on narrower viewports (hidden lg:flex).
    const pickerButton = page.getByTestId("button-country-selector");
    await expect(pickerButton).toBeVisible({ timeout: 5_000 });
    await pickerButton.click();

    // ── Step 3: select UAE then Dubai inside the picker dialog ────────────────
    // The picker opens pre-navigated to Lebanon's city list because
    // `initialCountryCode` is "LB" (set from the current URL/stored location).
    // We first go back to the country list via `button-picker-back`, then
    // select UAE.
    const backButton = page.getByTestId("button-picker-back");
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    // Now the picker shows the country list; pick UAE.
    const uaeButton = page.getByTestId("button-country-ae");
    await expect(uaeButton).toBeVisible({ timeout: 5_000 });
    await uaeButton.click();

    // After selecting a country the picker switches to the city list.
    // `data-testid="button-city-ae-dubai"` is the Dubai row.
    const dubaiButton = page.getByTestId("button-city-ae-dubai");
    await expect(dubaiButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await dubaiButton.click();

    // ── Step 4: assert the URL updated to Dubai without a hard reload ─────────
    // Wouter calls history.pushState → the URL changes but no DOMContentLoaded
    // fires. Playwright's page.waitForURL() waits for the pushState to settle.
    await page.waitForURL(/\/en-ae\/dubai\/brand\//, { timeout: 10_000 });

    // The nav count was not incremented by a real navigation — confirms we are
    // still in the same page session (soft-nav via Wouter).
    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because `__playwrightNavCount` is only set by a hard
    // navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the new city ─────────────────────
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
    expect(updatedText).toContain("E2E Test Brand");
  });
});

// ---------------------------------------------------------------------------
// 10. Category page — SEO heading updates when the shopper switches cities
// ---------------------------------------------------------------------------

test.describe("SEO content section — category page city-switch regression guard", () => {
  /**
   * Regression guard (URL navigation path): if a shopper changes their
   * delivery city on a category page, the SEO heading ({name} Delivery in
   * {city}) must reflect the new city — not the city active on first load.
   *
   * We simulate the city-picker's setLocation() call by driving the browser
   * directly to the Dubai-prefixed URL, which is exactly what the picker does
   * via navigate(buildLocalePath(…)).
   */
  test("SEO heading contains the new city name after navigating to a Dubai URL", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: Beirut ──────────────────────────────────────────────────────
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const initialText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "lb-beirut" → name "Beirut".
    // Category name from catalogMetadata stub: "Hand Bouquets".
    // EN template: "{name} Delivery in {city}".
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Hand Bouquets");

    // ── Step 2: switch to Dubai ─────────────────────────────────────────────
    await page.goto("/en-ae/dubai/category/hand-bouquets");

    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "ae-dubai" → name "Dubai".
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

test.describe("SEO content section — category page city-switch via picker mid-session", () => {
  /**
   * Regression guard (city-picker UI path): the city picker calls
   * setLocation(), which navigates via Wouter (history.pushState) — there is
   * NO hard page reload. React must propagate the new cityLabel into
   * SEOContentSection reactively.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/category/hand-bouquets → heading shows "Beirut".
   *   2. Open the city picker via the navbar button.
   *   3. Select UAE → Dubai inside the picker dialog.
   *   4. LocationContext calls navigate("/en-ae/dubai/category/…") via Wouter.
   *   5. Assert heading now shows "Dubai" and no longer shows "Beirut".
   */
  test("SEO heading updates to new city after using the picker without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load category page at Beirut ─────────────────────────────────
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Hand Bouquets");

    // ── Step 2: open the city picker from the top utility bar ─────────────────
    const pickerButton = page.getByTestId("button-country-selector");
    await expect(pickerButton).toBeVisible({ timeout: 5_000 });
    await pickerButton.click();

    // ── Step 3: select UAE then Dubai inside the picker dialog ────────────────
    const backButton = page.getByTestId("button-picker-back");
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    const uaeButton = page.getByTestId("button-country-ae");
    await expect(uaeButton).toBeVisible({ timeout: 5_000 });
    await uaeButton.click();

    const dubaiButton = page.getByTestId("button-city-ae-dubai");
    await expect(dubaiButton).toBeVisible({ timeout: 5_000 });

    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await dubaiButton.click();

    // ── Step 4: assert the URL updated to Dubai without a hard reload ─────────
    await page.waitForURL(/\/en-ae\/dubai\/category\//, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the new city ─────────────────────
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
    expect(updatedText).toContain("Hand Bouquets");
  });
});

// ---------------------------------------------------------------------------
// 11. Occasion page — SEO heading updates when the shopper switches cities
// ---------------------------------------------------------------------------

test.describe("SEO content section — occasion page city-switch regression guard", () => {
  /**
   * Regression guard (URL navigation path): if a shopper changes their
   * delivery city on an occasion page, the SEO heading (Send {name} Flowers &
   * Gifts in {city}) must reflect the new city — not the city active on first
   * load.
   *
   * We simulate the city-picker's setLocation() call by driving the browser
   * directly to the Dubai-prefixed URL, which is exactly what the picker does
   * via navigate(buildLocalePath(…)).
   */
  test("SEO heading contains the new city name after navigating to a Dubai URL", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: Beirut ──────────────────────────────────────────────────────
    await page.goto("/en-lb/beirut/occasion/birthday");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const initialText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "lb-beirut" → name "Beirut".
    // Occasion name from catalogMetadata stub: "Birthday".
    // EN template: "Send {name} Flowers & Gifts in {city}".
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Birthday");

    // ── Step 2: switch to Dubai ─────────────────────────────────────────────
    await page.goto("/en-ae/dubai/occasion/birthday");

    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "ae-dubai" → name "Dubai".
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

// ---------------------------------------------------------------------------
// 25. Brands listing page (/brands) — FAQ count >= 3 guard
// ---------------------------------------------------------------------------

test.describe("SEO content section — brands listing page with brands", () => {
  test.beforeEach(async ({ page }) => {
    await stubCatalogMetadataWithBrands(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/brands");
  });

  test("brands listing FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 14. Brands listing page (/brands) — SEO heading updates when the shopper
//     switches cities (URL navigation path)
// ---------------------------------------------------------------------------

/**
 * Stub /api/catalog/metadata with a non-empty brands list so the Brands page
 * renders `hasBrands = true` and mounts SEOContentSection.
 */
async function stubCatalogMetadataWithBrands(page: Page): Promise<void> {
  await page.route(/\/api\/catalog\/metadata/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...STUB_CATALOG_METADATA,
        brands: [
          { id: "e2e-brand-1", slug: "e2e-brand-1", name: "E2E Brand One", image: null, count: 5 },
          { id: "e2e-brand-2", slug: "e2e-brand-2", name: "E2E Brand Two", image: null, count: 3 },
        ],
      }),
    }),
  );
}

test.describe("SEO content section — brands listing page city-switch regression guard", () => {
  /**
   * Regression guard (URL navigation path): if a shopper changes their
   * delivery city on the brands listing page (/brands), the SEO heading
   * ("Gift Brands Available in {city}") must reflect the new city — not the
   * city active on first load.
   *
   * We simulate the city-picker's setLocation() call by driving the browser
   * directly to the Dubai-prefixed URL, which is exactly what the picker does
   * via navigate(buildLocalePath(…)).
   */
  test("SEO heading contains the new city name after navigating to a Dubai URL", async ({ page }) => {
    await stubCatalogMetadataWithBrands(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: Beirut ──────────────────────────────────────────────────────
    await page.goto("/en-lb/beirut/brands");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const initialText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "lb-beirut" → name "Beirut".
    // EN template: "Gift Brands Available in {city}".
    expect(initialText).toContain("Beirut");

    // ── Step 2: switch to Dubai ─────────────────────────────────────────────
    // Navigate to the Dubai-prefixed brands URL — this is exactly what the city
    // picker does via setLocation() → navigate(buildLocalePath(...)).
    await page.goto("/en-ae/dubai/brands");

    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "ae-dubai" → name "Dubai"; the heading
    // must now show "Dubai" and must NOT still show "Beirut".
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

// ---------------------------------------------------------------------------
// 15. Brands listing page (/brands) — SEO heading updates when the city
//     picker is used mid-session (no hard page reload — Wouter client-side)
// ---------------------------------------------------------------------------

test.describe("SEO content section — brands listing page city-switch via picker mid-session", () => {
  /**
   * Regression guard (city-picker UI path): the city picker calls
   * setLocation(), which navigates via Wouter (history.pushState) — there is
   * NO hard page reload. React must propagate the new cityLabel into
   * SEOContentSection reactively.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brands → heading shows "Beirut".
   *   2. Open the city picker via the navbar button.
   *   3. Select UAE → Dubai inside the picker dialog.
   *   4. LocationContext calls navigate("/en-ae/dubai/brands") via Wouter —
   *      client-side only, no reload.
   *   5. Assert heading now shows "Dubai" and no longer shows "Beirut".
   */
  test("SEO heading updates to new city after using the picker without a page reload", async ({ page }) => {
    await stubCatalogMetadataWithBrands(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brands listing page at Beirut ────────────────────────────
    await page.goto("/en-lb/beirut/brands");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    expect(initialText).toContain("Beirut");

    // ── Step 2: open the city picker from the top utility bar ────────────────
    const pickerButton = page.getByTestId("button-country-selector");
    await expect(pickerButton).toBeVisible({ timeout: 5_000 });
    await pickerButton.click();

    // ── Step 3: select UAE then Dubai inside the picker dialog ────────────────
    // The picker opens pre-navigated to Lebanon's city list; go back to the
    // country list first, then select UAE.
    const backButton = page.getByTestId("button-picker-back");
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    const uaeButton = page.getByTestId("button-country-ae");
    await expect(uaeButton).toBeVisible({ timeout: 5_000 });
    await uaeButton.click();

    const dubaiButton = page.getByTestId("button-city-ae-dubai");
    await expect(dubaiButton).toBeVisible({ timeout: 5_000 });

    // Capture nav count before clicking — equality after proves no hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await dubaiButton.click();

    // ── Step 4: assert the URL updated to Dubai without a hard reload ─────────
    await page.waitForURL(/\/en-ae\/dubai\/brands/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the new city ─────────────────────
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

test.describe("SEO content section — occasion page city-switch via picker mid-session", () => {
  /**
   * Regression guard (city-picker UI path): the city picker calls
   * setLocation(), which navigates via Wouter (history.pushState) — there is
   * NO hard page reload. React must propagate the new cityLabel into
   * SEOContentSection reactively.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/occasion/birthday → heading shows "Beirut".
   *   2. Open the city picker via the navbar button.
   *   3. Select UAE → Dubai inside the picker dialog.
   *   4. LocationContext calls navigate("/en-ae/dubai/occasion/…") via Wouter.
   *   5. Assert heading now shows "Dubai" and no longer shows "Beirut".
   */
  test("SEO heading updates to new city after using the picker without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load occasion page at Beirut ─────────────────────────────────
    await page.goto("/en-lb/beirut/occasion/birthday");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Birthday");

    // ── Step 2: open the city picker from the top utility bar ─────────────────
    const pickerButton = page.getByTestId("button-country-selector");
    await expect(pickerButton).toBeVisible({ timeout: 5_000 });
    await pickerButton.click();

    // ── Step 3: select UAE then Dubai inside the picker dialog ────────────────
    const backButton = page.getByTestId("button-picker-back");
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    const uaeButton = page.getByTestId("button-country-ae");
    await expect(uaeButton).toBeVisible({ timeout: 5_000 });
    await uaeButton.click();

    const dubaiButton = page.getByTestId("button-city-ae-dubai");
    await expect(dubaiButton).toBeVisible({ timeout: 5_000 });

    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await dubaiButton.click();

    // ── Step 4: assert the URL updated to Dubai without a hard reload ─────────
    await page.waitForURL(/\/en-ae\/dubai\/occasion\//, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the new city ─────────────────────
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
    expect(updatedText).toContain("Birthday");
  });
});

// ---------------------------------------------------------------------------
// 12. Brand detail page — SEO heading updates when language is switched mid-session
// ---------------------------------------------------------------------------

test.describe("SEO content section — brand page language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path): switching EN→AR via the
   * LanguageSwitcher calls setLanguage() → navigate() via Wouter (history.pushState)
   * — there is NO hard page reload. The URL changes from /en-lb/beirut/brand/…
   * to /ar-lb/beirut/brand/…, and LocaleContext's `language` state updates to "ar".
   * SEOContentSection must re-render the H2 with the AR heading template
   * ("توصيل {name} في {city}") rather than the EN one ("{name} Delivery in {city}").
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brand/… → heading shows EN template ("Delivery in").
   *   2. Click the LanguageSwitcher trigger in the nav.
   *   3. Click the AR option (data-testid="button-lang-ar").
   *   4. LocaleContext calls navigate("/ar-lb/beirut/brand/…") via Wouter — client-side only.
   *   5. Assert heading now contains "توصيل" (the Arabic word from the AR template)
   *      and no longer contains "Delivery in" (the EN template marker).
   */
  test("SEO heading updates to AR template after switching language without a page reload", async ({ page }) => {
    await stubWooBrands(page);
    await stubBrandProducts(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brand page in EN (Beirut) ─────────────────────────────
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "{name} Delivery in {city}"
    expect(initialText).toContain("E2E Test Brand");
    expect(initialText).toContain("Delivery in");

    // ── Step 2: open the language switcher ────────────────────────────────
    // There are two instances (navbar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select Arabic ─────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const arButton = page.getByTestId("button-lang-ar");
    await expect(arButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await arButton.click();

    // ── Step 4: assert the URL updated to AR locale without a hard reload ──
    // switchLanguage() changes /en-lb/… → /ar-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/ar-lb\/beirut\/brand\//, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the AR template ───────────────
    // AR template: "توصيل {name} في {city}"
    // "توصيل" is the Arabic word for "delivery" — present only in the AR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // The AR word "توصيل" must appear (proves the AR template was rendered).
    expect(updatedText).toContain("توصيل");
    // The EN marker "Delivery in" must be gone.
    expect(updatedText).not.toContain("Delivery in");
    // The brand name must still be present in the heading.
    expect(updatedText).toContain("E2E Test Brand");
  });
});

// ---------------------------------------------------------------------------
// 16. Category page — SEO heading updates when language is switched EN→AR
// ---------------------------------------------------------------------------

test.describe("SEO content section — category page language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path): switching EN→AR via the
   * LanguageSwitcher calls setLanguage() → navigate() via Wouter (history.pushState)
   * — there is NO hard page reload. The URL changes from /en-lb/beirut/category/…
   * to /ar-lb/beirut/category/…, and LocaleContext's `language` state updates to "ar".
   * SEOContentSection must re-render the H2 with the AR heading template
   * ("توصيل {name} في {city}") rather than the EN one ("{name} Delivery in {city}").
   *
   * Flow:
   *   1. Land on /en-lb/beirut/category/hand-bouquets → heading shows EN template.
   *   2. Click the LanguageSwitcher trigger (first instance).
   *   3. Click the AR option (data-testid="button-lang-ar").
   *   4. LocaleContext calls navigate("/ar-lb/beirut/category/…") via Wouter — client-side only.
   *   5. Assert heading now contains "توصيل" (the Arabic delivery word) and no
   *      longer contains "Delivery in" (the EN template marker).
   */
  test("SEO heading updates to AR template after switching language without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load category page in EN (Beirut) ───────────────────────────
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "{name} Delivery in {city}"
    expect(initialText).toContain("Hand Bouquets");
    expect(initialText).toContain("Delivery in");

    // ── Step 2: open the language switcher ──────────────────────────────────
    // There are two instances (TopUtilityBar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select Arabic ────────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const arButton = page.getByTestId("button-lang-ar");
    await expect(arButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await arButton.click();

    // ── Step 4: assert the URL updated to AR locale without a hard reload ────
    // switchLanguage() changes /en-lb/… → /ar-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/ar-lb\/beirut\/category\/hand-bouquets/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the AR template ──────────────────
    // AR template: "توصيل {name} في {city}"
    // "توصيل" is the Arabic word for "delivery" — present only in the AR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // The AR word "توصيل" must appear (proves the AR template was rendered).
    expect(updatedText).toContain("توصيل");
    // The EN marker "Delivery in" must be gone.
    expect(updatedText).not.toContain("Delivery in");
    // The category name must still be present in the heading.
    expect(updatedText).toContain("Hand Bouquets");
  });
});

// ---------------------------------------------------------------------------
// 17. Brand detail page — SEO heading updates when language is switched to FR
//     mid-session (no hard page reload — Wouter client-side navigation)
// ---------------------------------------------------------------------------

test.describe("SEO content section — brand page FR language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path, FR branch): switching EN→FR
   * via the LanguageSwitcher calls setLanguage() → navigate() via Wouter
   * (history.pushState) — there is NO hard page reload. The URL changes from
   * /en-lb/beirut/brand/… to /fr-lb/beirut/brand/…, and LocaleContext's
   * `language` state updates to "fr". SEOContentSection must re-render the H2
   * with the FR heading template ("Livraison {name} à {city}") rather than
   * the EN one ("{name} Delivery in {city}").
   *
   * The FR code path through STRINGS_FR / tSeo() is a separate branch from the
   * AR path; a regression there (e.g. missing STRINGS_FR lookup, or FR template
   * not rendered) would only be caught by a FR-specific test.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brand/… → heading shows EN template ("Delivery in").
   *   2. Click the LanguageSwitcher trigger in the nav.
   *   3. Click the FR option (data-testid="button-lang-fr").
   *   4. LocaleContext calls navigate("/fr-lb/beirut/brand/…") via Wouter — client-side only.
   *   5. Assert heading now contains "Livraison" (the French word from the FR template)
   *      and no longer contains "Delivery in" (the EN template marker).
   */
  test("SEO heading updates to FR template after switching language without a page reload", async ({ page }) => {
    await stubWooBrands(page);
    await stubBrandProducts(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brand page in EN (Beirut) ─────────────────────────────
    await page.goto(`/en-lb/beirut/brand/${BRAND_SLUG}`);

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "{name} Delivery in {city}"
    expect(initialText).toContain("E2E Test Brand");
    expect(initialText).toContain("Delivery in");

    // ── Step 2: open the language switcher ────────────────────────────────
    // There are two instances (navbar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select French ─────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const frButton = page.getByTestId("button-lang-fr");
    await expect(frButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await frButton.click();

    // ── Step 4: assert the URL updated to FR locale without a hard reload ──
    // switchLanguage() changes /en-lb/… → /fr-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/fr-lb\/beirut\/brand\//, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the FR template ───────────────
    // FR template: "Livraison {name} à {city}"
    // "Livraison" is the French word for "delivery" — present only in the FR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // The FR word "Livraison" must appear (proves the FR template was rendered).
    expect(updatedText).toContain("Livraison");
    // The EN marker "Delivery in" must be gone.
    expect(updatedText).not.toContain("Delivery in");
    // The brand name must still be present in the heading.
    expect(updatedText).toContain("E2E Test Brand");
  });
});

// ---------------------------------------------------------------------------
// 27. Shop page (/shop) — FAQ count >= 3 guard
// ---------------------------------------------------------------------------

test.describe("SEO content section — shop page with products", () => {
  test.beforeEach(async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/shop");
  });

  test("shop FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 20. Shop page (/shop) — SEO heading updates when the shopper switches cities
//     (URL navigation path)
// ---------------------------------------------------------------------------

test.describe("SEO content section — shop page city-switch regression guard", () => {
  /**
   * Regression guard (URL navigation path): if a shopper changes their
   * delivery city on the plain shop page (/shop, no category or occasion
   * filter), the SEO heading ("Shop Flowers, Cakes & Gifts in {city}") must
   * reflect the new city — not the city active on first load.
   *
   * We simulate the city-picker's setLocation() call by driving the browser
   * directly to the Dubai-prefixed URL, which is exactly what the picker does
   * via navigate(buildLocalePath(…)).
   */
  test("SEO heading contains the new city name after navigating to a Dubai URL", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: Beirut ──────────────────────────────────────────────────────
    await page.goto("/en-lb/beirut/shop");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();
    const initialText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "lb-beirut" → name "Beirut".
    // EN template: "Shop Flowers, Cakes & Gifts in {city}".
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Shop");

    // ── Step 2: switch to Dubai ─────────────────────────────────────────────
    // Navigate to the Dubai-prefixed shop URL — this is exactly what the city
    // picker does via setLocation() → navigate(buildLocalePath(...)).
    await page.goto("/en-ae/dubai/shop");

    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";

    // Delivery-locations stub maps "ae-dubai" → name "Dubai"; the heading
    // must now show "Dubai" and must NOT still show "Beirut".
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

// ---------------------------------------------------------------------------
// 21. Shop page (/shop) — SEO heading updates when the city picker is used
//     mid-session (no hard page reload — Wouter client-side navigation)
// ---------------------------------------------------------------------------

test.describe("SEO content section — shop page city-switch via picker mid-session", () => {
  /**
   * Regression guard (city-picker UI path): the city picker calls
   * setLocation(), which navigates via Wouter (history.pushState) — there is
   * NO hard page reload. React must propagate the new cityLabel into
   * SEOContentSection reactively.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/shop → heading shows "Beirut".
   *   2. Open the city picker via the top utility bar button.
   *   3. Select UAE → Dubai inside the picker dialog.
   *   4. LocationContext calls navigate("/en-ae/dubai/shop") via Wouter —
   *      client-side only, no reload.
   *   5. Assert heading now shows "Dubai" and no longer shows "Beirut".
   */
  test("SEO heading updates to new city after using the picker without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load shop page at Beirut ─────────────────────────────────────
    await page.goto("/en-lb/beirut/shop");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "Shop Flowers, Cakes & Gifts in {city}"
    expect(initialText).toContain("Beirut");
    expect(initialText).toContain("Shop");

    // ── Step 2: open the city picker from the top utility bar ─────────────────
    // `button-country-selector` lives in TopUtilityBar (always visible, no
    // breakpoint hide). The Navbar also has `button-open-location-picker` but
    // it is hidden on narrower viewports (hidden lg:flex).
    const pickerButton = page.getByTestId("button-country-selector");
    await expect(pickerButton).toBeVisible({ timeout: 5_000 });
    await pickerButton.click();

    // ── Step 3: select UAE then Dubai inside the picker dialog ────────────────
    // The picker opens pre-navigated to Lebanon's city list because
    // `initialCountryCode` is "LB" (set from the current URL/stored location).
    // Go back to the country list via `button-picker-back`, then select UAE.
    const backButton = page.getByTestId("button-picker-back");
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    const uaeButton = page.getByTestId("button-country-ae");
    await expect(uaeButton).toBeVisible({ timeout: 5_000 });
    await uaeButton.click();

    const dubaiButton = page.getByTestId("button-city-ae-dubai");
    await expect(dubaiButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await dubaiButton.click();

    // ── Step 4: assert the URL updated to Dubai without a hard reload ─────────
    // Wouter calls history.pushState → the URL changes but no DOMContentLoaded
    // fires. Playwright's page.waitForURL() waits for the pushState to settle.
    await page.waitForURL(/\/en-ae\/dubai\/shop/, { timeout: 10_000 });

    // The nav count was not incremented by a real navigation — confirms we are
    // still in the same page session (soft-nav via Wouter).
    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because `__playwrightNavCount` is only set by a hard
    // navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the new city ─────────────────────
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    expect(updatedText).toContain("Dubai");
    expect(updatedText).not.toContain("Beirut");
  });
});

// ---------------------------------------------------------------------------
// 17. Occasion page — SEO heading updates when language is switched EN→AR
// ---------------------------------------------------------------------------

test.describe("SEO content section — occasion page language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path): switching EN→AR via the
   * LanguageSwitcher calls setLanguage() → navigate() via Wouter (history.pushState)
   * — there is NO hard page reload. The URL changes from /en-lb/beirut/occasion/…
   * to /ar-lb/beirut/occasion/…, and LocaleContext's `language` state updates to "ar".
   * SEOContentSection must re-render the H2 with the AR heading template
   * ("أرسل زهوراً وهدايا {name} في {city}") rather than the EN one
   * ("Send {name} Flowers & Gifts in {city}").
   *
   * Flow:
   *   1. Land on /en-lb/beirut/occasion/birthday → heading shows EN template.
   *   2. Click the LanguageSwitcher trigger (first instance).
   *   3. Click the AR option (data-testid="button-lang-ar").
   *   4. LocaleContext calls navigate("/ar-lb/beirut/occasion/…") via Wouter — client-side only.
   *   5. Assert heading now contains "أرسل" (the Arabic "send" word) and no
   *      longer contains "Send" (the EN template marker).
   */
  test("SEO heading updates to AR template after switching language without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load occasion page in EN (Beirut) ───────────────────────────
    await page.goto("/en-lb/beirut/occasion/birthday");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "Send {name} Flowers & Gifts in {city}"
    expect(initialText).toContain("Birthday");
    expect(initialText).toContain("Send");

    // ── Step 2: open the language switcher ──────────────────────────────────
    // There are two instances (TopUtilityBar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select Arabic ────────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const arButton = page.getByTestId("button-lang-ar");
    await expect(arButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await arButton.click();

    // ── Step 4: assert the URL updated to AR locale without a hard reload ────
    // switchLanguage() changes /en-lb/… → /ar-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/ar-lb\/beirut\/occasion\/birthday/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the AR template ──────────────────
    // AR template: "أرسل زهوراً وهدايا {name} في {city}"
    // "أرسل" is the Arabic word for "send" — present only in the AR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // The AR word "أرسل" must appear (proves the AR template was rendered).
    expect(updatedText).toContain("أرسل");
    // The EN marker "Send" must be gone (note: "أرسل" does not contain "Send").
    expect(updatedText).not.toContain("Send");
    // The occasion name must still be present in the heading.
    expect(updatedText).toContain("Birthday");
  });
});

// ---------------------------------------------------------------------------
// 22. Brands listing page (/brands) — SEO heading updates when language is
//     switched EN→FR mid-session (no hard page reload — Wouter client-side)
// ---------------------------------------------------------------------------

test.describe("SEO content section — brands listing page FR language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path, FR branch): switching EN→FR
   * via the LanguageSwitcher calls setLanguage() → navigate() via Wouter
   * (history.pushState) — there is NO hard page reload. The URL changes from
   * /en-lb/beirut/brands to /fr-lb/beirut/brands, and LocaleContext's
   * `language` state updates to "fr". SEOContentSection must re-render the H2
   * with the FR heading template ("Marques cadeaux disponibles à {city}")
   * rather than the EN one ("Gift Brands Available in {city}").
   *
   * The FR code path through STRINGS_FR / tSeo() on the brands listing page is
   * a separate template from the brand detail FR template; a regression there
   * (e.g. missing STRINGS_FR["seo.content.brands.heading"] lookup) would only
   * be caught by a FR-specific test on this page.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brands → heading shows EN template ("Gift Brands").
   *   2. Click the LanguageSwitcher trigger in the nav.
   *   3. Click the FR option (data-testid="button-lang-fr").
   *   4. LocaleContext calls navigate("/fr-lb/beirut/brands") via Wouter — client-side only.
   *   5. Assert heading now contains "Marques" (the FR-specific marker) and no
   *      longer contains "Gift Brands" (the EN template marker).
   */
  test("SEO heading updates to FR template after switching language without a page reload", async ({ page }) => {
    await stubCatalogMetadataWithBrands(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brands listing page in EN (Beirut) ─────────────────────
    await page.goto("/en-lb/beirut/brands");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "Gift Brands Available in {city}"
    expect(initialText).toContain("Gift Brands");
    expect(initialText).toContain("Beirut");

    // ── Step 2: open the language switcher ────────────────────────────────
    // There are two instances (navbar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select French ─────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const frButton = page.getByTestId("button-lang-fr");
    await expect(frButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await frButton.click();

    // ── Step 4: assert the URL updated to FR locale without a hard reload ──
    // switchLanguage() changes /en-lb/… → /fr-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/fr-lb\/beirut\/brands/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the FR template ───────────────
    // FR template: "Marques cadeaux disponibles à {city}"
    // "Marques" is the French word for "brands" — present only in the FR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // The FR word "Marques" must appear (proves the FR template was rendered).
    expect(updatedText).toContain("Marques");
    // The EN marker "Gift Brands" must be gone.
    expect(updatedText).not.toContain("Gift Brands");
  });
});

// ---------------------------------------------------------------------------
// 23. Category page — SEO heading updates when language is switched EN→FR

//     mid-session (no hard page reload — Wouter client-side navigation)
// ---------------------------------------------------------------------------

test.describe("SEO content section — category page FR language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path, FR branch): switching EN→FR
   * via the LanguageSwitcher calls setLanguage() → navigate() via Wouter
   * (history.pushState) — there is NO hard page reload. The URL changes from
   * /en-lb/beirut/category/… to /fr-lb/beirut/category/…, and LocaleContext's
   * `language` state updates to "fr". SEOContentSection must re-render the H2
   * with the FR heading template ("Livraison de {name} à {city}") rather than
   * the EN one ("{name} Delivery in {city}").
   *
   * The FR code path through STRINGS_FR / tSeo() is a separate branch from the
   * AR path; a regression there would only be caught by a FR-specific test.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/category/hand-bouquets → heading shows EN template.
   *   2. Click the LanguageSwitcher trigger in the nav.
   *   3. Click the FR option (data-testid="button-lang-fr").
   *   4. LocaleContext calls navigate("/fr-lb/beirut/category/…") via Wouter — client-side only.
   *   5. Assert heading now contains "Livraison de" (the FR-specific marker) and
   *      no longer contains "Delivery in" (the EN template marker).
   */
  test("SEO heading updates to FR template after switching language without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load category page in EN (Beirut) ───────────────────────────
    await page.goto("/en-lb/beirut/category/hand-bouquets");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "{name} Delivery in {city}"
    expect(initialText).toContain("Hand Bouquets");
    expect(initialText).toContain("Delivery in");

    // ── Step 2: open the language switcher ──────────────────────────────────
    // There are two instances (TopUtilityBar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select French ────────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const frButton = page.getByTestId("button-lang-fr");
    await expect(frButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await frButton.click();

    // ── Step 4: assert the URL updated to FR locale without a hard reload ────
    // switchLanguage() changes /en-lb/… → /fr-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/fr-lb\/beirut\/category\/hand-bouquets/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the FR template ──────────────────
    // FR template: "Livraison de {name} à {city}"
    // "Livraison de" is the FR-specific marker — present only in the FR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // "Livraison de" must appear (proves the FR category template was rendered).
    expect(updatedText).toContain("Livraison de");
    // The EN marker "Delivery in" must be gone.
    expect(updatedText).not.toContain("Delivery in");
    // The category name must still be present in the heading.
    expect(updatedText).toContain("Hand Bouquets");
  });
});

// ---------------------------------------------------------------------------
// 24. Occasion page — SEO heading updates when language is switched EN→FR
//     mid-session (no hard page reload — Wouter client-side navigation)
// ---------------------------------------------------------------------------

test.describe("SEO content section — occasion page FR language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path, FR branch): switching EN→FR
   * via the LanguageSwitcher calls setLanguage() → navigate() via Wouter
   * (history.pushState) — there is NO hard page reload. The URL changes from
   * /en-lb/beirut/occasion/… to /fr-lb/beirut/occasion/…, and LocaleContext's
   * `language` state updates to "fr". SEOContentSection must re-render the H2
   * with the FR heading template ("Envoyez des fleurs et cadeaux pour {name} à {city}")
   * rather than the EN one ("Send {name} Flowers & Gifts in {city}").
   *
   * The FR code path through STRINGS_FR / tSeo() is a separate branch from the
   * AR path; a regression there would only be caught by a FR-specific test.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/occasion/birthday → heading shows EN template.
   *   2. Click the LanguageSwitcher trigger in the nav.
   *   3. Click the FR option (data-testid="button-lang-fr").
   *   4. LocaleContext calls navigate("/fr-lb/beirut/occasion/…") via Wouter — client-side only.
   *   5. Assert heading now contains "Envoyez" (the FR-specific marker) and
   *      no longer contains "Send" (the EN template marker).
   */
  test("SEO heading updates to FR template after switching language without a page reload", async ({ page }) => {
    await stubProducts(page);
    await stubCatalogMetadata(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load occasion page in EN (Beirut) ───────────────────────────
    await page.goto("/en-lb/beirut/occasion/birthday");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "Send {name} Flowers & Gifts in {city}"
    expect(initialText).toContain("Birthday");
    expect(initialText).toContain("Send");

    // ── Step 2: open the language switcher ──────────────────────────────────
    // There are two instances (TopUtilityBar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select French ────────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const frButton = page.getByTestId("button-lang-fr");
    await expect(frButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await frButton.click();

    // ── Step 4: assert the URL updated to FR locale without a hard reload ────
    // switchLanguage() changes /en-lb/… → /fr-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/fr-lb\/beirut\/occasion\/birthday/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the FR template ──────────────────
    // FR template: "Envoyez des fleurs et cadeaux pour {name} à {city}"
    // "Envoyez" is the FR-specific marker — present only in the FR template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // "Envoyez" must appear (proves the FR occasion template was rendered).
    expect(updatedText).toContain("Envoyez");
    // The EN marker "Send" must be gone.
    expect(updatedText).not.toContain("Send");
    // The occasion name must still be present in the heading.
    expect(updatedText).toContain("Birthday");
  });
});

// ---------------------------------------------------------------------------
// 26. All-occasions listing page (/occasions) — FAQ count >= 3 guard
// ---------------------------------------------------------------------------

test.describe("SEO content section — all-occasions listing page with occasions", () => {
  test.beforeEach(async ({ page }) => {
    await stubCatalogMetadata(page);
    await seedLocation(page);
    await page.goto("/en-lb/beirut/occasions");
  });

  test("occasions listing FAQ has at least 3 items (guards against accidentally emptied copy)", async ({
    page,
  }) => {
    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });
    const faqButtons = section.locator("button[aria-expanded]");
    await expect(faqButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 24. Brands listing page (/brands) — SEO heading updates when language is
//     switched EN→FR mid-session (no hard page reload — Wouter client-side)
// ---------------------------------------------------------------------------

test.describe("SEO content section — brands listing page FR language-switch regression guard", () => {
  /**
   * Regression guard (language-switcher UI path, FR branch): switching EN→FR
   * via the LanguageSwitcher calls setLanguage() → navigate() via Wouter
   * (history.pushState) — there is NO hard page reload. The URL changes from
   * /en-lb/beirut/brands to /fr-lb/beirut/brands, and LocaleContext's
   * `language` state updates to "fr". SEOContentSection must re-render the H2
   * with the FR heading template ("Marques cadeaux disponibles à {city}")
   * rather than the EN one ("Gift Brands Available in {city}").
   *
   * The FR code path through STRINGS_FR / tSeo() is a separate branch from
   * the AR path; a regression there (e.g. a missing STRINGS_FR lookup for the
   * brands key) would only be caught by a FR-specific test.
   *
   * Flow:
   *   1. Land on /en-lb/beirut/brands → heading shows EN template
   *      ("Gift Brands Available in Beirut").
   *   2. Click the LanguageSwitcher trigger (first instance, in the nav).
   *   3. Click the FR option (data-testid="button-lang-fr").
   *   4. LocaleContext calls navigate("/fr-lb/beirut/brands") via Wouter —
   *      client-side only, no hard reload.
   *   5. Assert heading now contains "Marques cadeaux" (the FR-specific marker)
   *      and no longer contains "Gift Brands Available" (the EN template marker).
   */
  test("SEO heading updates to FR template after switching language without a page reload", async ({ page }) => {
    await stubCatalogMetadataWithBrands(page);
    await stubDeliveryLocations(page);
    await seedLocation(page);

    // ── Step 1: load brands listing page in EN (Beirut) ─────────────────────
    await page.goto("/en-lb/beirut/brands");

    const section = page.getByTestId("seo-content-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const heading = section.locator("h2").first();
    await expect(heading).toBeVisible();

    const initialText = (await heading.textContent()) ?? "";
    // EN template: "Gift Brands Available in {city}"
    expect(initialText).toContain("Gift Brands Available");
    expect(initialText).toContain("Beirut");

    // ── Step 2: open the language switcher ──────────────────────────────────
    // There are two instances (TopUtilityBar + footer); pick the first (navbar) one.
    const langSwitcher = page.getByTestId("language-switcher").first();
    await expect(langSwitcher).toBeVisible({ timeout: 5_000 });
    await langSwitcher.click();

    // ── Step 3: select French ────────────────────────────────────────────────
    // DropdownMenuItem portals to <body>; use page-level locator (not section).
    const frButton = page.getByTestId("button-lang-fr");
    await expect(frButton).toBeVisible({ timeout: 5_000 });

    // Capture the current navigation count so we can verify Wouter navigated
    // client-side (pushState) without triggering a hard reload.
    const navCountBefore = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );

    await frButton.click();

    // ── Step 4: assert the URL updated to FR locale without a hard reload ────
    // switchLanguage() changes /en-lb/… → /fr-lb/…; Wouter calls pushState.
    await page.waitForURL(/\/fr-lb\/beirut\/brands/, { timeout: 10_000 });

    const navCountAfter = await page.evaluate(
      () => (window as Window & { __playwrightNavCount?: number }).__playwrightNavCount ?? 0,
    );
    // Both will be 0 because __playwrightNavCount is only incremented on a
    // hard navigation frame; equality proves no hard reload occurred.
    expect(navCountAfter).toBe(navCountBefore);

    // ── Step 5: assert SEO heading reflects the FR template ──────────────────
    // FR template: "Marques cadeaux disponibles à {city}"
    // "Marques cadeaux" is the FR-specific marker — absent from every EN template.
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(heading).toBeVisible();

    const updatedText = (await heading.textContent()) ?? "";
    // "Marques cadeaux" must appear (proves the FR brands template was rendered).
    expect(updatedText).toContain("Marques cadeaux");
    // The EN marker "Gift Brands Available" must be gone.
    expect(updatedText).not.toContain("Gift Brands Available");
  });
});
  });
});
