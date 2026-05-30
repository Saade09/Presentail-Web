import { test, expect, type Page } from "@playwright/test";

const PERSISTENT_KEY = "presentail_display_currency_manual_persistent_v1";
const SESSION_KEY = "presentail_display_currency_manual_v1";

async function openCurrencySwitcher(page: Page) {
  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
}

async function pickCurrency(page: Page, code: string) {
  const item = page.getByTestId(`button-currency-${code.toLowerCase()}`);
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
}

async function enableRemember(page: Page) {
  const toggle = page.locator("#currency-remember");
  const checked = await toggle.isChecked();
  if (!checked) {
    await toggle.click();
  }
}

async function disableRemember(page: Page) {
  const toggle = page.locator("#currency-remember");
  const checked = await toggle.isChecked();
  if (checked) {
    await toggle.click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Clear any leftover currency overrides before each test.
  await page.evaluate((keys) => {
    for (const k of keys) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  }, [PERSISTENT_KEY, SESSION_KEY]);
});

test("currency persists across page reload when 'Remember my choice' is on", async ({
  page,
}) => {
  // Open the switcher, pick AED with "Remember my choice" toggled on.
  await openCurrencySwitcher(page);
  await enableRemember(page);
  await pickCurrency(page, "AED");

  // Confirm the trigger now shows AED.
  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toContainText("AED");

  // Verify the choice was written to localStorage.
  const persisted = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persisted).toBe("AED");

  // Reload the page (simulates a new visit / tab).
  await page.reload();

  // The currency switcher should still display AED after reload.
  const triggerAfterReload = page.getByTestId("currency-switcher");
  await expect(triggerAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(triggerAfterReload).toContainText("AED");
});

test("currency does NOT persist across reload when 'Remember my choice' is off", async ({
  page,
}) => {
  // Pick AED with persistence disabled.
  await openCurrencySwitcher(page);
  await disableRemember(page);
  await pickCurrency(page, "AED");

  const trigger = page.getByTestId("currency-switcher");
  await expect(trigger).toContainText("AED");

  // Should be in sessionStorage only, not localStorage.
  const persisted = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persisted).toBeNull();

  const sessionVal = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_KEY,
  );
  expect(sessionVal).toBe("AED");
});

test("toggling 'Remember my choice' off removes the value from localStorage", async ({
  page,
}) => {
  // Start with a persistent choice.
  await openCurrencySwitcher(page);
  await enableRemember(page);
  await pickCurrency(page, "GBP");

  const persistedBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persistedBefore).toBe("GBP");

  // Re-open the switcher and toggle remember off.
  await openCurrencySwitcher(page);
  await disableRemember(page);

  // localStorage should be cleared; sessionStorage should now hold the value.
  const persistedAfter = await page.evaluate(
    (key) => localStorage.getItem(key),
    PERSISTENT_KEY,
  );
  expect(persistedAfter).toBeNull();

  const sessionVal = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_KEY,
  );
  expect(sessionVal).toBe("GBP");
});
