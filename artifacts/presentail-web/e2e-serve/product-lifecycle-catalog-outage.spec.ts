/**
 * Product lifecycle resilience test — catalog API outage
 *
 * Verifies that when the OS/catalog API is entirely unreachable (HTTP 503),
 * product page URLs still return HTTP 200 rather than a false-positive 410 Gone.
 *
 * The silent regression risk
 * ──────────────────────────
 * Before the fix, fetchEntityForSeo returned null for BOTH:
 *   (a) HTTP 404 — product genuinely absent from the catalog
 *   (b) HTTP 503 / network error / timeout — catalog API is temporarily down
 *
 * fetchEntityForSeoCached propagated null without distinction, so
 * injectSeoTagsAsync set lifecycleOut.productFound = false for both cases.
 * resolveProductLifecycleResponse then issued a 410 Gone for both cases —
 * silently de-indexing all product pages during any catalog outage or cold-start.
 *
 * The fix
 * ───────
 * fetchEntityForSeo now returns { notFound: true } only for HTTP 404 and null
 * for all other errors. fetchEntityForSeoCached propagates out.definitelyNotFound
 * = true only on the 404 sentinel. injectSeoTagsAsync only sets
 * lifecycleOut.productFound = false (triggering 410) when definitelyNotFound is
 * true; a plain null (transient error) leaves productFound unset so
 * resolveProductLifecycleResponse returns null → 200.
 *
 * How it works
 * ────────────
 * 1. Mock catalog API — returns HTTP 503 for every request, simulating a full
 *    catalog outage.
 * 2. serve.mjs — spawned with INTERNAL_API_BASE_URL pointing at the mock API.
 *    Uses the existing dist/public/index.html build artifact (required so
 *    serve.mjs can read the SPA shell and run the lifecycle check). In CI the
 *    "Web serve checks" workflow builds first; locally run
 *    `pnpm --filter @workspace/presentail-web run build` once before this spec.
 * 3. Tests assert that product URLs return 200, not 410.
 *
 * This spec follows the same self-contained pattern as sitemap-catalog-outage
 * and llms-catalog-outage: it manages its own server lifecycle via
 * beforeAll/afterAll and uses Node's built-in fetch() — no shared
 * PLAYWRIGHT_BASE_URL needed.
 */

import { test, expect } from "@playwright/test";
import * as http from "node:http";
import * as net from "node:net";
import * as cp from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "..", "serve.mjs");
const DIST_INDEX = path.resolve(__dirname, "..", "dist", "public", "index.html");

// ---------------------------------------------------------------------------
// Helpers (same pattern as sitemap-catalog-outage.spec.ts)
// ---------------------------------------------------------------------------

function startServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("unexpected server address"));
        return;
      }
      resolve({ server, port: addr.port });
    });
    server.on("error", reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitForPort(
  host: string,
  port: number,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port });
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(
            new Error(`serve.mjs did not become ready within ${timeoutMs}ms`),
          );
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

async function getUrl(
  urlString: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const res = await fetch(urlString, { redirect: "manual" });
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: res.status, headers, body };
}

// ---------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------

const LOCALE = "en-lb";
const CITY = "beirut";

function productPath(slug: string) {
  return `/${LOCALE}/${CITY}/product/${slug}`;
}

// ---------------------------------------------------------------------------
// Test harness state (shared across the describe block via closures)
// ---------------------------------------------------------------------------

let mockApiServer: http.Server;
let mockApiPort: number;
let serveProcess: cp.ChildProcess;
let servePort: number;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "Product lifecycle — graceful degradation when catalog API is down (503)",
  () => {
    test.beforeAll(async () => {
      // This spec requires dist/public/index.html so serve.mjs can serve the
      // SPA shell for product routes. In CI the "Web serve checks" workflow
      // builds first; locally run the build step once before running this spec.
      if (!fs.existsSync(DIST_INDEX)) {
        // Mark the process-level flag so all tests in the describe skip.
        // test.skip() inside beforeAll is not supported; throw to fail fast
        // with a clear message instead of silently producing no assertions.
        throw new Error(
          "SKIP: dist/public/index.html not found — run the web build first" +
            " (`pnpm --filter @workspace/presentail-web run build`).",
        );
      }

      // 1. Mock catalog API — always 503.
      const mockResult = await startServer((_req, res) => {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("Service Unavailable (mock)");
      });
      mockApiServer = mockResult.server;
      mockApiPort = mockResult.port;

      // 2. Grab a free port for serve.mjs.
      const portResult = await startServer((_req, res) => res.end());
      servePort = portResult.port;
      await closeServer(portResult.server);

      // 3. Spawn serve.mjs with INTERNAL_API_BASE_URL pointing at the 503 mock.
      serveProcess = cp.spawn(process.execPath, [SERVE_MJS], {
        env: {
          ...process.env,
          PORT: String(servePort),
          INTERNAL_API_BASE_URL: `http://127.0.0.1:${mockApiPort}`,
          BASE_PATH: "/",
        },
        stdio: "pipe",
      });
      serveProcess.stdout?.resume();
      serveProcess.stderr?.resume();

      // 4. Wait until serve.mjs is accepting connections.
      await waitForPort("127.0.0.1", servePort);
    });

    test.afterAll(async () => {
      serveProcess?.kill("SIGTERM");
      if (mockApiServer) await closeServer(mockApiServer);
    });

    // -------------------------------------------------------------------------
    // Core regression: a 503 catalog outage must NOT yield a 410 product page
    // -------------------------------------------------------------------------

    test("product URL returns 200 (not 410) when catalog API returns 503", async () => {
      // The slug is unknown to the mock API (which returns 503 for everything).
      // Before the fix: fetchEntityForSeo returned null (same as 404), so
      // lifecycleOut.productFound was set to false → 410.
      // After the fix: a 503 response returns null without definitelyNotFound,
      // so productFound is left unset and the response is 200.
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort}${productPath("rose-bouquet")}`,
      );
      expect(status).toBe(200);
    });

    test("different product slug also returns 200 during catalog outage", async () => {
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort}${productPath("luxury-hamper")}`,
      );
      expect(status).toBe(200);
    });

    test("product URL body is the SPA shell (not a 410 error page) during outage", async () => {
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort}${productPath("rose-bouquet")}`,
      );
      // The SPA shell must be returned — not the lightweight 410 error body.
      expect(body.toLowerCase()).toContain("<!doctype html");
      expect(body).not.toContain("This product is no longer available");
      expect(body).not.toContain("410");
    });

    test("product URL does NOT receive x-robots-tag: noindex during catalog outage", async () => {
      // A 410 response carries x-robots-tag: noindex.  A 200 response on the
      // canonical host carries "index, follow".  During an outage the page
      // must not be wrongly de-indexed.
      const { headers } = await getUrl(
        `http://127.0.0.1:${servePort}${productPath("rose-bouquet")}`,
      );
      // x-robots-tag is omitted on non-canonical hosts (tests run on localhost);
      // the important check is that it is NOT set to "noindex" — which would
      // indicate the lifecycle handler erroneously returned a 410 path.
      const robotsTag = headers["x-robots-tag"] ?? "";
      expect(robotsTag).not.toBe("noindex");
    });

    // -------------------------------------------------------------------------
    // Verify that the sitemap route is also unaffected by a catalog outage
    // (belt-and-suspenders: already covered by sitemap-catalog-outage.spec.ts
    // but useful here to confirm the same process handles both correctly).
    // -------------------------------------------------------------------------

    test("/sitemap.xml still returns 200 from the same serve.mjs process", async () => {
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.xml`,
      );
      expect(status).toBe(200);
    });
  },
);
