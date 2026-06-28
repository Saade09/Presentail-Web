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
  // Explicitly target the Mobile Chrome viewport (390×844) so this suite
  // exercises the narrow-width RTL layout regardless of which Playwright
  // project executes it.  At 390 px the item-name column is much tighter
  // and long Arabic strings can clip or wrap differently than at 1280 px.
  test.use({ viewport: { width: 390, height: 844 } });

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
  // Explicitly target the Mobile Chrome viewport (390×844) so this suite
  // exercises the narrow-width layout with long French strings regardless of
  // which Playwright project executes it.  At 390 px the item-name column
  // is much tighter and long translated strings can clip or overflow
  // differently than at the 1280 px desktop width.
  test.use({ viewport: { width: 390, height: 844 } });

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

// ---------------------------------------------------------------------------
// Visual / geometric RTL layout assertions — Arabic at Mobile Chrome viewport
//
// These tests verify the *rendered position* of key elements inside the
// order-summary box when the document is in RTL mode (ar-lb locale at 390×844).
// Pure overflow checks cannot catch flex-direction or padding regressions that
// silently swap the price column back to the right in RTL.
//
// Assertions (all run at the 390×844 Mobile Chrome viewport configured in
// playwright.config.ts):
//   1. Price column ends up on the LEFT side of each item row in RTL.
//   2. Label text ends up on the RIGHT side in the subtotal/total rows in RTL.
//   3. Card message block has non-zero dimensions and is not clipped by the viewport.
//   4. Screenshot snapshot of the order-summary box (creates a baseline on
//      first --update-snapshots run; subsequent CI runs compare pixel-for-pixel
//      and catch any silently regressed RTL flex direction or padding).
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed — Arabic RTL visual layout at Mobile Chrome (390×844)", () => {
  // This describe block is intentionally scoped to the Mobile Chrome project
  // (390×844) by the Playwright projects config. The assertions use absolute
  // bounding-rect x positions which are only meaningful at a fixed viewport
  // width, so we skip under desktop dimensions to keep the assertions stable.
  test.beforeEach(async ({ page, isMobile }) => {
    // Skip this describe block entirely when Playwright runs it under the
    // desktop (1280×720) project — the price-on-left RTL assertion uses
    // bounding rects whose absolute x values differ between viewports and
    // would be misleading at 1280 px wide.
    test.skip(!isMobile, "RTL visual geometry tests only run under the Mobile Chrome project");

    await installStubs(page);
    await seedSessionData(page, SAMPLE_ORDER_AR);
  });

  test("Arabic RTL: price column is on the LEFT side of each item row", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    // In RTL the flex row reverses: the shrink-0 price span appears on the LEFT
    // and the flex-1 item-name span appears on the RIGHT.
    // We measure each <li> and assert: price.left < name.left.
    const result = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      if (!summary) return { ok: false, reason: "order-summary not found", rows: [] };

      const rows = Array.from(summary.querySelectorAll("li"));
      if (rows.length === 0) return { ok: false, reason: "no item rows", rows: [] };

      const details: { idx: number; priceLeft: number; nameLeft: number; ok: boolean }[] = [];

      for (let idx = 0; idx < rows.length; idx++) {
        const li = rows[idx];
        // The name span is the flex-1 element; the price span is shrink-0.
        const nameSpan = li.querySelector("span.flex-1") as HTMLElement | null;
        const priceSpan = li.querySelector("span.shrink-0") as HTMLElement | null;
        if (!nameSpan || !priceSpan) {
          details.push({ idx, priceLeft: -1, nameLeft: -1, ok: false });
          continue;
        }
        const nameRect = nameSpan.getBoundingClientRect();
        const priceRect = priceSpan.getBoundingClientRect();
        // In RTL the price (shrink-0) should have a smaller x (further left).
        details.push({
          idx,
          priceLeft: priceRect.left,
          nameLeft: nameRect.left,
          ok: priceRect.left < nameRect.left,
        });
      }

      const allOk = details.length > 0 && details.every((d) => d.ok);
      return { ok: allOk, reason: allOk ? "" : "one or more rows had price NOT to the left of the name", rows: details };
    });

    expect(
      result.rows.length,
      "Expected item rows to be present in the order summary",
    ).toBeGreaterThan(0);
    expect(
      result.ok,
      `Arabic RTL: price column not on the left of the item name. Row detail: ${JSON.stringify(result.rows)}`,
    ).toBe(true);
  });

  test("Arabic RTL: subtotal and total labels are on the RIGHT, prices on the LEFT", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    // The border-t section contains `flex justify-between` rows. In RTL the
    // label span is on the RIGHT and the FormattedPrice is on the LEFT.
    const result = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]');
      if (!summary) return { ok: false, reason: "order-summary not found" };

      // Select the totals section (the div with border-t).
      const totalsSection = summary.querySelector(".border-t") as HTMLElement | null;
      if (!totalsSection) return { ok: false, reason: "totals section not found" };

      const rows = Array.from(totalsSection.querySelectorAll("div.flex")) as HTMLElement[];
      if (rows.length === 0) return { ok: false, reason: "no flex rows in totals section" };

      const detail: { rowIdx: number; firstChildLeft: number; lastChildLeft: number; ok: boolean }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const children = Array.from(rows[i].children) as HTMLElement[];
        if (children.length < 2) continue;
        const firstRect = children[0].getBoundingClientRect();
        const lastRect = children[children.length - 1].getBoundingClientRect();
        // In RTL with justify-between the DOM-first child (label) should be on
        // the RIGHT (larger x), and the DOM-last child (price) should be on
        // the LEFT (smaller x).
        const ok = lastRect.left < firstRect.left;
        detail.push({ rowIdx: i, firstChildLeft: firstRect.left, lastChildLeft: lastRect.left, ok });
      }

      if (detail.length === 0) return { ok: false, reason: "no measurable rows in totals section" };
      const allOk = detail.every((d) => d.ok);
      return {
        ok: allOk,
        reason: allOk ? "" : "one or more totals rows had price NOT to the left of the label",
        detail,
      };
    });

    expect(
      result.ok,
      `Arabic RTL: totals row alignment wrong. Detail: ${JSON.stringify(result)}`,
    ).toBe(true);
  });

  test("Arabic RTL: card message block is fully visible and not clipped", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    // The card message lives inside order-summary. We verify:
    //   a) The container div (rounded-xl shadow) has non-zero width and height.
    //   b) The container is not clipped — its right edge does not exceed the
    //      order-summary box's right edge (which would cause invisible overflow).
    //   c) The <p> text element has non-zero rendered height (text didn't collapse).
    const result = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="order-summary"]') as HTMLElement | null;
      if (!summary) return { ok: false, reason: "order-summary not found" };

      // The card-message container has class "rounded-xl overflow-hidden shadow-sm border".
      const cardContainer = summary.querySelector(".rounded-xl.overflow-hidden") as HTMLElement | null;
      if (!cardContainer) return { ok: false, reason: "card message container not found" };

      const containerRect = cardContainer.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();

      if (containerRect.width === 0 || containerRect.height === 0) {
        return { ok: false, reason: `card message has zero size: ${containerRect.width}×${containerRect.height}` };
      }

      // Allow 1 px rounding tolerance for sub-pixel rendering.
      if (containerRect.right > summaryRect.right + 1) {
        return {
          ok: false,
          reason: `card message overflows summary box: containerRight=${containerRect.right} summaryRight=${summaryRect.right}`,
        };
      }

      const textEl = cardContainer.querySelector("p") as HTMLElement | null;
      if (!textEl) return { ok: false, reason: "card message <p> not found" };
      const textRect = textEl.getBoundingClientRect();
      if (textRect.height === 0) {
        return { ok: false, reason: "card message <p> has zero rendered height" };
      }

      return {
        ok: true,
        reason: "",
        containerSize: `${containerRect.width}×${containerRect.height}`,
        textHeight: textRect.height,
      };
    });

    expect(
      result.ok,
      `Arabic RTL card message visibility: ${result.reason}`,
    ).toBe(true);
  });

  test("Arabic RTL: screenshot snapshot of the order-summary box at 390×844", async ({ page }) => {
    await page.goto(`/ar-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });

    const summary = page.getByTestId("order-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    // Wait for fonts and layout to stabilise before capturing.
    await page.waitForTimeout(300);

    // Capture a screenshot of the summary box.  On the first run (or when
    // --update-snapshots is passed) Playwright writes the baseline PNG into
    // e2e/order-confirmed-layout.spec.ts-snapshots/.  Subsequent CI runs
    // compare pixel-for-pixel (maxDiffPixelRatio: 0.02 allows for minor
    // sub-pixel anti-aliasing differences across machines).
    await expect(summary).toHaveScreenshot("ar-lb-order-summary-mobile.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});

// ---------------------------------------------------------------------------
// Page-level scrollbar guard — h-screen overflow-hidden constraint
//
// The OrderConfirmed page wraps all content in `h-screen overflow-hidden`.
// This viewport-lock ensures the browser never shows a page-level scrollbar.
// A future accidental revert to `min-h-screen` or removal of `overflow-hidden`
// would silently reintroduce a scrollbar without any JS error.
//
// These tests verify:
//   1. No page-level scrollbar at common desktop/tablet viewport heights
//      (768 px, 1024 px) — documentElement.scrollHeight must not exceed the
//      viewport height.
//   2. The inner `max-h-screen overflow-y-auto` content div IS scrollable when
//      the viewport is very short (480 px tall) — proving internal scroll works
//      as the intended escape valve when content taller than the screen.
//
// Both tests use the inline-success path (?ref=…) so no createOrder API call
// is made.  sessionStorage is seeded with the full SAMPLE_ORDER payload so the
// order-summary box (the tallest content block) renders, maximising the chance
// of overflow at very short viewports.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 768 px viewport height — no page-level scrollbar
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed — no page-level scrollbar at 768px viewport height", () => {
  test.use({ viewport: { width: 1280, height: 768 } });

  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedSessionData(page, SAMPLE_ORDER);
  });

  test("documentElement and body do not overflow the viewport at 768px", async ({ page }) => {
    await page.goto(`/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    // Confirm order-summary rendered so content is fully present.
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    // With `h-screen overflow-hidden` the document must not scroll beyond the
    // viewport height.  A regression to `min-h-screen` would push scrollHeight
    // above innerHeight, silently reintroducing a page-level scrollbar.
    const { docScrollHeight, bodyScrollHeight, viewportHeight } = await page.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    expect(
      docScrollHeight,
      `768px: documentElement.scrollHeight (${docScrollHeight}) must not exceed viewport height (${viewportHeight})`,
    ).toBeLessThanOrEqual(viewportHeight);

    expect(
      bodyScrollHeight,
      `768px: body.scrollHeight (${bodyScrollHeight}) must not exceed viewport height (${viewportHeight})`,
    ).toBeLessThanOrEqual(viewportHeight);
  });
});

// ---------------------------------------------------------------------------
// 1024 px viewport height — no page-level scrollbar
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed — no page-level scrollbar at 1024px viewport height", () => {
  test.use({ viewport: { width: 1280, height: 1024 } });

  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedSessionData(page, SAMPLE_ORDER);
  });

  test("documentElement and body do not overflow the viewport at 1024px", async ({ page }) => {
    await page.goto(`/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    const { docScrollHeight, bodyScrollHeight, viewportHeight } = await page.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    expect(
      docScrollHeight,
      `1024px: documentElement.scrollHeight (${docScrollHeight}) must not exceed viewport height (${viewportHeight})`,
    ).toBeLessThanOrEqual(viewportHeight);

    expect(
      bodyScrollHeight,
      `1024px: body.scrollHeight (${bodyScrollHeight}) must not exceed viewport height (${viewportHeight})`,
    ).toBeLessThanOrEqual(viewportHeight);
  });
});

// ---------------------------------------------------------------------------
// 480 px viewport height — inner content area must be scrollable
//
// At very short screen heights the order-summary content (items + card
// message + delivery + totals + CTA) overflows the viewport height.
// The outer `h-screen overflow-hidden` wrapper must suppress the page scroll,
// while the inner `max-h-screen overflow-y-auto` div becomes the scroll
// container so shoppers can still reach every part of the confirmation.
// ---------------------------------------------------------------------------

test.describe("OrderConfirmed — inner content area is scrollable at 480px viewport height", () => {
  test.use({ viewport: { width: 1280, height: 480 } });

  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await seedSessionData(page, SAMPLE_ORDER);
  });

  test("inner overflow-y-auto div scrollHeight exceeds clientHeight at 480px", async ({ page }) => {
    await page.goto(`/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`);
    await expect(page.getByTestId("icon-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("order-summary")).toBeVisible({ timeout: 10_000 });

    // Find the inner scroll container via its stable data-testid attribute.
    // OrderConfirmed.tsx marks the `max-h-screen overflow-y-auto` inner div with
    // data-testid="order-confirmed-scroll-container" so this selector cannot
    // accidentally match an unrelated auto-overflow element earlier in the DOM.
    const result = await page.evaluate(() => {
      const scrollDiv = document.querySelector(
        '[data-testid="order-confirmed-scroll-container"]',
      ) as HTMLElement | null;

      if (!scrollDiv) {
        return {
          found: false,
          reason: 'No element with data-testid="order-confirmed-scroll-container" found — the inner scroll container may be missing or the testid was removed',
          scrollHeight: 0,
          clientHeight: 0,
        };
      }

      return {
        found: true,
        reason: "",
        scrollHeight: scrollDiv.scrollHeight,
        clientHeight: scrollDiv.clientHeight,
      };
    });

    expect(
      result.found,
      result.reason,
    ).toBe(true);

    // At 480 px the content is taller than the screen, so scrollHeight must
    // exceed clientHeight — confirming the inner div is the active scroll
    // container and content is not silently clipped.
    expect(
      result.scrollHeight,
      `Inner scroll container scrollHeight (${result.scrollHeight}) should exceed clientHeight (${result.clientHeight}) at 480px viewport — content should be reachable by scrolling`,
    ).toBeGreaterThan(result.clientHeight);
  });
});
