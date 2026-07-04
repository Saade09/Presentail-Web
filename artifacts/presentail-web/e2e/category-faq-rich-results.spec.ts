/**
 * FAQ rich-results regression tests — product-gated category & occasion pages
 *
 * Category pages (/category/:slug) and occasion pages (/occasion/:slug) only
 * render SEOContentSection when products are available (products.length > 0).
 * This makes them product-gated — they need API stubs to render deterministically
 * in CI where no live Presentail OS API key is present.
 *
 * These tests guard against a silent regression (e.g. a refactor of the
 * SEOContentSection useEffect, or a change to the category/occasion faqKeys
 * switch branch) that would drop the structured data and remove the rich results
 * from Google Search on the most-trafficked SEO landing pages.
 *
 * API stubs used (same approach as seo-content-section.spec.ts):
 *   - /api/woo/products  → returns one fixture product matching the test slug
 *   - /api/catalog/metadata → returns category + occasion slugs the component
 *     needs to build its internal-link chips
 *
 * Pages covered:
 *   /category/hand-bouquets  — representative flower category
 *   /occasion/birthday       — representative high-traffic occasion
 *
 * Each suite asserts:
 *   1. <section data-testid="seo-content-section"> is visible
 *   2. Exactly one <script type="application/ld+json" data-seo-faq-ld> in <head>
 *   3. @type === "FAQPage" and mainEntity.length === 3
 *   4. Each mainEntity entry has @type "Question", non-empty name, and a
 *      well-formed acceptedAnswer { @type: "Answer", text: non-empty string }
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Minimal product that matches both "hand-bouquets" category and "birthday" occasion. */
const STUB_PRODUCT = {
  id: "e2e-faq-bouquet-1",
  name: "E2E FAQ Rose Bouquet",
  slug: "e2e-faq-rose-bouquet",
  priceValue: 60,
  image: { uri: "https://example.com/rose.jpg" },
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  occasions: ["birthday"],
  brandNames: [],
  description: "A beautiful rose bouquet for e2e FAQ rich-results testing.",
};

/** Catalog metadata stub with slugs matching the hardcoded chip lists in SEOContentSection. */
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

/** Stub the products endpoint so the shop renders without a live OS API key. */
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
  await page.route(/\/api\/catalog\/metadata/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CATALOG_METADATA),
    }),
  );
}

/**
 * Read the FAQPage JSON-LD injected by SEOContentSection into <head>.
 * Returns `null` when the script tag is absent.
 */
async function getFaqLdJson(page: Page): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate(() => {
    const script = document.head.querySelector(
      'script[type="application/ld+json"][data-seo-faq-ld]',
    );
    return script?.textContent ?? null;
  });
  if (raw === null) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Shared test suite factory for product-gated category/occasion pages.
 *
 * Stubs the products and catalog-metadata APIs before each test so
 * SEOContentSection renders deterministically (products.length > 0 guard
 * passes) without a live Presentail OS API key.
 */
function describeFaqRichResultsProductGated(
  label: string,
  path: string,
): void {
  test.describe(`FAQ rich results — ${label} (${path})`, () => {
    test.beforeEach(async ({ page }) => {
      await stubProducts(page);
      await stubCatalogMetadata(page);
      await seedLocation(page);
      await page.goto(path);
    });

    test(`SEOContentSection is visible on the ${label} page`, async ({ page }) => {
      await expect(
        page.getByTestId("seo-content-section"),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("FAQPage JSON-LD <script data-seo-faq-ld> is injected into <head> exactly once", async ({
      page,
    }) => {
      await expect(
        page.getByTestId("seo-content-section"),
      ).toBeVisible({ timeout: 15_000 });

      const { content, count } = await page.evaluate(() => {
        const scripts = document.head.querySelectorAll(
          'script[type="application/ld+json"][data-seo-faq-ld]',
        );
        return {
          content: scripts[0]?.textContent ?? null,
          count: scripts.length,
        };
      });

      expect(content, "<script data-seo-faq-ld> not found in document.head").not.toBeNull();
      expect(count, "expected exactly one data-seo-faq-ld script tag in <head>").toBe(1);
    });

    test('parsed JSON-LD has @type "FAQPage" and exactly 3 mainEntity entries', async ({
      page,
    }) => {
      await expect(
        page.getByTestId("seo-content-section"),
      ).toBeVisible({ timeout: 15_000 });

      const schema = await getFaqLdJson(page);
      expect(schema, "<script data-seo-faq-ld> not found in document.head").not.toBeNull();
      expect(schema!["@type"]).toBe("FAQPage");
      const mainEntity = schema!.mainEntity as unknown[];
      expect(Array.isArray(mainEntity)).toBe(true);
      expect(mainEntity.length).toBe(3);
    });

    test('each mainEntity entry has @type "Question" with a non-empty name and a well-formed acceptedAnswer', async ({
      page,
    }) => {
      await expect(
        page.getByTestId("seo-content-section"),
      ).toBeVisible({ timeout: 15_000 });

      const schema = await getFaqLdJson(page);
      expect(schema, "<script data-seo-faq-ld> not found in document.head").not.toBeNull();
      const mainEntity = schema!.mainEntity as Array<Record<string, unknown>>;
      for (const entry of mainEntity) {
        expect(entry["@type"]).toBe("Question");
        expect(typeof entry.name).toBe("string");
        expect((entry.name as string).length).toBeGreaterThan(0);
        const answer = entry.acceptedAnswer as Record<string, unknown>;
        expect(answer).toBeTruthy();
        expect(answer["@type"]).toBe("Answer");
        expect(typeof answer.text).toBe("string");
        expect((answer.text as string).length).toBeGreaterThan(0);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Category page — /category/hand-bouquets
// ---------------------------------------------------------------------------

describeFaqRichResultsProductGated(
  "Category page (hand-bouquets)",
  "/en-lb/beirut/category/hand-bouquets",
);

// ---------------------------------------------------------------------------
// Occasion page — /occasion/birthday
// ---------------------------------------------------------------------------

describeFaqRichResultsProductGated(
  "Occasion page (birthday)",
  "/en-lb/beirut/occasion/birthday",
);
