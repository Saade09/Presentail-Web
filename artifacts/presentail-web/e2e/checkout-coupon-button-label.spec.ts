/**
 * E2E: Place Order button label shows the coupon-discounted total correctly.
 *
 * The PaymentSubmitButton receives the pre-discounted total and renders it as
 * "Place Order · $XX.XX" for card-backed methods. This spec pins that label to
 * prevent a silent regression where the button shows the full price while the
 * shopper is billed the discounted amount — or vice versa.
 *
 * Coupon state is seeded via localStorage before navigation, mirroring the
 * production flow where Cart.tsx writes `presentail_coupon_v1` and
 * `presentail_coupon_discount_v1` after a successful server coupon validation.
 *
 * Tests:
 *  1. Card — with coupon applied  → button AND sidebar both show discounted total
 *  2. Card — no coupon applied    → button AND sidebar both show full total (no regression)
 *  3. Whish — with coupon applied → sidebar total reflects the discount (the
 *     Whish button shows brand copy rather than a price; we verify the
 *     order-summary total is correct for non-card / non-wallet methods)
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Product priced at $65 USD. */
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
const FAKE_ORDER_ID = "TEST-COUPON-LABEL-001";
const FAKE_PI_SECRET = "pi_test_coupon_label_secret_xyz";

/** Coupon gives $10 off — full price $65, discounted price $55. */
const COUPON_CODE = "SAVE10";
const COUPON_DISCOUNT_USD = 10;
const FULL_PRICE_USD = 65;
const DISCOUNTED_PRICE_USD = FULL_PRICE_USD - COUPON_DISCOUNT_USD; // 55

/** localStorage key names (must match Cart.tsx exports). */
const COUPON_KEY = "presentail_coupon_v1";
const COUPON_DISCOUNT_KEY = "presentail_coupon_discount_v1";

// ---------------------------------------------------------------------------
// Mock Stripe (copied from checkout-full-flow.spec.ts so Stripe lazy-loads
// successfully without hitting the CDN).
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
// API stubs
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
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }) }),
  );
  await page.route("**/api/checkout/payment-intent", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, clientSecret: FAKE_PI_SECRET, orderId: FAKE_ORDER_ID, amount: 5500, currency: "USD" }),
    }),
  );
  await page.route("**/api/woo/order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: COUPON_DISCOUNT_USD }),
    }),
  );
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
}

// ---------------------------------------------------------------------------
// Navigation helper: advance from step 1 to step 2 (payment).
// ---------------------------------------------------------------------------

async function advanceToPaymentStep(page: Page): Promise<void> {
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
  await page.getByTestId("input-sender-email").fill("test@example.com");
  await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

  const continueBtn = page.getByTestId("button-continue-to-payment");
  await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
  await continueBtn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("PaymentSubmitButton — coupon discount reflected in button label", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await installBaseStubs(page);
  });

  // ── 1. Card + coupon → button shows discounted total ──────────────────────

  test("card method: button shows discounted total when coupon is applied", async ({ page }) => {
    await page.addInitScript(
      ({ cart, location, couponKey, couponDiscountKey, couponCode, couponDiscount }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        // Seed the coupon discount — mirrors what Cart.tsx writes after validation.
        window.localStorage.setItem(couponKey, couponCode);
        window.localStorage.setItem(couponDiscountKey, String(couponDiscount));
      },
      {
        cart: [CART_ITEM],
        location: LOCATION,
        couponKey: COUPON_KEY,
        couponDiscountKey: COUPON_DISCOUNT_KEY,
        couponCode: COUPON_CODE,
        couponDiscount: COUPON_DISCOUNT_USD,
      },
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Explicitly pick the card tile.
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    // Wait for the Stripe card fields to mount (proves the card tile is active
    // and the lazy Stripe chunk loaded successfully).
    await expect(
      page.locator('[data-mock-stripe-field="cardNumber"]').or(
        page.locator('iframe[title*="card number" i]'),
      ),
    ).toBeVisible({ timeout: 20_000 });

    // ── Primary assertion: button label shows the discounted total ($55) ───
    // FormattedPrice omits ".00" for whole-dollar USD amounts, so the rendered
    // text is "$55" not "$55.00".
    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const btnText = await submitBtn.textContent();
    expect(
      btnText,
      "Submit button should contain the discounted total, not the full price",
    ).toMatch(/\$55\b/);
    expect(
      btnText,
      "Submit button should NOT contain the full pre-discount price",
    ).not.toMatch(/\$65\b/);

    // ── Secondary assertion: order-summary sidebar total also shows $55 ────
    const sidebarTotal = page.getByTestId("text-total");
    await expect(sidebarTotal).toBeVisible({ timeout: 5_000 });
    const sidebarText = await sidebarTotal.textContent();
    expect(sidebarText, "Sidebar total should reflect the coupon discount").toMatch(/\$55\b/);
  });

  // ── 2. Card + no coupon → button shows full total ─────────────────────────

  test("card method: button shows full total when no coupon is applied", async ({ page }) => {
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        // Ensure no stale coupon keys exist.
        window.localStorage.removeItem("presentail_coupon_v1");
        window.localStorage.removeItem("presentail_coupon_discount_v1");
      },
      { cart: [CART_ITEM], location: LOCATION },
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    await expect(
      page.locator('[data-mock-stripe-field="cardNumber"]').or(
        page.locator('iframe[title*="card number" i]'),
      ),
    ).toBeVisible({ timeout: 20_000 });

    // Button should show the full price ($65). FormattedPrice omits ".00" for
    // whole-dollar USD amounts.
    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const btnText = await submitBtn.textContent();
    expect(
      btnText,
      "Submit button should show the full total when no coupon is applied",
    ).toMatch(/\$65\b/);
    expect(
      btnText,
      "Submit button should NOT show the discounted total when no coupon is applied",
    ).not.toMatch(/\$55\b/);

    // Sidebar should also show $65.
    const sidebarTotal = page.getByTestId("text-total");
    await expect(sidebarTotal).toBeVisible({ timeout: 5_000 });
    const sidebarText = await sidebarTotal.textContent();
    expect(sidebarText, "Sidebar total should be the full price when no coupon is applied").toMatch(/\$65\b/);
  });

  // ── 3. Whish (non-wallet, offline method) + coupon ────────────────────────
  // The Whish button shows "Pay with Whish App" (brand copy, no total), so we
  // assert the order-summary sidebar — the canonical price surface — shows the
  // discounted total correctly regardless of the active payment method.

  test("whish method (non-wallet): order-summary sidebar shows discounted total when coupon is applied", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ cart, location, couponKey, couponDiscountKey, couponCode, couponDiscount }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(couponKey, couponCode);
        window.localStorage.setItem(couponDiscountKey, String(couponDiscount));
      },
      {
        cart: [CART_ITEM],
        location: LOCATION,
        couponKey: COUPON_KEY,
        couponDiscountKey: COUPON_DISCOUNT_KEY,
        couponCode: COUPON_CODE,
        couponDiscount: COUPON_DISCOUNT_USD,
      },
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Whish is available in LB + USD.
    const whishOption = page.getByTestId("option-payment-whish");
    await expect(whishOption).toBeVisible({ timeout: 10_000 });
    await whishOption.click();

    // The Whish submit button shows brand copy ("Pay with Whish App"), not a
    // price amount. Assert the expected label so we catch accidental copy changes.
    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const whishBtnText = await submitBtn.textContent();
    expect(
      whishBtnText,
      "Whish button should show brand copy, not a price amount",
    ).toMatch(/Pay with Whish App/i);

    // Order-summary sidebar total must reflect the coupon discount. FormattedPrice
    // omits ".00" for whole-dollar USD amounts, so the rendered text is "$55" not "$55.00".
    const sidebarTotal = page.getByTestId("text-total");
    await expect(sidebarTotal).toBeVisible({ timeout: 5_000 });
    const sidebarText = await sidebarTotal.textContent();
    expect(
      sidebarText,
      "Sidebar total should show the discounted amount regardless of payment method",
    ).toMatch(/\$55\b/);
    expect(
      sidebarText,
      "Sidebar total must NOT show the pre-discount price when a coupon is applied",
    ).not.toMatch(/\$65\b/);
  });
});
