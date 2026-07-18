/**
 * /sitemap.xml resilience test — catalog API outage
 *
 * Verifies that when every catalog API endpoint responds with HTTP 503 (or is
 * otherwise unreachable), GET /sitemap.xml still returns:
 *   • HTTP 200
 *   • Content-Type: application/xml
 *   • A non-empty body containing at least the <urlset opening tag
 *   • The static locale / city pages (e.g. /en-lb/beirut) that are built from
 *     the hardcoded SITEMAP_CITIES constant — without any catalog data.
 *
 * How it works
 * ────────────
 * The test harness spins up two lightweight servers entirely within the spec
 * file so no external services are required:
 *
 *   1. Mock catalog API — a Node `http.Server` bound to a random OS port that
 *      returns HTTP 503 for every request, simulating a full catalog outage.
 *
 *   2. Test serve.mjs instance — serve.mjs is spawned as a child process with
 *      INTERNAL_API_BASE_URL pointed at the mock catalog and a fresh (empty)
 *      sitemap cache (new process). The process binds to a separate random
 *      port. Because the sitemap route runs before any dist/ file-serving,
 *      serve.mjs does not need a dist/public directory to answer /sitemap.xml.
 *
 * Why this is in e2e-serve rather than a unit test
 * ─────────────────────────────────────────────────
 * The existing unit tests in src/lib/sitemap.test.ts mock the generator
 * functions directly and test the route-resolver logic in isolation.  This
 * spec tests the *live HTTP response* from the production server — verifying
 * that the import chain, compression middleware, and response headers are all
 * wired correctly in serve.mjs. A bad import or a missing export would break
 * this test while leaving the unit tests green.
 *
 * Note: this spec does NOT use the shared PLAYWRIGHT_BASE_URL (which points at
 * the pre-built serve.mjs used by the other e2e-serve specs).  It manages its
 * own server lifecycle via beforeAll/afterAll and uses Node's built-in fetch()
 * with the local port so the test is fully self-contained and idempotent.
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
// Helpers
// ---------------------------------------------------------------------------

/** Start an HTTP server and return it along with the bound port. */
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

/** Close an HTTP server, resolving once fully closed. */
function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Poll until serve.mjs is accepting TCP connections on the given port.
 *
 * Deliberately avoids sending any HTTP request so the /sitemap.xml cache is
 * still cold when the tests run their first fetch — the cold-cache response is
 * precisely what we need to validate.
 */
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
            new Error(
              `serve.mjs did not become ready within ${timeoutMs}ms`,
            ),
          );
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

/** Make a GET request using Node's built-in fetch and return status + headers + body. */
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
// Test harness state (shared across the describe block via closures)
// ---------------------------------------------------------------------------

let mockApiServer: http.Server;
let mockApiPort: number;
let serveProcess: cp.ChildProcess;
let servePort: number;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("/sitemap.xml — static fallback when catalog API is down", () => {
  test.beforeAll(async () => {
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

    // 3. Spawn serve.mjs. It does not need a dist/ directory to serve the
    //    /sitemap.xml route — that handler runs before the static-file branch.
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

  // -------------------------------------------------------------------------
  // Shared response (fetch once for assertions that only inspect body shape)
  // -------------------------------------------------------------------------

  test("returns HTTP 200", async () => {
    const { status } = await getUrl(
      `http://127.0.0.1:${servePort}/sitemap.xml`,
    );
    expect(status).toBe(200);
  });

  test("returns Content-Type: application/xml", async () => {
    const { headers } = await getUrl(
      `http://127.0.0.1:${servePort}/sitemap.xml`,
    );
    expect(headers["content-type"]).toMatch(/application\/xml/);
  });

  test("returns a non-empty body containing <urlset", async () => {
    const { body } = await getUrl(
      `http://127.0.0.1:${servePort}/sitemap.xml`,
    );
    expect(body.trim().length).toBeGreaterThan(0);
    expect(body).toContain("<urlset");
  });

  test("contains static locale city pages even without catalog data", async () => {
    const { body } = await getUrl(
      `http://127.0.0.1:${servePort}/sitemap.xml`,
    );
    // Static locale pages are generated from the hardcoded SITEMAP_CITIES
    // constant and must appear regardless of catalog API availability.
    expect(body).toContain("/en-lb/beirut");
    expect(body).toContain("/en-ae/dubai");
    expect(body).toContain("/en-cy/nicosia");
  });

  test("body is well-formed XML (opens with XML declaration, closes with </urlset>)", async () => {
    const { body } = await getUrl(
      `http://127.0.0.1:${servePort}/sitemap.xml`,
    );
    expect(body).toMatch(/^<\?xml/);
    expect(body).toContain("</urlset>");
    // Sanity-check the body is not just a stub.
    expect(body.trim().length).toBeGreaterThan(100);
  });
});
