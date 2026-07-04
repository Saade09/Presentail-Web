/**
 * FAQ rich-results regression tests
 *
 * Covers every page that renders SEOContentSection unconditionally, which injects
 * a FAQPage JSON-LD <script> into document.head via useEffect. These tests guard
 * against a silent regression (e.g. a refactor of the SEOContentSection useEffect)
 * that would drop the structured data and remove the rich results from Google Search.
 *
 * Pages covered:
 *   /corporate      — Corporate
 *   /weddings       — Weddings
 *   /              — Homepage
 *   /shop           — Shop
 *   /brands         — Brand listing
 *   /occasions      — Occasions listing
 *   /contact        — Contact
 *   /brand/:slug    — Brand detail (pageType="brand"; rendered only when brand has
 *                     products — API routes are stubbed to guarantee a non-empty
 *                     product list without relying on a live OS/WooCommerce backend)
 *
 * Each suite:
 *   1. Navigates to the page and waits for the SEO section to mount.
 *   2. Asserts that exactly one <script type="application/ld+json"
 *      data-seo-faq-ld> tag exists in <head>.
 *   3. Parses the JSON and verifies:
 *        - @type is "FAQPage"
 *        - mainEntity is an array with exactly 3 entries
 *        - each entry has @type "Question" with a non-empty name string
 *        - each entry has an acceptedAnswer with @type "Answer" and a
 *          non-empty text string
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Seed localStorage so cityLabel resolves to "Beirut" rather than empty. */
async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
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
 * Shared test suite factory — creates the four standard FAQ rich-result
 * assertions for any page that unconditionally renders SEOContentSection.
 */
function describePageFaqRichResults(label: string, path: string): void {
  test.describe(`FAQ rich results — ${label} (${path})`, () => {
    test.beforeEach(async ({ page }) => {
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
      expect(schema).not.toBeNull();
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
      expect(schema).not.toBeNull();
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
// Corporate page — /corporate
// ---------------------------------------------------------------------------

test.describe("FAQ rich results — Corporate page (/corporate)", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto("/corporate");
  });

  test("SEOContentSection is visible on the Corporate page", async ({ page }) => {
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
    expect(schema).not.toBeNull();
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
    expect(schema).not.toBeNull();
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

// ---------------------------------------------------------------------------
// Weddings page — /weddings
// ---------------------------------------------------------------------------

test.describe("FAQ rich results — Weddings page (/weddings)", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);
    await page.goto("/weddings");
  });

  test("SEOContentSection is visible on the Weddings page", async ({ page }) => {
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
    expect(schema).not.toBeNull();
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
    expect(schema).not.toBeNull();
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

// ---------------------------------------------------------------------------
// Homepage — /
// ---------------------------------------------------------------------------

describePageFaqRichResults("Homepage", "/");

// ---------------------------------------------------------------------------
// Shop page — /shop
// ---------------------------------------------------------------------------

describePageFaqRichResults("Shop page", "/shop");

// ---------------------------------------------------------------------------
// Brand listing — /brands
// ---------------------------------------------------------------------------

describePageFaqRichResults("Brand listing", "/brands");

// ---------------------------------------------------------------------------
// Occasions listing — /occasions
// ---------------------------------------------------------------------------

describePageFaqRichResults("Occasions listing", "/occasions");

// ---------------------------------------------------------------------------
// Contact page — /contact
// ---------------------------------------------------------------------------

describePageFaqRichResults("Contact page", "/contact");

// ---------------------------------------------------------------------------
// Brand detail page — /brand/:slug
//
// SEOContentSection is rendered with pageType="brand" only when the brand has
// at least one product (BrandDetail gates on `hasProducts`). We stub the three
// relevant API endpoints so the test runs without a live backend:
//   - /api/woo/brands        → returns one brand whose slug matches the URL
//   - /api/woo/brand-products → returns one product so hasProducts is true
//   - /api/catalog/metadata  → returns empty occasions list (avoids a 500)
// All other /api/* calls receive a generic { ok: true } stub.
// ---------------------------------------------------------------------------

const BRAND_DETAIL_SLUG = "test-brand";
const BRAND_DETAIL_PATH = `/brand/${BRAND_DETAIL_SLUG}`;

const STUB_BRAND = {
  id: BRAND_DETAIL_SLUG,
  name: "Test Brand",
  slug: BRAND_DETAIL_SLUG,
  image: null,
};

const STUB_BRAND_PRODUCT = {
  id: "stub-product",
  name: "Stub Product",
  slug: "stub-product",
  priceValue: 50,
  image: { uri: "https://example.com/stub.jpg" },
  category: "hand-bouquets",
  description: "A stub product for testing.",
};

test.describe(`FAQ rich results — Brand detail page (${BRAND_DETAIL_PATH})`, () => {
  test.beforeEach(async ({ page }) => {
    await seedLocation(page);

    await page.route("**/api/woo/brands**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, brands: [STUB_BRAND] }),
      }),
    );

    await page.route("**/api/woo/brand-products**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          products: [STUB_BRAND_PRODUCT],
          count: 1,
          brandName: STUB_BRAND.name,
        }),
      }),
    );

    await page.route("**/api/catalog/metadata**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, occasions: [], categories: [] }),
      }),
    );

    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );

    await page.goto(BRAND_DETAIL_PATH);
  });

  test("SEOContentSection is visible on the Brand detail page", async ({ page }) => {
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
    expect(schema).not.toBeNull();
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
    expect(schema).not.toBeNull();
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
