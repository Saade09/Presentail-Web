/**
 * FAQ rich-results regression tests — Corporate and Weddings pages
 *
 * Both /corporate and /weddings always render SEOContentSection (no product
 * gate), which injects a FAQPage JSON-LD <script> into document.head via
 * useEffect. These tests guard against a silent regression (e.g. a refactor
 * of the SEOContentSection useEffect) that would drop the structured data and
 * remove the rich results from Google Search.
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
// Shared helper
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
