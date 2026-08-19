import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PATH = "/en-lb/beirut/late-night-flower-delivery";
const ATTRIBUTION_KEY = "@presentail/attribution_v1";
const DELIVERY_KEY = "presentail_delivery_selection_v1";

const products = [
  ["midnight-roses", "Midnight Red Roses", "25-red-roses-arrangement.webp", 95, 85],
  ["ivory-roses", "Ivory Rose Arrangement", "25-white-roses-arrangement.webp", 105, null],
  ["plum-roses", "Plum Rose Arrangement", "50-purple-roses-arrangement.webp", 125, 115],
  ["fierce-love", "Fierce Love Bouquet", "fierce-love.webp", 89, null],
].map(([id, name, file, priceValue, discountPriceValue], index) => ({
  id,
  name,
  price: `$${priceValue}`,
  priceValue,
  discountPriceValue,
  discountPriceAed: null,
  image: { uri: `/catalog/products/${file}` },
  images: [{ uri: `/catalog/products/${file}` }],
  inStock: true,
  isBestSeller: index === 0,
  popularity: 10 - index,
}));

const luxuryProducts = [
  {
    id: "luxury-red-heart",
    name: "Luxury Red Heart Roses",
    price: "$175",
    priceValue: 175,
    discountPriceValue: null,
    discountPriceAed: null,
    image: { uri: "/catalog/products/large-red-heart-box.webp" },
    images: [{ uri: "/catalog/products/large-red-heart-box.webp" }],
    inStock: true,
    isBestSeller: true,
    popularity: 9,
  },
];

function response(status: "tonight" | "next-available") {
  const common = {
    campaignKey: "campaign-beirut-late-night",
    status,
    reason: status === "tonight" ? "eligible" : "after-cutoff",
    timeZone: "Asia/Beirut",
    evaluatedAt: "2026-08-19T20:29:00.000Z",
    quoteExpiresAt: "2099-08-19T20:30:00.000Z",
    nominalCutoffAt: "2026-08-19T20:30:00.000Z",
    sourceFreshness: {
      locationsStatus: "live",
      productRefreshedAt: "2026-08-19T20:28:00.000Z",
      operationsConfigVerified: true,
    },
    availableTonight: {
      title: "Available Tonight",
      subtitle: "Fresh flowers ready for late-night delivery in Beirut",
      viewAllHref: "/category/flowers",
      products,
    },
    luxury: {
      title: "Late-Night Luxury Arrangements",
      subtitle: "Statement flowers for unforgettable last-minute moments",
      viewAllHref: "/category/lux-arrangements",
      products: luxuryProducts,
    },
  };
  return status === "tonight"
    ? {
        ...common,
        cutoffLabel: "11:30 PM",
        effectiveCutoffAt: "2026-08-19T20:30:00.000Z",
        deliveryWindow: {
          date: "2026-08-19",
          label: "11:00 PM – 1:00 AM",
          slotId: "beirut-late",
        },
      }
    : {
        ...common,
        effectiveCutoffAt: "2026-08-19T20:30:00.000Z",
        nextAvailableWindow: {
          date: "2026-08-20",
          label: "9:00 AM – 1:00 PM",
          slotId: "beirut-next",
        },
      };
}

async function prepare(page: Page, status: "tonight" | "next-available") {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
    );
  });
  await page.route("**/api/campaign/beirut-late-night", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(response(status)),
    }),
  );
  await page.route("**/api/web-events", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"ok":true}' }),
  );
  await page.route("**/api/analytics/events", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"ok":true}' }),
  );
}

test.describe("Beirut late-night paid landing", () => {
  test("before cutoff renders exact approved promise and persists its slot", async ({
    page,
  }) => {
    await prepare(page, "tonight");
    await page.goto(
      `${PATH}?gclid=E2E_LATE&utm_source=google&utm_medium=cpc&utm_campaign=beirut-late-night`,
    );

    await expect(page.getByTestId("late-night-status-pill")).toHaveText(
      "Delivering late tonight · Order by 11:30 PM Beirut time",
    );
    await expect(page.getByTestId("late-night-headline")).toHaveText(
      "Late-night flower delivery in Beirut",
    );
    await expect(page.getByTestId("late-night-support-copy")).toHaveText(
      "Last-minute doesn’t have to feel last-minute. Choose from fresh arrangements available now for delivery tonight in Beirut.",
    );
    await expect(page.getByTestId("late-night-hero-cta")).toHaveText(
      "Shop flowers available tonight",
    );
    await expect(page.getByTestId("late-night-support-link")).toHaveText(
      "Need help choosing? Chat with a support agent",
    );
    await expect(page.getByText("No address needed", { exact: true })).toBeVisible();
    await expect(page.getByText("Live order tracking", { exact: true })).toBeVisible();
    await expect(page.getByTestId("late-night-card-midnight-roses")).toBeVisible();
    await expect(page.getByTestId("late-night-card-fierce-love")).toBeVisible();
    await expect(page.getByText(/90[- ]minute/i)).toHaveCount(0);

    await page.getByTestId("late-night-hero-cta").click();
    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), DELIVERY_KEY),
      )
      .toContain('"slotId":"beirut-late"');

    const attribution = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ATTRIBUTION_KEY,
    );
    expect(attribution).toContain("E2E_LATE");
    expect(attribution).toContain("beirut-late-night");

    const violations = await new AxeBuilder({ page })
      .include('[data-testid="late-night-page"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      violations.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("after cutoff removes tonight claims and persists the next slot", async ({
    page,
  }) => {
    await prepare(page, "next-available");
    await page.goto(PATH);

    await expect(page.getByTestId("late-night-status-pill")).toContainText(
      "Next delivery:",
    );
    await expect(page.getByTestId("late-night-status-pill")).toContainText(
      "9:00 AM – 1:00 PM",
    );
    await expect(page.getByTestId("late-night-hero-cta")).toHaveText(
      "Shop flowers for the next window",
    );
    await expect(page.getByRole("heading", { name: "Available for the Next Window" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Luxury Arrangements" })).toBeVisible();
    await expect(page.getByTestId("late-night-page")).not.toContainText(
      "Available tonight",
    );
    await expect(page.getByTestId("late-night-page")).not.toContainText(
      "Order by 11:30 PM",
    );

    await page.getByTestId("late-night-hero-cta").click();
    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), DELIVERY_KEY),
      )
      .toContain('"slotId":"beirut-next"');
  });
});