/**
 * E2E: Lebanon checkout — Stripe card fields render for every display currency.
 *
 * After the fix that routes the Stripe account by DELIVERY COUNTRY (not display
 * currency), a Lebanon shopper choosing AED, EUR, GBP, or any other display
 * currency must still:
 *   1. Load the main (Lebanon) Stripe publishable key — NOT the Gulf key.
 *   2. See the Stripe card-number iframe render successfully.
 *   3. NOT see the "Stripe not configured" fallback.
 *   4. Produce no uncaught JS errors.
 *
 * This test runs the same checkout flow as `checkout-stripe-card-fields.spec.ts`
 * but parametrises over all display currencies Presentail Lebanon supports.
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

/** Lebanon delivery — countryCode never changes across currency variants. */
const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** Valid Lebanese mobile in E.164 format. */
const VALID_LB_PHONE = "+96170000000";

/**
 * All display currencies supported by Presentail (see displayCurrencyStorage.ts
 * SUPPORTED_CODES). Lebanon always uses the MAIN Stripe account, so every
 * currency here should initialise Stripe and render the card iframe.
 */
const CURRENCIES = [
  { code: "USD", symbol: "$",   symbolPosition: "left",  spaceBetween: false, decimals: 2, rate: 1     },
  { code: "AED", symbol: "AED", symbolPosition: "right", spaceBetween: true,  decimals: 2, rate: 3.67  },
  { code: "EUR", symbol: "€",   symbolPosition: "left",  spaceBetween: false, decimals: 2, rate: 0.92  },
  { code: "GBP", symbol: "£",   symbolPosition: "left",  spaceBetween: false, decimals: 2, rate: 0.79  },
  { code: "CAD", symbol: "CA$", symbolPosition: "left",  spaceBetween: false, decimals: 2, rate: 1.36  },
  { code: "AUD", symbol: "A$",  symbolPosition: "left",  spaceBetween: false, decimals: 2, rate: 1.53  },
  { code: "QAR", symbol: "QAR", symbolPosition: "right", spaceBetween: true,  decimals: 2, rate: 3.64  },
  { code: "SAR", symbol: "SAR", symbolPosition: "right", spaceBetween: true,  decimals: 2, rate: 3.75  },
  { code: "CHF", symbol: "CHF", symbolPosition: "right", spaceBetween: true,  decimals: 2, rate: 0.90  },
] as const;

// localStorage key for the persistent manual currency override (see displayCurrencyStorage.ts).
const MANUAL_CURRENCY_PERSISTENT_KEY = "presentail_display_currency_manual_persistent_v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCurrenciesStub(currencyCode: string, currencyMeta: typeof CURRENCIES[number]) {
  return {
    currencies: [
      {
        code: currencyCode,
        name: currencyCode,
        symbol: currencyMeta.symbol,
        symbolPosition: currencyMeta.symbolPosition,
        spaceBetween: currencyMeta.spaceBetween,
        decimals: currencyMeta.decimals,
      },
    ],
    fallbackCode: "USD",
    // Lebanon always maps to the test currency so the app picks it up from geo.
    countryToCurrency: { LB: currencyCode, AE: "AED", CY: "EUR" },
  };
}

async function installStubs(page: Page, currency: typeof CURRENCIES[number]): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeCurrenciesStub(currency.code, currency)),
    }),
  );

  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        base: "USD",
        rates: { USD: 1, [currency.code]: currency.rate },
      }),
    }),
  );

  // Geo returns Lebanon delivery country — never changes regardless of display currency.
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currency: currency.code }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const currency of CURRENCIES) {
  test(`Lebanon + ${currency.code}: main Stripe account initialises and card fields render`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await installStubs(page, currency);

    await page.addInitScript(
      ({ cart, location, currencyCode, currencyKey }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
        // Force the display currency override so the app doesn't wait for a
        // geo lookup to resolve the currency (makes the test deterministic).
        window.localStorage.setItem(currencyKey, currencyCode);
      },
      {
        cart: [CART_ITEM],
        location: LOCATION,
        currencyCode: currency.code,
        currencyKey: MANUAL_CURRENCY_PERSISTENT_KEY,
      },
    );

    // `?guest=1` bypasses the sign-in dialog (mirrors "Checkout as Guest").
    await page.goto("/en-lb/beirut/checkout?guest=1");

    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // ── Step 1 · fill recipient + sender details ──────────────────────────
    const recipientFirstName = page.getByTestId("input-recipient-first-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("check-no-address").click();
    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);

    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("test@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    // ── Continue to payment step ──────────────────────────────────────────
    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // ── Step 2 · pick the Stripe-backed "card" method ─────────────────────
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    // ── Assert the Stripe card-number iframe rendered ─────────────────────
    // Presence of the iframe proves: the vendor-stripe chunk loaded, Stripe.js
    // initialised successfully with the MAIN (Lebanon) publishable key, and
    // the <Elements>/<CardNumberElement> tree mounted.
    const cardNumberFrame = page.locator(
      'iframe[title*="card number" i], iframe[name^="__privateStripeFrame"]',
    );
    await expect(cardNumberFrame.first()).toBeVisible({ timeout: 20_000 });

    // The "Stripe not configured" fallback must NOT appear.
    await expect(page.getByTestId("stripe-card-error")).toHaveCount(0);

    // No uncaught JS errors while loading the lazy Stripe chunk.
    expect(
      pageErrors,
      `unexpected page errors for ${currency.code}: ${pageErrors.join(" | ")}`,
    ).toEqual([]);
  });
}
