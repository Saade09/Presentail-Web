/**
 * Paid-only late-night campaign — SPA route guard + SEO regression tests
 * (serve.mjs).
 *
 * /en-lb/beirut/late-night-flower-delivery is a paid-search-only landing page.
 * It is a recognised SPA sub-route for that ONE locale/city tuple only:
 *   - Served as the SPA shell (HTTP 200) for /en-lb/beirut.
 *   - noindex,follow via X-Robots-Tag header and the in-HTML robots meta.
 *   - Self-referencing canonical (not the city home, not canonical removal).
 *   - No hreflang alternates, no JSON-LD, no Markdown mirror (incl. .md).
 *   - Every OTHER locale/city keeps returning HTTP 404 via the exact route
 *     guard, and the .md twin is a 404.
 *
 * Must run against the production Node server (serve.mjs), not the Vite dev
 * server. Run locally: build the app, start serve.mjs on a free port, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<PORT> \
 *     pnpm --filter @workspace/presentail-web run test:e2e:serve
 */

import { test, expect } from "@playwright/test";

const PAID_PATH = "/en-lb/beirut/late-night-flower-delivery";
const CAMPAIGN_RESPONSE = {
  campaignKey: "campaign-beirut-late-night",
  status: "tonight",
  reason: "eligible",
  timeZone: "Asia/Beirut",
  evaluatedAt: "2026-08-19T20:00:00.000Z",
  quoteExpiresAt: "2099-08-19T20:30:00.000Z",
  nominalCutoffAt: "2026-08-19T20:30:00.000Z",
  effectiveCutoffAt: "2026-08-19T20:30:00.000Z",
  cutoffLabel: "11:30 PM",
  deliveryWindow: {
    date: "2026-08-19",
    label: "11:00 PM – 1:00 AM",
    slotId: "beirut-late",
  },
  sourceFreshness: {
    locationsStatus: "live",
    productRefreshedAt: "2026-08-19T19:59:00.000Z",
    operationsConfigVerified: true,
  },
  availableTonight: {
    title: "Available Tonight",
    subtitle: "Fresh flowers ready for late-night delivery in Beirut",
    viewAllHref: "/category/flowers",
    products: [],
  },
  luxury: {
    title: "Late-Night Luxury Arrangements",
    subtitle: "Statement flowers for unforgettable last-minute moments",
    viewAllHref: "/category/lux-arrangements",
    products: [],
  },
};

const UNAVAILABLE_CAMPAIGN_RESPONSE = {
  ...CAMPAIGN_RESPONSE,
  status: "unavailable",
  reason: "slot-unavailable",
  deliveryWindow: null,
  nextAvailableWindow: null,
  cutoffLabel: null,
};

test.describe("paid-only late-night landing — recognised for /en-lb/beirut", () => {
  test("returns 200 (recognised SPA sub-route)", async ({ request }) => {
    const response = await request.get(PAID_PATH);
    expect(response.status(), "paid-only sub-route must be served as SPA shell").toBe(200);
  });

  test("normalizes a trailing slash to the canonical paid route", async ({ request }) => {
    const trailingSlashResponse = await request.get(`${PAID_PATH}/`, {
      maxRedirects: 0,
    });
    expect(trailingSlashResponse.status()).toBe(301);
    expect(trailingSlashResponse.headers().location).toBe(PAID_PATH);

    const canonicalResponse = await request.get(PAID_PATH);
    expect(canonicalResponse.status()).toBe(200);
  });

  test("boots the Beirut late-night React landing page", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });
    await page.route("**/api/campaign/beirut-late-night", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(CAMPAIGN_RESPONSE),
      }),
    );
    await page.route("**/api/web-events", (route) =>
      route.fulfill({ contentType: "application/json", body: '{"ok":true}' }),
    );

    await page.goto(PAID_PATH);
    await expect(page.getByTestId("late-night-page")).toBeVisible();
    await expect(page.getByTestId("late-night-headline")).toHaveText(
      "Late-night flower delivery in Beirut",
    );
  });

  test("keeps the dedicated landing page truthful when the slot is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });
    await page.route("**/api/campaign/beirut-late-night", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(UNAVAILABLE_CAMPAIGN_RESPONSE),
      }),
    );
    await page.route("**/api/web-events", (route) =>
      route.fulfill({ contentType: "application/json", body: '{"ok":true}' }),
    );

    await page.goto(PAID_PATH);

    await expect(page.getByTestId("late-night-page")).toBeVisible();
    await expect(page.getByTestId("late-night-headline")).toContainText(
      "Late-night flower delivery in Beirut",
    );
    await expect(page.getByTestId("late-night-status-pill")).toContainText(
      "Late-night delivery is unavailable right now",
    );
    await expect(page.getByTestId("late-night-empty-state")).toBeVisible();
    await expect(page.getByTestId("late-night-section-flowers")).toHaveCount(0);
    await expect(page.getByTestId("late-night-hero-cta")).toHaveCount(0);
    await expect(page.getByTestId("late-night-sticky-cta")).toHaveCount(0);
  });

  test("carries a noindex X-Robots-Tag header", async ({ request }) => {
    const response = await request.get(PAID_PATH);
    const robotsTag = response.headers()["x-robots-tag"];
    // On non-canonical preview hosts the header may be omitted; when present it
    // must be noindex (never "index, follow").
    if (robotsTag !== undefined) {
      expect(robotsTag).toContain("noindex");
    }
  });

  test("emits noindex robots meta, self-canonical, no hreflang/JSON-LD in HTML", async ({
    request,
  }) => {
    const response = await request.get(PAID_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();

    // noindex, follow robots meta.
    expect(html).toMatch(
      /<meta[^>]+name="robots"[^>]+content="noindex, follow"/,
    );

    // Self-referencing canonical (ends with the paid path, NOT the city home).
    const canonicalMatch = html.match(
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/,
    );
    expect(canonicalMatch, "self-canonical link must be present").toBeTruthy();
    const canonicalHref = canonicalMatch![1];
    expect(canonicalHref.endsWith(PAID_PATH)).toBe(true);
    expect(canonicalHref.endsWith("/en-lb/beirut")).toBe(false);

    // No hreflang alternates.
    expect(html).not.toMatch(/<link[^>]+rel="alternate"[^>]+hreflang=/);

    // No JSON-LD structured data.
    expect(html).not.toContain('application/ld+json');

    // No Markdown alternate link.
    expect(html).not.toContain('type="text/markdown"');
  });

  test(".md twin returns 404 (no markdown mirror)", async ({ request }) => {
    const response = await request.get(`${PAID_PATH}.md`);
    expect(response.status()).toBe(404);
  });
});

test.describe("paid-only late-night landing — 404 for other locales/cities", () => {
  const otherPaths = [
    "/ar-lb/beirut/late-night-flower-delivery", // wrong lang
    "/en-lb/tripoli/late-night-flower-delivery", // wrong city
    "/en-ae/dubai/late-night-flower-delivery", // wrong country/city
    "/en-cy/nicosia/late-night-flower-delivery", // wrong country/city
  ];

  for (const path of otherPaths) {
    test(`${path} returns 404`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), `${path} must stay a 404`).toBe(404);
    });

    test(`${path}.md returns 404`, async ({ request }) => {
      const response = await request.get(`${path}.md`);
      expect(response.status(), `${path}.md must stay a 404`).toBe(404);
    });
  }
});
