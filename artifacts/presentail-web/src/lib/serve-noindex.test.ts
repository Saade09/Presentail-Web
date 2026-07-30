/**
 * Integration tests for the X-Robots-Tag / meta robots noindex logic in
 * serve.mjs and seo-inject.mjs:
 *
 *   1. Private pages (checkout, cart, account, auth, order-confirmed) must
 *      carry `X-Robots-Tag: noindex` in the HTTP response headers.
 *   2. Public pages (shop, brands, home) must carry
 *      `X-Robots-Tag: index, follow` in the HTTP response headers.
 *   3. Private pages must have `<meta name="robots" content="noindex"` in
 *      the HTML body (injected by seo-inject.mjs).
 *   4. When the Host header is a `.replit.app` preview domain, public pages
 *      must NOT emit `X-Robots-Tag: index, follow` (Replit's own noindex
 *      header must be allowed to stand unchallenged).
 *
 * The test spawns a real serve.mjs child process using the same dist folder
 * the other serve.mjs integration tests rely on.  Both the response headers
 * and the HTML body are asserted directly so a future refactor cannot
 * silently introduce a regression at either layer.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

// ---------------------------------------------------------------------------
// Shared helpers (same pattern as serve-www-redirect.test.ts)
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

function waitForReady(port: number, maxMs = 15_000): Promise<void> {
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
          setTimeout(attempt, 200);
        }
      });
      req.end();
    }
    setTimeout(attempt, 200);
  });
}

interface GetResult {
  status: number;
  robotsHeader: string | undefined;
  body: string;
}

function get(
  port: number,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<GetResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            robotsHeader: res.headers["x-robots-tag"] as string | undefined,
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
// Primary server — production host (no .replit.app)
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
}, 25_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

// ---------------------------------------------------------------------------
// X-Robots-Tag: noindex on private pages
// ---------------------------------------------------------------------------

describe("serve.mjs — X-Robots-Tag: noindex on private pages", () => {
  const PRIVATE_PATHS = [
    "/en-lb/beirut/checkout",
    "/en-lb/beirut/cart",
    "/en-lb/beirut/account",
    "/en-lb/beirut/auth",
    "/en-lb/beirut/order-confirmed",
  ] as const;

  for (const urlPath of PRIVATE_PATHS) {
    it(`emits X-Robots-Tag: noindex for ${urlPath}`, async () => {
      const { status, robotsHeader } = await get(serverPort, urlPath, {
        host: "presentail.com",
      });
      expect(status).toBe(200);
      expect(robotsHeader).toBe("noindex");
    });
  }
});

// ---------------------------------------------------------------------------
// X-Robots-Tag: index, follow on public pages
// ---------------------------------------------------------------------------

describe("serve.mjs — X-Robots-Tag: index, follow on public pages", () => {
  const PUBLIC_PATHS = [
    "/en-lb/beirut/shop",
    "/en-lb/beirut/brands",
    "/en-lb/beirut",
  ] as const;

  for (const urlPath of PUBLIC_PATHS) {
    it(`emits X-Robots-Tag: index, follow for ${urlPath}`, async () => {
      const { status, robotsHeader } = await get(serverPort, urlPath, {
        host: "presentail.com",
      });
      expect(status).toBe(200);
      expect(robotsHeader).toBe("index, follow");
    });
  }
});

// ---------------------------------------------------------------------------
// <meta name="robots" content="noindex"> in HTML body for private pages
// ---------------------------------------------------------------------------

describe("serve.mjs — meta robots noindex in HTML body for private pages", () => {
  const PRIVATE_PATHS = [
    "/en-lb/beirut/checkout",
    "/en-lb/beirut/cart",
    "/en-lb/beirut/account",
    "/en-lb/beirut/auth",
    "/en-lb/beirut/order-confirmed",
  ] as const;

  for (const urlPath of PRIVATE_PATHS) {
    it(`HTML body contains meta noindex for ${urlPath}`, async () => {
      const { status, body } = await get(serverPort, urlPath, {
        host: "presentail.com",
      });
      expect(status).toBe(200);
      expect(body).toMatch(/<meta name="robots" content="noindex/i);
    });
  }
});

// ---------------------------------------------------------------------------
// Blog post pages must remain indexable — only the listing is noindex
// ---------------------------------------------------------------------------

describe("serve.mjs — blog post pages are indexable (not noindex)", () => {
  it("emits X-Robots-Tag: index, follow for a blog post URL", async () => {
    const { status, robotsHeader } = await get(
      serverPort,
      "/en-lb/beirut/blog/valentines-day-gift-guide",
      { host: "presentail.com" },
    );
    expect(status).toBe(200);
    expect(robotsHeader).toBe("index, follow");
  });

  it("emits X-Robots-Tag: index, follow for the blog listing page (Journal hub)", async () => {
    const { status, robotsHeader } = await get(serverPort, "/en-lb/beirut/blog", {
      host: "presentail.com",
    });
    expect(status).toBe(200);
    expect(robotsHeader).toBe("index, follow");
  });
});

// ---------------------------------------------------------------------------
// .replit.app preview domain — must NOT emit X-Robots-Tag: index, follow
// ---------------------------------------------------------------------------

describe("serve.mjs — no X-Robots-Tag: index, follow on .replit.app host", () => {
  const PUBLIC_PATHS = [
    "/en-lb/beirut/shop",
    "/en-lb/beirut/brands",
    "/en-lb/beirut",
  ] as const;

  for (const urlPath of PUBLIC_PATHS) {
    it(`does NOT emit x-robots-tag: index, follow on .replit.app for ${urlPath}`, async () => {
      const { status, robotsHeader } = await get(serverPort, urlPath, {
        host: "abc123.replit.app",
      });
      expect(status).toBe(200);
      expect(robotsHeader).not.toBe("index, follow");
    });
  }

  it("still emits noindex for private pages on .replit.app host", async () => {
    const { status, robotsHeader } = await get(
      serverPort,
      "/en-lb/beirut/checkout",
      { host: "abc123.replit.app" },
    );
    expect(status).toBe(200);
    expect(robotsHeader).toBe("noindex");
  });
});
