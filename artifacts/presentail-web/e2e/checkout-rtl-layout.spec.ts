/**
 * E2e test: Checkout page — Arabic RTL price-alignment geometry
 *
 * Verifies that in the ar-lb locale (RTL document direction) the checkout
 * order-summary sidebar renders its flex rows in the correct RTL order:
 *
 *   1. Cart item rows: the text+price column is on the LEFT; the thumbnail
 *      image is on the RIGHT (flex row reversal from dir="rtl").
 *   2. Order total row: the price is on the LEFT; the "Total" label is on
 *      the RIGHT (justify-between + RTL reversal).
 *
 * All assertions use getBoundingClientRect() comparisons — no pixel snapshots.
 * Tests run only under the Mobile Chrome project (390×844) because the summary
 * sidebar is collapsed on mobile by default (the desktop breakpoint always
 * shows it via `lg:block`), and the absolute x positions are only stable at a
 * fixed viewport width.
 *
 * A silent regression — e.g. a reverted dir="rtl" or a Tailwind purge that
 * removes justify-between — would shift prices back to the right without any
 * visible JavaScript error, making this the only automated guard.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Cart item seeded into localStorage — mirrors CartContext.tsx shape.
// ---------------------------------------------------------------------------

const CART_ITEM = {
  product: {
    id: "rose-bouquet",
    name: "باقة الورود الكلاسيكية",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const CART_ITEM_2 = {
  product: {
    id: "chocolate-box",
    name: "صندوق الشوكولاتة الفاخر",
    slug: "chocolate-box",
    priceValue: 30,
    image: { uri: "" },
    category: null,
  },
  quantity: 2,
};

const STUB_PRODUCT = {
  id: "rose-bouquet",
  name: "باقة الورود الكلاسيكية",
  slug: "rose-bouquet",
  priceValue: 65,
  image: { uri: "" },
  category: "flowers",
  description: "",
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

// ---------------------------------------------------------------------------
// API stubs — minimal, just enough for the page shell to render without errors.
// ---------------------------------------------------------------------------

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({
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
        ],
        fallbackCode: "USD",
        countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
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

// ---------------------------------------------------------------------------
// Seed cart + location into localStorage before any page load.
// ---------------------------------------------------------------------------

async function seedCart(page: Page): Promise<void> {
  await page.addInitScript(
    ({ cart, location }) => {
      window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(location),
      );
      window.localStorage.setItem(
        "presentail_location_v1",
        JSON.stringify(location),
      );
    },
    { cart: [CART_ITEM, CART_ITEM_2], location: LOCATION },
  );
}

// ---------------------------------------------------------------------------
// Helper: open the summary panel on mobile (it starts collapsed, summaryOpen=false).
// On desktop (lg:block) it is always visible and clicking the toggle would
// close it — but this suite only runs under isMobile, so we always open it.
// ---------------------------------------------------------------------------

async function openSummaryPanel(page: Page): Promise<void> {
  const toggle = page.getByTestId("button-summary-toggle");
  // Only click if the panel is currently collapsed (aria-expanded="false").
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  // Wait for at least one item price to be visible before asserting geometry.
  await expect(page.getByTestId(`checkout-item-price-${CART_ITEM.product.id}`)).toBeVisible({
    timeout: 8_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Checkout order summary — Arabic RTL price-alignment at Mobile Chrome (390×844)", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    // These geometric assertions are only meaningful at the fixed 390px mobile
    // viewport.  The desktop layout always shows the summary sidebar via
    // lg:block without needing the toggle, and absolute x values differ at
    // 1280px, so we skip under the desktop project.
    test.skip(!isMobile, "RTL geometric assertions only run under the Mobile Chrome project");

    await installStubs(page);
    await seedCart(page);
  });

  // -------------------------------------------------------------------------
  // Test 1: document is in RTL mode
  // -------------------------------------------------------------------------

  test("Arabic: <html> has dir=rtl", async ({ page }) => {
    await page.goto("/ar-lb/beirut/checkout?guest=1");
    await openSummaryPanel(page);

    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, "Expected <html dir='rtl'> in ar-lb locale").toBe("rtl");
  });

  // -------------------------------------------------------------------------
  // Test 2: cart item prices are on the LEFT in RTL
  //
  // Each item row is: `div.flex.gap-3[data-testid="row-summary-{id}"]`
  //   child 0: `div.shrink-0` — thumbnail image (moves to the RIGHT in RTL)
  //   child 1: `div.flex-1`   — text + price column (stays on the LEFT in RTL)
  //
  // Assertion: priceElement.right < imageElement.left
  //   i.e. the price is completely to the left of the image, confirming the
  //   flex row reversed correctly under dir="rtl".
  // -------------------------------------------------------------------------

  test("Arabic RTL: cart item price column is to the LEFT of the thumbnail image", async ({ page }) => {
    await page.goto("/ar-lb/beirut/checkout?guest=1");
    await openSummaryPanel(page);

    const result = await page.evaluate(
      ({ itemIds }) => {
        const details: {
          id: string;
          priceRight: number;
          imageLeft: number;
          ok: boolean;
          reason: string;
        }[] = [];

        for (const id of itemIds) {
          const row = document.querySelector(`[data-testid="row-summary-${id}"]`);
          if (!row) {
            details.push({ id, priceRight: -1, imageLeft: -1, ok: false, reason: "row not found" });
            continue;
          }
          // The image div is the first child (shrink-0), text+price is the second (flex-1).
          const imageDiv = row.querySelector(".shrink-0") as HTMLElement | null;
          const priceEl = document.querySelector(`[data-testid="checkout-item-price-${id}"]`) as HTMLElement | null;

          if (!imageDiv || !priceEl) {
            details.push({ id, priceRight: -1, imageLeft: -1, ok: false, reason: "imageDiv or priceEl not found" });
            continue;
          }

          const priceRect = priceEl.getBoundingClientRect();
          const imageRect = imageDiv.getBoundingClientRect();

          // In RTL the flex row reverses: image goes to the right, price to the left.
          // We allow a 2px tolerance for sub-pixel rounding.
          const ok = priceRect.right < imageRect.left + 2;
          details.push({
            id,
            priceRight: Math.round(priceRect.right),
            imageLeft: Math.round(imageRect.left),
            ok,
            reason: ok ? "" : `price.right (${Math.round(priceRect.right)}) is NOT less than image.left (${Math.round(imageRect.left)})`,
          });
        }

        const allOk = details.length > 0 && details.every((d) => d.ok);
        return { ok: allOk, details };
      },
      { itemIds: [CART_ITEM.product.id, CART_ITEM_2.product.id] },
    );

    expect(
      result.details.length,
      "Expected at least one item row in the checkout summary",
    ).toBeGreaterThan(0);
    expect(
      result.ok,
      `Arabic RTL: price column not on the left of the thumbnail. Detail: ${JSON.stringify(result.details)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: order total price is to the LEFT of the "Total" label in RTL
  //
  // The total row is: `div.flex.justify-between`
  //   child 0: label <span> — "Total" text (moves to the RIGHT in RTL)
  //   child 1: price <span data-testid="text-total"> (moves to the LEFT in RTL)
  //
  // Assertion: priceSpan.left < labelSpan.left
  //   i.e. the price starts at a smaller x than the label, confirming that
  //   justify-between + dir="rtl" correctly flipped the row.
  // -------------------------------------------------------------------------

  test("Arabic RTL: order total price is to the LEFT of the 'Total' label", async ({ page }) => {
    await page.goto("/ar-lb/beirut/checkout?guest=1");
    await openSummaryPanel(page);

    const result = await page.evaluate(() => {
      const priceEl = document.querySelector('[data-testid="text-total"]') as HTMLElement | null;
      if (!priceEl) return { ok: false, reason: "text-total not found", priceLeft: -1, labelLeft: -1 };

      // The label span is the first sibling inside the same flex row.
      const totalRow = priceEl.parentElement as HTMLElement | null;
      if (!totalRow) return { ok: false, reason: "total row parent not found", priceLeft: -1, labelLeft: -1 };

      const children = Array.from(totalRow.children) as HTMLElement[];
      // The label is the first DOM child; the price is the last.
      const labelEl = children[0];
      const priceSpan = children[children.length - 1];

      if (!labelEl || !priceSpan) return { ok: false, reason: "label or price child not found", priceLeft: -1, labelLeft: -1 };

      const labelRect = labelEl.getBoundingClientRect();
      const priceRect = priceSpan.getBoundingClientRect();

      // In RTL with justify-between: the DOM-first child (label) is on the RIGHT
      // and the DOM-last child (price) is on the LEFT.
      // Allow 2px tolerance for sub-pixel rounding.
      const ok = priceRect.left < labelRect.left - 2;
      return {
        ok,
        reason: ok ? "" : `price.left (${Math.round(priceRect.left)}) is NOT less than label.left (${Math.round(labelRect.left)})`,
        priceLeft: Math.round(priceRect.left),
        labelLeft: Math.round(labelRect.left),
      };
    });

    expect(
      result.ok,
      `Arabic RTL: total price not on the left of the 'Total' label. Detail: ${JSON.stringify(result)}`,
    ).toBe(true);
  });
});
