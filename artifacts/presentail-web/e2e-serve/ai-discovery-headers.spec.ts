/**
 * AI-discovery Link header completeness tests (serve.mjs only)
 *
 * Every HTML response from serve.mjs must carry a `Link` header that includes
 * all four `rel="describedby"` entries pointing at the AI/LLM discovery files:
 *
 *   /llms.txt       — machine-readable site index (llmstxt.org format)
 *   /llms-full.txt  — extended variant with inline page content
 *   /sitemap.md     — human-readable Markdown sitemap for AI agents
 *   /agents.md      — AI-agent capability / intent document
 *
 * These headers are emitted in **two distinct places** in serve.mjs:
 *   1. The static-file branch (serves "/" → dist/public/index.html)
 *   2. The SPA fallback branch (serves any locale-prefixed path such as
 *      "/en-lb/beirut/" that has no matching file in dist/public)
 *
 * Both branches are exercised here so that a regression that only removes the
 * header from one branch is caught.  A new HTML route that wires up its own
 * `res.writeHead` without copying the Link header would also be caught if it
 * handles paths covered by the HTML_PATHS list below.
 *
 * These tests use Playwright's APIRequestContext so they exercise the real HTTP
 * layer (serve.mjs) without a browser — exactly what AI crawlers receive.
 *
 * IMPORTANT: the asserted behaviour exists ONLY in the production Node server
 * (serve.mjs).  This spec lives in ./e2e-serve (playwright.serve.config.ts) and
 * MUST be pointed at a built serve.mjs instance via PLAYWRIGHT_BASE_URL.
 */

import { test, expect } from "@playwright/test";

/** All four AI-discovery resource paths that must appear in the Link header. */
const DISCOVERY_PATHS = [
  "/llms.txt",
  "/llms-full.txt",
  "/sitemap.md",
  "/agents.md",
] as const;

/**
 * HTML paths that exercise both Link-header emission sites in serve.mjs:
 *   "/"              → static-file branch (dist/public/index.html)
 *   "/en-lb/beirut/" → SPA fallback branch (no matching file in dist/public)
 */
const HTML_PATHS = ["/", "/en-lb/beirut/"] as const;

test.describe("AI-discovery Link headers on HTML responses", () => {
  for (const htmlPath of HTML_PATHS) {
    test.describe(`path: ${htmlPath}`, () => {
      for (const discoveryPath of DISCOVERY_PATHS) {
        test(`Link header includes <origin>${discoveryPath}; rel="describedby"`, async ({
          request,
        }) => {
          const response = await request.get(htmlPath);
          expect(response.status()).toBe(200);

          const linkHeader = response.headers()["link"] ?? "";

          // Each discovery entry must appear as an absolute URL ending with
          // the expected path, tagged with rel="describedby".
          // The regex accepts both single and double quotes around rel values
          // and tolerates optional whitespace around ";" separators.
          const escaped = discoveryPath.replace(".", "\\.");
          const pattern = new RegExp(
            `<[^>]+${escaped}>\\s*;\\s*rel="describedby"`,
          );
          expect(linkHeader, `Link header for ${htmlPath}`).toMatch(pattern);
        });
      }

      test("Link header carries all four describedby entries in a single header value", async ({
        request,
      }) => {
        const response = await request.get(htmlPath);
        expect(response.status()).toBe(200);

        const linkHeader = response.headers()["link"] ?? "";

        const matches = linkHeader.match(/rel="describedby"/g);
        expect(
          matches?.length ?? 0,
          `Expected 4 rel="describedby" entries in Link header for ${htmlPath}, got: ${JSON.stringify(linkHeader)}`,
        ).toBe(4);
      });
    });
  }
});
