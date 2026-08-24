/**
 * E2E test: compact mobile checkout sign-in card (Delivery Details step).
 *
 * At mobile widths (≤767px) the optional sign-in card must render the
 * approved compact layout:
 *   - serif heading "Already have an account?"
 *   - supporting text "Sign in to use saved addresses and track orders."
 *   - two equal-width outlined pills in one row (Apple / Google), ≥44px tall
 *   - a centered "Sign in with email" secondary text link below the pills
 *   - NO "Or continue as guest below ↓" hint
 * with no wrapping/overflow at 320, 375, 390 and 430px viewport widths.
 *
 * Desktop (≥768px) keeps the original card: three full-label buttons in one
 * row plus the guest hint.
 *
 * All API calls are stubbed so the test is hermetic (no live backend needed).
 */

import { test, expect, type Page } from "@playwright/test";

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
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }),
    }),
  );
  await page.route("**/api/geo/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currency: "USD" }),
    }),
  );
  await page.route("**/api/delivery-locations**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_DELIVERY_LOCATIONS) }),
  );
  await page.route("**/api/orders/next-id", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: "TEST-SIGNIN-001" }),
    }),
  );
  // Prevent any real Stripe CDN load — step 1 never needs it.
  await page.route("**/js.stripe.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: "window.Stripe = function(){return {};};" }),
  );
  await page.route("**/api/analytics/**", (r) => r.fulfill({ status: 204, body: "" }));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ cart, location }: { cart: (typeof CART_ITEM)[]; location: typeof LOCATION }) => {
      window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
      window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
    },
    { cart: [CART_ITEM], location: LOCATION },
  );
  await installStubs(page);
});

async function openCheckout(page: Page) {
  await page.goto("/en-lb/beirut/checkout?guest=1");
  const guestBtn = page.getByTestId("button-checkout-as-guest");
  if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await guestBtn.click();
  }
  await expect(page.getByTestId("card-checkout-signin")).toBeVisible({ timeout: 15_000 });
}

const MOBILE_WIDTHS = [320, 375, 390, 430];

test.describe("Checkout sign-in card — compact mobile layout", () => {
  for (const width of MOBILE_WIDTHS) {
    test(`compact layout, no wrap/overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openCheckout(page);

      const card = page.getByTestId("card-checkout-signin");

      // Approved compact copy — mobile heading/subtitle visible, desktop hidden.
      await expect(card.getByText("Already have an account?")).toBeVisible();
      await expect(card.getByText("Sign in to use saved addresses and track orders.")).toBeVisible();
      await expect(card.getByText("Sign in for a faster checkout")).toBeHidden();

      // Guest hint is gone at mobile widths.
      await expect(page.getByTestId("text-checkout-signin-guest-hint")).toBeHidden();

      const apple = page.getByTestId("button-checkout-signin-apple");
      const google = page.getByTestId("button-checkout-signin-google");
      const email = page.getByTestId("button-checkout-signin-email");

      // Short pill labels visible; full desktop labels hidden.
      await expect(apple.getByText("Apple", { exact: true })).toBeVisible();
      await expect(google.getByText("Google", { exact: true })).toBeVisible();
      await expect(apple.getByText("Continue with Apple")).toBeHidden();
      await expect(google.getByText("Continue with Google")).toBeHidden();
      await expect(email).toHaveText("Sign in with email");

      const [appleBox, googleBox, emailBox, cardBox] = await Promise.all([
        apple.boundingBox(),
        google.boundingBox(),
        email.boundingBox(),
        card.boundingBox(),
      ]);
      expect(appleBox && googleBox && emailBox && cardBox).toBeTruthy();

      // Pills: equal width, one row, ≥44px tall; email link ≥44px below them.
      expect(Math.abs(appleBox!.width - googleBox!.width)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(appleBox!.y - googleBox!.y)).toBeLessThanOrEqual(1);
      expect(appleBox!.height).toBeGreaterThanOrEqual(44);
      expect(googleBox!.height).toBeGreaterThanOrEqual(44);
      expect(emailBox!.height).toBeGreaterThanOrEqual(44);
      expect(emailBox!.y).toBeGreaterThan(appleBox!.y + appleBox!.height - 1);

      // Card uses the same gutters as the surrounding checkout cards.
      // (Note: comparing against the sibling Delivery Details heading block
      // rather than the raw viewport — checkout has a pre-existing page-level
      // ~15px horizontal overflow at exactly 320px that affects every Step-1
      // card equally and predates this card's compact layout.)
      const headingBox = await page
        .locator("h2", { hasText: "Delivery Details" })
        .first()
        .evaluate((el) => el.getBoundingClientRect());
      expect(cardBox!.x).toBeGreaterThanOrEqual(0);
      expect(Math.abs(cardBox!.x - headingBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cardBox!.width - headingBox.width)).toBeLessThanOrEqual(1);
      // Pills + email link stay inside the card.
      expect(appleBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 0.5);
      expect(googleBox!.x + googleBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 0.5);
      expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 0.5);
      for (const testId of [
        "card-checkout-signin",
        "button-checkout-signin-apple",
        "button-checkout-signin-google",
        "button-checkout-signin-email",
      ]) {
        const overflow = await page
          .getByTestId(testId)
          .evaluate((el) => ({
            x: el.scrollWidth - el.clientWidth,
            y: el.scrollHeight - el.clientHeight,
          }));
        expect(overflow.x, `${testId} horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
        expect(overflow.y, `${testId} vertical overflow at ${width}px`).toBeLessThanOrEqual(1);
      }

      // The guest Recipient Details form below stays available.
      await expect(page.getByTestId("input-recipient-name")).toBeVisible();
    });
  }

  test("email link opens the existing email sign-in modal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCheckout(page);
    await page.getByTestId("button-checkout-signin-email").click();
    await expect(page.getByTestId("dialog-checkout-email-signin")).toBeVisible();
  });

  test("desktop (1280px) keeps the original card layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openCheckout(page);

    const card = page.getByTestId("card-checkout-signin");
    await expect(card.getByText("Sign in for a faster checkout")).toBeVisible();
    await expect(card.getByText("Use saved addresses and track your orders.")).toBeVisible();
    await expect(card.getByText("Already have an account?")).toBeHidden();

    // Full labels + guest hint, three buttons on one row.
    await expect(card.getByText("Continue with Apple")).toBeVisible();
    await expect(card.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByTestId("text-checkout-signin-guest-hint")).toBeVisible();

    const [appleBox, googleBox, emailBox] = await Promise.all([
      page.getByTestId("button-checkout-signin-apple").boundingBox(),
      page.getByTestId("button-checkout-signin-google").boundingBox(),
      page.getByTestId("button-checkout-signin-email").boundingBox(),
    ]);
    expect(Math.abs(appleBox!.y - googleBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(appleBox!.y - emailBox!.y)).toBeLessThanOrEqual(1);
  });
});
