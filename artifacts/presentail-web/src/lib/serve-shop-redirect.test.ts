/**
 * Integration tests for the shop query-param → clean-path 301 redirect logic
 * in serve.mjs.
 *
 * Covered cases:
 *  1. ?category=<slug>  → 301 /:lang-:country/:city/category/<slug>
 *  2. ?occasion=<slug>  → 301 /:lang-:country/:city/occasion/<slug>
 *  3. /shop with no recognised query param → falls through to SPA (no redirect)
 *  4. Slugs with special characters are percent-encoded in the Location header
 *
 * The test spawns serve.mjs as a real child process using the same dist folder
 * that the other serve.mjs integration tests rely on.  Node.js's `http.request`
 * does not follow redirects, so the raw 301 + Location header is directly
 * observable in every response.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

// ---------------------------------------------------------------------------
// Helpers — identical pattern to serve-sidecar.test.ts
// ---------------------------------------------------------------------------

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForReady(port: number, maxMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/favicon-16x16.png" },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `serve.mjs on :${port} did not become ready within ${maxMs}ms`,
            ),
          );
        } else {
          setTimeout(attempt, 150);
        }
      });
      req.end();
    }
    setTimeout(attempt, 150);
  });
}

/**
 * Make a single HTTP GET without following redirects.
 * Returns the status code, the `location` response header (if any), and the
 * response body.
 */
function get(
  port: number,
  urlPath: string,
): Promise<{ status: number; location: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers["location"] as string | undefined,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

let serverPort: number;
let serverProc: ChildProcess;

beforeAll(async () => {
  serverPort = await getFreePort();
  serverProc = spawn("node", [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      BASE_PATH: "",
      INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
      ALERTS_SLACK_WEBHOOK_URL: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(serverPort);
}, 20_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("serve.mjs — shop query-param redirects", () => {
  it("redirects ?category= to /category/<slug> with 301", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?category=roses",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/roses");
  });

  it("redirects ?occasion= to /occasion/<slug> with 301", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?occasion=valentines",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/valentines");
  });

  it("redirects for other locale/country/city combinations", async () => {
    const { status, location } = await get(
      serverPort,
      "/ar-ae/dubai/shop?category=luxury-gifts",
    );
    expect(status).toBe(301);
    expect(location).toBe("/ar-ae/dubai/category/luxury-gifts");
  });

  it("percent-encodes special characters in category slug", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?category=red%20roses",
    );
    expect(status).toBe(301);
    // encodeURIComponent("red roses") === "red%20roses"
    expect(location).toBe("/en-lb/beirut/category/red%20roses");
  });

  it("percent-encodes special characters in occasion slug", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?occasion=mother%27s%20day",
    );
    expect(status).toBe(301);
    // searchParams decodes %27 → ' and %20 → space; encodeURIComponent then
    // re-encodes space → %20 but leaves apostrophe bare (it is unreserved in
    // encodeURIComponent's character set).
    expect(location).toBe("/en-lb/beirut/occasion/mother's%20day");
  });

  it("does NOT redirect /shop with no recognised query param (falls through to SPA)", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop",
    );
    // The SPA shell (index.html) is served — not a redirect.
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("does NOT redirect /shop with an unrecognised query param", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?sort=price",
    );
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("does NOT redirect a non-shop path that happens to have ?category=", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/brands?category=roses",
    );
    // /brands is not /shop — redirect rule must not fire.
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("redirects /shop/ (trailing slash) the same way", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop/?category=tulips",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/tulips");
  });

  it("prefers ?category= over ?occasion= when both are present", async () => {
    // The handler checks categorySlug first; if both params appear the
    // category redirect fires and the occasion param is ignored.
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/shop?category=orchids&occasion=birthday",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/orchids");
  });
});
