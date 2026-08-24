/**
 * E2E test: guided inline errors on the Step-1 "Continue to Payment" CTA.
 *
 * The CTA (desktop sidebar + mobile sticky bar) is always clickable. Clicking
 * with missing required fields must:
 *   1. Stay on Step 1 (no payment method list).
 *   2. Show a localized inline error under every currently-invalid required
 *      field (red border on the control + red helper text).
 *   3. Scroll to and focus the FIRST invalid field (recipient name).
 *   4. Clear each error as soon as the shopper fixes that field.
 *   5. Advance to Step 2 once everything is valid.
 *
 * All API calls are intercepted so the test is hermetic (no live backend
 * needed). Stripe is mocked via window.Stripe to avoid a CDN dependency.
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
  quantity: 1,
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };
const VALID_LB_PHONE = "+96170000000";

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

const STUB_DELIVERY_LOCATIONS = {
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
};

// Minimal Stripe mock — prevents any real js.stripe.com CDN load while
// satisfying the @stripe/react-stripe-js isStripe() runtime check.
const MOCK_STRIPE_SCRIPT = `
(function() {
  function MockElements() {}
  MockElements.prototype.create = function(type) {
    var el = { _type: type };
    el.mount = function(container) {
      if (container && typeof container.appendChild === 'function') {
        var div = document.createElement('div');
        div.setAttribute('data-mock-stripe-field', type);
        container.appendChild(div);
      }
    };
    el.unmount = function() {};
    el.destroy = function() {};
    el.on = function() { return el; };
    el.off = function() { return el; };
    el.update = function() {};
    return el;
  };
  MockElements.prototype.getElement = function() { return null; };
  MockElements.prototype.update = function() {};
  MockElements.prototype.submit = function() { return Promise.resolve({}); };
  MockElements.prototype.fetchUpdates = function() { return Promise.resolve({}); };

  function MockStripe(key) {
    this._key = key;
    this._el = null;
  }
  MockStripe.prototype.elements = function() {
    if (!this._el) this._el = new MockElements();
    return this._el;
  };
  MockStripe.prototype.createToken = function() { return Promise.resolve({ token: { id: 'tok_mock' } }); };
  MockStripe.prototype.createPaymentMethod = function() { return Promise.resolve({ paymentMethod: { id: 'pm_mock' } }); };
  MockStripe.prototype.confirmCardPayment = function(cs) {
    return Promise.resolve({ paymentIntent: { id: 'pi_mock', status: 'succeeded', client_secret: cs } });
  };
  MockStripe.prototype.paymentRequest = function() {
    return { canMakePayment: function() { return Promise.resolve(null); }, on: function() {}, off: function() {}, show: function() {}, update: function() {} };
  };
  MockStripe.prototype.confirmPayment = function() { return Promise.resolve({ error: null }); };
  MockStripe.prototype.handleNextAction = function() { return Promise.resolve({ paymentIntent: { status: 'succeeded' } }); };
  MockStripe.prototype.retrievePaymentIntent = function(cs) { return Promise.resolve({ paymentIntent: { status: 'succeeded', client_secret: cs } }); };
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};
  window.Stripe = function(key) { return new MockStripe(key); };
})();
`;

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
  );
  await page.route("**/api/geo/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currency: "USD" }) }),
  );
  await page.route("**/api/delivery-locations**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_DELIVERY_LOCATIONS) }),
  );
  await page.route("**/api/orders/next-id", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, orderId: "TEST-ERR-001" }) }),
  );
  await page.route("**/js.stripe.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
  // Silence any analytics calls so they don't cause test-side noise.
  await page.route("**/api/analytics/**", (r) => r.fulfill({ status: 204, body: "" }));
}

/**
 * The Step-1 continue CTA differs by breakpoint: the desktop sidebar button
 * (lg+ only) vs the mobile sticky-footer button (below lg). Both run the same
 * shared validate-and-advance flow, so the spec targets whichever is visible
 * for the current project viewport.
 */
function continueCta(page: Page) {
  return page
    .getByTestId("button-continue-to-payment-sidebar")
    .or(page.getByTestId("button-continue-to-payment"))
    .locator("visible=true");
}

test.describe("Checkout — guided inline errors on Continue to Payment", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await page.addInitScript(
      ({ cart, location }: { cart: typeof CART_ITEM[]; location: typeof LOCATION }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
    await installStubs(page);
  });

  test("clicking with an empty form shows inline errors, focuses the first invalid field, then advances once fixed", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Dismiss the guest-gate dialog if it still shows (belt-and-braces).
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    const recipientName = page.getByTestId("input-recipient-name");
    await expect(recipientName).toBeVisible({ timeout: 15_000 });

    // No inline errors before the first continue attempt.
    await expect(page.getByTestId("error-recipient-name")).toHaveCount(0);

    // ── Click the always-enabled CTA on a fully empty form ──────────────────
    const continueBtn = continueCta(page);
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Still on Step 1 — no payment method list.
    await expect(page.getByTestId("option-payment-card")).toHaveCount(0);

    // Every invalid required field shows its localized message …
    const nameError = page.getByTestId("error-recipient-name");
    await expect(nameError).toBeVisible();
    await expect(nameError).toHaveText("Enter the recipient's name to continue.");
    await expect(page.getByTestId("error-district")).toBeVisible();
    await expect(page.getByTestId("error-recipient-address")).toBeVisible();
    await expect(page.getByTestId("error-sender-first-name")).toBeVisible();
    await expect(page.getByTestId("error-sender-email")).toBeVisible();
    // … including the empty (required) phone fields.
    await expect(page.getByTestId("input-recipient-phone-error")).toBeVisible();
    await expect(page.getByTestId("input-sender-phone-error")).toBeVisible();

    // First invalid field (recipient name) gets focus + a11y wiring.
    await expect(recipientName).toBeFocused();
    await expect(recipientName).toHaveAttribute("aria-invalid", "true");
    await expect(recipientName).toHaveAttribute("aria-describedby", "recipient-name-error");

    // ── Fixing a field clears ONLY that field's error, immediately ──────────
    await recipientName.fill("Ahmad");
    await expect(page.getByTestId("error-recipient-name")).toHaveCount(0);
    await expect(recipientName).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("error-district")).toBeVisible();

    // ── Fill the rest of the form ────────────────────────────────────────────
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);
    // Skip address (district + address) via the ask-recipient toggle — their
    // errors must disappear because the fields are no longer required.
    await page.getByTestId("check-no-address").click();
    await expect(page.getByTestId("error-district")).toHaveCount(0);
    await expect(page.getByTestId("error-recipient-address")).toHaveCount(0);

    await page.getByTestId("input-sender-first-name").fill("Test");
    await expect(page.getByTestId("error-sender-first-name")).toHaveCount(0);
    await page.getByTestId("input-sender-email").fill("test@example.com");
    await expect(page.getByTestId("error-sender-email")).toHaveCount(0);
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);
    await expect(page.getByTestId("input-sender-phone-error")).toHaveCount(0);

    // ── Valid form advances to Step 2 exactly as before ─────────────────────
    await continueBtn.click();
    await expect(page.getByTestId("option-payment-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("checkout-error-boundary")).toHaveCount(0);
  });
});
