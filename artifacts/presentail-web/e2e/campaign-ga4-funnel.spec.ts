/**
 * Campaign attribution → GA4 funnel — dataLayer regression tests
 *
 * Before real ad spend on /flower-delivery starts, this guards the client-side
 * half of the GA4 attribution chain:
 *
 *   1. A visit with gclid + UTM params stores an attribution touch in
 *      localStorage (src/lib/attribution.ts) that survives navigation, so
 *      internal /api/web-events carry campaign attribution funnel-wide.
 *   2. fireGtagEvent mirrors land in window.dataLayer (the inline gtag()
 *      shim in index.html pushes there even when gtag.js is blocked), so
 *      campaign_page_view, add_to_cart, begin_checkout and purchase reach
 *      GA4 whenever the real gtag.js loads in production.
 *
 * The GA4-server side (DebugView, Ads conversion attribution, Clarity
 * recordings) can only be verified against the deployed site — see
 * docs/campaign-ga4-verification.md.
 */

import { test, expect } from "@playwright/test";

const CAMPAIGN_URL =
  "/flower-delivery?gclid=E2E_TEST_GCLID&utm_source=google&utm_medium=cpc&utm_campaign=flower-delivery-launch";

const ATTRIBUTION_KEY = "@presentail/attribution_v1";

type DataLayerEntry = { event?: string; name?: string; params?: Record<string, unknown> };

/** Read gtag "event" entries from window.dataLayer. gtag() pushes `arguments`
 * objects, so entries arrive as array-likes: {0:"event", 1:name, 2:params}. */
async function readGtagEvents(page: import("@playwright/test").Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return dl
      .map((entry) => {
        const e = entry as Record<number, unknown>;
        if (e && e[0] === "event") {
          return { event: "event", name: String(e[1]), params: (e[2] ?? {}) as Record<string, unknown> };
        }
        return null;
      })
      .filter((x): x is { event: string; name: string; params: Record<string, unknown> } => x !== null);
  });
}

test.describe("campaign landing — attribution capture + GA4 mirrors", () => {
  test.beforeEach(async ({ page }) => {
    // The app gates every page behind a country picker until a delivery
    // location is stored — seed it so the campaign page renders directly.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });
  });

  test("gclid/UTM visit stores attribution and fires campaign_page_view into dataLayer", async ({ page }) => {
    await page.goto(CAMPAIGN_URL);

    // campaign_page_view gtag mirror must land in dataLayer.
    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), { timeout: 15_000 })
      .toContain("campaign_page_view");
    const events = await readGtagEvents(page);
    const pv = events.find((e) => e.name === "campaign_page_view");
    expect(pv?.params?.section).toBe("campaign-flower-delivery");

    // Attribution touch persisted with the ad-click params.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ATTRIBUTION_KEY,
    );
    expect(stored, "attribution must be captured in localStorage").toBeTruthy();
    const parsed = JSON.parse(stored!) as {
      first_touch: Record<string, string>;
      last_touch: Record<string, string>;
    };
    expect(parsed.last_touch.gclid).toBe("E2E_TEST_GCLID");
    expect(parsed.last_touch.utm_source).toBe("google");
    expect(parsed.last_touch.utm_campaign).toBe("flower-delivery-launch");

    // Attribution survives SPA navigation away from the landing page (clean URL).
    await page.goto("/");
    const afterNav = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ATTRIBUTION_KEY,
    );
    expect(afterNav).toBeTruthy();
    expect((JSON.parse(afterNav!) as { last_touch: Record<string, string> }).last_touch.gclid).toBe(
      "E2E_TEST_GCLID",
    );
  });

  test("hero CTA click fires campaign_hero_cta_click gtag mirror", async ({ page }) => {
    await page.goto(CAMPAIGN_URL);
    // Wait for the page to hydrate, then click the first hero CTA link.
    const cta = page.locator("a", { hasText: /best sellers|shop/i }).first();
    await cta.waitFor({ state: "visible", timeout: 15_000 });
    await cta.click();
    await expect
      .poll(async () => (await readGtagEvents(page)).map((e) => e.name), { timeout: 10_000 })
      .toContain("campaign_hero_cta_click");
  });
});
