import { test, expect } from "@playwright/test";

type Market = {
  cityId: "ae-dubai" | "ae-abu-dhabi" | "lb-beirut";
  citySlug: "dubai" | "abu-dhabi" | "beirut";
  countryCode: "AE" | "LB";
};

const UAE_CAMPAIGN_MARKETS: Market[] = [
  { cityId: "ae-dubai", citySlug: "dubai", countryCode: "AE" },
  { cityId: "ae-abu-dhabi", citySlug: "abu-dhabi", countryCode: "AE" },
];

async function seedLocation(
  page: import("@playwright/test").Page,
  market: Market,
) {
  await page.addInitScript((location) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(location),
    );
  }, market);
}

test.describe("UAE flower-delivery campaign header", () => {
  for (const market of UAE_CAMPAIGN_MARKETS) {
    const cityBase = `/en-ae/${market.citySlug}`;
    const campaignPath = `${cityBase}/flower-delivery`;

    test(`${market.citySlug} restores the shared desktop header without losing campaign chrome`, async (
      { page },
      testInfo,
    ) => {
      test.skip(testInfo.project.name !== "chromium", "Desktop-only navigation check");
      await seedLocation(page, market);
      await page.goto(campaignPath);

      await expect(page.getByTestId("button-country-selector")).toBeVisible();
      await expect(page.getByTestId("nav-trigger-flowers")).toBeVisible();
      await expect(page.getByTestId("button-search")).toBeVisible();
      await expect(page.getByTestId("button-account")).toBeVisible();
      await expect(page.getByTestId("button-cart")).toBeVisible();

      await page.getByTestId("nav-trigger-flowers").hover();
      const flowerBoxes = page.getByTestId("megamenu-item-flower-boxes");
      await expect(flowerBoxes).toBeVisible();
      await expect(flowerBoxes).toHaveAttribute(
        "href",
        `${cityBase}/category/flower-boxes`,
      );

      await expect(page.getByTestId("text-campaign-headline")).toBeVisible();
      await expect(page.getByTestId("footer-landing")).toBeAttached();
    });

    test(`${market.citySlug} opens and closes the shared mobile menu without covering campaign content`, async (
      { page },
      testInfo,
    ) => {
      test.skip(testInfo.project.name !== "Mobile Chrome", "Mobile-only navigation check");
      await seedLocation(page, market);
      await page.goto(campaignPath);

      await expect(page.getByTestId("button-country-selector")).toBeVisible();
      await expect(page.getByTestId("button-mobile-menu")).toBeVisible();
      await expect(page.getByTestId("text-campaign-headline")).toBeVisible();
      await expect(page.getByTestId("footer-landing")).toBeAttached();

      await page.getByTestId("button-mobile-menu").click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText("Explore Presentail", { exact: true })).toBeVisible();

      await sheet.getByRole("button", { name: "Flowers & Plants" }).click();
      const flowersPanel = page.getByTestId("mobile-sub-panel-flowers");
      await expect(flowersPanel).toBeVisible();
      await expect(
        flowersPanel.getByRole("link", { name: "Flower Boxes" }),
      ).toHaveAttribute("href", `${cityBase}/category/flower-boxes`);

      await sheet.getByRole("button", { name: "Close menu" }).last().click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId("text-campaign-headline")).toBeVisible();
    });
  }
});

test.describe("shared storefront header keeps Beirut links city-scoped", () => {
  const beirut: Market = {
    cityId: "lb-beirut",
    citySlug: "beirut",
    countryCode: "LB",
  };
  const cityBase = "/en-lb/beirut";

  test("desktop mega-menu links stay localized to Beirut", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop-only navigation check");
    await seedLocation(page, beirut);
    await page.goto(`${cityBase}/shop`);

    await page.getByTestId("nav-trigger-flowers").hover();
    await expect(page.getByTestId("megamenu-item-flower-boxes")).toHaveAttribute(
      "href",
      `${cityBase}/category/flower-boxes`,
    );
  });

  test("mobile hamburger links stay localized to Beirut", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Mobile Chrome", "Mobile-only navigation check");
    await seedLocation(page, beirut);
    await page.goto(`${cityBase}/shop`);

    await page.getByTestId("button-mobile-menu").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Flowers & Plants" }).click();
    await expect(
      page
        .getByTestId("mobile-sub-panel-flowers")
        .getByRole("link", { name: "Flower Boxes" }),
    ).toHaveAttribute("href", `${cityBase}/category/flower-boxes`);
    await sheet.getByRole("button", { name: "Close menu" }).last().click();
    await expect(sheet).toBeHidden();
  });
});