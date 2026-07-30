/**
 * /sitemap-en.xml recovery test — catalog comes back up after outage
 *
 * Verifies that once the catalog API recovers (starts returning valid category,
 * occasion, and product data), GET /sitemap-en.xml switches from the static
 * fallback (root + locale/city pages only) to the live catalog data —
 * specifically that a category slug which is present in the live feed but
 * absent from the static fallback appears in the XML after the catalog
 * becomes reachable.
 *
 * Complements sitemap-catalog-outage.spec.ts, which only exercises the
 * cold-cache 503 path.
 *
 * How it works
 * ────────────
 * 1. Mock catalog API — a single Node `http.Server` whose behavior is
 *    controlled by a mutable `mockState` closure variable.  It starts in
 *    "down" state (503) and is later flipped to "up" (returns live category /
 *    occasion / product data).
 *
 * 2. Two serve.mjs processes — one per phase.
 *    Phase 1 uses a process spawned while the mock is in "down" state so its
 *    cold-cache /sitemap-en.xml fetch fails and falls back to the static XML
 *    (root + locale pages, no catalog entities).
 *    Phase 2 uses a FRESH process spawned after the mock flips to "up":
 *    because /sitemap-en.xml has an in-process stale-while-revalidate cache
 *    (SITEMAP_CACHE_TTL_MS + SITEMAP_RETRY_WINDOW_MS), reusing the same
 *    process would require waiting minutes for the retry window to expire.
 *    A fresh process has a cold cache and immediately fetches from the now-
 *    recovered catalog.
 *
 * Why this is in e2e-serve rather than a unit test
 * ─────────────────────────────────────────────────
 * The existing unit tests for resolveSitemap already exercise the recovery
 * logic in isolation (see src/lib/sitemap.test.ts).  This spec tests the
 * *live HTTP response* from the production server — verifying that the import
 * chain, cache-resolver wiring, and response composition are all correct in
 * serve.mjs, and that a newly spawned process with a live catalog produces the
 * expected enriched body.
 *
 * Note: this spec does NOT use the shared PLAYWRIGHT_BASE_URL.  It manages
 * its own server lifecycle via beforeAll/afterAll.
 */

import { test, expect } from "@playwright/test";
import * as http from "node:http";
import * as net from "node:net";
import * as cp from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "..", "serve.mjs");

// ---------------------------------------------------------------------------
// Helpers (same pattern as other catalog-outage/recovery specs)
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
  const res = await fetch(urlString);
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: res.status, headers, body };
}

/** Spawn a serve.mjs process pointed at `mockApiPort`, wait until ready. */
async function spawnServe(mockApiPort: number): Promise<{
  process: cp.ChildProcess;
  port: number;
}> {
  // Reserve a free port.
  const portResult = await startServer((_req, res) => res.end());
  const servePort = portResult.port;
  await closeServer(portResult.server);

  const proc = cp.spawn(process.execPath, [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(servePort),
      INTERNAL_API_BASE_URL: `http://127.0.0.1:${mockApiPort}`,
      BASE_PATH: "/",
    },
    stdio: "pipe",
  });
  proc.stdout?.resume();
  proc.stderr?.resume();

  await waitForPort("127.0.0.1", servePort);
  return { process: proc, port: servePort };
}

// ---------------------------------------------------------------------------
// Shared mock state — mutated between the two phases of the test
// ---------------------------------------------------------------------------

/**
 * "down" → mock returns HTTP 503 for every request (catalog outage)
 * "up"   → mock returns live category / occasion / product data
 *
 * "recovery-bouquets" is deliberately chosen as the live category id because
 * it does NOT appear in the static fallback produced by buildSitemapXml when
 * all catalog fetches return null.  Its presence in /sitemap-en.xml unambiguously
 * proves the live catalog path was taken.
 *
 * The category must have count > 0 to pass the generateSitemap count filter.
 */
type MockState = "down" | "up";

let mockState: MockState = "down";

const LIVE_CATEGORY_ID = "recovery-bouquets";

function mockHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (mockState === "down") {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("Service Unavailable (mock)");
    return;
  }

  // Live catalog responses — keyed by URL path prefix.
  const { url: reqUrl = "" } = req;

  if (reqUrl.includes("/api/catalog/metadata")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        categories: [{ id: LIVE_CATEGORY_ID, count: 8 }],
        occasions: [{ id: "valentines-day", count: 5 }],
      }),
    );
    return;
  }

  if (reqUrl.includes("/api/woo/products")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ products: [] }));
    return;
  }

  if (reqUrl.includes("/api/woo/brands")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ brands: [] }));
    return;
  }

  // Catch-all for any other endpoint the server may probe.
  res.writeHead(200, { "content-type": "application/json" });
  res.end("{}");
}

// ---------------------------------------------------------------------------
// Test harness state
// ---------------------------------------------------------------------------

let mockApiServer: http.Server;
let mockApiPort: number;

// Phase-1 process (catalog down).
let serveProc1: cp.ChildProcess;
let servePort1: number;

// Phase-2 process (catalog up).
let serveProc2: cp.ChildProcess;
let servePort2: number;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "/sitemap-en.xml — switch to live data after catalog recovery",
  () => {
    test.beforeAll(async () => {
      // 1. Start the mock catalog API (initially down).
      mockState = "down";
      const mockResult = await startServer(mockHandler);
      mockApiServer = mockResult.server;
      mockApiPort = mockResult.port;

      // 2. Spawn phase-1 serve.mjs with catalog down → cold-cache fallback.
      const spawn1 = await spawnServe(mockApiPort);
      serveProc1 = spawn1.process;
      servePort1 = spawn1.port;
    });

    test.afterAll(async () => {
      serveProc1?.kill("SIGTERM");
      serveProc2?.kill("SIGTERM");
      await closeServer(mockApiServer);
    });

    // -----------------------------------------------------------------------
    // Phase 1 — catalog is down: static fallback must be served
    // -----------------------------------------------------------------------

    test("phase 1 (catalog down): /sitemap-en.xml returns HTTP 200", async () => {
      mockState = "down";
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort1}/sitemap-en.xml`,
      );
      expect(status).toBe(200);
    });

    test("phase 1 (catalog down): /sitemap-en.xml returns Content-Type: application/xml", async () => {
      mockState = "down";
      const { headers } = await getUrl(
        `http://127.0.0.1:${servePort1}/sitemap-en.xml`,
      );
      expect(headers["content-type"]).toMatch(/application\/xml/);
    });

    test("phase 1 (catalog down): /sitemap-en.xml body is well-formed XML with static pages", async () => {
      mockState = "down";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort1}/sitemap-en.xml`,
      );
      expect(body).toMatch(/^<\?xml/);
      expect(body).toContain("<urlset");
      expect(body).toContain("</urlset>");
      // Static locale/city pages are always present.
      expect(body).toContain("/en-lb/beirut");
    });

    test("phase 1 (catalog down): /sitemap-en.xml does NOT contain live category slug", async () => {
      mockState = "down";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort1}/sitemap-en.xml`,
      );
      // LIVE_CATEGORY_ID must be absent when catalog returns 503.
      expect(body).not.toContain(LIVE_CATEGORY_ID);
    });

    // -----------------------------------------------------------------------
    // Between phases — flip mock to "up" and spawn a fresh serve.mjs process.
    //
    // A fresh process is required because /sitemap-en.xml has an in-process
    // stale-while-revalidate cache.  Reusing the phase-1 process would
    // require waiting for the retry window to expire before live data could
    // be fetched again.  A fresh process has a cold cache and will immediately
    // fetch from the now-recovered catalog on its first request.
    // -----------------------------------------------------------------------

    test("setup: spawn phase-2 process with catalog up", async () => {
      // Flip the mock to return live catalog data.
      mockState = "up";

      // Spawn a fresh serve.mjs — cold cache, catalog now up.
      const spawn2 = await spawnServe(mockApiPort);
      serveProc2 = spawn2.process;
      servePort2 = spawn2.port;

      // Confirm the new process is healthy before the phase-2 assertions.
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      expect(status).toBe(200);
    });

    // -----------------------------------------------------------------------
    // Phase 2 — catalog recovered: live data must appear in the response
    // -----------------------------------------------------------------------

    test("phase 2 (catalog up): /sitemap-en.xml returns HTTP 200", async () => {
      const { status } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      expect(status).toBe(200);
    });

    test("phase 2 (catalog up): /sitemap-en.xml returns Content-Type: application/xml", async () => {
      const { headers } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      expect(headers["content-type"]).toMatch(/application\/xml/);
    });

    test("phase 2 (catalog up): /sitemap-en.xml body is well-formed XML", async () => {
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      expect(body).toMatch(/^<\?xml/);
      expect(body).toContain("<urlset");
      expect(body).toContain("</urlset>");
    });

    test("phase 2 (catalog up): /sitemap-en.xml contains live category slug", async () => {
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      // The live catalog is up, so the category section must now include the
      // live category slug (as /category/recovery-bouquets or similar).
      expect(body).toContain(LIVE_CATEGORY_ID);
    });

    test("phase 2 (catalog up): /sitemap-en.xml still contains static locale pages", async () => {
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      // Static pages must survive catalog recovery unchanged.
      expect(body).toContain("/en-lb/beirut");
      expect(body).toContain("/en-ae/dubai");
      expect(body).toContain("/en-cy/nicosia");
    });

    test("phase 2 (catalog up): /sitemap-en.xml body is longer than a bare static fallback", async () => {
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort2}/sitemap-en.xml`,
      );
      // A live-catalog sitemap includes category/occasion/product entries,
      // making it substantially longer than the minimal static-only output.
      expect(body.trim().length).toBeGreaterThan(500);
    });
  },
);
