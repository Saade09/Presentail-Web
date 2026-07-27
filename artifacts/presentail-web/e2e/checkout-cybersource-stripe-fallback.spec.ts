/**
 * E2E: CyberSource ↔ Stripe card tile visibility in the web checkout
 *
 * The `paymentOptions` memo in Checkout.tsx uses an optimistic default:
 * `csAvailable` starts as `true` for LB+USD shoppers (so that the CyberSource
 * tile appears immediately without waiting for the availability probe), which
 * simultaneously hides the Stripe card tile until the probe resolves.
 *
 * Three scenarios are covered:
 *
 *  1. CyberSource credentials are present (available: true) — the CS tile
 *     renders and the Stripe card tile is absent.
 *
 *  2. CyberSource credentials are absent (available: false) — the availability
 *     probe resolves to false, csAvailable flips to false, and the Stripe card
 *     tile appears as the fallback.
 *
 *  3. CyberSource credentials are present but the capture-context prefetch
 *     fails — the error sets `csCaptureContextError`, which causes the
 *     paymentOptions memo to re-include the Stripe card tile even while
 *     csAvailable is still true.
 *
 *  4. Credential-rotation recovery — the prefetch resolves as a soft failure
 *     (HTTP 200, ok:false — e.g. credentials rotated mid-session), leaving
 *     `csCaptureContext` null with no `csCaptureContextError`. The submit
 *     handler must re-fetch the capture context on tap (second call succeeds)
 *     and the shopper must never see a blank form or an unrecoverable error:
 *     the retried context initialises the Microform, and a follow-up tap
 *     completes the charge and reaches order-confirmed.
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
    wcId: 0,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };
const VALID_LB_PHONE = "+96170000000";
const FAKE_ORDER_ID = "TEST-CS-E2E-001";
const FAKE_PI_SECRET = "pi_test_cs_fallback_secret";

// ---------------------------------------------------------------------------
// Mock Stripe — minimal shim so the lazy StripeSection mounts without CDN
// ---------------------------------------------------------------------------

const MOCK_STRIPE_SCRIPT = `
(function() {
  function MockStripeElement(type) { this._type = type; }
  MockStripeElement.prototype.mount = function(container) {
    if (container && typeof container.appendChild === 'function') {
      var div = document.createElement('div');
      div.setAttribute('data-mock-stripe-field', this._type);
      div.style.cssText = 'height:40px;border:1px solid #ccc;border-radius:4px;padding:8px;';
      container.appendChild(div);
    }
  };
  MockStripeElement.prototype.unmount = function() {};
  MockStripeElement.prototype.destroy = function() {};
  MockStripeElement.prototype.on = function() { return this; };
  MockStripeElement.prototype.off = function() { return this; };
  MockStripeElement.prototype.update = function() {};
  MockStripeElement.prototype.focus = function() {};
  MockStripeElement.prototype.blur = function() {};
  MockStripeElement.prototype.clear = function() {};

  function MockElements(stripe) { this._stripe = stripe; this._elements = {}; }
  MockElements.prototype.create = function(type) {
    var el = new MockStripeElement(type);
    this._elements[type] = el;
    return el;
  };
  MockElements.prototype.getElement = function(type) {
    return this._elements[type] || new MockStripeElement(type);
  };
  MockElements.prototype.update = function() {};
  MockElements.prototype.destroy = function() {};
  MockElements.prototype.fetchUpdates = function() { return Promise.resolve({}); };
  MockElements.prototype.submit = function() { return Promise.resolve({}); };

  function MockStripe(key) { this._key = key; this._el = null; }
  MockStripe.prototype.elements = function() {
    if (!this._el) this._el = new MockElements(this);
    return this._el;
  };
  MockStripe.prototype.createToken = function() {
    return Promise.resolve({ token: { id: 'tok_mock' } });
  };
  MockStripe.prototype.createPaymentMethod = function() {
    return Promise.resolve({ paymentMethod: { id: 'pm_mock' } });
  };
  MockStripe.prototype.confirmCardPayment = function(cs) {
    return Promise.resolve({ paymentIntent: { id: 'pi_mock', status: 'succeeded', client_secret: cs }, error: undefined });
  };
  MockStripe.prototype.paymentRequest = function() {
    return { canMakePayment: function() { return Promise.resolve(null); }, on: function() {}, off: function() {}, show: function() {}, update: function() {} };
  };
  MockStripe.prototype.confirmPayment = function() { return Promise.resolve({ error: null }); };
  MockStripe.prototype.handleNextAction = function() { return Promise.resolve({ paymentIntent: { id: 'pi_mock', status: 'succeeded' } }); };
  MockStripe.prototype.retrievePaymentIntent = function(cs) { return Promise.resolve({ paymentIntent: { id: 'pi_mock', status: 'succeeded', client_secret: cs } }); };
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};

  window.Stripe = function(key) { return new MockStripe(key); };
})();
`;

// ---------------------------------------------------------------------------
// Mock CyberSource Flex Microform SDK — served instead of the CDN bundle so
// the retried capture context can initialise the form and tokenize offline.
// ---------------------------------------------------------------------------

const MOCK_FLEX_SCRIPT = `
(function() {
  function MockMicroformField(type) { this._type = type; }
  MockMicroformField.prototype.load = function(selector) {
    var container = document.querySelector(selector);
    if (container) {
      var div = document.createElement('div');
      div.setAttribute('data-mock-cs-field', this._type);
      container.appendChild(div);
    }
  };
  MockMicroformField.prototype.on = function() { return this; };
  MockMicroformField.prototype.unload = function() {};

  function MockMicroform() {}
  MockMicroform.prototype.createField = function(type) { return new MockMicroformField(type); };
  MockMicroform.prototype.createToken = function(options, callback) {
    setTimeout(function() { callback(null, 'mock-transient-token-jwt'); }, 0);
  };

  function MockFlex(captureContext) { this._cc = captureContext; }
  MockFlex.prototype.microform = function() { return new MockMicroform(); };

  window.Flex = MockFlex;
})();
`;

// ---------------------------------------------------------------------------
// Common API stubs
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 2 },
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

/**
 * Install the minimal set of API stubs needed by all three tests.
 * Each test overrides /payment/cybersource/available to its own scenario.
 */
async function installBaseStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
  );
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currency: "USD" }) }),
  );
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_DELIVERY_LOCATIONS) }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/loyalty/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }) }),
  );
  await page.route("**/api/checkout/payment-intent", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, clientSecret: FAKE_PI_SECRET, orderId: FAKE_ORDER_ID, amount: 6500, currency: "USD" }),
    }),
  );
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function advanceToPaymentStep(page: Page): Promise<void> {
  const guestBtn = page.getByTestId("button-checkout-as-guest");
  if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await guestBtn.click();
  }

  const recipientFirstName = page.getByTestId("input-recipient-first-name");
  await expect(recipientFirstName).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("check-no-address").click();
  await recipientFirstName.fill("Ahmad");
  await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);

  const senderSummary = page.getByTestId("sender-summary");
  const isLoggedIn = await senderSummary.isVisible({ timeout: 2_000 }).catch(() => false);
  if (!isLoggedIn) {
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("test@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);
  }

  const sidebarCta = page.getByTestId("button-continue-to-payment-sidebar");
  const mobileCta = page.getByTestId("button-continue-to-payment");
  const isSidebarVisible = await sidebarCta.isVisible({ timeout: 3_000 }).catch(() => false);
  const continueBtn = isSidebarVisible ? sidebarCta : mobileCta;
  await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
  await continueBtn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Checkout — CyberSource and Stripe card tile visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await installBaseStubs(page);
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
  });

  // ── 1. CS credentials present → CS tile renders, Stripe card absent ────────

  test("CyberSource tile renders and Stripe card tile is absent when credentials are present (available: true)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.route("**/api/payment/cybersource/available", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Wait for the payment options section to appear.
    const csOption = page.getByTestId("option-payment-cybersource");
    await expect(csOption).toBeVisible({ timeout: 15_000 });

    // The Stripe card tile must NOT be present — csAvailable=true hides it.
    await expect(page.getByTestId("option-payment-card")).toHaveCount(0);
  });

  // ── 2. CS credentials absent → Stripe card tile appears as fallback ────────

  test("Stripe card tile renders as fallback when CyberSource credentials are absent (available: false)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.route("**/api/payment/cybersource/available", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Stripe card tile must appear once the probe resolves to false.
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 15_000 });

    // CyberSource tile must NOT be present.
    await expect(page.getByTestId("option-payment-cybersource")).toHaveCount(0);
  });

  // ── 3. CS available but capture-context fails → Stripe card tile recovers ──

  test("Stripe card tile appears after CyberSource capture-context prefetch returns an error", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // CyberSource credentials are configured — CS tile shows initially.
    await page.route("**/api/payment/cybersource/available", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) }),
    );
    // The capture-context prefetch fails (simulates a credential or server error).
    await page.route("**/api/payment/cybersource/capture-context", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "CyberSource credentials invalid" }),
      }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // With CS available, the CS tile should be visible on step 2.
    const csOption = page.getByTestId("option-payment-cybersource");
    await expect(csOption).toBeVisible({ timeout: 15_000 });

    // Click the CyberSource tile to select it and trigger the capture-context
    // prefetch effect (the effect only runs when paymentMethod === "cybersource").
    await csOption.click();

    // After the prefetch fails, Checkout.tsx sets csCaptureContextError and
    // calls setPaymentMethodState("card") + triggerStripeLoad(). The
    // paymentOptions memo re-runs and now includes the Stripe card tile.
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 15_000 });

    // CyberSource tile must now be absent — csCaptureContextError removes it.
    await expect(page.getByTestId("option-payment-cybersource")).toHaveCount(0);
  });

  // ── 4. Credential rotation mid-session → submit-time capture-context retry ─

  test("charge submission re-fetches capture context when the prefetch soft-fails (credential rotation recovery)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.route("**/api/payment/cybersource/available", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) }),
    );

    // Capture-context: first call soft-fails (200 + ok:false, as returned when
    // credentials were rotated mid-session and the old key is rejected), every
    // subsequent call succeeds. This leaves csCaptureContext null with NO
    // csCaptureContextError after the prefetch, exercising the submit-time
    // retry branch in handleSubmit.
    let captureContextCalls = 0;
    await page.route("**/api/payment/cybersource/capture-context", (route) => {
      captureContextCalls += 1;
      if (captureContextCalls === 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "CyberSource credentials rotated" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, captureContext: "mock-capture-context-jwt", environment: "test" }),
      });
    });

    // Mock the CyberSource Flex Microform SDK so the retried capture context
    // can actually initialise the form and tokenize without hitting the CDN.
    await page.route("**flex.cybersource.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_FLEX_SCRIPT }),
    );

    // Charge succeeds once tokenization works.
    let chargeCalled = false;
    await page.route("**/api/payment/cybersource/charge", (route) => {
      chargeCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, paymentRef: "cs-ref-e2e-001" }),
      });
    });

    // Order finalization after a successful charge.
    await page.route("**/api/woo/order", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: 0 }),
      }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Select the CyberSource tile — this triggers the prefetch (call #1,
    // soft failure).
    const csOption = page.getByTestId("option-payment-cybersource");
    await expect(csOption).toBeVisible({ timeout: 15_000 });
    await csOption.click();

    // Wait for the prefetch to have fired and soft-failed.
    await expect.poll(() => captureContextCalls, { timeout: 10_000 }).toBe(1);

    // The shopper is NOT dumped on a blank/broken form: the CS section stays
    // mounted (loading skeleton), the CS tile remains selected (no forced
    // Stripe fallback — that only happens on a thrown/HTTP error), and no
    // destructive error message is shown inside the section.
    const csSection = page.getByTestId("cybersource-section");
    await expect(csSection).toBeVisible({ timeout: 10_000 });
    await expect(csSection.locator("p.text-destructive")).toHaveCount(0);
    await expect(page.getByTestId("option-payment-card")).toHaveCount(0);

    // Tap Place Order — csCaptureContext is null, so the submit handler must
    // re-fetch the capture context (call #2 succeeds).
    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    await expect.poll(() => captureContextCalls, { timeout: 10_000 }).toBe(2);

    // The retried capture context initialises the (mocked) Microform: the
    // expiry input becomes visible — the form recovered, no blank state and
    // no unrecoverable error inside the section.
    const expiryInput = page.getByTestId("cs-expiry");
    await expect(expiryInput).toBeVisible({ timeout: 15_000 });
    await expect(csSection.locator("p.text-destructive")).toHaveCount(0);

    // Complete the recovered flow: fill expiry and tap Place Order again.
    // Tokenization now succeeds via the mock SDK, the charge is submitted,
    // and the shopper reaches order-confirmed.
    await expiryInput.fill("12 / 30");
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    await page.waitForURL(/\/order-confirmed/, { timeout: 20_000 });
    expect(chargeCalled).toBe(true);
    // No third capture-context fetch — the retried context was cached.
    expect(captureContextCalls).toBe(2);
  });
});
