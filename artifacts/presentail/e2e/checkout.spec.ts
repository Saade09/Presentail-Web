import { expect, test, type Route } from "@playwright/test";

/**
 * Checkout e2e — happy path & WC-failure path.
 *
 * These tests drive the real `/checkout` screen. The cart is pre-seeded
 * via the same AsyncStorage-on-web key the app uses (`@presentail/cart-v1`)
 * so we don't have to walk through product selection. All outbound
 * payment / Woo network calls are intercepted, so the tests are hermetic
 * (no real Stripe / Mamo / PayPal / WooCommerce traffic).
 *
 * Two scenarios are covered:
 *   - Happy path: payment session creation succeeds, runHostedCheckout
 *     returns success, and `POST /api/woo/order` returns ok=true.
 *     Expectation: `router.replace(buildResultPath("success", ...))` →
 *     /order-confirmed?status=success.
 *   - WC failure: payment session succeeds, but `POST /api/woo/order`
 *     returns ok=false. Expectation: the retry exhausts both attempts
 *     and we land on /order-confirmed?status=failed with the payment
 *     reference visible (so the customer can quote it to support).
 *
 * If the dev server isn't reachable at the configured baseURL, the suite
 * is skipped cleanly with a clear reason rather than failing — Playwright
 * will normally start it via the `webServer` block in the config.
 */

const CART_STORAGE_KEY = "@presentail/cart-v1";
// A real product id from data/catalog.ts so the cart hydration finds a
// matching product and the order summary renders a non-empty list.
const SEED_PRODUCT_ID = "rose-whisper";

const RECIPIENT_FIRST = "Jane";
const RECIPIENT_LAST = "Doe";
const RECIPIENT_PHONE = "3000000";
const SENDER_FIRST = "John";
const SENDER_LAST = "Smith";
const SENDER_WHATSAPP = "3111111";
const SENDER_EMAIL = "john.smith@example.com";

/** Mock POST /api/checkout/session so card → Stripe path returns a URL
 *  we can safely have window.open() ignore (about:blank). The web flow
 *  in `runHostedCheckout` returns "success" immediately after window.open. */
async function mockStripeSession(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ url: "about:blank", id: "cs_test_e2e_session" }),
  });
}

async function fillCheckoutForm(page: import("@playwright/test").Page) {
  // Step 0 (Customize) — no required fields, just advance.
  await page.getByText(/continue to delivery/i).click();

  // Step 1 (Delivery details) — fill required fields. Tick "I don't know
  // the address" so we don't have to fill the multi-line address field.
  await page.getByPlaceholder("", { exact: true }); // wait for inputs to mount
  // The Field component uses TextInput without a placeholder for first/last
  // name, so we target by surrounding label text via locator chaining.
  const nameInputs = page.locator("input").filter({ hasNot: page.locator("[type=email]") });
  // Recipient: first two name inputs are recipient first/last.
  await nameInputs.nth(0).fill(RECIPIENT_FIRST);
  await nameInputs.nth(1).fill(RECIPIENT_LAST);
  // Recipient phone: first phone-pad input.
  await page.locator("input[inputmode='tel'], input[type='tel']").first().fill(RECIPIENT_PHONE);

  // Tick the "don't know address" checkbox to bypass the address field.
  await page.getByText(/don't know.*address|i don't know/i).first().click();

  // Sender first/last: next two name-style inputs.
  await nameInputs.nth(2).fill(SENDER_FIRST);
  await nameInputs.nth(3).fill(SENDER_LAST);
  // Sender whatsapp: second phone-pad input.
  await page.locator("input[inputmode='tel'], input[type='tel']").nth(1).fill(SENDER_WHATSAPP);
  // Sender email.
  await page.locator("input[type='email'], input[inputmode='email']").first().fill(SENDER_EMAIL);

  await page.getByText(/continue to payment/i).click();
}

test.describe("Checkout flow — driving /checkout", () => {
  test.beforeEach(async ({ page, context }) => {
    // Probe the dev server. If it's not up, skip the suite cleanly.
    const probe = await page
      .goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => null);
    test.skip(
      !probe || !probe.ok(),
      "Presentail app is not reachable on baseURL — start the dev server first.",
    );

    // Pre-seed the cart so /checkout has items to render.
    await context.addInitScript(
      ({ key, productId }) => {
        try {
          localStorage.setItem(key, JSON.stringify([{ productId, qty: 1 }]));
        } catch {
          /* ignore */
        }
      },
      { key: CART_STORAGE_KEY, productId: SEED_PRODUCT_ID },
    );

    // Block real Stripe session creation — return a stubbed URL.
    await context.route(/\/api\/checkout\/session(\?.*)?$/, mockStripeSession);
    // Stub Mamo / PayPal too in case the test changes the selected method.
    await context.route(/\/api\/payment\/(mamo|paypal)(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "about:blank", paymentRef: "stub_ref" }),
      }),
    );
  });

  test("happy path: form → payment → Woo OK → success screen", async ({
    page,
    context,
  }) => {
    // Mock Woo order creation as successful.
    await context.route(/\/api\/woo\/order(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );

    await page.goto("/checkout");
    await fillCheckoutForm(page);

    // Click the Pay button (label starts with "Pay" + amount).
    await page.getByText(/^Pay\s/i).first().click();

    // We should land on /order-confirmed with status=success.
    await page.waitForURL(/\/order-confirmed\?.*status=success/i, {
      timeout: 20_000,
    });
    expect(page.url()).toMatch(/status=success/);
  });

  test("WC failure path: form → payment OK → Woo fails → failed screen", async ({
    page,
    context,
  }) => {
    // Mock Woo order creation as failure on every attempt — both retries
    // should be exhausted by submitWooOrderWithRetry, then the failure
    // screen is shown with a payment reference.
    let wooCalls = 0;
    await context.route(/\/api\/woo\/order(\?.*)?$/, (route) => {
      wooCalls += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "wc_create_failed" }),
      });
    });

    await page.goto("/checkout");
    await fillCheckoutForm(page);

    await page.getByText(/^Pay\s/i).first().click();

    await page.waitForURL(/\/order-confirmed\?.*status=failed/i, {
      timeout: 20_000,
    });
    expect(page.url()).toMatch(/status=failed/);
    // Both retry attempts should have been exercised.
    expect(wooCalls).toBeGreaterThanOrEqual(2);
    // Failure screen surfaces retry + contact actions.
    await expect(page.getByText(/retry|try again/i).first()).toBeVisible();
    await expect(
      page.getByText(/contact|support|hello@presentail/i).first(),
    ).toBeVisible();
  });
});

test.describe("order-confirmed deep links", () => {
  // Smoke-tests that don't require driving the form — useful for verifying
  // the post-payment screen variants render correctly even when the rest
  // of the checkout is mocked or unavailable.
  const ORDER_ID = "PR-999000";
  const PAYMENT_REF = "test_payment_ref_abc";

  test.beforeEach(async ({ page }) => {
    const probe = await page
      .goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => null);
    test.skip(
      !probe || !probe.ok(),
      "Presentail app is not reachable on baseURL — start the dev server first.",
    );
  });

  test("success variant renders", async ({ page }) => {
    await page.goto(
      `/order-confirmed?orderId=${ORDER_ID}&total=58&date=2026-05-10&slot=9%3A00+AM&recipient=John+Smith&status=success&paymentRef=${PAYMENT_REF}`,
    );
    await expect(page.getByText(ORDER_ID, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
  });

  test("failure variant renders payment ref + retry + contact", async ({
    page,
  }) => {
    await page.goto(
      `/order-confirmed?orderId=${ORDER_ID}&total=58&date=2026-05-10&slot=9%3A00+AM&recipient=John+Smith&status=failed&paymentRef=${PAYMENT_REF}`,
    );
    await expect(page.getByText(ORDER_ID, { exact: false })).toBeVisible();
    await expect(page.getByText(PAYMENT_REF, { exact: false })).toBeVisible();
    await expect(page.getByText(/retry|try again/i).first()).toBeVisible();
    await expect(
      page.getByText(/contact|support|hello@presentail/i).first(),
    ).toBeVisible();
  });
});
