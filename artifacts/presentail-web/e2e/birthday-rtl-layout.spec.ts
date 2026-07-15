/**
 * BirthdayRecipientTabs — Arabic RTL layout test
 *
 * Verifies that when the birthday occasion page is visited in the Arabic locale
 * (/ar-lb/beirut/occasion/birthday) the recipient filter chips and contextual
 * h1 heading render correctly under RTL layout:
 *
 *   1. The chip container has dir="rtl".
 *   2. The "Everyone" chip is the first tab and shows the Arabic label "الجميع".
 *   3. Selecting a recipient (Mom) updates the h1 to the Arabic contextual
 *      heading "هدايا عيد الميلاد لـ الأم".
 *   4. The trailing-edge fade mask is on the LEFT edge (has `left-0` class,
 *      not `right-0`) — confirming the RTL branch in BirthdayRecipientTabs.
 *
 * A silent regression — e.g. a reverted `dir={dir}` prop, a missing `ar`
 * translation key, or an accidentally swapped RTL/LTR fade-mask branch —
 * would break any of the four assertions below without any visible JS error.
 *
 * API calls are stubbed so the suite runs in CI without a live OS API key.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Minimal product matching the birthday occasion — keeps the product grid
 *  non-empty so BirthdayRecipientTabs actually renders. */
const STUB_PRODUCT = {
  id: "e2e-bday-bouquet-1",
  name: "E2E Birthday Rose Bouquet",
  slug: "e2e-birthday-rose-bouquet",
  priceValue: 60,
  image: { uri: "https://example.com/rose.jpg" },
  category: "hand-bouquets",
  categories: ["hand-bouquets"],
  occasions: ["birthday"],
  brandNames: [],
  description: "A beautiful rose bouquet for e2e testing.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [STUB_PRODUCT] }),
    }),
  );
  await page.route(/\/api\/catalog\/metadata/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        categories: [
          { id: "hand-bouquets", name: "Hand Bouquets", icon: "flower" },
        ],
        occasions: [{ id: "birthday", name: "Birthday", icon: "cake" }],
        brands: [],
      }),
    }),
  );
}

async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("BirthdayRecipientTabs — Arabic RTL layout (/ar-lb/beirut/occasion/birthday)", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedLocation(page);
  });

  // -------------------------------------------------------------------------
  // Test 1: chip container reports dir="rtl"
  // -------------------------------------------------------------------------

  test("chip container has dir=rtl in Arabic locale", async ({ page }) => {
    await page.goto("/ar-lb/beirut/occasion/birthday");

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist, "BirthdayRecipientTabs tablist must be visible").toBeVisible({
      timeout: 15_000,
    });

    await expect(
      tablist,
      "tablist must have dir=rtl in Arabic locale",
    ).toHaveAttribute("dir", "rtl");
  });

  // -------------------------------------------------------------------------
  // Test 2: first chip is the "Everyone" tab with Arabic label "الجميع"
  // -------------------------------------------------------------------------

  test("first chip is Everyone and shows Arabic label الجميع", async ({ page }) => {
    await page.goto("/ar-lb/beirut/occasion/birthday");

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    // The "all" chip must carry the Arabic translation.
    const allTab = page.getByTestId("birthday-tab-all");
    await expect(allTab, "'all' chip must be visible").toBeVisible();
    await expect(
      allTab,
      "'all' chip must show Arabic label الجميع",
    ).toHaveText("الجميع");

    // It must also be the DOM-first button inside the tablist so that the
    // chip order matches RTL reading order (العربية starts from the right).
    const firstButton = tablist.locator("button").first();
    await expect(
      firstButton,
      "first button in tablist must be the 'all' chip",
    ).toHaveAttribute("data-testid", "birthday-tab-all");
  });

  // -------------------------------------------------------------------------
  // Test 3: selecting Mom updates h1 to the Arabic contextual heading
  // -------------------------------------------------------------------------

  test("selecting Mom updates h1 to Arabic contextual heading هدايا عيد الميلاد لـ الأم", async ({
    page,
  }) => {
    await page.goto("/ar-lb/beirut/occasion/birthday");

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    // Click the Mom chip.
    const momTab = page.getByTestId("birthday-tab-mom");
    await expect(momTab, "Mom chip must be visible").toBeVisible();
    await momTab.click();

    // The h1 must update to the Arabic interpolated heading.
    const h1 = page.getByTestId("text-shop-title");
    await expect(
      h1,
      "h1 must show Arabic contextual heading after selecting Mom",
    ).toContainText("هدايا عيد الميلاد لـ الأم");
  });

  // -------------------------------------------------------------------------
  // Test 4: fade mask is on the LEFT edge in RTL (left-0 class, not right-0)
  //
  // BirthdayRecipientTabs renders a trailing-edge fade overlay as a sibling
  // of the tablist div. In LTR the mask sits on the right (right-0,
  // bg-gradient-to-l); in RTL it flips to the left (left-0, bg-gradient-to-r).
  // Asserting the class directly proves the RTL branch is taken without
  // needing a pixel snapshot.
  // -------------------------------------------------------------------------

  test("fade mask has left-0 class (left edge) in Arabic RTL layout", async ({ page }) => {
    await page.goto("/ar-lb/beirut/occasion/birthday");

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    // The fade mask is the aria-hidden general sibling of the tablist inside
    // the relative wrapper: `[role="tablist"] ~ [aria-hidden="true"]`.
    const fadeMask = page.locator('[role="tablist"] ~ [aria-hidden="true"]');
    await expect(fadeMask, "fade mask element must exist").toBeAttached();

    // RTL branch: mask must have left-0 (sits on the left edge).
    await expect(
      fadeMask,
      "fade mask must have left-0 class in RTL (mask sits on the left edge)",
    ).toHaveClass(/\bleft-0\b/);

    // Also confirm the LTR class is absent — a regression that reverts to
    // right-0 would still pass the left-0 check if both classes were present.
    const className = (await fadeMask.getAttribute("class")) ?? "";
    expect(
      className,
      "fade mask must NOT have right-0 class in RTL layout",
    ).not.toMatch(/\bright-0\b/);
  });
});
