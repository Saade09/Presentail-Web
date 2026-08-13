/**
 * Screenshot capture for the desktop checkout Delivery Details redesign.
 *
 * Captures the four required pricing states at a desktop viewport:
 *   1. paid standard   — city fee > 0, scheduled delivery
 *   2. paid express    — city fee > 0 + express upgrade
 *   3. free standard   — free-delivery threshold met, scheduled delivery
 *   4. free + express  — free standard delivery with express upgrade selected
 *
 * All API calls are stubbed (same pattern as checkout-full-flow.spec.ts) so
 * fees / thresholds are deterministic.
 */

import { test, expect, type Page } from "@playwright/test";

const CART_ITEM = {
  product: {
    id: "test-rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    wcId: 0,
    image: { uri: "" },
    category: null,
  },
  quantity: 2,
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

const STUB_CURRENCIES = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 2 },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

function deliveryLocations(opts: { fee: number; freeThreshold?: number }) {
  return {
    countries: [
      {
        id: "lb",
        name: "Lebanon",
        code: "LB",
        flag: "🇱🇧",
        currency: "USD",
        isActive: true,
        freeDeliveryEnabled: opts.freeThreshold != null,
        ...(opts.freeThreshold != null ? { freeDeliveryThresholdUsd: opts.freeThreshold } : {}),
        cities: [
          {
            id: "lb-beirut",
            name: "Beirut",
            isActive: true,
            fee: opts.fee,
            expressAvailable: true,
            timeSlots: [
              { label: "10:00 AM – 2:00 PM", startHour: 10, endHour: 14, cutoffHour: 20 },
              { label: "2:00 PM – 6:00 PM", startHour: 14, endHour: 18, cutoffHour: 21 },
            ],
            ...(opts.freeThreshold != null
              ? { freeDeliveryThresholdUsd: opts.freeThreshold, freeDeliveryEnabled: true }
              : {}),
          },
        ],
      },
    ],
  };
}

async function installStubs(page: Page, opts: { fee: number; freeThreshold?: number }) {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }));
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }) }));
  await page.route("**/api/geo/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currency: "USD" }) }));
  await page.route("**/api/delivery-locations**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deliveryLocations(opts)) }));
  await page.route("**/api/loyalty/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, loyalty: { points: 0, coupons: [] } }) }));
  await page.route("**/api/web-events", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
}

async function openCheckout(page: Page, mode: "express" | "schedule", lang: "en" | "ar" = "en") {
  await page.addInitScript(
    ({ cart, location, mode }) => {
      window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
      const today = new Date().toISOString().slice(0, 10);
      window.localStorage.setItem(
        "presentail_delivery_selection_v1",
        JSON.stringify(
          mode === "express"
            ? { mode: "express", date: today, slotLabel: null, slotId: null }
            : { mode: "schedule", date: today, slotLabel: "2:00 PM – 6:00 PM", slotId: null },
        ),
      );
    },
    { cart: [CART_ITEM], location: LOCATION, mode },
  );
  await page.goto(`/${lang}-lb/beirut/checkout?guest=1`);
  const guestBtn = page.getByTestId("button-checkout-as-guest");
  if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await guestBtn.click();
  }
  await expect(page.getByTestId("text-total").last()).toBeVisible();
  await expect(page.getByTestId("delivery-confirmation-panel")).toBeVisible();
  // Let fonts/prices settle
  await page.waitForTimeout(600);
}

test.use({ viewport: { width: 1440, height: 1400 } });

// Express delivery is only offered 8 AM – 10 PM Beirut time; outside that
// window the checkout auto-downgrades to schedule and the express states
// cannot render. Skip (not fail) the express captures then.
const beirutHour = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hour: "numeric", hour12: false }).format(new Date()),
);
const expressWindowOpen = beirutHour >= 8 && beirutHour < 21;

test.describe("Desktop checkout redesign — screenshots", () => {
  test("paid standard", async ({ page }) => {
    await installStubs(page, { fee: 8 });
    await openCheckout(page, "schedule");
    await page.screenshot({ path: "screenshots/checkout-paid-standard.png", fullPage: false });
  });

  test("paid express", async ({ page }) => {
    test.skip(!expressWindowOpen, "outside express delivery window (Beirut time)");
    await installStubs(page, { fee: 8 });
    await openCheckout(page, "express");
    await expect(page.getByTestId("row-express-fee").last()).toBeVisible();
    await page.screenshot({ path: "screenshots/checkout-paid-express.png", fullPage: false });
  });

  test("free standard", async ({ page }) => {
    await installStubs(page, { fee: 8, freeThreshold: 50 });
    await openCheckout(page, "schedule");
    await expect(page.getByTestId("text-delivery-free")).toBeVisible();
    await page.screenshot({ path: "screenshots/checkout-free-standard.png", fullPage: false });
  });

  test("free standard plus express", async ({ page }) => {
    test.skip(!expressWindowOpen, "outside express delivery window (Beirut time)");
    await installStubs(page, { fee: 8, freeThreshold: 50 });
    await openCheckout(page, "express");
    await expect(page.getByTestId("row-express-fee").last()).toBeVisible();
    await page.screenshot({ path: "screenshots/checkout-free-express.png", fullPage: false });
  });

  test("arabic RTL paid express", async ({ page }) => {
    test.skip(!expressWindowOpen, "outside express delivery window (Beirut time)");
    await installStubs(page, { fee: 8 });
    await openCheckout(page, "express", "ar");
    await page.screenshot({ path: "screenshots/checkout-ar-rtl-express.png", fullPage: false });
  });
});
