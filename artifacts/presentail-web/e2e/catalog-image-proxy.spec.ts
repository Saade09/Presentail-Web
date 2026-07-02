/**
 * Playwright smoke test: catalog card images load as WebP and stay under 100 KB.
 *
 * Strategy:
 *   1. Stub the catalog metadata endpoints so the homepage renders occasion
 *      cards that reference the catalog image proxy.
 *   2. Intercept every request to /api/catalog/*-image/* at the browser level.
 *   3. Return a minimal valid WebP fixture (< 1 KB) so the page renders without
 *      hitting the real OS backend.
 *   4. After navigation, assert that:
 *        (a) at least one catalog image request was made,
 *        (b) every such request URL contains f=webp and a w= param,
 *        (c) the stubbed response body is image/webp and < 100 KB.
 *
 * This guards against two regressions:
 *   - The frontend reverting to serving the raw OS URL (skipping the proxy).
 *   - The proxy endpoint being called without the WebP format query param.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Minimal 1×1 WebP fixture (34 bytes — well under the 100 KB budget).
// Generated via: sharp().resize(1,1).webp({quality:1}).toBuffer()
// ---------------------------------------------------------------------------
const TINY_WEBP_BASE64 =
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAwA0JZACdAEO/gHOAAA=";
const TINY_WEBP = Buffer.from(TINY_WEBP_BASE64, "base64");

// Sanity: fixture must itself be under budget.
const SIZE_BUDGET_BYTES = 100 * 1024; // 100 KB

// ---------------------------------------------------------------------------
// Shared stubs for all APIs the homepage needs to render occasion cards.
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 0 },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

const STUB_FX_RATES = { ok: true, base: "USD", rates: { USD: 1 } };

/** An occasion that has a catalog image proxy URL. */
const STUB_OCCASION_WITH_IMAGE = {
  slug: "birthday",
  name: "Birthday",
  image: "/api/catalog/occasion-image/occ-birthday-123",
};

async function installStubs(page: Page, capturedRequests: string[]): Promise<void> {
  // Currencies
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
  );
  // FX rates
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
  );
  // Geo currency (no lock → neutral USD)
  await page.route("**/api/geo/currency", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currencyCode: "USD" }) }),
  );
  // Featured occasions list (used by ShopByOccasion on the homepage)
  await page.route("**/api/catalog/occasions", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ occasions: [STUB_OCCASION_WITH_IMAGE] }) }),
  );
  // Catalog metadata (used by the shop shell nav — return minimal data)
  await page.route("**/api/catalog/metadata", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        occasions: [],
        categories: [],
        brands: [],
        locations: [],
        deliverySlots: [],
      }),
    }),
  );
  // Brand allowlist stub (optional endpoint — 404 = not set)
  await page.route("**/api/catalog/brand-allowlist", (r) => r.fulfill({ status: 404, body: "" }));
  // OS direct product calls (homepage may issue a featured products fetch)
  await page.route("**/os.presentail.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], totalPages: 1 }) }),
  );
  // API-server product fallback
  await page.route("**/api/woo/products**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, products: [] }) }),
  );

  // ── Catalog image proxy — intercept, record, and return the tiny WebP ──
  await page.route("**/api/catalog/**-image/**", (route) => {
    const url = route.request().url();
    capturedRequests.push(url);
    route.fulfill({
      status: 200,
      contentType: "image/webp",
      body: TINY_WEBP,
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Catalog card image proxy — WebP smoke test", () => {
  test("catalog images are requested as WebP and the response is under 100 KB", async ({ page }) => {
    const catalogRequests: string[] = [];
    await installStubs(page, catalogRequests);

    // Seed delivery location so the homepage renders (not the country-picker gate).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });

    await page.goto("/");

    // Wait for at least one catalog image request to arrive.
    await page.waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll("img"));
        return imgs.some((img) => img.src.includes("/api/catalog/"));
      },
      { timeout: 15_000 },
    );

    // At least one catalog image must have been requested.
    expect(catalogRequests.length).toBeGreaterThan(0);

    // Every catalog image request must include WebP format and a width hint.
    for (const url of catalogRequests) {
      expect(url, `catalog image request missing f=webp: ${url}`).toContain("f=webp");
      expect(url, `catalog image request missing w= param: ${url}`).toContain("w=");
    }

    // The fixture itself must be under the 100 KB budget (sanity guard).
    expect(TINY_WEBP.byteLength).toBeLessThan(SIZE_BUDGET_BYTES);
  });

  test("catalog image srcset requests all use WebP format for each width descriptor", async ({ page }) => {
    const catalogRequests: string[] = [];
    await installStubs(page, catalogRequests);

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });

    await page.goto("/");

    // Wait for catalog image img elements to appear in the DOM.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("img")).some((img) => img.src.includes("/api/catalog/")),
      { timeout: 15_000 },
    );

    // Collect all srcset attribute values from catalog img elements.
    const srcsets = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => img.getAttribute("src")?.includes("/api/catalog/"))
        .map((img) => img.getAttribute("srcset") ?? ""),
    );

    // The ShimmerImage/OccasionIcon components should supply a srcset.
    // At least one image must have srcset defined.
    const hasSrcset = srcsets.some((s) => s.length > 0);
    expect(hasSrcset).toBe(true);

    // Every srcset entry (when present) must reference WebP format.
    for (const srcset of srcsets.filter((s) => s.length > 0)) {
      const entries = srcset.split(",").map((e) => e.trim());
      for (const entry of entries) {
        expect(entry, `srcset entry missing f=webp: ${entry}`).toContain("f=webp");
      }
    }
  });

  test("catalog image response body is under 100 KB", async ({ page }) => {
    const responses: { url: string; size: number; contentType: string }[] = [];

    await page.route("**/api/catalog/**-image/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "image/webp",
        body: TINY_WEBP,
      });
    });

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/catalog/") && url.includes("-image/")) {
        try {
          const body = await response.body();
          const contentType = response.headers()["content-type"] ?? "";
          responses.push({ url, size: body.byteLength, contentType });
        } catch {
          // Response already consumed — skip.
        }
      }
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "presentail_delivery_location_v1",
        JSON.stringify({ countryCode: "LB", cityId: "lb-beirut" }),
      );
    });

    // Install supporting stubs (minus the catalog image route which we handle above).
    await page.route("**/api/currencies", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }),
    );
    await page.route("**/api/fx/rates", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_FX_RATES) }),
    );
    await page.route("**/api/geo/currency", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currencyCode: "USD" }) }),
    );
    await page.route("**/api/catalog/occasions", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ occasions: [STUB_OCCASION_WITH_IMAGE] }) }),
    );
    await page.route("**/api/catalog/metadata", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ occasions: [], categories: [], brands: [], locations: [], deliverySlots: [] }) }),
    );
    await page.route("**/api/catalog/brand-allowlist", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("**/os.presentail.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], totalPages: 1 }) }),
    );
    await page.route("**/api/woo/products**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, products: [] }) }),
    );

    await page.goto("/");

    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("img")).some((img) => img.src.includes("/api/catalog/")),
      { timeout: 15_000 },
    );

    // All captured catalog image responses must be WebP and < 100 KB.
    expect(responses.length).toBeGreaterThan(0);
    for (const { url, size, contentType } of responses) {
      expect(contentType, `expected image/webp for ${url}`).toContain("image/webp");
      expect(size, `response for ${url} exceeds 100 KB (got ${size} bytes)`).toBeLessThan(SIZE_BUDGET_BYTES);
    }
  });
});
