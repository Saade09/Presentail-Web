/**
 * Tests for the /llms-full.txt response served by serve.mjs and the pure
 * builder functions in llms.mjs.
 *
 * Three concerns are verified:
 *
 *   1. Cache-Control — the header value is "public, max-age=3600,
 *      must-revalidate" (1-hour short-lived TTL). llms-full.txt is served with
 *      a stale-while-revalidate live-catalog pattern, so it must never use an
 *      immutable or long-lived cache directive. A regression accidentally
 *      flipping this (e.g. to `immutable` or a year-long max-age) would let AI
 *      crawlers cache a stale catalog indefinitely.
 *
 *   2. Markdown structure — the body contains the expected section headings
 *      (`# Presentail`, `## Pages`, `## Brands`, `## Occasions`). These are
 *      tested via the pure `buildLlmsFullTxt` builder (no server spawn needed)
 *      with mock catalog data, so a structural regression in the Markdown
 *      template is caught without relying on a live catalog.
 *
 *   3. Cold-cache / index-fallback robustness — when the catalog API is
 *      unreachable the route must still return a non-blank 200 response (the
 *      static index-only fallback). This is verified by spawning serve.mjs with
 *      an unreachable INTERNAL_API_BASE_URL and asserting a non-empty body.
 *
 * Integration tests (sections 1 & 3) spawn serve.mjs as a real child process
 * (same pattern as serve-llms-txt.test.ts) so they exercise the actual handler,
 * not a hand-rolled mock.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pure builders imported directly for heading-structure tests (no server spawn).
// @ts-ignore — llms.mjs is an ES module outside the TS source tree
import { buildLlmsFullTxt, resolveLlmsFullTxt, LLMS_FULL_TXT_RETRY_WINDOW_MS } from "../../llms.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

// ---------------------------------------------------------------------------
// Helpers (mirrors serve-llms-txt.test.ts)
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
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Shared server instance — spawned with an unreachable catalog API so the
// route exercises the cold-cache index-fallback path.
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
      // Point to a port that is guaranteed to refuse connections so every
      // catalog fetch inside generateLlmsFullTxt fails and resolveLlmsFullTxt
      // falls back to the static generateIndex() output.
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
// 1. Cache-Control header
// ---------------------------------------------------------------------------

describe("serve.mjs — /llms-full.txt cache-control header", () => {
  it('serves /llms-full.txt with "public, max-age=3600, must-revalidate"', async () => {
    const { status, headers } = await get(serverPort, "/llms-full.txt");
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("public, max-age=3600, must-revalidate");
  });

  it("does NOT serve /llms-full.txt with an immutable cache directive", async () => {
    const { headers } = await get(serverPort, "/llms-full.txt");
    const cc = headers["cache-control"] ?? "";
    expect(cc).not.toContain("immutable");
  });

  it("does NOT serve /llms-full.txt with a year-long max-age", async () => {
    const { headers } = await get(serverPort, "/llms-full.txt");
    const cc = headers["cache-control"] ?? "";
    // 31536000 = 1 year; any value at this scale would lock out AI crawlers.
    expect(cc).not.toMatch(/max-age=3153600/);
    expect(cc).not.toMatch(/max-age=31536000/);
  });
});

// ---------------------------------------------------------------------------
// 2. Markdown structure — pure builder unit tests
//    (no server spawn; exercises buildLlmsFullTxt with mock catalog data)
// ---------------------------------------------------------------------------

describe("buildLlmsFullTxt — Markdown heading structure", () => {
  const MOCK_BRANDS = [
    { name: "Wild At Heart" },
    { name: "Flo & Frankie" },
  ];
  const MOCK_OCCASIONS = [
    { name: "Birthday", slug: "birthday" },
    { name: "Anniversary", slug: "anniversary" },
  ];
  const MOCK_PRODUCTS = [
    { name: "Rose Bouquet", popularity: 10, brandNames: ["Wild At Heart"], priceValue: 45, occasions: ["birthday"] },
  ];

  let body: string;
  beforeAll(() => {
    body = buildLlmsFullTxt({
      origin: "https://presentail.com",
      basePath: "/",
      brands: MOCK_BRANDS,
      occasions: MOCK_OCCASIONS,
      products: MOCK_PRODUCTS,
    });
  });

  it('contains the top-level "# Presentail" heading', () => {
    expect(body).toContain("# Presentail");
  });

  it('contains the "## Pages" section heading', () => {
    expect(body).toContain("## Pages");
  });

  it('contains the "## Brands" section heading', () => {
    expect(body).toContain("## Brands");
  });

  it('contains the "## Occasions" section heading', () => {
    expect(body).toContain("## Occasions");
  });

  it("lists the mock brand names in the Brands section", () => {
    expect(body).toContain("Wild At Heart");
    expect(body).toContain("Flo & Frankie");
  });

  it("lists the mock occasion names in the Occasions section", () => {
    expect(body).toContain("Birthday");
    expect(body).toContain("Anniversary");
  });

  it("does not serve a blank body", () => {
    expect(body.trim().length).toBeGreaterThan(0);
  });
});

describe("buildLlmsFullTxt — empty catalog (placeholder text)", () => {
  it('renders "## Brands" section even when brands array is empty', () => {
    const body = buildLlmsFullTxt({ origin: "https://presentail.com", basePath: "/" });
    expect(body).toContain("## Brands");
  });

  it('renders "## Occasions" section even when occasions array is empty', () => {
    const body = buildLlmsFullTxt({ origin: "https://presentail.com", basePath: "/" });
    expect(body).toContain("## Occasions");
  });
});

// ---------------------------------------------------------------------------
// 3. Cold-cache / index-fallback — integration test
//    (server spawned with unreachable catalog API above)
// ---------------------------------------------------------------------------

describe("serve.mjs — /llms-full.txt index-fallback when catalog is unreachable", () => {
  it("returns HTTP 200 even when the catalog API is unreachable", async () => {
    const { status } = await get(serverPort, "/llms-full.txt");
    expect(status).toBe(200);
  });

  it("does not serve a blank body in index-fallback mode", async () => {
    const { body } = await get(serverPort, "/llms-full.txt");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it('still contains the top-level "# Presentail" heading in index-fallback mode', async () => {
    const { body } = await get(serverPort, "/llms-full.txt");
    expect(body).toContain("# Presentail");
  });

  it('still contains the "## Pages" section in index-fallback mode', async () => {
    const { body } = await get(serverPort, "/llms-full.txt");
    expect(body).toContain("## Pages");
  });
});

// ---------------------------------------------------------------------------
// 4. resolveLlmsFullTxt unit tests — stale-while-revalidate policy
// ---------------------------------------------------------------------------

describe("resolveLlmsFullTxt — cache policy", () => {
  it('returns mode="fresh" and reuses cached value when within TTL', async () => {
    const nowMs = Date.now();
    const cache = { value: "cached content", tsMs: nowMs - 100 };
    const result = await resolveLlmsFullTxt({
      cache,
      nowMs,
      ttlMs: 3_600_000,
      generateFull: async () => { throw new Error("should not be called"); },
      generateIndex: () => { throw new Error("should not be called"); },
    });
    expect(result.mode).toBe("fresh");
    expect(result.value).toBe("cached content");
  });

  it('returns mode="regenerated" when cache is stale and generateFull succeeds', async () => {
    const nowMs = Date.now();
    const staleTs = nowMs - 4_000_000;
    const cache = { value: "old content", tsMs: staleTs };
    const result = await resolveLlmsFullTxt({
      cache,
      nowMs,
      ttlMs: 3_600_000,
      generateFull: async () => "new content",
      generateIndex: () => "fallback",
    });
    expect(result.mode).toBe("regenerated");
    expect(result.value).toBe("new content");
    expect(result.tsMs).toBe(nowMs);
  });

  it('returns mode="stale" and retains prior value when generateFull fails with warm cache', async () => {
    const nowMs = Date.now();
    const staleTs = nowMs - 4_000_000;
    const cache = { value: "stale content", tsMs: staleTs };
    const errors: unknown[] = [];
    const result = await resolveLlmsFullTxt({
      cache,
      nowMs,
      ttlMs: 3_600_000,
      generateFull: async () => { throw new Error("catalog down"); },
      generateIndex: () => "index fallback",
      onError: (err: unknown) => errors.push(err),
    });
    expect(result.mode).toBe("stale");
    expect(result.value).toBe("stale content");
    expect(errors).toHaveLength(1);
    // Timestamp is rewound to retry after LLMS_FULL_TXT_RETRY_WINDOW_MS.
    expect(result.tsMs).toBe(nowMs - 3_600_000 + LLMS_FULL_TXT_RETRY_WINDOW_MS);
  });

  it('returns mode="index-fallback" and serves generateIndex() when cold cache and generateFull fails', async () => {
    const nowMs = Date.now();
    const cache = { value: null, tsMs: 0 };
    const result = await resolveLlmsFullTxt({
      cache,
      nowMs,
      ttlMs: 3_600_000,
      generateFull: async () => { throw new Error("catalog unreachable"); },
      generateIndex: () => "# Presentail\n\n## Pages\n",
    });
    expect(result.mode).toBe("index-fallback");
    expect(result.value).toBe("# Presentail\n\n## Pages\n");
    // Body must not be blank.
    expect(result.value.trim().length).toBeGreaterThan(0);
  });
});
