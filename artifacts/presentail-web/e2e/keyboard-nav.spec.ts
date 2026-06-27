/**
 * Keyboard navigation test — checkout flow
 *
 * Verifies that a keyboard-only user can reach and operate all key interactive
 * elements on the checkout page: recipient form fields, the delivery-slot
 * selector, and the "Place Order" button.
 *
 * Strategy:
 *   - A `tabUntilFocused` helper presses Tab up to N times and checks whether
 *     the target element has focus after each press.  This avoids hardcoding
 *     an exact tab count (which would break whenever new focusable elements are
 *     added to the page) while still proving that the element is in the tab
 *     order and reachable without a pointer.
 *   - `fillStep1Required` fills every required field on step 1 programmatically
 *     so that the "Continue to payment" button becomes enabled before the
 *     keyboard-activation assertions run.
 *   - For the "Place Order" keyboard-activation test the "whish" payment method
 *     is selected (supported for LB + USD).  Pressing Enter triggers
 *     `handleSubmit`, which always begins by reserving an order ID from
 *     `/api/orders/next-id`.  The test intercepts that request to prove the
 *     button was activated via keyboard.
 *   - API calls are stubbed so the suite runs in CI without a live backend.
 */

import { test, expect, type Page } from "@playwright/test";

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

const STUB_FX_RATES = {
  ok: true,
  base: "USD",
  rates: { USD: 1, AED: 3.67, EUR: 0.92 },
};

const STUB_PRODUCTS = {
  ok: true,
  products: [
    {
      id: "rose-bouquet",
      name: "Rose Bouquet",
      slug: "rose-bouquet",
      priceValue: 65,
      image: { uri: "https://example.com/rose.jpg" },
      category: "flowers",
      description: "Fresh roses.",
    },
  ],
};

const STUB_GEO = { countryCode: "LB", source: "ip" };

const CART_ITEM = {
  product: {
    id: "rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

async function installStubs(page: Page): Promise<void> {
  // Use a single catch-all with URL-substring routing to avoid Playwright
  // glob-matching quirks (e.g. **/api/currencies not matching a URL that
  // also has query params or a trailing slash).
  await page.route("**/*", async (route) => {
    const url = route.request().url();

    // Only stub API calls — let static assets and page navigation through.
    if (!url.includes("/api/")) {
      return route.continue();
    }

    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.includes("/api/currencies")) return json(STUB_CURRENCIES);
    if (url.includes("/api/fx/rates")) return json(STUB_FX_RATES);
    if (url.includes("/api/geo")) return json(STUB_GEO);
    if (url.includes("/api/woo/products")) return json(STUB_PRODUCTS);
    // Catalog metadata — return empty arrays so MainNavbar ternary guards work.
    if (url.includes("/api/catalog/metadata")) return json({ categories: [], occasions: [], brands: [] });
    // Order-ID reservation — valid orderId so handleSubmit proceeds.
    if (url.includes("/api/orders/next-id")) return json({ ok: true, orderId: "LB-TEST-1" });
    // Order creation — non-ok so the test page does not navigate away.
    if (url.includes("/api/orders")) return json({ ok: false, message: "Keyboard-nav test stub" });
    // Catch-all for remaining API calls — return null so truthy guards
    // (e.g. `data ? data.categories.map(...) : null`) don't crash.
    return json(null);
  });
}

// ---------------------------------------------------------------------------
// Form-filling helper
// ---------------------------------------------------------------------------

/**
 * Fills every required step-1 field so that the "Continue to payment" button
 * becomes enabled.  Checking "Ask recipient for address" skips the district
 * and delivery-address fields (which require a district lookup API call) so
 * the test can run entirely offline.
 */
async function fillStep1Required(page: Page): Promise<void> {
  // Recipient first name (required).
  await page.getByTestId("input-recipient-first-name").fill("Jane");

  // Recipient phone — react-phone-number-input places data-testid directly on
  // the inner <input type="tel">, so getByTestId resolves the input directly.
  // pressSequentially simulates real key events so the library's internal
  // formatter fires and calls onChange with the E.164 value.
  // defaultCountry is "LB" (from the geo stub), so "70123456" → "+96170123456".
  const recipientPhone = page.getByTestId("input-recipient-phone");
  await recipientPhone.click();
  await recipientPhone.pressSequentially("70123456", { delay: 30 });

  // Check "Ask recipient for address" to skip district + address fields.
  const noAddr = page.getByTestId("check-no-address");
  if (!(await noAddr.isChecked())) {
    await noAddr.click();
  }

  // Sender fields (required for guest checkout).
  await page.getByTestId("input-sender-first-name").fill("John");
  await page.getByTestId("input-sender-email").fill("john@example.com");

  // Sender phone (required for guests with no saved profile phone).
  // data-testid is placed directly on the inner <input> by react-phone-number-input.
  const senderPhone = page.getByTestId("input-sender-phone");
  await senderPhone.click();
  await senderPhone.pressSequentially("70000001", { delay: 30 });
}

// ---------------------------------------------------------------------------
// Keyboard helpers
// ---------------------------------------------------------------------------

/**
 * Returns the `data-testid` attribute of the currently focused element,
 * or `null` when the focused element has no such attribute.
 */
async function getFocusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

/**
 * Press Tab up to `maxTabs` times until the element with the given
 * `data-testid` has focus.  Returns `true` when focus landed on the target,
 * `false` if the limit was exhausted.
 */
async function tabUntilFocused(
  page: Page,
  testId: string,
  maxTabs = 40,
): Promise<boolean> {
  for (let i = 0; i < maxTabs; i++) {
    const current = await getFocusedTestId(page);
    if (current === testId) return true;
    await page.keyboard.press("Tab");
  }
  return (await getFocusedTestId(page)) === testId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Keyboard navigation — checkout flow", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);

    // Seed cart and delivery location so the checkout page renders without
    // needing to add items interactively.  Also clear the React Query
    // persisted cache so stubs are always fetched (staleTime: 1 h would
    // otherwise reuse a previously-cached bad currencies shape).
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.removeItem("presentail-os-products-cache-v1");
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: DELIVERY_LOCATION },
    );
  });

  test("recipient form fields are reachable and accept keyboard input via Tab", async ({
    page,
  }) => {
    // ?guest=1 seeds guestAcked=true so the login gate is bypassed entirely.
    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Wait for the step-1 form to be present before starting Tab navigation.
    await expect(
      page.getByTestId("input-recipient-first-name"),
    ).toBeVisible({ timeout: 10_000 });

    // Seed focus into the page by clicking the first heading so that Tab
    // navigation starts from a known, page-internal anchor.
    await page.locator("h1").first().click();

    // -----------------------------------------------------------------------
    // Recipient first name
    // -----------------------------------------------------------------------
    const reachedFirstName = await tabUntilFocused(
      page,
      "input-recipient-first-name",
    );
    expect(
      reachedFirstName,
      "Recipient first-name field must be reachable by Tab",
    ).toBe(true);

    await page.keyboard.type("Jane");
    await expect(page.getByTestId("input-recipient-first-name")).toHaveValue(
      "Jane",
    );

    // -----------------------------------------------------------------------
    // Recipient last name
    // -----------------------------------------------------------------------
    const reachedLastName = await tabUntilFocused(
      page,
      "input-recipient-last-name",
    );
    expect(
      reachedLastName,
      "Recipient last-name field must be reachable by Tab from first-name",
    ).toBe(true);

    await page.keyboard.type("Doe");
    await expect(page.getByTestId("input-recipient-last-name")).toHaveValue(
      "Doe",
    );

    // -----------------------------------------------------------------------
    // Delivery address textarea
    // -----------------------------------------------------------------------
    const reachedAddress = await tabUntilFocused(
      page,
      "input-recipient-address",
    );
    expect(
      reachedAddress,
      "Recipient address textarea must be reachable by Tab",
    ).toBe(true);

    await page.keyboard.type("123 Cedar Street");
    await expect(page.getByTestId("input-recipient-address")).toHaveValue(
      "123 Cedar Street",
    );
  });

  test("delivery-mode buttons are keyboard-accessible and activate via Space", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/checkout?guest=1");

    await expect(
      page.getByTestId("delivery-mode-express"),
    ).toBeVisible({ timeout: 10_000 });

    await page.locator("h1").first().click();

    // -----------------------------------------------------------------------
    // Express delivery button — may be disabled outside 8 AM–10 PM Lebanon
    // time.  A disabled button is intentionally absent from the tab order; we
    // only assert reachability when the button is enabled.
    // -----------------------------------------------------------------------
    const expressDisabled = await page
      .getByTestId("delivery-mode-express")
      .evaluate((el) => (el as HTMLButtonElement).disabled);

    if (!expressDisabled) {
      const reachedExpress = await tabUntilFocused(
        page,
        "delivery-mode-express",
      );
      expect(
        reachedExpress,
        "Express delivery button must be reachable by Tab when enabled",
      ).toBe(true);
    }

    // -----------------------------------------------------------------------
    // Scheduled delivery button — always enabled; reachable from the current
    // focus position (either after Express or directly after recipient fields).
    // Use a generous limit so we can reach it from anywhere on the form.
    // -----------------------------------------------------------------------
    const reachedSchedule = await tabUntilFocused(
      page,
      "delivery-mode-schedule",
      60,
    );
    expect(
      reachedSchedule,
      "Scheduled delivery button must be reachable by Tab",
    ).toBe(true);

    // Activate the "Scheduled" button with Space — the slot panel must appear.
    await page.keyboard.press("Space");

    const panel = page.getByTestId("schedule-inline-panel");
    await expect(
      panel,
      "ScheduleInlinePanel must appear after activating Scheduled with Space",
    ).toBeVisible({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // Delivery-slot calendar toggle must be in the tab order inside the panel.
    // -----------------------------------------------------------------------
    const reachedCalToggle = await tabUntilFocused(
      page,
      "schedule-calendar-toggle",
      20,
    );
    expect(
      reachedCalToggle,
      "Delivery-slot calendar toggle must be reachable by Tab after opening Scheduled panel",
    ).toBe(true);
  });

  test("'Continue to payment' is reachable by Tab and advances to step 2 when activated", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/checkout?guest=1");

    await expect(
      page.getByTestId("input-recipient-first-name"),
    ).toBeVisible({ timeout: 10_000 });

    // Fill all required step-1 fields so the button is enabled.
    await fillStep1Required(page);

    // Confirm the button is now enabled before attempting keyboard activation.
    await expect(
      page.getByTestId("button-continue-to-payment"),
    ).toBeEnabled({ timeout: 5_000 });

    // Tab to the "Continue to payment" button from the page heading anchor.
    await page.locator("h1").first().click();

    const reachedContinue = await tabUntilFocused(
      page,
      "button-continue-to-payment",
    );
    expect(
      reachedContinue,
      "'Continue to payment' button must be reachable by Tab",
    ).toBe(true);

    // Activate with Enter — this must advance the form to step 2.
    await page.keyboard.press("Enter");

    // The "Place Order" button only renders on step 2.
    await expect(
      page.getByTestId("button-submit-payment"),
      "'Place Order' button must appear after advancing to step 2 via Enter",
    ).toBeVisible({ timeout: 10_000 });
  });

  test("'Place Order' button is reachable by Tab and activatable via Enter on step 2", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/checkout?guest=1");

    await expect(
      page.getByTestId("input-recipient-first-name"),
    ).toBeVisible({ timeout: 10_000 });

    // Fill required fields and advance to step 2 by pointer (not keyboard) so
    // this test is focused on what happens on step 2 specifically.
    await fillStep1Required(page);
    await expect(page.getByTestId("button-continue-to-payment")).toBeEnabled();
    await page.getByTestId("button-continue-to-payment").click();

    // Wait for step-2 payment options to appear.
    const placeOrderBtn = page.getByTestId("button-submit-payment");
    await expect(placeOrderBtn).toBeVisible({ timeout: 10_000 });

    // Select the "whish" payment method (supported for LB + USD) so that
    // pressing Place Order triggers a deterministic server call regardless of
    // whether Stripe JS is available in the test environment.
    const whishOption = page.getByTestId("option-payment-whish");
    if (await whishOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await whishOption.click();
    }

    // -----------------------------------------------------------------------
    // Keyboard reachability: tab to Place Order from the top of step 2.
    // -----------------------------------------------------------------------
    await page.locator("h1").first().click();

    const reachedPlaceOrder = await tabUntilFocused(
      page,
      "button-submit-payment",
    );
    expect(
      reachedPlaceOrder,
      "'Place Order' button must be reachable by Tab on the payment step",
    ).toBe(true);

    // Button must be enabled — a disabled button is not keyboard-operable.
    await expect(placeOrderBtn).toBeEnabled();

    // -----------------------------------------------------------------------
    // Keyboard activatability: press Enter and assert a side-effect.
    //
    // handleSubmit calls ensureOrderId() → POST /api/orders/next-id as its
    // very first outgoing request for any non-wallet payment path.  We
    // intercept that request to prove keyboard activation triggered the
    // submission flow.
    // -----------------------------------------------------------------------
    const orderIdRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/api/orders/next-id") ||
        req.url().includes("/api/orders"),
      { timeout: 5_000 },
    );

    await page.keyboard.press("Enter");

    const activatedReq = await orderIdRequest;
    expect(
      activatedReq,
      "Pressing Enter on 'Place Order' must trigger the order-ID reservation request",
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Return-key focus chains
//
// Step 1 wires several text inputs together so that pressing Return/Enter in
// one field moves focus to the next logical field (see `focusNextOnEnter` and
// the inline onKeyDown handlers in Checkout.tsx).  The chains are:
//
//   recipient first name  → recipient last name
//   recipient last name   → recipient phone
//   sender first name     → sender last name
//   sender last name      → sender email
//   sender email          → "Continue to payment" button
//
// These tests prove each hop lands focus on the correct next element so a
// regression in the focus-chain wiring is caught in CI.  The fields are filled
// first so the "Continue to payment" button is enabled — a disabled button
// cannot receive focus, which would otherwise make the final hop untestable.
// ---------------------------------------------------------------------------

test.describe("Keyboard navigation — Return-key focus chains", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.removeItem("presentail-os-products-cache-v1");
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: DELIVERY_LOCATION },
    );
  });

  test("pressing Return advances focus through the step-1 field chain", async ({
    page,
  }) => {
    await page.goto("/en-lb/beirut/checkout?guest=1");

    await expect(
      page.getByTestId("input-recipient-first-name"),
    ).toBeVisible({ timeout: 10_000 });

    // Fill all required fields so the "Continue to payment" button is enabled
    // (a disabled button cannot receive focus, breaking the final hop).
    await fillStep1Required(page);
    await expect(
      page.getByTestId("button-continue-to-payment"),
    ).toBeEnabled({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // recipient first name → recipient last name
    // -----------------------------------------------------------------------
    await page.getByTestId("input-recipient-first-name").focus();
    expect(await getFocusedTestId(page)).toBe("input-recipient-first-name");
    await page.keyboard.press("Enter");
    expect(
      await getFocusedTestId(page),
      "Return in recipient first name must focus recipient last name",
    ).toBe("input-recipient-last-name");

    // -----------------------------------------------------------------------
    // recipient last name → recipient phone
    // -----------------------------------------------------------------------
    await page.keyboard.press("Enter");
    expect(
      await getFocusedTestId(page),
      "Return in recipient last name must focus the recipient phone field",
    ).toBe("input-recipient-phone");

    // -----------------------------------------------------------------------
    // sender first name → sender last name
    // -----------------------------------------------------------------------
    await page.getByTestId("input-sender-first-name").focus();
    expect(await getFocusedTestId(page)).toBe("input-sender-first-name");
    await page.keyboard.press("Enter");
    expect(
      await getFocusedTestId(page),
      "Return in sender first name must focus sender last name",
    ).toBe("input-sender-last-name");

    // -----------------------------------------------------------------------
    // sender last name → sender email
    // -----------------------------------------------------------------------
    await page.keyboard.press("Enter");
    expect(
      await getFocusedTestId(page),
      "Return in sender last name must focus sender email",
    ).toBe("input-sender-email");

    // -----------------------------------------------------------------------
    // sender email → "Continue to payment" button
    // -----------------------------------------------------------------------
    await page.keyboard.press("Enter");
    expect(
      await getFocusedTestId(page),
      "Return in sender email must focus the 'Continue to payment' button",
    ).toBe("button-continue-to-payment");
  });
});
