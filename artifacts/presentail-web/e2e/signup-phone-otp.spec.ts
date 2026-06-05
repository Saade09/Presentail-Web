/**
 * E2E test: sign-up phone + OTP gate
 *
 * Verifies the end-to-end behaviour of the sign-up phone step:
 *   1. The "Create Account" button is disabled until a phone number is entered.
 *   2. There is no way to skip the phone step and proceed to registration.
 *   3. Clicking "Create Account" with a phone triggers the OTP send endpoint.
 *   4. The OTP step (code input) appears only after /api/auth/otp/send succeeds.
 *   5. The "Verify" button stays disabled until ≥4 digits are typed.
 *   6. /api/auth/register is NOT called before OTP verification.
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = "playwright-otp-test@example.com";
const TEST_PHONE = "+96170000000";

const SIGN_UP_URL = `/sign-up?email_address=${encodeURIComponent(TEST_EMAIL)}`;

test.describe("Sign-up — phone OTP gate", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept OTP send: return success so we can see the code step.
    await page.route("**/api/auth/otp/send", (route) =>
      route.fulfill({ status: 200, json: { ok: true } }),
    );

    // Intercept OTP verify: return success so we can test the full verify path.
    await page.route("**/api/auth/otp/verify", (route) =>
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

    // Intercept register: track whether it was called unexpectedly.
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({ status: 500, json: { ok: false, message: "Should not be called" } }),
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

  test("OTP code step appears after entering phone and clicking 'Create Account'", async ({ page }) => {
    await fillNamePassword(page);

    const phoneInput = page.getByTestId("input-signup-phone");
    await phoneInput.fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    // The OTP code input must appear.
    await expect(page.getByTestId("input-signup-code")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("button-signup-verify")).toBeVisible();
    await expect(page.getByTestId("button-signup-resend")).toBeVisible();
  });

  test("OTP step's Verify button is disabled until ≥4 digits are entered", async ({ page }) => {
    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    await expect(page.getByTestId("input-signup-code")).toBeVisible({ timeout: 5_000 });

    const verifyBtn = page.getByTestId("button-signup-verify");
    await expect(verifyBtn).toBeDisabled();

    await page.getByTestId("input-signup-code").fill("1234");
    await expect(verifyBtn).toBeEnabled();
  });

  test("/api/auth/register is not called before OTP is verified", async ({ page }) => {
    const registerCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/register")) {
        registerCalls.push(req.url());
      }
    });

    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    // OTP send is called but register should not be.
    await expect(page.getByTestId("input-signup-code")).toBeVisible({ timeout: 5_000 });

    expect(registerCalls).toHaveLength(0);
  });

  test("going back from the OTP step returns to the phone step without registration", async ({ page }) => {
    const registerCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/register")) {
        registerCalls.push(req.url());
      }
    });

    await fillNamePassword(page);

    await page.getByTestId("input-signup-phone").fill(TEST_PHONE);
    await page.getByTestId("button-signup-create").click();

    await expect(page.getByTestId("input-signup-code")).toBeVisible({ timeout: 5_000 });

    // Click the Back button on the OTP step.
    await page.getByTestId("button-signup-back").click();

    // Should return to the phone step — phone input visible, code input gone.
    await expect(page.getByTestId("input-signup-phone")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId("input-signup-code")).not.toBeVisible();

    expect(registerCalls).toHaveLength(0);
  });
});
