/**
 * E2E tests: personalisation note (customNote / customInput) persistence
 *
 * Covers two guarantees:
 *
 * 1. **localStorage persistence** — the customNote typed into the cart item's
 *    personalisation field survives a full page reload. This guards against
 *    regressions where the CartContext save-effect or the hydration filter
 *    silently drops the field (e.g. a schema-validation change that strips
 *    unknown keys, or a missing field in the filter predicate).
 *
 * 2. **Order-payload mapping** — the customNote flows through
 *    buildOrderPayload() and reaches the POST /api/woo/order body as
 *    `items[].customInput`. A silent regression here would send orders to the
 *    API server with the note stripped, losing the shopper's personalisation
 *    without any visible UI error.
 *
 * All network calls are intercepted so the tests run hermetically.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PRODUCT_ID = "test-personalized-rose";
const CUSTOM_NOTE = "Happy Birthday!";

/** Cart item with hasInputField:true so the note input renders in Cart.tsx */
const CART_ITEM_WITH_NOTE = {
  product: {
    id: PRODUCT_ID,
    name: "Personalized Rose",
    slug: "personalized-rose",
    priceValue: 65,
    wcId: 0,
    hasInputField: true,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
  customNote: CUSTOM_NOTE,
};

/** Same product, no note — used for the "type then reload" test */
const CART_ITEM_NO_NOTE = { ...CART_ITEM_WITH_NOTE, customNote: undefined };

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };
const VALID_LB_PHONE = "+96170000000";
const FAKE_ORDER_ID = "TEST-PERSNOTE-001";
const FAKE_PI_ID = "pi_test_persnote";
const FAKE_CLIENT_SECRET = "pi_test_persnote_secret_abc";

// ---------------------------------------------------------------------------
// Stripe mock (same pattern as checkout-full-flow.spec.ts)
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

  function MockElements() { this._elements = {}; }
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
  MockStripe.prototype.elements = function() { if (!this._el) this._el = new MockElements(); return this._el; };
  MockStripe.prototype.createToken = function() { return Promise.resolve({ token: { id: 'tok_mock' } }); };
  MockStripe.prototype.createPaymentMethod = function() { return Promise.resolve({ paymentMethod: { id: 'pm_mock' } }); };
  MockStripe.prototype.confirmCardPayment = function(cs) {
    return Promise.resolve({ paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: cs }, error: undefined });
  };
  MockStripe.prototype.paymentRequest = function() {
    return { canMakePayment: function() { return Promise.resolve(null); }, on: function() {}, off: function() {}, show: function() {}, update: function() {} };
  };
  MockStripe.prototype.confirmPayment = function() { return Promise.resolve({ error: null }); };
  MockStripe.prototype.handleNextAction = function() { return Promise.resolve({ paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded' } }); };
  MockStripe.prototype.retrievePaymentIntent = function(cs) { return Promise.resolve({ paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: cs } }); };
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};

  window.Stripe = function(key) { return new MockStripe(key); };
})();
`;

// ---------------------------------------------------------------------------
// API stubs helpers
// ---------------------------------------------------------------------------

async function installCommonStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (route) =>
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

  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }),
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

  // Silence Stripe CDN.
  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: MOCK_STRIPE_SCRIPT }),
  );
}

async function installCheckoutStubs(page: Page): Promise<void> {
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }),
    }),
  );

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
}

// ---------------------------------------------------------------------------
// Test suite 1 — localStorage persistence
// ---------------------------------------------------------------------------

test.describe("Cart personalisation note — localStorage persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await installCommonStubs(page);
  });

  test("note typed in UI is saved to localStorage and survives a page reload", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Go to the root first (a neutral page) so we can call page.evaluate to
    // write localStorage before loading the cart. page.evaluate runs once and
    // is NOT re-run on subsequent navigations, unlike addInitScript — this is
    // the key difference that makes the reload test accurate: the seed is only
    // applied once, so the reload reads whatever the CartContext save-effect
    // wrote, not a fresh blank seed.
    await page.goto("/en-lb/beirut/");

    // Seed the cart WITHOUT a customNote and set the delivery location.
    await page.evaluate(
      ({ cart, location, cartKey, locationKey }: {
        cart: unknown[]; location: unknown; cartKey: string; locationKey: string;
      }) => {
        window.localStorage.setItem(cartKey, JSON.stringify(cart));
        window.localStorage.setItem(locationKey, JSON.stringify(location));
      },
      {
        cart: [CART_ITEM_NO_NOTE],
        location: LOCATION,
        cartKey: "presentail_cart_v1",
        locationKey: "presentail_delivery_location_v1",
      },
    );

    // Navigate to the cart page — CartContext hydrates from localStorage.
    await page.goto("/en-lb/beirut/cart");

    const noteInput = page.getByTestId(`input-cart-note-${PRODUCT_ID}`);
    await expect(noteInput).toBeVisible({ timeout: 15_000 });
    // No note yet.
    await expect(noteInput).toHaveValue("");

    // Type the personalisation note via the UI. This calls updateCustomNote →
    // setItems, and the CartContext save-effect writes the updated items
    // (including customNote) back to localStorage.
    await noteInput.fill(CUSTOM_NOTE);
    await expect(noteInput).toHaveValue(CUSTOM_NOTE);

    // Poll localStorage until the CartContext save-effect has flushed the note.
    await page.waitForFunction(
      ({ key, expected }: { key: string; expected: string }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) && parsed.some((i: any) => i.customNote === expected);
        } catch { return false; }
      },
      { key: "presentail_cart_v1", expected: CUSTOM_NOTE },
      { timeout: 5_000 },
    );

    // Reload the page. Because page.evaluate (not addInitScript) wrote the
    // initial seed, no re-seeding happens on reload. The CartProvider will
    // read from whatever the save-effect wrote — the note-bearing entry.
    await page.reload({ waitUntil: "domcontentloaded" });

    // The CartProvider's load-on-mount effect must restore the note.
    const noteInputAfterReload = page.getByTestId(`input-cart-note-${PRODUCT_ID}`);
    await expect(noteInputAfterReload).toBeVisible({ timeout: 15_000 });
    await expect(noteInputAfterReload).toHaveValue(CUSTOM_NOTE);

    expect(
      pageErrors.filter((e) => !e.includes("ResizeObserver loop")),
      `unexpected page errors: ${pageErrors.join(" | ")}`,
    ).toEqual([]);
  });

  test("note is preserved in localStorage JSON after typing via UI", async ({ page }) => {
    // Seed the cart WITHOUT a note so we can type it via the UI.
    await page.addInitScript(
      ({ cart, location }: { cart: unknown[]; location: unknown }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM_NO_NOTE], location: LOCATION },
    );

    await page.goto("/en-lb/beirut/cart");

    const noteInput = page.getByTestId(`input-cart-note-${PRODUCT_ID}`);
    await expect(noteInput).toBeVisible({ timeout: 15_000 });

    await noteInput.fill(CUSTOM_NOTE);
    await expect(noteInput).toHaveValue(CUSTOM_NOTE);

    // Poll localStorage until the CartContext save-effect has flushed the note.
    await page.waitForFunction(
      ({ key, expected }: { key: string; expected: string }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) && parsed.some((i: any) => i.customNote === expected);
        } catch { return false; }
      },
      { key: "presentail_cart_v1", expected: CUSTOM_NOTE },
      { timeout: 5_000 },
    );

    // Read localStorage directly and assert customNote is serialized correctly.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("presentail_cart_v1"),
    );
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    const item = parsed[0];
    expect(item.customNote).toBe(CUSTOM_NOTE);
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — note flows through to the order payload as customInput
// ---------------------------------------------------------------------------

test.describe("Cart personalisation note — reaches order payload as customInput", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);

    // Seed the cart WITH a pre-filled customNote so we don't have to navigate
    // to the cart page first — the checkout test drives directly from the
    // checkout URL (mirrors how a shopper navigates from cart → checkout).
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM_WITH_NOTE], location: LOCATION },
    );

    await installCommonStubs(page);
    await installCheckoutStubs(page);
  });

  test("customNote appears as customInput in the POST /woo/order body", async ({
    page,
  }) => {
    // Capture the body sent to POST /api/woo/order.
    let capturedWooOrder: Record<string, unknown> | null = null;

    await page.route("**/api/woo/order", (route) => {
      try {
        const body = route.request().postData();
        if (body) capturedWooOrder = JSON.parse(body);
      } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: 0 }),
      });
    });

    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Dismiss login dialog if shown.
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // Step 1 — fill required fields.
    const recipientFirstName = page.getByTestId("input-recipient-name");
    await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("check-no-address").click();
    await recipientFirstName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("guest@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    // Continue to payment step.
    const continueBtn = page.getByTestId("button-continue-to-payment");
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();

    // Select credit card.
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    // Wait for mock Stripe card field to mount.
    await expect(
      page.locator('[data-mock-stripe-field="cardNumber"]').or(
        page.locator('iframe[title*="card number" i]'),
      ),
    ).toBeVisible({ timeout: 20_000 });

    // Place the order.
    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Wait for order confirmation.
    await page.waitForURL(/\/order-confirmed/, { timeout: 20_000 });
    expect(page.url()).toContain("status=success");

    // Assert the WC order payload carried the customNote as customInput.
    expect(capturedWooOrder).not.toBeNull();
    const items = capturedWooOrder?.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const orderItem = items[0];
    expect(orderItem.customInput).toBe(CUSTOM_NOTE);
    // The OS slug (product.id) must also be present so the API can look up the
    // OS numeric id — a regression here would route the item to the wrong product.
    expect(orderItem.osSlug).toBe(PRODUCT_ID);
  });

  test("customNote also reaches the payment-intent items array as customInput", async ({
    page,
  }) => {
    let capturedIntentBody: Record<string, unknown> | null = null;

    await page.route("**/api/checkout/payment-intent", (route) => {
      try {
        const body = route.request().postData();
        if (body) capturedIntentBody = JSON.parse(body);
      } catch { /* ignore */ }
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
      });
    });

    await page.route("**/api/woo/order", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: 0 }),
      }),
    );

    await page.goto("/en-lb/beirut/checkout?guest=1");

    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    const recipientFirstName = page.getByTestId("input-recipient-name");
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

    // The payment-intent body uses the same buildOrderPayload() helper as the
    // woo order, so customInput must be present there too.
    expect(capturedIntentBody).not.toBeNull();
    const intentItems = capturedIntentBody?.items as Array<Record<string, unknown>>;
    expect(Array.isArray(intentItems)).toBe(true);
    expect(intentItems.length).toBeGreaterThan(0);
    expect(intentItems[0].customInput).toBe(CUSTOM_NOTE);
  });
});
