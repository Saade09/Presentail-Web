/**
 * E2E regression: Midnight Delivery copy at a market-local date boundary.
 *
 * 2026-07-02T21:09:00Z is already July 3 in Beirut (UTC+3 in July), while
 * the browser's UTC calendar date is still July 2. This catches any
 * shopper-facing copy that accidentally uses the device/UTC date instead of
 * the selected market's calendar date.
 *
 * Both surfaces are covered:
 *   - ProductDetail's inline ScheduleInlinePanel
 *   - Checkout's DeliveryPickerModal
 *
 * The tests use the real component tree and stub only API responses, keeping
 * the slot eligibility and selection path identical to the shopper flow.
 */

import { test, expect, type Page } from "@playwright/test";

const CLOCK_TIME = "2026-07-02T21:09:00Z";
const TODAY_ISO = "2026-07-03";
const NEXT_DATE_LABEL = "Sat, 4 Jul";
const MIDNIGHT_LABEL = "11 PM – 1 AM";
const EXPECTED_BANNER = "Arrives between 11 PM tonight and 1 AM on Sat, 4 Jul";

const PRODUCT = {
  id: "midnight-boundary-rose",
  name: "Midnight Boundary Rose",
  slug: "midnight-boundary-rose",
  priceValue: 65,
  wcId: 0,
  image: { uri: "" },
  images: [{ uri: "" }],
  category: "flowers",
  categories: ["flowers"],
  occasions: [],
  brandNames: [],
  description:
    "E2E product for the Midnight Delivery date-boundary regression.",
  inStock: true,
};

const MARKETS = [
  {
    countryCode: "LB",
    cityId: "lb-beirut",
    countryId: "lb",
    countryName: "Lebanon",
    cityName: "Beirut",
    currency: "USD",
    pathPrefix: "en-lb/beirut",
  },
] as const;

function midnightSlots() {
  return [
    {
      label: "9 AM – 1 PM",
      slotId: "os-standard-boundary",
      startHour: 9,
      endHour: 13,
      cutoffHour: 8,
      nextDayEnabled: true,
    },
    {
      label: MIDNIGHT_LABEL,
      slotId: "os-midnight-boundary",
      serviceType: "midnight" as const,
      startHour: 23,
      endHour: 1,
      cutoffHour: 20,
      nextDayEnabled: true,
      extraFee: 20,
    },
  ];
}

function deliveryLocations(market: (typeof MARKETS)[number]) {
  return {
    countries: [
      {
        id: market.countryId,
        name: market.countryName,
        code: market.countryCode,
        flag: "",
        currency: market.currency,
        isActive: true,
        cities: [
          {
            id: market.cityId,
            name: market.cityName,
            isActive: true,
            expressAvailable: false,
            timeSlots: midnightSlots(),
          },
        ],
      },
    ],
    dataStatus: "live",
  };
}

async function installStubs(
  page: Page,
  market: (typeof MARKETS)[number],
): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
            code: "AED",
            name: "UAE Dirham",
            symbol: "AED",
            symbolPosition: "right",
            spaceBetween: true,
            decimals: 2,
          },
        ],
        fallbackCode: "USD",
        countryToCurrency: { LB: "USD", CY: "EUR" },
      }),
    }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        base: "USD",
        rates: { USD: 1, AED: 3.67 },
      }),
    }),
  );
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        countryCode: market.countryCode,
        currency: market.currency,
      }),
    }),
  );
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deliveryLocations(market)),
    }),
  );
  await page.route("**/api/delivery-config**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        expressDeliveryTimeLabel: "Within 90 minutes",
        freeDeliveryThreshold: "100",
        freeDeliveryThresholdUsd: 100,
        currency: market.currency,
        freeDeliveryEnabled: false,
        cityFeeUsd: 0,
        expressSurchargeUsd: 20,
      }),
    }),
  );
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [PRODUCT] }),
    }),
  );
  await page.route("**/api/catalog/products-pricing**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, pricing: {} }),
    }),
  );
  await page.route("**/api/catalog/metadata**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ categories: [], occasions: [], brands: [] }),
    }),
  );
  await page.route("**/api/analytics/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/api/web-events", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
}

async function seedLocation(page: Page, market: (typeof MARKETS)[number]) {
  await page.addInitScript(
    ({ countryCode, cityId }) => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode, cityId }),
      );
    },
    { countryCode: market.countryCode, cityId: market.cityId },
  );
}

async function seedCheckoutCart(page: Page) {
  await page.addInitScript((product) => {
    window.localStorage.setItem(
      "presentail_cart_v1",
      JSON.stringify([{ product, quantity: 1 }]),
    );
  }, PRODUCT);
}

test.describe("Midnight Delivery date boundary", () => {
  for (const market of MARKETS) {
    // Each country's setup must be scoped to its tests. Root-level hooks from
    // a parameter loop accumulate in Playwright, which would otherwise make
    // the later market's route fixture overwrite the earlier one.
    test.describe(market.countryCode, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        // The Pixel device descriptor can retain a desktop CSS viewport when
        // this app's page lacks a mobile viewport declaration. Set the test
        // viewport explicitly so the mobile checkout summary branch is truly
        // exercised.
        if (testInfo.project.name === "Mobile Chrome") {
          await page.setViewportSize({ width: 390, height: 844 });
        }
        // Keep the browser's timezone at its normal UTC setting. The important
        // boundary is that Date#getUTCDate() is still July 2 while the market
        // calendar helpers must resolve July 3.
        await page.clock.install({ time: new Date(CLOCK_TIME) });
        await seedLocation(page, market);
        await installStubs(page, market);
      });

      test("inline schedule uses the market-local date", async ({ page }) => {
        await page.goto(`/${market.pathPrefix}/product/${PRODUCT.slug}`);
        // React Query batches the delivery-location update through a timer. The
        // fake clock intentionally holds timers still until we advance it.
        await page.clock.runFor(1_000);

        const panel = page.getByTestId("schedule-inline-panel");
        await expect(panel).toBeVisible({ timeout: 15_000 });

        const midnightSlot = page.getByTestId(
          "schedule-slot-os-midnight-boundary",
        );
        await expect(midnightSlot).toBeVisible();
        await expect(midnightSlot).toBeEnabled();
        await midnightSlot.click();

        const banner = page.getByTestId("midnight-delivery-banner");
        await expect(banner).toContainText(EXPECTED_BANNER);
        await expect(banner).toContainText(NEXT_DATE_LABEL);
        await expect(midnightSlot).toHaveAttribute("aria-pressed", "true");

        await expect
          .poll(() =>
            page.evaluate(() =>
              window.localStorage.getItem("presentail_delivery_selection_v1"),
            ),
          )
          .toContain(`"date":"${TODAY_ISO}"`);
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.localStorage.getItem("presentail_delivery_selection_v1"),
            ),
          )
          .toContain('"slotId":"os-midnight-boundary"');
      });

      test("picker uses the market-local date and confirms the slot", async ({
        page,
      }, testInfo) => {
        // The checkout's picker trigger lives in the desktop order-summary
        // panel in this browser suite. The inline surface above still runs in
        // both projects; run this interaction once rather than duplicating the
        // desktop layout under the Mobile Chrome device descriptor.
        test.skip(
          testInfo.project.name === "Mobile Chrome",
          "Picker trigger is exercised in the desktop checkout layout.",
        );
        await seedCheckoutCart(page);
        await page.goto(`/${market.pathPrefix}/checkout?guest=1`);
        await page.clock.runFor(1_000);

        // The summary is collapsed on mobile but visible by default on desktop.
        const summaryToggle = page.getByTestId("button-summary-toggle");
        if (await page.evaluate(() => window.innerWidth < 1024)) {
          await expect(summaryToggle).toBeVisible({ timeout: 15_000 });
          if ((await summaryToggle.getAttribute("aria-expanded")) !== "true") {
            await summaryToggle.click();
          }
        }

        const changeDelivery = page.getByTestId("button-change-delivery");
        await expect(changeDelivery).toBeVisible({ timeout: 15_000 });
        await changeDelivery.click();

        const midnightSlot = page.getByTestId(`slot-${MIDNIGHT_LABEL}`);
        await expect(midnightSlot).toBeVisible();
        await expect(midnightSlot).toBeEnabled();
        await midnightSlot.click();

        const banner = page.getByTestId("midnight-delivery-banner");
        await expect(banner).toContainText(EXPECTED_BANNER);
        await expect(banner).toContainText(NEXT_DATE_LABEL);

        const confirm = page.getByTestId("button-picker-confirm");
        await expect(confirm).toBeEnabled();
        await confirm.click();
        await expect(banner).not.toBeVisible();

        await expect
          .poll(() =>
            page.evaluate(() =>
              window.localStorage.getItem("presentail_delivery_selection_v1"),
            ),
          )
          .toContain(`"date":"${TODAY_ISO}"`);
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.localStorage.getItem("presentail_delivery_selection_v1"),
            ),
          )
          .toContain('"slotId":"os-midnight-boundary"');
      });
    });
  }
});
