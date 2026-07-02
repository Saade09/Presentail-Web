/**
 * Non-blocking CSS preload regression tests
 *
 * The `criticalCssPlugin` in vite.config.ts converts every Vite-emitted
 * <link rel="stylesheet"> for hashed CSS assets into the LoadCSS
 * preload+swap pattern:
 *
 *   <link rel="preload" as="style" href="..." onload="this.onload=null;this.rel='stylesheet'">
 *   <noscript><link rel="stylesheet" href="..."></noscript>
 *
 * On a slow connection the CSS response can arrive after first paint. Without
 * the preload pattern, a plain <link rel="stylesheet"> blocks the render tree
 * and the page stays blank; with it, the browser paints early and applies
 * styles once the download completes. However the late-arriving style swap can
 * itself produce a Cumulative Layout Shift if the unstyled layout differs
 * significantly from the styled one.
 *
 * These tests verify two properties:
 *
 * 1. HTML structure (built app): the served HTML must not contain a
 *    render-blocking <link rel="stylesheet"> for any hashed CSS asset path —
 *    the transform must have fired during the Vite build. When running against
 *    the Vite dev server (which bypasses the build plugin) this check is
 *    skipped gracefully with a console notice.
 *
 * 2. Slow-connection behaviour: when the CSS response is held for 4 s (well
 *    beyond the 2 s element-visibility timeout), the homepage hero container
 *    is visible before CSS arrives — confirming the page is not
 *    render-blocked. The Cumulative Layout Shift score after the style swap is
 *    below 0.1 (Google's "good" boundary).
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELIVERY_LOCATION = { countryCode: "LB", cityId: "lb-beirut" };

/**
 * How long CSS responses are held to simulate slow 3G. Must be substantially
 * longer than ELEMENT_VISIBLE_TIMEOUT_MS so the two assertions are
 * independently meaningful: a render-blocked page would stay blank for the
 * full CSS delay and therefore fail the element-visibility check, while a
 * non-blocking page (preload pattern) paints as soon as React boots (~1–2 s).
 */
const SLOW_CSS_DELAY_MS = 10_000;

/**
 * Upper bound for the page container to become visible after navigation. Set
 * well below SLOW_CSS_DELAY_MS but high enough to account for Vite dev-server
 * module-graph compilation time (~3–4 s on first load).
 *
 * If CSS were render-blocking at the 10 s delay this assertion would fail,
 * since the browser would not paint anything until the stylesheet arrived.
 */
const ELEMENT_VISIBLE_TIMEOUT_MS = 6_000;

/**
 * Google's "good" CLS boundary. The CSS onload swap must not cause a
 * perceptible layout shift for above-the-fold content.
 */
const CLS_THRESHOLD = 0.1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript((loc) => {
    window.localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify(loc),
    );
  }, DELIVERY_LOCATION);
}

/**
 * Capture the raw HTML body of the first document-level text/html response.
 * Must be registered before page.goto() is called.
 */
function captureHtml(page: Page): { get(): string } {
  let html = "";
  page.on("response", (res) => {
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("text/html") && html === "") {
      res
        .text()
        .then((t) => {
          html = t;
        })
        .catch(() => {});
    }
  });
  return { get: () => html };
}

// ---------------------------------------------------------------------------
// 1. HTML structure: render-blocking stylesheet links must be absent
// ---------------------------------------------------------------------------

test.describe("Non-blocking CSS — HTML structure", () => {
  /**
   * When the app is served from a production build the criticalCssPlugin
   * must have converted every hashed CSS asset link from:
   *
   *   <link rel="stylesheet" ... href="/assets/index-<hash>.css">
   *
   * to:
   *
   *   <link rel="preload" as="style" href="/assets/index-<hash>.css"
   *         onload="this.onload=null;this.rel='stylesheet'">
   *   <noscript><link rel="stylesheet" href="/assets/index-<hash>.css"></noscript>
   *
   * In Vite dev mode the plugin is inactive (`apply: "build"`), so hashed
   * asset paths (e.g. `/assets/index-Abc123.css`) simply do not appear in
   * the HTML — instead CSS is injected via JS HMR. The check is skipped in
   * that case with a console notice rather than a false failure.
   */
  test("served HTML must not contain a render-blocking stylesheet link for hashed CSS assets", async ({
    page,
  }) => {
    const htmlRef = captureHtml(page);
    await seedLocation(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Allow the response listener one tick to resolve.
    await page.waitForTimeout(300);

    const html = htmlRef.get();

    // Hashed CSS asset links use the pattern /assets/<name>-<hash>.css.
    // The regex below matches whether rel= or href= comes first.
    const hashedCssRe = /href="\/assets\/[^"]+-[A-Za-z0-9_-]{6,}\.[^"]*\.css[^"]*"/;

    if (!hashedCssRe.test(html)) {
      // Dev server — no hashed CSS paths in HTML. Plugin not active. Skip.
      console.log(
        "[non-blocking-css] No hashed CSS asset paths found in HTML " +
          "(Vite dev server mode — criticalCssPlugin is build-only). Skipping structure check.",
      );
      return;
    }

    // A hashed CSS asset must NOT appear inside a plain rel="stylesheet" link
    // outside a <noscript> block. Strip <noscript>…</noscript> so the
    // intentional fallback links don't trigger a false positive.
    const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");

    const blockingRelBeforeHref =
      /<link[^>]+rel="stylesheet"[^>]+href="\/assets\/[^"]+\.css[^"]*"/i;
    const blockingHrefBeforeRel =
      /<link[^>]+href="\/assets\/[^"]+\.css[^"]*"[^>]+rel="stylesheet"/i;

    expect(
      blockingRelBeforeHref.test(withoutNoscript),
      "Found a render-blocking <link rel=\"stylesheet\"> for a hashed CSS asset. " +
        "The criticalCssPlugin should have converted it to rel=\"preload\" as=\"style\".",
    ).toBe(false);

    expect(
      blockingHrefBeforeRel.test(withoutNoscript),
      "Found a render-blocking <link ... rel=\"stylesheet\"> (href-first) for a hashed CSS asset.",
    ).toBe(false);

    // The preload tag must be present.
    const preloadRe =
      /<link[^>]+rel="preload"[^>]+as="style"[^>]+href="\/assets\/[^"]+\.css[^"]*"/i;
    expect(
      preloadRe.test(html),
      'Expected a <link rel="preload" as="style"> tag for a hashed CSS asset after the transform.',
    ).toBe(true);

    // The noscript fallback must also be present.
    expect(
      html.includes("<noscript>"),
      "Expected a <noscript> fallback stylesheet link alongside every preload tag.",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Slow-connection: hero container visible before CSS arrives; CLS stays low
// ---------------------------------------------------------------------------

test.describe("Non-blocking CSS — slow connection (10 s CSS delay)", () => {
  test("homepage hero container is visible before CSS arrives and CLS stays below 0.1 after CSS swap", async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Instrument CLS collection before navigation.
    // -----------------------------------------------------------------------
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)["__cls__"] = 0;
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const ls = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!ls.hadRecentInput && typeof ls.value === "number") {
              (window as unknown as Record<string, unknown>)["__cls__"] =
                ((window as unknown as Record<string, unknown>)["__cls__"] as number) +
                ls.value;
            }
          }
        });
        po.observe({ type: "layout-shift", buffered: true });
      } catch {
        // PerformanceObserver unavailable in this context — CLS stays 0.
      }
    });

    // -----------------------------------------------------------------------
    // Intercept hashed CSS assets and hold each response for SLOW_CSS_DELAY_MS
    // to simulate a slow-3G stylesheet delivery.
    //
    // In Vite dev mode this pattern matches no requests (CSS is HMR-injected
    // via JS modules, not served from /assets/*.css). We track whether any
    // routes were actually matched so we can skip the CLS assertion in dev
    // mode — in dev mode Vite's late JS-injected styles produce a large
    // artificial shift that is not representative of the preload pattern.
    // The CLS assertion is only enforced when running against a production
    // build where the criticalCssPlugin is active.
    // -----------------------------------------------------------------------
    let cssRequestsDelayed = 0;
    await page.route("**/assets/*.css", async (route) => {
      cssRequestsDelayed++;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, SLOW_CSS_DELAY_MS),
      );
      await route.continue();
    });

    // Stub APIs the homepage calls so a missing backend does not prevent React
    // from rendering the page container. Return minimal valid responses.
    await page.route("**/api/banners**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, banners: [] }),
      }),
    );
    await page.route("**/api/woo/products**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, products: [] }),
      }),
    );
    await page.route("**/api/fx/rates**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }),
      }),
    );

    await seedLocation(page);

    // Navigate and stop waiting at DOMContentLoaded — CSS is still in-flight.
    await page.goto("/en-lb/beirut/", { waitUntil: "domcontentloaded" });

    // -----------------------------------------------------------------------
    // Assert 1: the homepage root container AND document title are visible /
    // non-empty well before CSS arrives.
    //
    // ELEMENT_VISIBLE_TIMEOUT_MS (6 s) << SLOW_CSS_DELAY_MS (10 s).
    // A page render-blocked by CSS would remain blank for the full 10 s;
    // with the preload pattern the browser paints the HTML immediately after
    // React boots, so the container appears within the shorter timeout.
    // Checking both the root container and document.title provides two
    // independent confirmation signals for "page is visible without CSS".
    // -----------------------------------------------------------------------
    const pageRoot = page.locator('[data-testid="page-country-homepage"]');
    await expect(pageRoot).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS });

    // document.title is set by the static HTML shell (Vite inlines it) and
    // updated by React's SeoHead once the component mounts. Either way it
    // must be non-empty before CSS arrives.
    const titleBeforeCss = await page.title();
    expect(
      titleBeforeCss.trim().length,
      "document.title must be non-empty before CSS arrives — " +
        "a blank title suggests the page paint is blocked by the stylesheet.",
    ).toBeGreaterThan(0);

    // -----------------------------------------------------------------------
    // Assert 2: after the CSS onload swap fires, CLS stays below the "good"
    // Google boundary.
    //
    // This assertion is only enforced when running against a production build
    // (cssRequestsDelayed > 0). In Vite dev mode, CSS is injected via JS
    // HMR modules — not served from /assets/*.css — so no CSS delay was
    // applied and the CLS reading reflects Vite's own injection order, not the
    // preload+swap pattern under test. Skipping the strict threshold in dev
    // mode avoids a false failure while still exercising the element-visibility
    // path above, which is the primary guard against render-blocking CSS.
    // -----------------------------------------------------------------------
    await page.waitForTimeout(SLOW_CSS_DELAY_MS + 500);

    const cls = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>)["__cls__"] as number,
    );

    if (cssRequestsDelayed === 0) {
      console.log(
        "[non-blocking-css] No /assets/*.css requests were delayed " +
          "(Vite dev server — CSS is HMR-injected). " +
          `CLS was ${cls.toFixed(4)} but strict threshold is skipped in dev mode. ` +
          "Re-run against a production build to enforce the CLS assertion.",
      );
    } else {
      expect(
        cls,
        `Cumulative Layout Shift after CSS onload swap is ${cls.toFixed(4)}, ` +
          `which exceeds the ${CLS_THRESHOLD} threshold. ` +
          "The late-arriving stylesheet is causing significant layout shifts — " +
          "check that above-the-fold elements have explicit dimensions so the " +
          "browser can reserve space before styles arrive.",
      ).toBeLessThan(CLS_THRESHOLD);
    }
  });
});
