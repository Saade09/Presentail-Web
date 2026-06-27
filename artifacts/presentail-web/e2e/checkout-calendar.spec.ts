/**
 * E2e test: checkout calendar date-picker → order summary
 *
 * Verifies that a shopper can:
 *   1. Reach the checkout page with a cart item
 *   2. Switch to "Scheduled" delivery mode
 *   3. Open the CalendarPopover via the calendar toggle chip
 *   4. Pick a future date from the next month
 *   5. See the synthetic chip appear for that date in the strip
 *   6. See the delivery-date row in the order summary reflect the chosen date
 */

import { test, expect, type Page } from "@playwright/test";

// A minimal cart payload stored in localStorage so the checkout page has
// something to render. Cart key and structure match CartContext.tsx.
const CART_ITEM = {
  product: {
    id: "rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const STUB_PRODUCT = {
  id: "rose-bouquet",
  name: "Rose Bouquet",
  slug: "rose-bouquet",
  priceValue: 65,
  image: { uri: "https://example.com/rose.jpg" },
  category: "flowers",
  description: "A beautiful rose bouquet",
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Install route stubs so API calls resolve quickly and don't block rendering. */
async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currencies: [{ code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 2 }],
        fallbackCode: "USD",
        countryToCurrency: { LB: "USD" },
      }),
    }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }),
    }),
  );
  await page.route("**/api/woo/products**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [STUB_PRODUCT] }),
    }),
  );
}

test.describe("Checkout — calendar date picker", () => {
  test.beforeEach(async ({ page }) => {
    // Install stubs before any page load so API calls resolve immediately,
    // ensuring the guest-login prompt appears well within its detection window.
    await installStubs(page);

    // Seed cart and location into localStorage before any page load.
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
  });

  test("picks a calendar date and confirms the order summary updates", async ({
    page,
  }) => {
    // Navigate with ?guest=1 so the checkout page sets guestAcked=true
    // immediately from the URL param — the login gate never appears,
    // regardless of how long the auth check takes to resolve.
    await page.goto("/checkout?guest=1");

    // Switch to "Scheduled" delivery mode by testId (avoids locale/text variance).
    const scheduleBtn = page.getByTestId("delivery-mode-schedule");
    await expect(scheduleBtn.first()).toBeVisible({ timeout: 10_000 });
    await scheduleBtn.first().click();

    // The ScheduleInlinePanel should now be visible.
    const panel = page.getByTestId("schedule-inline-panel");
    await expect(panel).toBeVisible();

    // Open the CalendarPopover.
    const calToggle = page.getByTestId("schedule-calendar-toggle");
    await expect(calToggle).toBeVisible();
    await calToggle.click();

    const calPopover = page.getByTestId("calendar-popover");
    await expect(calPopover).toBeVisible();

    // Navigate one month forward so we're guaranteed to be past the 3-day strip.
    await page.getByLabel("Next month").click();

    // Pick the 15th of the displayed month if it is not disabled; otherwise
    // pick the first non-disabled day button in the calendar.
    const today = new Date();
    const targetYear =
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    const targetMonth =
      today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const targetIso = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-15`;

    const day15Btn = page.getByTestId(`cal-day-${targetIso}`);
    const day15Enabled =
      (await day15Btn.count()) > 0 &&
      !(await day15Btn.getAttribute("disabled").catch(() => "disabled"));

    let chosenIso: string;
    if (day15Enabled) {
      await day15Btn.click();
      chosenIso = targetIso;
    } else {
      // Fall back to the first non-disabled day in the current calendar view.
      const anyEnabledDay = calPopover
        .locator("button[data-testid^='cal-day-']:not([disabled])")
        .first();
      const testId = await anyEnabledDay.getAttribute("data-testid");
      chosenIso = testId!.replace("cal-day-", "");
      await anyEnabledDay.click();
    }

    // After picking, the popover should close automatically.
    await expect(calPopover).not.toBeVisible();

    // A synthetic chip for the chosen date should appear in the date strip.
    const syntheticChip = page.getByTestId(`schedule-day-${chosenIso}`);
    await expect(syntheticChip).toBeVisible();

    // The order summary's delivery-date row should mention the chosen date.
    // formatDeliveryRow produces e.g. "Mon 15 · 2:00 PM – 6:00 PM".
    // We verify it contains the numeric day-of-month from chosenIso.
    const dayOfMonth = String(parseInt(chosenIso.slice(8), 10)); // strip leading zero
    const deliveryDateRow = page.getByTestId("delivery-date-row");
    await expect(deliveryDateRow).toBeVisible();
    await expect(deliveryDateRow).toContainText(dayOfMonth);
  });
});
