/**
 * Integration tests for legacy WordPress blog redirects in serve.mjs.
 *
 * Old country-prefixed blog URLs (/lebanon/blog/, /lebanon/blogs/,
 * /lebanon/blog/category/:cat/, /lebanon/blog/:slug/) used to fall through to
 * the bare-country fallback and 301 to the city home, which Google treats as
 * a soft 404. They now 301 to /en/blog, or to /en/blog/:slug when the slug is
 * a published English post in @workspace/blog-content.
 *
 * Also pins the neighbouring non-blog legacy redirects and 410 Gone responses
 * so the change cannot alter them.
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
import { BLOG_POSTS, getBlogPostLanguages } from "@workspace/blog-content";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

const REAL_SLUG = Object.keys(BLOG_POSTS).find((slug) =>
  getBlogPostLanguages(BLOG_POSTS[slug]).includes("en"),
) as string;

// ---------------------------------------------------------------------------
// Helpers — identical pattern to serve-legacy-wp-redirect.test.ts
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

type Res = {
  status: number;
  location: string | undefined;
  cacheControl: string | undefined;
  contentType: string | undefined;
  body: string;
};

function get(port: number, urlPath: string): Promise<Res> {
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
            cacheControl: res.headers["cache-control"] as string | undefined,
            contentType: res.headers["content-type"] as string | undefined,
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

const JUNK_PARAM_RE = /[?&](?:utm_[^=&]*|gclid|fbclid|nsl_bypass_cache|srsltid)=/;

async function expectSingleHop(source: string, expectedLocation: string) {
  const first = await get(serverPort, source);
  expect(first.status).toBe(301);
  expect(first.location).toBe(expectedLocation);
  expect(first.location).not.toContain(":443");
  expect(first.location).not.toMatch(JUNK_PARAM_RE);
  expect(first.cacheControl).toBe("public, max-age=31536000, immutable");
  // One hop only: the target must not redirect again.
  const second = await get(serverPort, first.location as string);
  expect([301, 302, 307, 308]).not.toContain(second.status);
}

describe("serve.mjs — legacy blog hub paths → /en/blog", () => {
  it.each([
    "/lebanon/blog/category/flower-gifting-websites/",
    "/lebanon/blog/category/lebanon-stories/",
    "/lebanon/blog/",
    "/lebanon/blogs/",
    "/lebanon/blog",
    "/lebanon/blogs",
    "/lebanon/blog/page/2/",
  ])("301s %s to /en/blog in one hop", async (source) => {
    await expectSingleHop(source, "/en/blog");
  });

  it.each(["/cyprus/blog/", "/uae/blogs/", "/dubai/blog/category/x/", "/abudhabi/blog"])(
    "applies to the other existing legacy country prefixes: %s",
    async (source) => {
      await expectSingleHop(source, "/en/blog");
    },
  );
});

describe("serve.mjs — legacy blog post paths", () => {
  it("301s a real post slug to /en/blog/:slug in one hop", async () => {
    expect(REAL_SLUG).toBeTruthy();
    await expectSingleHop(`/lebanon/blog/${REAL_SLUG}/`, `/en/blog/${REAL_SLUG}`);
    await expectSingleHop(`/lebanon/blog/${REAL_SLUG}`, `/en/blog/${REAL_SLUG}`);
  });

  it("falls back to /en/blog for an unknown slug", async () => {
    await expectSingleHop("/lebanon/blog/this-post-does-not-exist/", "/en/blog");
  });
});

describe("serve.mjs — legacy blog redirects drop junk query params", () => {
  it.each([
    ["/lebanon/blog/?nsl_bypass_cache=1", "/en/blog"],
    ["/lebanon/blogs/?utm_source=google&gclid=abc", "/en/blog"],
    [`/lebanon/blog/${REAL_SLUG}/?nsl_bypass_cache=1&fbclid=x`, `/en/blog/${REAL_SLUG}`],
  ])("%s → %s", async (source, expected) => {
    await expectSingleHop(source, expected);
  });
});

// ---------------------------------------------------------------------------
// Regression guard: neighbouring legacy behaviour is unchanged.
// ---------------------------------------------------------------------------

describe("serve.mjs — non-blog legacy redirects are unchanged", () => {
  it.each([
    ["/lebanon", "/en-lb/beirut"],
    ["/lebanon/", "/en-lb/beirut"],
    ["/lebanon/about-us/", "/en-lb/beirut"],
    ["/lebanon/bloggers/", "/en-lb/beirut"],
    ["/lebanon/blog-post/", "/en-lb/beirut"],
    ["/lebanon/product/rose-box/", "/en-lb/beirut/product/rose-box"],
    ["/lebanon/product-category/flowers/", "/en-lb/beirut/category/hand-bouquets"],
    ["/lebanon/product-category/tulips/", "/en-lb/beirut/shop"],
    ["/lebanon/product-tag/love/", "/en-lb/beirut/occasion/love-romance"],
    ["/lebanon/fathers-day-lebanon/", "/en-lb/beirut/occasion/fathers-day"],
    ["/cyprus/", "/en-cy/nicosia"],
    ["/uae/", "/en-ae/dubai"],
    ["/abudhabi/", "/en-ae/abu-dhabi"],
    ["/product-category/flowers/", "/en-lb/beirut/category/hand-bouquets"],
    ["/product-tag/love/", "/en-lb/beirut/occasion/love-romance"],
    ["/shop/page/3/", "/en-lb/beirut/shop"],
    ["/offer/", "/en-lb/beirut/shop"],
  ])("%s → %s", async (source, expected) => {
    const res = await get(serverPort, source);
    expect(res.status).toBe(301);
    expect(res.location).toBe(expected);
    expect(res.cacheControl).toBe("public, max-age=31536000, immutable");
    expect(res.body).toBe("");
  });
});

describe("serve.mjs — 410 Gone paths are unchanged", () => {
  it.each([
    "/wp-admin/",
    "/wp-json/",
    "/wp-content/uploads/a.jpg",
    "/wp-includes/js/x.js",
    "/wp-login.php",
    "/author/admin/",
  ])("%s → 410 Gone", async (source) => {
    const res = await get(serverPort, source);
    expect(res.status).toBe(410);
    expect(res.location).toBeUndefined();
    expect(res.contentType).toBe("text/plain; charset=utf-8");
    expect(res.cacheControl).toBe("public, max-age=31536000, immutable");
    expect(res.body).toBe("Gone");
  });
});
