/**
 * E2E test: checkout phone validation (post-lazy-load refactor)
 *
 * The checkout page tracks phone validity via `onValidityChange` state instead
 * of calling `isValidPhoneNumber` directly in the parent.  This test confirms
 * that the `recipientPhoneValid` state correctly gates the "Continue to
 * payment" button after the LazyWebPhoneField / code-split change.
 *
 * Verifies that:
 *   1. "Continue to payment" is disabled when the recipient phone field is empty.
 *   2. It stays disabled when an invalid / partial number is typed.
 *   3. It becomes enabled once a valid Lebanese number (+961 70 000 000) is entered.
 */

import { test, expect } from "@playwright/test";

const CART_ITEM = {
  product: {
    id: "test-rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/** A valid Lebanese mobile number in E.164 format. */
const VALID_LB_PHONE = "+96170000000";

/**
 * Partial / invalid entry — short enough that libphonenumber-js will not
 * consider it a complete Lebanese number (even with +961 prefix added by the
 * country picker, "123" produces "+961123" which fails isValidPhoneNumber).
 */
const INVALID_PHONE_DIGITS = "123";

test.describe("Checkout — phone validation", () => {
  test.beforeEach(async ({ page }) => {
    // Seed cart + location into localStorage before any navigation.
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem(
          "presentail_cart_v1",
          JSON.stringify(cart),
        );
        window.localStorage.setItem(
          "presentail_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
  });

  test(
    "'Continue to payment' is disabled with no/invalid recipient phone and enabled with a valid one",
    async ({ page }) => {
      await page.goto("/checkout");

      // Dismiss the optional guest-login prompt if it appears.
      const guestBtn = page.getByRole("button", {
        name: /guest|continue without/i,
      });
      if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await guestBtn.click();
      }

      // Wait for the recipient first-name field — confirms step 1 is rendered.
      const recipientFirstName = page.getByTestId("input-recipient-first-name");
      await expect(recipientFirstName).toBeVisible({ timeout: 10_000 });

      // ── Fill every required field except the recipient phone ──────────────

      // Skip address (district + address) so we don't need to pick them.
      const noAddressBtn = page.getByTestId("check-no-address");
      await expect(noAddressBtn).toBeVisible();
      await noAddressBtn.click();

      // Recipient name.
      await recipientFirstName.fill("Ahmad");

      // Sender details (guest path — name, email, and phone are all required).
      await page.getByTestId("input-sender-first-name").fill("Test");
      await page.getByTestId("input-sender-email").fill("test@example.com");

      // Sender phone — the disabled guard uses a raw `.trim()` check, not
      // the validity state, so we fill a full valid number to clear that gate.
      const senderPhoneInput = page.getByTestId("input-sender-phone");
      await expect(senderPhoneInput).toBeVisible();
      await senderPhoneInput.fill(VALID_LB_PHONE);

      // ── Assert 1: button is disabled with empty recipient phone ───────────
      const continueBtn = page.getByTestId("button-continue-to-payment");
      await expect(continueBtn).toBeVisible();
      await expect(continueBtn).toBeDisabled();

      // ── Assert 2: button stays disabled with an invalid partial number ────
      const recipientPhoneInput = page.getByTestId("input-recipient-phone");
      await expect(recipientPhoneInput).toBeVisible();
      await recipientPhoneInput.fill(INVALID_PHONE_DIGITS);
      await expect(continueBtn).toBeDisabled();

      // ── Assert 3: button becomes enabled with a valid phone number ────────
      await recipientPhoneInput.fill(VALID_LB_PHONE);
      await expect(continueBtn).toBeEnabled();
    },
  );
});
