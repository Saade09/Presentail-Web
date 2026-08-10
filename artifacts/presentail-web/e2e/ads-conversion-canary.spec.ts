/**
 * Google Ads conversion canary — dataLayer regression guard
 *
 * This spec is a dedicated canary for the Google Ads purchase-conversion ping
 * (AW-18281774261/XYi_CNabpMccELX5to1E) that fires on the OrderConfirmed page.
 *
 * Problem it solves
 * -----------------
 * `fireAdsPurchaseConversion()` in src/lib/gtag.ts is a one-liner that is easy
 * to silently break after a refactor of OrderConfirmed.tsx (e.g. a missed import,
 * an early-return guard that swallows the call, or a dedup key collision).  When
 * the tag stops firing, Google Ads campaigns spend with zero recorded conversions
 * and the failure is invisible until a human notices a drop in reported conversions.
 *
 * What the tests cover
 * --------------------
 * 1. The Ads `conversion` event appears in dataLayer with the exact production
 *    `send_to` tag, `transaction_id`, positive `value`, and 3-letter `currency`.
 * 2. The GA4 `purchase` event fires alongside the Ads conversion with a matching
 *    `transaction_id` and a non-empty `items[]` array.
 * 3. After the first conversion fires, OrderConfirmed sets the per-order dedup
 *    key (`presentail_ads_conversion_fired_<ref>`) in sessionStorage so the tag
 *    cannot double-fire on a page reload.
 * 4. When the dedup key is already present before the page loads, the conversion
 *    event does NOT appear in dataLayer (the guard is enforced).
 *
 * Dedup test approach
 * -------------------
 * `page.reload()` replays Playwright init scripts, which would re-clear the dedup
 * key from sessionStorage and make the assertion trivially true.  Instead:
 *   - Test 3 checks that the key IS written to sessionStorage after the first fire.
 *   - Test 4 pre-seeds the dedup key via a second `addInitScript` (which runs
 *     AFTER the beforeEach init scripts because scripts are queued in order), then
 *     navigates fresh and asserts no conversion event appears.
 *
 * CI / schedule
 * -------------
 * The spec lives in the same `e2e/` directory as all other Playwright specs and
 * therefore runs automatically in the existing CI pipeline on every push.
 * For production monitoring see docs/campaign-ga4-verification.md.
 *
 * Relevant source files
 * ---------------------
 *   src/lib/gtag.ts                 — fireAdsPurchaseConversion, fireGA4PurchaseEvent
 *   src/pages/OrderConfirmed.tsx    — ADS_CONVERSION_KEY_PREFIX, the calls
 *   docs/campaign-ga4-verification.md — manual runbook for the deployed site
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The real Ads tag identifier baked into src/lib/gtag.ts
 * (ADS_ID = "AW-18281774261", ADS_CONVERSION_LABEL = "XYi_CNabpMccELX5to1E").
 */
const EXPECTED_SEND_TO = "AW-18281774261/XYi_CNabpMccELX5to1E";

const ORDER_REF = "ORD-CANARY-8001";

/**
 * Matches ADS_CONVERSION_KEY_PREFIX in OrderConfirmed.tsx:
 *   const ADS_CONVERSION_KEY_PREFIX = "presentail_ads_conversion_fired_";
 */
const CONVERSION_DEDUP_KEY = `presentail_ads_conversion_fired_${ORDER_REF}`;

// Minimal stashed order — mirrors the ConfirmedOrder + StashedEntry shapes in
// OrderConfirmed.tsx.  All numeric values are in the display currency (USD).
const STASHED_ORDER = {
  items: [
    { name: "Canary Test Bouquet", quantity: 1, price: 55, image: "" },
  ],
  cardMessage: "Canary test — automated",
  deliveryDate: "2026-08-15",
  deliverySlot: "Morning (9am–1pm)",
  deliverySlotTime: "9:00 AM – 1:00 PM",
  districtFee: 0,
  expressFee: 0,
  slotFee: 0,
  totalUsd: 55,
  paymentMethod: "card",
};

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

// ---------------------------------------------------------------------------
// API stubs — minimal set so the page shell renders without real network calls
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

async function installStubs(page: Page): Promise<void> {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );
}

// ---------------------------------------------------------------------------
// dataLayer shim + helpers
// ---------------------------------------------------------------------------

type DataLayerEntry = {
  event: string;
  name: string;
  params: Record<string, unknown>;
};

/**
 * Install a window.dataLayer array and a window.gtag shim before any page
 * scripts run.  Mirrors the inline snippet in index.html so gtag() calls land
 * in dataLayer even when the external gtag.js script is blocked by network stubs.
 *
 * This must be the first addInitScript called so subsequent init scripts (which
 * may call gtag) can rely on it being present.
 */
async function installGtagShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { dataLayer: unknown[] }).dataLayer =
      (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];

    function gtag(..._args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params
      (window as unknown as { dataLayer: unknown[] }).dataLayer.push(arguments);
    }
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag = gtag;
  });
}

/**
 * Read all gtag "event" entries from window.dataLayer.
 *
 * gtag() pushes `arguments` objects, so entries arrive as array-likes:
 *   { 0: "event", 1: <name>, 2: <params> }
 */
async function readGtagEvents(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return dl
      .map((entry) => {
        const e = entry as Record<number, unknown>;
        if (e && e[0] === "event") {
          return {
            event: "event",
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
// Seed helper — stashes the pending order and location in Web Storage
// ---------------------------------------------------------------------------

async function seedOrderData(page: Page): Promise<void> {
  await page.addInitScript(
    ({ order, location, dedupKey }) => {
      // Stash the pending order so OrderConfirmed reads it on mount.
      const entry = { payload: order, createdAt: Date.now() };
      window.sessionStorage.setItem(
        "presentail_pending_order_v1",
        JSON.stringify(entry),
      );

      // Ensure the conversion dedup key is absent so the tag fires on this load.
      window.sessionStorage.removeItem(dedupKey);

      // Delivery location is read from localStorage by the shop shell.
      window.localStorage.setItem(
        "presentail_location_v1",
        JSON.stringify(location),
      );
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify(location),
      );
    },
    {
      order: STASHED_ORDER,
      location: DELIVERY_LOCATION,
      dedupKey: CONVERSION_DEDUP_KEY,
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Google Ads conversion canary — OrderConfirmed fires the right tags", () => {
  test.beforeEach(async ({ page }) => {
    await installStubs(page);
    await installGtagShim(page);
    await seedOrderData(page);
  });

  // -------------------------------------------------------------------------
  // Test 1: Ads conversion event shape
  // -------------------------------------------------------------------------

  test("Ads conversion event fires with correct send_to on the order confirmation page", async ({
    page,
  }) => {
    await page.goto(
      `/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`,
    );

    // Wait for the success icon to confirm OrderConfirmed has rendered and the
    // useEffect that fires the conversion has had time to run.
    await expect(page.getByTestId("icon-success")).toBeVisible({
      timeout: 20_000,
    });

    // Poll dataLayer until the conversion event appears (or timeout).
    await expect
      .poll(
        async () => (await readGtagEvents(page)).map((e) => e.name),
        {
          message:
            `Expected a "conversion" event in dataLayer. ` +
            `This fires when fireAdsPurchaseConversion() is called in OrderConfirmed.tsx. ` +
            `A missing event means the Google Ads purchase ping has silently stopped firing.`,
          timeout: 20_000,
        },
      )
      .toContain("conversion");

    const events = await readGtagEvents(page);
    const conv = events.find((e) => e.name === "conversion");

    // send_to must match the production tag exactly.
    expect(
      conv?.params?.send_to,
      `conversion event send_to must be "${EXPECTED_SEND_TO}" ` +
        `(ADS_ID/ADS_CONVERSION_LABEL in src/lib/gtag.ts). ` +
        `Got: ${JSON.stringify(conv?.params?.send_to)}`,
    ).toBe(EXPECTED_SEND_TO);

    // transaction_id lets Ads deduplicate conversions server-side.
    expect(
      conv?.params?.transaction_id,
      "conversion event must carry the order ref as transaction_id",
    ).toBe(ORDER_REF);

    // value must be a positive number for Ads value-based bidding.
    expect(
      typeof conv?.params?.value === "number" && conv.params.value > 0,
      `conversion value must be a positive number, got: ${JSON.stringify(conv?.params?.value)}`,
    ).toBe(true);

    // currency must be a 3-letter ISO code.
    expect(
      typeof conv?.params?.currency === "string" &&
        conv.params.currency.length === 3,
      `conversion currency must be a 3-letter ISO code, got: ${JSON.stringify(conv?.params?.currency)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 2: GA4 purchase event fires alongside the Ads conversion
  // -------------------------------------------------------------------------

  test("GA4 purchase event fires alongside the Ads conversion with matching transaction_id", async ({
    page,
  }) => {
    await page.goto(
      `/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`,
    );

    await expect(page.getByTestId("icon-success")).toBeVisible({
      timeout: 20_000,
    });

    // Both fireAdsPurchaseConversion and fireGA4PurchaseEvent are called
    // together in OrderConfirmed.tsx — assert both land in dataLayer.
    await expect
      .poll(
        async () => (await readGtagEvents(page)).map((e) => e.name),
        {
          message:
            `Expected both "conversion" and "purchase" events in dataLayer. ` +
            `A missing "purchase" event means Google Merchant Center attribution is broken.`,
          timeout: 20_000,
        },
      )
      .toEqual(expect.arrayContaining(["conversion", "purchase"]));

    const events = await readGtagEvents(page);
    const purchase = events.find((e) => e.name === "purchase");

    // transaction_id must match between the two events.
    expect(
      purchase?.params?.transaction_id,
      "GA4 purchase transaction_id must match the order ref",
    ).toBe(ORDER_REF);

    // items[] is required for Google Merchant Center e-commerce reporting.
    expect(
      Array.isArray(purchase?.params?.items) &&
        (purchase.params.items as unknown[]).length > 0,
      "GA4 purchase event must include a non-empty items[] array",
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Dedup key is written to sessionStorage after the first fire
  //
  // OrderConfirmed.tsx writes `presentail_ads_conversion_fired_<ref>` = "1"
  // immediately after calling fireAdsPurchaseConversion.  This key prevents
  // the tag from firing a second time when the user reloads or revisits the
  // page.  Asserting the key is set confirms the guard is armed.
  // -------------------------------------------------------------------------

  test("dedup key is written to sessionStorage after the conversion fires", async ({
    page,
  }) => {
    await page.goto(
      `/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`,
    );

    await expect(page.getByTestId("icon-success")).toBeVisible({
      timeout: 20_000,
    });

    // Wait for the conversion event to land first, then check the key.
    await expect
      .poll(
        async () => (await readGtagEvents(page)).map((e) => e.name),
        { timeout: 20_000 },
      )
      .toContain("conversion");

    const dedupValue = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      CONVERSION_DEDUP_KEY,
    );

    expect(
      dedupValue,
      `The dedup key "${CONVERSION_DEDUP_KEY}" must be set in sessionStorage ` +
        `after the conversion fires so subsequent page loads skip the ping. ` +
        `Got: ${JSON.stringify(dedupValue)}`,
    ).toBe("1");
  });

  // -------------------------------------------------------------------------
  // Test 4: Conversion does NOT fire when the dedup key is already present
  //
  // This test seeds the dedup key via a second addInitScript that runs AFTER
  // the beforeEach init scripts (scripts queue in registration order).
  // seedOrderData's init script removes the key first; this script re-adds it,
  // so when OrderConfirmed mounts the guard is already armed and skips the ping.
  // -------------------------------------------------------------------------

  test("conversion does NOT fire when the dedup key is already set (guard is enforced)", async ({
    page,
  }) => {
    // Add this AFTER beforeEach's scripts so it runs last and the key survives.
    await page.addInitScript(({ key }) => {
      window.sessionStorage.setItem(key, "1");
    }, { key: CONVERSION_DEDUP_KEY });

    await page.goto(
      `/en-lb/beirut/order-confirmed?status=success&ref=${ORDER_REF}`,
    );

    await expect(page.getByTestId("icon-success")).toBeVisible({
      timeout: 20_000,
    });

    // Allow enough time for any erroneous second ping to appear in dataLayer.
    await page.waitForTimeout(4_000);

    const events = await readGtagEvents(page);
    const conversionCount = events.filter((e) => e.name === "conversion").length;

    expect(
      conversionCount,
      `conversion event must not fire when the dedup key is already set ` +
        `("${CONVERSION_DEDUP_KEY}" = "1" in sessionStorage). ` +
        `Fired ${conversionCount} time(s) — the dedup guard in OrderConfirmed.tsx is broken.`,
    ).toBe(0);
  });
});
