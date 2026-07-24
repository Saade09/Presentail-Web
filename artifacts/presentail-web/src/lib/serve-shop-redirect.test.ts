/**
 * Integration tests for the redirect and OG-injection rules in serve.mjs:
 *
 *  A. Shop query-param → clean-path redirects
 *     1. ?category=<slug>  → 301 /:lang-:country/:city/category/<slug>
 *     2. ?occasion=<slug>  → 301 /:lang-:country/:city/occasion/<slug>
 *     3. /shop with no recognised query param → falls through to SPA (no redirect)
 *     4. Slugs with special characters are percent-encoded in the Location header
 *
 *  B. Bare /brand/<slug> mobile share-link → OG-injected HTML + meta-refresh
 *     WhatsApp / iMessage crawlers may not follow 301 redirects, so the server
 *     now serves a 200 with brand OG meta tags injected directly at this path.
 *     A <meta http-equiv="refresh"> + JS redirect send real browsers to the
 *     locale-prefixed canonical URL immediately.  The 301 fallback fires only
 *     when injectSeoTagsAsync is unavailable.
 *     1. /brand/<slug>              → 200, body contains meta-refresh to canonical
 *     2. /brand/<slug>/ (trailing slash) → 200, same
 *     3. /brand/ (no slug)          → 200 SPA shell (no redirect)
 *     4. Already-locale-prefixed URL → 200 SPA shell (no redirect)
 *     5. Percent-encoded slug chars are preserved in the meta-refresh URL
 *
 *  C. Bare /product/<slug> mobile share-link → OG-injected HTML + meta-refresh
 *     WhatsApp / iMessage crawlers may not follow 301 redirects, so the server
 *     now serves a 200 with product OG meta tags injected directly at this path.
 *     A <meta http-equiv="refresh"> + JS redirect send real browsers to the
 *     locale-prefixed canonical URL immediately.  The 301 fallback fires only
 *     when injectSeoTagsAsync is unavailable.
 *     1. /product/<slug>              → 200, body contains meta-refresh to canonical
 *     2. /product/<slug>/ (trailing slash) → 200, same
 *     3. Already-locale-prefixed URL  → falls through to SPA (no redirect)
 *     4. Percent-encoded slug chars are preserved in the meta-refresh URL
 *
 *  D. Bare /occasion/<slug> share-link → OG-injected HTML + meta-refresh
 *     Same pattern as B/C: 200 with OG meta tags, meta-refresh + JS redirect
 *     to the locale-prefixed canonical URL, x-robots-tag: noindex.
 *
 *  E. Bare /category/<slug> share-link → OG-injected HTML + meta-refresh
 *     Same pattern as B/C/D.
 *
 * The test spawns serve.mjs as a real child process using the same dist folder
 * that the other serve.mjs integration tests rely on.  Node.js's `http.request`
 * does not follow redirects, so the raw status + Location header is directly
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
 * Returns the status code, the `location` response header (if any), the
 * response body, and the full response headers map.
 */
function get(
  port: number,
  urlPath: string,
): Promise<{
  status: number;
  location: string | undefined;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
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
            headers: res.headers as Record<string, string | string[] | undefined>,
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

describe("serve.mjs — bare /brand/<slug> mobile share-link OG+redirect", () => {
  // WhatsApp, iMessage, and other social-preview crawlers may not follow 301
  // redirects, so /brand/<slug> now serves OG-injected HTML directly (200)
  // instead of a plain 301.  Real browsers are redirected immediately via a
  // <meta http-equiv="refresh"> + JS redirect to the canonical locale-prefixed
  // URL.  The fallback 301 only fires when injectSeoTagsAsync is unavailable.

  it("returns 200 with OG-injected HTML for /brand/<slug>", async () => {
    const { status, location, body } = await get(serverPort, "/brand/roses-de-chloe");
    expect(status).toBe(200);
    // No HTTP Location redirect header — real browsers use the meta-refresh.
    expect(location).toBeUndefined();
    // Body must contain the meta-refresh pointing to the canonical URL.
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/brand/roses-de-chloe");
  });

  it("returns 200 with OG-injected HTML for /brand/<slug>/ (trailing slash)", async () => {
    const { status, location, body } = await get(serverPort, "/brand/roses-de-chloe/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/brand/roses-de-chloe");
  });

  it("does NOT intercept /brand/ with no slug (falls through to SPA)", async () => {
    const { status, location } = await get(serverPort, "/brand/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("does NOT intercept an already locale-prefixed brand URL (falls through to SPA)", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/brand/roses-de-chloe",
    );
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("preserves percent-encoded characters in the brand slug", async () => {
    const { status, body } = await get(
      serverPort,
      "/brand/roses%20de%20chl%C3%B6e",
    );
    expect(status).toBe(200);
    // The meta-refresh must point to the canonical URL with the slug preserved.
    expect(body).toContain("/en-lb/beirut/brand/roses%20de%20chl%C3%B6e");
  });
});

describe("serve.mjs — bare /product/<slug> mobile share-link OG+redirect", () => {
  // WhatsApp, iMessage, and other social-preview crawlers may not follow 301
  // redirects, so /product/<slug> now serves OG-injected HTML directly (200)
  // instead of a plain 301.  Real browsers are redirected immediately via a
  // <meta http-equiv="refresh"> + JS redirect to the canonical locale-prefixed
  // URL.  The fallback 301 only fires when injectSeoTagsAsync is unavailable.

  it("returns 200 with OG-injected HTML for /product/<slug>", async () => {
    const { status, location, body, headers } = await get(serverPort, "/product/red-roses");
    expect(status).toBe(200);
    // No HTTP Location redirect header — real browsers use the meta-refresh.
    expect(location).toBeUndefined();
    // Body must contain the meta-refresh pointing to the canonical URL.
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/product/red-roses");
    // x-robots-tag: noindex keeps the redirect intermediary out of search results.
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("returns 200 with OG-injected HTML for /product/<slug>/ (trailing slash)", async () => {
    const { status, location, body, headers } = await get(serverPort, "/product/red-roses/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/product/red-roses");
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("does NOT intercept /product/ with no slug (falls through to SPA)", async () => {
    // The regex requires [^/]+ so a bare /product/ with no slug won't match.
    const { status, location } = await get(serverPort, "/product/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("does NOT intercept an already locale-prefixed product URL (falls through to SPA)", async () => {
    // /en-lb/beirut/product/<slug> does not start with /product/ so the rule
    // must not fire and the SPA shell should be served instead.
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/product/red-roses",
    );
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("preserves percent-encoded characters in the product slug", async () => {
    const { status, body } = await get(
      serverPort,
      "/product/red%20roses",
    );
    expect(status).toBe(200);
    // The meta-refresh must point to the canonical URL with the slug preserved.
    expect(body).toContain("/en-lb/beirut/product/red%20roses");
  });

  it("preserves other percent-encoded characters (apostrophe)", async () => {
    const { status, body } = await get(
      serverPort,
      "/product/mother%27s-day-bouquet",
    );
    expect(status).toBe(200);
    expect(body).toContain("/en-lb/beirut/product/mother%27s-day-bouquet");
  });
});

describe("serve.mjs — bare /occasion/<slug> share-link OG+redirect", () => {
  it("returns 200 with OG-injected HTML for /occasion/<slug>", async () => {
    const { status, location, body, headers } = await get(serverPort, "/occasion/birthday");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/occasion/birthday");
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("returns 200 with OG-injected HTML for /occasion/<slug>/ (trailing slash)", async () => {
    const { status, location, body, headers } = await get(serverPort, "/occasion/birthday/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/occasion/birthday");
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("does NOT intercept an already locale-prefixed occasion URL (falls through to SPA)", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/occasion/birthday",
    );
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("preserves percent-encoded characters in the occasion slug", async () => {
    const { status, body } = await get(
      serverPort,
      "/occasion/mother%27s-day",
    );
    expect(status).toBe(200);
    expect(body).toContain("/en-lb/beirut/occasion/mother%27s-day");
  });
});

describe("serve.mjs — bare /category/<slug> share-link OG+redirect", () => {
  it("returns 200 with OG-injected HTML for /category/<slug>", async () => {
    const { status, location, body, headers } = await get(serverPort, "/category/hand-bouquets");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/category/hand-bouquets");
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("returns 200 with OG-injected HTML for /category/<slug>/ (trailing slash)", async () => {
    const { status, location, body, headers } = await get(serverPort, "/category/hand-bouquets/");
    expect(status).toBe(200);
    expect(location).toBeUndefined();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/en-lb/beirut/category/hand-bouquets");
    expect(headers["x-robots-tag"]).toBe("noindex");
  });

  it("does NOT intercept an already locale-prefixed category URL (falls through to SPA)", async () => {
    const { status, location } = await get(
      serverPort,
      "/en-lb/beirut/category/hand-bouquets",
    );
    expect(status).toBe(200);
    expect(location).toBeUndefined();
  });

  it("preserves percent-encoded characters in the category slug", async () => {
    const { status, body } = await get(
      serverPort,
      "/category/red%20roses",
    );
    expect(status).toBe(200);
    expect(body).toContain("/en-lb/beirut/category/red%20roses");
  });
});
