/**
 * Cyprus company details must remain visible on both the normal footer and
 * checkout shell, including the mobile layout where the global footer is
 * intentionally omitted.
 */

import { test, expect, type Page } from "@playwright/test";

const YEAR = new Date().getFullYear();
const LEGAL_LINE =
  `All rights reserved © ${YEAR} Presentail Ltd — Registration number HE422991 — Registered in the Republic of Cyprus. Agapinoros & Arch. Makariou III, 2 IRIS TOWER, 4th Floor, Flat.Office 403-405 1076, Nicosia, Cyprus. hello@presentail.com`;

const CY_LOCATION = { countryCode: "CY", cityId: "cy-nicosia" };
const LB_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

const CART_ITEM = {
  product: {
    id: "cyprus-footer-test-product",
    name: "Cyprus footer test bouquet",
    slug: "cyprus-footer-test-bouquet",
    priceValue: 65,
    wcId: 0,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

async function installLocationStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currencies: [
          {
            code: "EUR",
            name: "Euro",
            symbol: "€",
            symbolPosition: "left",
            spaceBetween: false,
            decimals: 2,
          },
        ],
        fallbackCode: "EUR",
        countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
      }),
    }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1, EUR: 1 } }),
    }),
  );
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "CY", currency: "EUR" }),
    }),
  );
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        locations: [
          {
            id: "cy-nicosia",
            name: "Nicosia",
            countryCode: "CY",
            currency: "EUR",
            districts: [{ name: "Nicosia Central", deliveryFeeUsd: 0 }],
            expressAvailable: false,
            timeSlots: [{ label: "10:00–14:00", cutoffHour: 8 }],
          },
        ],
      }),
    }),
  );
}

async function seedLocation(
  page: Page,
  location: { countryCode: string; cityId: string },
  includeCart = false,
): Promise<void> {
  await page.addInitScript(
    ({ location, cart }) => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(location),
      );
      window.localStorage.setItem(
        "presentail_location_v1",
        JSON.stringify(location),
      );
      if (cart) {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      }
    },
    { location, cart: includeCart ? [CART_ITEM] : null },
  );
}

test.describe("Cyprus company footer details", () => {
  test("homepage exposes the complete legal line", async ({ page }) => {
    await installLocationStubs(page);
    await seedLocation(page, CY_LOCATION);
    await page.goto("/en-cy/nicosia");

    const legalDetails = page.getByTestId("cyprus-company-details");
    await expect(legalDetails).toBeVisible({ timeout: 15_000 });
    await expect(legalDetails).toHaveText(LEGAL_LINE);
    await expect(legalDetails).not.toHaveClass(/hidden|sr-only/);
  });

  test("checkout exposes the complete legal line even without the global footer", async ({
    page,
  }) => {
    await installLocationStubs(page);
    await seedLocation(page, CY_LOCATION, true);
    await page.goto("/en-cy/nicosia/checkout?guest=1");

    const legalDetails = page.getByTestId("cyprus-company-details");
    await expect(legalDetails).toBeVisible({ timeout: 15_000 });
    await expect(legalDetails).toHaveText(LEGAL_LINE);
    await expect(page.getByTestId("footer")).toHaveCount(0);
  });

  test("cart keeps the complete legal line when the global footer is compacted", async ({
    page,
  }) => {
    await installLocationStubs(page);
    await seedLocation(page, CY_LOCATION);
    await page.goto("/en-cy/nicosia/cart");

    const legalDetails = page.getByTestId("cyprus-company-details");
    await expect(legalDetails).toBeVisible({ timeout: 15_000 });
    await expect(legalDetails).toHaveText(LEGAL_LINE);
  });

  test("Lebanon does not receive the Cyprus registration line", async ({ page }) => {
    await installLocationStubs(page);
    await seedLocation(page, LB_LOCATION);
    await page.goto("/en-lb/beirut");

    await expect(page.getByTestId("footer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("cyprus-company-details")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("HE422991");
  });
});