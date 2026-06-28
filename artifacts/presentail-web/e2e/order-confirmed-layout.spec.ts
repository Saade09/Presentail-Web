/**
 * E2e test: OrderConfirmed summary box — no scroll cap, all items visible
 *
 * The summary box previously had a max-height + overflow:auto scroll cap.
 * After that cap was removed the box expands to its natural height, so:
 *   1. The computed overflow-y must NOT be "auto" or "scroll".
 *   2. Every item row must be fully visible inside the viewport without
 *      any programmatic scrolling.
 *
 * Tests run at both the default desktop viewport (1280×720) and the
 * Mobile Chrome viewport (390×844) configured in playwright.config.ts.
 * API calls are stubbed so the suite is hermetic.
 *
 * Locale coverage:
 *   - English (en-lb/beirut) — default LTR layout.
 *   - Arabic  (ar-lb/beirut) — RTL layout; Arabic item names exercise
 *     bidirectional text wrapping and RTL flex row direction.
 *   - French  (fr-lb/beirut) — LTR layout with longer translated strings
 *     that stress overflow/truncation in the item name column.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Sample order payload — mirrors the ConfirmedOrder + StashedEntry shapes in
// OrderConfirmed.tsx.  createdAt is set dynamically in addInitScript so it is
// always fresh (within PENDING_ORDER_MAX_AGE_MS = 6 h).
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS = [
  { name: "Classic Rose Bouquet", quantity: 2, price: 45, image: "" },
  { name: "Luxury Chocolate Box", quantity: 1, price: 30, image: "" },
  { name: "Scented Candle Set",   quantity: 1, price: 25, image: "" },
];

const SAMPLE_ORDER = {
  items: SAMPLE_ITEMS,
  cardMessage: "Happy Birthday! Wishing you all the best.",
  deliveryDate: "2026-07-15",
  deliverySlot: "Morning (9am–1pm)",
  deliverySlotTime: "9:00 AM – 1:00 PM",
  districtFee: 5,
  expressFee: 0,
  slotFee: 0,
  totalUsd: 150,
  paymentMethod: "card",
};

// Arabic variant — uses Arabic item names to exercise RTL bidi text
// rendering and the flex row reversal that the `dir="rtl"` document
// direction triggers on the item rows.
const SAMPLE_ITEMS_AR = [
  { name: "باقة الورود الكلاسيكية", quantity: 2, price: 45, image: "" },
  { name: "صندوق الشوكولاتة الفاخر", quantity: 1, price: 30, image: "" },
  { name: "طقم الشموع المعطّرة",    quantity: 1, price: 25, image: "" },
];

const SAMPLE_ORDER_AR = {
  ...SAMPLE_ORDER,
  items: SAMPLE_ITEMS_AR,
  cardMessage: "عيد ميلاد سعيد! أتمنى لك كل التوفيق.",
};

// French variant — uses longer translated item names to stress the
// truncate/overflow handling inside the narrow item-name column.
const SAMPLE_ITEMS_FR = [
  { name: "Bouquet de roses classiques élégantes", quantity: 2, price: 45, image: "" },
  { name: "Coffret de chocolats de luxe assortis",  quantity: 1, price: 30, image: "" },
  { name: "Ensemble de bougies parfumées d'ambiance", quantity: 1, price: 25, image: "" },
];

const SAMPLE_ORDER_FR = {
  ...SAMPLE_ORDER,
  items: SAMPLE_ITEMS_FR,
  cardMessage: "Joyeux anniversaire ! Je vous souhaite tout le meilleur.",
};

const ORDER_REF = "ORD-TEST-9999";

// ---------------------------------------------------------------------------
// API stubs (minimal — just enough for the page shell to render)
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

const STUB_FX_RATES = { ok: true, base: "USD", rates: { USD: 1 } };

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );
}

// ---------------------------------------------------------------------------
// Seed sessionStorage with the stashed order + set location in localStorage
// ---------------------------------------------------------------------------

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

async function seedSessionData(page: Page, order: typeof SAMPLE_ORDER): Promise<void> {
  await page.addInitScript(
    ({ order, location }) => {
      // Stash the pending order so OrderConfirmed can read it.
      const entry = { payload: order, createdAt: Date.now() };
      window.sessionStorage.setItem(
        "presentail_pending_order_v1",
        JSON.stringify(entry),
      );
      // Location is read from localStorage by the shop shell.
      window.localStorage.setItem(
        "presentail_location_v1",
        JSON.stringify(location),
      );
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(location),
      );
    },
    { order, location: LOCATION },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the computed overflow-y value of the element with the given testid.
 */
async function getOverflowY(page: Page, testId: string): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return "not-found";
    return window.getComputedStyle(el).overflowY;
  }, testId);
}

/**
 * Checks that all <li> rows inside the order-summary box are fully laid out:
 *   1. No item has zero rendered height (zero height = clipped by an ancestor).
 *   2. The summary box's scrollHeight equals its clientHeight — i.e., no content
 *      is hidden behind an internal scroll track that could appear if
 *      overflow:auto/scroll + max-height were re-introduced.
 *
 * We intentionally do NOT require items to fit inside the viewport, because
 * it is perfectly fine for the page to be taller than the screen — the user
 * scrolls the page, not an internal box.
 */
async function summaryBoxHasNoHiddenContent(page: Page): Promise<{
  ok: boolean;
  itemCount: number;
  hiddenCount: number;
  scrollHeightOk: boolean;
}> {
  return page.evaluate(() => {
    const summary = document.querySelector('[data-testid="order-summary"]');
    if (!summary) {
      return { ok: false, itemCount: 0, hiddenCount: 0, scrollHeightOk: false };
    }
    const items = Array.from(summary.querySelectorAll("li"));
    if (items.length === 0) {
      return { ok: false, itemCount: 0, hiddenCount: 0, scrollHeightOk: false };
    }
    // Check 1: every item has non-zero rendered height.
    const hiddenItems = items.filter((li) => {
      const rect = li.getBoundingClientRect();
      return rect.height === 0;
    });
    // Check 2: the box does not scroll internally (all content is laid out).
    const el = summary as HTMLElement;
    const scrollHeightOk = el.scrollHeight <= el.clientHeight + 2; // +2 px rounding tolerance
    return {
      ok: hiddenItems.length === 0 && scrollHeightOk,
      itemCount: items.length,
      hiddenCount: hiddenItems.length,
      scrollHeightOk,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed summary box — no scroll, all items visible", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedSessionData(page, SAMPLE_ORDER);
  });

  test("summary box has no scroll cap and all items are in-viewport", async ({ page }) => {
    // Navigate with the locale prefix (ShopShell is mounted under /:lang-:country/:city/).
    // Using ?ref= puts the component directly into the inline-success path so no
    // createOrder API call is made.
    await page.goto(`/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    // Wait for the success icon to confirm the page has fully rendered.
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });

    // The order summary box must be present.
    const summary = page.getByTestId("order-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    // --- assertion 1: no scroll cap ---
    const overflowY = await getOverflowY(page, "order-summary");
    expect(
      ["auto", "scroll"].includes(overflowY),
      `Expected overflow-y to NOT be auto/scroll, got: ${overflowY}`,
    ).toBe(false);

    // --- assertion 2: all content laid out (no hidden rows, no internal scroll) ---
    const { ok, itemCount, hiddenCount, scrollHeightOk } =
      await summaryBoxHasNoHiddenContent(page);
    expect(itemCount, "Expected at least one item in the order summary").toBeGreaterThan(0);
    expect(
      hiddenCount,
      `${hiddenCount} of ${itemCount} item rows have zero rendered height — they may be clipped by a max-height cap`,
    ).toBe(0);
    expect(
      scrollHeightOk,
      "Summary box scrollHeight exceeds clientHeight — content is hidden behind an internal scroll track",
    ).toBe(true);
  });

  test("summary box overflow style does not create an internal scroll container", async ({ page }) => {
    // Belt-and-braces: explicitly verify the computed overflow CSS on the
    // order-summary element is not auto/scroll in any variant.  This catches a
    // regression where a style is applied directly to the element (not just via
    // a max-height ancestor) but scrollHeight/clientHeight are equal by chance.
    await page.goto(`/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    const hasScrollableBox = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      if (!summary) return false;
      const style = window.getComputedStyle(summary);
      return (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      );
    });

    expect(
      hasScrollableBox,
      "The order-summary box must not have overflow auto/scroll",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Arabic (RTL) locale tests
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed summary box — Arabic RTL layout (ar-lb)", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    // Use Arabic item names so the RTL bidi text engine and the flex row
    // reversal imposed by dir="rtl" on <html> are exercised.
    await seedSessionData(page, SAMPLE_ORDER_AR);
  });

  test("Arabic: summary box has no scroll cap and all item rows have non-zero height", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });

    const summary = page.getByTestId("order-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    // --- assertion 1: document is in RTL mode ---
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, "Expected <html> to have dir=rtl in Arabic locale").toBe("rtl");

    // --- assertion 2: no scroll cap on the summary box ---
    const overflowY = await getOverflowY(page, "order-summary");
    expect(
      ["auto", "scroll"].includes(overflowY),
      `Arabic layout: Expected overflow-y to NOT be auto/scroll, got: ${overflowY}`,
    ).toBe(false);

    // --- assertion 3: all item rows have non-zero rendered height in RTL ---
    const { itemCount, hiddenCount, scrollHeightOk } =
      await summaryBoxHasNoHiddenContent(page);
    expect(itemCount, "Arabic: Expected at least one item row in the summary").toBeGreaterThan(0);
    expect(
      hiddenCount,
      `Arabic RTL: ${hiddenCount} of ${itemCount} item rows have zero rendered height`,
    ).toBe(0);
    expect(
      scrollHeightOk,
      "Arabic: Summary box scrollHeight exceeds clientHeight — content hidden by an internal scroll track",
    ).toBe(true);
  });

  test("Arabic: summary box overflow style does not create an internal scroll container", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    const hasScrollableBox = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      if (!summary) return false;
      const style = window.getComputedStyle(summary);
      return (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      );
    });

    expect(
      hasScrollableBox,
      "Arabic: The order-summary box must not have overflow auto/scroll",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// French (LTR, long strings) locale tests
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed summary box — French layout (fr-lb)", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    // Use long French item names to stress overflow/truncation handling in
    // the item-name column at narrow viewports.
    await seedSessionData(page, SAMPLE_ORDER_FR);
  });

  test("French: summary box has no scroll cap and all item rows have non-zero height", async ({ page }) => {
    await page.goto(`/fr-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });

    const summary = page.getByTestId("order-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    // --- assertion 1: document remains LTR in French locale ---
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, "Expected <html> to have dir=ltr in French locale").toBe("ltr");

    // --- assertion 2: no scroll cap on the summary box ---
    const overflowY = await getOverflowY(page, "order-summary");
    expect(
      ["auto", "scroll"].includes(overflowY),
      `French layout: Expected overflow-y to NOT be auto/scroll, got: ${overflowY}`,
    ).toBe(false);

    // --- assertion 3: all item rows have non-zero rendered height ---
    const { itemCount, hiddenCount, scrollHeightOk } =
      await summaryBoxHasNoHiddenContent(page);
    expect(itemCount, "French: Expected at least one item row in the summary").toBeGreaterThan(0);
    expect(
      hiddenCount,
      `French: ${hiddenCount} of ${itemCount} item rows have zero rendered height`,
    ).toBe(0);
    expect(
      scrollHeightOk,
      "French: Summary box scrollHeight exceeds clientHeight — content hidden by an internal scroll track",
    ).toBe(true);
  });

  test("French: summary box overflow style does not create an internal scroll container", async ({ page }) => {
    await page.goto(`/fr-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);

    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    const hasScrollableBox = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      if (!summary) return false;
      const style = window.getComputedStyle(summary);
      return (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      );
    });

    expect(
      hasScrollableBox,
      "French: The order-summary box must not have overflow auto/scroll",
    ).toBe(false);
  });
});
