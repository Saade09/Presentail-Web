/**
 * E2E test: checkout phone validation (guided inline errors model)
 *
 * The Step-1 "Continue to Payment" CTA is ALWAYS clickable on both surfaces
 * (desktop sidebar + mobile sticky bar). Instead of a disabled gate, clicking
 * with a missing/invalid recipient phone keeps the shopper on Step 1 and
 * shows a localized inline error under the phone field (rendered by
 * WebPhoneField with data-testid="input-recipient-phone-error").
 *
 * Verifies that:
 *   1. The CTA is enabled even while the recipient phone field is empty.
 *   2. Clicking it with an empty phone stays on Step 1, shows the phone
 *      inline error, and moves focus to the phone input.
 *   3. The error persists for an invalid / partial number.
 *   4. Entering a valid Lebanese number (+961 70 000 000) clears the error.
 */

import { test, expect, type Page } from "@playwright/test";

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

/**
 * The Step-1 continue CTA differs by breakpoint: the desktop sidebar button
 * (lg+ only) vs the mobile sticky-footer button (below lg). Both run the same
 * shared validate-and-advance flow, so the spec targets whichever is visible
 * for the current project viewport.
 */
function continueCta(page: Page) {
  return page
    .getByTestId("button-continue-to-payment-sidebar")
    .or(page.getByTestId("button-continue-to-payment"))
    .locator("visible=true");
}

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
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
  });

  test(
    "clicking the always-enabled CTA with a missing/invalid recipient phone shows the inline error; a valid one clears it",
    async ({ page }) => {
      // `?guest=1` pre-acknowledges the guest path so the sign-in dialog never
      // mounts. Once a location is set the router mounts under a locale base, so
      // navigate to the locale-prefixed checkout URL rather than bare /checkout.
      await page.goto("/en-lb/beirut/checkout?guest=1");

      // Belt-and-braces: dismiss the login dialog if it still appears.
      const guestBtn = page.getByTestId("button-checkout-as-guest");
      if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await guestBtn.click();
      }

      // Wait for the recipient first-name field — confirms step 1 is rendered.
      const recipientFirstName = page.getByTestId("input-recipient-name");
      await expect(recipientFirstName).toBeVisible({ timeout: 15_000 });

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
      await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

      // ── Assert 1: the CTA is enabled even with an empty recipient phone ───
      const continueBtn = continueCta(page);
      await expect(continueBtn).toBeVisible();
      await expect(continueBtn).toBeEnabled();

      // ── Assert 2: clicking stays on Step 1 and shows the phone error ──────
      await continueBtn.click();

      const phoneError = page.getByTestId("input-recipient-phone-error");
      await expect(phoneError).toBeVisible();
      // Still on step 1 — the payment method list must NOT have rendered.
      await expect(page.getByTestId("option-payment-card")).toHaveCount(0);

      // Focus moved to the recipient phone input.
      const recipientPhoneInput = page.getByTestId("input-recipient-phone");
      await expect(recipientPhoneInput).toBeFocused();
      // Screen-reader wiring: control marked invalid + linked to the message.
      await expect(recipientPhoneInput).toHaveAttribute("aria-invalid", "true");
      await expect(recipientPhoneInput).toHaveAttribute(
        "aria-describedby",
        "input-recipient-phone-error",
      );

      // ── Assert 3: error persists with an invalid partial number ───────────
      await recipientPhoneInput.fill(INVALID_PHONE_DIGITS);
      await expect(phoneError).toBeVisible();

      // ── Assert 4: a valid phone number clears the error ───────────────────
      await recipientPhoneInput.fill(VALID_LB_PHONE);
      await expect(phoneError).toHaveCount(0);
      await expect(recipientPhoneInput).not.toHaveAttribute("aria-invalid", "true");
    },
  );
});
