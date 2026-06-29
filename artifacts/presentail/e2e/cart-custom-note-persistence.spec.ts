/**
 * E2E tests: mobile CartContext personalisation note (customNote) persistence
 *
 * The mobile CartContext stores cart items — including customNote — in
 * AsyncStorage (backed by localStorage in the Expo web build). This suite
 * verifies that the customNote:
 *
 * 1. Survives a full page reload (AsyncStorage round-trip through the
 *    CartProvider's load-on-mount / save-on-change effects).
 * 2. Appears as the pre-filled value in the FullCartView TextInput after the
 *    cart is hydrated from storage.
 *
 * The tests use the same "probe + skip" pattern as checkout.spec.ts — if the
 * Expo dev server isn't reachable the suite is skipped cleanly.
 *
 * API calls are intercepted so no real backend is required.
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CART_STORAGE_KEY = "@presentail/cart-v1";

// A product ID that does NOT need to exist in the static catalog — we mock the
// WooProducts API to return it with hasInputField:true so the FullCartView note
// input renders.
const PRODUCT_ID = "test-personalized-bloom";
const CUSTOM_NOTE = "For Emma";

// The English placeholder on the personalisation TextInput in FullCartView.
// Used as a locator target since the TextInput renders as <input> in the
// Expo web build and exposes its placeholder attribute to the DOM.
const NOTE_PLACEHOLDER = "e.g. Happy Birthday, Anna!";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

const STUB_PRODUCTS = [
  {
    id: PRODUCT_ID,
    wcId: 101,
    name: "Personalized Bloom",
    price: "$65",
    priceValue: 65,
    image: { uri: "" },
    images: [],
    category: "flowers",
    description: "",
    tag: null,
    occasions: [],
    popularity: 0,
    inStock: true,
    hasInputField: true,
    discountPriceValue: null,
    discountPriceAed: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Mobile CartContext — personalisation note persistence", () => {
  test.beforeEach(async ({ page }) => {
    // Probe the dev server — skip if it isn't up.
    const probe = await page
      .goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => null);
    test.skip(
      !probe || !probe.ok(),
      "Presentail mobile app is not reachable on baseURL — start the dev server first.",
    );

    // Stub the WooProducts endpoint so the product with hasInputField:true is
    // visible to the cart without a real backend.
    await page.route(/\/api\/woo\/products(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, products: STUB_PRODUCTS }),
      }),
    );

    // Stub other API calls that may fire on load.
    await page.route(/\/api\/currencies(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          currencies: [
            { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 2 },
          ],
          fallbackCode: "USD",
          countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
        }),
      }),
    );
    await page.route(/\/api\/fx\/rates(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }),
      }),
    );
    await page.route(/\/api\/geo\/.*/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ countryCode: "LB", currency: "USD" }),
      }),
    );
    await page.route(/\/api\/delivery-locations(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          locations: [
            {
              id: "lb-beirut",
              name: "Beirut",
              countryCode: "LB",
              currency: "USD",
              districts: [{ name: "Beirut Central", deliveryFeeUsd: 0 }],
              expressAvailable: false,
              timeSlots: [
                { label: "10:00–14:00", cutoffHour: 8 },
                { label: "14:00–18:00", cutoffHour: 12 },
              ],
            },
          ],
        }),
      }),
    );
  });

  test("customNote seeded in AsyncStorage is shown in the cart after hydration", async ({
    page,
  }) => {
    // Seed the cart with a product + customNote before the page loads.
    // AsyncStorage in the Expo web build maps to window.localStorage with the
    // key stored as-is.
    await page.evaluate(
      ({ key, items }) => {
        try {
          window.localStorage.setItem(key, JSON.stringify(items));
        } catch { /* ignore */ }
      },
      {
        key: CART_STORAGE_KEY,
        items: [{ productId: PRODUCT_ID, qty: 1, customNote: CUSTOM_NOTE }],
      },
    );

    // Navigate to the cart tab.
    await page.goto("/cart");

    // Wait for the personalisation TextInput to appear.
    // In the Expo web build, TextInput renders as <input>. We target it by
    // its placeholder attribute (language-stable for the EN locale).
    const noteInput = page.getByPlaceholder(NOTE_PLACEHOLDER);
    await expect(noteInput).toBeVisible({ timeout: 15_000 });

    // The CartContext should have loaded the customNote from AsyncStorage.
    await expect(noteInput).toHaveValue(CUSTOM_NOTE);
  });

  test("customNote survives a page reload (AsyncStorage round-trip)", async ({
    page,
  }) => {
    await page.evaluate(
      ({ key, items }) => {
        try {
          window.localStorage.setItem(key, JSON.stringify(items));
        } catch { /* ignore */ }
      },
      {
        key: CART_STORAGE_KEY,
        items: [{ productId: PRODUCT_ID, qty: 1, customNote: CUSTOM_NOTE }],
      },
    );

    await page.goto("/cart");

    const noteInput = page.getByPlaceholder(NOTE_PLACEHOLDER);
    await expect(noteInput).toBeVisible({ timeout: 15_000 });
    await expect(noteInput).toHaveValue(CUSTOM_NOTE);

    // Reload without clearing localStorage.
    await page.reload({ waitUntil: "domcontentloaded" });

    // After reload the CartProvider re-reads AsyncStorage. The customNote
    // must survive the round-trip through the save-on-change effect and the
    // load-on-mount effect.
    const noteInputAfterReload = page.getByPlaceholder(NOTE_PLACEHOLDER);
    await expect(noteInputAfterReload).toBeVisible({ timeout: 15_000 });
    await expect(noteInputAfterReload).toHaveValue(CUSTOM_NOTE);
  });

  test("typing a note and navigating away preserves it in AsyncStorage", async ({
    page,
  }) => {
    // Seed the cart without a note — the user will type it via the UI.
    await page.evaluate(
      ({ key, items }) => {
        try {
          window.localStorage.setItem(key, JSON.stringify(items));
        } catch { /* ignore */ }
      },
      {
        key: CART_STORAGE_KEY,
        items: [{ productId: PRODUCT_ID, qty: 1 }],
      },
    );

    await page.goto("/cart");

    const noteInput = page.getByPlaceholder(NOTE_PLACEHOLDER);
    await expect(noteInput).toBeVisible({ timeout: 15_000 });
    await expect(noteInput).toHaveValue("");

    // Type the note via the UI (mirrors what a shopper does).
    await noteInput.fill(CUSTOM_NOTE);
    await expect(noteInput).toHaveValue(CUSTOM_NOTE);

    // Give the CartContext setCustomNote → setItems → AsyncStorage.setItem
    // effect time to flush.
    await page.waitForTimeout(500);

    // Read back from AsyncStorage (localStorage) and assert the note is stored.
    const stored = await page.evaluate(
      ({ key }) => window.localStorage.getItem(key),
      { key: CART_STORAGE_KEY },
    );
    expect(stored).not.toBeNull();
    const parsed: Array<{ productId: string; qty: number; customNote?: string }> =
      JSON.parse(stored!);
    const item = parsed.find((i) => i.productId === PRODUCT_ID);
    expect(item).toBeDefined();
    expect(item?.customNote).toBe(CUSTOM_NOTE);
  });
});
