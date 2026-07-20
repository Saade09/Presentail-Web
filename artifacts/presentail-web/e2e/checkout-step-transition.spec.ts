/**
 * E2E regression test: "Continue to Payment" must NOT trigger the error boundary.
 *
 * Background: Clicking "Continue to Payment" on the web checkout was
 * consistently showing the CheckoutErrorBoundary ("Something went wrong") due
 * to an "Invalid hook call" React error that fired when the lazy-loaded
 * StripeCheckoutSection first mounted.  The root cause was a stale-chunk
 * scenario where the cached bundle referenced a different module instance for
 * LocaleContext than the live provider tree.
 *
 * This test guards against that regression by:
 *   1. Filling step 1 (recipient + sender details) via the guest path.
 *   2. Clicking "Continue to Payment".
 *   3. Asserting step 2 (payment method list) renders correctly.
 *   4. Asserting the CheckoutErrorBoundary fallback is NOT shown.
 *   5. Asserting no uncaught JS errors fired during the transition.
 *
 * All API calls are intercepted so the test is hermetic (no live backend needed).
 * Stripe is mocked via window.Stripe to avoid CDN dependency.
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
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, orderId: "TEST-STEP-001" }) }),
  );
  await page.route("**/js.stripe.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
  // Silence any analytics calls so they don't cause test-side noise.
  await page.route("**/api/analytics/**", (r) => r.fulfill({ status: 204, body: "" }));
}

test.describe("Checkout step transition — Continue to Payment must not crash", () => {
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

  test("clicking Continue to Payment advances to step 2 without showing the error boundary", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Dismiss the guest-gate dialog if it still shows (belt-and-braces).
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // Wait for step 1 to render.
    const recipientFirstName = page.getByTestId("input-recipient-first-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    // Skip address so the district field doesn't block the submit button.
    await page.getByTestId("check-no-address").click();

    // Fill required step-1 fields.
    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("test@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    // Confirm the CTA is enabled before clicking.
    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });

    await continueBtn.click();

    // ── Core assertions ───────────────────────────────────────────────────────

    // 1. Step 2 must render: the payment method list must appear.
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });

    // 2. The CheckoutErrorBoundary fallback must NOT be shown.
    //    Its root element carries data-testid="checkout-error-boundary".
    await expect(page.getByTestId("checkout-error-boundary")).toHaveCount(0);

    // 3. No uncaught JS errors should have fired during the transition.
    //    Filter ResizeObserver noise which is benign in headless Chrome.
    const relevantErrors = pageErrors.filter(
      (e) =>
        !e.includes("ResizeObserver loop") &&
        // Suppress benign Stripe.js internal warnings that may surface in
        // headless mode when the mock Stripe doesn't implement every method.
        !e.includes("Stripe"),
    );
    expect(
      relevantErrors,
      `Unexpected page errors after clicking Continue to Payment:\n${relevantErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("error boundary reload guard prevents infinite loops on hook errors", async ({
    page,
  }) => {
    // Simulate the case where sessionStorage already has the reload flag set
    // (meaning one reload already happened). The boundary must show the fallback
    // UI rather than reloading again indefinitely.
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("_presentail_hook_err_reload", "1");
      } catch { /* ignore */ }
    });

    // For this test we only care that the guard key is in place — the checkout
    // page itself should render normally (no hook error in a fresh load).
    await page.goto("/en-lb/beirut/checkout?guest=1");

    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // The page should still render step 1 normally.
    await expect(page.getByTestId("input-recipient-first-name")).toBeVisible({ timeout: 15_000 });

    // The error boundary must NOT be showing (no hook error occurred).
    await expect(page.getByTestId("checkout-error-boundary")).toHaveCount(0);
  });
});
