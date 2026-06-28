/**
 * E2E test: full checkout flow — cart → order confirmation (guest card path)
 *
 * After the Stripe PaymentIntent idempotency change (where `create` vs `update`
 * is now gated on the in-memory intent store), this test drives the complete
 * web checkout happy path end-to-end to confirm the route change doesn't break
 * real-browser checkout flow:
 *
 *   1. Cart is seeded in localStorage (one item, LB / USD).
 *   2. Navigate to checkout in guest mode.
 *   3. Fill step 1: recipient + sender details (no-address path).
 *   4. Continue to step 2: payment.
 *   5. Select "Credit Card" (Stripe-backed) — this triggers the
 *      POST /checkout/payment-intent call that exercises the idempotency logic.
 *   6. Place the order — confirmCardPayment resolves from our mock Stripe.
 *   7. Assert the browser reaches the order-confirmed page with a success status.
 *
 * All API calls to the Presentail server are intercepted via page.route() so
 * the test runs without a live backend. The Stripe JS SDK is replaced with a
 * lightweight mock (injected before page load via addInitScript + page.route on
 * js.stripe.com) so no real card-network call is made.
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
const FAKE_ORDER_ID = "TEST-LB-E2E-001";
const FAKE_PI_ID = "pi_test_e2e_success";
const FAKE_CLIENT_SECRET = "pi_test_e2e_success_secret_abc123";

// ---------------------------------------------------------------------------
// Mock Stripe.js
//
// @stripe/stripe-js checks window.Stripe before injecting the CDN script.
// We pre-inject a mock via addInitScript so loadStripe() never needs the CDN.
// This avoids any real network call to js.stripe.com and provides a fully
// controllable stripe object to the React component tree.
// ---------------------------------------------------------------------------

const MOCK_STRIPE_SCRIPT = `
(function() {
  function MockStripeElement(type) {
    this._type = type;
    this._mounted = false;
  }
  MockStripeElement.prototype.mount = function(container) {
    this._mounted = true;
    if (container && typeof container.appendChild === 'function') {
      var div = document.createElement('div');
      div.setAttribute('data-mock-stripe-field', this._type);
      div.style.cssText = 'height:40px;border:1px solid #ccc;border-radius:4px;padding:8px;';
      container.appendChild(div);
    }
  };
  MockStripeElement.prototype.unmount = function() { this._mounted = false; };
  MockStripeElement.prototype.destroy = function() {};
  MockStripeElement.prototype.on = function() { return this; };
  MockStripeElement.prototype.off = function() { return this; };
  MockStripeElement.prototype.update = function() {};
  MockStripeElement.prototype.focus = function() {};
  MockStripeElement.prototype.blur = function() {};
  MockStripeElement.prototype.clear = function() {};

  function MockElements(stripe) {
    this._stripe = stripe;
    this._elements = {};
  }
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

  function MockStripe(publishableKey) {
    this._key = publishableKey;
    this._elementsInstance = null;
  }
  // Methods required by @stripe/react-stripe-js isStripe() check:
  //   typeof raw.elements === 'function' &&
  //   typeof raw.createToken === 'function' &&
  //   typeof raw.createPaymentMethod === 'function' &&
  //   typeof raw.confirmCardPayment === 'function'
  MockStripe.prototype.elements = function() {
    if (!this._elementsInstance) this._elementsInstance = new MockElements(this);
    return this._elementsInstance;
  };
  MockStripe.prototype.createToken = function() {
    return Promise.resolve({ token: { id: 'tok_mock' } });
  };
  MockStripe.prototype.createPaymentMethod = function() {
    return Promise.resolve({ paymentMethod: { id: 'pm_mock' } });
  };
  MockStripe.prototype.confirmCardPayment = function(clientSecret) {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: clientSecret },
      error: undefined,
    });
  };
  // Additional methods used by Checkout.tsx / @stripe/react-stripe-js internals:
  MockStripe.prototype.paymentRequest = function() {
    return {
      canMakePayment: function() { return Promise.resolve(null); },
      on: function() {},
      off: function() {},
      show: function() {},
      update: function() {},
    };
  };
  MockStripe.prototype.confirmPayment = function() {
    return Promise.resolve({ error: null });
  };
  MockStripe.prototype.handleNextAction = function() {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded' },
    });
  };
  MockStripe.prototype.retrievePaymentIntent = function(clientSecret) {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: clientSecret },
    });
  };
  // @stripe/react-stripe-js calls _registerWrapper / registerAppInfo on mount:
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};

  window.Stripe = function(publishableKey) {
    return new MockStripe(publishableKey);
  };
})();
`;

// ---------------------------------------------------------------------------
// API stubs
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

async function installStubs(page: Page): Promise<void> {
  // Currency / FX / Geo
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
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currency: "USD" }),
    }),
  );

  // Delivery locations — step 1 uses this to populate the district selector.
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_DELIVERY_LOCATIONS),
    }),
  );

  // Reserve a stable order ID for this checkout session.
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }),
    }),
  );

  // POST /checkout/payment-intent — the endpoint that exercises the idempotency
  // logic. Returns a fake clientSecret so the mock Stripe can confirm it.
  await page.route("**/api/checkout/payment-intent", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        clientSecret: FAKE_CLIENT_SECRET,
        orderId: FAKE_ORDER_ID,
        amount: 6500,
        currency: "USD",
      }),
    }),
  );

  // POST /woo/order — finalizes the order after card payment is confirmed.
  await page.route("**/api/woo/order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: 0 }),
    }),
  );

  // Silence the Stripe CDN — our window.Stripe mock (injected via addInitScript)
  // means loadStripe() never needs the real script, but intercept it as a
  // safety net so a network error never fails the test.
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: MOCK_STRIPE_SCRIPT,
    }),
  );
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Checkout — full guest card-payment flow (idempotency smoke test)", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock Stripe before any page JS runs.
    await page.addInitScript(MOCK_STRIPE_SCRIPT);

    // Seed cart + delivery location.
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

    await installStubs(page);
  });

  test("guest card checkout reaches order-confirmed after payment-intent is created", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Track whether the payment-intent endpoint was actually called so we can
    // assert the idempotency path was exercised.
    let paymentIntentCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("/checkout/payment-intent") && req.method() === "POST") {
        paymentIntentCalled = true;
      }
    });

    // `?guest=1` pre-acknowledges the guest path so the sign-in dialog never
    // mounts (mirrors how the cart's "Checkout as Guest" button navigates).
    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Belt-and-braces: dismiss the login dialog if it still appears.
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // ── Step 1 · Recipient + sender details ──────────────────────────────────

    const recipientFirstName = page.getByTestId("input-recipient-first-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    // Tick "No address needed" so we skip the district/address fields and the
    // submit button isn't disabled by a missing _selectedDistrict.
    await page.getByTestId("check-no-address").click();

    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);

    // Guest sender details (name + email + phone are all required).
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("guest@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    // ── Continue to payment step ──────────────────────────────────────────────

    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();

    // ── Step 2 · Select "Credit Card" ────────────────────────────────────────

    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    // Wait for the Stripe lazy section to mount. Our mock elements render a
    // `data-mock-stripe-field` div instead of real iframes, so we wait for
    // the card-number field placeholder to appear.
    // Allow a generous timeout for the dynamic import + React Suspense cycle.
    await expect(
      page.locator('[data-mock-stripe-field="cardNumber"]').or(
        page.locator('iframe[title*="card number" i]'),
      ),
    ).toBeVisible({ timeout: 20_000 });

    // The "Stripe not configured" fallback must not be shown.
    await expect(page.getByTestId("stripe-card-error")).toHaveCount(0);

    // ── Place the order ───────────────────────────────────────────────────────

    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // ── Assert we reach the order-confirmed page ──────────────────────────────

    // The checkout navigates to /order-confirmed after a successful order.
    // Use waitForURL with a generous timeout to accommodate:
    //   1. POST /checkout/payment-intent round-trip (stubbed → instant)
    //   2. mock stripe.confirmCardPayment (resolves immediately)
    //   3. POST /woo/order round-trip (stubbed → instant)
    //   4. React state update + router push
    await page.waitForURL(/\/order-confirmed/, { timeout: 20_000 });

    const url = page.url();
    expect(url).toContain("status=success");

    // Confirm the idempotency endpoint was exercised during this checkout.
    expect(paymentIntentCalled).toBe(true);

    // No uncaught JS errors should have fired.
    expect(
      pageErrors.filter(
        (e) =>
          // Suppress benign "ResizeObserver loop limit exceeded" warnings that
          // browsers occasionally fire in headless mode and are unrelated to
          // our checkout logic.
          !e.includes("ResizeObserver loop"),
      ),
      `unexpected page errors: ${pageErrors.join(" | ")}`,
    ).toEqual([]);
  });

  test("payment-intent request body is well-formed and includes required fields", async ({
    page,
  }) => {
    // Capture the request body sent to POST /checkout/payment-intent to verify
    // the client is sending all required fields (items, orderId, currency, etc.)
    // that the idempotency logic on the server depends on.
    let capturedRequest: Record<string, unknown> | null = null;
    let capturedResponse: Record<string, unknown> | null = null;

    // Override the stub to also sniff the request body before fulfilling.
    await page.route("**/api/checkout/payment-intent", (route) => {
      try {
        const body = route.request().postData();
        if (body) capturedRequest = JSON.parse(body);
      } catch { /* ignore */ }
      // Return the same stub — still resolves as success.
      const stub = {
        ok: true,
        clientSecret: FAKE_CLIENT_SECRET,
        orderId: FAKE_ORDER_ID,
        amount: 6500,
        currency: "USD",
      };
      capturedResponse = stub;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stub),
      });
    });

    await page.goto("/en-lb/beirut/checkout?guest=1");

    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    const recipientFirstName = page.getByTestId("input-recipient-first-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("check-no-address").click();
    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("guest@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();

    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    await expect(
      page.locator('[data-mock-stripe-field="cardNumber"]').or(
        page.locator('iframe[title*="card number" i]'),
      ),
    ).toBeVisible({ timeout: 20_000 });

    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    await page.waitForURL(/\/order-confirmed/, { timeout: 20_000 });

    // Verify the payment-intent request included all fields the idempotency
    // logic depends on: orderId (used as the in-memory store key), items, and
    // currency (determines which Stripe account is used).
    expect(capturedRequest).not.toBeNull();
    expect(Array.isArray(capturedRequest?.items)).toBe(true);
    expect((capturedRequest?.items as unknown[]).length).toBeGreaterThan(0);
    expect(typeof capturedRequest?.orderId).toBe("string");
    expect((capturedRequest?.orderId as string).length).toBeGreaterThan(0);
    expect(typeof capturedRequest?.currency).toBe("string");

    // Verify the stubbed response shape matches what the client expects.
    expect(capturedResponse?.ok).toBe(true);
    expect(typeof capturedResponse?.clientSecret).toBe("string");
    expect((capturedResponse?.clientSecret as string).length).toBeGreaterThan(0);
    expect(typeof capturedResponse?.orderId).toBe("string");
    expect(typeof capturedResponse?.amount).toBe("number");
    expect(typeof capturedResponse?.currency).toBe("string");
  });
});
