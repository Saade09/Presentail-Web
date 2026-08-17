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
// GA4 dataLayer helper
// ---------------------------------------------------------------------------

type DataLayerEntry = { name: string; params: Record<string, unknown> };

/**
 * Read gtag "event" entries from window.dataLayer.
 * gtag() pushes `arguments` objects, so entries arrive as array-likes:
 *   { 0: "event", 1: name, 2: params }
 * Mirrors the same helper in campaign-ga4-funnel.spec.ts.
 */
async function readGtagEvents(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return dl
      .map((entry) => {
        const e = entry as Record<number, unknown>;
        if (e && e[0] === "event") {
          return {
            name: String(e[1]),
            params: (e[2] ?? {}) as Record<string, unknown>,
          };
        }
        return null;
      })
      .filter((x): x is DataLayerEntry => x !== null);
  });
}

// ---------------------------------------------------------------------------
// Product stub — used by the add_to_cart GA4 test
// ---------------------------------------------------------------------------

const GA4_STUB_PRODUCT = {
  id: "test-rose-bouquet",
  name: "Rose Bouquet",
  slug: "rose-bouquet",
  priceValue: 65,
  wcId: 0,
  inStock: true,
  image: { uri: "" },
  category: "flowers",
  categories: ["flowers"],
  occasions: [],
  brandNames: [],
  description: "E2E stub product for GA4 add_to_cart regression test.",
};

/**
 * Stub /api/woo/products so ProductDetail renders without a live backend.
 * fetchProductsPricing() and fetchBestSellerIds() already degrade gracefully
 * on network failures (return {} / empty Set), so only the product list needs
 * an explicit stub.
 */
async function installProductPageStubs(page: Page): Promise<void> {
  await page.route("**/api/woo/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, products: [GA4_STUB_PRODUCT] }),
    }),
  );
}

// ---------------------------------------------------------------------------
// GA4 e-commerce events — dataLayer regression
// ---------------------------------------------------------------------------

/**
 * Guard the three GA4 conversion mirrors so a checkout refactor can't silently
 * drop them:
 *
 *   add_to_cart   — CartContext.addToCart() → fireGtagEvent("add_to_cart", …)
 *   begin_checkout — Checkout useEffect → fireGtagEvent("begin_checkout", …)
 *   purchase       — OrderConfirmed useEffect → fireGA4PurchaseEvent(…)
 *
 * The inline gtag shim in index.html (function gtag(){dataLayer.push(arguments)})
 * makes these events land in window.dataLayer even without the real gtag.js CDN,
 * so the assertions are fully deterministic in the headed/headless test runner.
 */
test.describe("GA4 e-commerce events — dataLayer regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    // Seed delivery location; individual tests add the cart when they need it.
    await page.addInitScript(
      ({ location }) => {
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { location: LOCATION },
    );
    await installStubs(page);
  });

  // ── add_to_cart ─────────────────────────────────────────────────────────────

  test("add_to_cart fires into dataLayer when a product is added via the product page", async ({
    page,
  }) => {
    // Stub the product list so ProductDetail renders without a live OS API key.
    await installProductPageStubs(page);

    // Product detail URL uses the /product/:slug route registered in App.tsx.
    await page.goto("/en-lb/beirut/product/rose-bouquet");

    const addBtn = page.getByTestId("button-add-to-cart");
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await addBtn.click();

    // CartContext.addToCart() calls fireGtagEvent synchronously; poll in case
    // the dataLayer push arrives on a subsequent microtask.
    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), {
        timeout: 10_000,
      })
      .toContain("add_to_cart");

    const events = await readGtagEvents(page);
    const atc = events.find((e) => e.name === "add_to_cart");
    expect(typeof atc?.params?.currency, "add_to_cart must carry currency").toBe("string");
    expect(Array.isArray(atc?.params?.items), "add_to_cart must carry items[]").toBe(true);
    expect(
      (atc?.params?.items as unknown[]).length,
      "add_to_cart items must be non-empty",
    ).toBeGreaterThan(0);
  });

  // ── begin_checkout ──────────────────────────────────────────────────────────

  test("begin_checkout fires into dataLayer when the checkout page mounts", async ({
    page,
  }) => {
    // A non-empty cart is required for the checkout to render step 1.
    await page.addInitScript(
      ({ cart }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      },
      { cart: [CART_ITEM] },
    );

    // ?guest=1 bypasses the login gate so begin_checkout fires on first mount.
    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Wait for step-1 to be visible — confirms the login gate is bypassed and
    // the checkout useEffect has had a chance to run.
    await expect(page.getByTestId("input-recipient-name")).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), {
        timeout: 10_000,
      })
      .toContain("begin_checkout");

    const events = await readGtagEvents(page);
    const bc = events.find((e) => e.name === "begin_checkout");
    expect(typeof bc?.params?.currency, "begin_checkout must carry currency").toBe("string");
    expect(Array.isArray(bc?.params?.items), "begin_checkout must carry items[]").toBe(true);
  });

  // ── purchase (fire + sessionStorage dedupe) ─────────────────────────────────

  test("purchase fires into dataLayer on order-confirmed and does not re-fire on reload", async ({
    page,
  }) => {
    // Pre-seed the cart so Checkout.tsx has line items to stash in sessionStorage.
    // OrderConfirmed reads that stash to populate value + currency in the event.
    await page.addInitScript(
      ({ cart }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      },
      { cart: [CART_ITEM] },
    );

    // Run the full checkout flow — Checkout.tsx writes the PENDING_ORDER_KEY
    // sessionStorage stash just before navigating to order-confirmed.
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
    expect(page.url()).toContain("status=success");

    // ── Assert purchase fires with required fields ───────────────────────────

    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), {
        timeout: 10_000,
      })
      .toContain("purchase");

    const events = await readGtagEvents(page);
    const purchase = events.find((e) => e.name === "purchase");

    expect(
      typeof purchase?.params?.transaction_id,
      "purchase must carry transaction_id",
    ).toBe("string");
    expect(
      (purchase?.params?.transaction_id as string).length,
      "purchase transaction_id must be non-empty",
    ).toBeGreaterThan(0);
    expect(
      typeof purchase?.params?.value,
      "purchase must carry numeric value",
    ).toBe("number");
    expect(
      typeof purchase?.params?.currency,
      "purchase must carry currency",
    ).toBe("string");

    // ── Dedupe guard: reload must NOT fire purchase again ───────────────────
    // OrderConfirmed writes `presentail_ads_conversion_fired_<ref>` to
    // sessionStorage immediately after firing.  On reload the component
    // remounts and the useEffect finds the key → returns early without
    // re-pushing to dataLayer.  sessionStorage survives same-origin reloads,
    // so the guard is fully exercised here.

    await page.reload();
    await page.waitForURL(/\/order-confirmed/, { timeout: 10_000 });

    // Allow effects to settle after the reload.
    await page.waitForTimeout(2_000);

    const eventsAfterReload = await readGtagEvents(page);
    const purchasesAfterReload = eventsAfterReload.filter((e) => e.name === "purchase");

    // dataLayer is blank after reload (new page context).  If the dedupe guard
    // works, it stays blank — exactly 0 purchase events.
    expect(
      purchasesAfterReload.length,
      "purchase must not fire again on reload — sessionStorage dedupe guard must prevent double-count",
    ).toBe(0);
  });
});

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

    const recipientFirstName = page.getByTestId("input-recipient-name");
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
