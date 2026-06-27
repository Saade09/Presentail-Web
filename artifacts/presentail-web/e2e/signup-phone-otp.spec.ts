/**
 * E2E test: sign-up phone gate
 *
 * The web sign-up flow has two steps: name/password, then a mandatory phone
 * step. There is intentionally NO OTP step on web — clicking "Create Account"
 * with a phone number calls /api/auth/register directly (the OTP gate was
 * removed; see src/pages/SignUp.test.tsx for the authoritative unit coverage).
 *
 * This spec verifies the end-to-end behaviour of the phone step:
 *   1. The "Create Account" button is disabled until a phone number is entered.
 *   2. There is no way to skip the phone step.
 *   3. The button enables once a phone number is typed.
 *   4. Clicking "Create Account" calls /api/auth/register directly and never
 *      shows an OTP code step or calls /api/auth/otp/send.
 *   5. A successful registration navigates away from the sign-up page.
 *   6. The phone number is included in the register payload.
 *   7. Going back from the phone step returns to the name-password step.
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = "playwright-otp-test@example.com";
const TEST_PHONE = "+96170000000";

const SIGN_UP_URL = `/sign-up?email_address=${encodeURIComponent(TEST_EMAIL)}`;

test.describe("Sign-up — phone gate", () => {
  test.beforeEach(async ({ page }) => {
    // Seed a delivery location so UnprefixedRedirect can forward /sign-up to
    // the locale-prefixed route (e.g. /en-lb/beirut/sign-up) rather than
    // falling back to the Landing country-picker.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });

    // Register succeeds with a token + user so the success path logs in and
    // redirects away from the sign-up page.
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          token: "fake-jwt",
          user: {
            id: 1,
            email: TEST_EMAIL,
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      }),
    );
  });

  async function fillNamePassword(page: Page) {
    await page.goto(SIGN_UP_URL);
    await expect(page.getByTestId("signup-card")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("input-signup-name").fill("Ada");
    await page.getByTestId("input-signup-last-name").fill("Lovelace");
    await page.getByTestId("input-signup-password").fill("securePass1");
    await page.getByTestId("button-signup-continue").click();

    // Wait for the phone step to appear.
    await expect(page.getByTestId("button-signup-create")).toBeVisible({ timeout: 5_000 });
  }

  test("'Create Account' button is disabled before a phone number is entered", async ({ page }) => {
    await fillNamePassword(page);

    const createBtn = page.getByTestId("button-signup-create");
    await expect(createBtn).toBeDisabled();
  });

  test("no skip path exists on the phone step", async ({ page }) => {
    await fillNamePassword(page);

    // Confirm there is no text matching skip, later, or no thanks.
    await expect(page.getByText(/skip/i)).toHaveCount(0);
    await expect(page.getByText(/later/i)).toHaveCount(0);
    await expect(page.getByText(/no thanks/i)).toHaveCount(0);

    // The only forward action is the Create Account button.
    await expect(page.getByTestId("button-signup-create")).toBeVisible();
  });

  test("'Create Account' button enables after typing a phone number", async ({ page }) => {
    await fillNamePassword(page);

    // PhoneInput renders an <input> inside .PhoneInput wrapper; target by testid.
    const phoneInput = page.getByTestId("input-signup-phone");
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(TEST_PHONE);

    await expect(page.getByTestId("button-signup-create")).toBeEnabled();
  });

  test("clicking 'Create Account' calls /api/auth/register directly — no OTP step", async ({ page }) => {
    const registerCalls: string[] = [];
    const otpSendCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/auth/register")) registerCalls.push(url);
      if (url.includes("/api/auth/otp/send")) otpSendCalls.push(url);
    });

    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    // Register is called directly.
    await expect.poll(() => registerCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);

    // The OTP send endpoint is never called and no code input is rendered.
    expect(otpSendCalls).toHaveLength(0);
    await expect(page.getByTestId("input-signup-code")).toHaveCount(0);
  });

  test("a successful registration navigates away from the sign-up page", async ({ page }) => {
    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    // On success the page logs in and redirects, so the sign-up card unmounts.
    await expect(page.getByTestId("signup-card")).toHaveCount(0, { timeout: 10_000 });
  });

  test("the phone number is included in the register payload", async ({ page }) => {
    let registerBody: Record<string, unknown> | undefined;
    await page.route("**/api/auth/register", async (route) => {
      registerBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          token: "fake-jwt",
          user: { id: 1, email: TEST_EMAIL, firstName: "Ada", lastName: "Lovelace" },
        },
      });
    });

    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    await expect.poll(() => registerBody, { timeout: 5_000 }).toBeTruthy();
    expect(registerBody?.email).toBe(TEST_EMAIL.toLowerCase());
    expect(typeof registerBody?.phone).toBe("string");
    expect(registerBody?.phone as string).toContain("961");
  });

  test("going back from the phone step returns to the name-password step", async ({ page }) => {
    await fillNamePassword(page);

    // Verify we are on the phone step.
    await expect(page.getByTestId("input-signup-phone")).toBeVisible();

    // Click the global back button.
    await page.getByTestId("button-signup-back-page").click();

    // Should return to the name-password step — name input visible, phone gone.
    await expect(page.getByTestId("input-signup-name")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId("input-signup-phone")).toHaveCount(0);
  });
});
