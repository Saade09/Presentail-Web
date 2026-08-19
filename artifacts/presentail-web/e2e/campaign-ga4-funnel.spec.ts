/**
 * Campaign attribution → GA4 funnel — dataLayer regression tests
 *
 * Before real ad spend on /flower-delivery starts, this guards the client-side
 * half of the GA4 attribution chain:
 *
 *   1. A visit with gclid + UTM params stores an attribution touch in
 *      localStorage (src/lib/attribution.ts) that survives navigation, so
 *      internal /api/web-events carry campaign attribution funnel-wide.
 *   2. fireGtagEvent mirrors land in window.dataLayer (the inline gtag()
 *      shim in index.html pushes there even when gtag.js is blocked), so
 *      campaign_page_view, add_to_cart, begin_checkout and purchase reach
 *      GA4 whenever the real gtag.js loads in production.
 *
 * The GA4-server side (DebugView, Ads conversion attribution, Clarity
 * recordings) can only be verified against the deployed site — see
 * docs/campaign-ga4-verification.md.
 */

import { test, expect } from "@playwright/test";

const CAMPAIGN_URL =
  "/en-lb/beirut/flower-delivery?gclid=E2E_TEST_GCLID&utm_source=google&utm_medium=cpc&utm_campaign=flower-delivery-launch";

const ATTRIBUTION_KEY = "@presentail/attribution_v1";

type DataLayerEntry = { event?: string; name?: string; params?: Record<string, unknown> };

/** Read gtag "event" entries from window.dataLayer. gtag() pushes `arguments`
 * objects, so entries arrive as array-likes: {0:"event", 1:name, 2:params}. */
async function readGtagEvents(page: import("@playwright/test").Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return dl
      .map((entry) => {
        const e = entry as Record<number, unknown>;
        if (e && e[0] === "event") {
          return { event: "event", name: String(e[1]), params: (e[2] ?? {}) as Record<string, unknown> };
        }
        return null;
      })
      .filter((x): x is { event: string; name: string; params: Record<string, unknown> } => x !== null);
  });
}

async function seedCampaignMarket(
  page: import("@playwright/test").Page,
  market: { countryCode: "LB" | "AE"; cityId: string },
) {
  await page.addInitScript((location) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(location),
    );
  }, market);

  await page.route("**/api/homepage/collection-best-sellers**", async (route) => {
    const categorySlug = new URL(route.request().url()).searchParams.get("categorySlug");
    const products =
      categorySlug === "flowers"
        ? [
            {
              id: `classic-${market.cityId}`,
              name: "Classic Flowers",
              price: market.countryCode === "AE" ? "AED 280" : "$75",
              priceValue: 75,
              image: null,
              images: [],
              categories: ["flowers"],
              inStock: true,
              popularity: 12,
              isBestSeller: true,
              discountPriceValue: 65,
              discountPriceAed: 240,
            },
          ]
        : categorySlug === "lux-arrangements"
          ? [
              {
                id: `luxury-${market.cityId}`,
                name: "Signature Luxury Flowers",
                price: market.countryCode === "AE" ? "AED 550" : "$150",
                priceValue: 150,
                image: null,
                images: [],
                categories: ["flowers", "lux-arrangements"],
                inStock: true,
                popularity: 8,
                discountPriceValue: null,
                discountPriceAed: null,
              },
            ]
          : [];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products }),
    });
  });
  await page.route("**/api/campaign/first-order-eligibility", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, eligible: false, known: true }),
    }),
  );
}

test.describe("campaign landing — attribution capture + GA4 mirrors", () => {
  test.beforeEach(async ({ page }) => {
    await seedCampaignMarket(page, { countryCode: "LB", cityId: "lb-beirut" });
  });

  test("gclid/UTM visit stores attribution and fires campaign_page_view into dataLayer", async ({ page }) => {
    await page.goto(CAMPAIGN_URL);

    // campaign_page_view gtag mirror must land in dataLayer.
    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), { timeout: 15_000 })
      .toContain("campaign_page_view");
    const events = await readGtagEvents(page);
    const pv = events.find((e) => e.name === "campaign_page_view");
    expect(pv?.params?.section).toBe("campaign-flower-delivery");

    // Attribution touch persisted with the ad-click params.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ATTRIBUTION_KEY,
    );
    expect(stored, "attribution must be captured in localStorage").toBeTruthy();
    const parsed = JSON.parse(stored!) as {
      first_touch: Record<string, string>;
      last_touch: Record<string, string>;
    };
    expect(parsed.last_touch.gclid).toBe("E2E_TEST_GCLID");
    expect(parsed.last_touch.utm_source).toBe("google");
    expect(parsed.last_touch.utm_campaign).toBe("flower-delivery-launch");

    // Attribution survives SPA navigation away from the landing page (clean URL).
    await page.goto("/");
    const afterNav = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ATTRIBUTION_KEY,
    );
    expect(afterNav).toBeTruthy();
    expect((JSON.parse(afterNav!) as { last_touch: Record<string, string> }).last_touch.gclid).toBe(
      "E2E_TEST_GCLID",
    );
  });

  test("hero CTA click fires campaign_hero_cta_click gtag mirror", async ({ page }) => {
    await page.goto(CAMPAIGN_URL);
    const cta = page.getByTestId("button-campaign-hero-cta");
    await cta.waitFor({ state: "visible", timeout: 15_000 });
    await cta.click();
    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), { timeout: 10_000 })
      .toContain("campaign_hero_cta_click");
    await expect(page.getByTestId("campaign-card-classic-lb-beirut")).toBeInViewport();
  });

  test("support click is observable and carries the selected city", async ({ page }) => {
    await page.goto(CAMPAIGN_URL);
    const support = page.getByTestId("link-campaign-support");
    await expect(support).toHaveAttribute("href", /wa\.me/);
    expect(decodeURIComponent((await support.getAttribute("href")) ?? "")).toContain("Beirut");
    await support.evaluate((element) => {
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
      (element as HTMLElement).click();
    });
    await expect
      .poll(async () => (await readGtagEvents(page)).map((event) => event.name))
      .toContain("campaign_support_click");
  });

  test("rail impressions, product clicks, and view-all clicks keep section identity", async ({
    page,
  }) => {
    await page.goto(CAMPAIGN_URL);
    await expect
      .poll(
        async () =>
          (await readGtagEvents(page)).filter((event) => event.name === "view_item_list")
            .length,
      )
      .toBeGreaterThanOrEqual(2);

    const flowerCardLink = page
      .getByTestId("campaign-card-classic-lb-beirut")
      .getByRole("link");
    await flowerCardLink.evaluate((element) => {
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
      (element as HTMLElement).click();
    });
    await expect
      .poll(async () => (await readGtagEvents(page)).map((event) => event.name))
      .toContain("select_item");

    const viewAll = page.getByTestId("link-campaign-grid-view-all-flowers");
    await viewAll.evaluate((element) => {
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
      (element as HTMLElement).click();
    });
    await expect
      .poll(async () =>
        (await readGtagEvents(page)).find(
          (event) =>
            event.name === "campaign_view_all_click" &&
            event.params?.campaign_section === "flowers",
        ),
      )
      .toBeTruthy();
  });
});

test.describe("campaign landing — target market structure", () => {
  for (const market of [
    {
      countryCode: "LB" as const,
      cityId: "lb-beirut",
      citySlug: "beirut",
      cityLabel: "Beirut",
    },
    {
      countryCode: "AE" as const,
      cityId: "ae-dubai",
      citySlug: "dubai",
      cityLabel: "Dubai",
    },
    {
      countryCode: "AE" as const,
      cityId: "ae-abu-dhabi",
      citySlug: "abu-dhabi",
      cityLabel: "Abu Dhabi",
    },
  ]) {
    test(`${market.cityLabel} gets the shared flower-first, luxury-second experience`, async ({
      page,
    }) => {
      await seedCampaignMarket(page, market);
      await page.goto(`/en-${market.countryCode.toLowerCase()}/${market.citySlug}/flower-delivery`);

      await expect(page.getByTestId("text-campaign-headline")).toContainText(market.cityLabel);
      await expect(page.getByTestId("button-campaign-hero-cta")).toHaveText(
        "Shop flowers available today",
      );
      await expect(page.getByTestId("link-campaign-support")).toHaveText(
        "Need help choosing? Chat with a support agent",
      );
      await expect(page.getByRole("heading", { name: "Flowers", exact: true })).toBeVisible();
      await expect(
        page.getByText("Fresh arrangements ready to deliver today", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Luxury Arrangements", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Statement designs for unforgettable moments", { exact: true }),
      ).toBeVisible();

      const flowersTop = await page.locator("#campaign-flowers").evaluate((el) => el.getBoundingClientRect().top);
      const luxuryTop = await page.locator("#campaign-lux").evaluate((el) => el.getBoundingClientRect().top);
      expect(flowersTop).toBeLessThan(luxuryTop);

      await expect(page.getByTestId(`campaign-card-classic-${market.cityId}`)).toHaveCount(1);
      await expect(page.getByTestId(`campaign-card-luxury-${market.cityId}`)).toHaveCount(1);
      await expect(page.locator('[data-testid^="campaign-card-"]')).toHaveCount(2);
    });
  }

  test("Arabic keeps the localized copy and RTL direction", async ({ page }) => {
    await seedCampaignMarket(page, { countryCode: "AE", cityId: "ae-dubai" });
    await page.goto("/ar-ae/dubai/flower-delivery");
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    await expect(page.getByTestId("button-campaign-hero-cta")).toHaveText(
      "تسوّق الزهور المتوفرة اليوم",
    );
    await expect(page.getByRole("heading", { name: "الزهور", exact: true })).toBeVisible();
  });

  test("fallback delivery data never publishes a cutoff or speed promise", async ({
    page,
  }) => {
    await seedCampaignMarket(page, { countryCode: "AE", cityId: "ae-dubai" });
    await page.route("**/api/delivery-locations", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          dataStatus: "fallback",
          countries: [
            {
              id: "ae",
              name: "United Arab Emirates",
              code: "AE",
              flag: "🇦🇪",
              currency: "AED",
              isActive: true,
              cities: [
                {
                  id: "ae-dubai",
                  name: "Dubai",
                  isActive: true,
                  expressAvailable: true,
                  expressDeliveryLabel: "",
                  sameDayCutoffHour: 22,
                  operationsConfigVerified: false,
                  timeSlots: [],
                },
              ],
            },
          ],
        }),
      }),
    );
    await page.goto("/en-ae/dubai/flower-delivery");

    await expect(page.getByText("Delivery availability confirmed at checkout").first()).toBeVisible();
    await expect(page.getByText("Delivery timing confirmed at checkout").first()).toBeVisible();
    await expect(page.getByText(/Order by .* for delivery today/)).toHaveCount(0);
    await expect(page.getByText(/Arrives in/)).toHaveCount(0);
  });

  test("live cutoff data without an OS speed label keeps timing neutral", async ({
    page,
  }) => {
    await seedCampaignMarket(page, { countryCode: "AE", cityId: "ae-dubai" });
    await page.route("**/api/delivery-locations", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          dataStatus: "live",
          countries: [
            {
              id: "ae",
              name: "United Arab Emirates",
              code: "AE",
              flag: "🇦🇪",
              currency: "AED",
              isActive: true,
              cities: [
                {
                  id: "ae-dubai",
                  name: "Dubai",
                  isActive: true,
                  expressAvailable: true,
                  expressDeliveryLabel: "",
                  sameDayCutoffHour: 22,
                  operationsConfigVerified: true,
                  timeSlots: [],
                },
              ],
            },
          ],
        }),
      }),
    );
    await page.goto("/en-ae/dubai/flower-delivery");

    await expect(page.getByText(/Order by .* for delivery today/).first()).toBeVisible();
    await expect(page.getByText("Delivery timing confirmed at checkout").first()).toBeVisible();
    await expect(page.getByText(/Arrives in/)).toHaveCount(0);
  });
});
