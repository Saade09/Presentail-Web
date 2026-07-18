/**
 * /sitemap.md recovery test — catalog comes back up after an outage
 *
 * Verifies that once the catalog API recovers (starts returning a valid
 * category list), GET /sitemap.md switches from the static STATIC_CATEGORIES
 * fallback to the live catalog data — specifically that a category name which
 * is present in the live feed but absent from STATIC_CATEGORIES appears in the
 * response after the catalog becomes reachable.
 *
 * Complements sitemap-md-catalog-outage.spec.ts, which only exercises the
 * cold-cache 503 path.
 *
 * How it works
 * ────────────
 * 1. Mock catalog API — a Node `http.Server` whose behaviour is controlled
 *    by a mutable `mockState` closure variable.  Initially it returns HTTP 503;
 *    after the first set of assertions the state is flipped to return a live
 *    category list that includes "Rainbow Orchids" — a name that is NOT in
 *    STATIC_CATEGORIES.
 *
 * 2. Test serve.mjs instance — serve.mjs is spawned as a child process with
 *    INTERNAL_API_BASE_URL pointed at the mock catalog.  The /sitemap.md route
 *    fetches fresh catalog metadata on every request (no in-process caching for
 *    that route), so a second fetch after the mock switches immediately returns
 *    live data without needing a cache-expiry delay or a new process.
 *
 * Why this is in e2e-serve rather than a unit test
 * ─────────────────────────────────────────────────
 * The existing unit tests mock the generator functions directly and test the
 * route-resolver logic in isolation.  This spec tests the *live HTTP response*
 * from the production server — verifying that the import chain, fetch logic,
 * and response composition are all wired correctly in serve.mjs.
 *
 * Note: this spec does NOT use the shared PLAYWRIGHT_BASE_URL.  It manages its
 * own server lifecycle via beforeAll/afterAll.
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
// Helpers (same pattern as sitemap-md-catalog-outage.spec.ts)
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

// ---------------------------------------------------------------------------
// Shared mock state — mutated between the two phases of the test
// ---------------------------------------------------------------------------

/**
 * "down" → mock returns HTTP 503 (catalog outage)
 * "up"   → mock returns a live-looking category list containing "Rainbow Orchids"
 *
 * "Rainbow Orchids" is deliberately chosen because it does NOT appear in
 * STATIC_CATEGORIES inside serve.mjs, so its presence in the /sitemap.md body
 * unambiguously proves the live catalog path was taken.
 */
type MockState = "down" | "up";

let mockState: MockState = "down";

const LIVE_CATEGORY_NAME = "Rainbow Orchids";
const LIVE_CATEGORY_ID = "rainbow-orchids";

const LIVE_CATALOG_RESPONSE = JSON.stringify({
  categories: [
    { id: LIVE_CATEGORY_ID, name: LIVE_CATEGORY_NAME },
    { id: "hand-bouquets", name: "Flower Bouquets" },
    { id: "chocolates", name: "Chocolates" },
  ],
});

// ---------------------------------------------------------------------------
// Test harness state
// ---------------------------------------------------------------------------

let mockApiServer: http.Server;
let mockApiPort: number;
let serveProcess: cp.ChildProcess;
let servePort: number;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "/sitemap.md — switches to live catalog data after outage recovery",
  () => {
    test.beforeAll(async () => {
      // 1. Mock catalog API — behaviour controlled by `mockState`.
      const mockResult = await startServer((_req, res) => {
        if (mockState === "down") {
          res.writeHead(503, { "content-type": "text/plain" });
          res.end("Service Unavailable (mock)");
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(LIVE_CATALOG_RESPONSE);
        }
      });
      mockApiServer = mockResult.server;
      mockApiPort = mockResult.port;

      // 2. Grab a free port for serve.mjs.
      const portResult = await startServer((_req, res) => res.end());
      servePort = portResult.port;
      await closeServer(portResult.server);

      // 3. Spawn serve.mjs pointed at the mock catalog.
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
      await closeServer(mockApiServer);
    });

    // -----------------------------------------------------------------------
    // Phase 1 — catalog is down: static fallback must be served
    // -----------------------------------------------------------------------

    test("phase 1 (catalog down): returns HTTP 200 with static fallback", async () => {
      mockState = "down";
      const { status, body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      expect(status).toBe(200);
      expect(body).toContain("Flower Bouquets");
      expect(body).toContain("Chocolates");
      expect(body).toContain("# Presentail");
    });

    test("phase 1 (catalog down): live-only category is NOT present", async () => {
      mockState = "down";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      // "Rainbow Orchids" is absent from STATIC_CATEGORIES — it must not appear
      // while the catalog is unreachable.
      expect(body).not.toContain(LIVE_CATEGORY_NAME);
    });

    // -----------------------------------------------------------------------
    // Phase 2 — catalog recovers: live data must be used on the next request
    // -----------------------------------------------------------------------

    test("phase 2 (catalog up): live-only category name appears in the response", async () => {
      // Flip the mock to return live catalog data.
      mockState = "up";

      // The /sitemap.md route fetches fresh on every request — no in-process
      // cache — so this next fetch immediately uses the recovered catalog.
      const { status, body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      expect(status).toBe(200);
      expect(body).toContain(LIVE_CATEGORY_NAME);
    });

    test("phase 2 (catalog up): live category link is present with correct slug", async () => {
      mockState = "up";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      // The category line is rendered as:
      //   - [Rainbow Orchids](https://presentail.com/en-lb/beirut/category/rainbow-orchids)
      expect(body).toContain(`/category/${LIVE_CATEGORY_ID}`);
    });

    test("phase 2 (catalog up): static-fallback categories still appear (they are in live feed too)", async () => {
      mockState = "up";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      // LIVE_CATALOG_RESPONSE includes "Flower Bouquets" and "Chocolates"
      // alongside "Rainbow Orchids", so all three must appear.
      expect(body).toContain("Flower Bouquets");
      expect(body).toContain("Chocolates");
    });

    test("phase 2 (catalog up): homepage links are still present", async () => {
      mockState = "up";
      const { body } = await getUrl(
        `http://127.0.0.1:${servePort}/sitemap.md`,
      );
      expect(body).toContain("/en-lb/beirut");
      expect(body).toContain("/en-ae/dubai");
      expect(body).toContain("/en-cy/nicosia");
    });
  },
);
