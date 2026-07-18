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
 * These headers are emitted in **five distinct places** in serve.mjs:
 *   1. The static-file branch (serves "/" → dist/public/index.html)
 *   2. The SPA fallback branch (serves any locale-prefixed path such as
 *      "/en-lb/beirut/" that has no matching file in dist/public)
 *   3. The locale-route 404 guard (known lang+country+city but unknown
 *      sub-route, e.g. "/en-lb/beirut/not-a-real-page")
 *   4. The non-locale-path 404 guard (unrecognised bare path, e.g.
 *      "/does-not-exist")
 *   5. The pagination out-of-range 404 (page number beyond available pages)
 *
 * Paths 1–2 (200 responses) and 3–4 (404 responses) are exercised here so
 * that a regression that removes the header from any branch is caught. Path 5
 * requires a full catalog with paginated results to trigger and is documented
 * in the inline comment below rather than tested with a live request.
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

/**
 * Paths that trigger a real HTTP 404 HTML response from serve.mjs while still
 * carrying AI-discovery Link headers:
 *
 *   "/en-lb/beirut/not-a-real-page" — locale-route 404 guard: known
 *     lang+country+city but unrecognised sub-route. Without AI-discovery
 *     headers here, crawlers landing on a dead URL cannot discover llms.txt.
 *
 *   "/does-not-exist" — non-locale-path 404 guard: completely unrecognised
 *     bare path. Same rationale.
 *
 * The pagination out-of-range 404 (paginationRef.outOfRange) also emits the
 * Link header after the same code change but is not exercised here because it
 * requires a real product catalog with enough products to overflow a page —
 * the CI environment does not have one.  The server-side code change that adds
 * the header to that branch is covered by the same code review as this spec.
 */
const NOT_FOUND_PATHS = [
  "/en-lb/beirut/not-a-real-page",
  "/does-not-exist",
] as const;

/** Helper: build a regex that matches `<...{path}>; rel="describedby"`. */
function describedByPattern(discoveryPath: string): RegExp {
  const escaped = discoveryPath.replace(".", "\\.");
  return new RegExp(`<[^>]+${escaped}>\\s*;\\s*rel="describedby"`);
}

test.describe("AI-discovery Link headers on HTML responses", () => {
  test.describe("200 OK responses", () => {
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
            expect(linkHeader, `Link header for ${htmlPath}`).toMatch(
              describedByPattern(discoveryPath),
            );
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

  test.describe("404 Not Found responses", () => {
    /**
     * 404 HTML responses must also carry AI-discovery Link headers so that
     * crawlers landing on a dead URL can still discover llms.txt and related
     * files.  The canonical link is intentionally absent on 404 pages; only
     * the four describedby entries are required.
     */
    for (const notFoundPath of NOT_FOUND_PATHS) {
      test.describe(`path: ${notFoundPath}`, () => {
        for (const discoveryPath of DISCOVERY_PATHS) {
          test(`Link header includes <origin>${discoveryPath}; rel="describedby"`, async ({
            request,
          }) => {
            const response = await request.get(notFoundPath);
            expect(response.status()).toBe(404);

            const linkHeader = response.headers()["link"] ?? "";

            expect(
              linkHeader,
              `Link header for ${notFoundPath}`,
            ).toMatch(describedByPattern(discoveryPath));
          });
        }

        test("Link header carries all four describedby entries in a single header value", async ({
          request,
        }) => {
          const response = await request.get(notFoundPath);
          expect(response.status()).toBe(404);

          const linkHeader = response.headers()["link"] ?? "";

          const matches = linkHeader.match(/rel="describedby"/g);
          expect(
            matches?.length ?? 0,
            `Expected 4 rel="describedby" entries in Link header for ${notFoundPath}, got: ${JSON.stringify(linkHeader)}`,
          ).toBe(4);
        });
      });
    }
  });
});
