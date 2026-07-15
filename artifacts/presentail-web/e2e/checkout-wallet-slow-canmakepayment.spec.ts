/**
 * E2E test: Apple Pay / Google Pay still opens after a slow canMakePayment() probe
 *
 * The auto-retry fix for the wallet probe adds up to 3 × 1 s delays before
 * giving up on canMakePayment(). This test guards that exact path end-to-end:
 *
 *   1. A mobile-sized viewport (390 × 844) loads checkout with a cart item.
 *   2. The Stripe mock distinguishes the two probe sites by PaymentRequest
 *      total.amount:
 *        - Bootstrap probe (Stripe-init effect): amount=100 → instant null
 *          (these tiles stay visible regardless; not the path under test).
 *        - Submit-time pre-creation probe (PI pre-create effect): real amount
 *          (6500 from stub) → first call returns null after 1.5 s, second call
 *          (the auto-retry) returns truthy immediately.
 *   3. The wallet tile (Google Pay on Chromium) must remain visible throughout.
 *   4. After the retry resolves, the Pay button must become enabled.
 *   5. Clicking Pay must NOT produce the "Wallet payment unavailable" or
 *      "Unable to prepare payment" error toast — i.e., pr.show() is reachable
 *      with the pre-validated PaymentRequest stored in paymentRequestRef.
 *
 * All API calls to the Presentail server are intercepted via page.route() so
 * the test runs without a live backend. The Stripe CDN is replaced with a
 * lightweight mock injected before page load.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Viewport — mobile phone (matches the "Mobile Chrome" playwright project)
// ---------------------------------------------------------------------------

const MOBILE_VIEWPORT = { width: 390, height: 844 };

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
const FAKE_ORDER_ID = "TEST-LB-WALLET-001";
const FAKE_CLIENT_SECRET = "pi_test_wallet_secret_abc123";

// ---------------------------------------------------------------------------
// Mock Stripe.js
//
// The mock uses PaymentRequest total.amount to distinguish the two canMakePayment
// probe sites that Checkout.tsx uses:
//
//   Bootstrap probe (stripe-change effect, line ~1188):
//     stripe.paymentRequest({ total: { amount: 100 } })
//     → canMakePayment() returns null immediately.
//     Tiles stay visible regardless of this result (current design).
//     This is NOT the path under test.
//
//   Submit-time pre-creation probe (PI pre-create effect, line ~1446+):
//     stripe.paymentRequest({ total: { amount: res.amount } })  ← e.g. 6500
//     → First canMakePayment() call: returns null after 1 500 ms delay.
//     → Auto-retry creates a fresh PR with the same amount; second call:
//       returns { googlePay: true } immediately.
//     This IS the auto-retry path added by the fix.
//
// Tracking: window.__precreationCmpCalls counts only calls on non-probe PRs
// (amount !== 100), so the assertion in the second test is specific to the
// submit-time retry branch.
// ---------------------------------------------------------------------------

const MOCK_STRIPE_SCRIPT = `
(function() {
  // Counts canMakePayment() calls on the submit-time pre-creation PRs only.
  window.__precreationCmpCalls = 0;

  function MockPaymentRequest(config) {
    // Store total amount so canMakePayment() can distinguish probe vs submit.
    this._amount = (config && config.total && config.total.amount) || 0;
  }

  MockPaymentRequest.prototype.canMakePayment = function() {
    var amount = this._amount;

    // Bootstrap probe: amount === 100 (fixed sentinel in Checkout.tsx line ~1188).
    // Return null immediately — tiles are intentionally kept visible in this case.
    if (amount === 100) {
      return Promise.resolve(null);
    }

    // Submit-time pre-creation probe: real PI amount (e.g. 6500).
    // First call: 1 500 ms delay then null (simulates slow Keychain / Google Pay).
    // Subsequent calls (auto-retries): immediate truthy result.
    var callIndex = window.__precreationCmpCalls++;
    if (callIndex === 0) {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve(null); }, 1500);
      });
    }
    return Promise.resolve({ googlePay: true });
  };

  MockPaymentRequest.prototype.on = function() { return this; };
  MockPaymentRequest.prototype.off = function() { return this; };
  MockPaymentRequest.prototype.show = function() {
    // No-op: native sheet cannot open in headless Chrome.
    // Not throwing here is the key assertion — the component reached pr.show()
    // with a pre-validated PaymentRequest rather than hitting the null-PR branch
    // that fires the "wallet unavailable" error toast.
    return Promise.resolve();
  };
  MockPaymentRequest.prototype.update = function() {};

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
      paymentIntent: { id: 'pi_mock', status: 'succeeded', client_secret: clientSecret },
      error: undefined,
    });
  };
  MockStripe.prototype.paymentRequest = function(config) {
    return new MockPaymentRequest(config);
  };
  MockStripe.prototype.confirmPayment = function() {
    return Promise.resolve({ error: null });
  };
  MockStripe.prototype.handleNextAction = function() {
    return Promise.resolve({ paymentIntent: { id: 'pi_mock', status: 'succeeded' } });
  };
  MockStripe.prototype.retrievePaymentIntent = function(clientSecret) {
    return Promise.resolve({
      paymentIntent: { id: 'pi_mock', status: 'succeeded', client_secret: clientSecret },
    });
  };
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};

  window.Stripe = function(publishableKey) {
    return new MockStripe(publishableKey);
  };
})();
`;

// ---------------------------------------------------------------------------
// API stubs — hermetic, no live backend needed.
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
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_DELIVERY_LOCATIONS),
    }),
  );
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }),
    }),
  );
  // POST /checkout/payment-intent — returns amount=6500 (not 100), which is
  // what the mock uses to identify submit-time pre-creation PaymentRequests.
  await page.route("**/api/checkout/payment-intent", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        clientSecret: FAKE_CLIENT_SECRET,
        orderId: FAKE_ORDER_ID,
        amount: 6500,
        currency: "usd",
      }),
    }),
  );
  // Best-effort fees endpoint — used in parallel with canMakePayment().
  await page.route("**/api/checkout/fees", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        subtotalUsd: 65,
        districtFeeUsd: 0,
        expressFeeUsd: 0,
        slotFeeUsd: 0,
        couponDiscountUsd: 0,
      }),
    }),
  );
  // Intercept Stripe CDN — our window.Stripe mock means the real script is
  // never needed; silence it so network errors don't flake the test.
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: MOCK_STRIPE_SCRIPT,
    }),
  );
}

// ---------------------------------------------------------------------------
// Helper — fill step 1 (recipient + sender) and advance to the payment step.
// ---------------------------------------------------------------------------

async function fillStep1AndContinue(page: Page): Promise<void> {
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
  await page.getByTestId("input-sender-email").fill("wallet@example.com");
  await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

  const continueBtn = page.getByTestId("button-continue-to-payment");
  await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
  await continueBtn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Checkout — wallet Pay opens correctly after a slow canMakePayment() probe", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
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

  test(
    "wallet tile stays visible and pay button enables after a 1.5 s delayed submit-time canMakePayment()",
    async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto("/en-lb/beirut/checkout?guest=1");
      await fillStep1AndContinue(page);

      // ── Step 2: payment method selection ───────────────────────────────────
      //
      // On Chromium (non-Apple UA) the default wallet method is google_pay.
      // The tile must be visible because walletSupported is never set to false
      // by a null result from canMakePayment() — only a constructor error does.
      const walletTile = page.getByTestId("option-payment-google_pay");
      await expect(walletTile).toBeVisible({ timeout: 10_000 });

      // ── Wait for the submit-time auto-retry to resolve ─────────────────────
      //
      // Timeline from payment step mount:
      //   t=0        : PI pre-creation effect fires (400 ms debounce)
      //   t≈400 ms   : POST /checkout/payment-intent → res.amount=6500
      //   t≈400 ms   : tryCanMakePayment(submitPr)  — call 0 on amount=6500 PR
      //   t≈1 900 ms : call 0 resolves null (1 500 ms delay)
      //   t≈2 900 ms : auto-retry after 1 000 ms — creates retryPr (amount=6500)
      //   t≈2 900 ms : call 1 resolves { googlePay: true } immediately
      //   t≈2 900 ms : walletReadySig set → submit button enabled
      //
      // 10 s budget to accommodate headless scheduler variability.
      const submitBtn = page.getByTestId("button-submit-payment");
      await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

      // Wallet tile must still be visible after all retry cycles.
      await expect(walletTile).toBeVisible();

      // ── Click Pay and assert no error toast fires ──────────────────────────
      //
      // If paymentRequestRef.current is null (meaning no truthy canMakePayment()
      // result was ever stored) the component fires the "Wallet payment
      // unavailable" toast and switches to card. With our mock the retry
      // succeeded so that branch is NOT taken — pr.show() is called as a
      // no-op and the component waits for paymentmethod/cancel events.
      await submitBtn.click();

      // Brief wait for React to flush any synchronous toast that the null-PR
      // branch would have triggered.
      await page.waitForTimeout(500);

      // Neither the "unavailable" nor the "prepare failed" error toast must
      // have appeared. Radix UI Toast renders with role="status".
      const errorToast = page.locator(
        '[role="status"]:has-text("Wallet payment unavailable"), ' +
        '[role="status"]:has-text("Unable to prepare payment")',
      );
      await expect(errorToast).toHaveCount(0);

      expect(
        pageErrors.filter((e) => !e.includes("ResizeObserver loop")),
        `unexpected page errors: ${pageErrors.join(" | ")}`,
      ).toEqual([]);
    },
  );

  test(
    "submit-time canMakePayment() is called at least twice (null retry + truthy) proving the retry branch ran",
    async ({ page }) => {
      await page.goto("/en-lb/beirut/checkout?guest=1");
      await fillStep1AndContinue(page);

      // Wait for the submit button to be enabled — this means the second
      // pre-creation canMakePayment() call resolved truthy and set walletReadySig.
      const submitBtn = page.getByTestId("button-submit-payment");
      await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

      // Read back the counter that the mock increments only for pre-creation
      // PaymentRequests (amount !== 100). The bootstrap probe (amount=100)
      // is intentionally excluded so this count reflects only the submit-time
      // retry branch, not the initial tile-visibility probe.
      const precreationCalls = await page.evaluate(
        () =>
          (window as unknown as { __precreationCmpCalls?: number })
            .__precreationCmpCalls ?? 0,
      );

      // Must be ≥ 2: call 0 (delayed null) + call 1 (immediate truthy on retry).
      // The retry branch in tryCanMakePayment() is what we are guarding.
      expect(precreationCalls).toBeGreaterThanOrEqual(2);
    },
  );
});
