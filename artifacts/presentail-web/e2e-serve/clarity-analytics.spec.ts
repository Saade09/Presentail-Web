/**
 * Microsoft Clarity analytics smoke tests (serve.mjs, production build)
 *
 * Verifies that the Clarity snippet is correctly present in the HTML served
 * by serve.mjs on the key page routes (homepage, shop, product detail page)
 * and that no Clarity-related console errors are emitted when the page loads.
 *
 * WHY these run against serve.mjs (not the Vite dev server):
 * - clarityInjectPlugin() in vite.config.ts uses `apply: "build"` and is
 *   guarded by `mode === "production"`, so the snippet is ONLY present in the
 *   production build output served by serve.mjs — it is intentionally absent
 *   from the dev server.
 * - These specs confirm the snippet survives the full build + serve pipeline
 *   end-to-end, giving the same confidence as the post-deploy network-tab check
 *   described in the task acceptance criteria.
 *
 * WHAT is asserted:
 *   1. The Clarity CDN script URL (www.clarity.ms/tag/<id>) is present in the
 *      raw HTML response for the homepage, shop page, and a product detail URL.
 *   2. The expected project ID (mik1damp04) appears in each page's HTML.
 *   3. The snippet is wrapped in a <script> block (not a dangling string).
 *   4. Loading the homepage in a real browser emits no console errors whose
 *      message contains "clarity" (case-insensitive).
 *
 * Run locally after a production build + serve:
 *   PORT=19234 BASE_PATH=/ NODE_ENV=production node artifacts/presentail-web/serve.mjs &
 *   PLAYWRIGHT_BASE_URL=http://localhost:19234 \
 *     pnpm --filter @workspace/presentail-web run test:e2e:serve \
 *     --grep "Clarity"
 */

import { test, expect } from "@playwright/test";

const CLARITY_PROJECT_ID = "mik1damp04";
const CLARITY_CDN_REF = `www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
const CLARITY_LOADER_VAR = `"clarity"`;

// Key routes to verify — homepage, shop listing, and a sample product URL.
// The product URL intentionally uses a path that the SPA will handle; we only
// care about the HTML shell (index.html), not the rendered product content.
const KEY_ROUTES = [
  { label: "homepage (/)", path: "/" },
  { label: "locale-prefixed homepage (/en-lb/beirut)", path: "/en-lb/beirut" },
  { label: "shop listing (/en-lb/beirut/shop)", path: "/en-lb/beirut/shop" },
  {
    label: "product detail page (/en-lb/beirut/product/rose-bouquet)",
    path: "/en-lb/beirut/product/rose-bouquet",
  },
];

test.describe("Clarity analytics snippet — serve.mjs production build", () => {
  // -------------------------------------------------------------------------
  // 1. HTML-level checks: snippet present in raw server response
  // -------------------------------------------------------------------------

  for (const { label, path } of KEY_ROUTES) {
    test(`[${label}] Clarity CDN ref and project ID are present in the HTML response`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(
        response.status(),
        `Expected 200 for ${path}, got ${response.status()}`,
      ).toBe(200);

      const html = await response.text();

      expect(
        html,
        `Clarity CDN ref ("${CLARITY_CDN_REF}") must be present in the HTML for ${label}.\n` +
          `This means clarityInjectPlugin() in vite.config.ts was not applied or the build\n` +
          `did not run in production mode (mode=production).`,
      ).toContain(CLARITY_CDN_REF);

      expect(
        html,
        `Clarity loader variable name (${CLARITY_LOADER_VAR}) must be present in the HTML for ${label}.\n` +
          `The snippet structure may have diverged from the canonical Clarity tag.`,
      ).toContain(CLARITY_LOADER_VAR);

      // The snippet must live inside a <script> block — confirms the </head>
      // injection target was found and the script tag was properly closed.
      const hasScriptBlock = /<script>[^<]*clarity[^<]*<\/script>/.test(html);
      expect(
        hasScriptBlock,
        `The Clarity snippet must be wrapped in a <script>...</script> block in ${label}.\n` +
          `Check that clarityInjectPlugin.transformIndexHtml found the closing </head> tag.`,
      ).toBe(true);
    });
  }

  // -------------------------------------------------------------------------
  // 2. Browser-level check: no Clarity-related console errors on page load
  // -------------------------------------------------------------------------

  test("loading the homepage in a real browser produces no Clarity-related console errors", async ({
    page,
  }) => {
    const clarityErrors: string[] = [];

    // Collect console errors whose message mentions "clarity" so that any
    // failure mode (e.g. CSP block, script load failure, invalid project ID)
    // surfaces immediately in CI output.
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        msg.text().toLowerCase().includes("clarity")
      ) {
        clarityErrors.push(msg.text());
      }
    });

    // Also capture page errors (uncaught JS exceptions) referencing clarity.
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("clarity")) {
        clarityErrors.push(`[pageerror] ${err.message}`);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Allow a brief moment for the async Clarity loader to attempt its first
    // network call — this is what would surface a "Script error." or blocked-
    // by-CSP error in the console. 2 s is sufficient for a local serve.
    await page.waitForTimeout(2000);

    expect(
      clarityErrors,
      `Clarity-related console errors were detected on page load:\n` +
        clarityErrors.map((e) => `  • ${e}`).join("\n") +
        `\n\nCommon causes:\n` +
        `  • Content-Security-Policy is blocking https://www.clarity.ms\n` +
        `  • The Clarity project ID (${CLARITY_PROJECT_ID}) is invalid or revoked\n` +
        `  • A network error prevented the clarity.ms script from loading`,
    ).toEqual([]);
  });
});
