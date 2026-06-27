/**
 * E2e test: payment logo badges do not overflow at 375 px phone width.
 *
 * The checkout payment step shows a list of payment method options, each
 * containing a logo badge (CardIcons with Amex + Mastercard + Visa,
 * ApplePayBadge, GooglePayBadge, etc.). This test advances through the
 * checkout form to the payment step at the narrowest common phone width
 * (375 px) and asserts:
 *
 *   1. The `payment-card-icons` row (three badges side-by-side) does not
 *      bleed past the right viewport edge.
 *   2. The entire `payment-options` container does not cause a page-level
 *      horizontal scrollbar.
 *
 * The Expo app is rendered as a web build for these tests (same screen,
 * same layout logic) so the standard DOM overflow APIs apply.
 *
 * All outbound network calls are intercepted — no real backend required.
 */

import { expect, test, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

const PHONE = { width: 375, height: 812 };

// ---------------------------------------------------------------------------
// Cart seed
// ---------------------------------------------------------------------------

const CART_STORAGE_KEY = "@presentail/cart-v1";
const SEED_PRODUCT_ID = "rose-whisper";

// ---------------------------------------------------------------------------
// Network stubs
// ---------------------------------------------------------------------------

async function mockStripeSession(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ url: "about:blank", id: "cs_test_overflow_stub" }),
  });
}

// ---------------------------------------------------------------------------
// Form helper — advances checkout to the payment step
// ---------------------------------------------------------------------------

async function fillToPaymentStep(page: Page) {
  // Step 0 (Customize) — no required fields, just advance.
  await page.getByText(/continue to delivery/i).click();

  // Step 1 (Delivery details) — fill required fields.
  // Target name inputs by excluding email/tel inputs.
  const nameInputs = page
    .locator("input")
    .filter({ hasNot: page.locator("[type=email]") });
  await nameInputs.nth(0).fill("Jane");
  await nameInputs.nth(1).fill("Doe");
  await page
    .locator("input[inputmode='tel'], input[type='tel']")
    .first()
    .fill("3000000");

  // Tick "I don't know the address" to bypass the address field.
  await page.getByText(/don't know.*address|i don't know/i).first().click();

  // Sender details.
  await nameInputs.nth(2).fill("John");
  await nameInputs.nth(3).fill("Smith");
  await page
    .locator("input[inputmode='tel'], input[type='tel']")
    .nth(1)
    .fill("3111111");
  await page
    .locator("input[type='email'], input[inputmode='email']")
    .first()
    .fill("john@example.com");

  // Advance to payment step.
  await page.getByText(/continue to payment/i).click();
}

// ---------------------------------------------------------------------------
// Overflow helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the page has a horizontal scrollbar — i.e. the rendered
 * content is wider than the viewport.
 */
async function pageHasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

/**
 * Returns true when the element identified by `testId` has its right edge
 * beyond the viewport right boundary.  A 1 px tolerance absorbs sub-pixel
 * rounding differences.
 */
async function elementOverflowsViewport(
  page: Page,
  testId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.right > window.innerWidth + 1;
  }, testId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Payment badges — no horizontal overflow at 375 px", () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page, context }) => {
    // Skip cleanly when the dev server is not running.
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

    // Stub payment network calls so the test is hermetic.
    await context.route(/\/api\/checkout\/session(\?.*)?$/, mockStripeSession);
    await context.route(
      /\/api\/payment\/(mamo|paypal)(\?.*)?$/,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "about:blank", paymentRef: "stub_ref" }),
        }),
    );
  });

  // -------------------------------------------------------------------------
  // 1. CardIcons row (Amex + Mastercard + Visa) — most likely to overflow
  // -------------------------------------------------------------------------

  test("WalletIcons row (Apple Pay + Google Pay) does not overflow at 375 px", async ({
    page,
    context,
  }) => {
    // Force walletSupported=true before React boots so the wallet rows are
    // rendered even though isPlatformPaySupported() always returns false in
    // the browser/Expo-web environment used by these tests.
    await context.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__PRESENTAIL_TEST_WALLET_SUPPORTED__ = true;
    });

    await page.goto("/checkout");
    await fillToPaymentStep(page);

    // The WalletIcons row (Apple Pay + Google Pay badges) must now be visible.
    const walletIcons = page.getByTestId("payment-wallet-icons");
    await expect(walletIcons).toBeVisible({ timeout: 10_000 });

    const rowOverflows = await elementOverflowsViewport(
      page,
      "payment-wallet-icons",
    );
    expect(
      rowOverflows,
      "WalletIcons row must not bleed past the right viewport edge at 375 px",
    ).toBe(false);

    const pageOverflows = await pageHasHorizontalOverflow(page);
    expect(
      pageOverflows,
      "page must have no horizontal scrollbar at 375 px when wallet icons are shown",
    ).toBe(false);
  });

  test("CardIcons row (Amex/Mastercard/Visa) does not overflow at 375 px", async ({
    page,
  }) => {
    await page.goto("/checkout");
    await fillToPaymentStep(page);

    // The CardIcons row is rendered inside the "card" PayOption which is the
    // default visible method, so it should be present immediately.
    const cardIcons = page.getByTestId("payment-card-icons");
    await expect(cardIcons).toBeVisible({ timeout: 10_000 });

    const rowOverflows = await elementOverflowsViewport(
      page,
      "payment-card-icons",
    );
    expect(
      rowOverflows,
      "CardIcons row must not bleed past the right viewport edge at 375 px",
    ).toBe(false);

    const pageOverflows = await pageHasHorizontalOverflow(page);
    expect(
      pageOverflows,
      "page must have no horizontal scrollbar at 375 px",
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Entire payment-options container
  // -------------------------------------------------------------------------

  test("payment-options container does not overflow at 375 px", async ({
    page,
  }) => {
    await page.goto("/checkout");
    await fillToPaymentStep(page);

    const paymentOptions = page.getByTestId("payment-options");
    await expect(paymentOptions).toBeVisible({ timeout: 10_000 });

    const containerOverflows = await elementOverflowsViewport(
      page,
      "payment-options",
    );
    expect(
      containerOverflows,
      "payment-options container must not bleed past the right viewport edge at 375 px",
    ).toBe(false);

    const pageOverflows = await pageHasHorizontalOverflow(page);
    expect(
      pageOverflows,
      "page must have no horizontal scrollbar at 375 px",
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Expanded Apple Pay tile — email field + security note visible
  // -------------------------------------------------------------------------

  test("payment-options and wallet icons do not overflow when Apple Pay tile is expanded at 375 px", async ({
    page,
    context,
  }) => {
    // Force walletSupported=true so the Apple Pay and Google Pay rows render.
    await context.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__PRESENTAIL_TEST_WALLET_SUPPORTED__ = true;
    });

    await page.goto("/checkout");
    await fillToPaymentStep(page);

    // The wallet icons row must be present.
    const walletIcons = page.getByTestId("payment-wallet-icons");
    await expect(walletIcons).toBeVisible({ timeout: 10_000 });

    // Tap the Apple Pay tile to make it the active (expanded) method.
    // Apple Pay is the default selection when walletSupported=true, but we
    // click it explicitly to guarantee the expanded state is rendered.
    await page.getByText(/^Apple Pay$/i).first().click();

    // Wait until the expanded children (email field) are visible — this is a
    // deterministic condition that avoids a fixed-duration sleep.
    await page
      .locator("[data-testid='payment-options'] input[inputmode='email'], [data-testid='payment-options'] input[type='email']")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {
        // Email field may already be mounted but off-screen; proceed regardless.
      });

    // The wallet-icons badge row must not bleed past the viewport.
    const walletOverflows = await elementOverflowsViewport(
      page,
      "payment-wallet-icons",
    );
    expect(
      walletOverflows,
      "payment-wallet-icons must not overflow when Apple Pay tile is expanded",
    ).toBe(false);

    // The overall payment-options container must not overflow either.
    const containerOverflows = await elementOverflowsViewport(
      page,
      "payment-options",
    );
    expect(
      containerOverflows,
      "payment-options container must not overflow when Apple Pay tile is expanded",
    ).toBe(false);

    const pageOverflows = await pageHasHorizontalOverflow(page);
    expect(
      pageOverflows,
      "page must have no horizontal scrollbar when Apple Pay tile is expanded at 375 px",
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Expanded Google Pay tile — email field + security note visible
  // -------------------------------------------------------------------------

  test("payment-options and wallet icons do not overflow when Google Pay tile is expanded at 375 px", async ({
    page,
    context,
  }) => {
    // Force walletSupported=true so the Apple Pay and Google Pay rows render.
    await context.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__PRESENTAIL_TEST_WALLET_SUPPORTED__ = true;
    });

    await page.goto("/checkout");
    await fillToPaymentStep(page);

    // The wallet icons row must be present before we switch methods.
    const walletIcons = page.getByTestId("payment-wallet-icons");
    await expect(walletIcons).toBeVisible({ timeout: 10_000 });

    // Tap the Google Pay tile to expand it (switches active payMethod).
    await page.getByText(/^Google Pay$/i).first().click();

    // Wait until the expanded children (email field) are visible — this is a
    // deterministic condition that avoids a fixed-duration sleep.
    await page
      .locator("[data-testid='payment-options'] input[inputmode='email'], [data-testid='payment-options'] input[type='email']")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {
        // Email field may already be mounted but off-screen; proceed regardless.
      });

    // The wallet-icons badge row must not bleed past the viewport.
    const walletOverflows = await elementOverflowsViewport(
      page,
      "payment-wallet-icons",
    );
    expect(
      walletOverflows,
      "payment-wallet-icons must not overflow when Google Pay tile is expanded",
    ).toBe(false);

    // The overall payment-options container must not overflow either.
    const containerOverflows = await elementOverflowsViewport(
      page,
      "payment-options",
    );
    expect(
      containerOverflows,
      "payment-options container must not overflow when Google Pay tile is expanded",
    ).toBe(false);

    const pageOverflows = await pageHasHorizontalOverflow(page);
    expect(
      pageOverflows,
      "page must have no horizontal scrollbar when Google Pay tile is expanded at 375 px",
    ).toBe(false);
  });
});
