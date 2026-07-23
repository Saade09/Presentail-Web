/**
 * E2E: Loyalty points toggle in the checkout order summary panel
 *
 * The loyalty toggle is shown on step 2 (payment) when the authenticated user
 * has an active loyalty coupon.  Five scenarios are covered:
 *
 *  1. Happy path — toggle appears, user switches it on, the discount row
 *     updates in the order summary, and the coupon code is included in the
 *     POST /woo/order payload.
 *
 *  2. Page-refresh mid-checkout — if the loyalty coupon code was already
 *     applied (stored in localStorage from a previous session or an earlier
 *     visit to step 2), navigating back to step 2 after a full page reload
 *     shows the toggle in the ON state without requiring the user to toggle
 *     it again.
 *
 *  3. Manual coupon already applied guard — when a *different* coupon is
 *     active, the loyalty toggle is rendered but disabled so the user cannot
 *     accidentally swap a higher-value coupon for the loyalty reward.
 *
 *  4. API error (500 / network failure) — when /api/loyalty/me returns a
 *     server error, the loyalty toggle section is NOT rendered so shoppers
 *     are never left with a broken UI element and checkout is not blocked.
 *
 *  5. Slow API response (3 s delay) — the toggle still appears and is
 *     functional once the delayed response finally arrives, so a temporarily
 *     slow backend does not permanently hide the loyalty feature.
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
const FAKE_ORDER_ID = "TEST-LOYALTY-E2E-001";
const FAKE_PI_SECRET = "pi_test_loyalty_secret_xyz";

/** Loyalty coupon seeded in /api/loyalty/me stub. */
const LOYALTY_CODE = "LOYAL15";
const LOYALTY_DISCOUNT_USD = 10; // what /coupons/validate returns
const LOYALTY_POINTS = 250;
const LOYALTY_DISCOUNT_PCT = 15;

/** A different manual coupon pre-applied (used in the guard test). */
const MANUAL_COUPON_CODE = "SAVE20";
const MANUAL_COUPON_DISCOUNT_USD = 20;

const FULL_PRICE_USD = 65;

/** localStorage key names (must match Cart.tsx / Checkout.tsx exports). */
const COUPON_KEY = "presentail_coupon_v1";
const COUPON_DISCOUNT_KEY = "presentail_coupon_discount_v1";
const AUTH_TOKEN_KEY = "presentail_web_token";

// ---------------------------------------------------------------------------
// Mock Stripe (minimal — needed for payment step to render without CDN errors)
// ---------------------------------------------------------------------------

const MOCK_STRIPE_SCRIPT = `
(function() {
  function MockStripeElement(type) {
    this._type = type;
  }
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

/** Stub user returned by /api/auth/me when a token is present in localStorage.
 *  Phone is included so `hasProfilePhone` is true and the sender-phone field is
 *  hidden, meaning the only required step-1 inputs are the recipient fields. */
const STUB_USER = {
  ok: true,
  user: { id: 42, email: "loyalty-user@example.com", firstName: "Loyalty", lastName: "User", phone: VALID_LB_PHONE },
};

/** Stub returned by /api/loyalty/me — one active loyalty coupon. */
const STUB_LOYALTY_ME = {
  ok: true,
  loyalty: {
    points: LOYALTY_POINTS,
    coupons: [
      { code: LOYALTY_CODE, discountPercent: LOYALTY_DISCOUNT_PCT, status: "active" },
    ],
  },
};

/** Stub returned by /api/coupons/validate for the loyalty coupon. */
const STUB_COUPON_VALIDATE_OK = {
  ok: true,
  discountAmountUsd: LOYALTY_DISCOUNT_USD,
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
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
  // Auth/me — must come before navigation so the token-carrying effect resolves to a user.
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_USER) }),
  );
  // Loyalty coupon endpoint — called when user + step===2.
  await page.route("**/api/loyalty/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_LOYALTY_ME) }),
  );
  // Coupon validate — called when the loyalty toggle is switched on.
  await page.route("**/api/coupons/validate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_COUPON_VALIDATE_OK) }),
  );
  // CyberSource availability — return `available: false` so the Stripe card
  // tile renders for LB+USD (csAvailable=true hides the Stripe tile).
  await page.route("**/api/payment/cybersource/available", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) }),
  );
  // Default woo/order stub (tests that capture the body override this per-test).
  await page.route("**/api/woo/order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: LOYALTY_DISCOUNT_USD }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Navigation helper: advance from step 1 to step 2 (payment).
// Assumes the user is already on the checkout page (navigated with ?guest=1).
// Note: ?guest=1 bypasses the login dialog but does NOT prevent AuthContext
// from picking up the token in localStorage and calling /api/auth/me, so
// `user` is still set on step 2 — the loyalty coupon fetch fires normally.
// ---------------------------------------------------------------------------

async function advanceToPaymentStep(page: Page): Promise<void> {
  // Dismiss the login dialog if it still appears (should not with ?guest=1,
  // but kept as a safety net).
  const guestBtn = page.getByTestId("button-checkout-as-guest");
  if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await guestBtn.click();
  }

  const recipientFirstName = page.getByTestId("input-recipient-first-name");
  await expect(recipientFirstName).toBeVisible({ timeout: 20_000 });

  // "No address needed" skips district fields so the Continue button enables immediately.
  await page.getByTestId("check-no-address").click();
  await recipientFirstName.fill("Ahmad");
  await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);

  // When the user is logged in, sender name/email are shown as a read-only
  // summary panel (`sender-summary`) rather than editable fields — no fill
  // needed. The stub user includes a phone so the sender-phone field is also
  // hidden (`hasProfilePhone` → true). For a guest, fill all fields.
  const senderSummary = page.getByTestId("sender-summary");
  const isLoggedIn = await senderSummary.isVisible({ timeout: 2_000 }).catch(() => false);
  if (!isLoggedIn) {
    await page.getByTestId("input-sender-first-name").fill("Loyalty");
    await page.getByTestId("input-sender-email").fill("loyalty-user@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);
  }

  // On the chromium (1280px) project, the sidebar CTA (`button-continue-to-
  // payment-sidebar`) is the visible continue button; the mobile CTA
  // (`button-continue-to-payment`) is inside `lg:hidden` and not clickable.
  // Both call the same `handleValidateAndAdvance` handler.
  const sidebarCta = page.getByTestId("button-continue-to-payment-sidebar");
  const mobileCta = page.getByTestId("button-continue-to-payment");
  const isSidebarVisible = await sidebarCta.isVisible({ timeout: 3_000 }).catch(() => false);
  const continueBtn = isSidebarVisible ? sidebarCta : mobileCta;
  await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
  await continueBtn.click();
}

// ---------------------------------------------------------------------------
// Helper: resolve the loyalty toggle locator regardless of viewport.
//
// The desktop sidebar toggle (`toggle-loyalty-points-sidebar`) is always
// visible at lg+ breakpoints. On narrow viewports the mobile section
// (`toggle-loyalty-points`) is used instead, but it lives inside a
// collapsible summary — expand it first if needed.
// ---------------------------------------------------------------------------

async function getLoyaltyToggle(page: Page) {
  const sidebarToggle = page.getByTestId("toggle-loyalty-points-sidebar");
  const mobileToggle = page.getByTestId("toggle-loyalty-points");

  // Prefer the desktop sidebar — visible at 1280px without any extra clicks.
  // Use a generous timeout: under 2-worker parallel runs the page can be
  // slower to mount, delaying the loyalty/me call and the toggle render.
  if (await sidebarToggle.isVisible({ timeout: 15_000 }).catch(() => false)) {
    return sidebarToggle;
  }

  // On narrow viewports the summary is collapsed by default; open it first.
  const summaryToggle = page.getByTestId("button-summary-toggle");
  if (await summaryToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await summaryToggle.click();
  }

  return mobileToggle;
}

// ---------------------------------------------------------------------------
// Helper: get the visible order total element regardless of viewport.
// ---------------------------------------------------------------------------

function getVisibleTotal(page: Page) {
  // Both mobile and desktop sections have data-testid="text-total"; use :visible
  // so we get the displayed one and not the hidden counterpart.
  return page.locator('[data-testid="text-total"]:visible').first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Checkout — loyalty points toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await installBaseStubs(page);
  });

  // ── 1. Happy path: toggle appears, toggle on → discount row + order payload ─

  test("loyalty toggle appears on step 2, toggling on applies discount and sends coupon code in order payload", async ({
    page,
  }) => {
    // This test covers: advance to step 2, wait for loyalty/me, toggle ON,
    // validate coupon, place order, verify payload — more steps than the 30s
    // default, so we extend the limit.
    test.setTimeout(60_000);
    // Seed cart + location + a fake auth token so the user is "logged in".
    await page.addInitScript(
      ({ cart, location, authKey, fakeToken }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(authKey, fakeToken);
        // Ensure no stale coupon from a previous run.
        window.localStorage.removeItem("presentail_coupon_v1");
        window.localStorage.removeItem("presentail_coupon_discount_v1");
      },
      { cart: [CART_ITEM], location: LOCATION, authKey: AUTH_TOKEN_KEY, fakeToken: "fake.loyalty.jwt" },
    );

    // Capture the woo/order request body to assert coupon code inclusion.
    let capturedOrderPayload: Record<string, unknown> | null = null;
    await page.route("**/api/woo/order", (route) => {
      try {
        const body = route.request().postData();
        if (body) capturedOrderPayload = JSON.parse(body) as Record<string, unknown>;
      } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: LOYALTY_DISCOUNT_USD }),
      });
    });

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // ── Assert the loyalty toggle appears on step 2 ──────────────────────────

    const loyaltyToggle = await getLoyaltyToggle(page);
    await expect(loyaltyToggle).toBeVisible({ timeout: 10_000 });

    // Toggle must start in the OFF state (no coupon pre-applied).
    // The Switch root element is aria-checked when on.
    await expect(loyaltyToggle).toHaveAttribute("aria-checked", "false");

    // ── Toggle the loyalty switch ON ─────────────────────────────────────────

    await loyaltyToggle.click();

    // After clicking, handleCouponApply(LOYAL15) is called → validate succeeds.
    // The toggle should flip to ON.
    await expect(loyaltyToggle).toHaveAttribute("aria-checked", "true", { timeout: 8_000 });

    // ── Confirm the discount is reflected in the order summary ───────────────

    // When loyaltyToggleOn is true, the discount appears inline inside the
    // loyalty card (·−$10 in green), NOT in row-coupon-discount (which is only
    // rendered when a non-loyalty coupon is active). Assert on the inline span
    // first, then verify the grand total.
    const inlineDiscount = page
      .locator('[data-testid="loyalty-inline-discount-sidebar"]:visible, [data-testid="loyalty-inline-discount"]:visible')
      .first();
    await expect(inlineDiscount).toBeVisible({ timeout: 8_000 });
    const inlineText = await inlineDiscount.textContent();
    expect(inlineText, "Inline loyalty discount must show the $10 amount").toMatch(/\$10\b/);

    const totalEl = getVisibleTotal(page);
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    const totalText = await totalEl.textContent();
    expect(totalText, "Order total should reflect loyalty discount ($55)").toMatch(/\$55\b/);
    expect(totalText, "Order total should NOT show the full $65 price").not.toMatch(/\$65\b/);

    // ── Place the order and verify coupon code in the payload ────────────────

    // Select card payment method to activate the submit button.
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
    const url = page.url();
    expect(url).toContain("status=success");

    // The woo/order payload must include the loyalty coupon code.
    expect(capturedOrderPayload, "Order payload must not be null").not.toBeNull();
    expect(
      capturedOrderPayload?.couponCode,
      "Order payload must include the loyalty coupon code",
    ).toBe(LOYALTY_CODE);
  });

  // ── 2. Page refresh mid-checkout — toggle restored from localStorage ───────

  test("loyalty toggle shows ON after page refresh when coupon code was already stored in localStorage", async ({
    page,
  }) => {
    // Two full checkout flows (toggle ON, reload, re-advance) need extra time,
    // especially under 2-worker parallel runs.
    test.setTimeout(90_000);

    // Seed cart + location + auth token only (no pre-seeded coupon — we will
    // toggle it on in-session and then reload to verify persistence).
    await page.addInitScript(
      ({ cart, location, authKey, fakeToken }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(authKey, fakeToken);
      },
      { cart: [CART_ITEM], location: LOCATION, authKey: AUTH_TOKEN_KEY, fakeToken: "fake.loyalty.jwt" },
    );

    // ── First visit: advance to step 2 and toggle loyalty ON ──────────────────

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    const loyaltyToggle = await getLoyaltyToggle(page);
    await expect(loyaltyToggle).toBeVisible({ timeout: 15_000 });

    // Toggle must start OFF (no coupon was pre-applied).
    await expect(loyaltyToggle, "Toggle must start OFF on first visit").toHaveAttribute(
      "aria-checked",
      "false",
      { timeout: 5_000 },
    );

    // Switch ON — triggers /coupons/validate, coupon code written to localStorage.
    await loyaltyToggle.click();
    await expect(
      loyaltyToggle,
      "Toggle must turn ON after click",
    ).toHaveAttribute("aria-checked", "true", { timeout: 8_000 });

    // ── Full page reload ───────────────────────────────────────────────────────
    // page.route() stubs persist across reloads, so API interception stays active.
    await page.reload();

    // ── Second visit: re-advance to step 2 ────────────────────────────────────
    await advanceToPaymentStep(page);

    // After step 2 loads: /loyalty/me returns LOYAL15; the coupon code written
    // to localStorage in the first visit matches → loyaltyToggleOn === true.
    const toggleAfterReload = await getLoyaltyToggle(page);
    await expect(toggleAfterReload).toBeVisible({ timeout: 15_000 });

    await expect(
      toggleAfterReload,
      "Toggle must be ON after page reload — coupon code was persisted in localStorage",
    ).toHaveAttribute("aria-checked", "true", { timeout: 8_000 });

    // Discount should still be applied: $65 − $10 (loyalty) = $55.
    const totalEl = getVisibleTotal(page);
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    const totalText = await totalEl.textContent();
    expect(totalText, "Total must show the discounted amount after reload").toMatch(/\$55\b/);
    expect(totalText).not.toMatch(/\$65\b/);
  });

  // ── 3. Manual coupon already applied → loyalty toggle is disabled ──────────

  test("loyalty toggle is disabled when a different manual coupon is already applied", async ({
    page,
  }) => {
    test.setTimeout(45_000); // extra headroom for 2-worker parallel runs
    // Pre-seed a different manual coupon.
    await page.addInitScript(
      ({ cart, location, authKey, fakeToken, couponKey, couponDiscountKey, manualCode, manualDiscount }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(authKey, fakeToken);
        // Manual coupon — different from the loyalty code LOYAL15.
        window.localStorage.setItem(couponKey, manualCode);
        window.localStorage.setItem(couponDiscountKey, String(manualDiscount));
      },
      {
        cart: [CART_ITEM],
        location: LOCATION,
        authKey: AUTH_TOKEN_KEY,
        fakeToken: "fake.loyalty.jwt",
        couponKey: COUPON_KEY,
        couponDiscountKey: COUPON_DISCOUNT_KEY,
        manualCode: MANUAL_COUPON_CODE,
        manualDiscount: MANUAL_COUPON_DISCOUNT_USD,
      },
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // The loyalty toggle is rendered (user has an active loyalty coupon) but
    // disabled because a different coupon is already applied.
    const loyaltyToggle = await getLoyaltyToggle(page);
    await expect(loyaltyToggle).toBeVisible({ timeout: 10_000 });

    // Disabled when couponApplied && !loyaltyToggleOn (the manual code !== LOYAL15).
    await expect(
      loyaltyToggle,
      "Toggle must be disabled when a different manual coupon is already applied",
    ).toBeDisabled({ timeout: 8_000 });

    // The full price minus the MANUAL coupon should be the total:
    // $65 − $20 (manual discount) = $45.
    const totalEl = getVisibleTotal(page);
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    const totalText = await totalEl.textContent();
    expect(
      totalText,
      `Total should reflect the manual coupon discount ($${FULL_PRICE_USD - MANUAL_COUPON_DISCOUNT_USD})`,
    ).toMatch(/\$45\b/);
  });

  // ── 4. API error → loyalty toggle section is NOT rendered ─────────────────

  test("loyalty toggle is NOT shown when /api/loyalty/me returns a 500 error", async ({
    page,
  }) => {
    test.setTimeout(45_000);

    // Seed cart + location + auth token (user is "logged in").
    await page.addInitScript(
      ({ cart, location, authKey, fakeToken }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(authKey, fakeToken);
        window.localStorage.removeItem("presentail_coupon_v1");
        window.localStorage.removeItem("presentail_coupon_discount_v1");
      },
      { cart: [CART_ITEM], location: LOCATION, authKey: AUTH_TOKEN_KEY, fakeToken: "fake.loyalty.jwt" },
    );

    // Override the loyalty stub installed by beforeEach to return a 500.
    // Playwright routes are matched LIFO so this takes precedence.
    await page.route("**/api/loyalty/me", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Internal Server Error" }) }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // Give the failed fetch time to settle (loyaltyLoading → false, loyaltyCoupon stays null).
    // Both viewport variants of the toggle must be absent.
    const sidebarToggle = page.getByTestId("toggle-loyalty-points-sidebar");
    const mobileToggle  = page.getByTestId("toggle-loyalty-points");

    // Wait long enough that a successful response would have appeared, then
    // assert neither toggle is visible.
    await expect(sidebarToggle).not.toBeVisible({ timeout: 8_000 });
    await expect(mobileToggle).not.toBeVisible();

    // Checkout must still be usable: the payment step UI should be present.
    // Confirm the order-summary panel itself rendered (total row is visible).
    await expect(getVisibleTotal(page)).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Slow API response (3 s) → toggle appears and is functional ─────────

  test("loyalty toggle appears and works after a 3 s delay from /api/loyalty/me", async ({
    page,
  }) => {
    // 3 s delay + full toggle-on flow needs extra headroom.
    test.setTimeout(60_000);

    await page.addInitScript(
      ({ cart, location, authKey, fakeToken }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
        window.localStorage.setItem(authKey, fakeToken);
        window.localStorage.removeItem("presentail_coupon_v1");
        window.localStorage.removeItem("presentail_coupon_discount_v1");
      },
      { cart: [CART_ITEM], location: LOCATION, authKey: AUTH_TOKEN_KEY, fakeToken: "fake.loyalty.jwt" },
    );

    // Override the loyalty stub installed by beforeEach with a 3 s delay.
    await page.route("**/api/loyalty/me", async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_LOYALTY_ME),
      });
    });

    await page.goto("/en-lb/beirut/checkout?guest=1");
    await advanceToPaymentStep(page);

    // The toggle must appear once the delayed response arrives.
    // getLoyaltyToggle already uses a 15 s timeout — enough to cover the 3 s delay.
    const loyaltyToggle = await getLoyaltyToggle(page);
    await expect(loyaltyToggle).toBeVisible({ timeout: 15_000 });

    // Toggle must start in the OFF state.
    await expect(loyaltyToggle).toHaveAttribute("aria-checked", "false");

    // Toggle ON — loyalty discount should apply as normal.
    await loyaltyToggle.click();
    await expect(loyaltyToggle).toHaveAttribute("aria-checked", "true", { timeout: 8_000 });

    // Confirm the discount is reflected in the order total.
    const totalEl = getVisibleTotal(page);
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    const totalText = await totalEl.textContent();
    expect(totalText, "Order total should reflect loyalty discount ($55)").toMatch(/\$55\b/);
    expect(totalText).not.toMatch(/\$65\b/);
  });
});
