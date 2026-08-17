/**
 * E2E test: web checkout Stripe card flow (post bundle-split)
 *
 * The Vite `manualChunks` change moved `@stripe/react-stripe-js` and
 * `@stripe/stripe-js` into a separate on-demand `vendor-stripe` chunk that is
 * only fetched when the shopper picks a Stripe-backed payment method. The unit
 * tests mock Stripe entirely, so they would not catch a runtime regression
 * where the lazy chunk is built but fails to load / serve, or the React.lazy
 * boundary suspends forever.
 *
 * This test exercises the real happy path end-to-end:
 *   1. Reach the checkout page with a cart item and fill step 1.
 *   2. Continue to the payment step and select "Credit Card" (a Stripe-backed
 *      method) — this is what triggers the dynamic import of the vendor-stripe
 *      chunk and mounts the lazy StripeCheckoutSection.
 *   3. Assert the Stripe card-number iframe actually renders (proves the chunk
 *      loaded, Stripe.js initialised, and Elements mounted) and that the
 *      "Stripe not configured" fallback is NOT shown.
 *   4. Assert no uncaught JS error fired while loading the lazy chunk.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CART_ITEM = {
  product: {
    id: "test-rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

// Lebanon → USD, the currency in which the "card" (Stripe) method is supported.
const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** A valid Lebanese mobile number in E.164 format. */
const VALID_LB_PHONE = "+96170000000";

// ---------------------------------------------------------------------------
// API stubs — keep the page hermetic. Stripe.js itself (js.stripe.com) is
// intentionally NOT stubbed: loading it for real is the whole point of the
// test (it confirms the lazy chunk + Stripe init works end-to-end).
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
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );
  // Silence the geo lookup so currency stays USD/LB.
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currency: "USD" }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Checkout — Stripe card fields render after bundle split", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
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

  test("selecting Credit Card loads the vendor-stripe chunk and mounts the card iframe", async ({
    page,
  }) => {
    // Collect uncaught JS errors so a failed dynamic import / suspended lazy
    // boundary surfaces as a hard failure rather than a silent blank section.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // `?guest=1` pre-acknowledges the guest path so the sign-in dialog never
    // mounts (mirrors how the cart's "Checkout as Guest" button navigates here).
    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Belt-and-braces: dismiss the login dialog if it still appears.
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // ── Step 1 · recipient + sender details ──────────────────────────────────
    const recipientFirstName = page.getByTestId("input-recipient-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    // Skip the address so we don't need to pick a district.
    await page.getByTestId("check-no-address").click();

    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);

    // Guest sender details.
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("test@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    // ── Continue to the payment step ─────────────────────────────────────────
    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // ── Step 2 · select the Stripe-backed "card" method ──────────────────────
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    // ── Assert the Stripe card-number iframe rendered ────────────────────────
    // Stripe Elements mount each field inside an iframe titled e.g. "Secure
    // card number input frame". Its presence proves: the vendor-stripe chunk
    // loaded, Stripe.js initialised with a valid publishable key, and the
    // <Elements>/<CardNumberElement> tree mounted.
    const cardNumberFrame = page.locator(
      'iframe[title*="card number" i], iframe[name^="__privateStripeFrame"]',
    );
    await expect(cardNumberFrame.first()).toBeVisible({ timeout: 20_000 });

    // The "Stripe not configured" fallback must NOT be shown — that would mean
    // Stripe failed to initialise (null stripe instance).
    await expect(page.getByTestId("stripe-card-error")).toHaveCount(0);

    // No uncaught JS error should have fired while loading the lazy chunk.
    expect(
      pageErrors,
      `unexpected page errors: ${pageErrors.join(" | ")}`,
    ).toEqual([]);
  });
});
