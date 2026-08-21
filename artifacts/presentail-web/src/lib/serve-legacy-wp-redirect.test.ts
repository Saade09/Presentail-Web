/**
 * Integration tests for the legacy WordPress / WooCommerce redirect and 410
 * Gone rules in serve.mjs (rows 1–24 of docs/seo/legacy-redirect-proposal.md).
 *
 * Coverage map (proposal row → test section):
 *
 *  Rows 17–24  — 410 Gone for WP infrastructure + date/author archives
 *    • /wp-admin/ and sub-paths                    (row 21)
 *    • /wp-login.php                               (row 22)
 *    • /wp-json/ and sub-paths                     (row 20)
 *    • /wp-content/ and sub-paths                  (row 23)
 *    • /wp-includes/ and sub-paths                 (row 24)
 *    • /author/:name/                              (row 19)
 *    • /YYYY/MM/ and /YYYY/MM/DD/ date archives    (rows 17–18)
 *
 *  Row 4       — /shop/page/:n/ → 301 /en-lb/beirut/shop
 *
 *  Rows 1–3    — /product-category/:slug → 301 /en-lb/beirut/category/:slug
 *               (with slug mapping and /page/:n/ stripping)
 *
 *  Rows 14–16  — /product-tag/:slug → 301 /en-lb/beirut/occasion/:slug
 *               (with occasion slug mapping and /page/:n/ stripping)
 *
 *  Rows 9–13   — Vanity archive pages → 301 canonical equivalents
 *               (/offer/, /all-flowers/, /best-sellers/, /new-arrivals/, /sale/)
 *
 * The test spawns serve.mjs as a real child process, exactly as the other
 * serve.mjs integration tests do.  Node.js's http.request does not follow
 * redirects, so the raw status + Location header is directly observable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

// ---------------------------------------------------------------------------
// Helpers — identical pattern to serve-shop-redirect.test.ts
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

describe("serve.mjs — duplicate locale prefix normalization", () => {
  it.each([
    ["/en/en-lb/beirut/shop", "/en-lb/beirut/shop"],
    ["/fr/fr-ae/dubai/category/hand-bouquets", "/fr-ae/dubai/category/hand-bouquets"],
    ["/en-lb/en-lb/beirut/cart", "/en-lb/beirut/cart"],
  ])("redirects %s to one canonical locale path", async (source, expectedLocation) => {
    const { status, location } = await get(serverPort, source);
    expect(status).toBe(301);
    expect(location).toBe(expectedLocation);
    expect(location).not.toMatch(/\/(?:en|ar|fr|el)(?:-[a-z]{2})?\/(?:en|ar|fr|el)-/);
  });
});

describe("serve.mjs — bare language utility routes", () => {
  it.each([
    ["/en", "/en-lb/beirut"],
    ["/fr", "/fr-lb/beirut"],
    ["/ar?source=footer", "/ar-lb/beirut?source=footer"],
    ["/el", "/el-cy/nicosia"],
  ])("redirects %s to a usable language hub", async (source, expectedLocation) => {
    const { status, location } = await get(serverPort, source);
    expect(status).toBe(301);
    expect(location).toBe(expectedLocation);
  });
});

// ---------------------------------------------------------------------------
// Rows 21–24, 19–20: WP infrastructure paths → 410 Gone
// ---------------------------------------------------------------------------

describe("serve.mjs — legacy WP infrastructure paths return 410 Gone", () => {
  it("returns 410 for /wp-admin/ (bare)", async () => {
    const { status, location, body } = await get(serverPort, "/wp-admin/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
    expect(body).toBe("Gone");
  });

  it("returns 410 for /wp-admin sub-path (e.g. /wp-admin/edit.php)", async () => {
    const { status, location } = await get(serverPort, "/wp-admin/edit.php");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-login.php (exact match)", async () => {
    const { status, location } = await get(serverPort, "/wp-login.php");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-json/ (bare)", async () => {
    const { status, location } = await get(serverPort, "/wp-json/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-json sub-path (e.g. /wp-json/wc/v3/products)", async () => {
    const { status, location } = await get(
      serverPort,
      "/wp-json/wc/v3/products",
    );
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-content/ (bare)", async () => {
    const { status, location } = await get(serverPort, "/wp-content/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-content sub-path (e.g. /wp-content/uploads/2022/photo.jpg)", async () => {
    const { status, location } = await get(
      serverPort,
      "/wp-content/uploads/2022/photo.jpg",
    );
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-includes/ (bare)", async () => {
    const { status, location } = await get(serverPort, "/wp-includes/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /wp-includes sub-path (e.g. /wp-includes/js/jquery.js)", async () => {
    const { status, location } = await get(
      serverPort,
      "/wp-includes/js/jquery.js",
    );
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Row 19: Author archives → 410 Gone
// ---------------------------------------------------------------------------

describe("serve.mjs — WP author archives return 410 Gone", () => {
  it("returns 410 for /author/admin/", async () => {
    const { status, location } = await get(serverPort, "/author/admin/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for /author/editor (without trailing slash)", async () => {
    const { status, location } = await get(serverPort, "/author/editor");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for any author slug", async () => {
    const { status, location } = await get(serverPort, "/author/john-doe/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rows 17–18: WP date archives → 410 Gone
// ---------------------------------------------------------------------------

describe("serve.mjs — WP date archives return 410 Gone", () => {
  it("returns 410 for a monthly archive /2022/06/", async () => {
    const { status, location } = await get(serverPort, "/2022/06/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for a daily archive /2022/06/15/", async () => {
    const { status, location } = await get(serverPort, "/2022/06/15/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for a year-only archive /2023/", async () => {
    const { status, location } = await get(serverPort, "/2023/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });

  it("returns 410 for a recent year archive /2025/12/", async () => {
    const { status, location } = await get(serverPort, "/2025/12/");
    expect(status).toBe(410);
    expect(location).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Row 4: /shop/page/:n/ → 301 /en-lb/beirut/shop
// ---------------------------------------------------------------------------

describe("serve.mjs — WC shop pagination redirects to /en-lb/beirut/shop", () => {
  it("redirects /shop/page/2/ with 301", async () => {
    const { status, location } = await get(serverPort, "/shop/page/2/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /shop/page/3 (no trailing slash) with 301", async () => {
    const { status, location } = await get(serverPort, "/shop/page/3");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /shop/page/10/ with 301", async () => {
    const { status, location } = await get(serverPort, "/shop/page/10/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });
});

// ---------------------------------------------------------------------------
// Rows 1–3: /product-category/:slug → 301 /en-lb/beirut/category/:slug
// ---------------------------------------------------------------------------

describe("serve.mjs — WC product-category redirects to Presentail category pages", () => {
  it("maps known slug 'flowers' → hand-bouquets with 301", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/flowers",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("maps known slug 'flower-bouquets' → hand-bouquets", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/flower-bouquets/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("maps known slug 'chocolates' → chocolate (normalises plural)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/chocolates",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/chocolate");
  });

  it("maps known slug 'cakes' → cakes (direct match)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/cakes",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/cakes");
  });

  it("falls back to /en-lb/beirut/shop for an unknown slug", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/misc-gifts",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("strips pagination (/page/:n/) and redirects to the category page (row 3)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/flowers/page/2/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("strips pagination for an unknown slug and falls back to shop", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-category/misc-gifts/page/3/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });
});

// ---------------------------------------------------------------------------
// Rows 14–16: /product-tag/:slug → 301 /en-lb/beirut/occasion/:slug
// ---------------------------------------------------------------------------

describe("serve.mjs — WC product-tag redirects to Presentail occasion pages", () => {
  it("maps known occasion tag 'birthday' → birthday with 301", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/birthday/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/birthday");
  });

  it("maps known occasion tag 'anniversary' → anniversary", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/anniversary",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/anniversary");
  });

  it("maps 'valentine' tag slug (WP slug) → valentines-day occasion", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/valentine",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/valentines-day");
  });

  it("maps 'wedding' → wedding (direct match)", async () => {
    const { status, location } = await get(serverPort, "/product-tag/wedding");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/wedding");
  });

  it("maps 'get-well-soon' → get-well-soon (direct match)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/get-well-soon",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/get-well-soon");
  });

  it("maps 'condolences' → condolences (direct match)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/condolences",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/condolences");
  });

  it("falls back to /en-lb/beirut/occasions for an unknown tag (row 15)", async () => {
    const { status, location } = await get(serverPort, "/product-tag/roses");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasions");
  });

  it("strips pagination (/page/:n/) and applies the same occasion mapping (row 16)", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/birthday/page/2/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasion/birthday");
  });

  it("strips pagination for an unknown tag and falls back to /occasions", async () => {
    const { status, location } = await get(
      serverPort,
      "/product-tag/roses/page/3/",
    );
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/occasions");
  });
});

// ---------------------------------------------------------------------------
// Rows 9–13: Vanity archive pages → canonical equivalents (301)
// ---------------------------------------------------------------------------

describe("serve.mjs — WC vanity archive pages redirect to canonical equivalents", () => {
  it("redirects /offer/ → /en-lb/beirut/shop with 301 (row 9)", async () => {
    const { status, location } = await get(serverPort, "/offer/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /offer (without trailing slash) → /en-lb/beirut/shop", async () => {
    const { status, location } = await get(serverPort, "/offer");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /all-flowers/ → /en-lb/beirut/category/hand-bouquets (row 10)", async () => {
    const { status, location } = await get(serverPort, "/all-flowers/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });

  it("redirects /best-sellers/ → /en-lb/beirut/shop (row 11)", async () => {
    const { status, location } = await get(serverPort, "/best-sellers/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /new-arrivals/ → /en-lb/beirut/shop (row 12)", async () => {
    const { status, location } = await get(serverPort, "/new-arrivals/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /sale/ → /en-lb/beirut/shop (row 13)", async () => {
    const { status, location } = await get(serverPort, "/sale/");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });

  it("redirects /sale (without trailing slash) → /en-lb/beirut/shop", async () => {
    const { status, location } = await get(serverPort, "/sale");
    expect(status).toBe(301);
    expect(location).toBe("/en-lb/beirut/shop");
  });
});
